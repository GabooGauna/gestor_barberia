#requires -Version 7.0
# Narrow adapter: only existing set_security_maintenance RPC can write.
# Inspect is read-only. Open/Close require explicit -Authorized.
param([ValidateSet('Inspect','Open','Close')][string] $Action='Inspect',[switch] $Authorized,[switch] $RoutineColorApplied)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$extra=Get-Variable args -Scope Local -ErrorAction SilentlyContinue
if($null -ne $extra -and @($extra.Value).Count){throw 'Unexpected arguments rejected.'}
if($Action -ne 'Inspect' -and -not $Authorized){throw 'Explicit maintenance authorization required.'}
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'stage04-encrypted-backup.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Reviewed process helper AST rejected.'}
foreach($name in @('ConvertTo-ProcessArgument','Invoke-BinaryProcess')){
 $f=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false))
 if($f.Count -ne 1){throw 'Reviewed process helper absent.'};. ([scriptblock]::Create($f[0].Extent.Text))
}
function Assert-MaintenanceState {
 param($State,[bool] $Opening=$false)
 if($State.kind -cne 'stage04.maintenance.v1' -or $State.actor -cne 'postgres' -or $State.database -cne 'postgres' -or $State.maintenance -isnot [bool]){throw 'Maintenance state binding rejected.'}
 foreach($name in @('singleton_count','in_flight')){if(($State.$name -isnot [int] -and $State.$name -isnot [long]) -or $State.$name -lt 0){throw 'Maintenance count type rejected.'}}
 if($State.singleton_count -ne 1){throw 'Maintenance singleton rejected.'}
 if($Opening){
  foreach($name in @('opening_ready','maintenance')){if($State.$name -isnot [bool] -or $State.$name -ne $true){throw 'Opening gate rejected.'}}
  if($State.in_flight -ne 0){throw 'Unresolved administrative admissions.'}
 }
}
function Assert-MaintenanceAck {
 param($Proof,[bool] $Expected)
 if($Proof.maintenance -isnot [bool] -or $Proof.maintenance -ne $Expected -or ($Proof.in_flight -isnot [int] -and $Proof.in_flight -isnot [long]) -or $Proof.in_flight -lt 0){throw 'Maintenance acknowledgement rejected.'}
 if(-not $Expected -and $Proof.in_flight -ne 0){throw 'Opening acknowledgement not drained.'}
}
function Invoke-MaintenanceInspection {
 param([string] $Sql)
 $runtime=([Uri]::new((Join-Path $PSScriptRoot 'stage04-cutover-runtime.mjs'))).AbsoluteUri|ConvertTo-Json -Compress
 $js='import {runReadonlyInspection} from '+$runtime+'; const c=[];for await(const x of process.stdin)c.push(x);console.log(await runReadonlyInspection(Buffer.concat(c)));'
 $node=(Get-Command node -CommandType Application|Select-Object -First 1).Source
 $reply=Invoke-BinaryProcess -Executable $node -Arguments @('--input-type=module','-e',$js) -Payload ([Text.Encoding]::UTF8.GetBytes($Sql)) -MaximumBytes 65536
 return ([Text.Encoding]::UTF8.GetString($reply)|ConvertFrom-Json)
}
# Opening is bound explicitly to the approved pre-color or post-color phase.
$stateSelect=@'
WITH business AS (
 SELECT c.oid,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN('empleados','rutinas','tareas_rutina','empleado_rutinas','auditoria_diaria','tareas_urgentes') AND c.relkind='r'
)
SELECT jsonb_build_object('kind','stage04.maintenance.v1','actor',current_user,'database',current_database(),
 'singleton_count',(SELECT count(*) FROM private.security_operations WHERE singleton),
 'maintenance',(SELECT maintenance FROM private.security_operations WHERE singleton),
 'in_flight',(SELECT count(*) FROM private.admin_operation_admissions WHERE finished_at IS NULL),
 'opening_ready',
 (SELECT count(*)=2 AND bool_and(activo AND auth_user_id IS NOT NULL) AND count(*) FILTER(WHERE rol='admin')=1 AND count(*) FILTER(WHERE rol='empleado')=1 FROM public.empleados)
 AND (SELECT count(*)=2 FROM auth.users)
 AND (SELECT count(*)=1 FROM auth.mfa_factors f JOIN public.empleados e ON e.auth_user_id=f.user_id WHERE e.activo AND e.rol='admin' AND f.factor_type='totp' AND f.status='verified')
 AND (SELECT count(*)=1 FROM auth.mfa_factors WHERE status='verified')
 AND (SELECT count(*)=6 AND bool_and(relrowsecurity AND relforcerowsecurity) FROM business)
 AND NOT EXISTS(SELECT 1 FROM business WHERE has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
 AND NOT EXISTS(SELECT 1 FROM business b JOIN pg_attribute a ON a.attrelid=b.oid WHERE a.attnum>0 AND NOT a.attisdropped AND has_column_privilege('anon',b.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES'))
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empleados'::regclass AND attname='pin' AND NOT attisdropped)
 AND (__COLOR_PHASE_GATE__))
'@
$colorGate=if($RoutineColorApplied){
 @'
EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='public.rutinas'::regclass AND a.attname='color' AND NOT a.attisdropped AND a.attnotnull
 AND pg_get_expr(d.adbin,d.adrelid)=quote_literal('copper')||'::text')
AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.rutinas'::regclass
 AND conname='rutinas_color_palette_check' AND contype='c' AND convalidated)
'@
}else{"NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.rutinas'::regclass AND attname='color' AND NOT attisdropped)"}
$stateSelect=$stateSelect.Replace('__COLOR_PHASE_GATE__',$colorGate)
$inspection='BEGIN TRANSACTION READ ONLY;'+$stateSelect+';ROLLBACK;'
$submitted=$false
try {
 $before=Invoke-MaintenanceInspection $inspection
 Assert-MaintenanceState -State $before -Opening ($Action -eq 'Open')
 if($Action -eq 'Inspect'){$before|ConvertTo-Json -Compress;return}
 $expected=$Action -eq 'Close';$literal=if($expected){'true'}else{'false'}
 $guard=if($Action -eq 'Open'){
  "DO `$gate`$ DECLARE v jsonb; BEGIN SELECT q.x INTO v FROM ($stateSelect) q(x); IF current_user <> 'postgres' OR current_database() <> 'postgres' OR (v->>'singleton_count')::int<>1 OR NOT coalesce((v->>'maintenance')::boolean,false) OR NOT coalesce((v->>'opening_ready')::boolean,false) OR (v->>'in_flight')::int<>0 THEN RAISE EXCEPTION 'maintenance_open_gate_rejected'; END IF; END; `$gate`$;"
 }else{"DO `$gate`$ BEGIN IF current_user <> 'postgres' OR current_database() <> 'postgres' OR (SELECT count(*) FROM private.security_operations WHERE singleton)<>1 THEN RAISE EXCEPTION 'maintenance_close_gate_rejected'; END IF; END; `$gate`$;"}
 # Singleton lock serializes admission and business-write guards. No migrations,
 # Auth/config updates, direct maintenance-table UPDATE or automatic retry.
 $sql="BEGIN;SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';SELECT singleton FROM private.security_operations WHERE singleton FOR UPDATE;"+$guard+"SELECT public.set_security_maintenance($literal);COMMIT;"
 # SELECT singleton above would add non-JSON output; use PERFORM inside DO instead.
 $sql=$sql.Replace('SELECT singleton FROM private.security_operations WHERE singleton FOR UPDATE;', 'DO $lock$ BEGIN PERFORM singleton FROM private.security_operations WHERE singleton FOR UPDATE; END; $lock$;')
 $runId=[Guid]::NewGuid().ToString('N');$id=[Guid]::NewGuid().ToString('N').Substring(0,24)
 $frames=(@{id=$id;operation='query';sqlBase64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sql))}|ConvertTo-Json -Compress)+"`n"+(@{id=[Guid]::NewGuid().ToString('N').Substring(0,24);operation='close'}|ConvertTo-Json -Compress)+"`n"
 $pwsh=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)) '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe'
 $submitted=$true
 $reply=Invoke-BinaryProcess -Executable $pwsh -Arguments @('-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',(Join-Path $PSScriptRoot 'stage04-cutover-runtime.ps1'),'-Mode','Session','-RunId',$runId,'-SessionKind','holder') -Payload ([Text.Encoding]::UTF8.GetBytes($frames)) -MaximumBytes 65536
 $messages=@([Text.Encoding]::UTF8.GetString($reply).Split([char]10)|Where-Object {$_.Trim()}|ForEach-Object {$_|ConvertFrom-Json})
 $acks=@($messages|Where-Object {$null -ne $_.PSObject.Properties['id'] -and $_.id -ceq $id})
 if($acks.Count -ne 1 -or $acks[0].ok -isnot [bool] -or $acks[0].ok -ne $true){throw 'Maintenance commit acknowledgement absent.'}
 $proof=$acks[0].text|ConvertFrom-Json;Assert-MaintenanceAck $proof $expected
 $after=Invoke-MaintenanceInspection $inspection;Assert-MaintenanceState $after
 Assert-MaintenanceAck $after $expected
 [pscustomobject]@{Action=$Action;Maintenance=$after.maintenance;InFlight=$after.in_flight;CommitAcknowledged=$true;FreshReadVerified=$true;AutomaticRetryAllowed=$false;Drained=($after.in_flight -eq 0)}|ConvertTo-Json -Compress
}catch{
 if($submitted){throw 'Maintenance operation requires read-only reconciliation; commit outcome may be unknown. Do not retry or toggle automatically. Raw diagnostics suppressed.'}
 throw 'Maintenance preflight rejected before write submission; raw diagnostics suppressed.'
}
