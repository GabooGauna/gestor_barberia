#requires -Version 5.1
# Read-only, in-memory drift observation. No file creation or configuration writes.
# Full Auth response is hashed opaquely; never output values, headers or raw errors.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$argumentVariable=Get-Variable -Name args -Scope Local -ErrorAction SilentlyContinue
if (($null -ne $argumentVariable -and @($argumentVariable.Value).Count -gt 0) -or
    [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows, no arguments required.' }

function ConvertTo-CanonicalControlPlaneValue {
    param([AllowNull()] $Value)
    if ($null -eq $Value) { return 'null' }
    if ($Value -is [string]) { return ConvertTo-Json -InputObject $Value -Compress }
    if ($Value -is [datetime]) { return ConvertTo-Json -InputObject ($Value.ToUniversalTime().ToString('o')) -Compress }
    if ($Value -is [bool]) { if ($Value) { return 'true' } else { return 'false' } }
    if ($Value -is [ValueType]) { return [Convert]::ToString($Value,[Globalization.CultureInfo]::InvariantCulture) }
    if ($Value -is [Collections.IDictionary]) {
        $keys=[string[]]@($Value.Keys); [Array]::Sort($keys,[StringComparer]::Ordinal)
        $parts=@(foreach ($key in $keys) { (ConvertTo-Json -InputObject $key -Compress)+':'+(ConvertTo-CanonicalControlPlaneValue $Value[$key]) })
        return '{'+($parts -join ',')+'}'
    }
    if ($Value -is [Collections.IEnumerable]) {
        $parts=@(foreach ($item in $Value) { ConvertTo-CanonicalControlPlaneValue $item })
        return '['+($parts -join ',')+']'
    }
    $properties=[string[]]@($Value.PSObject.Properties.Name); [Array]::Sort($properties,[StringComparer]::Ordinal)
    $parts=@(foreach ($key in $properties) { (ConvertTo-Json -InputObject $key -Compress)+':'+(ConvertTo-CanonicalControlPlaneValue $Value.$key) })
    return '{'+($parts -join ',')+'}'
}

function Get-ControlPlaneDigest {
    param([AllowNull()] $Value)
    $bytes=[Text.Encoding]::UTF8.GetBytes((ConvertTo-CanonicalControlPlaneValue $Value))
    $sha=[Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose(); [Array]::Clear($bytes,0,$bytes.Length) }
}

$tokens=$null; $parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'stage04-store-db-credential.ps1'),[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw 'Reviewed guards unavailable.' }
foreach ($name in @('Assert-NoReparsePath','Assert-LocalOnlyDestination','Assert-PrivateAcl')) {
    $nodes=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false))
    if ($nodes.Count -ne 1) { throw 'Reviewed guard unavailable.' }
    . ([scriptblock]::Create($nodes[0].Extent.Text))
}
$record=$null; $pat=$null; $headers=$null; $project=$null; $auth=$null; $functions=$null; $secrets=$null
try {
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($sid.Value -eq 'S-1-5-18') { throw 'Named custodian required.' }
    $localData=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    Assert-LocalOnlyDestination $localData
    $app=Join-Path $localData 'GestorBarberia'; $secretDirectory=Join-Path $app 'secrets'
    $tokenPath=Join-Path $secretDirectory 'stage04-management-token.clixml'
    foreach ($path in @($app,$secretDirectory,$tokenPath)) {
        Assert-NoReparsePath $path; Assert-PrivateAcl -LiteralPath $path -OwnerSid $sid
    }
    $record=Import-Clixml -LiteralPath $tokenPath
    if ($record.FormatVersion -ne 1 -or $record.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or
        $record.Purpose -cne 'stage04_management_api' -or $record.Token -isnot [Security.SecureString]) { throw 'Token rejected.' }
    $pat=[Net.NetworkCredential]::new('management',$record.Token).Password
    $headers=@{Authorization=('Bearer '+$pat)}
    $base='https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum'
    $project=Invoke-RestMethod -Method Get -Uri $base -Headers $headers -TimeoutSec 30
    if ($project.id -cne 'ucmwykzrepmjucssjnum' -or $project.status -cne 'ACTIVE_HEALTHY') { throw 'Project identity/health mismatch.' }
    $auth=Invoke-RestMethod -Method Get -Uri ($base+'/config/auth') -Headers $headers -TimeoutSec 30
    $functions=@(Invoke-RestMethod -Method Get -Uri ($base+'/functions') -Headers $headers -TimeoutSec 30)
    $secrets=@(Invoke-RestMethod -Method Get -Uri ($base+'/secrets') -Headers $headers -TimeoutSec 30)
    if ($null -eq $auth -or $auth -isnot [pscustomobject]) { throw 'Auth shape rejected.' }
    # Lists may return an empty array as a single array object on some PS versions.
    $functions=@($functions | ForEach-Object { $_ })
    $secretNames=@($secrets | ForEach-Object { $_ } | ForEach-Object {
        if ($_.name -isnot [string] -or $_.name -cnotmatch '^[A-Za-z_][A-Za-z0-9_]{0,255}$') { throw 'Secret metadata shape rejected.' }
        $_.name
    } | Sort-Object -CaseSensitive)
    $functionMetadata=@($functions | Sort-Object slug)
    [pscustomobject]@{
        FormatVersion=1; ProjectRef='ucmwykzrepmjucssjnum'; ObservedUtc=[DateTime]::UtcNow.ToString('o')
        ProjectStateSha256=Get-ControlPlaneDigest ([ordered]@{id=$project.id;region=$project.region;status=$project.status;database_version=$project.database.version})
        AuthConfigSha256=Get-ControlPlaneDigest $auth
        FunctionsSha256=Get-ControlPlaneDigest $functionMetadata
        EdgeSecretNamesSha256=Get-ControlPlaneDigest $secretNames
        EdgeSecretMetadataSha256=Get-ControlPlaneDigest (@($secrets | Sort-Object name))
        FunctionCount=$functionMetadata.Count; EdgeSecretNameCount=$secretNames.Count
        SecretValuesExported=$false; SecretValueRecoveryVerified=$false
        RoleGucValuesCompared=$false; RemoteModified=$false
    } | ConvertTo-Json -Compress
} catch {
    throw 'Read-only control-plane observation failed; raw response and credentials suppressed. No remote changes were made.'
} finally {
    if ($null -ne $record -and $record.Token -is [Security.SecureString]) { $record.Token.Dispose() }
    $record=$null; $pat=$null; $headers=$null; $project=$null; $auth=$null; $functions=$null; $secrets=$null
}
