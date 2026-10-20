#requires -Version 5.1
<# Interactive intake only. No network, project changes or environment updates.
Reuse the reviewed Windows DPAPI/ACL helpers; never accept a PAT as an argument.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0 -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Run interactively on Windows without arguments.'
}
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot 'stage04-store-db-credential.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Reviewed helper file is invalid.' }
foreach ($name in @('Assert-NoReparsePath','Assert-LocalOnlyDestination','Assert-PrivateAcl','Set-PrivateAcl')) {
    $definitions = @($ast.FindAll({ param($node)
        $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
    }, $false))
    if ($definitions.Count -ne 1) { throw 'Reviewed helper unavailable.' }
    . ([scriptblock]::Create($definitions[0].Extent.Text))
}
$token = $null; $verified = $null; $stream = $null; $created = $false; $destination = $null
try {
    $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($ownerSid.Value -eq 'S-1-5-18') { throw 'Use the named Windows custodian.' }
    $localData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    if ([string]::IsNullOrWhiteSpace($localData)) { throw 'Local storage unavailable.' }
    Assert-LocalOnlyDestination $localData
    $application = Join-Path $localData 'GestorBarberia'
    $secrets = Join-Path $application 'secrets'
    # Existing secure directories are required; do not change existing stores.
    foreach ($directory in @($application,$secrets)) {
        Assert-NoReparsePath $directory
        Assert-PrivateAcl -LiteralPath $directory -OwnerSid $ownerSid
    }
    $destination = Join-Path $secrets 'stage04-management-token.clixml'
    Assert-NoReparsePath $destination
    if (Test-Path -LiteralPath $destination) { throw 'A management token is already stored.' }
    $token = Read-Host 'Supabase personal access token (hidden; never paste it in chat)' -AsSecureString
    if ($null -eq $token -or $token.Length -eq 0) { throw 'Empty token.' }
    $stored = [PSCustomObject]@{
        FormatVersion=1; ProjectRef='ucmwykzrepmjucssjnum'
        Purpose='stage04_management_api'; Token=$token
    }
    $stream = [IO.File]::Open($destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $created = $true
    $stream.Dispose(); $stream = $null
    Set-PrivateAcl -LiteralPath $destination -IsDirectory $false -OwnerSid $ownerSid
    $stored | Export-Clixml -LiteralPath $destination -Depth 3
    Assert-PrivateAcl -LiteralPath $destination -OwnerSid $ownerSid
    $verified = Import-Clixml -LiteralPath $destination
    if ($verified.FormatVersion -ne 1 -or $verified.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or
        $verified.Purpose -cne 'stage04_management_api' -or $verified.Token -isnot [Security.SecureString] -or
        $verified.Token.Length -ne $token.Length) { throw 'Encrypted token validation failed.' }
    $created = $false
    Write-Host 'Management token saved with current-user DPAPI and restricted ACL. No connection was made.'
} catch {
    if ($null -ne $stream) { $stream.Dispose(); $stream=$null }
    if ($created -and $null -ne $destination) {
        try { Assert-NoReparsePath $destination; [IO.File]::Delete($destination) }
        catch { Write-Warning 'An incomplete encrypted token file may need local removal.' }
    }
    throw 'Management token intake stopped. Existing stores were not overwritten; no connection was made.'
} finally {
    if ($null -ne $stream) { $stream.Dispose() }
    if ($null -ne $verified -and $verified.Token -is [Security.SecureString]) { $verified.Token.Dispose() }
    if ($null -ne $token) { $token.Dispose() }
    $stored=$null; $verified=$null
}
