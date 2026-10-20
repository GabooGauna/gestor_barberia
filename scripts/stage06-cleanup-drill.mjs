// Synthetic SQL-only cleanup regression. No Supabase, backup or credentials read.
// Auth Admin API deletion is deliberately outside this isolated PostgreSQL drill.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const image = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const name = `stage06-cleanup-drill-${randomBytes(16).toString('hex')}`;
const snapshotSql = readFileSync(new URL('../supabase/inspections/stage06-cleanup-snapshot.sql', import.meta.url), 'utf8');
const repairSql = readFileSync(new URL('../supabase/repairs/stage06-cleanup-cesar.sql', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const docker = (args, input, optional = false) => {
  const r = spawnSync('docker', ['--host', endpoint, ...args], {
    input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 2097152,
  });
  if (!optional && (r.error || r.status !== 0)) throw Error(`synthetic_cleanup_operation_failed:${r.stderr || r.error?.message || r.status}`);
  return r;
};
const execute = (input, optional = false) => docker([
  'exec', '-i', name, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
], input, optional);
const sql = input => execute(input).stdout.trim();
const observe = () => JSON.parse(sql(snapshotSql));
const tables = {
  empleados: 'public', rutinas: 'public', tareas_rutina: 'public', empleado_rutinas: 'public',
  asignaciones_diarias: 'public', auditoria_diaria: 'public', tareas_urgentes: 'public',
  task_completion_events: 'private', auth_admin_audit: 'private', admin_operation_admissions: 'private',
  security_operations: 'private', users: 'auth', identities: 'auth', mfa_factors: 'auth',
};
const rows = () => Object.fromEntries(Object.entries(tables).map(([table, schema]) => [
  table, JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from ${schema}.${table} t;`)),
]));
const fingerprint = value => hash(JSON.stringify(value));
const apply = expected => {
  const encoded = Buffer.from(JSON.stringify(expected)).toString('base64');
  return execute(`begin;
    set local lock_timeout='5s'; set local statement_timeout='30s';
    lock table public.empleados,public.rutinas,public.tareas_rutina,public.asignaciones_diarias,
      public.empleado_rutinas,public.auditoria_diaria,public.tareas_urgentes,
      private.task_completion_events,private.auth_admin_audit,private.admin_operation_admissions in share row exclusive mode;
    create temp table expected_snapshot on commit drop as
      select convert_from(decode('${encoded}','base64'),'UTF8')::jsonb as result;
    create temp table actual_snapshot on commit drop as ${snapshotSql}
    ${repairSql}
    create temp table post_snapshot on commit drop as ${snapshotSql}
    do $$ begin
      if (select result->'preserved' from post_snapshot) is distinct from (select result->'preserved' from expected_snapshot)
      or exists(select 1 from post_snapshot s cross join lateral jsonb_each(s.result->'payload') p where jsonb_array_length(p.value)<>0)
      then raise exception 'cleanup_postcondition_failed'; end if;
    end $$;
    commit; select true as business_cleanup_committed;`, true);
};

// UUIDs identify scope only. Every row and value below is synthetic.
const target = 'bd5735c9-03c0-4220-8b24-f834b51847ed';
const targetAuth = 'eb36b62d-de89-4277-876b-123099d6d281';
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const seed = () => sql(`
  truncate table auth.users,public.empleados,public.rutinas,public.tareas_rutina,
    public.empleado_rutinas,public.asignaciones_diarias,public.auditoria_diaria,public.tareas_urgentes,
    private.task_completion_events,private.auth_admin_audit,private.admin_operation_admissions,
    private.security_operations,auth.identities,auth.mfa_factors cascade;
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,role,raw_app_meta_data,raw_user_meta_data)
    values ('${targetAuth}','synthetic-cesar@example.invalid','synthetic-hash','2026-01-01','authenticated','{}','{}'),
      ('${id(11)}','synthetic-admin-a@example.invalid','synthetic-hash-a','2026-01-01','authenticated','{}','{}'),
      ('${id(12)}','synthetic-admin-b@example.invalid','synthetic-hash-b','2026-01-01','authenticated','{}','{}'),
      ('${id(13)}','synthetic-other@example.invalid','synthetic-hash-other','2026-01-01','authenticated','{}','{}');
  insert into public.empleados(id,nombre,rol,auth_user_id,usuario,activo) values
    ('${target}','César','empleado','${targetAuth}','empleado.gns',true),
    ('${id(1)}','Synthetic Admin A','admin','${id(11)}','synthetic.a',true),
    ('${id(2)}','Synthetic Admin B','admin','${id(12)}','synthetic.b',true),
    ('${id(3)}','Synthetic Other','empleado','${id(13)}','synthetic.other',true);
  insert into auth.identities values ('${id(21)}','${targetAuth}','email'),('${id(22)}','${id(11)}','email');
  insert into auth.mfa_factors values ('${id(31)}','${targetAuth}','verified'),('${id(32)}','${id(11)}','verified'),('${id(33)}','${id(12)}','verified');
  insert into public.rutinas values ('${id(40)}','Synthetic routine','sage',null);
  insert into public.tareas_rutina values ('${id(41)}','${id(40)}','Synthetic task',1,null);
  insert into public.empleado_rutinas values ('${id(50)}','${target}','${id(40)}'),('${id(51)}','${id(3)}','${id(40)}');
  insert into public.asignaciones_diarias values ('${id(60)}','${target}','${id(40)}','2026-01-01'),('${id(61)}','${id(3)}','${id(40)}','2026-01-01');
  insert into public.auditoria_diaria values ('${id(70)}','${target}','${id(41)}','2026-01-01'),('${id(71)}','${id(3)}','${id(41)}','2026-01-01');
  insert into public.tareas_urgentes values ('${id(80)}','${target}','Synthetic urgent','2026-01-01'),('${id(81)}','${id(3)}','Synthetic other urgent','2026-01-01');
  insert into private.task_completion_events values (1,'${id(70)}','${id(11)}'),(2,'${id(71)}','${targetAuth}'),(3,'${id(71)}','${id(13)}');
  insert into private.auth_admin_audit values
    (1,'${target}','${id(11)}','{}'),(2,'${id(3)}','${targetAuth}','{}'),
    (3,'${id(3)}','${id(11)}','{"auth_user_id":"${targetAuth}"}'),
    (4,'${id(3)}','${id(11)}','{"urgent_id":"${id(80)}"}'),(5,'${id(3)}','${id(11)}','{}');
  insert into private.security_operations values (1,false);
  insert into private.admin_operation_admissions values
    ('${id(90)}','${id(11)}',encode(sha256(convert_to('${target}','UTF8')),'hex'),'2026-01-01'),
    ('${id(94)}','${id(11)}',encode(sha256(convert_to('empleado.gns','UTF8')),'hex'),'2026-01-01'),
    ('${id(91)}','${id(11)}','synthetic-unrelated-target','2026-01-01');
`);

let cleanup = false;
const cases = [];
try {
  docker(['run', '--detach', '--rm', '--name', name, '--network', 'none', '--log-driver', 'none', '--read-only',
    '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=192m', '--tmpfs', '/var/run/postgresql:rw,noexec,nosuid,size=8m',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=8m', '--memory', '256m', '--memory-swap', '256m', '--pids-limit', '96',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (docker(['exec', name, 'pg_isready', '-U', 'postgres'], undefined, true).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(ready, true);
  sql(`create schema auth; create schema private;
    create table auth.users(id uuid primary key,email text,created_at timestamptz default '2026-01-01',email_confirmed_at timestamptz,
      encrypted_password text,banned_until timestamptz,role text,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
    create table auth.identities(id uuid primary key,user_id uuid references auth.users on delete cascade,provider text);
    create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users on delete cascade,status text);
    create table public.empleados(id uuid primary key,nombre text,rol text,creado_en timestamptz default '2026-01-01',
      auth_user_id uuid references auth.users on delete restrict,usuario text,activo boolean,desactivado_en timestamptz);
    create table public.rutinas(id uuid primary key,titulo text,color text,archivada_en timestamptz);
    create table public.tareas_rutina(id uuid primary key,rutina_id uuid references public.rutinas,descripcion text,orden integer,archivada_en timestamptz);
    create table public.empleado_rutinas(id uuid primary key,empleado_id uuid references public.empleados,rutina_id uuid references public.rutinas);
    create table public.asignaciones_diarias(id uuid primary key,empleado_id uuid references public.empleados,rutina_id uuid references public.rutinas,fecha date);
    create table public.auditoria_diaria(id uuid primary key,empleado_id uuid references public.empleados,tarea_id uuid references public.tareas_rutina,fecha date);
    create table public.tareas_urgentes(id uuid primary key,empleado_id uuid references public.empleados,descripcion text,fecha date);
    create table private.task_completion_events(id bigint primary key,auditoria_id uuid references public.auditoria_diaria,actor_auth_user_id uuid references auth.users);
    create table private.auth_admin_audit(id bigint primary key,target_empleado_id uuid references public.empleados,actor_auth_user_id uuid references auth.users,details jsonb);
    create table private.admin_operation_admissions(id uuid primary key,actor_id uuid references auth.users,target_key text,finished_at timestamptz);
    create table private.security_operations(id bigint primary key,maintenance boolean);
  `);
  seed();
  const expected = observe();
  const before = rows();
  assert.deepEqual(Object.fromEntries(Object.entries(expected.payload).map(([k, v]) => [k, v.length])), {
    empleados: 1, auditoria_diaria: 1, tareas_urgentes: 1, asignaciones_diarias: 1, empleado_rutinas: 1,
    task_completion_events: 2, auth_admin_audit: 4, admin_operation_admissions: 2,
  });
  // Simulate the JSON timestamp normalization performed by PowerShell HTTP.
  const transported = JSON.parse(JSON.stringify(expected), (_, value) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value).toISOString() : value);
  const positive = apply(transported);
  assert.equal(positive.status, 0, positive.stderr);
  assert.equal(positive.stdout.trim(), 't');
  const after = observe();
  assert.deepEqual(after.preserved, expected.preserved);
  assert.deepEqual(after.auth_identity, expected.auth_identity);
  assert.ok(Object.values(after.payload).every(list => list.length === 0));
  for (const [table, actual] of Object.entries(rows())) {
    const removed = new Set((expected.payload[table] || []).map(row => String(row.id)));
    const wanted = before[table].filter(row => !removed.has(String(row.id)));
    assert.equal(actual.length, wanted.length, `${table}: count preserved`);
    assert.equal(fingerprint(actual), fingerprint(wanted), `${table}: exact remaining rows preserved`);
  }
  cases.push('allowlisted_business_rows_removed_other_rows_credentials_mfa_colors_templates_preserved');
  cases.push('equivalent_transport_timestamp_formats_match_typed_rows');

  // Replaying the original SQL snapshot fails closed, including new unrelated activity.
  sql(`insert into public.auditoria_diaria values ('${id(72)}','${id(3)}','${id(41)}','2026-01-02');`);
  const beforeReplay = fingerprint(rows());
  const replay = apply(expected);
  assert.notEqual(replay.status, 0);
  assert.match(replay.stderr, /snapshot_drift_abort/);
  assert.equal(fingerprint(rows()), beforeReplay);
  cases.push('sql_replay_rejected_new_unrelated_activity_preserved');

  seed();
  const beforeDrift = observe();
  sql(`insert into public.auditoria_diaria values ('${id(72)}','${target}','${id(41)}','2026-01-02');`);
  const driftRows = fingerprint(rows());
  const drift = apply(beforeDrift);
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /snapshot_drift_abort/);
  assert.equal(fingerprint(rows()), driftRows);
  cases.push('post_snapshot_new_target_activity_aborts_transaction_preserves_every_row');

  seed();
  sql(`update public.empleados set rol='admin' where id='${target}';`);
  const adminRows = fingerprint(rows());
  const admin = apply(observe());
  assert.notEqual(admin.status, 0);
  assert.match(admin.stderr, /identity_or_inflight_guard_failed/);
  assert.equal(fingerprint(rows()), adminRows);
  cases.push('target_admin_guard_rejected_preserves_every_row');

  seed();
  sql(`insert into private.admin_operation_admissions values ('${id(92)}','${id(11)}','synthetic-inflight-target',null);`);
  const admissionsRows = fingerprint(rows());
  const admissions = apply(observe());
  assert.notEqual(admissions.status, 0);
  assert.match(admissions.stderr, /identity_or_inflight_guard_failed/);
  assert.equal(fingerprint(rows()), admissionsRows);
  cases.push('inflight_admissions_abort_preserves_every_row');
} finally {
  docker(['rm', '--force', name], undefined, true);
  const result = docker(['container', 'ls', '--all', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], undefined, true);
  cleanup = !result.error && result.status === 0 && result.stdout.trim() === '';
  assert.equal(cleanup, true);
}
process.stdout.write(JSON.stringify({
  syntheticSqlCleanupDrill: true, casesPassed: cases.length, cases,
  snapshotSqlSha256: hash(snapshotSql), repairSqlSha256: hash(repairSql),
  exactContainerCleanupVerified: cleanup, network: 'none', publishedPorts: 0,
  existingBackupOrCredentialsRead: false, remoteModified: false,
  authAdminApiDeletionTested: false, powershellApplyWrapperTested: false,
}) + '\n');
