// Default Inspect is local/static only. Apply requires an explicitly supplied
// persistent SQL session and authorization; there is no remote CLI adapter.
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {composeExpand} from './stage04-cutover-freeze.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const cutoverSha256='dc022fe321d954b0ca656cf3cf9708d7a15207ba6af17f7f97d740dd4b861a87';
export const securitySha256='ae06841c3730e6007ea1084c95410b444814772255a7b95b4f325ac8230c1c52';
const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url));
const prelude=Buffer.from("\nSET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s';\nLOCK TABLE public.auditoria_diaria,public.empleado_rutinas,public.empleados,public.rutinas,public.tareas_rutina,public.tareas_urgentes IN ACCESS EXCLUSIVE MODE;\n");
export function composeAtomicCutover(cutover,security){
 if(!Buffer.isBuffer(cutover)||!Buffer.isBuffer(security)||sha(cutover)!==cutoverSha256||sha(security)!==securitySha256)throw Error('atomic_original_hash_mismatch');
 // Existing scanner verifies exactly one file-level BEGIN/COMMIT and ignores
 // PL/pgSQL BEGIN/END in dollar bodies. Regex is used ONLY at verified edges.
 const c=composeExpand(cutover),s=composeExpand(security);
 const cutText=new TextDecoder('utf-8',{fatal:true}).decode(cutover);
 const terminal=cutText.match(/\bcommit;(?=\s*$)/i);
 const secBeginText=new TextDecoder('utf-8',{fatal:true}).decode(s.beginBytes);
 const initial=secBeginText.match(/\bbegin;$/i);
 if(!terminal||!initial)throw Error('atomic_verified_boundary_missing');
 const commitStart=Buffer.byteLength(cutText.slice(0,terminal.index));
 const commitEnd=commitStart+Buffer.byteLength(terminal[0]);
 const beginStart=Buffer.byteLength(secBeginText.slice(0,initial.index));
 const beginEnd=beginStart+Buffer.byteLength(initial[0]);
 const body=cutover.subarray(c.beginBytes.length,commitStart),trailing=cutover.subarray(commitEnd);
 const removedCommit=cutover.subarray(commitStart,commitEnd),secPreamble=security.subarray(0,beginStart),removedBegin=security.subarray(beginStart,beginEnd),secBody=security.subarray(beginEnd);
 if(!Buffer.concat([c.beginBytes,body,removedCommit,trailing]).equals(cutover)||!Buffer.concat([secPreamble,removedBegin,secBody]).equals(security))throw Error('atomic_reconstruction_failed');
 const bytes=Buffer.concat([c.beginBytes,prelude,body,trailing,secPreamble,secBody]);
 composeExpand(bytes); // Composite itself has ONE outer transaction.
 return {bytes,cutoverSha256,securitySha256,compositeSha256:sha(bytes),removedFileBoundaryStatements:2,originalBytesReconstructed:true};
}
export function inspectAtomicCutover(){
 const p=composeAtomicCutover(migration('20261016020000_auth_rls_cutover.sql'),migration('20261017000000_security_operations.sql'));
 return {Action:'Inspect',cutoverSha256:p.cutoverSha256,securitySha256:p.securitySha256,compositeSha256:p.compositeSha256,
  removedFileBoundaryStatements:p.removedFileBoundaryStatements,originalBytesReconstructed:p.originalBytesReconstructed,remoteOperations:false,sqlSubmitted:false};
}
export const atomicPostProofSql=`BEGIN TRANSACTION READ ONLY;
WITH business AS(SELECT c.oid,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('empleados','rutinas','tareas_rutina','empleado_rutinas','auditoria_diaria','tareas_urgentes') AND c.relkind='r')
SELECT json_build_object('kind','stage04.atomic_cutover_security.v1',
 'rls_forced_six',(SELECT count(*)=6 AND bool_and(relrowsecurity AND relforcerowsecurity) FROM business),
 'anonymous_table_grants',(SELECT count(*) FROM business WHERE has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
 'anonymous_column_grants',(SELECT count(*) FROM business b JOIN pg_attribute a ON a.attrelid=b.oid WHERE a.attnum>0 AND NOT a.attisdropped AND has_column_privilege('anon',b.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')),
 'pin_column_absent',NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empleados'::regclass AND attname='pin' AND NOT attisdropped),
 'maintenance_closed',(SELECT count(*)=1 AND bool_and(maintenance) FROM private.security_operations WHERE singleton),
 'business_access_closed',NOT private.business_access_open(),
 'in_flight',(SELECT count(*) FROM private.admin_operation_admissions WHERE finished_at IS NULL));ROLLBACK;`;
