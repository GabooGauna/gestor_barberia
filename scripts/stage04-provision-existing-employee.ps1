#requires -Version 7.0
# Candidate for the ONE remaining existing employee. Default Plan is read-only.
# PrepareCredential is local only; Apply must be separately reviewed/authorized.
param([ValidateSet('Plan','PrepareCredential','Apply','Reconcile')][string] $Action='Plan')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$extra=Get-Variable args -Scope Local -ErrorAction SilentlyContinue
if($null -ne $extra -and @($extra.Value).Count){throw 'Unexpected arguments rejected before actions.'}
foreach($source in @(
 @{File='stage04-store-db-credential.ps1';Names=@('Assert-NoReparsePath','Assert-PrivateAcl','Assert-LocalOnlyDestination','Set-PrivateAcl')},
 @{File='stage04-encrypted-backup.ps1';Names=@('ConvertTo-ProcessArgument','Invoke-BinaryProcess','Write-NewPrivateFile')},
 @{File='stage04-provision-initial-admin.ps1';Names=@('Assert-InitialAdminHttpRequest','New-InitialAdminHttpHandler','Invoke-PrivateJsonHttp')}
)){
 $t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $source.File),[ref]$t,[ref]$e)
 if($e.Count){throw 'Reviewed helper AST failed.'}
 foreach($name in $source.Names){$f=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false));if($f.Count -ne 1){throw 'Reviewed helper missing.'};. ([scriptblock]::Create($f[0].Extent.Text))}
}
function Assert-EmployeeCredential {
 param($Credential)
 if($Credential -isnot [Management.Automation.PSCredential] -or $Credential.UserName -cne 'empleado.gns'){throw 'Employee credential binding rejected.'}
 $plain=[Net.NetworkCredential]::new('policy',$Credential.Password).Password;$bytes=[Text.Encoding]::UTF8.GetBytes($plain)
 try{ $classes=[int]($plain -cmatch '[a-z]')+[int]($plain -cmatch '[A-Z]')+[int]($plain -match '[0-9]')+[int]($plain -match '[^a-zA-Z0-9]')
  if($bytes.Length -lt 12 -or $bytes.Length -gt 72 -or $classes -lt 3){throw 'Employee credential policy rejected.'}
 }finally{[Array]::Clear($bytes,0,$bytes.Length);$plain=$null}
}
function New-EmployeeCredential {
 $random=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$secure=[Security.SecureString]::new()
 try{ $rng.GetBytes($random);$plain='Aa9!'+[Convert]::ToBase64String($random).TrimEnd('=').Replace('+','-').Replace('/','_')
  foreach($character in $plain.ToCharArray()){$secure.AppendChar($character)};$secure.MakeReadOnly()
  return [Management.Automation.PSCredential]::new('empleado.gns',$secure)
 }catch{$secure.Dispose();throw}finally{$rng.Dispose();[Array]::Clear($random,0,$random.Length);$plain=$null}
}
function Assert-EmployeePlan {
 param($Gate)
 foreach($field in @('expanded','admin_binding','target_ready')){if($Gate.$field -isnot [bool] -or $Gate.$field -ne $true){throw 'Employee source gate rejected.'}}
 foreach($pair in @(@{Name='active_employee_count';Expected=1},@{Name='auth_users';Expected=1},@{Name='employee_auth_matches';Expected=0})){
  $value=$Gate.($pair.Name);if(($value -isnot [int] -and $value -isnot [long]) -or $value -ne $pair.Expected){throw 'Employee source count rejected.'}
 }
 $null=[Guid]::ParseExact($Gate.target_id,'D');$null=[Guid]::ParseExact($Gate.actor_id,'D')
}
function Write-EmployeeJournal {
 param([ValidateSet('intent_before_auth_create','auth_create_outcome_unknown','auth_created_confirmed','sql_submitted','link_outcome_unknown','link_confirmed')][string] $State,[string] $AuthId)
 $data=[pscustomobject]@{RunId=$script:operationId;ProjectRef='ucmwykzrepmjucssjnum';TargetEmployeeId=$script:targetId;ActorAuthUserId=$script:actorId;AuthUserId=$AuthId;State=$State;ObservedUtc=[DateTime]::UtcNow.ToString('o')}
 $secure=ConvertTo-SecureString ($data | ConvertTo-Json -Compress) -AsPlainText -Force
 try{$record=[pscustomobject]@{FormatVersion=1;Purpose='stage04_existing_employee_journal';OperationId=$script:operationId;Payload=$secure}
  $path=if($State -ceq 'intent_before_auth_create'){$script:intentPath}else{Join-Path $script:journalDirectory ($script:operationId+'-'+$State+'.clixml')}
  Write-NewPrivateFile -LiteralPath $path -Bytes ([Text.Encoding]::UTF8.GetBytes([Management.Automation.PSSerializer]::Serialize($record,6))) -OwnerSid $script:sid
 }finally{$secure.Dispose()}
}
function Read-EmployeeJournal {
 param([string] $Directory,[Security.Principal.SecurityIdentifier] $Custodian)
 Assert-NoReparsePath $Directory;$intent=Join-Path $Directory 'intent.clixml'
 if(-not(Test-Path -LiteralPath $intent)){throw 'Employee journal absent; reconcile manually.'}
 Assert-PrivateAcl -LiteralPath $Directory -OwnerSid $Custodian
 Assert-NoReparsePath $intent;Assert-PrivateAcl -LiteralPath $intent -OwnerSid $Custodian
 if((Get-Item -LiteralPath $intent).Length -gt 65536){throw 'Journal bound exceeded.'}
 $first=Import-Clixml -LiteralPath $intent
 if($first.FormatVersion -ne 1 -or $first.Purpose -cne 'stage04_existing_employee_journal' -or $first.OperationId -cnotmatch '^[0-9a-f]{32}$'){throw 'Employee journal rejected.'}
 $expected=$null;$target=$null;$actor=$null
 foreach($state in @('intent_before_auth_create','auth_create_outcome_unknown','auth_created_confirmed','sql_submitted','link_outcome_unknown','link_confirmed')){
  $path=if($state -ceq 'intent_before_auth_create'){$intent}else{Join-Path $Directory ($first.OperationId+'-'+$state+'.clixml')}
  if(-not(Test-Path -LiteralPath $path)){continue}
  Assert-NoReparsePath $path;Assert-PrivateAcl -LiteralPath $path -OwnerSid $Custodian
  if((Get-Item -LiteralPath $path).Length -gt 65536){throw 'Journal bound exceeded.'}
  $record=Import-Clixml -LiteralPath $path
  if($record.FormatVersion -ne 1 -or $record.Purpose -cne 'stage04_existing_employee_journal' -or $record.OperationId -cne $first.OperationId -or $record.Payload -isnot [Security.SecureString]){throw 'Employee journal binding rejected.'}
  try{$m=[Net.NetworkCredential]::new('journal',$record.Payload).Password | ConvertFrom-Json
   if($m.RunId -cne $first.OperationId -or $m.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $m.State -cne $state){throw 'Journal metadata rejected.'}
   $t=[Guid]::ParseExact($m.TargetEmployeeId,'D').ToString('D');$a=[Guid]::ParseExact($m.ActorAuthUserId,'D').ToString('D')
   if(($target -and $target -cne $t) -or ($actor -and $actor -cne $a)){throw 'Journal profile/actor conflict.'};$target=$t;$actor=$a
   if($m.AuthUserId){$value=[Guid]::ParseExact($m.AuthUserId,'D').ToString('D');if($expected -and $expected -cne $value){throw 'Journal identity conflict.'};$expected=$value}
  }finally{$record.Payload.Dispose()}
 }
 if($first.Payload -is [Security.SecureString]){$first.Payload.Dispose()}
 return [pscustomobject]@{TargetId=$target;ActorId=$actor;ExpectedAuthId=$expected}
}
$operationId=[Guid]::NewGuid().ToString('N');$phase='local_prerequisites';$createSubmitted=$false;$sqlSubmitted=$false
$credential=$null;$patRecord=$null;$serviceKey=$null;$authId=$null;$targetId=$null;$actorId=$null
try{
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'Windows DPAPI required.'}
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;if($sid.Value -eq 'S-1-5-18'){throw 'Named custodian required.'}
 $app=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) 'GestorBarberia';$secrets=Join-Path $app 'secrets'
 $credentialPath=Join-Path $secrets 'stage04-existing-employee.clixml';$journalDirectory=Join-Path $app 'existing-employee-journal';$intentPath=Join-Path $journalDirectory 'intent.clixml'
 Assert-LocalOnlyDestination $app
 foreach($path in @($app,$secrets)){Assert-NoReparsePath $path;Assert-PrivateAcl -LiteralPath $path -OwnerSid $sid}
 if($Action -ceq 'PrepareCredential'){
  Assert-NoReparsePath $credentialPath;$credential=New-EmployeeCredential;Assert-EmployeeCredential $credential
  Write-NewPrivateFile -LiteralPath $credentialPath -Bytes ([Text.Encoding]::UTF8.GetBytes([Management.Automation.PSSerializer]::Serialize($credential,5))) -OwnerSid $sid
  [pscustomobject]@{Action='PrepareCredential';Prepared=$true;RandomEntropyBytes=32;CredentialPrinted=$false;ClipboardUsed=$false;OwnerPrivateDeliveryPending=$true;SourceConnected=$false} | ConvertTo-Json -Compress
  return
 }
 $credentialReady=$false
 if(Test-Path -LiteralPath $credentialPath){Assert-NoReparsePath $credentialPath;Assert-PrivateAcl -LiteralPath $credentialPath -OwnerSid $sid
  if((Get-Item -LiteralPath $credentialPath).Length -gt 65536){throw 'Credential bound exceeded.'};$credential=Import-Clixml -LiteralPath $credentialPath;Assert-EmployeeCredential $credential;$credentialReady=$true
 }
 if($Action -ceq 'Apply' -and -not $credentialReady){throw 'Explicit local PrepareCredential required.'}
 $node=(Get-Command node -CommandType Application | Select-Object -First 1).Source
 $runtimeUrl=([Uri]::new((Join-Path $PSScriptRoot 'stage04-cutover-runtime.mjs'))).AbsoluteUri | ConvertTo-Json -Compress
 $verifierUrl=([Uri]::new((Join-Path $PSScriptRoot 'stage04-expand-verification.mjs'))).AbsoluteUri | ConvertTo-Json -Compress
 if($Action -ceq 'Reconcile'){
  $journal=Read-EmployeeJournal $journalDirectory $sid
  $code=@'
import {withStage04ReadOnlySession} from __RUNTIME__;
console.log(await withStage04ReadOnlySession(s=>s.query(`SELECT json_build_object(
 'matching_auth_count',(SELECT count(*) FROM auth.users WHERE lower(email)=private.technical_auth_email('empleado.gns')),
 'matching_auth_id',(SELECT CASE WHEN count(*)=1 THEN min(id::text) ELSE NULL END FROM auth.users WHERE lower(email)=private.technical_auth_email('empleado.gns')),
 'target_profile_exists',EXISTS(SELECT 1 FROM public.empleados WHERE id='__TARGET__' AND rol='empleado' AND activo AND (usuario IS NULL OR usuario='empleado.gns')),
 'target_link',(SELECT auth_user_id FROM public.empleados WHERE id='__TARGET__' AND rol='empleado' AND activo AND usuario='empleado.gns'),
 'actor_matches',EXISTS(SELECT 1 FROM public.empleados e JOIN auth.users u ON u.id=e.auth_user_id WHERE e.id='929b1530-6889-4a06-a275-70ef0ba347cf' AND e.rol='admin' AND e.activo AND e.usuario='admin.gns' AND u.id='__ACTOR__' AND lower(u.email)=private.technical_auth_email('admin.gns')));`)));
'@
  $code=$code.Replace('__RUNTIME__',$runtimeUrl).Replace('__TARGET__',$journal.TargetId).Replace('__ACTOR__',$journal.ActorId)
  $r=[Text.Encoding]::UTF8.GetString((Invoke-BinaryProcess -Executable $node -Arguments @('--input-type=module','-e',$code) -MaximumBytes 65536)) | ConvertFrom-Json
  $match=$journal.ExpectedAuthId -and $journal.ExpectedAuthId -ceq $r.matching_auth_id
  $state=if($r.actor_matches -isnot [bool] -or -not $r.actor_matches){'actor_conflict_requires_review'}elseif($r.target_profile_exists -isnot [bool] -or -not $r.target_profile_exists){'profile_conflict_requires_review'}elseif($r.matching_auth_count -eq 0){'identity_not_observed_do_not_retry'}elseif($journal.ExpectedAuthId -and -not $match){'journal_identity_conflict_requires_review'}elseif($r.matching_auth_count -eq 1 -and $null -eq $r.target_link){'identity_exists_unlinked_requires_review'}elseif($r.matching_auth_count -eq 1 -and $match -and $r.target_link -ceq $r.matching_auth_id){'expected_employee_link_observed'}else{'identity_or_profile_conflict_requires_review'}
  [pscustomobject]@{Action='Reconcile';State=$state;SourceModified=$false;AutomaticRetryAllowed=$false;IdentityValuesPrinted=$false} | ConvertTo-Json -Compress;return
 }
 $phase='readonly_existing_profile_plan'
 $code=@'
