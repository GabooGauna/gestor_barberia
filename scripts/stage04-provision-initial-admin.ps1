#requires -Version 7.0
# Candidate: Plan/Reconcile only read source. Apply is an explicit privileged
# operation for ONE existing legacy profile. No employee INSERT/reset/delete.
param([ValidateSet('Plan','Apply','Reconcile')][string] $Action='Plan')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$argumentVariable=Get-Variable -Name args -Scope Local -ErrorAction SilentlyContinue
if($null -ne $argumentVariable -and @($argumentVariable.Value).Count -gt 0){throw 'Unexpected positional/named arguments rejected before actions.'}
foreach($source in @(
    @{File='stage04-store-db-credential.ps1';Names=@('Assert-NoReparsePath','Assert-PrivateAcl','Assert-LocalOnlyDestination','Set-PrivateAcl')},
    @{File='stage04-encrypted-backup.ps1';Names=@('ConvertTo-ProcessArgument','Invoke-BinaryProcess','Write-NewPrivateFile','Get-BytesSha256')}
)) {
    $t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $source.File),[ref]$t,[ref]$e)
    if($e.Count){throw 'Reviewed helper AST failed.'}
    foreach($name in $source.Names){$f=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false));if($f.Count -ne 1){throw 'Reviewed helper missing.'};. ([scriptblock]::Create($f[0].Extent.Text))}
}
function Assert-InitialAdminCredential {
    param($Credential)
    if($Credential -isnot [Management.Automation.PSCredential] -or $Credential.UserName -cne 'admin.gns' -or $Credential.Password -isnot [Security.SecureString]){throw 'Initial credential binding rejected.'}
    $plain=[Net.NetworkCredential]::new('policy',$Credential.Password).Password
    $bytes=[Text.Encoding]::UTF8.GetBytes($plain)
    try {
        $classes=[int]($plain -cmatch '[a-z]')+[int]($plain -cmatch '[A-Z]')+[int]($plain -match '[0-9]')+[int]($plain -match '[^a-zA-Z0-9]')
        if($bytes.Length -lt 12 -or $bytes.Length -gt 72 -or $classes -lt 3){throw 'Initial credential policy rejected.'}
    }finally{[Array]::Clear($bytes,0,$bytes.Length);$plain=$null}
}
function Assert-InitialAdminPlan {
    param($Gate)
    foreach($name in @('expanded','auth_runtime_empty','target_ready')){if($Gate.$name -isnot [bool] -or $Gate.$name -ne $true){throw 'Bootstrap source gate rejected.'}}
    if(($Gate.admin_profiles -isnot [int] -and $Gate.admin_profiles -isnot [long]) -or $Gate.admin_profiles -ne 1 -or
        ($Gate.linked_admins -isnot [int] -and $Gate.linked_admins -isnot [long]) -or $Gate.linked_admins -ne 0){throw 'Bootstrap source counts rejected.'}
}
function Get-InitialAdminJournalExpectation {
    param([string] $Directory,[Security.Principal.SecurityIdentifier] $Custodian)
    Assert-NoReparsePath $Directory
    $intent=Join-Path $Directory 'intent.clixml'
    if(-not(Test-Path -LiteralPath $intent)){return [pscustomobject]@{Exists=$false;ExpectedAuthId=$null}}
    Assert-PrivateAcl -LiteralPath $Directory -OwnerSid $Custodian
    Assert-NoReparsePath $intent;Assert-PrivateAcl -LiteralPath $intent -OwnerSid $Custodian
    $first=Import-Clixml -LiteralPath $intent
    if($first.FormatVersion -ne 1 -or $first.Purpose -cne 'stage04_initial_admin_journal' -or $first.OperationId -cnotmatch '^[0-9a-f]{32}$' -or $first.Payload -isnot [Security.SecureString]){throw 'Journal contract rejected.'}
    $expected=$null
    foreach($state in @('intent_before_auth_create','auth_create_outcome_unknown','auth_created_confirmed','sql_submitted','bootstrap_outcome_unknown','bootstrap_confirmed')){
        $path=if($state -ceq 'intent_before_auth_create'){$intent}else{Join-Path $Directory ($first.OperationId+'-'+$state+'.clixml')}
        if(-not(Test-Path -LiteralPath $path)){continue}
        Assert-NoReparsePath $path;Assert-PrivateAcl -LiteralPath $path -OwnerSid $Custodian
        if((Get-Item -LiteralPath $path).Length -gt 65536){throw 'Journal size rejected.'}
        $record=Import-Clixml -LiteralPath $path
        if($record.FormatVersion -ne 1 -or $record.Purpose -cne 'stage04_initial_admin_journal' -or $record.OperationId -cne $first.OperationId -or $record.Payload -isnot [Security.SecureString]){throw 'Journal binding rejected.'}
        try{
            $meta=[Net.NetworkCredential]::new('journal',$record.Payload).Password | ConvertFrom-Json
            if($meta.RunId -cne $first.OperationId -or $meta.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $meta.LegacyEmployeeId -cne '929b1530-6889-4a06-a275-70ef0ba347cf' -or $meta.State -cne $state){throw 'Journal metadata rejected.'}
            if($meta.AuthUserId){$value=[Guid]::ParseExact($meta.AuthUserId,'D').ToString('D');if($expected -and $expected -cne $value){throw 'Journal identity conflict.'};$expected=$value}
        }finally{$record.Payload.Dispose()}
    }
    $first.Payload.Dispose()
    return [pscustomobject]@{Exists=$true;ExpectedAuthId=$expected}
}
function Assert-InitialAdminHttpRequest {
    param([string] $Method,[string] $Uri)
    $validGet=$Method -ceq 'GET' -and $Uri -cmatch '^https://api\.supabase\.com/v1/projects/ucmwykzrepmjucssjnum(?:/api-keys\?reveal=true)?$'
    $validPost=$Method -ceq 'POST' -and $Uri -ceq 'https://ucmwykzrepmjucssjnum.supabase.co/auth/v1/admin/users'
    if(-not($validGet -or $validPost)){throw 'HTTP method/origin/path rejected.'}
}
function New-InitialAdminHttpHandler {
    $handler=[Net.Http.HttpClientHandler]::new();$handler.AllowAutoRedirect=$false;$handler.UseCookies=$false
    return $handler
}
function Invoke-PrivateJsonHttp {
    param([ValidateSet('GET','POST')][string] $Method,[string] $Uri,[string] $Bearer,[string] $ApiKey,[string] $Json)
    Assert-InitialAdminHttpRequest $Method $Uri
    $handler=New-InitialAdminHttpHandler
    $client=[Net.Http.HttpClient]::new($handler);$client.Timeout=[TimeSpan]::FromSeconds(30)
    $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method),$Uri);$response=$null
    try {
        $request.Headers.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$Bearer)
        if($ApiKey){$request.Headers.Add('apikey',$ApiKey)}
        if($Method -ceq 'POST'){$request.Content=[Net.Http.StringContent]::new($Json,[Text.Encoding]::UTF8,'application/json')}
        $response=$client.SendAsync($request).GetAwaiter().GetResult()
        $text=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if($text.Length -gt 131072){throw 'HTTP response bound exceeded.'}
        if(-not $response.IsSuccessStatusCode){throw 'Privileged HTTP request failed; response suppressed.'}
        return ($text | ConvertFrom-Json)
    }finally{if($null -ne $response){$response.Dispose()};$request.Dispose();$client.Dispose();$handler.Dispose()}
}
function Write-BootstrapJournal {
    param([ValidateSet('intent_before_auth_create','auth_create_outcome_unknown','auth_created_confirmed','sql_submitted','bootstrap_outcome_unknown','bootstrap_confirmed')][string] $State,[string] $AuthId)
    $metadata=[pscustomobject]@{RunId=$script:operationId;ProjectRef='ucmwykzrepmjucssjnum';LegacyEmployeeId='929b1530-6889-4a06-a275-70ef0ba347cf';AuthUserId=$AuthId;State=$State;ObservedUtc=[DateTime]::UtcNow.ToString('o')}
    $secure=ConvertTo-SecureString -String ($metadata | ConvertTo-Json -Compress) -AsPlainText -Force
    try {
        $record=[pscustomobject]@{FormatVersion=1;Purpose='stage04_initial_admin_journal';OperationId=$script:operationId;Payload=$secure}
        $bytes=[Text.Encoding]::UTF8.GetBytes([Management.Automation.PSSerializer]::Serialize($record,6))
        $path=if($State -ceq 'intent_before_auth_create'){$script:intentPath}else{Join-Path $script:journalDirectory ($script:operationId+'-'+$State+'.clixml')}
        Write-NewPrivateFile -LiteralPath $path -Bytes $bytes -OwnerSid $script:sid
    }finally{$secure.Dispose()}
}
$operationId=[Guid]::NewGuid().ToString('N');$phase='local_prerequisites';$createSubmitted=$false;$sqlSubmitted=$false
$credential=$null;$patRecord=$null;$pat=$null;$serviceKey=$null;$password=$null;$authId=$null
try {
    if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'Windows current-user DPAPI required.'}
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    if($sid.Value -eq 'S-1-5-18'){throw 'Named custodian required.'}
    $app=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) 'GestorBarberia'
    $secrets=Join-Path $app 'secrets';$credentialPath=Join-Path $secrets 'stage04-initial-admin.clixml'
    Assert-LocalOnlyDestination $app
    foreach($path in @($app,$secrets,$credentialPath)){Assert-NoReparsePath $path;Assert-PrivateAcl -LiteralPath $path -OwnerSid $sid}
    if((Get-Item -LiteralPath $credentialPath).Length -gt 65536){throw 'Credential store bound exceeded.'}
    $credential=Import-Clixml -LiteralPath $credentialPath
    Assert-InitialAdminCredential $credential
    $journalDirectory=Join-Path $app 'initial-admin-journal';$intentPath=Join-Path $journalDirectory 'intent.clixml'
    $runtimeUrl=([Uri]::new((Join-Path $PSScriptRoot 'stage04-cutover-runtime.mjs'))).AbsoluteUri | ConvertTo-Json -Compress
    $verifierUrl=([Uri]::new((Join-Path $PSScriptRoot 'stage04-expand-verification.mjs'))).AbsoluteUri | ConvertTo-Json -Compress
    $node=(Get-Command node -CommandType Application | Select-Object -First 1).Source
    $phase='source_readonly_prerequisites'
    $inspectCode=@'
