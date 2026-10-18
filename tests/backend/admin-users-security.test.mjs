import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import * as authContract from '../../supabase/functions/_shared/auth-contract.ts';

const actorId='10000000-0000-4000-8000-000000000001';
const employeeId='10000000-0000-4000-8000-000000000002';
const operationId='10000000-0000-4000-8000-000000000003';

async function fixture({aal='aal2', admission={allowed:true,operation_id:operationId}, gateError=false, gateThrows=false, authError=false, authThrows=false}={}) {
 const calls=[];
 const user={auth:{getUser:async()=>({data:{user:{id:actorId}}}),mfa:{getAuthenticatorAssuranceLevel:async(jwt)=>{
  assert.equal(jwt,'verified-test-token'); return {data:{currentLevel:aal}};
 }}}};
 const service={from:()=>{calls.push('read-profile');return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:employeeId,activo:true,rol:'admin',auth_user_id:actorId}})})})};},
  rpc:async(name)=>{calls.push(name);if(name==='admin_begin_operation') {if(gateThrows) throw Error('unavailable');return {data:admission,error:gateError?{code:'unavailable'}:null};}return {data:null,error:null};},
  auth:{admin:{updateUserById:async()=>{calls.push('auth-update');if(authThrows) throw Error('transport_failure');return {error:authError?{code:'provider_failure'}:null};}}}};
 let handler;
 const source=await readFile(new URL('../../supabase/functions/admin-users/index.ts',import.meta.url),'utf8');
 const executable=stripTypeScriptTypes(source).replace(/import \{ createClient \} from "npm:@supabase\/supabase-js@2";/,'').replace(/import \{[\s\S]*?\} from "\.\.\/_shared\/auth-contract\.ts";/,'');
 const deps={Deno:{env:{get:(name)=>name==='ALLOWED_ORIGIN'?'https://gns.example':'synthetic'},serve:(fn)=>{handler=fn;}},createClient:(_url,key)=>key==='synthetic'&&calls.includes('client')?service:(calls.push('client'),user),...authContract};
 new Function(...Object.keys(deps),executable)(...Object.values(deps));
 const response=await handler(new Request('https://edge.example/admin-users',{method:'POST',headers:{authorization:'Bearer verified-test-token','content-type':'application/json'},body:JSON.stringify({action:'reset_password',employeeId,password:'Synthetic-Password-123!'})}));
 return {response,calls};
}

test('admin AAL1 fails before quota and side effects, even without Origin',async()=>{
 const {response,calls}=await fixture({aal:'aal1'});
 assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'mfa_required'});
 assert.ok(!calls.includes('admin_begin_operation'));assert.ok(!calls.includes('auth-update'));
});
test('persistent admission denial returns 429 Retry-After and has no effects',async()=>{
 const {response,calls}=await fixture({admission:{allowed:false,error:'rate_limited',retry_after:45}});
 assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'45');
 assert.ok(!calls.includes('auth-update'));assert.ok(!calls.includes('admin_record_auth_operation'));
});
test('maintenance and quota backend outage fail closed before effects',async()=>{
 for(const options of [{admission:{allowed:false,error:'maintenance_active',retry_after:60}},{gateError:true},{gateThrows:true}]){
  const {response,calls}=await fixture(options);assert.equal(response.status,503);
  assert.ok(!calls.includes('auth-update'));assert.ok(!calls.includes('admin_record_auth_operation'));
 }
});
test('successful reset is admitted before audit/Auth and releases its lease',async()=>{
 const {response,calls}=await fixture();assert.equal(response.status,200);
 assert.ok(calls.indexOf('admin_begin_operation')<calls.indexOf('admin_record_auth_operation'));
 assert.ok(calls.indexOf('admin_record_auth_operation')<calls.indexOf('auth-update'));
 assert.equal(calls.at(-1),'admin_finish_operation');
});
test('Auth errors and transport ambiguity retain lease for explicit reconciliation',async()=>{
 for(const options of [{authError:true},{authThrows:true}]) {
  const {response,calls}=await fixture(options);assert.equal(response.status,409);
  assert.ok(calls.includes('auth-update'));assert.ok(!calls.includes('admin_finish_operation'));
 }
});
