// Synthetic SQL only; no credentials, remote endpoints, ports or host mounts.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

if (process.argv.length !== 2) throw Error('Arguments forbidden: synthetic local only');
const endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const image = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
if (process.platform !== 'win32' || process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) {
  throw Error('Explicit local Windows Docker context required');
}
const name = `gns-template-order-${randomBytes(8).toString('hex')}`;
const docker = (args, input, optional = false) => {
  const result = spawnSync('docker', ['--host', endpoint, ...args], {
    input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024,
  });
  if (!optional && (result.error || result.status !== 0)) {
    throw Error(`Local Docker ${args[0]} failed: ${result.stderr || result.error?.message || result.status}`);
  }
  return result;
};
const context = JSON.parse(docker(['context', 'inspect']).stdout);
if (context.length !== 1 || context[0].Endpoints?.docker?.Host !== endpoint) {
  throw Error('Docker context is not the expected local endpoint');
}
const sql = text => docker(['exec', '-i', name, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], text);
const file = path => sql(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
let created = false;
let cleanup = false;
let failure;
try {
  created = true;
  docker(['run', '--detach', '--rm', '--pull', 'never', '--name', name,
    '--network', 'none', '--log-driver', 'none', '--read-only', '--user', 'postgres',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=192m,uid=70,gid=70,mode=0700',
    '--tmpfs', '/var/run/postgresql:rw,noexec,nosuid,size=8m,uid=70,gid=70,mode=0755',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=8m,mode=1777',
    '--memory', '256m', '--memory-swap', '256m', '--pids-limit', '96',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (docker(['exec', name, 'pg_isready', '-U', 'postgres'], undefined, true).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw Error('Local PostgreSQL readiness timeout');
  const state = JSON.parse(docker(['inspect', '--format', '{{json .}}', name]).stdout);
  if (state.HostConfig.NetworkMode !== 'none' || state.HostConfig.LogConfig.Type !== 'none'
      || !state.HostConfig.ReadonlyRootfs || (state.HostConfig.Binds ?? []).length
      || Object.keys(state.HostConfig.PortBindings ?? {}).length) throw Error('Isolation check failed');
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth to authenticated;`);
  file('supabase/tests/00_legacy_schema.sql');
  file('supabase/migrations/20261016010000_auth_profiles_expand.sql');
  sql(`insert into public.empleados(id,nombre,pin,rol) values('01000000-0000-4000-8000-000000000001','Synthetic baseline admin','synthetic-only','admin');
insert into auth.users values('02000000-0000-4000-8000-000000000001','baseline.admin@auth.gestor-barberia.invalid');
select private.bootstrap_first_admin('01000000-0000-4000-8000-000000000001','02000000-0000-4000-8000-000000000001','baseline.admin');`);
  file('supabase/migrations/20261016020000_auth_rls_cutover.sql');
  file('supabase/migrations/20261017000000_security_operations.sql');
  file('supabase/migrations/20261020000000_daily_assignments.sql');
  file('supabase/migrations/20261020010000_daily_assignment_date_policy_grant.sql');
  file('supabase/migrations/20261016000000_add_rutinas_color.sql');
  // Exercise the exact transaction used by Apply without importing credentials
  // or making any request: parse only its literal SQL blocks.
  const apply = readFileSync(new URL('../scripts/apply-template-order.ps1', import.meta.url), 'utf8');
  const literal = name => {
    const match = apply.match(new RegExp(`\\$${name}=@'\\r?\\n([\\s\\S]*?)\\r?\\n'@`));
    if (!match) throw Error(`Missing SQL literal: ${name}`);
    return match[1];
  };
  const migration = readFileSync(new URL('../supabase/migrations/20261024000000_template_order.sql', import.meta.url), 'utf8')
    .replace(/^begin;\s*$/gm, '').replace(/^commit;\s*$/gm, '');
  sql(`${literal('prefix')}\n${migration}\n${literal('suffix')}`);
  const result = file('supabase/tests/09_template_order_test.sql');
  const checks = result.stderr.split(/\r?\n/).filter(line => line.includes('PASS:'));
  console.log(checks.join('\n'));
  if (checks.length < 20) throw Error('Expected SQL assertions were not executed');
  const preserved = sql(`select (select count(*)=1 from public.empleados)
and not exists(select 1 from public.asignaciones_diarias)
and not exists(select 1 from public.auditoria_diaria)
and not exists(select 1 from public.tareas_urgentes)
and (select maintenance from private.security_operations where singleton);`).stdout.trim();
  if (preserved !== 't') throw Error('Fixture rollback did not preserve baseline');
  console.log(`PASS: ${checks.length} SQL assertions; fixtures rolled back; maintenance preserved; no remote operations`);
  file('supabase/rollbacks/20261024000000_template_order.down.sql');
  const rollback = sql(`select not exists(select 1 from information_schema.columns where table_schema='public' and table_name='rutinas' and column_name='orden')
and to_regprocedure('public.reorder_template_items(uuid[],uuid)') is null
and (select count(*)=1 from public.empleados);`).stdout.trim();
  if (rollback !== 't') throw Error('Ordering rollback failed');
  console.log('PASS: exact Apply transaction and ordering rollback verified locally');
} catch (error) {
  failure = error;
  throw error;
} finally {
  if (created) {
    docker(['rm', '--force', name], undefined, true);
    const result = docker(['container', 'ls', '--all', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], undefined, true);
    cleanup = result.status === 0 && result.stdout.trim() === '';
  }
  if (!cleanup && !failure) throw Error('Local synthetic container cleanup unconfirmed');
  if (cleanup) console.log('PASS: local container cleanup confirmed');
  else console.error('Local synthetic container cleanup could not be checked');
}
