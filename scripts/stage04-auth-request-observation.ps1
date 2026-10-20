#requires -Version 7.0
# One non-mutating Auth GET and aggregate-only completion correlation. No
# accounts, configuration changes, SQL locks, captures or cutover entry point.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$argumentVariable=Get-Variable -Name args -Scope Local -ErrorAction SilentlyContinue
if ($null -ne $argumentVariable -and @($argumentVariable.Value).Count) { throw 'No arguments accepted.' }
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows required.' }
$stage='guards'; $record=$null; $pat=$null; $headers=$null; $keys=$null; $public=$null; $apiHeaders=$null; $response=$null; $logs=$null
try {
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'stage04-store-db-credential.ps1'),[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw 'Guard parser failed.' }
    foreach ($name in @('Assert-NoReparsePath','Assert-PrivateAcl','Assert-LocalOnlyDestination')) {
        $nodes=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false))
        if ($nodes.Count -ne 1) { throw 'Reviewed guard unavailable.' }
        . ([scriptblock]::Create($nodes[0].Extent.Text))
    }
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($sid.Value -eq 'S-1-5-18') { throw 'Named custodian required.' }
    $app=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GestorBarberia'
    $directory=Join-Path $app 'secrets'; $path=Join-Path $directory 'stage04-management-token.clixml'
    Assert-LocalOnlyDestination $path
    foreach ($entry in @($app,$directory,$path)) { Assert-NoReparsePath $entry; Assert-PrivateAcl -LiteralPath $entry -OwnerSid $sid }
    $stage='token_import'; $record=Import-Clixml -LiteralPath $path
    if ($record.FormatVersion -ne 1 -or $record.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or
        $record.Purpose -cne 'stage04_management_api' -or $record.Token -isnot [Security.SecureString]) { throw 'Token rejected.' }
    $pat=[Net.NetworkCredential]::new('management',$record.Token).Password
    $headers=@{Authorization=('Bearer '+$pat)}
    $base='https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum'
    $stage='public_key_get'
    $keys=@(Invoke-RestMethod -Method Get -Uri ($base+'/api-keys?reveal=false') -Headers $headers -TimeoutSec 15)
    $keys=@($keys | ForEach-Object { $_ })
    $public=@($keys | Where-Object {
        ($_.type -ceq 'publishable' -or $_.name -ceq 'anon') -and $_.api_key -is [string] -and
        ($_.api_key -match '^sb_publishable_[A-Za-z0-9_-]+$' -or $_.api_key -match '^eyJ[A-Za-z0-9_.-]+$')
    })
    if ($public.Count -lt 1) { throw 'Public key unavailable.' }
    if ($public[0].api_key -notmatch '^sb_publishable_') {
        $parts=$public[0].api_key.Split('.')
        if ($parts.Count -ne 3) { throw 'Public JWT shape rejected.' }
        $segment=$parts[1].Replace('-','+').Replace('_','/')
        $segment=$segment.PadRight($segment.Length+(4-$segment.Length%4)%4,'=')
        $claims=ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($segment)))
        if ($claims.role -cne 'anon' -or $claims.ref -cne 'ucmwykzrepmjucssjnum') { throw 'Public JWT role/project rejected.' }
        # Role/ref checks supplement the trusted Management HTTPS response;
        # decoding is not represented as cryptographic signature verification.
        $claims=$null; $segment=$null; $parts=$null
    }
    $nonce=[Guid]::NewGuid().ToString('N')
    $referer='https://gestor-barberia-five.vercel.app/stage04-readonly-probe/'+$nonce
    $apiHeaders=@{apikey=$public[0].api_key;Referer=$referer;'X-Request-Id'=$nonce}
    $start=[DateTime]::UtcNow.AddMinutes(-1)
    $stage='auth_settings_get'
    $response=Invoke-WebRequest -Method Get -Uri 'https://ucmwykzrepmjucssjnum.supabase.co/auth/v1/settings' -Headers $apiHeaders -TimeoutSec 15 -SkipHttpErrorCheck
    if ([int]$response.StatusCode -ne 200) { throw 'Auth GET failed.' }
    $ids=@($nonce)
    foreach ($header in @('x-request-id','sb-request-id','cf-ray')) {
        $candidate=[string]($response.Headers[$header] -join '')
        if ($candidate -match '^[A-Za-z0-9_-]{8,128}$') { $ids+=$candidate }
    }
    # Only generated/returned identifiers, method/path/status and completion
    # markers are queried. No log message or user field is returned to client.
    $quotedIds=(@($ids | Select-Object -Unique) | ForEach-Object { "'"+$_+"'" }) -join ','
    $query="select count() as matches from logs where source = 'auth_logs' and (log_attributes['request_id'] in ("+$quotedIds+") or log_attributes['referer'] = '"+$referer+"') and log_attributes['component'] = 'api' and log_attributes['method'] = 'GET' and log_attributes['path'] = '/settings' and log_attributes['status'] = '200' and (log_attributes['msg'] = 'request completed' or event_message = 'request completed' or JSONExtractString(event_message,'msg') = 'request completed') limit 1"
    $stage='handler_completion_correlation'; $matched=$false
    foreach ($delay in @(1,2,4,8,16)) {
        Start-Sleep -Seconds $delay
        $end=[DateTime]::UtcNow.AddMinutes(1)
        $uri=$base+'/analytics/endpoints/logs?sql='+[Uri]::EscapeDataString($query)+'&iso_timestamp_start='+[Uri]::EscapeDataString($start.ToString('o'))+'&iso_timestamp_end='+[Uri]::EscapeDataString($end.ToString('o'))
        $stage='log_query_request'
        $logs=Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -TimeoutSec 5
        $stage='log_query_response'
        $errorProperty=$logs.PSObject.Properties['error']
        if ($null -ne $errorProperty -and -not [string]::IsNullOrEmpty([string]$errorProperty.Value)) { $stage='log_query_rejected'; throw 'Log query error.' }
        $stage='log_aggregate_shape'
        $rows=@($logs.result | ForEach-Object { $_ })
        if ($rows.Count -ne 1) { throw 'Log aggregate shape rejected.' }
        $count=$rows[0].matches
        $stage='log_aggregate_type'
        if (-not ($count -is [int] -or $count -is [long] -or $count -is [uint64] -or $count -is [string]) -or
            [string]$count -cnotmatch '^[0-9]{1,6}$') { throw 'Log aggregate type rejected.' }
        if ([long]$count -ge 1) { $matched=$true; break }
    }
    [pscustomobject]@{ReadonlyAuthGetHttp=200;HandlerCompletionCorrelated=$matched;AggregateLogsOnly=$true;
        PublicKeyOnly=$true;RemoteModified=$false;AuthWritersDrained=$false;CutoverAuthorizedByThisProbe=$false} | ConvertTo-Json -Compress
    if (-not $matched) { exit 1 }
} catch {
    $httpStatus=0
    if ($null -ne $_.Exception.PSObject.Properties['Response'] -and $null -ne $_.Exception.Response) { $httpStatus=[int]$_.Exception.Response.StatusCode }
    [pscustomobject]@{ReadonlyAuthProbe='STOPPED';Stage=$stage;HttpStatus=$httpStatus;RawDiagnosticsSuppressed=$true;RemoteModified=$false} | ConvertTo-Json -Compress
    exit 1
} finally {
    if ($null -ne $record -and $record.Token -is [Security.SecureString]) { $record.Token.Dispose() }
    $record=$null; $pat=$null; $headers=$null; $keys=$null; $public=$null; $apiHeaders=$null; $response=$null; $logs=$null
}