export function acceptAtomicPostProof(p){
 return p?.kind==='stage04.atomic_cutover_security.v1'&&['rls_forced_six','pin_column_absent','maintenance_closed','business_access_closed'].every(k=>p[k]===true)&&
  p.anonymous_table_grants===0&&p.anonymous_column_grants===0&&p.in_flight===0;
}
export async function executeAtomicCutover({Action='Inspect',session,authorized=false,observeCommitted}={}){
 const plan=composeAtomicCutover(migration('20261016020000_auth_rls_cutover.sql'),migration('20261017000000_security_operations.sql'));
 if(Action==='Inspect')return inspectAtomicCutover();
 if(Action!=='Apply'||authorized!==true||!session?.alive?.()||typeof session.query!=='function'||typeof session.close!=='function'||typeof observeCommitted!=='function')throw Error('atomic_explicit_authorized_session_required');
 let acknowledged=false;
 try{
  await session.query(plan.bytes);acknowledged=true;
  // Must be a separate fresh observer, never a callback that returns true.
  const proof=await observeCommitted(atomicPostProofSql);
  if(!acceptAtomicPostProof(proof))throw Error('atomic_postcommit_proof_incomplete');
  return {state:'atomic_cutover_security_committed_maintenance_closed',commitAcknowledged:true,postProofAccepted:true,
   compositeSha256:plan.compositeSha256,OriginalCutoverSha256:cutoverSha256,OriginalSecuritySha256:securitySha256,
   AutomaticRetryAllowed:false,MaintenanceOpened:false,RpoZeroVerified:false};
 }catch{
  try{await session.close();}catch{}
  return {state:acknowledged?'atomic_committed_reconciliation_required':'atomic_outcome_unknown_reconciliation_required',commitAcknowledged:acknowledged,
   AutomaticRetryAllowed:false,MaintenanceOpened:false,RpoZeroVerified:false};
 }
}

