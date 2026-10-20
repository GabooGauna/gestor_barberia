#requires -Version 7.0
# Fixed-project Auth operations only. Default GET is read-only; PATCH actions
# require explicit selection after the approved cutover checkpoints.
param(
    [ValidateSet('Inspect','CloseAdmission','ConfigureCandidate')][string] $Action='Inspect',
    [switch] $ObservedWritersVerified
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$stage='guards'; $record=$null; $pat=$null; $headers=$null; $auth=$null; $supplement=$null; $plain=$null; $bytes=$null
$mutationAttempted=$false
try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows required.' }
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
    $stage='project_identity'
    $project=Invoke-RestMethod -Method Get -Uri $base -Headers $headers -TimeoutSec 20
    if ($project.id -cne 'ucmwykzrepmjucssjnum' -or $project.region -cne 'sa-east-1' -or $project.status -cne 'ACTIVE_HEALTHY') { throw 'Target project differs.' }
    $stage='auth_read'
    $auth=Invoke-RestMethod -Method Get -Uri ($base+'/config/auth') -Headers $headers -TimeoutSec 20
    $providers=@($auth.PSObject.Properties | Where-Object { $_.Name -match '^external_.*_enabled$' })
    if ($providers.Count -lt 2 -or @($providers | Where-Object { $_.Value -isnot [bool] }).Count) { throw 'Provider inventory rejected.' }
    $enabled=@($providers | Where-Object { $_.Value } | Select-Object -ExpandProperty Name)
    $otherFlags=@($auth.PSObject.Properties | Where-Object { $_.Name -match '^(saml_enabled|oauth_server_enabled|passkey.*enabled|hook_.*_enabled)$' })
    if (@($otherFlags | Where-Object { $_.Value -isnot [bool] -or $_.Value }).Count) { throw 'Unexpected Auth ingress/hook.' }
    if (@($enabled | Where-Object { $_ -cne 'external_email_enabled' }).Count) { throw 'Unexpected enabled provider.' }
    if ($auth.disable_signup -isnot [bool] -or $auth.external_email_enabled -isnot [bool]) { throw 'Admission flag types rejected.' }
    if ($Action -ne 'Inspect') {
        if (-not $ObservedWritersVerified) { throw 'Observed writers checkpoint required.' }
        # Recover the ORIGINAL temporary flags from the already verified encrypted
        # supplement. Never export its full Auth configuration or secret values.
        $stage='original_config_recovery'
        $backupDirectory=Join-Path $app 'backups\stage04-ab70bce0fa53469f8f8659c4564970ba'
        $supplementPath=Join-Path $backupDirectory 'auth-config-2a5df45aef8f43e597f51d407a75690b.clixml'
        foreach ($entry in @($backupDirectory,$supplementPath)) { Assert-NoReparsePath $entry; Assert-PrivateAcl -LiteralPath $entry -OwnerSid $sid }
        $supplement=Import-Clixml -LiteralPath $supplementPath
        if ($supplement.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $supplement.Payload -isnot [Security.SecureString] -or
            $supplement.PayloadSha256 -cne 'fa39f4183542121c13f68eeec2eed914e34cb8221f8a5ff3c3878f83d76b3d9c') { throw 'Original config supplement rejected.' }
        $plain=[Net.NetworkCredential]::new('configuration',$supplement.Payload).Password
        $bytes=[Text.Encoding]::UTF8.GetBytes($plain)
        $digest=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
        if ($digest -cne $supplement.PayloadSha256) { throw 'Original configuration integrity mismatch.' }
        $original=ConvertFrom-Json -InputObject $plain
        if ($original.Project.id -cne 'ucmwykzrepmjucssjnum' -or $original.AuthConfig.disable_signup -isnot [bool] -or
            $original.AuthConfig.external_email_enabled -isnot [bool]) { throw 'Original temporary flags unavailable.' }
        if ($Action -eq 'CloseAdmission') {
            if ($auth.disable_signup -cne $original.AuthConfig.disable_signup -or
                $auth.external_email_enabled -cne $original.AuthConfig.external_email_enabled) { throw 'Admission baseline changed; reconcile before retry.' }
            $patch=[ordered]@{disable_signup=$true;external_email_enabled=$false}
        } else {
            # Candidate login is enabled only after fail-closed expand and links
            # checkpoints selected by the operator. Signup remains disabled.
            if (-not $auth.disable_signup -or $auth.external_email_enabled) { throw 'Closed admission checkpoint missing.' }
            $patch=[ordered]@{disable_signup=$true;external_email_enabled=$true;
                site_url='https://gestor-barberia-five.vercel.app';uri_allow_list='https://gestor-barberia-five.vercel.app';password_min_length=12}
        }
        $stage='auth_patch'; $mutationAttempted=$true
        $null=Invoke-RestMethod -Method Patch -Uri ($base+'/config/auth') -Headers $headers -ContentType 'application/json' -Body ($patch | ConvertTo-Json -Compress) -TimeoutSec 30
        $stage='auth_patch_verify'
        $auth=Invoke-RestMethod -Method Get -Uri ($base+'/config/auth') -Headers $headers -TimeoutSec 20
        foreach ($key in $patch.Keys) { if ($auth.$key -cne $patch[$key]) { throw 'Configuration acknowledgement differs.' } }
        $enabled=@($auth.PSObject.Properties | Where-Object { $_.Name -match '^external_.*_enabled$' -and $_.Value -eq $true } | Select-Object -ExpandProperty Name)
    }
    [pscustomobject]@{Action=$Action;ProjectVerified=$true;ProviderFlags=$providers.Count;EnabledProviderNames=$enabled;
        SignupDisabled=$auth.disable_signup;EmailEnabled=$auth.external_email_enabled;
        RemoteModified=$mutationAttempted;ControlledCutoverResidualRiskAccepted=$true;RpoZeroVerified=$false} | ConvertTo-Json -Compress
} catch {
    $status=0
    if ($null -ne $_.Exception.PSObject.Properties['Response'] -and $null -ne $_.Exception.Response) { $status=[int]$_.Exception.Response.StatusCode }
    [pscustomobject]@{AuthControl='STOPPED';Stage=$stage;HttpStatus=$status;MutationAttempted=$mutationAttempted;
        ReconciliationRequired=$mutationAttempted;RawDiagnosticsSuppressed=$true} | ConvertTo-Json -Compress
    exit 1
} finally {
    if ($null -ne $record -and $record.Token -is [Security.SecureString]) { $record.Token.Dispose() }
    if ($null -ne $supplement -and $supplement.Payload -is [Security.SecureString]) { $supplement.Payload.Dispose() }
    if ($null -ne $bytes) { [Array]::Clear($bytes,0,$bytes.Length) }
    $record=$null; $pat=$null; $headers=$null; $auth=$null; $supplement=$null; $plain=$null; $original=$null; $project=$null
}
