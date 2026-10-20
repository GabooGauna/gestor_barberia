// Explicit Windows execution adapters. Importing this file does not start any
// process, read a credential/artifact, connect, change configuration or expand.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { FreezeProtocol, runtimeInventorySql } from './stage04-cutover-freeze.mjs';
import { CutoverSupervision } from './stage04-cutover-supervision.mjs';
import { approvedExpandSha256, expandedCatalogSql, acceptExpandedCatalog } from './stage04-expand-verification.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const endpoint='npipe:////./pipe/dockerDesktopLinuxEngine';
// Use the already inspected bundled PS7 executable, never Windows PS5 through
// PATH: inherited PSModulePath can make its Security/Get-Acl unavailable.
export const runtimePowerShell=join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','native','powershell','pwsh.exe');
const sha=value=>createHash('sha256').update(value).digest('hex');
const id=value=>{if(typeof value!=='string'||!/^[0-9a-f]{32}$/.test(value))throw Error('runtime_identity_rejected');return value;};
const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const psArgs=(file,args)=>['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',join(here,file),...args];
// Source catalog observed read-only by the orchestrator on 2026-10-18.
export const observedAuthRuntimeTables=Object.freeze(['audit_log_entries','custom_oauth_providers','flow_state','identities','instances',
  'mfa_amr_claims','mfa_challenges','mfa_factors','mfa_recovery_code_sets','mfa_recovery_codes','oauth_authorizations','oauth_client_states',
  'oauth_clients','oauth_consents','one_time_tokens','refresh_tokens','saml_providers','saml_relay_states','scim_tokens','scim_users',
  'sessions','sso_domains','sso_providers','users','webauthn_challenges','webauthn_credentials']);
