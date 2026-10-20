#requires -Version 7.0
# Fixed project/function only. Plan is GET-only. Explicit actions run solely
# under server maintenance; no database migration or account operation here.
param([ValidateSet('Plan','ConfigureOrigin','Deploy')][string]$Action='Plan')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$extra=Get-Variable args -Scope Local -ErrorAction SilentlyContinue
if($null -ne $extra -and @($extra.Value).Count){throw 'Unexpected arguments.'}
foreach($source in @(
 @{File='stage04-store-db-credential.ps1';Names=@('Assert-NoReparsePath','Assert-PrivateAcl','Assert-LocalOnlyDestination')},
 @{File='stage04-encrypted-backup.ps1';Names=@('Invoke-BinaryProcess','ConvertTo-ProcessArgument')}
)){
 $t=$null;$e=$null;$a=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $source.File),[ref]$t,[ref]$e)
 if($e.Count){throw 'Guard AST rejected.'}
 foreach($name in $source.Names){$f=@($a.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false));if($f.Count -ne 1){throw 'Guard unavailable.'};. ([scriptblock]::Create($f[0].Extent.Text))}
}
function Assert-EdgeRequest {
 param([string]$Method,[string]$Uri)
 $root='https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum'
 if(($Method -ceq 'GET' -and $Uri -cin @($root,($root+'/functions'),($root+'/secrets'))) -or
    ($Method -ceq 'POST' -and $Uri -cin @(($root+'/secrets'),($root+'/functions/deploy?slug=admin-users')))){return}
 throw 'Edge management target rejected.'
}
function Test-AllowedOriginDigest {
 param([object[]]$Rows,[string]$ExpectedDigest)
 if($Rows.Count -ne 1 -or $ExpectedDigest -cnotmatch '^[0-9a-f]{64}$'){return $false}
 # Management GET /secrets currently calls the SHA256 metadata field "value".
 # Accept only a 64-hex digest matching the fixed public origin; never print it.
 $fields=@($Rows[0].PSObject.Properties | Where-Object {$_.Name -cin @('digest','value')})
 if($fields.Count -ne 1 -or $fields[0].Value -isnot [string] -or $fields[0].Value -cnotmatch '^[0-9a-fA-F]{64}$'){return $false}
 return $fields[0].Value.ToLowerInvariant() -ceq $ExpectedDigest
}
function Send-EdgeManagement {
 param([string]$Method,[string]$Uri,[Net.Http.HttpContent]$Content)
 Assert-EdgeRequest $Method $Uri
 $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method),$Uri);$response=$null
 try{
  $request.Headers.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$script:pat)
  if($Content){$request.Content=$Content}
  $response=$script:client.SendAsync($request).GetAwaiter().GetResult()
  $text=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if($text.Length -gt 131072 -or -not $response.IsSuccessStatusCode){throw 'Edge management response rejected; raw body suppressed.'}
  if(-not $text){return $null};return ($text | ConvertFrom-Json)
 }finally{if($response){$response.Dispose()};$request.Dispose()}
}
$client=$null;$handler=$null;$record=$null;$pat=$null;$attempted=$false;$phase='local_source'
try{
 $sources=@(
  @{Path='admin-users/index.ts';Sha='ce0326fa4092d113fe61103758c2a6e4db2f06c059a5540f38132eb96fe1ed47'},
  @{Path='_shared/auth-contract.ts';Sha='5b03e2fb8259767d3eea85978ccd356e2b64b5c7c3cab3e45b5802aa3044258c'}
 )
 foreach($source in $sources){$source.File=Join-Path $PSScriptRoot ('../supabase/functions/'+$source.Path);if((Get-FileHash -LiteralPath $source.File -Algorithm SHA256).Hash.ToLowerInvariant() -cne $source.Sha){throw 'Approved Edge source changed.'}}
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'Windows current-user DPAPI required.'}
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $app=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GestorBarberia';$secretsDirectory=Join-Path $app 'secrets';$path=Join-Path $secretsDirectory 'stage04-management-token.clixml'
 Assert-LocalOnlyDestination $app
 foreach($item in @($app,$secretsDirectory,$path)){Assert-NoReparsePath $item;Assert-PrivateAcl -LiteralPath $item -OwnerSid $sid}
 $record=Import-Clixml -LiteralPath $path
 if($record.FormatVersion -ne 1 -or $record.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $record.Purpose -cne 'stage04_management_api' -or $record.Token -isnot [Security.SecureString]){throw 'Management credential rejected.'}
 $phase='maintenance_readonly_gate'
 $module=([Uri]::new((Join-Path $PSScriptRoot 'stage04-cutover-runtime.mjs'))).AbsoluteUri | ConvertTo-Json -Compress
 $code='import {runReadonlyInspection} from '+$module+'; const x=JSON.parse(await runReadonlyInspection("SELECT json_build_object(''maintenance'',maintenance,''in_flight'',(SELECT count(*) FROM private.admin_operation_admissions WHERE finished_at IS NULL)) FROM private.security_operations WHERE singleton;"));console.log(JSON.stringify(x));'
 $node=(Get-Command node -CommandType Application | Select-Object -First 1).Source
 $gate=[Text.Encoding]::UTF8.GetString((Invoke-BinaryProcess -Executable $node -Arguments @('--input-type=module','-e',$code) -MaximumBytes 4096)) | ConvertFrom-Json
 if($gate.maintenance -isnot [bool] -or $gate.maintenance -ne $true -or $gate.in_flight -ne 0){throw 'Closed server maintenance required.'}
 $pat=[Net.NetworkCredential]::new('management',$record.Token).Password
 $handler=[Net.Http.HttpClientHandler]::new();$handler.AllowAutoRedirect=$false;$handler.UseCookies=$false
 $client=[Net.Http.HttpClient]::new($handler);$client.Timeout=[TimeSpan]::FromSeconds(120)
 $root='https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum'
 $phase='project_and_edge_read'
 $project=Send-EdgeManagement GET $root
 if($project.id -cne 'ucmwykzrepmjucssjnum' -or $project.status -cne 'ACTIVE_HEALTHY'){throw 'Project rejected.'}
 $functions=@(Send-EdgeManagement GET ($root+'/functions'))
 $existing=@($functions | Where-Object {$_.slug -ceq 'admin-users'})
 $secrets=@(Send-EdgeManagement GET ($root+'/secrets'))
 $origin='https://gestor-barberia-five.vercel.app'
 $digest=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($origin))).ToLowerInvariant()
 $originRows=@($secrets | Where-Object {$_.name -ceq 'ALLOWED_ORIGIN'})
 $originVerified=Test-AllowedOriginDigest -Rows $originRows -ExpectedDigest $digest
 if($Action -ceq 'ConfigureOrigin'){
  if($existing.Count){throw 'Existing function requires reconciliation before origin change.'}
  if(-not $originVerified){
   if($originRows.Count){throw 'Unexpected origin digest; reconcile before overwrite.'}
   $phase='origin_post';$attempted=$true
   $body=ConvertTo-Json -InputObject @(@{name='ALLOWED_ORIGIN';value=$origin}) -Compress
   $null=Send-EdgeManagement POST ($root+'/secrets') ([Net.Http.StringContent]::new($body,[Text.Encoding]::UTF8,'application/json'))
   $after=@(Send-EdgeManagement GET ($root+'/secrets') | Where-Object {$_.name -ceq 'ALLOWED_ORIGIN'})
   $originVerified=Test-AllowedOriginDigest -Rows $after -ExpectedDigest $digest
   if(-not $originVerified){throw 'Origin digest acknowledgement missing.'}
  }
 }
 if($Action -ceq 'Deploy'){
  if($existing.Count -ne 0 -or -not $originVerified){throw 'Expected new function and verified origin required; no redeploy.'}
  $form=[Net.Http.MultipartFormDataContent]::new()
  $metadata=@{name='admin-users';entrypoint_path='admin-users/index.ts';verify_jwt=$true} | ConvertTo-Json -Compress
  $form.Add([Net.Http.StringContent]::new($metadata,[Text.Encoding]::UTF8,'application/json'),'metadata')
  foreach($source in $sources){$form.Add([Net.Http.ByteArrayContent]::new([IO.File]::ReadAllBytes($source.File)),'file',$source.Path)}
  $phase='function_deploy_post';$attempted=$true
  $deployed=Send-EdgeManagement POST ($root+'/functions/deploy?slug=admin-users') $form
  if($deployed.slug -cne 'admin-users' -or $deployed.status -cne 'ACTIVE' -or $deployed.verify_jwt -isnot [bool] -or $deployed.verify_jwt -ne $true){throw 'Deploy acknowledgement incomplete.'}
  $existing=@(Send-EdgeManagement GET ($root+'/functions') | Where-Object {$_.slug -ceq 'admin-users'})
  if($existing.Count -ne 1 -or $existing[0].verify_jwt -isnot [bool] -or $existing[0].verify_jwt -ne $true -or $existing[0].status -cne 'ACTIVE' -or $existing[0].version -ne $deployed.version){throw 'Deployed function reconciliation failed.'}
 }
 [pscustomobject]@{Action=$Action;ProjectVerified=$true;ServerMaintenanceVerified=$true;OriginDigestVerified=[bool]$originVerified;OriginMetadataCount=$originRows.Count;OriginMetadataFields=@($originRows | ForEach-Object {$_.PSObject.Properties.Name} | Sort-Object -Unique);AdminFunctionCount=$existing.Count;RemoteMutationAttempted=$attempted;AutomaticRetryAllowed=$false;SourceFilesPinned=$true;SecretsPrinted=$false;EndToEndEdgeVerified=$false} | ConvertTo-Json -Compress
}catch{
 [pscustomobject]@{EdgeDeployment='STOPPED';Phase=$phase;RemoteMutationAttempted=$attempted;ReconciliationRequired=$attempted;RawDiagnosticsSuppressed=$true} | ConvertTo-Json -Compress
 exit 1
}finally{
 if($client){$client.Dispose()};if($handler){$handler.Dispose()}
 if($null -ne $record -and $null -ne $record.PSObject.Properties['Token'] -and $record.Token -is [Security.SecureString]){$record.Token.Dispose()}
 $pat=$null;$record=$null
}
