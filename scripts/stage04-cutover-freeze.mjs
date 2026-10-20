// Local synthetic protocol. Never opens credentials, an existing backup, or a
// remote endpoint. Imported exports require an explicitly supplied SQL adapter.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const image = 'public.ecr.aws/supabase/postgres:17.11.0.004@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108';
const sha = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const identifier = value => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw Error('unreviewed_identifier');
  return `"${value}"`;
};

// The four accepted managed metadata/vector relations are observed for drift,
// never falsely reported as locked. All other runtime tables and FK targets
// must be in the admitted inventory and lockable by the actual SQL actor.
export const runtimeInventorySql = `WITH wanted AS (
 SELECT c.oid,n.nspname AS schema,c.relname AS name,
 (has_table_privilege(current_user,c.oid,'MAINTAIN') OR has_table_privilege(current_user,c.oid,'UPDATE') OR
 has_table_privilege(current_user,c.oid,'DELETE') OR has_table_privilege(current_user,c.oid,'TRUNCATE')) AS can_lock
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','private','auth','storage','realtime','vault')
 AND NOT(n.nspname='auth' AND c.relname='schema_migrations')
 AND NOT(n.nspname='storage' AND c.relname IN ('migrations','buckets_vectors','vector_indexes'))
) SELECT json_build_object('tables',coalesce((SELECT json_agg(json_build_object('schema',schema,'name',name,'can_lock',can_lock) ORDER BY schema,name) FROM wanted),'[]'::json),
 'uncovered_foreign_key_dependencies',(SELECT count(*) FROM pg_constraint f WHERE f.contype='f' AND f.conrelid IN (SELECT oid FROM wanted) AND f.confrelid NOT IN (SELECT oid FROM wanted)));`;

const tableNames = tables => [...new Set(tables.map(t => `${identifier(t.schema)}.${identifier(t.name)}`))].sort();

// Split only at top-level semicolons, preserving every original UTF8 byte.
// Dollar-quoted function bodies and nested SQL comments are opaque here.
export function composeExpand(bytes) {
  if (!Buffer.isBuffer(bytes)) throw Error('expand_buffer_required');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const statements = []; let start = 0, words = [], word = '', quote = '', dollar = '', block = 0, line = false;
  const flush = () => { if (word) { words.push(word.toLowerCase()); word = ''; } };
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '/' && n === '*') { block++; i++; } else if (c === '*' && n === '/') { block--; i++; } continue; }
    if (dollar) { if (text.startsWith(dollar, i)) { i += dollar.length - 1; dollar = ''; } continue; }
    if (quote) { if (c === quote) { if (n === quote) i++; else quote = ''; } continue; }
    if (c === '-' && n === '-') { flush(); line = true; i++; continue; }
    if (c === '/' && n === '*') { flush(); block = 1; i++; continue; }
    if (c === "'" || c === '"') { flush(); quote = c; continue; }
    if (c === '$') { const m = text.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/); if (m) { flush(); dollar = m[0]; i += dollar.length - 1; continue; } }
    if (/[a-zA-Z_]/.test(c)) word += c;
    else { flush(); if (c === ';') { statements.push({ start, end: i + 1, words }); start = i + 1; words = []; } }
  }
  flush();
  if (quote || dollar || block || words.length || statements.length < 2 ||
      statements[0].words.join(' ') !== 'begin' || statements.at(-1).words.join(' ') !== 'commit' ||
      statements.slice(1, -1).some(s => ['begin', 'start', 'commit', 'rollback', 'end', 'prepare'].includes(s.words[0]))) {
    throw Error('reviewed_single_expand_transaction_required');
  }
  const at = Buffer.byteLength(text.slice(0, statements[0].end), 'utf8');
  const beginBytes = Buffer.from(bytes.subarray(0, at)), continuationBytes = Buffer.from(bytes.subarray(at));
  if (!Buffer.concat([beginBytes, continuationBytes]).equals(bytes)) throw Error('expand_bytes_changed');
  return { beginBytes, continuationBytes, originalSha256: sha(bytes), originalBytes: Buffer.from(bytes) };
}