export function buildAuthRuntimeEmptySql(expectedNames){
  if(!Array.isArray(expectedNames)||expectedNames.length!==26||new Set(expectedNames).size!==26||
    expectedNames.some(name=>typeof name!=='string'||!/^[a-z_]+$/.test(name)||name==='schema_migrations'))throw Error('runtime_auth_table_inventory_rejected');
  const names=[...expectedNames].sort();
  return `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout='15s';
SELECT json_build_object('table_names',(SELECT json_agg(tablename ORDER BY tablename COLLATE "C") FROM pg_tables WHERE schemaname='auth' AND tablename<>'schema_migrations'),
'counts',(SELECT json_agg(json_build_object('table',name,'count',row_count) ORDER BY name COLLATE "C") FROM (
${names.map(name=>`SELECT ${literal(name)}::text AS name,count(*)::text AS row_count FROM auth."${name}"`).join('\nUNION ALL\n')}
) runtime_counts)); ROLLBACK;`;
}
export function acceptAuthRuntimeEmpty(value,expectedNames){
  // Validate inventory independently from the payload: no boolean-only proof.
  buildAuthRuntimeEmptySql(expectedNames);
  const names=[...expectedNames].sort();
  return value&&Array.isArray(value.table_names)&&JSON.stringify(value.table_names)===JSON.stringify(names)&&
    Array.isArray(value.counts)&&value.counts.length===26&&
    value.counts.every((entry,index)=>entry?.table===names[index]&&entry.count==='0');
}
function docker(args,optional=false){
  const r=spawnSync('docker',['--host',endpoint,...args],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:65536});
  if(!optional&&(r.error||r.status!==0))throw Error('runtime_local_docker_failed');return r;
}
const absent=name=>{const r=docker(['container','ls','--all','--filter',`name=^/${name}$`,'--format','{{.Names}}'],true);return !r.error&&r.status===0&&!r.stdout.trim();};
function requireLocalWindows(){
  if(process.platform!=='win32'||process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('runtime_local_windows_required');
  const context=JSON.parse(docker(['context','inspect']).stdout);
  if(context.length!==1||context[0].Endpoints?.docker?.Host!==endpoint)throw Error('runtime_local_context_required');
}
export const workerContainers=(runId,worker)=>{
  id(runId);
  if(worker==='capture')return [`stage04-readbackup-${runId}-db`,`stage04-readbackup-${runId}-roles`];
  if(worker==='restore')return [`stage04-auth-restored-${runId}`,`stage04-isolated-restore-${runId}`];
  throw Error('runtime_worker_rejected');
};
async function stopOwnedTree(entry){
  if(!entry.exited){
    // Parent-only kill is insufficient: cancel the known process tree first,
    // then separately remove and verify daemon-owned Docker resources.
    spawnSync('taskkill.exe',['/PID',String(entry.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:15000});
    await Promise.race([entry.exit,sleep(5000)]);
  }
  if(!entry.exited)throw Error('runtime_process_tree_exit_unconfirmed');
}
async function cleanupLocalWorker(entry){
  await stopOwnedTree(entry);
  for(const name of workerContainers(entry.runId,entry.worker))docker(['rm','--force',name],true);
  const job=await boundedProcess('stage04-cutover-runtime.ps1',['-Mode','InspectJob','-RunId',entry.runId,'-Worker',entry.worker]);
  const resources=[{ownerRunId:entry.runId,id:job.jobName,absent:entry.exited&&job.activeProcesses===0},
    ...workerContainers(entry.runId,entry.worker).map(name=>({ownerRunId:entry.runId,id:name,absent:absent(name)}))];
  return {runId:entry.runId,worker:entry.worker,confirmed:resources.every(r=>r.absent),resources};
}
function processEntry(file,args,{input,maximum=2097152}={}){
  const child=spawn(runtimePowerShell,psArgs(file,args),{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const entry={child,exited:false,output:'',truncated:false};
  // close follows stdout/stderr EOF; exit alone may precede final evidence.
  entry.exit=new Promise(resolve=>{child.once('close',code=>{entry.exited=true;entry.code=code;resolve();});child.once('error',()=>{entry.exited=true;entry.code=-1;resolve();});});
  child.stdout.on('data',chunk=>{if(entry.output.length+chunk.length<=maximum)entry.output+=chunk.toString('utf8');else entry.truncated=true;chunk.fill(0);});
  child.stderr.on('data',chunk=>chunk.fill(0));child.stdin.on('error',()=>{});
  if(input!==undefined)child.stdin.end(input);else child.stdin.end();
  return entry;
}
async function boundedProcess(file,args,{input,timeout=45000}={}){
  const entry=processEntry(file,args,{input});let timer;
  try{
    await Promise.race([entry.exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('runtime_helper_timeout')),timeout);})]);
    if(entry.code!==0||entry.truncated)throw Error('runtime_helper_failed');return JSON.parse(entry.output.trim());
  }finally{clearTimeout(timer);if(!entry.exited)await stopOwnedTree(entry);}
}

class TlsSession{
  constructor(runId,kind){
    this.runId=id(runId);this.kind=kind;this.name=`stage04-tls-${kind}-${runId}`;this.pending=null;this.dead=false;this.output='';
    this.child=spawn(runtimePowerShell,psArgs('stage04-cutover-runtime.ps1',['-Mode','Session','-RunId',runId,'-SessionKind',kind]),{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.exit=new Promise(resolve=>{const ended=()=>{this.dead=true;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('runtime_tls_session_closed'));this.pending=null;}resolve();};this.child.once('exit',ended);this.child.once('error',ended);});
    this.child.stdin.on('error',()=>{});this.child.stderr.on('data',chunk=>chunk.fill(0));
    this.child.stdout.on('data',chunk=>{
      this.output+=chunk.toString('utf8');chunk.fill(0);
      if(this.output.length>4194304){this.child.kill();return;}
      let newline;while((newline=this.output.indexOf('\n'))>=0){const line=this.output.slice(0,newline).trim();this.output=this.output.slice(newline+1);if(!line)continue;
        let message;try{message=JSON.parse(line);}catch{this.child.kill();continue;}
        if(message.kind==='transport_started')continue;
        if(message.kind==='adapter_error'&&typeof message.stage==='string'&&/^[a-z_]+$/.test(message.stage)){
          if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(Error(`runtime_tls_${message.stage}`));}
          this.child.kill();continue;
        }
        if(this.pending&&message.id===this.pending.id&&message.ok===true){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.resolve(message.text);}
        else {this.child.kill();}
      }
    });
  }
  alive(){return !this.dead&&this.child.exitCode===null;}
  request(operation,bytes){
    if(!this.alive()||this.pending)return Promise.reject(Error('runtime_tls_session_unavailable'));
    return new Promise((resolve,reject)=>{const requestId=randomBytes(12).toString('hex');const timer=setTimeout(()=>{this.pending=null;this.child.kill();reject(Error('runtime_tls_query_timeout'));},50000);
      this.pending={id:requestId,resolve,reject,timer};this.child.stdin.write(JSON.stringify({id:requestId,operation,...(bytes?{sqlBase64:Buffer.from(bytes).toString('base64')}:{})})+'\n');});
  }
  query(bytes){return this.request('query',bytes);}
  async close(){
    if(this.alive())this.child.stdin.end();
    await Promise.race([this.exit,sleep(1500)]);
    if(this.alive())await stopOwnedTree({child:this.child,get exited(){return !this.child||this.child.exitCode!==null;},exit:this.exit});
    docker(['rm','--force',this.name],true);
    if(!absent(this.name))throw Error('runtime_tls_container_cleanup_unconfirmed');
  }
}

