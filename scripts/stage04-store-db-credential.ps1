#requires -Version 5.1
<#
Manual Windows-only credential capture. No database/network activity.
Run interactively without arguments; never place a password in a command,
environment variable, transcript, ticket or repository. The resulting CLIXML
is DPAPI-protected for this Windows account on this computer, not a portable
backup of the credential. Keep recovery custody separately.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($args.Count -ne 0) {
    throw 'This script accepts no arguments. Run it interactively.'
}
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Windows DPAPI is required; no credential was captured.'
}

function Assert-NoReparsePath {
    param([Parameter(Mandatory = $true)][string] $LiteralPath)

    $fullPath = [IO.Path]::GetFullPath($LiteralPath)
    $pathRoot = [IO.Path]::GetPathRoot($fullPath)
    if ($pathRoot -notmatch '^[A-Za-z]:\\$') {
        throw 'A local Windows drive path is required.'
    }
    $cursor = $pathRoot
    $components = $fullPath.Substring($pathRoot.Length).Split(
        [char[]] @([IO.Path]::DirectorySeparatorChar),
        [StringSplitOptions]::RemoveEmptyEntries
    )
    foreach ($component in @('') + $components) {
        if ($component) { $cursor = [IO.Path]::Combine($cursor, $component) }
        # Get-Item also detects an existing junction or symbolic link instead
        # of resolving it to a different destination.
        $item = Get-Item -LiteralPath $cursor -Force -ErrorAction SilentlyContinue
        if ($null -ne $item -and
            ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'A reparse point exists in the credential path; capture stopped.'
        }
    }
}

function Set-PrivateAcl {
    param(
        [Parameter(Mandatory = $true)][string] $LiteralPath,
        [Parameter(Mandatory = $true)][bool] $IsDirectory,
        [Parameter(Mandatory = $true)][Security.Principal.SecurityIdentifier] $OwnerSid
    )

    Assert-NoReparsePath $LiteralPath
    if ($IsDirectory) {
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
            [Security.AccessControl.InheritanceFlags]::ObjectInherit
    } else {
        $acl = New-Object Security.AccessControl.FileSecurity
        $inheritance = [Security.AccessControl.InheritanceFlags]::None
    }
    $acl.SetOwner($OwnerSid)
    $acl.SetAccessRuleProtection($true, $false)
    $systemSid = New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'
    foreach ($sid in @($OwnerSid, $systemSid)) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            $sid, [Security.AccessControl.FileSystemRights]::FullControl,
            $inheritance, [Security.AccessControl.PropagationFlags]::None,
            [Security.AccessControl.AccessControlType]::Allow
        )
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $LiteralPath -AclObject $acl
    Assert-PrivateAcl -LiteralPath $LiteralPath -OwnerSid $OwnerSid
}

function Assert-PrivateAcl {
    param(
        [Parameter(Mandatory = $true)][string] $LiteralPath,
        [Parameter(Mandatory = $true)][Security.Principal.SecurityIdentifier] $OwnerSid
    )

    Assert-NoReparsePath $LiteralPath
    $acl = Get-Acl -LiteralPath $LiteralPath
    if (-not $acl.AreAccessRulesProtected -or
        $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $OwnerSid.Value) {
        throw 'The credential path owner or inheritance could not be secured.'
    }
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if ($rules.Count -ne 2) { throw 'Unexpected credential path access rules.' }
    $expected = @($OwnerSid.Value, 'S-1-5-18')
    foreach ($rule in $rules) {
        if ($rule.IsInherited -or $rule.IdentityReference.Value -notin $expected -or
            $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
            $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) {
            throw 'The credential path has unexpected permissions.'
        }
    }
    foreach ($sid in $expected) {
        if (@($rules | Where-Object { $_.IdentityReference.Value -eq $sid }).Count -ne 1) {
            throw 'A required credential path access rule is missing.'
        }
    }
}

