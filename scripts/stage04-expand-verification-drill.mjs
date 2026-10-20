// Focal SQL verification of the new post-expand observer. Synthetic only;
// does not read existing backups, credentials or connect to Supabase.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { expandedCatalogSql, acceptExpandedCatalog, approvedExpandSha256 } from './stage04-expand-verification.mjs';

const endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const image = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const name = `stage04-expand-observer-${randomBytes(16).toString('hex')}`;
const docker = (args, input, optional = false) => {
  const r = spawnSync('docker', ['--host', endpoint, ...args], { input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 2097152 });
  if (!optional && (r.error || r.status !== 0)) throw Error('synthetic_expand_observer_operation_failed');
  return r;
};
const sql = input => docker(['exec', '-i', name, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], input).stdout.trim();
const observe = () => JSON.parse(sql(expandedCatalogSql));
let passed = 0, cleanup = false;
try {
  const bytes = readFileSync(new URL('../supabase/migrations/20261016010000_auth_profiles_expand.sql', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), approvedExpandSha256);
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
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TABLE public.empleados(id uuid PRIMARY KEY,nombre text,rol text,pin text);
    CREATE TABLE public.rutinas(id uuid PRIMARY KEY);
    CREATE TABLE public.tareas_rutina(id uuid PRIMARY KEY);
    CREATE TABLE public.empleado_rutinas(id uuid PRIMARY KEY);
    CREATE TABLE public.auditoria_diaria(id uuid PRIMARY KEY);
    CREATE TABLE public.tareas_urgentes(id uuid PRIMARY KEY);`);
  assert.equal(acceptExpandedCatalog(observe()), false); passed++;
  sql(bytes);
  assert.equal(acceptExpandedCatalog(observe()), true); passed++;
  sql('GRANT SELECT ON public.empleados TO anon;');
  assert.equal(acceptExpandedCatalog(observe()), false); passed++;
  sql('REVOKE SELECT ON public.empleados FROM anon; GRANT SELECT(id) ON public.empleados TO anon;');
  assert.equal(acceptExpandedCatalog(observe()), false); passed++;
  sql('REVOKE SELECT(id) ON public.empleados FROM anon; GRANT EXECUTE ON FUNCTION private.bootstrap_first_admin(uuid,uuid,text) TO authenticated;');
  assert.equal(acceptExpandedCatalog(observe()), false); passed++;
  sql("REVOKE EXECUTE ON FUNCTION private.bootstrap_first_admin(uuid,uuid,text) FROM authenticated; ALTER FUNCTION private.is_admin() SET search_path=public;");
  assert.equal(acceptExpandedCatalog(observe()), false); passed++;
  sql('ALTER FUNCTION private.is_admin() SET search_path=pg_catalog;');
  assert.equal(acceptExpandedCatalog(observe()), true); passed++;
  sql('GRANT CREATE ON SCHEMA private TO anon;');
  assert.equal(acceptExpandedCatalog(observe()), false); passed++;
  sql('REVOKE CREATE ON SCHEMA private FROM anon; ALTER FUNCTION private.is_admin() OWNER TO authenticated;');
  assert.equal(acceptExpandedCatalog(observe()), false); passed++;
  sql('ALTER FUNCTION private.is_admin() OWNER TO postgres; REVOKE ALL ON FUNCTION private.is_admin() FROM authenticated; GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;');
  assert.equal(acceptExpandedCatalog(observe()), true); passed++;
  assert.equal(acceptExpandedCatalog(true), false); passed++;
} finally {
  docker(['rm', '--force', name], undefined, true);
  const result = docker(['container', 'ls', '--all', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], undefined, true);
  cleanup = !result.error && result.status === 0 && result.stdout.trim() === '';
  assert.equal(cleanup, true);
}
process.stdout.write(JSON.stringify({ focalPostExpandObserver: true, casesPassed: passed, exactContainerCleanupVerified: cleanup,
  existingBackupOrCredentialsRead: false, remoteModified: false, productionAdapterReady: false }) + '\n');