// Separate read-only integration gate; never constructs a freeze protocol,
// accepts ingress attestations, reads business rows or delivers expand bytes.
export async function probeTlsReadOnly(){
  requireLocalWindows();
  const session=new TlsSession(randomBytes(16).toString('hex'),'observer');
  try{
    const actor=JSON.parse(await session.query("SELECT json_build_object('actor',current_user,'database',current_database(),'probe',1);"));
    if(actor.actor!=='postgres'||actor.database!=='postgres'||actor.probe!==1)throw Error('runtime_tls_handshake_actor_failed');
    return {kind:'stage04.runtime.readonly_probe.v1',actorVerified:true,databaseVerified:true,tlsMode:'verify-full',
      pinnedCaVerified:true,remoteWrite:false,freezeStarted:false,productionAdapterReady:false};
  }finally{await session.close();}
}

// Trusted caller supplies reviewed, static inspection SQL. This is not an
// untrusted SQL sandbox. PostgreSQL defaults every transaction to READ ONLY;
// observer files may own BEGIN READ ONLY/ROLLBACK without affecting a holder.
// No FreezeProtocol, ingress attestation, credential output or migration here.
export async function withStage04ReadOnlySession(callback){
  if(typeof callback!=='function')throw Error('runtime_readonly_callback_required');
  requireLocalWindows();
  const session=new TlsSession(randomBytes(16).toString('hex'),'observer');
  try{
    await session.query('SET default_transaction_read_only=on;');
    const actor=JSON.parse(await session.query("SELECT json_build_object('actor',current_user,'database',current_database(),'read_only',current_setting('transaction_read_only'));"));
    if(actor.actor!=='postgres'||actor.database!=='postgres'||actor.read_only!=='on')throw Error('runtime_readonly_actor_rejected');
    return await callback(Object.freeze({query:async sqlBytes=>{
      if(typeof sqlBytes!=='string'&&!Buffer.isBuffer(sqlBytes))throw Error('runtime_readonly_sql_required');
      const result=await session.query(sqlBytes);
      if((await session.query("SELECT current_setting('default_transaction_read_only');"))!=='on')throw Error('runtime_readonly_default_changed');
      return result;
    }}));
  }finally{await session.close();}
}
export const runReadonlyInspection=sqlBytes=>withStage04ReadOnlySession(session=>session.query(sqlBytes));