import {withStage04ReadOnlySession,buildAuthRuntimeEmptySql,acceptAuthRuntimeEmpty,observedAuthRuntimeTables} from __RUNTIME__;
import {expandedCatalogSql,acceptExpandedCatalog} from __VERIFIER__;
const result=await withStage04ReadOnlySession(async s=>{
 const expanded=acceptExpandedCatalog(JSON.parse(await s.query(expandedCatalogSql)));
 const auth=JSON.parse(await s.query(buildAuthRuntimeEmptySql(observedAuthRuntimeTables)));
 const p=JSON.parse(await s.query(`SELECT json_build_object('admin_profiles',(SELECT count(*) FROM public.empleados WHERE rol='admin'),
 'target_ready',(SELECT count(*)=1 FROM public.empleados WHERE id='929b1530-6889-4a06-a275-70ef0ba347cf' AND rol='admin' AND activo AND auth_user_id IS NULL AND (usuario IS NULL OR usuario='admin.gns')),
 'linked_admins',(SELECT count(*) FROM public.empleados WHERE rol='admin' AND activo AND auth_user_id IS NOT NULL));`));
 return {expanded,auth_runtime_empty:acceptAuthRuntimeEmpty(auth,observedAuthRuntimeTables),...p};
});console.log(JSON.stringify(result));
'@
    if($Action -ceq 'Reconcile') {
        $journal=Get-InitialAdminJournalExpectation -Directory $journalDirectory -Custodian $sid
        # Exact derived identity lookup; no account lists, email, password or
        # provider keys are returned. Observation never authorizes recreation.
        $reconcileCode=@'
import {withStage04ReadOnlySession} from __RUNTIME__;
console.log(await withStage04ReadOnlySession(s=>s.query(`SELECT json_build_object(
 'matching_auth_count',(SELECT count(*) FROM auth.users WHERE lower(email)=private.technical_auth_email('admin.gns')),
 'matching_auth_id',(SELECT CASE WHEN count(*)=1 THEN min(id::text) ELSE NULL END FROM auth.users WHERE lower(email)=private.technical_auth_email('admin.gns')),
 'legacy_link',(SELECT auth_user_id FROM public.empleados WHERE id='929b1530-6889-4a06-a275-70ef0ba347cf'),
 'legacy_admin_active',(SELECT rol='admin' AND activo AND usuario='admin.gns' FROM public.empleados WHERE id='929b1530-6889-4a06-a275-70ef0ba347cf'));`)));
'@
        $observed=[Text.Encoding]::UTF8.GetString((Invoke-BinaryProcess -Executable $node -Arguments @('--input-type=module','-e',$reconcileCode.Replace('__RUNTIME__',$runtimeUrl)) -MaximumBytes 65536)) | ConvertFrom-Json
        $journalMatches=$journal.Exists -and $journal.ExpectedAuthId -and $journal.ExpectedAuthId -ceq $observed.matching_auth_id
        $state=if(-not $journal.Exists){'missing_journal_requires_review'}elseif($observed.matching_auth_count -eq 0){'identity_not_observed_do_not_retry'}elseif($journal.ExpectedAuthId -and -not $journalMatches){'journal_identity_conflict_requires_review'}elseif($observed.matching_auth_count -eq 1 -and $null -eq $observed.legacy_link){'identity_exists_unlinked_requires_review'}elseif($observed.matching_auth_count -eq 1 -and $journalMatches -and $observed.legacy_link -ceq $observed.matching_auth_id -and $observed.legacy_admin_active -is [bool] -and $observed.legacy_admin_active -eq $true){'expected_bootstrap_link_observed'}else{'identity_or_profile_conflict_requires_review'}
        [pscustomobject]@{Action='Reconcile';State=$state;AutomaticRetryAllowed=$false;SourceModified=$false;IdentityValuesPrinted=$false} | ConvertTo-Json -Compress
        return
    }
    $gate=[Text.Encoding]::UTF8.GetString((Invoke-BinaryProcess -Executable $node -Arguments @('--input-type=module','-e',$inspectCode.Replace('__RUNTIME__',$runtimeUrl).Replace('__VERIFIER__',$verifierUrl)) -MaximumBytes 65536)) | ConvertFrom-Json
    Assert-InitialAdminPlan $gate
    if($Action -ceq 'Plan'){
        [pscustomobject]@{Action='Plan';SourceExpandedVerified=$true;AuthRuntimeEmptyVerified=$true;ExistingLegacyAdminVerified=$true;CredentialContractVerified=$true;SourceModified=$false;JournalCreated=$false} | ConvertTo-Json -Compress
        return
    }
    $phase='exclusive_local_intent'
    Assert-NoReparsePath $journalDirectory
    if(-not(Test-Path -LiteralPath $journalDirectory)){$null=[IO.Directory]::CreateDirectory($journalDirectory);Set-PrivateAcl -LiteralPath $journalDirectory -IsDirectory $true -OwnerSid $sid}
    Assert-PrivateAcl -LiteralPath $journalDirectory -OwnerSid $sid
    # CreateNew is the local idempotency barrier. Never delete/reuse this intent.
    Write-BootstrapJournal -State intent_before_auth_create
    $phase='management_service_key_read'
    $tokenPath=Join-Path $secrets 'stage04-management-token.clixml'
    Assert-NoReparsePath $tokenPath;Assert-PrivateAcl -LiteralPath $tokenPath -OwnerSid $sid
    $patRecord=Import-Clixml -LiteralPath $tokenPath
    if($patRecord.FormatVersion -ne 1 -or $patRecord.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $patRecord.Purpose -cne 'stage04_management_api' -or $patRecord.Token -isnot [Security.SecureString]){throw 'Management credential binding rejected.'}
    $pat=[Net.NetworkCredential]::new('management',$patRecord.Token).Password
    $project=Invoke-PrivateJsonHttp -Method GET -Uri 'https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum' -Bearer $pat
    if($project.id -cne 'ucmwykzrepmjucssjnum' -or $project.status -cne 'ACTIVE_HEALTHY'){throw 'Project identity/health rejected.'}
    $keys=Invoke-PrivateJsonHttp -Method GET -Uri 'https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum/api-keys?reveal=true' -Bearer $pat
    $selected=@($keys | Where-Object {$_.name -ceq 'service_role'})
    if($selected.Count -ne 1 -or $selected[0].api_key -isnot [string] -or $selected[0].api_key.Length -gt 8192){throw 'Expected service-role key unavailable.'}
    $serviceKey=$selected[0].api_key
    $segments=$serviceKey.Split('.');if($segments.Count -ne 3){throw 'Expected legacy service key contract rejected.'}
    $encoded=$segments[1].Replace('-','+').Replace('_','/');$encoded=$encoded.PadRight($encoded.Length+(4-$encoded.Length%4)%4,'=')
    $claims=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)) | ConvertFrom-Json
    if($claims.role -cne 'service_role' -or $claims.ref -cne 'ucmwykzrepmjucssjnum'){throw 'Service key project/role binding rejected.'}
    $phase='auth_create'
    $password=[Net.NetworkCredential]::new('admin',$credential.Password).Password
    $body=@{email='admin.gns@auth.gestor-barberia.invalid';password=$password;email_confirm=$true} | ConvertTo-Json -Compress
    $createSubmitted=$true
    $created=Invoke-PrivateJsonHttp -Method POST -Uri 'https://ucmwykzrepmjucssjnum.supabase.co/auth/v1/admin/users' -Bearer $serviceKey -ApiKey $serviceKey -Json $body
    $authId=[Guid]::ParseExact($created.id,'D').ToString('D')
    if($created.email -cne 'admin.gns@auth.gestor-barberia.invalid'){throw 'Created identity contract mismatch.'}
    Write-BootstrapJournal -State auth_created_confirmed -AuthId $authId
    $phase='bootstrap_existing_profile'
    $sql=@'
