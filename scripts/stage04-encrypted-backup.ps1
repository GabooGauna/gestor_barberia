#requires -Version 5.1
<#
Review before execution. This script reads the authorized project using a
single full-database pg_dump snapshot plus a separate roles-only export.
Only authenticated ciphertext is written to disk; passwords use process stdin.
It does not freeze writers, restore a database, deploy or establish RPO 0.
The key is wrapped with current-user Windows DPAPI, NOT portable key custody.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No arguments are accepted.' }
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows DPAPI is required.' }

# Reuse only the reviewed guard function definitions, never execute the intake
# script body (which prompts/stores a credential). Both scripts share this repo.
$guardTokens = $null
$guardErrors = $null
$guardAst = [Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot 'stage04-store-db-credential.ps1'), [ref] $guardTokens, [ref] $guardErrors
)
if ($guardErrors.Count) { throw 'Credential guard source failed to parse.' }
$guardNames = @('Assert-NoReparsePath', 'Set-PrivateAcl', 'Assert-PrivateAcl', 'Assert-SessionPoolerHost', 'Assert-LocalOnlyDestination')
foreach ($guardName in $guardNames) {
    $definitions = @($guardAst.FindAll({ param($node)
        $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $guardName
    }, $false))
    if ($definitions.Count -ne 1) { throw 'A required credential guard is unavailable.' }
    . ([scriptblock]::Create($definitions[0].Extent.Text))
}

function ConvertTo-ProcessArgument {
    param([string] $Value)
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}

function Invoke-BinaryProcess {
    param(
        [string] $Executable,
        [string[]] $Arguments,
        [byte[]] $Prefix = @(),
        [byte[]] $Payload = @(),
        [Security.SecureString] $Password,
        [int] $MaximumBytes = 268435456
    )
    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $Executable
    $startInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join ' ')
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    # No password or key is assigned to an environment variable, including
    # container env (visible through docker inspect).
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $startInfo
    $memory = New-Object IO.MemoryStream
    $started = $false
    $clock = [Diagnostics.Stopwatch]::StartNew()
    try {
        if (-not $process.Start()) { throw 'Process could not start.' }
        $started = $true
        $errorTask = $process.StandardError.ReadToEndAsync()
        if ($null -ne $Password) {
            $pointer = [IntPtr]::Zero
            $characters = New-Object char[] $Password.Length
            try {
                $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
                for ($i = 0; $i -lt $characters.Length; $i++) {
                    $characters[$i] = [char]([Runtime.InteropServices.Marshal]::ReadInt16($pointer, 2 * $i) -band 0xffff)
                    if ($characters[$i] -eq [char] 10 -or $characters[$i] -eq [char] 13) { throw 'A multiline password cannot use this prompt protocol.' }
                }
                $process.StandardInput.Write($characters, 0, $characters.Length)
                $process.StandardInput.WriteLine()
                $process.StandardInput.Flush()
            } finally {
                [Array]::Clear($characters, 0, $characters.Length)
                if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
            }
        } else {
            $process.StandardInput.BaseStream.Write($Prefix, 0, $Prefix.Length)
            $process.StandardInput.BaseStream.Write($Payload, 0, $Payload.Length)
            $process.StandardInput.BaseStream.Flush()
        }
        $process.StandardInput.Close()
        $buffer = New-Object byte[] 65536
        try {
            while ($true) {
                $remaining = 900000 - [int] $clock.ElapsedMilliseconds
                if ($remaining -le 0) { throw 'Read operation timed out.' }
                $readTask = $process.StandardOutput.BaseStream.ReadAsync($buffer, 0, $buffer.Length)
                if (-not $readTask.Wait($remaining)) { throw 'Read operation timed out.' }
                $count = $readTask.Result
                if ($count -eq 0) { break }
                if ($memory.Length + $count -gt $MaximumBytes) { throw 'Capture exceeds the memory limit.' }
                $memory.Write($buffer, 0, $count)
            }
        } finally {
            [Array]::Clear($buffer, 0, $buffer.Length)
        }
        if (-not $process.WaitForExit(15000)) { throw 'Process did not exit.' }
        if (-not $errorTask.Wait(15000)) { throw 'Process error stream did not close.' }
        if ($process.ExitCode -ne 0) {
            # Never emit raw stderr: provider diagnostics can contain SQL/data.
            $category = 'database_or_process_failure'
            if ($errorTask.Result -match 'password authentication failed') { $category = 'authentication_failed' }
            elseif ($errorTask.Result -match 'certificate|SSL|TLS') { $category = 'tls_verification_failed' }
            elseif ($errorTask.Result -match 'permission denied') { $category = 'insufficient_backup_permissions' }
            throw ('Capture failed: ' + $category)
        }
        if ($memory.Length -eq 0) { throw 'Empty process output was rejected.' }
        return ,$memory.ToArray()
    } finally {
        if ($started -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
        if ($memory.Capacity -gt 0) { [Array]::Clear($memory.GetBuffer(), 0, [int] $memory.Length) }
        $memory.Dispose()
        $process.Dispose()
    }
}