export function acceptAtomicCutoverPrestate(p){
  return p?.actor==='postgres'&&p.database==='postgres'&&p.pin_column_present===true&&p.security_operations_absent===true&&
    p.active_profiles===2&&p.linked_active_profiles===2&&p.active_admin_profiles===1&&p.auth_users===2&&p.verified_totp_factors===0;
}
// Dedicated reviewed operation, never a general SQL writer. No automatic retry.
export async function runApprovedAtomicCutover({authorized=false,expectedCompositeSha256}={}){
  const approved='20af70c475f2bf7799ce51567ca4809397d26e6565c4b3d30c772654949599bf';
  if(authorized!==true||expectedCompositeSha256!==approved)throw Error('atomic_runtime_explicit_approval_hash_required');
  const atomic=await import('./stage04-atomic-cutover.mjs');
  const plan=atomic.inspectAtomicCutover();
  if(plan.compositeSha256!==approved||plan.originalBytesReconstructed!==true)throw Error('atomic_runtime_reviewed_plan_changed');
  requireLocalWindows();
  const session=new TlsSession(randomBytes(16).toString('hex'),'holder');
  try{
    const before=JSON.parse(await session.query(`BEGIN TRANSACTION READ ONLY;
SELECT json_build_object('actor',current_user,'database',current_database(),
 'pin_column_present',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empleados'::regclass AND attname='pin' AND NOT attisdropped),
 'security_operations_absent',to_regclass('private.security_operations') IS NULL,
 'active_profiles',(SELECT count(*) FROM public.empleados WHERE activo),
 'linked_active_profiles',(SELECT count(*) FROM public.empleados WHERE activo AND auth_user_id IS NOT NULL),
 'active_admin_profiles',(SELECT count(*) FROM public.empleados WHERE activo AND rol='admin'),
 'auth_users',(SELECT count(*) FROM auth.users),
 'verified_totp_factors',(SELECT count(*) FROM auth.mfa_factors WHERE factor_type='totp' AND status='verified'));ROLLBACK;`));
    if(!acceptAtomicCutoverPrestate(before))throw Error('atomic_runtime_source_prestate_rejected');
    return await atomic.executeAtomicCutover({Action:'Apply',session,authorized:true,
      observeCommitted:async sql=>JSON.parse(await runReadonlyInspection(sql))});
  }finally{await session.close();}
}

// Independent, explicitly authorized routine-color delivery AFTER Auth acceptance.
// Pinned original SQL only; never discovers or applies other pending migrations.
export const approvedRoutineColorSha256='243940a950e51280b6a892df39f2ccbea67e9bbbfe04de27b338a0d963462b60';
export function inspectRoutineColor(){
  const bytes=readFileSync(join(here,'..','supabase','migrations','20261016000000_add_rutinas_color.sql'));
  if(sha(bytes)!==approvedRoutineColorSha256)throw Error('routine_color_source_changed');
  return {bytes,sha256:approvedRoutineColorSha256};
}
export function acceptRoutineColorPrestate(p){
  return p?.maintenance===true&&p.in_flight===0&&p.color_absent===true&&p.pin_absent===true&&p.forced_rls_tables===6;
}
export async function runApprovedRoutineColor({authorized=false,authAccepted=false,expectedSha256}={}){
  if(authorized!==true||authAccepted!==true||expectedSha256!==approvedRoutineColorSha256)throw Error('routine_color_explicit_approval_required');
  const plan=inspectRoutineColor();
  requireLocalWindows();
  const session=new TlsSession(randomBytes(16).toString('hex'),'holder');
  const integritySql=readFileSync(join(here,'..','supabase','inspections','stage04-cutover-integrity.sql'));
  const stateSql=`BEGIN TRANSACTION READ ONLY;
SELECT json_build_object('maintenance',(SELECT maintenance FROM private.security_operations WHERE singleton),
'in_flight',(SELECT count(*) FROM private.admin_operation_admissions WHERE finished_at IS NULL),
'color_absent',NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.rutinas'::regclass AND attname='color' AND NOT attisdropped),
'pin_absent',NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empleados'::regclass AND attname='pin' AND NOT attisdropped),
'forced_rls_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('empleados','rutinas','tareas_rutina','empleado_rutinas','auditoria_diaria','tareas_urgentes') AND c.relrowsecurity AND c.relforcerowsecurity));ROLLBACK;`;
  try{
    const state=JSON.parse(await session.query(stateSql));
    if(!acceptRoutineColorPrestate(state))throw Error('routine_color_prestate_rejected');
    const before=JSON.parse(await session.query(integritySql));
    if(before.actor!=='postgres'||before.database!=='postgres'||before.color_present!==false||before.unexpected_active_writers!==0||before.unexpected_open_transactions!==0)throw Error('routine_color_source_busy');
    // Bound DDL waits without changing the pinned original migration.
    await session.query("SET lock_timeout='5s';SET statement_timeout='30s';");
    // No retry on missing ACK. Maintenance stays closed for reconciliation.
    await session.query(plan.bytes);
    const after=JSON.parse(await session.query(integritySql));
    if(after.color_present!==true||JSON.stringify(before.business)!==JSON.stringify(after.business))throw Error('routine_color_post_integrity_rejected');
    const proof=JSON.parse(await session.query(`BEGIN TRANSACTION READ ONLY;
SELECT json_build_object('all_default',(SELECT count(*)=count(*) FILTER(WHERE color='copper') FROM public.rutinas),
'not_null',(SELECT attnotnull FROM pg_attribute WHERE attrelid='public.rutinas'::regclass AND attname='color' AND NOT attisdropped),
'palette_constraint',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.rutinas'::regclass AND conname='rutinas_color_palette_check' AND contype='c' AND convalidated));ROLLBACK;`));
    if(proof.all_default!==true||proof.not_null!==true||proof.palette_constraint!==true)throw Error('routine_color_metadata_rejected');
    const closed=JSON.parse(await session.query(stateSql));
    if(closed.maintenance!==true||closed.in_flight!==0||closed.color_absent!==false||closed.pin_absent!==true||closed.forced_rls_tables!==6)throw Error('routine_color_containment_rejected');
    return {migration:'20261016000000_add_rutinas_color.sql',sha256:plan.sha256,commitAcknowledged:true,legacyIntegrityUnchanged:true,metadataVerified:true,maintenance:true,otherMigrationsApplied:false};
  }finally{await session.close();}
}