import {withStage04ReadOnlySession} from __RUNTIME__;
import {expandedCatalogSql,acceptExpandedCatalog} from __VERIFIER__;
console.log(JSON.stringify(await withStage04ReadOnlySession(async s=>{
 const expanded=acceptExpandedCatalog(JSON.parse(await s.query(expandedCatalogSql)));
 const p=JSON.parse(await s.query(`SELECT json_build_object(
 'active_employee_count',(SELECT count(*) FROM public.empleados WHERE rol='empleado' AND activo),
 'target_id',(SELECT CASE WHEN count(*)=1 THEN min(id::text) ELSE NULL END FROM public.empleados WHERE rol='empleado' AND activo),
 'target_ready',(SELECT count(*)=1 FROM public.empleados WHERE rol='empleado' AND activo AND auth_user_id IS NULL AND (usuario IS NULL OR usuario='empleado.gns')),
 'actor_id',(SELECT e.auth_user_id FROM public.empleados e WHERE e.id='929b1530-6889-4a06-a275-70ef0ba347cf' AND e.rol='admin' AND e.activo AND e.usuario='admin.gns'),
 'admin_binding',EXISTS(SELECT 1 FROM public.empleados e JOIN auth.users u ON u.id=e.auth_user_id WHERE e.id='929b1530-6889-4a06-a275-70ef0ba347cf' AND e.rol='admin' AND e.activo AND e.usuario='admin.gns' AND lower(u.email)=private.technical_auth_email('admin.gns')),
 'auth_users',(SELECT count(*) FROM auth.users),'employee_auth_matches',(SELECT count(*) FROM auth.users WHERE lower(email)=private.technical_auth_email('empleado.gns')));`));return {expanded,...p};
})));
'@
 $gate=[Text.Encoding]::UTF8.GetString((Invoke-BinaryProcess -Executable $node -Arguments @('--input-type=module','-e',$code.Replace('__RUNTIME__',$runtimeUrl).Replace('__VERIFIER__',$verifierUrl)) -MaximumBytes 65536)) | ConvertFrom-Json
 Assert-EmployeePlan $gate;$targetId=[Guid]::ParseExact($gate.target_id,'D').ToString('D');$actorId=[Guid]::ParseExact($gate.actor_id,'D').ToString('D')
 if($Action -ceq 'Plan'){[pscustomobject]@{Action='Plan';ExactlyOneExistingEmployeeVerified=$true;AdminActorBindingVerified=$true;SourceExpandedVerified=$true;CredentialReady=$credentialReady;JournalCreated=$false;SourceModified=$false} | ConvertTo-Json -Compress;return}
 $phase='exclusive_local_intent';Assert-NoReparsePath $journalDirectory
 if(-not(Test-Path -LiteralPath $journalDirectory)){$null=[IO.Directory]::CreateDirectory($journalDirectory);Set-PrivateAcl -LiteralPath $journalDirectory -IsDirectory $true -OwnerSid $sid};Assert-PrivateAcl -LiteralPath $journalDirectory -OwnerSid $sid
 Write-EmployeeJournal intent_before_auth_create
 $phase='service_key_read';$tokenPath=Join-Path $secrets 'stage04-management-token.clixml'
 Assert-NoReparsePath $tokenPath;Assert-PrivateAcl -LiteralPath $tokenPath -OwnerSid $sid;$patRecord=Import-Clixml -LiteralPath $tokenPath
 if($patRecord.FormatVersion -ne 1 -or $patRecord.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $patRecord.Purpose -cne 'stage04_management_api' -or $patRecord.Token -isnot [Security.SecureString]){throw 'Management credential binding rejected.'}
 $pat=[Net.NetworkCredential]::new('management',$patRecord.Token).Password
 $project=Invoke-PrivateJsonHttp GET 'https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum' $pat
 if($project.id -cne 'ucmwykzrepmjucssjnum' -or $project.status -cne 'ACTIVE_HEALTHY'){throw 'Project state rejected.'}
 $keys=Invoke-PrivateJsonHttp GET 'https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum/api-keys?reveal=true' $pat
 $selected=@($keys | Where-Object {$_.name -ceq 'service_role'});if($selected.Count -ne 1 -or $selected[0].api_key -isnot [string] -or $selected[0].api_key.Length -gt 8192){throw 'Service key unavailable.'};$serviceKey=$selected[0].api_key
 $segments=$serviceKey.Split('.');if($segments.Count -ne 3){throw 'Service key contract rejected.'};$b=$segments[1].Replace('-','+').Replace('_','/');$b=$b.PadRight($b.Length+(4-$b.Length%4)%4,'=')
 $claims=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) | ConvertFrom-Json;if($claims.role -cne 'service_role' -or $claims.ref -cne 'ucmwykzrepmjucssjnum'){throw 'Service key project/role rejected.'}
 $phase='employee_auth_create';$password=[Net.NetworkCredential]::new('employee',$credential.Password).Password
 $body=@{email='empleado.gns@auth.gestor-barberia.invalid';password=$password;email_confirm=$true} | ConvertTo-Json -Compress
 $createSubmitted=$true;$created=Invoke-PrivateJsonHttp POST 'https://ucmwykzrepmjucssjnum.supabase.co/auth/v1/admin/users' $serviceKey $serviceKey $body
 $authId=[Guid]::ParseExact($created.id,'D').ToString('D');if($created.email -cne 'empleado.gns@auth.gestor-barberia.invalid'){throw 'Created employee identity mismatch.'};Write-EmployeeJournal auth_created_confirmed $authId
 $phase='link_existing_employee'
 # UUID/FK fingerprints cover the original six tables without selecting PIN,
 # names or Auth secrets. Repeat inside the SAME SQL transaction around link.
 $fingerprint=@'
