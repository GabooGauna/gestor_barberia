// ONE real local loss/cancellation case. No remote URL, credential, existing
// backup, restore, migration delivery, PowerShell worker or production adapter.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { FreezeProtocol } from './stage04-cutover-freeze.mjs';
import { CutoverSupervision } from './stage04-cutover-supervision.mjs';

const endpoint='npipe:////./pipe/dockerDesktopLinuxEngine';
const serverImage='public.ecr.aws/supabase/postgres:17.11.0.004@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108';
const clientImage='postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=text=>createHash('sha256').update(text).digest('hex');
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
function docker(args,optional=false){
  const r=spawnSync('docker',['--host',endpoint,...args],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024,windowsHide:true,stdio:['ignore','pipe','pipe']});
  if(!optional&&(r.error||r.status!==0))throw Error('local_docker_operation_failed');
  return r;
}
async function bounded(promise,ms){let timer;try{return await Promise.race([promise.then(()=>true,()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),ms);})]);}finally{clearTimeout(timer);}}
class LocalSession{
  constructor(server,label){
    this.dead=false;this.pending=null;this.output='';
    this.child=spawn('docker',['--host',endpoint,'exec','-i','--user','postgres',server,'psql','-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-h','/var/run/postgresql','-U','postgres','-d','postgres'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child.stdout.on('data',chunk=>{this.output+=chunk.toString();if(this.pending&&this.output.includes(this.pending.marker)){const p=this.pending;this.pending=null;clearTimeout(p.timer);const at=this.output.indexOf(p.marker);const text=this.output.slice(0,at);this.output=this.output.slice(at+p.marker.length);p.resolve(text.trim());}});
    this.child.stderr.on('data',chunk=>chunk.fill(0));
    this.child.stdin.on('error',()=>{});
    const stopped=()=>{this.dead=true;if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(Error('local_sql_session_stopped'));}};
    this.child.on('exit',stopped);this.child.on('error',stopped);this.label=label;
  }
  alive(){return !this.dead&&this.child.exitCode===null;}
  async init(){await this.query(`SET application_name=${literal(this.label)};`);this.pid=Number(await this.query('SELECT pg_backend_pid();'));return this;}
  query(text){
    if(!this.alive()||this.pending)return Promise.reject(Error('local_sql_session_unavailable'));
    return new Promise((resolve,reject)=>{const marker=`loss_${randomBytes(12).toString('hex')}`;const timer=setTimeout(()=>{this.pending=null;reject(Error('local_sql_timeout'));},5000);this.pending={marker,timer,resolve,reject};this.child.stdin.write(Buffer.concat([Buffer.isBuffer(text)?text:Buffer.from(text),Buffer.from(`\n\\echo ${marker}\n`)]));});
  }
  async close(){
    if(this.alive()&&!this.pending){try{await this.query('ROLLBACK;');}catch{}}
    this.child.stdin.end();if(this.alive())await bounded(new Promise(resolve=>this.child.once('exit',resolve)),1000);
    if(this.alive())this.child.kill();
  }
}

export async function lossCleanupDrill(){
  if(process.platform!=='win32'||process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('local_windows_context_required');
  const context=JSON.parse(docker(['context','inspect']).stdout);
  if(context.length!==1||context[0].Endpoints?.docker?.Host!==endpoint)throw Error('local_context_required');
  const runId=randomBytes(16).toString('hex'),server=`stage04-loss-server-${runId}`,reader=`stage04-loss-reader-${runId}`;
  const application=`stage04_loss_reader_${runId}`,sessions=[];
  let holder,admin,blocker,protocol,readerChild,readerExit,readerExitObserved=false,readerBackend,readerCreated=false,cleanupPromise;
  let sourceCreated=false,sourceCleaned=false,continues=0,restores=0,holderTerminated=false,readerWasBlocked=false,plainBytes=0;
  const sql=async label=>{const s=new LocalSession(server,label);sessions.push(s);return s.init();};
  const containerAbsent=name=>{const r=docker(['container','ls','--all','--filter',`name=^/${name}$`,'--format','{{.Names}}'],true);return !r.error&&r.status===0&&!r.stdout.trim();};
  const backendWhere=()=>`pid=${readerBackend.pid} AND application_name=${literal(application)} AND backend_start=${literal(readerBackend.backend_start)}::timestamptz`;
  async function cleanupReader(){
    if(cleanupPromise)return cleanupPromise;
    cleanupPromise=(async()=>{
      // Killing a host CLI is not certified cleanup. Remove the EXACT owned
      // client container, then terminate only its RunId/PID/start-bound backend.
      if(readerCreated)docker(['rm','--force',reader],true);
      if(readerBackend&&admin?.alive())await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE ${backendWhere()};`);
      if(readerChild&&!readerExitObserved)readerChild.kill();
      if(readerExit)await bounded(readerExit,3000);
      if(readerBackend&&admin?.alive()){
        for(let i=0;i<30;i++){if(await admin.query(`SELECT count(*) FROM pg_stat_activity WHERE ${backendWhere()};`)==='0')break;await sleep(25);}
      }
    })();
    return cleanupPromise;
  }
  try{
    const shell='set -eu; initdb -D /var/lib/postgresql/data --username=postgres --auth-local=trust --auth-host=trust --no-locale >/dev/null 2>&1; exec postgres -D /var/lib/postgresql/data -c shared_preload_libraries= -c listen_addresses=127.0.0.1 -c unix_socket_directories=/var/run/postgresql -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_min_messages=panic';
    sourceCreated=true;
    docker(['run','--detach','--pull','never','--name',server,'--network','none','--log-driver','none','--read-only','--user','postgres','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--memory-swap','512m','--pids-limit','96',
      '--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,nodev,uid=100,gid=101,mode=0700','--tmpfs','/var/run/postgresql:rw,noexec,nosuid,nodev,uid=100,gid=101,mode=0755',
      '--tmpfs','/tmp:rw,noexec,nosuid,nodev,mode=1777','--entrypoint','sh',serverImage,'-c',shell]);
    let ready=false;for(let i=0;i<60;i++){if(docker(['exec',server,'pg_isready','-h','/var/run/postgresql','-U','postgres','-d','postgres'],true).status===0){ready=true;break;}await sleep(100);}
    if(!ready)throw Error('synthetic_postgres_not_ready');
    const serverState=JSON.parse(docker(['inspect','--format','{{json .}}',server]).stdout);
    if(serverState.HostConfig.NetworkMode!=='none'||serverState.HostConfig.LogConfig.Type!=='none'||!serverState.HostConfig.ReadonlyRootfs||
      (serverState.HostConfig.Binds??[]).length||Object.keys(serverState.HostConfig.PortBindings??{}).length||serverState.HostConfig.Memory!==serverState.HostConfig.MemorySwap)throw Error('synthetic_isolation_failed');
    admin=await sql(`stage04_loss_admin_${runId}`);blocker=await sql(`stage04_loss_blocker_${runId}`);holder=await sql(`stage04_loss_holder_${runId}`);
    await admin.query("CREATE TABLE public.business(id integer PRIMARY KEY,value text);INSERT INTO public.business VALUES(1,'synthetic');CREATE SCHEMA auth;CREATE TABLE auth.schema_migrations(version text);INSERT INTO auth.schema_migrations VALUES('synthetic');");
    const baseline=sha('synthetic_loss_metadata');
    protocol=new FreezeProtocol({session:holder,expandBytes:Buffer.from('BEGIN;\nSELECT 1;\nCOMMIT;\n'),tables:[{schema:'public',name:'business'}],
      observe:async()=>({schemaFingerprint:baseline,sequenceFingerprint:baseline,managedFingerprint:baseline,unknownPrivilegedWriter:false}),verifyExpandedCatalog:async()=>true,
      attestations:{authAdmissionControlsVerified:true,controlledCutoverResidualRiskAccepted:true,privilegedWritersStopped:true,exclusiveSqlDdlSequenceOperator:true,managedMetadataDriftAbortAccepted:true}});
    protocol.continueExpand=async()=>{continues++;throw Error('expansion_forbidden_in_loss_drill');};
    const supervisor=new CutoverSupervision({protocol,expectedControlFingerprint:baseline,checkpointIntervalMs:25,checkpointTimeoutMs:5000,captureTimeoutMs:15000,restoreTimeoutMs:1000,settlementTimeoutMs:10000,
      freshControlObservation:async()=>({fingerprint:baseline}),
      capture:async({runId:owner,snapshot,signal})=>{
        if(owner!==supervisor.runId)throw Error('synthetic_run_binding_failed');
        // Both identifiers are ledgers: supervisorRunId owns this fixtureRunId.
        const cancelled=()=>{void cleanupReader().catch(()=>{});};
        signal.addEventListener('abort',cancelled,{once:true});
        try{
          await blocker.query('BEGIN;LOCK TABLE auth.schema_migrations IN ACCESS EXCLUSIVE MODE;');
          readerCreated=true;
          docker(['create','--pull','never','--name',reader,'--network',`container:${serverState.Id}`,'--log-driver','none','--read-only','--user','postgres',
            '--cap-drop','ALL','--security-opt','no-new-privileges','--memory','128m','--memory-swap','128m','--pids-limit','32','--entrypoint','pg_dump',clientImage,
            '--format=custom','--no-password','--lock-wait-timeout=60s',`--snapshot=${snapshot}`,`--dbname=postgresql://postgres@127.0.0.1:5432/postgres?sslmode=disable&application_name=${application}`]);
          readerChild=spawn('docker',['--host',endpoint,'start','--attach','--interactive',reader],{windowsHide:true,stdio:['ignore','pipe','pipe']});
          readerExit=new Promise(resolve=>{readerChild.once('exit',()=>{readerExitObserved=true;resolve();});readerChild.once('error',resolve);});
          readerChild.stdout.on('data',chunk=>{plainBytes+=chunk.length;chunk.fill(0);});readerChild.stderr.on('data',chunk=>chunk.fill(0));
          for(let i=0;i<100;i++){
            const state=await admin.query(`SELECT coalesce(json_agg(json_build_object('pid',a.pid,'backend_start',a.backend_start::text,'blocked',EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted AND l.relation='auth.schema_migrations'::regclass))),'[]'::json) FROM pg_stat_activity a WHERE a.application_name=${literal(application)};`);
            const found=JSON.parse(state);if(found.length===1&&found[0].blocked){readerBackend=found[0];readerWasBlocked=true;break;}
            await sleep(25);
          }
          if(!readerWasBlocked)throw Error('real_pg_dump_not_waiting');
          const clientState=JSON.parse(docker(['inspect','--format','{{json .}}',reader]).stdout);
          if(clientState.HostConfig.NetworkMode!==`container:${serverState.Id}`||clientState.HostConfig.LogConfig.Type!=='none'||!clientState.HostConfig.ReadonlyRootfs||
            (clientState.HostConfig.Binds??[]).length||Object.keys(clientState.HostConfig.PortBindings??{}).length||clientState.HostConfig.Memory!==clientState.HostConfig.MemorySwap)throw Error('reader_isolation_failed');
          // Simulate a REAL holder connection loss, never a fake boolean.
          const terminated=await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid=${protocol.holderPid} AND application_name=${literal(holder.label)};`);
          holderTerminated=terminated==='t';if(!holderTerminated)throw Error('holder_loss_not_injected');
          if(!signal.aborted)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('supervisor_abort_missing')),5000);signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});
          await cleanupReader();throw Error('real_capture_cancelled');
        }finally{signal.removeEventListener('abort',cancelled);await cleanupReader();}
      },
      verifyRestore:async()=>{restores++;throw Error('restore_forbidden_in_loss_drill');},
      confirmCleanup:async({runId:owner,worker})=>{
        const backendGone=readerBackend&&await admin.query(`SELECT count(*) FROM pg_stat_activity WHERE ${backendWhere()};`)==='0';
        return {runId:owner,worker,confirmed:worker==='capture',resources:[
          {ownerRunId:owner,id:reader,absent:containerAbsent(reader)},
          {ownerRunId:owner,id:`host-docker-start-${readerChild?.pid??'unknown'}`,absent:readerExitObserved},
          {ownerRunId:owner,id:`postgres-reader-${readerBackend?.pid??'unknown'}`,absent:backendGone===true},
        ]};
      },
    });
    const outcome=await supervisor.run();
    const holderGone=await admin.query(`SELECT count(*) FROM pg_stat_activity WHERE pid=${protocol.holderPid};`)==='0';
    const backendGone=readerBackend&&await admin.query(`SELECT count(*) FROM pg_stat_activity WHERE ${backendWhere()};`)==='0';
    if(outcome.state!=='aborted_cleanup_confirmed'||!outcome.workerSettlementAndCleanupConfirmed||!holderTerminated||!holderGone||!readerWasBlocked||
      !readerExitObserved||!backendGone||!containerAbsent(reader)||continues!==0||restores!==0)throw Error('real_loss_cleanup_assertion_failed');
    return {case:'real_local_holder_loss_during_pg_dump',fixtureRunId:runId,supervisionRunId:supervisor.runId,readerLedgerBoundToSupervisionRunId:true,
      realPgDumpBlockedOnExcludedMetadata:true,realHolderBackendTerminated:true,supervisorAbortObserved:true,
      ownedReaderContainerAbsent:true,ownedDockerStartProcessExitObserved:true,ownedReaderBackendAbsent:true,holderBackendAbsent:true,
      workerSettlementAndCleanupConfirmed:true,continueExpandCalls:continues,restoreCalls:restores,plaintextFileWritten:false,
      dumpStreamBytesDiscarded:plainBytes,powerShellProcessTreeTested:false,productionAdapterReady:false,remoteOperations:false,existingBackupsRead:false,
      hostPagingExcluded:false};
  }finally{
    try{await cleanupReader();}catch{}
    for(const s of sessions){try{await s.close();}catch{}}
    if(readerCreated)docker(['rm','--force',reader],true);
    if(sourceCreated)docker(['rm','--force',server],true);
    sourceCleaned=containerAbsent(server)&&containerAbsent(reader);
    if(!sourceCleaned)throw Error('exact_owned_container_cleanup_unconfirmed');
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{if(process.argv.length!==2)throw Error('arguments_forbidden');console.log(JSON.stringify({...await lossCleanupDrill(),exactOwnedContainersCleanupVerified:true}));}
  catch{console.error('Real local loss/cleanup drill failed; raw process and SQL diagnostics suppressed.');process.exitCode=1;}
}