// Call only after human authorization and reviewed source/control-plane gates.
// This factory prepares execution; .run() is the ONLY migration entry point.
export async function prepareCutoverRuntime({expandPath,expectedExpandSha256=approvedExpandSha256,attestations,
  expectedControlFingerprint,expectedAuthRuntimeTables=observedAuthRuntimeTables,checkpointTimeoutMs=45000,verifyRestoredAuth=false}){
  for(const key of ['authAdmissionControlsVerified','controlledCutoverResidualRiskAccepted','privilegedWritersStopped','exclusiveSqlDdlSequenceOperator','managedMetadataDriftAbortAccepted']){
    if(attestations?.[key]!==true)throw Error(`runtime_attestation_required_${key}`);
  }
  requireLocalWindows();
  if(expectedExpandSha256!==approvedExpandSha256||!hash(expectedControlFingerprint))throw Error('runtime_reviewed_inputs_required');
  const expandBytes=readFileSync(expandPath);if(sha(expandBytes)!==expectedExpandSha256)throw Error('runtime_expand_hash_changed');
  // Read before any network session; observer transaction must remain separate.
  const driftSql=readFileSync(join(here,'../supabase/inspections/stage04-cutover-drift.sql'));
  const authEmptySql=buildAuthRuntimeEmptySql(expectedAuthRuntimeTables);
  if(JSON.stringify([...expectedAuthRuntimeTables].sort())!==JSON.stringify(observedAuthRuntimeTables))throw Error('runtime_unreviewed_auth_inventory');
  let supervisor;const workers=new Map(),sessions=new Set();
  const session=async(kind='observer')=>{
    const s=new TlsSession(randomBytes(16).toString('hex'),kind);sessions.add(s);
    try{const actor=JSON.parse(await s.query("SELECT json_build_object('actor',current_user,'database',current_database(),'probe',1);"));
      if(actor.actor!=='postgres'||actor.database!=='postgres'||actor.probe!==1)throw Error('runtime_tls_handshake_actor_failed');return s;}
    catch(error){await s.close();sessions.delete(s);throw error;}
  };
  const fresh=async fn=>{const s=await session();try{return await fn(s);}finally{await s.close();sessions.delete(s);}};
  const assertAuthRuntimeEmpty=()=>fresh(async s=>{
    const proof=JSON.parse(await s.query(authEmptySql));
    if(!acceptAuthRuntimeEmpty(proof,expectedAuthRuntimeTables))throw Error('runtime_auth_not_empty_or_inventory_changed');
    return true;
  });
  let originalSequenceNames;
  const observe=()=>fresh(async s=>{
    await assertAuthRuntimeEmpty();
    const data=JSON.parse(await s.query(driftSql));
    const sequenceName=s=>`${s.schemaname}.${s.sequencename}`;
    if(!originalSequenceNames)originalSequenceNames=new Set(data.sequence_observations.map(sequenceName));
    // Schema fingerprint detects additions BEFORE expand. After expand the
    // original sequences must remain unchanged; new sequences are explicitly
    // exposed to the exact post-expand catalog verifier, never hidden from it.
    const originalSequences=data.sequence_observations.filter(s=>originalSequenceNames.has(sequenceName(s)));
    if(originalSequences.length!==originalSequenceNames.size)throw Error('runtime_original_sequence_missing');
    const unknown=await s.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND application_name NOT LIKE 'stage04_%' AND query ~* '(^|[;[:space:]])(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|nextval|setval)([[:space:](]|$)');`);
    return {schemaFingerprint:data.catalog_sha256,managedFingerprint:data.managed_sha256,
      sequenceFingerprint:sha(JSON.stringify([originalSequences,data.auth_refresh_sequence])),unknownPrivilegedWriter:unknown==='t',catalogObservation:data};
  });
  const freshControlObservation=async()=>{
    const data=await boundedProcess('stage04-observe-control-plane.ps1',[],{timeout:40000});
    if(data.ProjectRef!=='ucmwykzrepmjucssjnum'||data.RemoteModified!==false)throw Error('runtime_control_observation_rejected');
    const fields=['ProjectStateSha256','AuthConfigSha256','FunctionsSha256','EdgeSecretNamesSha256','EdgeSecretMetadataSha256'];
    if(fields.some(k=>!hash(data[k])))throw Error('runtime_control_hashes_rejected');
    // This is also called AFTER expand ACK and AFTER management observations.
    // An unexpected Auth writer at that point must require reconciliation,
    // never grant permission to bootstrap the initial administrator.
    await assertAuthRuntimeEmpty();
    return {fingerprint:sha(JSON.stringify(fields.map(k=>data[k])))};
  };
  const holder=await session('holder');
  try{
    const inventory=JSON.parse(await holder.query(runtimeInventorySql));
    const verifyExpandedCatalog=()=>fresh(async s=>acceptExpandedCatalog(JSON.parse(await s.query(expandedCatalogSql))));
    const protocol=new FreezeProtocol({session:holder,expandBytes,tables:inventory.tables,observe,verifyExpandedCatalog,attestations});
    async function captureBackends(runId,tuples=[],terminate=false){
      return fresh(async s=>{
        const application=`stage04_capture_${id(runId)}`;
        const current=JSON.parse(await s.query(`SELECT coalesce(json_agg(json_build_object('pid',pid,'backend_start',backend_start::text)),'[]'::json) FROM pg_stat_activity WHERE application_name=${literal(application)} AND usename=current_user;`));
        const found=[...tuples];
        for(const tuple of current){if(!Number.isSafeInteger(tuple.pid)||typeof tuple.backend_start!=='string')throw Error('runtime_backend_identity_rejected');if(!found.some(t=>t.pid===tuple.pid&&t.backend_start===tuple.backend_start))found.push(tuple);}
        if(!terminate)return found;
        for(const tuple of found)await s.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=${literal(application)} AND usename=current_user AND pid=${tuple.pid} AND backend_start=${literal(tuple.backend_start)}::timestamptz;`);
        for(let i=0;i<20;i++){
          await s.query('SELECT pg_stat_clear_snapshot();');
          if((await s.query(`SELECT count(*) FROM pg_stat_activity WHERE application_name=${literal(application)} AND usename=current_user;`))==='0')return true;
          await sleep(50);
        }
        return false;
      });
    }
    async function cleanupWorker(entry){
      if(entry.cleanup)return entry.cleanup;
      entry.cleanup=(async()=>{
        // Observe tuples while readers are still live; re-observe after parent
        // termination before canceling any backend. PID reuse cannot widen it.
        let tuples=[],backendObservationFailed=false;
        try{if(entry.worker==='capture')tuples=await captureBackends(entry.runId);}catch{backendObservationFailed=true;}
        // A source TLS failure must not prevent local worker cancellation.
        const local=await cleanupLocalWorker(entry);const resources=local.resources;
        if(backendObservationFailed)throw Error('runtime_source_backend_cleanup_unconfirmed');
        if(entry.worker==='capture')resources.push({ownerRunId:entry.runId,id:`source-backends-stage04_capture_${entry.runId}`,absent:await captureBackends(entry.runId,tuples,true)});
        return {runId:entry.runId,worker:entry.worker,confirmed:resources.every(r=>r.absent),resources};
      })();return entry.cleanup;
    }
    async function runWorker(worker,args,signal){
      const runId=supervisor.runId;id(runId);
      const entry=Object.assign(processEntry('stage04-cutover-runtime.ps1',['-Mode','Worker','-RunId',runId,'-Worker',worker,...args],{maximum:65536}),{runId,worker});
      workers.set(worker,entry);
      const abort=()=>{void cleanupWorker(entry).catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted)abort();
      try{await entry.exit;if(signal.aborted||entry.code!==0||entry.truncated)throw Error('runtime_worker_failed');}
      finally{signal.removeEventListener('abort',abort);await cleanupWorker(entry);}
    }
    supervisor=new CutoverSupervision({protocol,expectedControlFingerprint,freshControlObservation,checkpointTimeoutMs,
      capture:async({runId,snapshot,signal})=>{
        await runWorker('capture',['-ExportedSnapshot',snapshot],signal);
        return boundedProcess('stage04-cutover-runtime.ps1',['-Mode','CaptureEvidence','-RunId',runId,'-BackupId',runId]);
      },
      verifyRestore:async(artifact,{runId,backupId,signal})=>{
        if(artifact.backupId!==backupId||backupId!==runId)throw Error('runtime_restore_binding_rejected');
        const metadata=await fresh(async s=>JSON.parse(await s.request('database_metadata')));
        const observation={format_version:1,backup_id:backupId,project_ref:'ucmwykzrepmjucssjnum',observed_at_utc:new Date().toISOString(),database_metadata:metadata,same_snapshot_as_database:false};
        const saved=await boundedProcess('stage04-cutover-runtime.ps1',['-Mode','StoreMetadataComparison','-RunId',runId,'-BackupId',backupId],{input:JSON.stringify(observation)+'\n'});
        if(!hash(saved.sha256)||signal.aborted)throw Error('runtime_metadata_comparison_not_admitted');
        const args=['-BackupId',backupId,'-ObservationSha256',saved.sha256];
        if(verifyRestoredAuth)args.push('-VerifyRestoredAuth');
        await runWorker('restore',args,signal);
        return boundedProcess('stage04-cutover-runtime.ps1',['-Mode','RestoreEvidence','-RunId',runId,'-BackupId',backupId]);
      },
      confirmCleanup:async({runId,worker})=>{
        const entry=workers.get(worker);if(!entry||entry.runId!==runId)throw Error('runtime_cleanup_ledger_missing');return cleanupWorker(entry);
      },
    });
    return {supervisor,protocol,runId:supervisor.runId,remoteAdapterReady:false,ControlledCutoverResidualRiskAccepted:true,RpoZeroVerified:false,
      run:async()=>{try{return await supervisor.run();}finally{for(const entry of workers.values())await cleanupWorker(entry);await holder.close();sessions.delete(holder);}},
      close:async()=>{for(const entry of workers.values())await cleanupWorker(entry);for(const s of sessions)await s.close();sessions.clear();},
    };
  }catch(error){await holder.close();sessions.delete(holder);throw error;}
}

