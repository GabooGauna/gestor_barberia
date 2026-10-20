// Fresh synthetic fixture ONLY. No backups, credential stores or remote URLs.
// New scope: HTTP writes queued behind SHARE locks and explicit backend drain.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';

const endpoint='npipe:////./pipe/dockerDesktopLinuxEngine';
const pgImage='public.ecr.aws/supabase/postgres:17.11.0.004@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108';
const authImage='ghcr.io/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b';
const id=randomBytes(16).toString('hex');
const db=`stage04-auth-freeze-db-${id}`,auth=`stage04-auth-freeze-api-${id}`;
const password=`Synthetic!Aa9${randomBytes(24).toString('hex')}`;
const dbPassword=randomBytes(48).toString('base64url');
const jwtSecret=randomBytes(48).toString('hex');
const email=`fixture-${id}@auth.gestor-barberia.invalid`;
const names=[],children=[];
let stage='local_context',failure,report,locker,authOutput;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function check(ok){if(!ok)throw Error('synthetic_assertion_failed');}
function docker(args,input,optional=false){
 const r=spawnSync('docker',['--host',endpoint,...args],{input,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024,windowsHide:true,stdio:['pipe','pipe','pipe']});
 if(!optional&&(r.error||r.status!==0))throw Error('local_docker_operation_failed');
 return r;
}
function worker(args,input){
 const p=spawn('docker',['--host',endpoint,...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='',finished=false;
 const done=new Promise(resolve=>{p.on('error',()=>{finished=true;resolve({code:-1,stdout,stderr});});p.on('close',code=>{finished=true;resolve({code,stdout,stderr});});});
 p.stdout.on('data',c=>{stdout+=c.toString();if(stdout.length>1048576)p.kill();});
 p.stderr.on('data',c=>{stderr+=c.toString();if(stderr.length>1048576)p.kill();});
 if(input!==undefined)p.stdin.end(input);
 const w={p,done,get stdout(){return stdout;},get stderr(){return stderr;},get finished(){return finished;}};children.push(w);return w;
}
function sql(text,role='supabase_admin'){
 return docker(['exec','-i',db,'psql','-X','--no-password','-qAt','-v','ON_ERROR_STOP=1','-h','/var/run/postgresql','-U',role,'-d','postgres'],text).stdout.trim();
}
function isolation(name,network){
 const s=JSON.parse(docker(['inspect','--format','{{json .}}',name]).stdout);
 check(s.State.Running&&s.HostConfig.NetworkMode===network&&s.HostConfig.LogConfig.Type==='none'&&s.HostConfig.ReadonlyRootfs&&
 !(s.HostConfig.Binds??[]).length&&!Object.keys(s.HostConfig.PortBindings??{}).length&&
 !(s.Mounts??[]).some(m=>m.Type!=='tmpfs')&&s.HostConfig.Memory&&s.HostConfig.MemorySwap===s.HostConfig.Memory);
 return s;
}
function jwt(){
 const h=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
 const p=Buffer.from(JSON.stringify({role:'service_role',iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
 return `${h}.${p}.${createHmac('sha256',jwtSecret).update(`${h}.${p}`).digest('base64url')}`;
}
function curlInput(path,method='GET',body,token,timeout=8,requestId){
 const v=[`url = "http://127.0.0.1:9999${path}"`,`request = "${method}"`,'silent','show-error',`max-time = ${timeout}`,'noproxy = "*"','write-out = "\\n%{http_code}"'];
 if(token)v.push(`header = "Authorization: Bearer ${token}"`);
 if(requestId)v.push(`header = "X-Request-ID: ${requestId}"`);
 if(body!==undefined)v.push('header = "Content-Type: application/json"',`data = ${JSON.stringify(JSON.stringify(body))}`);
 return v.join('\n')+'\n';
}
function parseHttp(r){
 const at=r.stdout.lastIndexOf('\n');let value;try{value=JSON.parse(r.stdout.slice(0,at));}catch{value=null;}
 return {status:Number(r.stdout.slice(at+1)),value,exit:r.status??r.code};
}
function http(path,method,body,token){return parseHttp(docker(['exec','-i',db,'curl','--config','-'],curlInput(path,method,body,token),true));}
function asyncHttp(path,body,token,requestId){return worker(['exec','-i',db,'curl','--config','-'],curlInput(path,'POST',body,token,4,requestId));}
function handlerCompleted(requestId){
 // Live output is retained only in RAM, never emitted or persisted. Only the
 // completion marker of our synthetic request is consumed, never a body/token.
 return ((authOutput?.stdout??'')+'\n'+(authOutput?.stderr??'')).split('\n').some(line=>{
  try{const v=JSON.parse(line);return v.request_id===requestId&&v.msg==='request completed';}catch{return false;}
 });
}
async function until(predicate,limit=15000){const end=Date.now()+limit;while(Date.now()<end){if(await predicate())return;await pause(100);}throw Error('local_wait_expired');}
const snapshotSql=`select json_build_object(
 'users',(select count(*) from auth.users),
 'sessions',(select count(*) from auth.sessions),
 'refresh_tokens',(select count(*) from auth.refresh_tokens),
 'users_hash',(select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(u)::text,chr(10) order by u.id),''),'UTF8')),'hex') from auth.users u),
 'sessions_hash',(select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(s)::text,chr(10) order by s.id),''),'UTF8')),'hex') from auth.sessions s),
 'refresh_hash',(select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,chr(10) order by t.id),''),'UTF8')),'hex') from auth.refresh_tokens t),
 'sequences',(select coalesce(jsonb_agg(jsonb_build_array(sequencename,last_value) order by sequencename),'[]'::jsonb) from pg_sequences where schemaname='auth')
);`;
const waitingSql=`select count(*) from pg_stat_activity a where a.usename='supabase_auth_admin' and a.wait_event_type='Lock' and exists(select 1 from pg_locks l join pg_class c on c.oid=l.relation join pg_namespace n on n.oid=c.relnamespace where l.pid=a.pid and not l.granted and n.nspname='auth');`;
try{
 check(process.argv.length===2&&process.platform==='win32'&&!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT);
 const context=JSON.parse(docker(['context','inspect']).stdout);check(context.length===1&&context[0].Endpoints?.docker?.Host===endpoint);
 for(const image of[pgImage,authImage])check(JSON.parse(docker(['image','inspect',image]).stdout)[0].Os==='linux');
 stage='fresh_synthetic_database';
 names.push(db);
 const bootstrap='set -eu; initdb -D /var/lib/postgresql/data --username=supabase_admin --auth-local=trust --auth-host=reject --no-locale; { printf "%s\\n" "host postgres supabase_auth_admin 127.0.0.1/32 scram-sha-256"; cat /var/lib/postgresql/data/pg_hba.conf; } > /tmp/hba; mv /tmp/hba /var/lib/postgresql/data/pg_hba.conf; exec postgres -D /var/lib/postgresql/data -c shared_preload_libraries= -c listen_addresses=127.0.0.1 -c unix_socket_directories=/var/run/postgresql -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_min_messages=panic';
 docker(['run','--detach','--pull','never','--name',db,'--network','none','--log-driver','none','--read-only','--user','postgres','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','1024m','--memory-swap','1024m','--pids-limit','128',
 '--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=536870912,uid=100,gid=101,mode=0700','--tmpfs','/var/run/postgresql:rw,nosuid,nodev,size=16777216,uid=100,gid=101,mode=0700','--tmpfs','/tmp:rw,noexec,nosuid,size=16777216,uid=100,gid=101,mode=0700','--entrypoint','sh',pgImage,'-c',bootstrap]);
 await until(()=>docker(['exec',db,'pg_isready','-h','/var/run/postgresql','-U','supabase_admin'],undefined,true).status===0);
 const state=isolation(db,'none');
 sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create role supabase_auth_admin login nosuperuser nocreatedb createrole noinherit;
 create role postgres login nosuperuser nocreatedb createrole inherit;
 create schema auth authorization supabase_auth_admin;
 set password_encryption='scram-sha-256';alter role supabase_auth_admin password '${dbPassword}';
 alter role supabase_auth_admin set search_path=auth,public;
 grant pg_signal_backend,pg_monitor to postgres;
 alter role postgres set statement_timeout='2min';
 `);
 // Source postgres has pg_signal_backend and is NOSUPER. Reproduce those
 // capabilities only in this fresh fixture; never signal real connections.
 stage='fresh_real_auth';
 names.push(auth);
 docker(['run','--detach','--pull','never','--name',auth,'--network',`container:${state.Id}`,'--log-driver','none','--read-only','--user','65534:65534','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--memory-swap','256m','--pids-limit','64',
 '--tmpfs','/run/probe:rw,noexec,nosuid,size=1048576,mode=0700,uid=65534,gid=65534','--entrypoint','sh',authImage,'-c','while [ ! -f /run/probe/config ]; do sleep 1; done; . /run/probe/config; exec auth']);
 isolation(auth,`container:${state.Id}`);
 authOutput=worker(['attach','--no-stdin','--sig-proxy=false',auth]);
 const env={GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${dbPassword}@127.0.0.1:5432/postgres?sslmode=disable&application_name=stage04_freeze_auth`,GOTRUE_DB_DRIVER:'postgres',GOTRUE_API_HOST:'127.0.0.1',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1:9999',GOTRUE_SITE_URL:'http://127.0.0.1',GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_LOG_LEVEL:'info',REQUEST_ID_HEADER:'X-Request-ID'};
 docker(['exec','-i',auth,'sh','-c','umask 077; cat > /run/probe/config.tmp && mv /run/probe/config.tmp /run/probe/config'],Object.entries(env).map(([k,v])=>`export ${k}='${v}'`).join('\n')+'\n');
 await until(()=>{const r=http('/health');return r.status===200&&r.value?.version==='v2.197.0';},45000);
 const service=jwt();const created=http('/admin/users','POST',{email,password,email_confirm:true},service);check(created.status===200&&created.value?.id);
 const login=http('/token?grant_type=password','POST',{email,password});check(login.status===200&&login.value?.refresh_token);
 // Only fixture grants for the SHARE-lock rights already checked at source.
 sql('grant usage on schema auth to postgres; grant select,update on all tables in schema auth to postgres;');
 check(sql("select current_user='postgres' and not rolsuper and pg_has_role(current_user,'pg_signal_backend','USAGE') from pg_roles where rolname=current_user;",'postgres')==='t');
 const runtime=JSON.parse(sql("select json_agg(tablename order by tablename) from pg_tables where schemaname='auth' and tablename<>'schema_migrations';"));
 check(Array.isArray(runtime)&&runtime.length===26&&runtime.every(n=>/^[a-z_]+$/.test(n)));
 stage='hold_all_auth_runtime_share_locks';
 locker=worker(['exec','-i',db,'psql','-X','--no-password','-qAt','-v','ON_ERROR_STOP=1','-h','/var/run/postgresql','-U','postgres','-d','postgres']);
 locker.p.stdin.write(`begin; lock table ${runtime.map(n=>`auth."${n}"`).join(',')} in share mode;\n\\echo AUTH_LOCKS_HELD\n`);
 await until(()=>locker.stdout.includes('AUTH_LOCKS_HELD'));
 const baseline=sql(snapshotSql);
 stage='http_requests_blocked_by_share_locks';
 const refreshRequestId=randomUUID(),createRequestId=randomUUID();
 const refresh=asyncHttp('/token?grant_type=refresh_token',{refresh_token:login.value.refresh_token},undefined,refreshRequestId);
 const create=asyncHttp('/admin/users',{email:`queued-${id}@auth.gestor-barberia.invalid`,password,email_confirm:true},service,createRequestId);
 await until(()=>Number(sql(waitingSql,'postgres'))>=2);
 const blockedPids=JSON.parse(sql("select json_agg(pid order by pid) from pg_stat_activity where usename='supabase_auth_admin' and application_name='stage04_freeze_auth' and wait_event_type='Lock';",'postgres'));
 check(Array.isArray(blockedPids)&&blockedPids.length===2&&blockedPids.every(n=>Number.isSafeInteger(n)&&n>0));
 check(!refresh.finished&&!create.finished&&sql(snapshotSql)===baseline);
 const timedOut=await Promise.all([refresh.done,create.done]);
 check(timedOut.every(r=>r.code===28&&!parseHttp(r).status));
 stage='explicit_request_backend_drain';
 // Timeout is not a drain gate. Terminate only the exact previously observed
 // synthetic request backends, if still present, using the NOSUPER operator.
 const signal=JSON.parse(sql(`select coalesce(json_agg(pg_terminate_backend(pid)), '[]'::json) from pg_stat_activity where pid in (${blockedPids.join(',')}) and usename='supabase_auth_admin' and application_name='stage04_freeze_auth' and pid<>pg_backend_pid();`,'postgres'));
 check(signal.every(v=>v===true));
 stage='drain_auth_request_handlers';
 await until(()=>handlerCompleted(refreshRequestId)&&handlerCompleted(createRequestId));
 stage='drain_auth_active_transactions';
 const activeAuthSql="select count(*) from pg_stat_activity where usename='supabase_auth_admin' and (state<>'idle' or xact_start is not null or wait_event_type='Lock');";
 await until(()=>Number(sql(activeAuthSql,'postgres'))===0);
 check(http('/health').status===200);
 stage='drain_auth_snapshot_integrity';
 check(Number(sql(waitingSql,'postgres'))===0&&sql(snapshotSql)===baseline);
 stage='release_after_drain_and_detect_late_writes';
 locker.p.stdin.end('rollback;\n');check((await locker.done).code===0);
 for(let i=0;i<5;i++){await pause(200);check(sql(snapshotSql)===baseline&&Number(sql(activeAuthSql,'postgres'))===0);}
 check(http('/health').status===200);
 // Service stays alive. This is one bounded observation with exclusive ingress,
 // not a universal guarantee against future requests or privileged operators.
 report={syntheticHttpFreezeDrill:true,authVersion:'v2.197.0',runtimeAuthTablesLocked:26,
 operatorSuperuser:false,operatorPgSignalBackend:true,operatorCapabilitiesMatchedToSource:true,
 refreshAndAdminCreateObservedWaiting:true,httpClientsTimedOut:true,
 explicitBackendDrainByOperator:true,requestHandlersCompletionObserved:true,authServiceAliveBeforeAndAfterUnlock:true,
 noAuthTransactionsOrLockWaitBeforeUnlock:true,userSessionRefreshSequenceSnapshotUnchanged:true,
 lateWriteAfterUnlockObserved:false,lateWriteObservationSeconds:1,
 requiresExclusiveIngressAndOperators:true,remoteEquivalenceVerified:false,
 fullSupabaseRecovery:false,RPO0:false,backupOrCredentialsRead:false};
}catch{failure=`Synthetic Auth freeze drill failed at ${stage}; raw diagnostics suppressed.`;}
finally{
 if(locker&&!locker.finished){try{locker.p.stdin.end('rollback;\n');}catch{ /* cleanup below */ }}
 for(const name of [...names].reverse()){
  docker(['rm','--force',name],undefined,true);
  const remaining=docker(['container','ls','--all','--filter',`name=^/${name}$`,'--format','{{.Names}}'],undefined,true);
  if(remaining.error||remaining.status!==0||remaining.stdout.trim())failure='Synthetic Auth freeze drill exact cleanup unconfirmed.';
 }
 for(const child of children)if(!child.finished)child.p.kill();
}
if(failure){console.error(failure);process.exitCode=1;}else console.log(JSON.stringify({...report,exactContainerCleanupVerified:true}));
