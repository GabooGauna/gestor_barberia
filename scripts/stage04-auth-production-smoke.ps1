#requires -Version 7.0
# Explicit real Auth acceptance. Credentials/tokens stay in RAM. Revokes ONLY
# the session created here, not other operator sessions. No employee/data writes.
param([ValidateSet('Admin','Employee')][string] $CredentialKind='Admin',
 [ValidateSet('Auth','SecurityClosed')][string]$Scope='Auth')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$extra=Get-Variable args -Scope Local -ErrorAction SilentlyContinue
if($null -ne $extra -and @($extra.Value).Count){throw 'Unexpected arguments.'}
$t=$null;$e=$null
$a=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'stage04-store-db-credential.ps1'),[ref]$t,[ref]$e)
if($e.Count){throw 'Guard AST rejected.'}
foreach($name in @('Assert-NoReparsePath','Assert-PrivateAcl','Assert-LocalOnlyDestination')){
 $f=@($a.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false))
 if($f.Count -ne 1){throw 'Guard unavailable.'};. ([scriptblock]::Create($f[0].Extent.Text))
}
function Invoke-SmokeHttp {
 param([string]$Method,[string]$Uri,[string]$Bearer,[string]$ApiKey,[string]$Body)
 $authTarget=$Uri -cmatch '^https://(?:api\.supabase\.com/v1/projects/ucmwykzrepmjucssjnum(?:/api-keys\?reveal=true)?|ucmwykzrepmjucssjnum\.supabase\.co/auth/v1/(?:token\?grant_type=(?:password|refresh_token)|user|logout\?scope=local))$'
 $restTarget=$Method -ceq 'GET' -and $Uri -cmatch '^https://ucmwykzrepmjucssjnum\.supabase\.co/rest/v1/(?:empleados|rutinas|tareas_rutina|empleado_rutinas|auditoria_diaria|tareas_urgentes)\?select=id&limit=1$'
 $edgeTarget=$Method -ceq 'POST' -and $Uri -ceq 'https://ucmwykzrepmjucssjnum.supabase.co/functions/v1/admin-users'
 if($Method -cnotin @('GET','POST') -or -not($authTarget -or $restTarget -or $edgeTarget)){throw 'Smoke HTTP target rejected.'}
 $handler=[Net.Http.HttpClientHandler]::new();$handler.AllowAutoRedirect=$false;$handler.UseCookies=$false
 $client=[Net.Http.HttpClient]::new($handler);$client.Timeout=[TimeSpan]::FromSeconds(20)
 $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method),$Uri);$response=$null
 try{
  $request.Headers.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$Bearer)
  if($ApiKey){$request.Headers.Add('apikey',$ApiKey)}
  if($Body){$request.Content=[Net.Http.StringContent]::new($Body,[Text.Encoding]::UTF8,'application/json')}
  $response=$client.SendAsync($request).GetAwaiter().GetResult()
  $text=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if($text.Length -gt 131072){throw 'Smoke response too large.'}
  $json=if($text){ConvertFrom-Json -InputObject $text -NoEnumerate}else{$null}
  return [pscustomobject]@{Status=[int]$response.StatusCode;Json=$json;JsonIsArray=($json -is [Array])}
 }finally{if($null -ne $response){$response.Dispose()};$request.Dispose();$client.Dispose();$handler.Dispose()}
}
$credential=$null;$record=$null;$pat=$null;$anon=$null;$password=$null;$access=$null;$refresh=$null;$phase='local_guards';$sessionOpened=$false;$sessionClosed=$false
try{
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'Windows DPAPI required.'}
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $app=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GestorBarberia'
 $secrets=Join-Path $app 'secrets'
 $file=if($CredentialKind -ceq 'Admin'){'stage04-initial-admin.clixml'}else{'stage04-existing-employee.clixml'}
 $username=if($CredentialKind -ceq 'Admin'){'admin.gns'}else{'empleado.gns'}
 $credentialPath=Join-Path $secrets $file;$tokenPath=Join-Path $secrets 'stage04-management-token.clixml'
 Assert-LocalOnlyDestination $app
 foreach($path in @($app,$secrets,$credentialPath,$tokenPath)){Assert-NoReparsePath $path;Assert-PrivateAcl -LiteralPath $path -OwnerSid $sid}
 $credential=Import-Clixml -LiteralPath $credentialPath
 if($credential -isnot [Management.Automation.PSCredential] -or $credential.UserName -cne $username){throw 'Smoke credential binding rejected.'}
 $record=Import-Clixml -LiteralPath $tokenPath
 if($record.FormatVersion -ne 1 -or $record.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $record.Purpose -cne 'stage04_management_api' -or $record.Token -isnot [Security.SecureString]){throw 'Management credential rejected.'}
 $pat=[Net.NetworkCredential]::new('management',$record.Token).Password
 $phase='project_and_public_key'
 $project=Invoke-SmokeHttp GET 'https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum' $pat
 if($project.Status -ne 200 -or $project.Json.id -cne 'ucmwykzrepmjucssjnum' -or $project.Json.status -cne 'ACTIVE_HEALTHY'){throw 'Project rejected.'}
 $keys=Invoke-SmokeHttp GET 'https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum/api-keys?reveal=true' $pat
 if($keys.Status -ne 200){throw 'Public key request rejected.'}
 $selected=@($keys.Json | Where-Object {$_.name -ceq 'anon'})
 if($selected.Count -ne 1 -or $selected[0].api_key -isnot [string]){throw 'Expected public key unavailable.'}
 $anon=$selected[0].api_key;$keys=$null;$selected=$null;$pat=$null
 $base='https://ucmwykzrepmjucssjnum.supabase.co/auth/v1/'
 $phase='native_password_login'
 $password=[Net.NetworkCredential]::new('login',$credential.Password).Password
 $login=Invoke-SmokeHttp POST ($base+'token?grant_type=password') $anon $anon (@{email=($username+'@auth.gestor-barberia.invalid');password=$password} | ConvertTo-Json -Compress)
 $password=$null
 if($login.Status -ne 200 -or $login.Json.access_token -isnot [string] -or $login.Json.refresh_token -isnot [string]){throw 'Real login rejected.'}
 $access=$login.Json.access_token;$refresh=$login.Json.refresh_token;$sessionOpened=$true
 $identity=[Guid]::ParseExact($login.Json.user.id,'D').ToString('D');$login=$null
 $user=Invoke-SmokeHttp GET ($base+'user') $access $anon
 if($user.Status -ne 200 -or $user.Json.id -cne $identity){throw 'Authenticated identity mismatch.'}
 $user=$null
 if($Scope -ceq 'SecurityClosed'){
  $phase='anonymous_and_maintenance_rls'
  $tables=@('empleados','rutinas','tareas_rutina','empleado_rutinas','auditoria_diaria','tareas_urgentes')
  foreach($table in $tables){
   $uri='https://ucmwykzrepmjucssjnum.supabase.co/rest/v1/'+$table+'?select=id&limit=1'
   $anonymous=Invoke-SmokeHttp GET $uri $anon $anon
   if($anonymous.Status -notin @(401,403)){throw 'Anonymous business access was not denied.'}
   $closed=Invoke-SmokeHttp GET $uri $access $anon
   if($closed.Status -eq 200){if($closed.JsonIsArray -ne $true -or $closed.Json.Count -ne 0){throw 'Business rows exposed during maintenance.'}}
   elseif($closed.Status -notin @(401,403)){throw 'Unexpected maintenance RLS result.'}
  }
  $phase='edge_aal1_server_enforcement'
  $payload=@{action='change_role';employeeId='00000000-0000-4000-8000-000000000001';role='empleado'} | ConvertTo-Json -Compress
  $edgeUri='https://ucmwykzrepmjucssjnum.supabase.co/functions/v1/admin-users'
  $anonymousEdge=Invoke-SmokeHttp POST $edgeUri $anon $anon $payload
  if($anonymousEdge.Status -ne 401){throw 'Anonymous Edge access was not denied.'}
  $aal1Edge=Invoke-SmokeHttp POST $edgeUri $access $anon $payload
  if($aal1Edge.Status -ne 403 -or $aal1Edge.Json.error -cne 'mfa_required'){throw 'Real AAL1 Edge enforcement was not verified.'}
  $phase='security_smoke_session_logout'
  $logout=Invoke-SmokeHttp POST ($base+'logout?scope=local') $access $anon
  if($logout.Status -notin @(200,204)){throw 'Security smoke logout not acknowledged.'}
  $sessionClosed=$true
  [pscustomobject]@{CredentialKind=$CredentialKind;Scope=$Scope;AnonymousSixTablesDenied=$true;MaintenanceSixTablesClosed=$true;AnonymousEdgeDenied=$true;AuthenticatedAal1EdgeMfaRequired=$true;RealBearerAcceptedByGateway=$true;LocalSessionLogoutVerified=$true;AdministrativeNegativeRequestSent=$true;BusinessMutationExecuted=$false;AdminAal2Verified=$false;SecretsPrinted=$false} | ConvertTo-Json -Compress
  return
 }
 $phase='native_refresh'
 $renewed=Invoke-SmokeHttp POST ($base+'token?grant_type=refresh_token') $anon $anon (@{refresh_token=$refresh} | ConvertTo-Json -Compress)
 if($renewed.Status -ne 200 -or $renewed.Json.user.id -cne $identity -or $renewed.Json.access_token -isnot [string] -or $renewed.Json.refresh_token -isnot [string]){throw 'Refresh rejected.'}
 $access=$renewed.Json.access_token;$refresh=$renewed.Json.refresh_token;$renewed=$null
 $phase='session_local_logout'
 $logout=Invoke-SmokeHttp POST ($base+'logout?scope=local') $access $anon
 if($logout.Status -notin @(200,204)){throw 'Session logout not acknowledged.'}
 $sessionClosed=$true
 $phase='revoked_refresh_check'
 $revoked=Invoke-SmokeHttp POST ($base+'token?grant_type=refresh_token') $anon $anon (@{refresh_token=$refresh} | ConvertTo-Json -Compress)
 if($revoked.Status -notin @(400,401) -or $revoked.Json.error_code -cnotin @('refresh_token_not_found','session_not_found','refresh_token_already_used')){throw 'Revoked refresh not rejected as expected.'}
 [pscustomobject]@{CredentialKind=$CredentialKind;RealPasswordLoginVerified=$true;AuthenticatedIdentityVerified=$true;RefreshVerified=$true;LocalSessionLogoutVerified=$true;RevokedRefreshRejected=$true;OtherSessionsRevoked=$false;AccessJwtInstantRevocationClaimed=$false;MfaAal2Verified=$false;BusinessAccessVerified=$false;SecretsPrinted=$false} | ConvertTo-Json -Compress
}catch{
 [pscustomobject]@{AuthSmoke='STOPPED';Phase=$phase;SessionOpened=$sessionOpened;SessionClosed=$sessionClosed;RawDiagnosticsSuppressed=$true} | ConvertTo-Json -Compress
 exit 1
}finally{
 if($sessionOpened -and -not $sessionClosed -and $access -and $anon){try{$null=Invoke-SmokeHttp POST 'https://ucmwykzrepmjucssjnum.supabase.co/auth/v1/logout?scope=local' $access $anon}catch{}}
 if($credential -is [Management.Automation.PSCredential]){$credential.Password.Dispose()};if($null -ne $record -and $null -ne $record.PSObject.Properties['Token'] -and $record.Token -is [Security.SecureString]){$record.Token.Dispose()}
 $password=$null;$pat=$null;$anon=$null;$access=$null;$refresh=$null;$login=$null;$renewed=$null;$revoked=$null;$user=$null;$keys=$null;$selected=$null
}