export async function syntheticAtomicDrill(){
 const endpoint='npipe:////./pipe/dockerDesktopLinuxEngine';
 const image='postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
 if(process.platform!=='win32'||process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('atomic_synthetic_local_context_required');
 const docker=(args,input,optional=false)=>{const r=spawnSync('docker',['--host',endpoint,...args],{input,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:2097152});if(!optional&&(r.error||r.status!==0))throw Error('atomic_synthetic_operation_failed');return r;};
 const context=JSON.parse(docker(['context','inspect']).stdout);if(context.length!==1||context[0].Endpoints?.docker?.Host!==endpoint)throw Error('atomic_synthetic_context_rejected');
 const name='stage04-atomic-'+randomBytes(16).toString('hex');let cleanup=false;const checks=[];
 const sql=(text,optional=false)=>docker(['exec','-i',name,'psql','-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d','postgres'],text,optional);
 const check=(value,label)=>{if(!value)throw Error('atomic_synthetic_check_failed_'+label);checks.push(label);};
 try{
  const plan=composeAtomicCutover(migration('20261016020000_auth_rls_cutover.sql'),migration('20261017000000_security_operations.sql'));
  check(plan.originalBytesReconstructed&&plan.removedFileBoundaryStatements===2,'original_bytes_boundaries_reconstructed');
  docker(['run','--detach','--rm','--pull','never','--name',name,'--network','none','--log-driver','none','--read-only','--user','postgres','--cap-drop','ALL','--security-opt','no-new-privileges',
   '--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=192m,uid=70,gid=70,mode=0700','--tmpfs','/var/run/postgresql:rw,noexec,nosuid,size=8m,uid=70,gid=70,mode=0755','--tmpfs','/tmp:rw,noexec,nosuid,size=8m,mode=1777',
   '--memory','256m','--memory-swap','256m','--pids-limit','96','--env','POSTGRES_HOST_AUTH_METHOD=trust',image]);
  let ready=false;for(let i=0;i<60;i++){if(docker(['exec',name,'pg_isready','-U','postgres'],undefined,true).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}check(ready,'local_postgres_ready');
  const state=JSON.parse(docker(['inspect','--format','{{json .}}',name]).stdout);
  check(state.HostConfig.NetworkMode==='none'&&state.HostConfig.LogConfig.Type==='none'&&state.HostConfig.ReadonlyRootfs&&!(state.HostConfig.Binds??[]).length&&!Object.keys(state.HostConfig.PortBindings??{}).length&&state.HostConfig.Memory===state.HostConfig.MemorySwap,'local_isolation');
  sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULL::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{}'::jsonb$$;GRANT USAGE ON SCHEMA auth TO authenticated;`);
  sql(readFileSync(new URL('../supabase/tests/00_legacy_schema.sql',import.meta.url)));
  sql(migration('20261016010000_auth_profiles_expand.sql'));
  sql(`INSERT INTO public.empleados(id,nombre,pin,rol) VALUES('01000000-0000-4000-8000-000000000001','Synthetic admin','fixture-a','admin'),('01000000-0000-4000-8000-000000000002','Synthetic employee','fixture-b','empleado');
INSERT INTO auth.users VALUES('02000000-0000-4000-8000-000000000001','admin.fixture@auth.gestor-barberia.invalid'),('02000000-0000-4000-8000-000000000002','employee.fixture@auth.gestor-barberia.invalid');
SELECT private.bootstrap_first_admin('01000000-0000-4000-8000-000000000001','02000000-0000-4000-8000-000000000001','admin.fixture');
SELECT public.admin_link_auth_account('02000000-0000-4000-8000-000000000001','01000000-0000-4000-8000-000000000002','02000000-0000-4000-8000-000000000002','employee.fixture');`);
  const split=composeExpand(plan.bytes);const final=split.continuationBytes.toString().match(/\bcommit;(?=\s*$)/i);if(!final)throw Error('atomic_failure_injection_boundary_missing');
  const at=split.beginBytes.length+Buffer.byteLength(split.continuationBytes.toString().slice(0,final.index));
  const failed=Buffer.concat([plan.bytes.subarray(0,at),Buffer.from("SELECT 1/0;\n"),plan.bytes.subarray(at)]);
  check(sql(failed,true).status!==0,'failure_in_final_security_segment_rejected');
  const rolled=JSON.parse(sql(`SELECT json_build_object('pin_present',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empleados'::regclass AND attname='pin' AND NOT attisdropped),'security_absent',to_regclass('private.security_operations') IS NULL,'rls_still_off',NOT EXISTS(SELECT 1 FROM pg_class WHERE oid IN('public.empleados'::regclass,'public.rutinas'::regclass,'public.tareas_rutina'::regclass,'public.empleado_rutinas'::regclass,'public.auditoria_diaria'::regclass,'public.tareas_urgentes'::regclass) AND relrowsecurity),'legacy_grants_still_closed',NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))));`).stdout);
  check(rolled.pin_present===true&&rolled.security_absent===true&&rolled.rls_still_off===true&&rolled.legacy_grants_still_closed===true,'both_segments_rolled_back_pin_preserved_grants_closed');
  sql(plan.bytes);
  check(acceptAtomicPostProof(JSON.parse(sql(atomicPostProofSql).stdout)),'positive_rls_force_six_anon_zero_pin_absent_maintenance_closed_inflight_zero');
  check(!acceptAtomicPostProof(true),'bare_boolean_postproof_rejected');
  return {case:'atomic_cutover_security_composition',checks,checksPassed:checks.length,compositeSha256:plan.compositeSha256,existingBackupsOrCredentialsRead:false,
   remoteOperations:false,goTrueUsed:false,PriorApprovedSuitesRepeated:false,exactContainerCleanupVerified:true,MaintenanceOpened:false,RpoZeroVerified:false};
 }finally{
  docker(['rm','--force',name],undefined,true);const r=docker(['container','ls','--all','--filter',`name=^/${name}$`,'--format','{{.Names}}'],undefined,true);
  cleanup=!r.error&&r.status===0&&!r.stdout.trim();if(!cleanup)throw Error('atomic_synthetic_cleanup_unconfirmed');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.length===2||process.argv.length===3&&process.argv[2]==='--inspect')console.log(JSON.stringify(inspectAtomicCutover()));
 else if(process.argv.length===3&&process.argv[2]==='--synthetic-drill')console.log(JSON.stringify(await syntheticAtomicDrill()));else throw Error('atomic_cli_arguments_rejected');}
 catch{console.error('Atomic cutover candidate failed; raw SQL/process diagnostics suppressed.');process.exitCode=1;}
}
