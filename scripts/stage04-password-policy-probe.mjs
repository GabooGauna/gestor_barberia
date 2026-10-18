// Reproduce the admin-only password policy gap on disposable real GoTrue.
// A successful probe reproduces the gap; it DOES NOT mean the policy passes.
import { spawnSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

if (process.argv.length !== 2) throw Error('Arguments forbidden: synthetic local only');
const name=`password-probe-${randomBytes(6).toString('hex')}`;
const network=`${name}-network`;
const db=`${name}-db`;
const auth=`${name}-auth`;
const url='http://127.0.0.1:55426';
const initialPassword=`Synthetic!9Aa${randomBytes(20).toString('hex')}`;
const selfPassword=`SelfChange!9Aa${randomBytes(20).toString('hex')}`;
const adminPassword=`AdminReset!9Aa${randomBytes(20).toString('hex')}`;
const secret=randomBytes(48).toString('hex');
const began=Date.now();
const created=[];
let networkCreated=false;
let assertions=0;
function run(args,input,allowFailure=false){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});if(r.status!==0&&!allowFailure)throw Error(`Local Docker ${args[0]} failed (${r.status})`);return r;}
function check(ok,label){if(!ok)throw Error(label);assertions++;console.log(`PASS probe assertion: ${label}`);}
function data(result,label){if(result.error)throw Error(`${label} failed (${result.error.code??result.error.status??'error'})`);return result.data;}
function jwt(role){const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const payload=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return `${header}.${payload}.${createHmac('sha256',secret).update(`${header}.${payload}`).digest('base64url')}`;}
const anon=jwt('anon'),service=jwt('service_role');
const client=(key=anon)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(String(input).replace(`${url}/auth/v1`,url),init)}});
function sql(text){return run(['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],text).stdout.trim();}
async function waitForAuth(){for(let i=0;i<90;i++){try{const r=await fetch(url+'/health');if(r.ok)return;}catch{/* Local readiness only. */}await new Promise(r=>setTimeout(r,500));}throw Error('Local Auth readiness timeout');}
try {
 const local=/^(npipe:|unix:|tcp:\/\/(127\.0\.0\.1|localhost):)/;
 if(process.env.DOCKER_HOST&&!local.test(process.env.DOCKER_HOST))throw Error('Remote Docker forbidden');
 const context=JSON.parse(run(['context','inspect']).stdout)[0];if(!local.test(context.Endpoints?.docker?.Host??''))throw Error('Local Docker context required');
 run(['network','create',network]);networkCreated=true;
 created.push(db);run(['run','-d','--name',db,'--network',network,'-e',`POSTGRES_PASSWORD=${initialPassword}`,'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24']);
 for(let i=0;i<120;i++){if(run(['exec',db,'pg_isready','-h','127.0.0.1','-U','postgres'],undefined,true).status===0)break;await new Promise(r=>setTimeout(r,500));if(i===119)throw Error('Local PostgreSQL readiness timeout');}
 sql('create schema auth;alter role postgres set search_path=auth,public;');
 const env=[
  'GOTRUE_API_HOST=0.0.0.0','GOTRUE_API_PORT=9999',`API_EXTERNAL_URL=${url}`,'GOTRUE_DB_DRIVER=postgres',`GOTRUE_DB_DATABASE_URL=postgres://postgres:${initialPassword}@${db}:5432/postgres?sslmode=disable`,
  'GOTRUE_SITE_URL=http://127.0.0.1:4173',`GOTRUE_JWT_SECRET=${secret}`,'GOTRUE_JWT_EXP=300','GOTRUE_JWT_AUD=authenticated','GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated','GOTRUE_JWT_ADMIN_ROLES=service_role',
  'GOTRUE_DISABLE_SIGNUP=true','GOTRUE_EXTERNAL_EMAIL_ENABLED=true','GOTRUE_MAILER_AUTOCONFIRM=true','GOTRUE_PASSWORD_MIN_LENGTH=12'
 ];
 created.push(auth);run(['run','-d','--name',auth,'--network',network,'-p','127.0.0.1:55426:9999',...env.flatMap(v=>['-e',v]),'ghcr.io/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b']);
 await waitForAuth();
 for(const container of created){const ports=JSON.parse(run(['inspect',container]).stdout)[0].NetworkSettings.Ports;check(Object.values(ports).flatMap(v=>v??[]).every(v=>v.HostIp==='127.0.0.1'||v.HostIp==='::1'),`${container===db?'Database has no public ports':'Auth binds only loopback'}`);}
 const adminApi=client(service);const employee=client();const email='employee.probe@auth.gestor-barberia.invalid';
 const original=data(await adminApi.auth.admin.createUser({email,password:initialPassword,email_confirm:true}),'Create synthetic employee').user;
 // Minimal identity fixture solely establishes employee classification. No Auth
 // policy reads this table; no business/RLS/migration suite is rerun here.
 sql(`create table public.password_probe_employee(id uuid primary key default gen_random_uuid(),auth_user_id uuid not null unique references auth.users(id),rol text not null check(rol='empleado'));insert into public.password_probe_employee(auth_user_id,rol)values('${original.id}','empleado');`);
 const before=sql('select id::text||auth_user_id::text||rol from public.password_probe_employee;');
 const session=data(await employee.auth.signInWithPassword({email,password:initialPassword}),'Fresh employee login').session;
 const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
 check(claims.role==='authenticated'&&claims.exp*1000>Date.now()+30000,'Fresh employee JWT has ordinary authenticated role and valid lifetime');
 const updated=await employee.auth.updateUser({password:selfPassword});
 check(!updated.error&&updated.data.user.id===original.id,'Direct authenticated self-update is ACCEPTED by current Auth');
 check(data(await client().auth.signInWithPassword({email,password:selfPassword}),'Login self-established password').user.id===original.id,'Self-established password works');
 check(Boolean((await client().auth.signInWithPassword({email,password:initialPassword})).error),'Previous password stops working after self-update');
 console.log('POLICY FAIL: employee changed their own password through direct Auth API without administrative authorization');
 const reset=data(await adminApi.auth.admin.updateUserById(original.id,{password:adminPassword}),'Administrative reset').user;
 check(reset.id===original.id,'Administrative reset retains Auth UUID');
 check(data(await client().auth.signInWithPassword({email,password:adminPassword}),'Login admin-established password').user.id===original.id,'Admin-established password works after reset');
 check(Boolean((await client().auth.signInWithPassword({email,password:selfPassword})).error),'Self-established password stops working after administrative reset');
 check(sql('select id::text||auth_user_id::text||rol from public.password_probe_employee;')===before,'Administrative reset preserves synthetic employee UUID and identity link');
 console.log(`REPRODUCED POLICY GAP: ${assertions} probe assertions, ${((Date.now()-began)/1000).toFixed(3)}s. Exit zero means reproduction succeeded; admin-only password policy FAILS.`);
} finally {
 let cleaned=true;for(const container of created.reverse())if(run(['rm','-fv',container],undefined,true).status!==0)cleaned=false;
 if(networkCreated&&run(['network','rm',network],undefined,true).status!==0)cleaned=false;
 if(!cleaned)throw Error(`Synthetic cleanup incomplete for ${name}`);
 console.log('Local password probe containers, volumes and network removed');
}
