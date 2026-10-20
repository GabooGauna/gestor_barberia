// Called ONLY by the isolated-restore runner after its restore/metadata gates.
// stdin JSON contains only the local container/role and prerequisite attestation.
// Never opens backup files, credential stores, .env files or remote endpoints.
import { spawnSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const authImage = 'ghcr.io/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b';
const postgresImage = 'public.ecr.aws/supabase/postgres:17.11.0.004@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108';
const expectedMigrationsHash = '7315402992f867a9b5f03b14aef2c1d0f9cf9a7ad66b15ae01c965102b21c4f2';

export function validateInput(input) {
  if (!input || !/^stage04-isolated-restore-[a-f0-9]{32}$/.test(input.dbContainer ?? '') ||
      input.dbSuperuser !== 'supabase_admin' ||
      input.prerequisitesVerified !== true) throw Error('invalid_local_probe_contract');
  return input;
}

function docker(args, input, optional = false) {
  const r = spawnSync('docker', ['--host', endpoint, ...args], {
    input, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024,
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Raw stdout/stderr can contain synthetic or restored secrets: never forward.
  if (!optional && (r.error || r.status !== 0)) throw Error('isolated_docker_operation_failed');
  return r;
}

function inspectIsolation(name, parent) {
  const s = JSON.parse(docker(['inspect', '--format', '{{json .}}', name]).stdout);
  if (!s.State.Running || s.HostConfig.NetworkMode !== (parent ? `container:${parent}` : 'none') ||
      s.HostConfig.LogConfig.Type !== 'none' || !s.HostConfig.ReadonlyRootfs ||
      (s.HostConfig.Binds ?? []).length || Object.keys(s.HostConfig.PortBindings ?? {}).length ||
      (s.Mounts ?? []).some(m => m.Type !== 'tmpfs') ||
      !s.HostConfig.Memory || s.HostConfig.MemorySwap !== s.HostConfig.Memory) {
    throw Error('container_isolation_required');
  }
  return s;
}

export async function probe(input) {
  validateInput(input);
  if (process.platform !== 'win32' || process.env.DOCKER_CONTEXT || process.env.DOCKER_HOST) {
    throw Error('fixed_windows_docker_context_required');
  }
  const context = JSON.parse(docker(['context', 'inspect']).stdout);
  if (context.length !== 1 || context[0].Endpoints?.docker?.Host !== endpoint) throw Error('local_context_required');
  const parentState=inspectIsolation(input.dbContainer);
  if(parentState.Config.Image!==postgresImage) throw Error('pinned_restored_database_required');
  const db = input.dbContainer;
  const sql = text => docker(['exec', '-i', db, 'psql', '-X', '--no-password', '-qAt',
    '-v', 'ON_ERROR_STOP=1', '-h', '/var/run/postgresql', '-U', input.dbSuperuser, '-d', 'postgres'], text).stdout.trim();
  // Parent can clean this exact name even if the helper process is terminated.
  const authName = `stage04-auth-restored-${db.slice(-32)}`;
  const jwtSecret = randomBytes(48).toString('hex');
  const password = `Recovery!Aa9${randomBytes(24).toString('hex')}`;
  const authDbPassword = randomBytes(48).toString('base64url');
  const email = `sentinel-${randomBytes(12).toString('hex')}@auth.gestor-barberia.invalid`;
  const jwt = role => {
    const h = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
    const p = Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url');
    return `${h}.${p}.${createHmac('sha256', jwtSecret).update(`${h}.${p}`).digest('base64url')}`;
  };
  const service = jwt('service_role');
  const migrations = () => JSON.parse(sql("select json_build_object('count',count(*),'hash',encode(sha256(convert_to(coalesce(string_agg(version::text,chr(10) order by version),''),'UTF8')),'hex')) from auth.schema_migrations;"));
  const runtime = () => {
    const names = JSON.parse(sql("select json_agg(tablename order by tablename) from pg_tables where schemaname='auth' and tablename<>'schema_migrations';"));
    if (!Array.isArray(names) || names.length !== 26 || !names.every(n => /^[a-z_]+$/.test(n))) throw Error('auth_runtime_schema_mismatch');
    return names.map(n => Number(sql(`select count(*) from auth."${n}";`)));
  };
  const business = () => sql(`with keys as (
    select 'empleados' t,id,jsonb_build_array(id)::text f from public.empleados
    union all select 'rutinas',id,jsonb_build_array(id)::text from public.rutinas
    union all select 'tareas_rutina',id,jsonb_build_array(id,rutina_id)::text from public.tareas_rutina
    union all select 'empleado_rutinas',id,jsonb_build_array(id,empleado_id,rutina_id)::text from public.empleado_rutinas
    union all select 'auditoria_diaria',id,jsonb_build_array(id,tarea_id,empleado_id)::text from public.auditoria_diaria
    union all select 'tareas_urgentes',id,jsonb_build_array(id,empleado_id)::text from public.tareas_urgentes)
    select encode(sha256(convert_to(coalesce(string_agg(t||':'||f,chr(10) order by t,id),''),'UTF8')),'hex') from keys;`);
  const http = (path, method = 'GET', body, bearer) => {
    if (!/^\/[a-z0-9_/?=&-]*$/.test(path)) throw Error('local_http_path_invalid');
    const lines = [`url = "http://127.0.0.1:9999${path}"`, `request = "${method}"`, 'silent', 'show-error', 'max-time = 8', 'noproxy = "*"', 'write-out = "\\n%{http_code}"'];
    if (bearer) lines.push(`header = "Authorization: Bearer ${bearer}"`);
    if (body !== undefined) lines.push('header = "Content-Type: application/json"', `data = ${JSON.stringify(JSON.stringify(body))}`);
    const r = docker(['exec', '-i', db, 'curl', '--config', '-'], `${lines.join('\n')}\n`, true);
    if (r.error || r.status !== 0) return { status: 0 };
    const at = r.stdout.lastIndexOf('\n');
    let value; try { value = JSON.parse(r.stdout.slice(0, at)); } catch { value = null; }
    return { status: Number(r.stdout.slice(at+1)), value };
  };
  const ready = async () => {
    for (let i=0;i<60;i++) {
      const r=http('/health');
      if (r.status===200) {
        if (r.value?.version !== 'v2.197.0') throw Error('auth_version_mismatch');
        return;
      }
      await new Promise(r=>setTimeout(r,500));
    }
    throw Error('auth_readiness_failed');
  };
  let created=false, result, failure, stage='baseline';
  try {
    const before=migrations(), fingerprint=business();
    if (before.count!==82 || before.hash!==expectedMigrationsHash || runtime().some(n=>n!==0)) throw Error('restored_auth_baseline_mismatch');
    if (sql('show listen_addresses;')!=='127.0.0.1') throw Error('loopback_pg_required');
    stage='start_restored_auth';
    sql(`set password_encryption='scram-sha-256'; alter role supabase_auth_admin password '${authDbPassword}';`);
    const startAuth = emailEnabled => {
    if(created) docker(['rm','--force',authName]);
    created=true;
    docker(['run','--detach','--pull','never','--name',authName,'--network',`container:${parentState.Id}`,
      '--log-driver','none','--read-only','--user','65534:65534','--cap-drop','ALL',
      '--security-opt','no-new-privileges','--memory','256m','--memory-swap','256m','--pids-limit','64',
      '--tmpfs','/run/probe:rw,noexec,nosuid,size=1048576,mode=0700,uid=65534,gid=65534',
      '--entrypoint','sh',authImage,'-c','while [ ! -f /run/probe/config ]; do sleep 1; done; . /run/probe/config; exec auth']);
    inspectIsolation(authName,parentState.Id);
    const configure = emailEnabled => {
      const env={ GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${authDbPassword}@127.0.0.1:5432/postgres?sslmode=disable`,
        GOTRUE_DB_DRIVER:'postgres',GOTRUE_API_HOST:'127.0.0.1',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1:9999',
        GOTRUE_SITE_URL:'http://127.0.0.1',GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_EXP:'3600',
        GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_DISABLE_SIGNUP:'true',
        GOTRUE_EXTERNAL_EMAIL_ENABLED:String(emailEnabled),GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_LOG_LEVEL:'panic'};
      const config=Object.entries(env).map(([k,v])=>`export ${k}='${v}'`).join('\n')+'\n';
      docker(['exec','-i',authName,'sh','-c','umask 077; cat > /run/probe/config.tmp && mv /run/probe/config.tmp /run/probe/config'],config);
    };
    configure(emailEnabled);
    };
    startAuth(false); await ready();
    if (JSON.stringify(migrations())!==JSON.stringify(before)) throw Error('unexpected_auth_migrations');
    stage='frozen_auth_rejection';
    const blocked=http('/signup','POST',{email,password});
    const loginBlocked=http('/token?grant_type=password','POST',{email,password});
    if (![400,403,422].includes(blocked.status) || ![400,403,422].includes(loginBlocked.status) || runtime().some(n=>n!==0)) throw Error('frozen_auth_not_contained');
    stage='synthetic_identity';
    startAuth(true); await ready();
    const sentinel=http('/admin/users','POST',{email,password,email_confirm:true},service);
    const sentinelId=sentinel.value?.id;
    if (sentinel.status!==200 || !/^[a-f0-9-]{36}$/.test(sentinelId??'')) throw Error('synthetic_admin_api_failed');
    const login=http('/token?grant_type=password','POST',{email,password});
    if (login.status!==200 || login.value?.user?.id!==sentinelId || !login.value?.refresh_token) throw Error('synthetic_login_failed');
    let refresh=http('/token?grant_type=refresh_token','POST',{refresh_token:login.value.refresh_token});
    if (refresh.status!==200 || refresh.value?.user?.id!==sentinelId) throw Error('synthetic_refresh_failed');
    stage='auth_restart_identity';
    startAuth(true); await ready();
    refresh=http('/token?grant_type=refresh_token','POST',{refresh_token:refresh.value.refresh_token});
    if (refresh.status!==200 || refresh.value?.user?.id!==sentinelId || Number(sql('select count(*) from auth.users;'))!==1) throw Error('identity_restart_failed');
    if (business()!==fingerprint || JSON.stringify(migrations())!==JSON.stringify(before)) throw Error('restored_metadata_changed');
    result={authRestoredBaselineProbe:true,authVersion:'v2.197.0',schemaMigrationsUnchanged:true,emptyRuntimeBaselineVerified:true,
      frozenSignupAndEmailRejected:true,syntheticAdminCreateLoginRefreshRestartVerified:true,businessUuidFkUnchanged:true,
      fullSupabaseRecovery:false,RPO0:false,tokenContinuityTested:false,originalAuthRuntimeRows:0,hostPagingExcluded:false};
  } catch { failure=`Auth restored baseline probe failed at ${stage}; raw diagnostics suppressed.`; }
  finally {
    if(created) {
      docker(['rm','--force',authName],undefined,true);
      const absent=docker(['container','ls','--all','--filter',`name=^/${authName}$`,'--format','{{.Names}}'],undefined,true);
      if(absent.error || absent.status!==0 || absent.stdout.trim()) failure='Auth restored baseline probe cleanup unconfirmed.';
    }
  }
  if(failure) throw Error(failure);
  return {...result,exactAuthContainerCleanupVerified:true};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.length!==2 || process.stdin.isTTY) throw Error('stdin_contract_required');
    const chunks=[];let length=0;
    for await(const c of process.stdin) {length+=c.length;if(length>8192)throw Error('input_limit');chunks.push(c);}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    console.log(JSON.stringify(await probe(input)));
  } catch(error) {
    const message=/^Auth restored baseline probe (failed at [a-z_]+; raw diagnostics suppressed\.|cleanup unconfirmed\.)$/.test(error.message)?error.message:'Auth restored baseline probe stopped; raw diagnostics suppressed.';
    console.error(message);process.exitCode=1;
  }
}
