// Real GoTrue/PostgREST/Edge synthetic local drill; no configurable remote target.
import { spawnSync, spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { readFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

if (process.argv.length !== 2) throw Error('Arguments forbidden: synthetic local only');
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const id = `authsec-${randomBytes(5).toString('hex')}`;
const dir = join(root, '.tmp-stage4-local', id);
const network = `${id}-loopback`;
const results = [];
const began=Date.now();
let gateway;
const containers=[];
let networkCreated = false;
let db;
function run(command,args,input,allowFailure=false) {
  const r=spawnSync(command,args,{input,encoding:'utf8',timeout:240000,maxBuffer:16*1024*1024});
  if (r.status!==0 && !allowFailure) throw Error(`Local ${command.endsWith('supabase.exe')?'CLI':command} ${args[0]} failed (${r.status})`);
  return r;
}
function sql(text) {const r=run('docker',['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],text);return r.stdout.trim();}
function check(ok,message) {if(!ok)throw Error(message);results.push(message);console.log(`PASS ${message}`);}
function value(result,label) {if(result.error)throw Error(`${label} failed (${result.error.code??result.error.status??'error'})`);return result.data;}
function totp(secret) {
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');
 const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const digest=createHmac('sha1',key).update(counter).digest();const offset=digest[19]&15;return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
const url='http://127.0.0.1:55421';
const password=`Test!9Aa${randomBytes(20).toString('hex')}`;
const newPassword=`Recovery!9Aa${randomBytes(20).toString('hex')}`;
let anon,service;
const jwtSecret=randomBytes(48).toString('hex');
function jwt(role){const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const payload=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return `${header}.${payload}.${createHmac('sha256',jwtSecret).update(`${header}.${payload}`).digest('base64url')}`;}
async function ready(endpoint){for(let i=0;i<90;i++){try{const r=await fetch(endpoint);if(r.status<500)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Local service readiness timeout');}
function container(suffix,image,env=[],ports=[],mounts=[],command=[]){const name=`${id}-${suffix}`;containers.push(name);run('docker',['run','-d','--name',name,'--network',network,...env.flatMap(v=>['-e',v]),...ports.flatMap(v=>['-p',v]),...mounts.flatMap(v=>['-v',v]),image,...command]);return name;}
async function writerDrain(adminApi) {
 const writer=spawn('docker',['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']});
 const completed=new Promise((r,j)=>{writer.once('error',j);writer.once('exit',code=>code===0?r():j(Error('Synthetic writer failed')));});
 const admitted=new Promise((r,j)=>{let out='';writer.stdout.on('data',chunk=>{out+=chunk.toString();if(out.includes('WRITER_LOCKED'))r();});writer.once('exit',()=>{if(!out.includes('WRITER_LOCKED'))j(Error('Writer did not acquire maintenance share lock'));});});
 writer.stdin.end("begin;insert into public.rutinas(titulo)values('Synthetic rolled-back writer');\n\\echo WRITER_LOCKED\nselect pg_sleep(3);rollback;\n");
 await admitted;const since=Date.now();value(await adminApi.rpc('set_security_maintenance',{p_enabled:true}),'Close while SQL writer in-flight');const closeDuration=Date.now()-since;await completed;
 check(closeDuration>=2000,'Maintenance close waits for in-flight SQL writer transaction to finish');
 value(await adminApi.rpc('set_security_maintenance',{p_enabled:false}),'Reopen after writer drain');
}
const client=(key=anon)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
async function edge(token,body) {return fetch(`${url}/functions/v1/admin-users`,{method:'POST',headers:{apikey:anon,authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});}
async function enroll(c,negative=false) {
 const factor=value(await c.auth.mfa.enroll({factorType:'totp',friendlyName:randomUUID()}),'TOTP enroll');
 if(negative){const challenge=value(await c.auth.mfa.challenge({factorId:factor.id}),'TOTP bad challenge');const code=totp(factor.totp.secret);const bad=code==='000000'?'111111':'000000';check(Boolean((await c.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:bad})).error),'MFA invalid challenge rejected');}
 const verified=value(await c.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}),'TOTP verify');
 check(verified.access_token && value(await c.auth.mfa.getAuthenticatorAssuranceLevel(),'AAL').currentLevel==='aal2','MFA valid challenge reaches AAL2');return {factor,session:verified};
}
try {
 const localEndpoint=/^(npipe:|unix:|tcp:\/\/(127\.0\.0\.1|localhost):)/;
 if(process.env.DOCKER_HOST&&!localEndpoint.test(process.env.DOCKER_HOST))throw Error('Remote Docker endpoint forbidden');
 const context=JSON.parse(run('docker',['context','inspect']).stdout)[0];if(!localEndpoint.test(context.Endpoints?.docker?.Host??''))throw Error('Local Docker context required');
 mkdirSync(dir,{recursive:true});
 run('docker',['network','create','--opt','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',network]);networkCreated=true;
 console.log('Starting isolated real Auth/PostgREST/Edge services with explicit loopback bindings...');
 anon=jwt('anon');service=jwt('service_role');
 db=container('db','postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',['POSTGRES_PASSWORD='+password]);
 for(let i=0;i<120;i++){if(run('docker',['exec',db,'pg_isready','-h','127.0.0.1','-U','postgres'],undefined,true).status===0)break;await new Promise(r=>setTimeout(r,500));if(i===119)throw Error('Postgres TCP readiness timeout');}
 sql('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;alter role postgres set search_path=auth,public;grant usage on schema public,auth to anon,authenticated,service_role;alter default privileges in schema public grant all on tables to service_role;alter default privileges in schema public grant all on sequences to service_role;');
 const dbUrl=`postgres://postgres:${password}@${db}:5432/postgres?sslmode=disable`;
 container('auth','ghcr.io/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',[
 'GOTRUE_API_HOST=0.0.0.0','GOTRUE_API_PORT=9999',`API_EXTERNAL_URL=${url}/auth/v1`,
 'GOTRUE_DB_DRIVER=postgres',`GOTRUE_DB_DATABASE_URL=${dbUrl}`,'GOTRUE_SITE_URL=http://127.0.0.1:4173',
 `GOTRUE_JWT_SECRET=${jwtSecret}`,'GOTRUE_JWT_EXP=60','GOTRUE_JWT_AUD=authenticated','GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated','GOTRUE_JWT_ADMIN_ROLES=service_role',
 'GOTRUE_DISABLE_SIGNUP=true','GOTRUE_EXTERNAL_EMAIL_ENABLED=true','GOTRUE_MAILER_AUTOCONFIRM=true','GOTRUE_MFA_TOTP_ENROLL_ENABLED=true','GOTRUE_MFA_TOTP_VERIFY_ENABLED=true','GOTRUE_PASSWORD_MIN_LENGTH=12','GOTRUE_RATE_LIMIT_EMAIL_SENT=2','GOTRUE_RATE_LIMIT_TOKEN_REFRESH=150'
 ],['127.0.0.1:55423:9999']);
 await ready('http://127.0.0.1:55423/health');
 sql(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
 container('rest','public.ecr.aws/supabase/postgrest:v16.4@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df',[`PGRST_DB_URI=${dbUrl}`,'PGRST_DB_SCHEMAS=public','PGRST_DB_ANON_ROLE=anon',`PGRST_JWT_SECRET=${jwtSecret}`],['127.0.0.1:55424:3000']);
 gateway=createServer((req,res)=>{const authRoute=req.url.startsWith('/auth/v1');const restRoute=req.url.startsWith('/rest/v1');const port=authRoute?55423:restRoute?55424:55425;const path=authRoute?req.url.slice(8):restRoute?req.url.slice(8):req.url;const outgoing=httpRequest({hostname:'127.0.0.1',port,path:path||'/',method:req.method,headers:req.headers},upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});outgoing.on('error',()=>{res.writeHead(503);res.end();});req.pipe(outgoing);});
 await new Promise((r,j)=>gateway.listen(55421,'127.0.0.1',r).on('error',j));
 const names=containers;
 for(const name of names){const inspected=JSON.parse(run('docker',['inspect',name]).stdout)[0];for(const bindings of Object.values(inspected.NetworkSettings.Ports??{}))for(const binding of bindings??[])if(binding.HostIp!=='127.0.0.1'&&binding.HostIp!=='::1')throw Error('Non-loopback port binding detected');}
 check(true,'All published stack ports bound to loopback');
 sql(readFileSync(join(root,'supabase/tests/00_legacy_schema.sql'),'utf8'));sql(readFileSync(join(root,'supabase/migrations/20261016010000_auth_profiles_expand.sql'),'utf8'));
 const adminApi=client(service);const adminUser=value(await adminApi.auth.admin.createUser({email:'admin.drill@auth.gestor-barberia.invalid',password,email_confirm:true}),'Create synthetic admin').user;
 const employeeUser=value(await adminApi.auth.admin.createUser({email:'employee.drill@auth.gestor-barberia.invalid',password,email_confirm:true}),'Create synthetic employee').user;
 const adminId=randomUUID(),employeeId=randomUUID(),routineId=randomUUID(),assignmentId=randomUUID();
 sql(`insert into public.empleados(id,nombre,rol) values('${adminId}','Synthetic Admin','admin'),('${employeeId}','Synthetic Employee','empleado');select private.bootstrap_first_admin('${adminId}','${adminUser.id}','admin.drill');select public.admin_link_auth_account('${adminUser.id}','${employeeId}','${employeeUser.id}','employee.drill');insert into public.rutinas(id,titulo) values('${routineId}','Synthetic');insert into public.empleado_rutinas(id,empleado_id,rutina_id) values('${assignmentId}','${employeeId}','${routineId}');`);
 sql(readFileSync(join(root,'supabase/migrations/20261016020000_auth_rls_cutover.sql'),'utf8'));sql(readFileSync(join(root,'supabase/migrations/20261017000000_security_operations.sql'),'utf8'));
 sql("notify pgrst, 'reload schema';");await new Promise(r=>setTimeout(r,500));
 value(await adminApi.rpc('set_security_maintenance',{p_enabled:false}),'Open synthetic maintenance');
 const before=sql(`select jsonb_build_object('employees',(select jsonb_agg(jsonb_build_array(id,auth_user_id,rol,activo) order by id) from public.empleados),'assignments',(select jsonb_agg(jsonb_build_array(id,empleado_id,rutina_id) order by id) from public.empleado_rutinas),'routines',(select jsonb_agg(id order by id) from public.rutinas));`);
 cpSync(join(root,'supabase/functions'),join(dir,'functions'),{recursive:true});
 container('edge','public.ecr.aws/supabase/edge-runtime:v1.77.4@sha256:ad45164b7548bf5820ed7be714789c17ac2865edce79a09cfb4c3756c3d365a8',[`SUPABASE_URL=http://host.docker.internal:55421`,`SUPABASE_ANON_KEY=${anon}`,`SUPABASE_SERVICE_ROLE_KEY=${service}`,'ALLOWED_ORIGIN=http://127.0.0.1:4173'],['127.0.0.1:55425:9000'],[`${join(dir,'functions')}:/home/deno/functions:ro`],['start','--main-service','/home/deno/functions/admin-users']);
 const edgePorts=JSON.parse(run('docker',['inspect',`${id}-edge`]).stdout)[0].NetworkSettings.Ports;check(Object.values(edgePorts).flatMap(p=>p??[]).every(p=>p.HostIp==='127.0.0.1'||p.HostIp==='::1'),'Real Edge runtime port bound to loopback');
 sql("notify pgrst, 'reload schema';");await ready(url+'/rest/v1/');
 const admin=client(),employee=client();const adminLogin=value(await admin.auth.signInWithPassword({email:'admin.drill@auth.gestor-barberia.invalid',password}),'Login synthetic admin');const employeeLogin=value(await employee.auth.signInWithPassword({email:'employee.drill@auth.gestor-barberia.invalid',password}),'Login synthetic employee');
 for(let i=0;i<40;i++){try{const r=await edge(adminLogin.session.access_token,{action:'change_role',employeeId,role:'empleado'});if(r.status!==503)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 const aal1=await admin.from('empleados').select('id');check(!aal1.error&&aal1.data.length===0,'Admin AAL1 cannot access business rows');
 check((await edge(adminLogin.session.access_token,{action:'change_role',employeeId,role:'empleado'})).status===403,'Admin AAL1 denied by real Edge');
 check((await employee.from('empleado_rutinas').select('id')).data?.length===1,'Employee AAL1 retains assigned routine access');
 const {factor,session}=await enroll(admin,true);
 check(Boolean((await admin.rpc('set_security_maintenance',{p_enabled:false})).error),'Authenticated admin cannot change maintenance through service-only RPC');
 check(Boolean((await employee.rpc('admin_begin_operation',{p_actor_auth_user_id:adminUser.id,p_action:'change_role',p_target_key:'a'.repeat(64)})).error),'Authenticated employee cannot spoof admin admission through service-only RPC');
 check((await admin.from('empleados').select('id')).data?.length===2,'Admin AAL2 has authorized RLS access');
 const operation={action:'change_role',employeeId,role:'empleado'};
 check((await edge(session.access_token,operation)).status===200,'Admin AAL2 real Edge mutation succeeds');
 value(await adminApi.rpc('set_security_maintenance',{p_enabled:true}),'Close synthetic maintenance');
 check((await edge(session.access_token,operation)).status===503,'Maintenance blocks Edge without Origin');
 const blocked=await adminApi.from('rutinas').insert({titulo:'Blocked'});check(Boolean(blocked.error),'Maintenance blocks privileged business writes');
 value(await adminApi.rpc('set_security_maintenance',{p_enabled:false}),'Reopen synthetic maintenance');
 sql('truncate private.admin_operation_admissions;');
 const concurrent=await Promise.all(Array.from({length:8},()=>edge(session.access_token,operation)));check(concurrent.filter(r=>r.status===200).length===3&&concurrent.filter(r=>r.status===429).length===5,'Persistent atomic burst allows 3 of 8 concurrent Edge requests');
 check(concurrent.filter(r=>r.status===429).every(r=>Number(r.headers.get('retry-after'))>0),'Rate limited responses include Retry-After');
 run('docker',['restart',`${id}-edge`]);await ready('http://127.0.0.1:55425/');
 check((await edge(session.access_token,operation)).status===429,'Quota persists across Edge runtime restart');
 sql('truncate private.admin_operation_admissions;');
 const admission=(action,key)=>adminApi.rpc('admin_begin_operation',{p_actor_auth_user_id:adminUser.id,p_action:action,p_target_key:key});
 for(let i=0;i<3;i++){const a=value(await admission('reset_password','a'.repeat(64)),'Target quota admission');if(!a.allowed)throw Error('Target quota premature denial');value(await adminApi.rpc('admin_finish_operation',{p_operation_id:a.operation_id}),'Finish synthetic admission');sql("update private.admin_operation_admissions set admitted_at=admitted_at-interval '11 seconds';");}
 const targetLimited=value(await admission('reset_password','a'.repeat(64)),'Target quota fourth request');check(!targetLimited.allowed&&targetLimited.error==='rate_limited'&&targetLimited.retry_after>800,'Persistent target quota enforces 3 resets per 15 minutes');
 sql(`update public.empleados set rol='admin' where id='${employeeId}';`);
 try {const other=value(await adminApi.rpc('admin_begin_operation',{p_actor_auth_user_id:employeeUser.id,p_action:'reset_password',p_target_key:'a'.repeat(64)}),'Cross actor target quota');check(!other.allowed&&other.error==='rate_limited','Target quota remains enforced across distinct authorized actors');}finally{sql(`update public.empleados set rol='empleado' where id='${employeeId}';`);}
 sql('truncate private.admin_operation_admissions;');
 for(let i=0;i<10;i++){const a=value(await admission('change_role','b'.repeat(64)),'Minute quota admission');if(!a.allowed)throw Error('Minute quota premature denial');value(await adminApi.rpc('admin_finish_operation',{p_operation_id:a.operation_id}),'Finish minute admission');sql("update private.admin_operation_admissions set admitted_at=clock_timestamp()-interval '11 seconds';");}
 const minuteLimited=value(await admission('change_role','b'.repeat(64)),'Minute quota eleventh request');check(!minuteLimited.allowed&&minuteLimited.error==='rate_limited'&&minuteLimited.retry_after>0,'Persistent actor quota enforces 10 operations per minute');
 sql('truncate private.admin_operation_admissions;');
 const lease=value(await admission('change_role','c'.repeat(64)),'Lease admission');
 const closed=value(await adminApi.rpc('set_security_maintenance',{p_enabled:true}),'Close with pending lease');check(closed.in_flight===1,'Maintenance reports pending admission without assuming timeout means completion');
 check(!value(await admission('change_role','d'.repeat(64)),'Admission during maintenance').allowed,'Maintenance refuses new server admissions');
 value(await adminApi.rpc('admin_finish_operation',{p_operation_id:lease.operation_id}),'Explicit lease reconciliation');check(value(await adminApi.rpc('set_security_maintenance',{p_enabled:true}),'Read reconciled drain').in_flight===0,'Explicit reconciliation reaches zero in-flight');
 value(await adminApi.rpc('set_security_maintenance',{p_enabled:false}),'Open after drain test');
 await writerDrain(adminApi);
 // Force shared counter outage, leaving RPC code untouched; no mutation can start.
 sql('alter table private.admin_operation_admissions rename to admin_operation_admissions_outage;');
 try{check((await edge(session.access_token,operation)).status===503,'Counter outage fails closed at real Edge');}finally{sql('alter table private.admin_operation_admissions_outage rename to admin_operation_admissions;');}
 value(await adminApi.rpc('set_security_maintenance',{p_enabled:true}),'Recovery maintenance');
 const fresh=value(await admin.auth.refreshSession(),'Refresh before emergency drill').session;
 const stolen=fresh.access_token,oldRefresh=fresh.refresh_token;
 value(await adminApi.auth.admin.updateUserById(adminUser.id,{password:newPassword}),'Emergency Admin API reset');
 const oldJwtAfterReset=!(await client().auth.getUser(stolen)).error;console.log(`OBSERVATION old access JWT accepted by Auth after password reset: ${oldJwtAfterReset}`);
 value(await adminApi.auth.admin.mfa.deleteFactor({userId:adminUser.id,id:factor.id}),'Emergency factor deletion');
 const signout=await adminApi.auth.admin.signOut(stolen,'global');
 if(signout.error){check(Boolean((await client().auth.refreshSession({refresh_token:oldRefresh})).error),'Auth reset already revoked session before explicit global signout');}else check(true,'Explicit emergency global signout succeeds');
 check(Boolean((await client().auth.refreshSession({refresh_token:oldRefresh})).error),'Emergency global signout revokes old refresh');
 check((await edge(stolen,operation)).status!==200,'Maintenance contains previously issued admin JWT during recovery');
 const oldRest=await fetch(url+'/rest/v1/empleados?select=id',{headers:{apikey:anon,authorization:`Bearer ${stolen}`}});check(oldRest.status!==200||(await oldRest.json()).length===0,'Maintenance denies business rows to previously issued AAL2 JWT');
 const recovered=client();value(await recovered.auth.signInWithPassword({email:'admin.drill@auth.gestor-barberia.invalid',password:newPassword}),'Recovered admin login');
 check(Boolean((await recovered.auth.mfa.challenge({factorId:factor.id})).error),'Deleted MFA factor cannot be challenged after emergency recovery');
 check(Boolean((await client().auth.signInWithPassword({email:'admin.drill@auth.gestor-barberia.invalid',password})).error),'Old admin password rejected after reset');
 await enroll(recovered);
 const oldExpiry=JSON.parse(Buffer.from(stolen.split('.')[1],'base64url').toString()).exp;
 console.log('Recovery remains in maintenance until old access JWT expires (local JWT lifetime 60s)...');
 while(Date.now()<oldExpiry*1000+1500)await new Promise(r=>setTimeout(r,Math.min(1000,oldExpiry*1000+1500-Date.now())));
 check(Boolean((await client().auth.getUser(stolen)).error),'Old admin access JWT rejected after measured expiration');
 let expiredRest;const verifierDeadline=Date.now()+90000;
 do {
  expiredRest=await fetch(url+'/rest/v1/empleados?select=id',{headers:{apikey:anon,authorization:`Bearer ${stolen}`}});
  if(expiredRest.status===401)break;
  if(expiredRest.status!==200||(await expiredRest.json()).length!==0)throw Error('Old JWT escaped maintenance containment');
  if(Date.now()>verifierDeadline)throw Error('JWT verifier expiration deadline exceeded; maintenance remains closed');
  await new Promise(r=>setTimeout(r,1000));
 } while(true);
 console.log(`OBSERVATION PostgREST rejects previous JWT ${Math.max(0,Math.floor(Date.now()/1000)-oldExpiry)}s after nominal expiry; maintenance stayed closed`);
 check(true,'PostgREST expiration verified before leaving recovery maintenance');
 // Newly issued recovery JWT may need refresh after waiting for the previous JWT.
 value(await recovered.auth.refreshSession(),'Refresh recovered AAL2 session');
 value(await adminApi.rpc('set_security_maintenance',{p_enabled:false}),'Recovery reopen');
 expiredRest=await fetch(url+'/rest/v1/empleados?select=id',{headers:{apikey:anon,authorization:`Bearer ${stolen}`}});check(expiredRest.status===401,'PostgREST rejects expired previous AAL2 JWT after maintenance reopens');
 check((await recovered.from('empleados').select('id')).data?.length===2,'Recovered sole admin regains AAL2 business access');
 sql('truncate private.admin_operation_admissions;');
 const recoveredSession=value(await recovered.auth.getSession(),'Recovered session').session;
 check((await edge(recoveredSession.access_token,operation)).status===200,'Recovered sole admin regains real Edge administrative operation');
 const after=sql(`select jsonb_build_object('employees',(select jsonb_agg(jsonb_build_array(id,auth_user_id,rol,activo) order by id) from public.empleados),'assignments',(select jsonb_agg(jsonb_build_array(id,empleado_id,rutina_id) order by id) from public.empleado_rutinas),'routines',(select jsonb_agg(id order by id) from public.rutinas));`);check(before===after,'Recovery preserves domain/Auth UUID and existing routine relationships');
 const wrong=await client().auth.signInWithPassword({email:'admin.drill@auth.gestor-barberia.invalid',password:'Wrong!9Aa-password'});const missing=await client().auth.signInWithPassword({email:'missing.drill@auth.gestor-barberia.invalid',password:'Wrong!9Aa-password'});check(wrong.error?.code===missing.error?.code&&wrong.error?.status===missing.error?.status,'Existing and missing login return same generic error code/status');
 check(Boolean((await client().auth.signUp({email:'signup.drill@auth.gestor-barberia.invalid',password})).error),'Public signup disabled in isolated Auth');
 const abuse=await Promise.all(Array.from({length:35},()=>client().auth.signInWithPassword({email:'missing.drill@auth.gestor-barberia.invalid',password:'Wrong!9Aa-password'})));console.log(`OBSERVATION direct GoTrue password-login probe: ${abuse.filter(r=>r.error?.status===429).length}/35 rate-limited; provider gateway Auth rate limiting remains unverified`);
 const inspection=join(root,'supabase/inspections/stage04-readonly-preflight.sql');
 try{sql(readFileSync(inspection,'utf8'));check(true,'Read-only candidate inspection SQL executes against isolated real Auth schema');}catch(error){if(error.code!=='ENOENT')throw error;}
 console.log(`PASS ${results.length} security assertions in ${((Date.now()-began)/1000).toFixed(3)}s. CAPTCHA not enabled; hosted JWT gateway/provider restore/RTO not tested.`);
} catch(error) {
 const auth=containers.find(n=>n.endsWith('-auth'));
 if(auth){const logs=run('docker',['logs',auth,'--tail','5'],undefined,true);const parsed=(logs.stdout+logs.stderr).split(/\r?\n/).flatMap(line=>{try{const e=JSON.parse(line);return e.error?[String(e.error)]:[];}catch{return [];}}).join(' ');if(parsed)console.log('Local Auth diagnostic: '+parsed.replaceAll(password,'[redacted]').replaceAll(jwtSecret,'[redacted]').replaceAll(anon??'___','[redacted]').replaceAll(service??'___','[redacted]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi,'[synthetic-identifier]'));}
 throw error;
} finally {
 if(gateway)await new Promise(r=>gateway.close(r));
 let cleanup=true;for(const name of containers.reverse())if(run('docker',['rm','-fv',name],undefined,true).status!==0)cleanup=false;
 if(networkCreated&&run('docker',['network','rm',network],undefined,true).status!==0)cleanup=false;
 rmSync(dir,{recursive:true,force:true});if(!cleanup)throw Error(`Local cleanup requires attention for project ${id}`);
 console.log('Local synthetic project and temporary files removed');
}