function Write-NewPrivateFile {
    param([string] $LiteralPath, [byte[]] $Bytes, [Security.Principal.SecurityIdentifier] $OwnerSid)
    Assert-NoReparsePath $LiteralPath
    Assert-PrivateAcl -LiteralPath ([IO.Path]::GetDirectoryName($LiteralPath)) -OwnerSid $OwnerSid
    $stream = New-Object IO.FileStream($LiteralPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($Bytes, 0, $Bytes.Length); $stream.Flush() } finally { $stream.Dispose() }
    Set-PrivateAcl -LiteralPath $LiteralPath -IsDirectory $false -OwnerSid $OwnerSid
}

function Get-BytesSha256 {
    param([byte[]] $Bytes)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
}

function Get-VerifiedLocalDockerEndpoint {
    param([Parameter(Mandatory = $true)][string] $Executable)
    # Pin a local named pipe before any credential reaches a Docker child.
    # Reject environment overrides rather than infer which context wins.
    foreach ($name in @('DOCKER_HOST', 'DOCKER_CONTEXT')) {
        if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
            throw 'Docker endpoint environment overrides must be removed before this operation.'
        }
    }
    $bytes = Invoke-BinaryProcess -Executable $Executable -Arguments @('context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}') -MaximumBytes 4096
    $endpoint = [Text.Encoding]::UTF8.GetString($bytes).Trim() | ConvertFrom-Json
    if ($endpoint -isnot [string] -or $endpoint -cnotin @('npipe:////./pipe/dockerDesktopLinuxEngine', 'npipe:////./pipe/docker_engine')) {
        throw 'Only an explicitly verified local Docker named-pipe endpoint is permitted.'
    }
    return $endpoint
}