BEGIN;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='3s';
DO $gate$ BEGIN
 IF (SELECT count(*) FROM auth.users)<>1 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id='__AUTH_ID__' AND lower(email)=private.technical_auth_email('admin.gns'))
 THEN RAISE EXCEPTION 'bootstrap_identity_changed'; END IF;
 IF (SELECT count(*) FROM public.empleados WHERE rol='admin')<>1 OR NOT EXISTS(SELECT 1 FROM public.empleados WHERE id='929b1530-6889-4a06-a275-70ef0ba347cf' AND rol='admin' AND activo AND auth_user_id IS NULL)
 THEN RAISE EXCEPTION 'bootstrap_existing_profile_changed'; END IF;
END $gate$;
SELECT private.bootstrap_first_admin('929b1530-6889-4a06-a275-70ef0ba347cf','__AUTH_ID__','admin.gns');
COMMIT;
SELECT json_build_object('kind','stage04.initial_admin_bootstrap.v1',
 'existing_id_linked',EXISTS(SELECT 1 FROM public.empleados WHERE id='929b1530-6889-4a06-a275-70ef0ba347cf' AND auth_user_id='__AUTH_ID__' AND usuario='admin.gns' AND rol='admin' AND activo),
 'linked_active_admin_count',(SELECT count(*) FROM public.empleados WHERE rol='admin' AND activo AND auth_user_id IS NOT NULL),
 'bootstrap_audit_count',(SELECT count(*) FROM private.auth_admin_audit WHERE target_empleado_id='929b1530-6889-4a06-a275-70ef0ba347cf' AND actor_auth_user_id='__AUTH_ID__' AND action='bootstrap'));
