// Synthetic-only Docker drill. Accepts no URL, credentials or remote target.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

if (process.argv.length !== 2) throw new Error('No arguments accepted: synthetic local drill only');
const container = `barberia-stage04-drill-${randomBytes(6).toString('hex')}`;
const image = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const dir = mkdtempSync(join(tmpdir(), 'barberia-stage04-drill-'));
const root = new URL('../', import.meta.url);
let created = false;
let key;
let summary;
function docker(args, input, allowFailure = false) {
  const result = spawnSync('docker', args, { input, maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  if (result.status !== 0 && !allowFailure) {
    // Never print database contents or command input on failure.
    throw new Error(`Docker step failed: ${args[0]} (status ${result.status ?? 'unavailable'})`);
  }
  return result;
}
function sql(db, text, allowFailure = false) {
  const result = docker(['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db], text, true);
  if (result.status !== 0 && !allowFailure) {
    const diagnostic = result.stderr.toString().match(/ERROR: [^\r\n]+/g) ?? [];
    throw new Error(`Synthetic SQL failed: ${diagnostic.join(' ')}`);
  }
  return result;
}
function file(db, path) { return sql(db, readFileSync(new URL(path, root))); }
const fingerprintSql = `
select jsonb_build_object(
 'extensions', (select jsonb_agg(jsonb_build_array(e.extname,e.extversion,n.nspname) order by e.extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace),
 'schemas', (select jsonb_agg(jsonb_build_array(nspname,pg_get_userbyid(nspowner),nspacl) order by nspname) from pg_namespace where nspname in ('auth','public','private')),
 'sequences', (select jsonb_agg(jsonb_build_array(schemaname,sequencename,last_value) order by schemaname,sequencename) from pg_sequences where schemaname in ('auth','public','private')),
 'default_acl', (select jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype,d.defaclacl) order by d.defaclrole,n.nspname,d.defaclobjtype) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace),
 'rows', (select jsonb_object_agg(n, rows) from (
   select 'empleados' n, jsonb_agg(to_jsonb(e) order by id) rows from public.empleados e
   union all select 'rutinas', jsonb_agg(to_jsonb(e) order by id) from public.rutinas e
   union all select 'tareas', jsonb_agg(to_jsonb(e) order by id) from public.tareas_rutina e
   union all select 'asignaciones', jsonb_agg(to_jsonb(e) order by id) from public.empleado_rutinas e
   union all select 'auditorias', jsonb_agg(to_jsonb(e) order by id) from public.auditoria_diaria e
   union all select 'urgencias', jsonb_agg(to_jsonb(e) order by id) from public.tareas_urgentes e
   union all select 'admin_events', jsonb_agg(to_jsonb(e) order by id) from private.auth_admin_audit e
   union all select 'completion_events', jsonb_agg(to_jsonb(e) order by id) from private.task_completion_events e
   union all select 'auth_ids', jsonb_agg(id order by id) from auth.users
 ) t),
 'constraints', (select jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated) order by n.nspname,c.relname,k.conname)
 from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth')),
 'tables', (select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),
   array(select x::text from unnest(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) x order by x::text)) order by n.nspname,c.relname)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and c.relkind in ('r','S')),
 'columns', (select jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl) order by n.nspname,c.relname,a.attnum)
 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and a.attnum>0 and not a.attisdropped and c.relkind='r'),
 'policies', (select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','private','auth')),
 'functions', (select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prorettype::regtype::text,pg_get_userbyid(p.proowner),p.prosrc,p.prosecdef,p.proconfig,p.proacl) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','auth') or (n.nspname='public' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')))
);`;
try {
  docker(['info', '--format', '{{.ServerVersion}}']);
  created = true;
  docker(['run', '-d', '--name', container, '--network', 'none', '--label', 'barberia.synthetic-drill=true',
    '--tmpfs', '/var/lib/postgresql/data:rw', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (docker(['exec', container, 'pg_isready', '-U', 'postgres'], undefined, true).status === 0) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (attempt === 59) throw new Error('Local database readiness timeout');
  }
  sql('postgres', `create role anon; create role authenticated; create role service_role bypassrls;
    create database drill_source; create database drill_restored;`);
  // Minimal SQL fixture, deliberately NOT a running Supabase Auth server.
  sql('drill_source', `create extension pgcrypto; create schema auth;
    create table auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text,
    encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz,
    updated_at timestamptz, confirmation_token text, recovery_token text,
    email_change_token_new text, email_change text, raw_app_meta_data jsonb, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  file('drill_source', 'supabase/tests/00_legacy_schema.sql');
  file('drill_source', 'supabase/migrations/20261016010000_auth_profiles_expand.sql');
  // The failed transaction must leave no cutover changes.
  const cutover = readFileSync(new URL('supabase/migrations/20261016020000_auth_rls_cutover.sql', root));
  assert.notEqual(sql('drill_source', cutover, true).status, 0);
  assert.equal(sql('drill_source', "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='empleados' and column_name='pin');").stdout.toString().trim(), 't');
  file('drill_source', 'supabase/tests/01_auth_cutover_seed.sql');
  sql('drill_source', `insert into public.rutinas(id,titulo) values('03000000-0000-4000-8000-000000000001','Sintetica');
    insert into public.tareas_rutina(id,rutina_id,seccion,descripcion) values('04000000-0000-4000-8000-000000000001','03000000-0000-4000-8000-000000000001','Prueba','Prueba');
    insert into public.empleado_rutinas(empleado_id,rutina_id) values('01000000-0000-4000-8000-000000000002','03000000-0000-4000-8000-000000000001');
    insert into public.auditoria_diaria(empleado_id,tarea_id) values('01000000-0000-4000-8000-000000000002','04000000-0000-4000-8000-000000000001');
    insert into public.tareas_urgentes(empleado_id,descripcion) values('01000000-0000-4000-8000-000000000002','Prueba');`);
  sql('drill_source', cutover);
  const before = sql('drill_source', fingerprintSql).stdout;
  // One pg_dump snapshot contains all three schemas, data, functions, policies and ACL.
  const dump = docker(['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'drill_source', '-Fc',
    '--schema=auth', '--schema=public', '--schema=private']).stdout;
  key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(dump), cipher.final()]);
  const tag = cipher.getAuthTag();
  const archive = join(dir, 'synthetic.dump.gcm');
  writeFileSync(archive, Buffer.concat([iv, tag, encrypted]), { mode: 0o600 });
  const decrypt = bytes => {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12));
    decipher.setAuthTag(bytes.subarray(12,28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  };
  const bytes = readFileSync(archive), corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => decrypt(corrupt));
  const recovered = decrypt(bytes);
  assert.deepEqual(recovered, dump);
  // Fresh PostgreSQL template databases already contain an empty public schema.
  sql('drill_restored', 'drop schema public;');
  const restore = docker(['exec', '-i', container, 'pg_restore', '-U', 'postgres', '-d', 'drill_restored', '--exit-on-error', '--single-transaction'], recovered, true);
  if (restore.status !== 0) {
    const diagnostic = restore.stderr.toString().split('\n').filter(line => /^pg_restore: error:/.test(line));
    throw new Error(`Synthetic restore failed: ${diagnostic.join(' ')}`);
  }
  // pg_dump/restore of identity sequences changed the owner's explicit ACL in
  // this fixture. Reconcile only these known source ACLs; no application grants.
  sql('drill_restored', `grant all privileges on sequence private.auth_admin_audit_id_seq to postgres;
    grant all privileges on sequence private.task_completion_events_id_seq to postgres;
    grant usage on schema public to public;
    create extension if not exists pgcrypto;`);
  const digest = value => createHash('sha256').update(value).digest('hex');
  const originalCatalog = JSON.parse(before), restoredCatalog = JSON.parse(sql('drill_restored', fingerprintSql).stdout);
  for (const section of Object.keys(originalCatalog)) {
    if (section === 'rows') assert.equal(digest(JSON.stringify(restoredCatalog[section])), digest(JSON.stringify(originalCatalog[section])), 'Restored row fingerprint mismatch');
    else assert.deepEqual(restoredCatalog[section], originalCatalog[section], `Restored ${section} mismatch`);
  }
  // Restored security must execute correctly, not merely match catalog counts.
  file('drill_restored', 'supabase/tests/04_auth_rls_test.sql');
  file('drill_restored', 'supabase/rollbacks/20261016020000_auth_rls_cutover.down.sql');
  sql('drill_restored', `do $$ begin if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('empleados','rutinas','tareas_rutina','empleado_rutinas','auditoria_diaria','tareas_urgentes')
    and (not c.relrowsecurity or not c.relforcerowsecurity)) then raise exception 'RLS not closed'; end if; end $$;`);
  const columnAclAfterRollback = sql('drill_restored', "select has_column_privilege('authenticated','public.empleados','id','select');").stdout.toString().trim();
  const closed = sql('drill_restored', "begin; set local role authenticated; select count(id) from public.empleados; rollback;", true);
  if (closed.status === 0) assert.equal(closed.stdout.toString().trim(), '0');
  else assert.match(closed.stderr.toString(), /permission denied for table empleados/);
  assert.notEqual(sql('drill_restored', 'begin; set local role anon; select id from public.empleados; rollback;', true).status, 0);
  summary = { result: 'PASS', image, scope: 'synthetic SQL only; no Auth HTTP/Edge/config restore',
    checks: ['failed cutover atomicity','three-schema snapshot','AES-256-GCM roundtrip and tamper rejection',
      'restored rows UUID/FK/catalog ACL/policies/functions equality','restored RLS/RPC suite','rollback denies rows'],
    columnAclAfterRollback, archiveSha256: createHash('sha256').update(bytes).digest('hex') };
} finally {
  key?.fill(0);
  const cleanup = created ? docker(['rm', '-f', '-v', container], undefined, true) : null;
  rmSync(dir, { recursive: true, force: true });
  if (cleanup && cleanup.status !== 0) throw new Error(`Local cleanup failed; inspect only container ${container}`);
}
console.log(JSON.stringify(summary, null, 2));