WITH k(resource,id,fks) AS (
 SELECT 'empleados',id::text,jsonb_build_array(id) FROM public.empleados
 UNION ALL SELECT 'rutinas',id::text,jsonb_build_array(id) FROM public.rutinas
 UNION ALL SELECT 'tareas_rutina',id::text,jsonb_build_array(id,rutina_id) FROM public.tareas_rutina
 UNION ALL SELECT 'empleado_rutinas',id::text,jsonb_build_array(id,empleado_id,rutina_id) FROM public.empleado_rutinas
 UNION ALL SELECT 'auditoria_diaria',id::text,jsonb_build_array(id,tarea_id,empleado_id) FROM public.auditoria_diaria
 UNION ALL SELECT 'tareas_urgentes',id::text,jsonb_build_array(id,empleado_id) FROM public.tareas_urgentes
) SELECT encode(sha256(convert_to(coalesce(string_agg(jsonb_build_array(resource,id,fks)::text,chr(10) ORDER BY resource COLLATE "C",id COLLATE "C"),''),'UTF8')),'hex') FROM k
'@
 $sql=@'
BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';
LOCK TABLE public.empleados,public.rutinas,public.tareas_rutina,public.empleado_rutinas,public.auditoria_diaria,public.tareas_urgentes IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE stage04_employee_link_before ON COMMIT DROP AS __FINGERPRINT__;
DO $gate$ BEGIN
 IF (SELECT count(*) FROM auth.users)<>2 OR (SELECT count(*) FROM public.empleados WHERE rol='empleado' AND activo)<>1
 OR NOT EXISTS(SELECT 1 FROM public.empleados WHERE id='__TARGET__' AND rol='empleado' AND activo AND auth_user_id IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.empleados e JOIN auth.users u ON u.id=e.auth_user_id WHERE e.id='929b1530-6889-4a06-a275-70ef0ba347cf' AND e.auth_user_id='__ACTOR__' AND e.usuario='admin.gns' AND e.rol='admin' AND e.activo AND lower(u.email)=private.technical_auth_email('admin.gns'))
 THEN RAISE EXCEPTION 'existing_employee_binding_changed'; END IF;