// Authorized focal adapter test ONLY, called explicitly after review. Reads the
// existing encrypted backup via the approved restorer; never captures/connects
// source, rewrites its manifest, invokes Auth or constructs a freeze protocol.
export async function probeRestoreCancellation({backupId='ab70bce0fa53469f8f8659c4564970ba',
  observationSha256='2d75f900f2cbc2b17df687729f9606e104095c5b9b5dd30fb86f30ecade514d6'}={}){
  requireLocalWindows();
  if(backupId!=='ab70bce0fa53469f8f8659c4564970ba'||observationSha256!=='2d75f900f2cbc2b17df687729f9606e104095c5b9b5dd30fb86f30ecade514d6')throw Error('runtime_restore_probe_scope_rejected');
  const runId=randomBytes(16).toString('hex');
  const entry=Object.assign(processEntry('stage04-cutover-runtime.ps1',['-Mode','Worker','-Worker','restore','-RunId',runId,'-BackupId',backupId,
    '-ObservationSha256',observationSha256],{maximum:65536}),{runId,worker:'restore'});
  const restoreName=workerContainers(runId,'restore')[1];let proof;
  try{
    const started=Date.now();let runningAtAbort=false;
    while(Date.now()-started<90000&&!entry.exited){
      const check=docker(['inspect','--format','{{json .State.Running}}',restoreName],true);
      if(check.status===0&&check.stdout.trim()==='true'&&!entry.exited&&entry.child.exitCode===null){runningAtAbort=true;break;}
      await sleep(50);
    }
    if(!runningAtAbort)throw Error('runtime_restore_cancellation_probe_inconclusive_worker_not_running');
    proof=await cleanupLocalWorker(entry);
    if(!proof.confirmed)throw Error('runtime_restore_cancellation_cleanup_unconfirmed');
    return {case:'existing_backup_restore_worker_cancellation',runId,backupId,
      parentAndRestoreContainerRunningAtAbort:true,jobEmptyAndParentExitVerified:true,allOwnedContainersAbsent:true,
      sharedProductionCleanupUsed:true,sourceConnected:false,authProbeInvoked:false,existingManifestModified:false,
      noNewCapture:true,restoreCompletionClaimed:false,productionAdapterReady:false};
  }finally{if(!proof?.confirmed){const cleanup=await cleanupLocalWorker(entry);if(!cleanup.confirmed)throw Error('runtime_restore_probe_cleanup_unconfirmed');}}
}