export class FreezeProtocol {
  constructor({ session, expandBytes, tables, observe, verifyExpandedCatalog, attestations, lockTimeoutMs = 2000 }) {
    for (const key of ['authAdmissionControlsVerified', 'controlledCutoverResidualRiskAccepted', 'privilegedWritersStopped', 'exclusiveSqlDdlSequenceOperator', 'managedMetadataDriftAbortAccepted']) {
      if (attestations?.[key] !== true) throw Error(`attestation_required_${key}`);
    }
    this.controlledCutoverResidualRiskAccepted=true;
    if (!session || typeof observe !== 'function' || typeof verifyExpandedCatalog !== 'function' || !tables?.length) throw Error('freeze_contract_incomplete');
    if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs < 100 || lockTimeoutMs > 30000) throw Error('bounded_lock_timeout_required');
    this.session = session; this.plan = composeExpand(expandBytes); this.tables = tables;
    this.observe = async () => {
      // Adapter must use a SEPARATE fresh connection. In particular an
      // observer file containing ROLLBACK must never run on the lock holder.
      const value = await observe();
      if (!value || ['schemaFingerprint', 'sequenceFingerprint', 'managedFingerprint'].some(k => !/^[0-9a-f]{64}$/.test(value[k] ?? '')) ||
          typeof value.unknownPrivilegedWriter !== 'boolean') throw Error('fresh_observer_contract_invalid');
      return value;
    };
    this.verifyExpandedCatalog = verifyExpandedCatalog; this.lockTimeoutMs = lockTimeoutMs;
    this.state = 'prepared'; this.committed = false;
    this.abortController = new AbortController();
  }
  get signal() { return this.abortController.signal; }
  async verifyInventory() {
    const current = JSON.parse(await this.session.query(runtimeInventorySql));
    if (current.uncovered_foreign_key_dependencies !== 0 || current.tables.some(t => t.can_lock !== true) ||
        JSON.stringify(tableNames(current.tables)) !== JSON.stringify(tableNames(this.tables))) throw Error('runtime_inventory_or_dependencies_changed');
  }
  async verifyHeldLocks() {
    const locks = JSON.parse(await this.session.query(`SELECT json_build_object('pid',pg_backend_pid(),'tables',coalesce((
      SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname)) FROM pg_locks l
      JOIN pg_class c ON c.oid=l.relation JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE l.pid=pg_backend_pid() AND l.granted AND l.mode IN ('ShareLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')
      AND c.relkind IN ('r','p')),'[]'::json));`));
    if (locks.pid !== this.holderPid || tableNames(this.tables).some(name => !tableNames(locks.tables).includes(name))) throw Error('freeze_holder_or_locks_lost');
  }
  async begin() {
    if (this.state !== 'prepared') throw Error('invalid_freeze_state');
    this.state = 'acquiring';
    try {
      await this.verifyInventory();
      const names = tableNames(this.tables);
      // The transaction begins with the ORIGINAL migration BEGIN, not a wrapper
      // BEGIN. Its body/COMMIT are held until the verified checkpoint is ready.
      await this.session.query(Buffer.concat([this.plan.beginBytes, Buffer.from(`\nSET LOCAL lock_timeout='${this.lockTimeoutMs}ms'; SET LOCAL statement_timeout='30s';\nLOCK TABLE ${names.join(',')} IN SHARE MODE;\n`)]));
      this.holderPid = Number((await this.session.query('SELECT pg_backend_pid();')).trim());
      await this.verifyHeldLocks();
      await this.verifyInventory();
      this.baseline = await this.observe();
      if (this.baseline.unknownPrivilegedWriter) throw Error('unknown_privileged_writer');
      this.snapshot = (await this.session.query('SELECT pg_export_snapshot();')).trim();
      if (!/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(this.snapshot)) throw Error('snapshot_contract_invalid');
      this.state = 'frozen';
      return { snapshot: this.snapshot, holderPid: this.holderPid, expandSha256: this.plan.originalSha256,
        ddlAndDirectSequenceWritesBlockedByLocks: false, exclusiveOperatorRequired: true,
        ControlledCutoverResidualRiskAccepted: true, RpoZeroVerified: false };
    } catch (error) { await this.abort(); throw error; }
  }
  async checkpoint() {
    if (this.state !== 'frozen' || !this.session.alive()) { await this.abort(); throw Error('freeze_session_lost'); }
    try {
      await this.verifyHeldLocks();
      const now = await this.observe();
      if (now.unknownPrivilegedWriter || ['schemaFingerprint', 'sequenceFingerprint', 'managedFingerprint'].some(k => now[k] !== this.baseline[k])) {
        throw Error('freeze_drift_or_unknown_writer');
      }
      return true;
    } catch (error) { await this.abort(); throw error; }
  }
  async continueExpand({ checkpointVerified } = {}) {
    if (checkpointVerified !== true) throw Error('verified_checkpoint_required');
    await this.checkpoint();
    if (sha(Buffer.concat([this.plan.beginBytes, this.plan.continuationBytes])) !== this.plan.originalSha256) {
      await this.abort(); throw Error('expand_bytes_changed');
    }
    this.state = 'expanding';
    let acknowledged = false;
    try {
      await this.session.query(this.plan.continuationBytes);
      acknowledged = true;
      this.committed = true; this.state = 'expanded_closed';
      const after = await this.observe();
      if (after.unknownPrivilegedWriter || after.sequenceFingerprint !== this.baseline.sequenceFingerprint ||
          after.managedFingerprint !== this.baseline.managedFingerprint || !await this.verifyExpandedCatalog(after)) {
        this.state = 'expanded_drift_incident';
        this.abortController.abort(Error('postcommit_drift_keep_closed'));
        throw Error('postcommit_drift_keep_closed');
      }
      return { expandCommitted: true, originalBytesSha256: this.plan.originalSha256, fullWriterFreezeClaimed: false,
        ControlledCutoverResidualRiskAccepted: true, RpoZeroVerified: false };
    } catch (error) {
      if (!acknowledged) {
        // COMMIT may have reached PostgreSQL even though its acknowledgement
        // was lost. Never label this rollback, retry, or proceed to bootstrap.
        this.committed = null; this.state = 'expand_outcome_unknown';
        if (!this.signal.aborted) this.abortController.abort(Error('expand_reconciliation_required'));
        await this.session.close();
        throw Error('expand_outcome_unknown_reconciliation_required');
      }
      if (this.state !== 'expanded_drift_incident') this.state = 'expanded_reconciliation_required';
      if (!this.signal.aborted) this.abortController.abort(Error('expanded_reconciliation_required'));
      throw error;
    }
  }
  async abort() {
    if (this.committed !== false) return;
    this.state = 'aborted';
    if (!this.signal.aborted) this.abortController.abort(Error('freeze_aborted'));
    await this.session.close();
    // Lost pre-expand transaction rolls back. It does NOT install durable
    // maintenance: caller must keep Auth ingress/operators closed and abort all
    // backup/cutover work. Never auto-retry or continue in another session.
  }
}