function Assert-SessionPoolerHost {
    param([Parameter(Mandatory = $true)][string] $Value)

    if ($Value.Length -gt 253 -or
        -not $Value.EndsWith('.pooler.supabase.com', [StringComparison]::Ordinal) -or
        $Value -cne $Value.ToLowerInvariant()) {
        throw 'Enter only the Session pooler DNS hostname ending in .pooler.supabase.com.'
    }
    foreach ($label in $Value.Split('.')) {
        if ($label -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$') {
            throw 'Invalid Session pooler hostname; URLs, ports and paths are not accepted.'
        }
    }
}

function Assert-LocalOnlyDestination {
    param([Parameter(Mandatory = $true)][string] $LiteralPath)

    $fullPath = [IO.Path]::GetFullPath($LiteralPath).TrimEnd([char] '\')
    $repositoryRoot = [IO.Path]::GetFullPath([IO.Path]::Combine($PSScriptRoot, '..')).TrimEnd([char] '\')
    if ($fullPath.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
        $fullPath.StartsWith($repositoryRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $fullPath -match '(?i)(?:^|\\)OneDrive(?:[^\\]*)?(?:\\|$)') {
        throw 'Credential storage must stay outside repositories and OneDrive.'
    }
    # These are non-secret sync root locations, never credential input/output.
    foreach ($variableName in @('OneDrive', 'OneDriveConsumer', 'OneDriveCommercial')) {
        $syncRoot = [Environment]::GetEnvironmentVariable($variableName)
        if (-not [string]::IsNullOrWhiteSpace($syncRoot)) {
            $syncRoot = [IO.Path]::GetFullPath($syncRoot).TrimEnd([char] '\')
            if ($fullPath.Equals($syncRoot, [StringComparison]::OrdinalIgnoreCase) -or
                $fullPath.StartsWith($syncRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
                throw 'A OneDrive destination is not permitted.'
            }
        }
    }
    $ancestor = $fullPath
    while (-not [string]::IsNullOrWhiteSpace($ancestor)) {
        if (Test-Path -LiteralPath ([IO.Path]::Combine($ancestor, '.git'))) {
            throw 'The credential destination is inside a repository.'
        }
        $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
}

$temporaryPath = $null
$password = $null
$credential = $null
$stored = $null
$verified = $null
try {
    # KnownFolder avoids taking a destination from arguments or a password/URI
    # environment variable. Never redirect this store into OneDrive or Git.
    $localData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    if ([string]::IsNullOrWhiteSpace($localData)) { throw 'LocalApplicationData is unavailable.' }
    $localData = [IO.Path]::GetFullPath($localData)
    Assert-NoReparsePath $localData
    Assert-LocalOnlyDestination $localData
    $appDirectory = [IO.Path]::Combine($localData, 'GestorBarberia')
    $secretDirectory = [IO.Path]::Combine($appDirectory, 'secrets')
    $destination = [IO.Path]::Combine($secretDirectory, 'stage04-postgres.clixml')
    Assert-NoReparsePath $destination
    if (Test-Path -LiteralPath $destination) {
        throw 'A credential file already exists. It will not be overwritten.'
    }

    $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($ownerSid.Value -eq 'S-1-5-18') { throw 'Run as the named human Windows user, not SYSTEM.' }
    foreach ($directory in @($appDirectory, $secretDirectory)) {
        Assert-NoReparsePath $directory
        $existing = Get-Item -LiteralPath $directory -Force -ErrorAction SilentlyContinue
        if ($null -ne $existing -and -not $existing.PSIsContainer) {
            throw 'The credential directory path is occupied by a file.'
        }
        if ($null -eq $existing) { [void] [IO.Directory]::CreateDirectory($directory) }
        Set-PrivateAcl -LiteralPath $directory -IsDirectory $true -OwnerSid $ownerSid
    }

    $poolerHost = (Read-Host 'Session pooler hostname only (no URI or password)').Trim().ToLowerInvariant()
    Assert-SessionPoolerHost $poolerHost
    $password = Read-Host 'Database password (hidden, never enter it in chat)' -AsSecureString
    if ($null -eq $password -or $password.Length -eq 0) { throw 'An empty password was not stored.' }
    $credential = New-Object Management.Automation.PSCredential(
        'postgres.ucmwykzrepmjucssjnum', $password
    )
    $stored = [PSCustomObject] @{
        FormatVersion = 1
        ProjectRef = 'ucmwykzrepmjucssjnum'
        Host = $poolerHost
        Database = 'postgres'
        Port = 5432
        # Future consumers must validate hostname and CA trust; this capture
        # makes no TLS connection and must never imply a successful handshake.
        SslMode = 'verify-full'
        Credential = $credential
    }

    Assert-NoReparsePath $destination
    Assert-PrivateAcl -LiteralPath $secretDirectory -OwnerSid $ownerSid
    if (Test-Path -LiteralPath $destination) { throw 'The destination now exists; capture stopped.' }
    $temporaryPath = [IO.Path]::Combine($secretDirectory, ([Guid]::NewGuid().ToString('N') + '.tmp.clixml'))
    # CreateNew refuses an existing path; the parent is already restricted.
    $stream = New-Object IO.FileStream(
        $temporaryPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None
    )
    $stream.Dispose()
    Set-PrivateAcl -LiteralPath $temporaryPath -IsDirectory $false -OwnerSid $ownerSid
    # Export-Clixml encrypts PSCredential.SecureString with current-user DPAPI on
    # Windows. No plaintext password or connection string is ever constructed.
    $stored | Export-Clixml -LiteralPath $temporaryPath -Depth 4
    Assert-PrivateAcl -LiteralPath $temporaryPath -OwnerSid $ownerSid
    $verified = Import-Clixml -LiteralPath $temporaryPath
    if ($verified.FormatVersion -ne 1 -or $verified.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or
        $verified.Host -cne $poolerHost -or $verified.Database -cne 'postgres' -or
        $verified.Port -ne 5432 -or $verified.SslMode -cne 'verify-full' -or
        $verified.Credential -isnot [Management.Automation.PSCredential] -or
        $verified.Credential.UserName -cne 'postgres.ucmwykzrepmjucssjnum' -or
        $verified.Credential.Password -isnot [Security.SecureString] -or
        $verified.Credential.Password.Length -ne $password.Length) {
        throw 'The encrypted credential structure failed validation.'
    }
    Assert-SessionPoolerHost $verified.Host
    Assert-NoReparsePath $destination
    # The two-argument Move never overwrites an existing destination and is on
    # the same volume. Only a validated DPAPI file can become the final file.
    [IO.File]::Move($temporaryPath, $destination)
    $temporaryPath = $null
    Assert-PrivateAcl -LiteralPath $destination -OwnerSid $ownerSid
    Write-Host 'Credential saved locally with current-user DPAPI. No connection was made.'
    Write-Host $destination
} catch {
    # Errors are deliberately generic: never print the credential object or an
    # exception that might capture command values. Never delete a prior/final file.
    if ($null -ne $temporaryPath) {
        try {
            Assert-NoReparsePath $temporaryPath
            if ([IO.File]::Exists($temporaryPath)) { [IO.File]::Delete($temporaryPath) }
        } catch {
            Write-Warning 'An encrypted temporary file may require manual removal from the secrets directory.'
        }
    }
    throw 'Credential capture failed or was cancelled. Existing credential files were not overwritten; no connection was made.'
} finally {
    if ($null -ne $verified -and $verified.Credential -is [Management.Automation.PSCredential]) {
        $verified.Credential.Password.Dispose()
    }
    if ($null -ne $password) { $password.Dispose() }
    $credential = $null
    $stored = $null
    $verified = $null
}