// New focal only: two harmless PowerShell processes, no credential/artifact,
// Docker, database or network. Reproduces the JobObject cancellation primitive.
export async function windowsJobLossProbe(){
  if(process.platform!=='win32')throw Error('windows_job_probe_requires_windows');
  const runId=randomBytes(16).toString('hex');
  const entry=processEntry('stage04-cutover-runtime.ps1',['-Mode','JobProbe','-RunId',runId]);
  try{
    const started=Date.now();while(!entry.output.includes('\n')){
      if(entry.exited||Date.now()-started>20000)throw Error('job_probe_start_failed');await sleep(25);
    }
    const proof=JSON.parse(entry.output.trim().split('\n')[0]);
    if(proof.kind!=='synthetic_job_started'||proof.childInJob!==true||proof.activeProcesses<2)throw Error('job_probe_membership_failed');
    // Intentionally kill only the parent: the JOB, not taskkill /T, owns child
    // cancellation in this proof. Docker still needs independent cleanup.
    entry.child.kill();await Promise.race([entry.exit,sleep(5000)]);
    const remaining=await boundedProcess('stage04-cutover-runtime.ps1',['-Mode','InspectJob','-RunId',runId]);
    if(!entry.exited||remaining.activeProcesses!==0)throw Error('job_probe_cleanup_unconfirmed');
    return {case:'windows_job_parent_loss',runId,parentAndChildAssigned:true,parentKilled:true,namedJobActiveProcesses:0,
      parentExitObserved:true,childMembershipVerified:true,credentialsRead:false,remoteOperations:false,productionAdapterReady:false};
  }finally{if(!entry.exited)await stopOwnedTree(entry);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===3&&process.argv[2]==='--job-loss-probe'){
    windowsJobLossProbe().then(value=>console.log(JSON.stringify(value))).catch(()=>{console.error('Windows JobObject probe failed; raw diagnostics suppressed.');process.exitCode=1;});
  }else{console.error('No cutover CLI is enabled. Only --job-loss-probe is accepted.');process.exitCode=1;}
}