'@
    $sql=$sql.Replace('__AUTH_ID__',$authId);$queryId=[Guid]::NewGuid().ToString('N').Substring(0,24)
    $frames=(@{id=$queryId;operation='query';sqlBase64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sql))} | ConvertTo-Json -Compress)+"`n"+(@{id=([Guid]::NewGuid().ToString('N').Substring(0,24));operation='close'} | ConvertTo-Json -Compress)+"`n"
    Write-BootstrapJournal -State sql_submitted -AuthId $authId
    $sqlSubmitted=$true
    $pwsh=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)) '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe'
    $reply=Invoke-BinaryProcess -Executable $pwsh -Arguments @('-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',(Join-Path $PSScriptRoot 'stage04-cutover-runtime.ps1'),'-Mode','Session','-RunId',$operationId,'-SessionKind','holder') -Payload ([Text.Encoding]::UTF8.GetBytes($frames)) -MaximumBytes 65536
    $messages=@([Text.Encoding]::UTF8.GetString($reply).Split([char]10) | Where-Object {$_.Trim()} | ForEach-Object {$_ | ConvertFrom-Json})
    $ack=@($messages | Where-Object {$null -ne $_.PSObject.Properties['id'] -and $_.id -ceq $queryId})
    if($ack.Count -ne 1 -or $ack[0].ok -isnot [bool] -or $ack[0].ok -ne $true){throw 'Bootstrap acknowledgement absent.'}
    $proof=$ack[0].text | ConvertFrom-Json
    if($proof.kind -cne 'stage04.initial_admin_bootstrap.v1' -or $proof.existing_id_linked -isnot [bool] -or $proof.existing_id_linked -ne $true -or $proof.linked_active_admin_count -ne 1 -or $proof.bootstrap_audit_count -ne 1){throw 'Bootstrap proof incomplete.'}
    Write-BootstrapJournal -State bootstrap_confirmed -AuthId $authId
    [pscustomobject]@{Action='Apply';OperationId=$operationId;ExistingLegacyIdPreserved=$true;AuthCreateAcknowledged=$true;BootstrapCommitAcknowledged=$true;AuditVerified=$true;AutomaticRetryAllowed=$false;CredentialsPrinted=$false;MfaStillRequired=$true} | ConvertTo-Json -Compress
}catch{
    if($createSubmitted){try{Write-BootstrapJournal -State $(if($sqlSubmitted){'bootstrap_outcome_unknown'}else{'auth_create_outcome_unknown'}) -AuthId $authId}catch{}}
    throw ('Initial-admin operation stopped at '+$phase+'; reconcile exact identity/profile read-only. No automatic create/reset/delete/retry. Raw diagnostics and secrets suppressed.')
}finally{
    if($credential -is [Management.Automation.PSCredential]){$credential.Password.Dispose()}
    if($null -ne $patRecord){$tokenProperty=$patRecord.PSObject.Properties['Token'];if($null -ne $tokenProperty -and $tokenProperty.Value -is [Security.SecureString]){$tokenProperty.Value.Dispose()}}
    $pat=$null;$serviceKey=$null;$password=$null;$keys=$null;$selected=$null;$created=$null;$body=$null
}