END $gate$;
SELECT public.admin_link_auth_account('__ACTOR__','__TARGET__','__AUTH__','empleado.gns');
DO $verify$ BEGIN
 IF (__FINGERPRINT__) IS DISTINCT FROM (SELECT * FROM stage04_employee_link_before) THEN RAISE EXCEPTION 'existing_business_uuid_fk_changed'; END IF;
END $verify$;
COMMIT;
SELECT json_build_object('kind','stage04.existing_employee_link.v1','existing_uuid_linked',EXISTS(SELECT 1 FROM public.empleados WHERE id='__TARGET__' AND rol='empleado' AND activo AND auth_user_id='__AUTH__' AND usuario='empleado.gns'),
 'audit_count',(SELECT count(*) FROM private.auth_admin_audit WHERE target_empleado_id='__TARGET__' AND actor_auth_user_id='__ACTOR__' AND action='account_created'));
'@
 $sql=$sql.Replace('__FINGERPRINT__',$fingerprint).Replace('__TARGET__',$targetId).Replace('__ACTOR__',$actorId).Replace('__AUTH__',$authId)
 $queryId=[Guid]::NewGuid().ToString('N').Substring(0,24)
 $frames=(@{id=$queryId;operation='query';sqlBase64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sql))}|ConvertTo-Json -Compress)+"`n"+(@{id=([Guid]::NewGuid().ToString('N').Substring(0,24));operation='close'}|ConvertTo-Json -Compress)+"`n"
 Write-EmployeeJournal sql_submitted $authId;$sqlSubmitted=$true
 $pwsh=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)) '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe'
 $reply=Invoke-BinaryProcess -Executable $pwsh -Arguments @('-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',(Join-Path $PSScriptRoot 'stage04-cutover-runtime.ps1'),'-Mode','Session','-RunId',$operationId,'-SessionKind','holder') -Payload ([Text.Encoding]::UTF8.GetBytes($frames)) -MaximumBytes 65536
 $messages=@([Text.Encoding]::UTF8.GetString($reply).Split([char]10)|Where-Object {$_.Trim()}|ForEach-Object {$_|ConvertFrom-Json});$ack=@($messages|Where-Object {$null -ne $_.PSObject.Properties['id'] -and $_.id -ceq $queryId})
 if($ack.Count -ne 1 -or $ack[0].ok -isnot [bool] -or $ack[0].ok -ne $true){throw 'Employee link acknowledgement absent.'};$proof=$ack[0].text|ConvertFrom-Json
 if($proof.kind -cne 'stage04.existing_employee_link.v1' -or $proof.existing_uuid_linked -isnot [bool] -or $proof.existing_uuid_linked -ne $true -or $proof.audit_count -ne 1){throw 'Employee link proof incomplete.'}
 Write-EmployeeJournal link_confirmed $authId
 [pscustomobject]@{Action='Apply';OperationId=$operationId;ExistingEmployeeUuidPreserved=$true;SixBusinessUuidFkPreserved=$true;LinkCommitAcknowledged=$true;AuditVerified=$true;AutomaticRetryAllowed=$false;CredentialPrinted=$false;OwnerPrivateDeliveryPending=$true} | ConvertTo-Json -Compress
}catch{
 if($createSubmitted){try{Write-EmployeeJournal -State $(if($sqlSubmitted){'link_outcome_unknown'}else{'auth_create_outcome_unknown'}) -AuthId $authId}catch{}}
 throw ('Existing-employee operation stopped at '+$phase+'; exact identity/profile reconciliation required. No automatic recreate/reset/delete/retry; raw diagnostics/secrets suppressed.')
}finally{
 if($credential -is [Management.Automation.PSCredential]){$credential.Password.Dispose()}
 if($null -ne $patRecord){$property=$patRecord.PSObject.Properties['Token'];if($null -ne $property -and $property.Value -is [Security.SecureString]){$property.Value.Dispose()}}
 $password=$null;$serviceKey=$null;$pat=$null;$keys=$null;$selected=$null;$created=$null;$body=$null
}