function docker(args, input, optional = false) {
  const r = spawnSync('docker', ['--host', endpoint, ...args], { input, encoding: 'utf8', timeout: 90000,
    maxBuffer: 4 * 1024 * 1024, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  if (!optional && (r.error || r.status !== 0)) throw Error('synthetic_docker_operation_failed');
  return r;
}

function dockerBinary(args, input) {
  // Binary dump exists only in this host RAM buffer and the pipe. No archive
  // file, Docker log, environment variable or command argument contains it.
  const r = spawnSync('docker', ['--host', endpoint, ...args], { input, encoding: null, timeout: 90000,
    maxBuffer: 64 * 1024 * 1024, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  r.stderr?.fill(0);
  if (r.error || r.status !== 0) { r.stdout?.fill(0); throw Error('synthetic_binary_operation_failed'); }
  return r.stdout;
}

class PsqlSession {
  constructor(db, role, label) {
    this.pending = null; this.output = ''; this.stderr = ''; this.dead = false;
    this.process = spawn('docker', ['--host', endpoint, 'exec', '-i', '--user', 'postgres', db, 'psql', '-XqAt',
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-h', '/var/run/postgresql', '-U', role, '-d', 'postgres'],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.process.stdout.on('data', chunk => {
      this.output += chunk.toString();
      if (this.pending && this.output.includes(this.pending.marker)) {
        const p = this.pending; this.pending = null; clearTimeout(p.timer);
        const at = this.output.indexOf(p.marker); const text = this.output.slice(0, at); this.output = this.output.slice(at + p.marker.length);
        p.resolve(text.trim());
      }
    });
    this.process.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk.toString()).slice(-65536); });
    const stopped = () => {
      this.dead = true;
      if (this.pending) { const p = this.pending; this.pending = null; clearTimeout(p.timer); p.reject(Error(`sql_session_stopped_${this.stderr.match(/(?:ERROR|FATAL|PANIC):\s+([0-9A-Z]{5})(?:\s|$)/m)?.[1] ?? 'unknown'}`)); }
    };
    this.process.on('exit', stopped); this.process.on('error', stopped);
    this.label = label;
  }
  alive() { return !this.dead && this.process.exitCode === null; }
  async initialize() { await this.query(`SET application_name='${this.label}';`); this.pid = Number(await this.query('SELECT pg_backend_pid();')); return this; }
  query(sql, timeoutMs = 35000) {
    if (!this.alive() || this.pending) return Promise.reject(Error('sql_session_unavailable'));
    return new Promise((resolve, reject) => {
      const marker = `stage04_${randomBytes(16).toString('hex')}`;
      const timer = setTimeout(() => { this.pending = null; this.process.stdin.destroy(); this.process.kill(); this.dead = true; reject(Error('sql_session_timeout')); }, timeoutMs);
      this.pending = { marker, timer, resolve, reject };
      this.process.stdin.write(Buffer.concat([Buffer.isBuffer(sql) ? sql : Buffer.from(sql), Buffer.from(`\n\\echo ${marker}\n`)]));
    });
  }
  async close() {
    if (this.alive() && !this.pending) { try { await this.query('ROLLBACK;', 2000); } catch {} }
    this.process.stdin.end();
    if (!this.dead) await Promise.race([new Promise(resolve => this.process.once('exit', resolve)), sleep(1000)]);
    if (!this.dead) this.process.kill();
    this.dead = true;
  }
}

export async function syntheticDrill({ snapshotOnly = false } = {}) {
  if (process.platform !== 'win32' || process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw Error('fixed_local_windows_context_required');
  const context = JSON.parse(docker(['context', 'inspect']).stdout);
  if (context.length !== 1 || context[0].Endpoints?.docker?.Host !== endpoint) throw Error('local_context_required');
  const db = `stage04-freeze-synthetic-${randomBytes(12).toString('hex')}`;
  const sessions = [], checks = []; let cleanup = false;
  const check = (condition, label) => { if (!condition) throw Error(`synthetic_check_failed_${label}`); checks.push(label); };
  const connect = async (role = 'postgres', label = 'stage04_control') => { const s = new PsqlSession(db, role, label); sessions.push(s); return s.initialize(); };
  const shell = 'set -eu; initdb -D /var/lib/postgresql/data --username=fixture_bootstrap --auth-local=trust --auth-host=reject --no-locale >/dev/null 2>&1; exec postgres -D /var/lib/postgresql/data -c shared_preload_libraries= -c listen_addresses= -c unix_socket_directories=/var/run/postgresql -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_min_messages=panic';
  try {
    docker(['run', '--detach', '--pull', 'never', '--name', db, '--network', 'none', '--log-driver', 'none', '--read-only', '--user', 'postgres',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '768m', '--memory-swap', '768m', '--pids-limit', '128',
      '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,nodev,uid=100,gid=101,mode=0700',
      '--tmpfs', '/var/run/postgresql:rw,noexec,nosuid,nodev,uid=100,gid=101,mode=0755', '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,mode=1777',
      '--entrypoint', 'sh', image, '-c', shell]);
    let ready = false;
    for (let i = 0; i < 60; i++) { if (docker(['exec', db, 'pg_isready', '-h', '/var/run/postgresql', '-U', 'fixture_bootstrap', '-d', 'postgres'], undefined, true).status === 0) { ready = true; break; } await sleep(250); }
    check(ready, 'postgres_ready');
    const isolation = JSON.parse(docker(['inspect', '--format', '{{json .}}', db]).stdout);
    check(isolation.HostConfig.NetworkMode === 'none' && isolation.HostConfig.LogConfig.Type === 'none' && isolation.HostConfig.ReadonlyRootfs &&
      !(isolation.HostConfig.Binds ?? []).length && !Object.keys(isolation.HostConfig.PortBindings ?? {}).length &&
      isolation.HostConfig.Memory === isolation.HostConfig.MemorySwap, 'local_isolation');
    const admin = await connect('fixture_bootstrap');
    await admin.query(`CREATE ROLE postgres LOGIN NOSUPERUSER CREATEDB CREATEROLE; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE supabase_auth_admin LOGIN NOSUPERUSER; ALTER DATABASE postgres OWNER TO postgres; CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
      SET ROLE supabase_auth_admin; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE auth.refresh_tokens(id bigserial PRIMARY KEY,token text);
      CREATE TABLE auth.schema_migrations(version text PRIMARY KEY); INSERT INTO auth.schema_migrations VALUES('synthetic_v1');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT null::uuid $$;
      GRANT ALL ON auth.users,auth.refresh_tokens TO postgres; GRANT SELECT ON auth.schema_migrations TO postgres;
      GRANT USAGE ON SCHEMA auth TO postgres,authenticated,service_role;
      GRANT SELECT,UPDATE ON SEQUENCE auth.refresh_tokens_id_seq TO postgres; RESET ROLE; SET ROLE postgres;`);
    await admin.query(readFileSync(new URL('../supabase/tests/00_legacy_schema.sql', import.meta.url)));
    await admin.query('RESET ROLE;');
    const observer = await connect();
    const observe = async () => {
      const schema = await observer.query("SELECT coalesce(string_agg(n.nspname||'.'||c.relname||':'||c.relkind::text,',' ORDER BY n.nspname,c.relname),'') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','S','i') AND n.nspname IN ('public','auth','private');");
      const sequence = await observer.query('SELECT last_value::text||\':\'||is_called::text FROM auth.refresh_tokens_id_seq;');
      const managed = await admin.query('SELECT version FROM auth.schema_migrations ORDER BY version;');
      return { schemaFingerprint: sha(schema), sequenceFingerprint: sha(sequence), managedFingerprint: sha(managed), unknownPrivilegedWriter: false, schema };
    };
    const expandBytes = readFileSync(new URL('../supabase/migrations/20261016010000_auth_profiles_expand.sql', import.meta.url));
    const plan = composeExpand(expandBytes);
    check(Buffer.concat([plan.beginBytes, plan.continuationBytes]).equals(expandBytes), 'original_expand_bytes_preserved');
    const attestations = { authAdmissionControlsVerified: true, controlledCutoverResidualRiskAccepted: true, privilegedWritersStopped: true, exclusiveSqlDdlSequenceOperator: true, managedMetadataDriftAbortAccepted: true };
    const make = async (timeout = 2000) => new FreezeProtocol({ session: await connect(), expandBytes, tables: JSON.parse(await observer.query(runtimeInventorySql)).tables, observe, lockTimeoutMs: timeout, attestations,
      verifyExpandedCatalog: after => after.schema.includes('private.auth_admin_audit:r') && !after.schema.includes('unexpected_') });
    const writer = await connect(); await writer.query("BEGIN;INSERT INTO public.rutinas(titulo) VALUES('synthetic_prior');");
    const protocol = await make(); let acquired = false; const acquisition = protocol.begin().then(value => { acquired = true; return value; });
    await sleep(150); check(!acquired, 'prior_writer_drained_before_freeze'); await writer.query('COMMIT;');
    const frozen = await acquisition;
    const snapshotReader = await connect();
    const count = await snapshotReader.query(`BEGIN ISOLATION LEVEL REPEATABLE READ;SET TRANSACTION SNAPSHOT '${frozen.snapshot}';SELECT count(*) FROM public.rutinas;COMMIT;`);
    check(count === '1', 'exported_snapshot_sees_drained_commit');
    if (!snapshotOnly) {
    const beforeSequence = (await observe()).sequenceFingerprint;
    const authWriter = await connect('supabase_auth_admin');
    const authAttempt = authWriter.query("SET lock_timeout='300ms';INSERT INTO auth.refresh_tokens(token) VALUES('synthetic_blocked');").then(() => false, () => true);
    await sleep(100); check((await observe()).sequenceFingerprint === beforeSequence, 'auth_insert_waits_before_nextval');
    check(await authAttempt, 'auth_privileged_dml_blocked');
    const privileged = await connect();
    check(await privileged.query("SET lock_timeout='200ms';INSERT INTO public.rutinas(titulo)VALUES('synthetic_denied');").then(() => false, () => true), 'postgres_dml_blocked');
    const ddlExisting = await connect();
    check(await ddlExisting.query("SET lock_timeout='200ms';ALTER TABLE public.rutinas ADD COLUMN unexpected_alter integer;").then(() => false, () => true), 'existing_table_ddl_blocked');
    }
    const anonymous = await connect('fixture_bootstrap'); await anonymous.query("SET ROLE anon; SET lock_timeout='10s';");
    const queued = anonymous.query("INSERT INTO public.rutinas(titulo)VALUES('synthetic_queued_anon');").then(() => 'admitted', error => error.message);
    await sleep(100);
    let archive = null;
    try {
      // This is a DIFFERENT connection from the persistent exporter. pg_dump
      // imports its snapshot; target fixture is another disposable database in
      // the same isolated server, with no production credentials or resources.
      archive = dockerBinary(['exec', '--user', 'postgres', db, 'pg_dump', '-Fc', '--no-password',
        '--host', '/var/run/postgresql', '--username', 'postgres', '--dbname', 'postgres', `--snapshot=${frozen.snapshot}`]);
      check(archive.length > 5 && archive.subarray(0, 5).toString('ascii') === 'PGDMP', 'pg_dump_imports_exported_snapshot_to_ram');
      const listing = dockerBinary(['exec', '-i', '--user', 'postgres', db, 'pg_restore', '--list', '--create'], archive);
      try { check(listing.includes(Buffer.from('TABLE DATA public rutinas postgres')), 'snapshot_custom_archive_toc_valid'); }
      finally { listing.fill(0); }
      await protocol.checkpoint();
      await admin.query('CREATE DATABASE snapshot_clone OWNER postgres TEMPLATE template0;');
      const restoreOutput = dockerBinary(['exec', '-i', '--user', 'postgres', db, 'pg_restore', '--no-password',
        '--host', '/var/run/postgresql', '--username', 'fixture_bootstrap', '--dbname', 'snapshot_clone',
        '--exit-on-error', '--single-transaction'], archive);
      restoreOutput.fill(0);
      const comparison = JSON.parse(docker(['exec', '-i', '--user', 'postgres', db, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1',
        '--host', '/var/run/postgresql', '--username', 'fixture_bootstrap', '--dbname', 'snapshot_clone'],
      "SELECT json_build_object('drained',(SELECT count(*) FROM public.rutinas WHERE titulo='synthetic_prior'),'waiting',(SELECT count(*) FROM public.rutinas WHERE titulo='synthetic_queued_anon'),'total',(SELECT count(*) FROM public.rutinas),'auth_rows',(SELECT count(*) FROM auth.refresh_tokens));").stdout.trim());
      check(comparison.drained === 1 && comparison.total === 1, 'snapshot_restored_drained_writer_included');
      check(comparison.waiting === 0 && comparison.auth_rows === 0, 'snapshot_restored_waiting_writer_excluded');
      await protocol.checkpoint();
      check(protocol.state === 'frozen' && protocol.session.alive(), 'snapshot_exporter_alive_and_locked_through_restore');
    } finally { archive?.fill(0); }
    if (snapshotOnly) {
      // End only the synthetic queued client before releasing the exporter.
      // This does not suggest durable maintenance after a pre-expand rollback.
      await admin.query(`SELECT pg_terminate_backend(${anonymous.pid});`);
      await queued;
      await protocol.abort();
      return { checks, count: checks.length, mode: 'synthetic_exported_snapshot_capture_only', sourceSnapshotUsed: true,
        binaryArchiveStorage: 'host_memory_buffer_no_plaintext_file', hostPagingExcluded: false,
        syntheticArchiveRestored: true, exporterAliveDuringCaptureAndRestore: true,
        cryptographyRepeated: false, existingBackupsRead: false, remoteOperations: false,
        sourceReadinessVerified: false, AuthHttpDuringFreezeTested: false, fullWriterFreezeClaimed: false };
    }
    await protocol.continueExpand({ checkpointVerified: true });
    check((await queued).includes('42501'), 'queued_anon_rechecks_acl_after_expand_commit');
    check(Number(await observer.query('SELECT count(*) FROM public.rutinas;')) === 1, 'no_queued_writer_mutation');
    check(protocol.state === 'expanded_closed', 'same_transaction_expand_fail_closed');
    // New negative scenarios reuse fixture state only; no approved suites run.
    const sequenceBypass = await make(); await sequenceBypass.begin();
    await observer.query("SELECT nextval('auth.refresh_tokens_id_seq');");
    check(await sequenceBypass.checkpoint().then(() => false, () => true) && sequenceBypass.signal.aborted, 'direct_nextval_bypass_detected_abort');
    const setvalBypass = await make(); await setvalBypass.begin(); await observer.query("SELECT setval('auth.refresh_tokens_id_seq',42,true);");
    check(await setvalBypass.checkpoint().then(() => false, () => true), 'direct_setval_bypass_detected_abort');
    const ddlBypass = await make(); await ddlBypass.begin();
    await observer.query('CREATE TABLE public.unexpected_object(id integer);');
    check(await ddlBypass.checkpoint().then(() => false, () => true), 'new_ddl_bypass_detected_abort');
    await observer.query('DROP TABLE public.unexpected_object;');
    const managedDrift = await make(); await managedDrift.begin(); await admin.query("UPDATE auth.schema_migrations SET version='synthetic_v2';");
    check(await managedDrift.checkpoint().then(() => false, () => true), 'managed_metadata_drift_aborts');
    const loss = await make(); await loss.begin(); await loss.session.close();
    check(await loss.checkpoint().then(() => false, () => true) && loss.state === 'aborted', 'session_loss_no_continuation');
    const accidentalRollback = await make(); await accidentalRollback.begin(); await accidentalRollback.session.query('ROLLBACK;');
    check(await accidentalRollback.checkpoint().then(() => false, () => true), 'same_backend_lost_locks_aborts');
    const unknown = await make(); await unknown.begin(); const fresh = unknown.observe;
    unknown.observe = async () => ({ ...await fresh(), unknownPrivilegedWriter: true });
    check(await unknown.checkpoint().then(() => false, () => true), 'unknown_writer_observer_signal_aborts');
    const blocker = await connect(); await blocker.query("BEGIN;INSERT INTO public.rutinas(titulo)VALUES('synthetic_rollback');");
    const timed = await make(150); check(await timed.begin().then(() => false, () => true) && timed.state === 'aborted', 'lock_timeout_aborts'); await blocker.query('ROLLBACK;');
    const ambiguousBytes = Buffer.from('BEGIN;\nALTER TABLE public.rutinas ADD COLUMN ack_probe boolean;\nCOMMIT;\n');
    const ambiguousPlan = composeExpand(ambiguousBytes), actualSession = await connect(); let deliveries = 0;
    const ambiguousAdapter = {
      alive: () => actualSession.alive(), close: () => actualSession.close(),
      query: async sql => {
        const output = await actualSession.query(sql);
        if (Buffer.isBuffer(sql) && sql.equals(ambiguousPlan.continuationBytes)) { deliveries++; throw Error('synthetic_transport_loss_after_real_commit'); }
        return output;
      },
    };
    const ambiguous = new FreezeProtocol({ session: ambiguousAdapter, expandBytes: ambiguousBytes,
      tables: JSON.parse(await observer.query(runtimeInventorySql)).tables, observe, verifyExpandedCatalog: async () => true, attestations });
    await ambiguous.begin();
    const rejected = await ambiguous.continueExpand({ checkpointVerified: true }).then(() => false, () => true);
    check(rejected && ambiguous.state === 'expand_outcome_unknown' && ambiguous.committed === null && ambiguous.signal.aborted &&
      await observer.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rutinas' AND column_name='ack_probe');") === 't',
    'real_commit_lost_ack_requires_reconciliation');
    await ambiguous.continueExpand({ checkpointVerified: true }).catch(() => {});
    check(deliveries === 1 && ambiguous.state === 'expand_outcome_unknown', 'unknown_outcome_never_redelivered');
    return { checks, count: checks.length, mode: 'share_plus_attested_operator_quiescence', originalExpandSha256: plan.originalSha256,
      directSequenceAndNewDdlTechnicallyBlocked: false, directBypassesRequireOperatorExclusivity: true,
      sourceReadinessVerified: false, AuthHttpDuringFreezeTested: false, remoteOperations: false, existingBackupsRead: false, fullWriterFreezeClaimed: false };
  } finally {
    for (const session of sessions) await session.close();
    docker(['rm', '--force', db], undefined, true);
    const remaining = docker(['container', 'ls', '--all', '--filter', `name=^/${db}$`, '--format', '{{.Names}}'], undefined, true);
    cleanup = !remaining.error && remaining.status === 0 && !remaining.stdout.trim();
    if (!cleanup) throw Error(`exact_synthetic_container_cleanup_unconfirmed_${db}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length > 3 || process.argv.length === 3 && process.argv[2] !== '--snapshot-only') throw Error('arguments_forbidden');
    console.log(JSON.stringify({ ...await syntheticDrill({ snapshotOnly: process.argv[2] === '--snapshot-only' }), exactContainerCleanupVerified: true }));
  } catch (error) {
    const safe = /^(?:synthetic_check_failed_[a-z_]+|sql_session_stopped_(?:[0-9A-Z]{5}|unknown)|sql_session_timeout|exact_synthetic_container_cleanup_unconfirmed_stage04-freeze-synthetic-[a-f0-9]+)$/.test(error.message) ? error.message : 'synthetic_freeze_drill_failed';
    console.error(safe); process.exitCode = 1;
  }
}