$record = $null
$aesKey = $null
$dump = $null
$roles = $null
$cipherDump = $null
$cipherRoles = $null
$failure = $null
$docker = $null
$dockerEndpoint = $null
$activeContainer = $null
$failureStage = 'local_prerequisites'
try {
    $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($ownerSid.Value -eq 'S-1-5-18') { throw 'Run under the named Windows credential custodian.' }
    $localData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    Assert-LocalOnlyDestination $localData
    $appDirectory = [IO.Path]::Combine($localData, 'GestorBarberia')
    $secretDirectory = [IO.Path]::Combine($appDirectory, 'secrets')
    $credentialPath = [IO.Path]::Combine($secretDirectory, 'stage04-postgres.clixml')
    Assert-NoReparsePath $credentialPath
    Assert-PrivateAcl -LiteralPath $appDirectory -OwnerSid $ownerSid
    Assert-PrivateAcl -LiteralPath $secretDirectory -OwnerSid $ownerSid
    Assert-PrivateAcl -LiteralPath $credentialPath -OwnerSid $ownerSid
    $record = Import-Clixml -LiteralPath $credentialPath
    if ($record.FormatVersion -ne 1 -or $record.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or
        $record.Database -cne 'postgres' -or $record.Port -ne 5432 -or $record.SslMode -cne 'verify-full' -or
        $record.Credential -isnot [Management.Automation.PSCredential] -or
        $record.Credential.UserName -cne 'postgres.ucmwykzrepmjucssjnum' -or
        $record.Credential.Password.Length -eq 0) { throw 'Credential metadata did not match the authorized project.' }
    Assert-SessionPoolerHost $record.Host
    $certificatePath = [IO.Path]::Combine($appDirectory, 'certs', 'prod-ca-2021.crt')
    $failureStage = 'official_CA_required'
    Assert-LocalOnlyDestination $certificatePath
    Assert-NoReparsePath $certificatePath
    if (-not [IO.File]::Exists($certificatePath) -or $certificatePath.Contains(',')) {
        throw 'The operator-supplied official CA file is required; no system-root or TLS downgrade fallback is permitted.'
    }
    $certificateHash = (Get-FileHash -LiteralPath $certificatePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $failureStage = 'local_runtime_prerequisites'
    $docker = (Get-Command docker -CommandType Application | Select-Object -First 1).Source
    $dockerEndpoint = Get-VerifiedLocalDockerEndpoint -Executable $docker
    $node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $cryptoHelper = Join-Path $PSScriptRoot 'stage04-backup-crypto.mjs'
    if (-not [IO.File]::Exists($cryptoHelper)) { throw 'Crypto helper is unavailable.' }
    $image = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
    $identifier = [Guid]::NewGuid().ToString('N')
    $startedUtc = [DateTime]::UtcNow.ToString('o')
    $connection = 'host=' + $record.Host + ' port=5432 user=postgres.ucmwykzrepmjucssjnum dbname=postgres sslmode=verify-full sslrootcert=/run/gestor-prod-ca.crt connect_timeout=15'
    $caMount = 'type=bind,source=' + $certificatePath + ',destination=/run/gestor-prod-ca.crt,readonly'
    $readContainerArgs = @('--host', $dockerEndpoint, 'run', '--rm', '--log-driver', 'none', '-i', '--read-only', '--network', 'bridge', '--user', 'postgres', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '512m', '--pids-limit', '64', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--mount', $caMount)

    # Full database: no schema exclusion, --no-owner, or --no-acl fallback. Any
    # inaccessible managed object blocks this candidate instead of shrinking it.
    $activeContainer = 'stage04-readbackup-' + $identifier + '-db'
    $failureStage = 'full_database_snapshot'
    $dump = Invoke-BinaryProcess -Executable $docker -Arguments ($readContainerArgs + @('--name', $activeContainer, $image, 'pg_dump', '--password', '--format=custom', '--dbname', $connection)) -Password $record.Credential.Password
    $activeContainer = $null
    if ($dump.Length -lt 5 -or [Text.Encoding]::ASCII.GetString($dump, 0, 5) -cne 'PGDMP') { throw 'Unexpected database archive format.' }
    $activeContainer = 'stage04-readbackup-' + $identifier + '-roles'
    $failureStage = 'separate_role_export'
    $roles = Invoke-BinaryProcess -Executable $docker -Arguments ($readContainerArgs + @('--name', $activeContainer, $image, 'pg_dumpall', '--password', '--roles-only', '--no-role-passwords', '--dbname', $connection)) -Password $record.Credential.Password -MaximumBytes 16777216
    $activeContainer = $null

    $aesKey = New-Object byte[] 32
    $failureStage = 'authenticated_encryption'
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($aesKey) } finally { $random.Dispose() }
    $cipherDump = Invoke-BinaryProcess -Executable $node -Arguments @($cryptoHelper, 'encrypt') -Prefix $aesKey -Payload $dump -MaximumBytes 268435521
    $cipherRoles = Invoke-BinaryProcess -Executable $node -Arguments @($cryptoHelper, 'encrypt') -Prefix $aesKey -Payload $roles -MaximumBytes 16777281
    $wrappedKey = [Security.Cryptography.ProtectedData]::Protect($aesKey, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)

    # All data is already authenticated ciphertext before creating a file.
    $backupRoot = [IO.Path]::Combine($appDirectory, 'backups')
    $failureStage = 'encrypted_artifact_storage'
    Assert-NoReparsePath $backupRoot
    if (-not [IO.Directory]::Exists($backupRoot)) { [void] [IO.Directory]::CreateDirectory($backupRoot) }
    Set-PrivateAcl -LiteralPath $backupRoot -IsDirectory $true -OwnerSid $ownerSid
    $backupDirectory = [IO.Path]::Combine($backupRoot, 'stage04-' + $identifier)
    Assert-NoReparsePath $backupDirectory
    if (Test-Path -LiteralPath $backupDirectory) { throw 'The backup destination already exists.' }
    [void] [IO.Directory]::CreateDirectory($backupDirectory)
    Set-PrivateAcl -LiteralPath $backupDirectory -IsDirectory $true -OwnerSid $ownerSid
    $keyPath = [IO.Path]::Combine($secretDirectory, 'stage04-backup-' + $identifier + '.dpapi')
    Write-NewPrivateFile -LiteralPath $keyPath -Bytes $wrappedKey -OwnerSid $ownerSid
    Write-NewPrivateFile -LiteralPath ([IO.Path]::Combine($backupDirectory, 'database.gbbk')) -Bytes $cipherDump -OwnerSid $ownerSid
    Write-NewPrivateFile -LiteralPath ([IO.Path]::Combine($backupDirectory, 'roles.gbbk')) -Bytes $cipherRoles -OwnerSid $ownerSid
    $manifest = [PSCustomObject] @{
        FormatVersion = 1; BackupId = $identifier; ProjectRef = $record.ProjectRef
        StartedUtc = $startedUtc; FinishedUtc = [DateTime]::UtcNow.ToString('o')
        Host = $record.Host; Database = 'postgres'; Port = 5432; SslMode = 'verify-full'; SslRootCert = 'operator_supplied_CA_readonly_mount'; RootCaSha256 = $certificateHash
        PostgreSqlClientImage = $image; Capture = 'full_database_custom_dump_single_snapshot'
        DockerEndpoint = $dockerEndpoint; DockerLogDriver = 'none'
        RolesCapture = 'separate_roles_only_no_role_passwords_not_same_snapshot'
        Cipher = 'AES-256-GCM'; Envelope = 'GBBK1|nonce12|tag16|ciphertext'; AuthenticatedHeader = 'GBBK1'
        KeyCustody = 'separate_file_windows_current_user_DPAPI_NOT_PORTABLE_CUSTODY'
        KeyPath = $keyPath; WrappedKeySha256 = Get-BytesSha256 $wrappedKey
        DatabasePlainBytes = $dump.Length; DatabasePlainSha256 = Get-BytesSha256 $dump
        DatabaseCipherSha256 = Get-BytesSha256 $cipherDump
        RolesPlainBytes = $roles.Length; RolesPlainSha256 = Get-BytesSha256 $roles
        RolesCipherSha256 = Get-BytesSha256 $cipherRoles
        RetentionDaysTarget = 30; RetentionEnforced = $false
        WriterFreezeVerified = $false; RpoZeroVerified = $false; RestoreVerified = $false
        FullSupabaseRecoveryVerified = $false; RtoHoursTarget = 4; RtoVerified = $false
        Limitations = @('Preparatory snapshot only; writers were not frozen by this script.', 'DATABASE properties/owner/ACL/settings must be inventoried and validated on restore.', 'Auth/provider configuration, secrets, signing/encryption keys, Edge and Storage objects require separate inventory/custody.', 'Roles export is not atomic with database snapshot; provider-protected roles need reviewed restore mapping.', 'DPAPI key recovery requires this Windows user/computer; independent key custody remains pending.')
    }
    $manifestBytes = [Text.Encoding]::UTF8.GetBytes(($manifest | ConvertTo-Json -Depth 5))
    Write-NewPrivateFile -LiteralPath ([IO.Path]::Combine($backupDirectory, 'manifest.json')) -Bytes $manifestBytes -OwnerSid $ownerSid
    Write-Host 'Encrypted preparatory database snapshot saved. Restore, portable key custody and cutover gates remain pending.'
    Write-Host $backupDirectory
} catch {
    $category = 'failed_or_cancelled'
    if ($_.Exception.Message -match '^Capture failed: (authentication_failed|tls_verification_failed|insufficient_backup_permissions|database_or_process_failure)$') {
        $category = $Matches[1]
    }
    $failure = 'Encrypted backup stopped at ' + $failureStage + ': ' + $category + '. No raw diagnostics or plaintext were emitted. Partial encrypted artifacts remain incomplete until a validated manifest and restore exist.'
} finally {
    if ($null -ne $activeContainer -and $null -ne $docker) {
        # Only this attempt's exact named disposable reader container is removed.
        $cleanupInfo = New-Object Diagnostics.ProcessStartInfo
        $cleanupInfo.FileName = $docker
        $cleanupInfo.Arguments = '--host ' + (ConvertTo-ProcessArgument $dockerEndpoint) + ' rm --force ' + $activeContainer
        $cleanupInfo.UseShellExecute = $false; $cleanupInfo.CreateNoWindow = $true
        $cleanupInfo.RedirectStandardOutput = $true; $cleanupInfo.RedirectStandardError = $true
        $cleanupProcess = New-Object Diagnostics.Process
        $cleanupProcess.StartInfo = $cleanupInfo
        try {
            if ($cleanupProcess.Start()) {
                $outTask = $cleanupProcess.StandardOutput.ReadToEndAsync()
                $errTask = $cleanupProcess.StandardError.ReadToEndAsync()
                if (-not $cleanupProcess.WaitForExit(15000)) { $cleanupProcess.Kill(); $failure = 'Backup stopped; its disposable reader container requires manual cleanup.' }
                elseif ($cleanupProcess.ExitCode -ne 0 -and $errTask.Result -notmatch 'No such container') { $failure = 'Backup stopped; its disposable reader container cleanup could not be confirmed.' }
            }
        } catch { $failure = 'Backup stopped; its disposable reader container cleanup could not be confirmed.' }
        finally { $cleanupProcess.Dispose() }
    }
    foreach ($sensitiveBytes in @($aesKey, $dump, $roles)) {
        if ($null -ne $sensitiveBytes) { [Array]::Clear($sensitiveBytes, 0, $sensitiveBytes.Length) }
    }
    if ($null -ne $record -and $record.Credential -is [Management.Automation.PSCredential]) { $record.Credential.Password.Dispose() }
    $record = $null
}
if ($null -ne $failure) { throw $failure }
