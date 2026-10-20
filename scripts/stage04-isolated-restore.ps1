#requires -Version 5.1
<#
Candidate: restore only a known encrypted backup to an ephemeral local database.
No remote database, credential-store import, production restore or deployment.
The pinned Supabase image is bootstrapped with initdb, bypassing platform seed
roles. One reviewed bootstrap CREATE ROLE collision is blanked in a derived
in-memory roles stream; all remaining roles SQL and database objects are intact.
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{32}$')]
    [string] $BackupId,
    [switch] $VerifyDatabaseMetadata,
    [switch] $InspectDatabaseMetadata,
    [switch] $VerifyRestoredAuth,
    [ValidatePattern('^[0-9a-f]{64}$')]
    [string] $DatabaseMetadataObservationSha256,
    [ValidatePattern('^[0-9a-f]{32}$')]
    [string] $SupervisionRunId
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$argumentVariable = Get-Variable -Name args -Scope Local -ErrorAction SilentlyContinue
if ($null -ne $argumentVariable -and @($argumentVariable.Value).Count -gt 0) { throw 'Unexpected positional arguments are not accepted.' }
if ($VerifyDatabaseMetadata -and $InspectDatabaseMetadata) { throw 'Choose either metadata inspection or metadata replay.' }
if ($DatabaseMetadataObservationSha256 -and -not $VerifyDatabaseMetadata) { throw 'Observation comparison requires metadata replay.' }
if ($VerifyRestoredAuth -and (-not $VerifyDatabaseMetadata -or -not $DatabaseMetadataObservationSha256)) { throw 'The Auth probe requires metadata replay and its source observation comparison.' }
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows current-user DPAPI is required.' }

# Import definitions only, never the execution bodies of capture/intake.
foreach ($definitionSource in @(
    @{ File = 'stage04-store-db-credential.ps1'; Names = @('Assert-NoReparsePath', 'Set-PrivateAcl', 'Assert-PrivateAcl', 'Assert-LocalOnlyDestination') },
    @{ File = 'stage04-encrypted-backup.ps1'; Names = @('ConvertTo-ProcessArgument', 'Invoke-BinaryProcess', 'Get-BytesSha256', 'Get-VerifiedLocalDockerEndpoint', 'Write-NewPrivateFile') }
)) {
    $tokens = $null; $parseErrors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $definitionSource.File), [ref] $tokens, [ref] $parseErrors)
    if ($parseErrors.Count) { throw 'A required local helper failed to parse.' }
    foreach ($name in $definitionSource.Names) {
        $functions = @($ast.FindAll({ param($node)
            $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
        }, $false))
        if ($functions.Count -ne 1) { throw 'A required helper definition is unavailable.' }
        . ([scriptblock]::Create($functions[0].Extent.Text))
    }
}

function Get-LocalBootstrapRoleReplay {
    param([Parameter(Mandatory = $true)][byte[]] $InputBytes)
    # Source read-only metadata established supabase_admin as OID 10. Preserve
    # that bootstrap identity locally instead of attributing its grants to a new
    # ordinary role. Do not modify the encrypted source or any ALTER/GRANT/GUC.
    $utf8 = [Text.UTF8Encoding]::new($false, $true)
    $text = $utf8.GetString($InputBytes)
    $pattern = [regex]::new('(?m)^CREATE ROLE (?:supabase_admin|"supabase_admin");(?=\r?$)')
    $collisions = $pattern.Matches($text)
    if ($collisions.Count -ne 1) { throw 'Expected exactly one canonical bootstrap-role CREATE collision.' }
    $replayBytes = $utf8.GetBytes($pattern.Replace($text, '', 1))
    return [PSCustomObject] @{
        Bytes = $replayBytes; BlankedCreateRoleCount = 1
        OriginalSha256 = Get-BytesSha256 $InputBytes
        ExecutedSha256 = Get-BytesSha256 $replayBytes
    }
}

function Get-DatabaseMetadataInventory {
    param([Parameter(Mandatory = $true)][string] $Toc)
    $counts = @{ Database = 0; Properties = 0; Acl = 0; UnexpectedIdentity = 0 }
    foreach ($line in ($Toc -split '\r?\n')) {
        if ($line -cmatch '^\d+;\s+\d+\s+\d+\s+DATABASE - ') { $counts.Database++ }
        if ($line -cmatch '^\d+;\s+\d+\s+\d+\s+DATABASE PROPERTIES - ') { $counts.Properties++ }
        if ($line -cmatch '^\d+;\s+\d+\s+\d+\s+ACL - DATABASE ') { $counts.Acl++ }
        if ($line -cmatch '^\d+;\s+\d+\s+\d+\s+(?:DATABASE(?: PROPERTIES)? - |(?:ACL|COMMENT|SECURITY LABEL) - DATABASE )' -and
            $line -cnotmatch '^\d+;\s+\d+\s+\d+\s+(?:DATABASE(?: PROPERTIES)? - postgres postgres|(?:ACL|COMMENT|SECURITY LABEL) - DATABASE postgres postgres)\s*$') {
            $counts.UnexpectedIdentity++
        }
    }
    $cause = 'metadata_replay_candidate'
    if ($counts.UnexpectedIdentity -gt 0) { $cause = 'unexpected_database_metadata_identity' }
    elseif ($counts.Database -eq 0) { $cause = 'missing_database_entry' }
    elseif ($counts.Database -gt 1) { $cause = 'duplicate_database_entry' }
    return [PSCustomObject] @{
        Cause = $cause; DatabaseEntryCount = $counts.Database
        PropertiesEntryCount = $counts.Properties; AclEntryCount = $counts.Acl
        UnexpectedIdentityEntryCount = $counts.UnexpectedIdentity
        ReadyForMetadataReplay = ($cause -ceq 'metadata_replay_candidate')
    }
}

function Get-DatabaseMetadataReplay {
    param([Parameter(Mandatory = $true)][string] $Toc)
    # This is an explicit metadata-only pass, followed by the unchanged FULL
    # database replay. Never infer success from an absent DATABASE entry.
    $selected = New-Object 'Collections.Generic.List[string]'
    $inventory = Get-DatabaseMetadataInventory -Toc $Toc
    if (-not $inventory.ReadyForMetadataReplay) {
        $exception = New-Object InvalidOperationException 'Archived DATABASE metadata requires review.'
        $exception.Data['Stage04MetadataDiagnostic'] = 'cause=' + $inventory.Cause + ';database_entries=' + $inventory.DatabaseEntryCount + ';properties_entries=' + $inventory.PropertiesEntryCount + ';acl_entries=' + $inventory.AclEntryCount + ';unexpected_identity_entries=' + $inventory.UnexpectedIdentityEntryCount
        throw $exception
    }
    $databaseEntries = 0
    foreach ($line in ($Toc -split '\r?\n')) {
        if ($line -cmatch '^\d+;\s+\d+\s+\d+\s+DATABASE - postgres postgres\s*$') {
            $databaseEntries++
            $selected.Add($line)
        } elseif ($line -cmatch '^\d+;\s+\d+\s+\d+\s+(?:DATABASE PROPERTIES - postgres postgres|(?:ACL|COMMENT|SECURITY LABEL) - DATABASE postgres postgres)\s*$') {
            $selected.Add($line)
        } elseif ($line -cmatch '^\d+;\s+\d+\s+\d+\s+(?:DATABASE(?: PROPERTIES)? - |(?:ACL|COMMENT|SECURITY LABEL) - DATABASE )') {
            throw 'Unexpected DATABASE metadata identity requires review.'
        }
    }
    if ($databaseEntries -ne 1) { throw 'Exactly one archived postgres DATABASE entry is required for this opt-in pass.' }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($selected -join "`n") + "`n")
    return [PSCustomObject] @{ Bytes = $bytes; EntryCount = $selected.Count; Sha256 = Get-BytesSha256 $bytes }
}

function Get-DatabaseMetadataCatalogSql {
    # Safe source/clone comparison contract. No setting values, SQL, passwords,
    # role configuration values or application rows leave the server.
    return @'
begin transaction read only;
set local search_path=pg_catalog;
with d as (select * from pg_database where datname=current_database()), a as (
 select pg_get_userbyid(x.grantor) as grantor,
 case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
 x.privilege_type,x.is_grantable
 from d cross join lateral aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) x
), s as (
 select case when r.setrole=0 then '*all_roles*' else pg_get_userbyid(r.setrole) end as role_name,
 v.setting,split_part(v.setting,'=',1) as setting_name
 from pg_db_role_setting r join d on d.oid=r.setdatabase
 cross join lateral unnest(r.setconfig) v(setting)
)
select json_build_object(
 'name',d.datname,'owner',pg_get_userbyid(d.datdba),'encoding',pg_encoding_to_char(d.encoding),
 'locale_provider',d.datlocprovider,'collate',d.datcollate,'ctype',d.datctype,
 'locale',d.datlocale,'icu_rules',d.daticurules,'collation_version',d.datcollversion,
 'actual_collation_version',pg_database_collation_actual_version(d.oid),
 'tablespace',(select spcname from pg_tablespace where oid=d.dattablespace),
 'connection_limit',d.datconnlimit,'allow_connections',d.datallowconn,
 'acl_entry_count',(select count(*) from a),
 'acl_sha256',(select encode(sha256(convert_to(coalesce(string_agg(jsonb_build_array(grantor,grantee,privilege_type,is_grantable)::text,chr(10) order by grantor collate "C",grantee collate "C",privilege_type collate "C",is_grantable),''),'UTF8')),'hex') from a),
 'setting_entry_count',(select count(*) from s),
 'setting_names',(select coalesce(json_agg(setting_name order by role_name collate "C",setting_name collate "C"),'[]'::json) from s),
 'settings_sha256',(select encode(sha256(convert_to(coalesce(string_agg(jsonb_build_array(role_name,setting)::text,chr(10) order by role_name collate "C",setting collate "C"),''),'UTF8')),'hex') from s),
 'settings_values_exposed',false
) from d;
rollback;
'@
}

function ConvertFrom-MetadataObservationJson {
    param([Parameter(Mandatory = $true)][string] $Json)
    # PS 7.5+ otherwise converts ISO timestamps to DateTime; PS 5.1 preserves
    # strings. Preserve the observation contract identically on both runtimes.
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) {
        return ($Json | ConvertFrom-Json -DateKind String)
    }
    return ($Json | ConvertFrom-Json)
}

function Test-MetadataObservationTimestamp {
    param($Value)
    if ($Value -isnot [string] -or $Value -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$') { return $false }
    $parsed=[DateTimeOffset]::MinValue
    return [DateTimeOffset]::TryParseExact($Value,[string[]]@("yyyy-MM-dd'T'HH:mm:ss'Z'","yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'"),
        [Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal,[ref]$parsed)
}

function Assert-DatabaseMetadataEquality {
    param([Parameter(Mandatory = $true)] $Expected, [Parameter(Mandatory = $true)] $Actual)
    foreach ($field in @('name','owner','encoding','locale_provider','collate','ctype','locale','icu_rules','collation_version','actual_collation_version',
        'tablespace','connection_limit','allow_connections','acl_entry_count','acl_sha256','setting_entry_count','settings_sha256','settings_values_exposed')) {
        if (($null -eq $Expected.$field) -ne ($null -eq $Actual.$field) -or [string]$Expected.$field -cne [string]$Actual.$field) { throw 'Restored DATABASE metadata differs from the observed supplement.' }
    }
    if ((@($Expected.setting_names) -join '|') -cne (@($Actual.setting_names) -join '|')) { throw 'Restored DATABASE setting names differ from the observed supplement.' }
}

function Get-SafeRoleStatementKind {
    param([byte[]] $InputBytes, [int] $InputLine)
    if ($InputLine -lt 1 -or $InputLine -gt 1000000 -or $null -eq $InputBytes) { return 'unknown' }
    # Read only the indicated line in memory. Never return its text, identifiers,
    # comments, values or GUC names. A continuation we cannot classify stays unknown.
    $memory = [IO.MemoryStream]::new($InputBytes, $false)
    $reader = [IO.StreamReader]::new($memory, [Text.Encoding]::UTF8, $true)
    try {
        $lineText = $null
        for ($lineNumber = 1; $lineNumber -le $InputLine; $lineNumber++) {
            $lineText = $reader.ReadLine()
            if ($null -eq $lineText) { return 'unknown' }
        }
        # Mask double-quoted identifiers before recognizing the statement shape.
        $shape = [regex]::Replace($lineText, '"(?:[^"]|"")*"', '<identifier>')
        if ($shape -match '^\s*\\') { return 'psql_control' }
        if ($shape -match '^\s*CREATE\s+ROLE\b') { return 'create_role' }
        if ($shape -match '^\s*ALTER\s+ROLE\s+(?:<identifier>|[a-zA-Z_][a-zA-Z0-9_$]*)\s+(?:IN\s+DATABASE\s+(?:<identifier>|[a-zA-Z_][a-zA-Z0-9_$]*)\s+)?(?:SET|RESET)\b') { return 'alter_role_configuration' }
        if ($shape -match '^\s*ALTER\s+ROLE\b') { return 'alter_role_attributes' }
        if ($shape -match '^\s*GRANT\s+(?:SET|ALTER\s+SYSTEM)(?:\s*,\s*(?:SET|ALTER\s+SYSTEM))*\s+ON\s+PARAMETER\b') { return 'grant_parameter_privileges' }
        if ($shape -match '^\s*GRANT\b') { return 'grant_membership' }
        if ($shape -match '^\s*REVOKE\b') { return 'revoke_privileges' }
        if ($shape -match '^\s*COMMENT\s+ON\s+ROLE\b') { return 'comment_role' }
        if ($shape -match '^\s*SECURITY\s+LABEL\b') { return 'security_label' }
        if ($shape -match '^\s*SET\b') { return 'session_configuration' }
        return 'unknown'
    } finally { $reader.Dispose() }
}

function Get-SafeRestoreDiagnostic {
    param(
        [string] $Text,
        [ValidateSet('control', 'roles_restore', 'database_restore', 'dependency_probe', 'catalog_read')]
        [string] $Operation = 'control',
        [byte[]] $InputBytes = @()
    )
    # Match a complete sqlstate-only psql error line, never a SQL fragment.
    # Only known PostgreSQL codes are emitted; everything else becomes 'none'.
    $categories = @{
        '0A000' = 'unsupported_feature'; '23502' = 'not_null_violation'
        '23503' = 'foreign_key_violation'; '23505' = 'unique_violation'
        '25001' = 'transaction_conflict'; '28000' = 'authentication_rejected'
        '28P01' = 'authentication_rejected'; '3D000' = 'database_missing'
        '3F000' = 'schema_missing'; '42501' = 'insufficient_privilege'
        '42601' = 'sql_syntax_error'; '42602' = 'invalid_identifier'
        '42703' = 'column_missing'; '42704' = 'object_missing'
        '42710' = 'duplicate_object'; '42883' = 'function_missing'
        '42939' = 'reserved_identifier'; '42P01' = 'table_missing'
        '42P04' = 'database_already_exists'; '42P13' = 'invalid_function_definition'
        '55000' = 'object_state_invalid'; '55P03' = 'lock_unavailable'
        '57014' = 'query_cancelled'; '57P03' = 'server_not_ready'
        '58P01' = 'dependency_file_missing'; 'XX000' = 'postgres_internal_error'
        'XX001' = 'data_corruption'; 'P0001' = 'server_raised_exception'
    }
    $code = 'none'; $cause = 'unclassified_process_failure'; $inputLine = 0
    $stateMatches = [regex]::Matches($Text, '(?m)^(?:psql:[^\r\n]*?:\s*)?(?:ERROR|FATAL|PANIC):[ \t]+(?<code>[0-9A-Z]{5})[ \t]*\r?$')
    foreach ($match in $stateMatches) {
        if ($categories.ContainsKey($match.Groups['code'].Value)) {
            $code = $match.Groups['code'].Value
            $cause = $categories[$code]
            break
        }
    }
    if ($code -eq 'none' -and $Text -match '(?im)invalid command[ \t]+\\(?:restrict|unrestrict)(?:[ \t\r\n]|$)') {
        $cause = 'psql_meta_command_unsupported'
    }
    $lineMatch = [regex]::Match($Text, '(?m)^psql:(?:<stdin>|-):(?<line>[1-9][0-9]{0,6}):')
    if ($lineMatch.Success) { $inputLine = [int] $lineMatch.Groups['line'].Value }
    $statementKind = 'not_applicable'
    if ($Operation -ceq 'roles_restore') { $statementKind = Get-SafeRoleStatementKind -InputBytes $InputBytes -InputLine $inputLine }
    return 'operation=' + $Operation + ';sqlstate=' + $code + ';cause=' + $cause + ';input_line=' + $inputLine + ';statement=' + $statementKind
}

function Invoke-IsolatedDocker {
    param(
        [string[]] $Arguments,
        [byte[]] $InputBytes = @(),
        [bool] $AllowFailure = $false,
        [ValidateSet('control', 'roles_restore', 'database_restore', 'dependency_probe', 'catalog_read')]
        [string] $Operation = 'control'
    )
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $script:dockerExecutable
    $info.Arguments = ((@('--host', $script:dockerEndpoint) + $Arguments | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join ' ')
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    $started = $false
    try {
        if (-not $process.Start()) { throw 'Local Docker process did not start.' }
        $started = $true
        # Drain concurrently so archive input cannot deadlock on diagnostic pipes.
        # Neither stream is printed, persisted or passed back as an error message.
        $outTask = $process.StandardOutput.ReadToEndAsync()
        $errTask = $process.StandardError.ReadToEndAsync()
        $writeTask = $process.StandardInput.BaseStream.WriteAsync($InputBytes, 0, $InputBytes.Length)
        if (-not $writeTask.Wait(900000)) { throw 'Local restore input timed out.' }
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(900000)) { throw 'Local restore process timed out.' }
        if (-not $outTask.Wait(15000) -or -not $errTask.Wait(15000)) { throw 'Local process output did not close.' }
        if ($outTask.Result.Length -gt 4194304 -or $errTask.Result.Length -gt 4194304) { throw 'Unexpected local diagnostic volume.' }
        if ($process.ExitCode -ne 0 -and -not $AllowFailure) {
            $diagnosticException = New-Object InvalidOperationException 'Isolated Docker/PostgreSQL operation failed; raw diagnostics suppressed.'
            $diagnosticException.Data['Stage04SafeDiagnostic'] = Get-SafeRestoreDiagnostic -Text $errTask.Result -Operation $Operation -InputBytes $InputBytes
            throw $diagnosticException
        }
        return [PSCustomObject] @{ ExitCode = $process.ExitCode; Text = $outTask.Result }
    } finally {
        if ($started -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
        $process.Dispose()
    }
}

$key = $null; $databaseBytes = $null; $roleBytes = $null; $roleReplayBytes = $null; $databaseMetadataBytes = $null; $observationBytes = $null; $authProbeBytes = $null
$containerName = $null; $containerMayExist = $false
$authContainerName = $null; $authContainerMayExist = $false
$dockerExecutable = $null; $dockerEndpoint = $null
$failure = $null; $stage = 'validate_local_artifacts'; $reportPath = $null
try {
    $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($ownerSid.Value -eq 'S-1-5-18') { throw 'The named Windows backup custodian must run this drill.' }
    $localData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    Assert-LocalOnlyDestination $localData
    $application = [IO.Path]::Combine($localData, 'GestorBarberia')
    $backupRoot = [IO.Path]::Combine($application, 'backups')
    $backupDirectory = [IO.Path]::Combine($backupRoot, 'stage04-' + $BackupId)
    $secretDirectory = [IO.Path]::Combine($application, 'secrets')
    $keyPath = [IO.Path]::Combine($secretDirectory, 'stage04-backup-' + $BackupId + '.dpapi')
    $manifestPath = [IO.Path]::Combine($backupDirectory, 'manifest.json')
    $databasePath = [IO.Path]::Combine($backupDirectory, 'database.gbbk')
    $rolePath = [IO.Path]::Combine($backupDirectory, 'roles.gbbk')
    $observation = $null
    if ($DatabaseMetadataObservationSha256) {
        $stage = 'validate_metadata_observation_for_comparison'
        $observationPath = [IO.Path]::Combine($backupDirectory, 'source-database-metadata.json')
        Assert-NoReparsePath $observationPath
        Assert-PrivateAcl -LiteralPath $observationPath -OwnerSid $ownerSid
        if ((Get-Item -LiteralPath $observationPath).Length -gt 65536) { throw 'Oversized metadata observation rejected.' }
        $observationBytes = [IO.File]::ReadAllBytes($observationPath)
        if ((Get-BytesSha256 $observationBytes) -cne $DatabaseMetadataObservationSha256) { throw 'Metadata observation SHA256 does not match.' }
        $observation = ConvertFrom-MetadataObservationJson -Json ([Text.UTF8Encoding]::new($false,$true).GetString($observationBytes))
        if ($observation.format_version -ne 1 -or $observation.backup_id -cne $BackupId -or $observation.project_ref -cne 'ucmwykzrepmjucssjnum' -or
            $observation.same_snapshot_as_database -isnot [bool] -or $observation.same_snapshot_as_database -or
            -not (Test-MetadataObservationTimestamp $observation.observed_at_utc)) { throw 'Metadata observation identity/snapshot contract differs.' }
    }
    foreach ($path in @($application, $backupRoot, $backupDirectory, $secretDirectory, $keyPath, $manifestPath, $databasePath, $rolePath)) {
        Assert-NoReparsePath $path
        Assert-PrivateAcl -LiteralPath $path -OwnerSid $ownerSid
    }
    if ((Get-Item -LiteralPath $manifestPath).Length -gt 65536) { throw 'Oversized manifest rejected.' }
    if ($SupervisionRunId) {
        $supervisedManifestBytes=[IO.File]::ReadAllBytes($manifestPath)
        $manifest=[Text.UTF8Encoding]::new($false,$true).GetString($supervisedManifestBytes) | ConvertFrom-Json
    } else { $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json }
    $captureClientImage = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
    $image = 'public.ecr.aws/supabase/postgres:17.11.0.004@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108'
    if ($manifest.FormatVersion -ne 1 -or $manifest.BackupId -cne $BackupId -or
        $manifest.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $manifest.Database -cne 'postgres' -or
        $manifest.KeyPath -cne $keyPath -or $manifest.PostgreSqlClientImage -cne $captureClientImage -or
        $manifest.Capture -cne 'full_database_custom_dump_single_snapshot' -or
        $manifest.Cipher -cne 'AES-256-GCM' -or $manifest.Envelope -cne 'GBBK1|nonce12|tag16|ciphertext' -or
        $manifest.DockerLogDriver -cne 'none') { throw 'Manifest does not match the reviewed capture contract.' }
    foreach ($entry in @(
        @{ Path = $databasePath; Hash = $manifest.DatabaseCipherSha256; Maximum = 268435489 },
        @{ Path = $rolePath; Hash = $manifest.RolesCipherSha256; Maximum = 16777249 },
        @{ Path = $keyPath; Hash = $manifest.WrappedKeySha256; Maximum = 8192 }
    )) {
        if ($entry.Hash -notmatch '^[0-9a-f]{64}$' -or (Get-Item -LiteralPath $entry.Path).Length -gt $entry.Maximum -or
            (Get-FileHash -LiteralPath $entry.Path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Hash) {
            throw 'An encrypted artifact failed size/hash verification.'
        }
    }
    $stage = 'authenticated_decryption_in_memory'
    $key = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($keyPath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ($key.Length -ne 32) { throw 'Invalid AES key length.' }
    $node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $crypto = Join-Path $PSScriptRoot 'stage04-backup-crypto.mjs'
    $databaseBytes = Invoke-BinaryProcess -Executable $node -Arguments @($crypto, 'decrypt') -Prefix $key -Payload ([IO.File]::ReadAllBytes($databasePath))
    $roleBytes = Invoke-BinaryProcess -Executable $node -Arguments @($crypto, 'decrypt') -Prefix $key -Payload ([IO.File]::ReadAllBytes($rolePath)) -MaximumBytes 16777216
    if ($databaseBytes.Length -ne $manifest.DatabasePlainBytes -or $roleBytes.Length -ne $manifest.RolesPlainBytes -or
        (Get-BytesSha256 $databaseBytes) -cne $manifest.DatabasePlainSha256 -or
        (Get-BytesSha256 $roleBytes) -cne $manifest.RolesPlainSha256 -or
        [Text.Encoding]::ASCII.GetString($databaseBytes, 0, 5) -cne 'PGDMP') { throw 'Decrypted artifact integrity mismatch.' }

    $stage = 'verify_local_docker_and_archive_dependencies'
    $dockerExecutable = (Get-Command docker -CommandType Application | Select-Object -First 1).Source
    $dockerEndpoint = Get-VerifiedLocalDockerEndpoint -Executable $dockerExecutable
    $drillId = if ($SupervisionRunId) { $SupervisionRunId } else { [Guid]::NewGuid().ToString('N') }
    $containerName = 'stage04-isolated-restore-' + $drillId
    $authContainerName = 'stage04-auth-restored-' + $drillId
    $localOwner = 'supabase_admin'
    # Root verified this digest's postgres uid=100/gid=101. Bypass platform
    # seeding but preserve the confirmed source bootstrap name/OID 10. Only
    # fixed shell text and this fixed non-secret role enter the shell.
    $bootstrap = 'set -eu; initdb -D /var/lib/postgresql/data --username="$1" --auth-local=trust --auth-host=reject --no-locale; exec postgres -D /var/lib/postgresql/data -c shared_preload_libraries= -c listen_addresses= -c unix_socket_directories=/var/run/postgresql -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_min_messages=panic'
    if ($VerifyRestoredAuth) {
        # Both containers share this network-none namespace. No host ports or
        # external connectivity are added. Reject every host rule except this
        # exact loopback/database/Auth-role SCRAM rule; no real password is used.
        $bootstrap = 'set -eu; initdb -D /var/lib/postgresql/data --username="$1" --auth-local=trust --auth-host=reject --no-locale; { printf "%s\n" "host postgres supabase_auth_admin 127.0.0.1/32 scram-sha-256"; cat /var/lib/postgresql/data/pg_hba.conf; } > /var/lib/postgresql/data/pg_hba.auth-probe; mv /var/lib/postgresql/data/pg_hba.auth-probe /var/lib/postgresql/data/pg_hba.conf; exec postgres -D /var/lib/postgresql/data -c shared_preload_libraries= -c listen_addresses=127.0.0.1 -c unix_socket_directories=/var/run/postgresql -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_min_messages=panic'
    }
    $containerMayExist = $true
    $null = Invoke-IsolatedDocker -Arguments @('run', '--detach', '--rm', '--log-driver', 'none', '--name', $containerName,
        '--network', 'none', '--read-only', '--user', 'postgres', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--memory', '1536m', '--memory-swap', '1536m', '--pids-limit', '128',
        '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=1024m,uid=100,gid=101,mode=0700',
        '--tmpfs', '/var/run/postgresql:rw,noexec,nosuid,size=4m,uid=100,gid=101,mode=0770',
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m,uid=100,gid=101',
        '--entrypoint', '/bin/sh', $image, '-c', $bootstrap, 'stage04-bootstrap', $localOwner)
    $isolationJson = (Invoke-IsolatedDocker -Arguments @('inspect', '--format', '{{json .}}', $containerName)).Text | ConvertFrom-Json
    if ($isolationJson.HostConfig.NetworkMode -cne 'none' -or $isolationJson.HostConfig.LogConfig.Type -cne 'none' -or
        -not $isolationJson.HostConfig.ReadonlyRootfs -or
        $isolationJson.HostConfig.Memory -ne 1610612736 -or
        $isolationJson.HostConfig.MemorySwap -ne $isolationJson.HostConfig.Memory -or
        ($null -ne $isolationJson.HostConfig.Binds -and @($isolationJson.HostConfig.Binds).Count -gt 0) -or
        @($isolationJson.Mounts | Where-Object { $_.Type -cne 'tmpfs' }).Count -gt 0) {
        throw 'The disposable container isolation does not match the approved contract.'
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $probe = Invoke-IsolatedDocker -Arguments @('exec', '--user', 'postgres', $containerName, 'pg_isready', '-h', '/var/run/postgresql', '-U', $localOwner, '-d', 'postgres') -AllowFailure $true
        if ($probe.ExitCode -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Disposable PostgreSQL did not become ready.' }
    $tocArguments = @('exec', '-i', '--user', 'postgres', $containerName, 'pg_restore', '--list')
    # pg_restore --list itself filters DATABASE/PROPERTIES/ACL unless --create
    # is selected. Missing entries in its default listing prove no absence.
    if ($VerifyDatabaseMetadata -or $InspectDatabaseMetadata) { $tocArguments += '--create' }
    $toc = (Invoke-IsolatedDocker -Arguments $tocArguments -InputBytes $databaseBytes).Text
    if ($InspectDatabaseMetadata) {
        $stage = 'inspect_archived_database_metadata_only'
        $inventory = Get-DatabaseMetadataInventory -Toc $toc
        $report = [PSCustomObject] @{
            BackupId = $BackupId; DrillId = $drillId; ProjectRef = 'ucmwykzrepmjucssjnum'
            TimestampUtc = [DateTime]::UtcNow.ToString('o'); Phase = 'archive_database_metadata_inventory_only'
            CiphertextHashesVerified = $true; GcmAuthenticated = $true; PlainHashesVerified = $true
            DatabaseMetadataInventory = $inventory
            RolesSqlExecuted = $false; DatabaseArchiveSqlExecuted = $false
            DatabasePropertiesOwnerAclSettingsVerified = $false; SupabaseAuthRecoveryVerified = $false
            FullSupabaseRecoveryVerified = $false; RpoZeroVerified = $false
            Limitation = 'TOC metadata counts only; does not restore or verify DATABASE properties, roles, data or Auth.'
        }
        $reportPath = [IO.Path]::Combine($backupDirectory, 'isolated-metadata-inspection-' + $drillId + '.json')
    } else {
    $requiredExtensions = @([regex]::Matches($toc, '(?m)^\d+;\s+\d+\s+\d+\s+EXTENSION\s+-\s+([a-zA-Z0-9_-]+)\s*$') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $psql = @('exec', '-i', '--user', 'postgres', $containerName, 'psql', '-X', '--no-password', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=sqlstate', '--host', '/var/run/postgresql', '--username', $localOwner, '--dbname', 'postgres')
    $availableJson = (Invoke-IsolatedDocker -Arguments $psql -InputBytes ([Text.Encoding]::UTF8.GetBytes('select coalesce(json_agg(json_build_object(''name'',name,''version'',default_version)), ''[]''::json) from pg_available_extensions;'))).Text
    $available = @($availableJson.Trim() | ConvertFrom-Json)
    $missing = @($requiredExtensions | Where-Object { $_ -cnotin @($available | ForEach-Object { $_.name }) })
    if ($missing.Count) {
        # Extension names only, never SQL, hashes, row values or raw errors.
        $stage = 'missing_extension_dependencies_' + ($missing -join '_')
        throw 'A reviewed compatible Supabase image/recipe is required.'
    }
    # Current read-only source inventory; any version drift requires a reviewed
    # recipe. Default-version matching avoids an implicit extension upgrade when
    # pg_restore executes CREATE EXTENSION without a VERSION clause.
    $sourceExtensionVersions = @{ plpgsql = '1.0'; pg_stat_statements = '1.11'; 'uuid-ossp' = '1.1'; pgcrypto = '1.3'; supabase_vault = '0.3.1' }
    foreach ($extensionName in $sourceExtensionVersions.Keys) {
        $availableMatch = @($available | Where-Object { $_.name -ceq $extensionName -and $_.version -ceq $sourceExtensionVersions[$extensionName] })
        if ($availableMatch.Count -ne 1) {
            $stage = 'extension_version_dependency_' + $extensionName
            throw 'Required source extension version is not the image default.'
        }
    }

    $stage = 'restore_all_roles_without_passwords'
    $bootstrapSql = 'select json_build_object(''bootstrap_identity_verified'',exists(select 1 from pg_roles where oid=10 and rolname=''supabase_admin'' and rolsuper and rolcreaterole),''current_actor_verified'',current_user=''supabase_admin'' and session_user=''supabase_admin'');'
    $bootstrapCheck = (Invoke-IsolatedDocker -Arguments $psql -InputBytes ([Text.Encoding]::UTF8.GetBytes($bootstrapSql))).Text.Trim() | ConvertFrom-Json
    if (-not $bootstrapCheck.bootstrap_identity_verified -or -not $bootstrapCheck.current_actor_verified) { throw 'Local bootstrap identity/attributes do not match the reviewed recipe.' }
    $roleReplay = Get-LocalBootstrapRoleReplay -InputBytes $roleBytes
    $roleReplayBytes = $roleReplay.Bytes
    # Explicit local adaptation, not an unfiltered replay: exactly one already
    # satisfied CREATE is blanked. All ALTER/configuration/membership grants run.
    $null = Invoke-IsolatedDocker -Arguments ($psql + @('--single-transaction', '--file=-')) -InputBytes $roleReplayBytes -Operation 'roles_restore'
    $databaseMetadataReplay = $null
    if ($VerifyDatabaseMetadata) {
        $null = Invoke-IsolatedDocker -Arguments $psql -InputBytes ([Text.Encoding]::UTF8.GetBytes('CREATE DATABASE stage04_restore_control TEMPLATE template0;'))
        $stage = 'validate_archived_database_metadata'
        $databaseMetadataReplay = Get-DatabaseMetadataReplay -Toc $toc
        $databaseMetadataBytes = $databaseMetadataReplay.Bytes
        # The TOC list contains metadata identifiers only, lives in the existing
        # container tmpfs and is deleted with that exact disposable container.
        # No archive SQL or application data is written to this list.
        $null = Invoke-IsolatedDocker -Arguments @('exec', '-i', '--user', 'postgres', $containerName,
            'sh', '-c', 'umask 077; cat > /tmp/stage04-database-metadata.list') -InputBytes $databaseMetadataBytes
        $stage = 'restore_database_metadata_outside_transaction'
        # CREATE DATABASE cannot run inside the full replay transaction. Only
        # the disposable postgres database is recreated, from the archive's own
        # DATABASE command. This pass never connects to a remote server.
        $null = Invoke-IsolatedDocker -Arguments @('exec', '-i', '--user', 'postgres', $containerName, 'pg_restore',
            '--no-password', '--host', '/var/run/postgresql', '--username', $localOwner,
            '--dbname', 'stage04_restore_control', '--create', '--clean', '--if-exists', '--exit-on-error',
            '--use-list', '/tmp/stage04-database-metadata.list') -InputBytes $databaseBytes -Operation 'database_restore'
    }
    $stage = 'restore_full_database_single_transaction'
    $null = Invoke-IsolatedDocker -Arguments @('exec', '-i', '--user', 'postgres', $containerName, 'pg_restore',
        '--no-password', '--host', '/var/run/postgresql', '--username', $localOwner, '--dbname', 'postgres',
        '--exit-on-error', '--single-transaction', '--clean', '--if-exists') -InputBytes $databaseBytes -Operation 'database_restore'
    $stage = 'check_local_integrity_catalogs'
    $catalogSql = @'
begin transaction read only;
with business_keys as (
 select 'empleados'::text as table_name, id as row_id, jsonb_build_array(id)::text as fk_tuple from public.empleados
 union all select 'rutinas', id, jsonb_build_array(id)::text from public.rutinas
 union all select 'tareas_rutina', id, jsonb_build_array(id,rutina_id)::text from public.tareas_rutina
 union all select 'empleado_rutinas', id, jsonb_build_array(id,empleado_id,rutina_id)::text from public.empleado_rutinas
 union all select 'auditoria_diaria', id, jsonb_build_array(id,tarea_id,empleado_id)::text from public.auditoria_diaria
 union all select 'tareas_urgentes', id, jsonb_build_array(id,empleado_id)::text from public.tareas_urgentes
), business_integrity as (
 select labels.table_name, count(keys.row_id) as row_count,
  encode(sha256(convert_to(coalesce(string_agg(keys.row_id::text, chr(10) order by keys.row_id) filter (where keys.row_id is not null), ''), 'UTF8')), 'hex') as uuid_sha256,
  encode(sha256(convert_to(coalesce(string_agg(keys.fk_tuple, chr(10) order by keys.row_id) filter (where keys.row_id is not null), ''), 'UTF8')), 'hex') as uuid_fk_sha256
 from (values ('empleados'),('rutinas'),('tareas_rutina'),('empleado_rutinas'),('auditoria_diaria'),('tareas_urgentes')) as labels(table_name)
 left join business_keys as keys on keys.table_name=labels.table_name
 group by labels.table_name
)
select json_build_object(
 'schemas', (select json_agg(nspname order by nspname) from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema'),
 'tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not like 'pg_%' and n.nspname <> 'information_schema'),
 'foreign_keys', (select count(*) from pg_constraint where contype='f'),
 'unvalidated_constraints', (select count(*) from pg_constraint where not convalidated),
 'policies', (select count(*) from pg_policy),
 'rls_tables', (select count(*) from pg_class where relrowsecurity),
 'functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth')),
 'business_integrity_algorithm', 'sha256_utf8_newline_uuid_order_and_jsonb_uuid_fk_tuples_v1',
 'business_integrity', (select json_object_agg(table_name, json_build_object('row_count',row_count,'uuid_sha256',uuid_sha256,'uuid_fk_sha256',uuid_fk_sha256) order by table_name) from business_integrity)
);
rollback;
'@
    $catalogJson = (Invoke-IsolatedDocker -Arguments $psql -InputBytes ([Text.Encoding]::UTF8.GetBytes($catalogSql)) -Operation 'catalog_read').Text.Trim()
    $catalog = $catalogJson | ConvertFrom-Json
    $roleIntegritySql = @'
begin transaction read only;
with r as (
 select rolname, jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,(rolvaliduntil at time zone 'UTC')::text)::text as v,
 coalesce(array_length(rolconfig,1),0) as nc from pg_roles
), m as (
 select a.rolname as rn,b.rolname as mn,g.rolname as gn,
 jsonb_build_array(a.rolname,b.rolname,g.rolname,x.admin_option,x.inherit_option,x.set_option)::text as v
 from pg_auth_members x join pg_roles a on a.oid=x.roleid join pg_roles b on b.oid=x.member join pg_roles g on g.oid=x.grantor
)
select json_build_object(
 'role_count',(select count(*) from r),
 'role_attributes_sha256',(select encode(sha256(convert_to(coalesce(string_agg(v,chr(10) order by rolname collate "C"),''),'UTF8')),'hex') from r),
 'membership_count',(select count(*) from m),
 'membership_sha256',(select encode(sha256(convert_to(coalesce(string_agg(v,chr(10) order by rn collate "C",mn collate "C",gn collate "C"),''),'UTF8')),'hex') from m),
 'role_configuration_presence_counts_sha256',(select encode(sha256(convert_to(coalesce(string_agg(jsonb_build_array(rolname,nc)::text,chr(10) order by rolname collate "C"),''),'UTF8')),'hex') from r),
 'configuration_values_compared',false
);
rollback;
'@
    $roleIntegrity = (Invoke-IsolatedDocker -Arguments $psql -InputBytes ([Text.Encoding]::UTF8.GetBytes($roleIntegritySql)) -Operation 'catalog_read').Text.Trim() | ConvertFrom-Json
    $databaseMetadata = $null
    if ($VerifyDatabaseMetadata) {
        $stage = 'observe_restored_database_metadata'
        $databaseMetadata = (Invoke-IsolatedDocker -Arguments $psql -InputBytes ([Text.Encoding]::UTF8.GetBytes((Get-DatabaseMetadataCatalogSql))) -Operation 'catalog_read').Text.Trim() | ConvertFrom-Json
        if ($null -ne $observation) { Assert-DatabaseMetadataEquality -Expected $observation.database_metadata -Actual $databaseMetadata }
    }
    $authProbe = $null
    if ($VerifyRestoredAuth) {
        $stage = 'restored_empty_auth_baseline_probe'
        $authContainerMayExist = $true
        $probeInput = [Text.Encoding]::UTF8.GetBytes(([PSCustomObject]@{
            dbContainer=$containerName; dbSuperuser=$localOwner; prerequisitesVerified=$true
        } | ConvertTo-Json -Compress))
        try {
            $authProbeBytes = Invoke-BinaryProcess -Executable $node -Arguments @((Join-Path $PSScriptRoot 'stage04-auth-restore-probe.mjs')) -Payload $probeInput -MaximumBytes 65536
        } finally { [Array]::Clear($probeInput,0,$probeInput.Length) }
        $authProbe = [Text.UTF8Encoding]::new($false,$true).GetString($authProbeBytes) | ConvertFrom-Json
        if ($authProbe.authRestoredBaselineProbe -ne $true -or $authProbe.schemaMigrationsUnchanged -ne $true -or
            $authProbe.emptyRuntimeBaselineVerified -ne $true -or $authProbe.syntheticAdminCreateLoginRefreshRestartVerified -ne $true -or
            $authProbe.businessUuidFkUnchanged -ne $true -or $authProbe.exactAuthContainerCleanupVerified -ne $true) { throw 'Auth helper returned an incomplete baseline probe.' }
    }
    $report = [PSCustomObject] @{
        BackupId = $BackupId; DrillId = $drillId; ProjectRef = 'ucmwykzrepmjucssjnum'
        TimestampUtc = [DateTime]::UtcNow.ToString('o'); Image = $image
        SourceExtensionVersions = $sourceExtensionVersions; PlatformSeedEntrypointBypassed = $true
        CiphertextHashesVerified = $true; GcmAuthenticated = $true; PlainHashesVerified = $true
        RolesRestoredUnfiltered = $false; PgRestoreSingleTransactionExitZero = $true
        BootstrapRoleOid10VerifiedBeforeReplay = $true; BootstrapRoleCreateBlankedCount = $roleReplay.BlankedCreateRoleCount
        OriginalRolesSha256 = $roleReplay.OriginalSha256; ExecutedRolesSha256 = $roleReplay.ExecutedSha256
        RoleReplayAdaptation = 'Exactly one canonical CREATE ROLE supabase_admin line blanked in memory; all following ALTER/configuration/membership SQL retained.'
        RoleIntegrity = $roleIntegrity; SourceRoleComparisonVerified = $false
        Catalog = $catalog; Network = 'none'; DataStorage = 'tmpfs'; LogDriver = 'none'; ContainerSwapDisabled = $true
        HostPagingExcluded = $false
        SourceCatalogComparisonVerified = $false; UuidRowReconciliationVerified = $false
        DatabasePropertiesOwnerAclSettingsVerified = ($VerifyDatabaseMetadata -and $null -ne $observation)
        DatabaseMetadataPassRequested = [bool] $VerifyDatabaseMetadata
        DatabaseMetadataArchiveReplayExitZero = [bool] $VerifyDatabaseMetadata
        DatabaseMetadata = $databaseMetadata
        DatabaseMetadataSourceComparisonVerified = ($null -ne $observation)
        DatabaseMetadataReconstructedFromSupplement = $false
        DatabaseMetadataObservationSha256 = $DatabaseMetadataObservationSha256
        DatabaseMetadataObservationAtUtc = $(if ($null -eq $observation) { $null } else { $observation.observed_at_utc })
        DatabaseMetadataRecoveredFromOriginalArchive = [bool] $VerifyDatabaseMetadata
        DatabaseMetadataAsOfBackupCaptureVerified = $false
        DatabaseMetadataSelectedTocEntryCount = $(if ($null -eq $databaseMetadataReplay) { 0 } else { $databaseMetadataReplay.EntryCount })
        DatabaseMetadataSelectedTocSha256 = $(if ($null -eq $databaseMetadataReplay) { $null } else { $databaseMetadataReplay.Sha256 })
        RestoredEmptyAuthBaselineProbe = $authProbe
        SupabaseAuthRecoveryVerified = $false; FullSupabaseRecoveryVerified = $false
        RpoZeroVerified = $false; RtoIntegralVerified = $false; PortableKeyCustodyVerified = $false
        Limitation = 'DATABASE metadata, when opted in, is restored from the original archive; its comparison is against a separately timestamped observation. Auth probe, when opted in, covers only the empty baseline with new local keys and a synthetic account. No original-token continuity, full Supabase recovery, integral RTO or RPO0 claim. Business source comparison remains separate.'
    }
    # Save a PASS report only after cleanup is confirmed in finally.
    $reportPath = [IO.Path]::Combine($backupDirectory, 'isolated-restore-' + $drillId + '.json')
    }
} catch {
    $failure = 'Isolated PostgreSQL restore stopped at ' + $stage + '. Database archive objects were not excluded; the roles recipe permits only the reviewed single bootstrap CREATE adaptation. No raw diagnostics were emitted.'
    if ($_.Exception.Data.Contains('Stage04SafeDiagnostic')) {
        $safeDiagnostic = $_.Exception.Data['Stage04SafeDiagnostic']
        if ($safeDiagnostic -is [string] -and $safeDiagnostic -cmatch '^operation=(control|roles_restore|database_restore|dependency_probe|catalog_read);sqlstate=(none|[0-9A-Z]{5});cause=[a-z_]+;input_line=[0-9]{1,7};statement=(not_applicable|unknown|psql_control|create_role|alter_role_configuration|alter_role_attributes|grant_parameter_privileges|grant_membership|revoke_privileges|comment_role|security_label|session_configuration)$') {
            $failure += ' ' + $safeDiagnostic
        }
    }
    if ($_.Exception.Data.Contains('Stage04MetadataDiagnostic')) {
        $metadataDiagnostic = $_.Exception.Data['Stage04MetadataDiagnostic']
        if ($metadataDiagnostic -is [string] -and $metadataDiagnostic -cmatch '^cause=(missing_database_entry|duplicate_database_entry|unexpected_database_metadata_identity);database_entries=[0-9]{1,7};properties_entries=[0-9]{1,7};acl_entries=[0-9]{1,7};unexpected_identity_entries=[0-9]{1,7}$') {
            $failure += ' metadata_' + $metadataDiagnostic
        }
    }
} finally {
    if ($authContainerMayExist -and $null -ne $dockerExecutable -and $null -ne $dockerEndpoint) {
        try {
            $null = Invoke-IsolatedDocker -Arguments @('rm', '--force', $authContainerName) -AllowFailure $true
            $authRemaining = Invoke-IsolatedDocker -Arguments @('container', 'ls', '--all', '--filter', ('name=^/' + $authContainerName + '$'), '--format', '{{.Names}}')
            if (-not [string]::IsNullOrWhiteSpace($authRemaining.Text)) { throw 'The exact Auth container remains.' }
        } catch {
            $cleanupFailure = 'Auth probe cleanup could not be confirmed for ' + $authContainerName + '; no success report was written.'
            if ($null -eq $failure) { $failure=$cleanupFailure } else { $failure+=' '+$cleanupFailure }
        }
    }
    if ($containerMayExist -and $null -ne $dockerExecutable -and $null -ne $dockerEndpoint) {
        try {
            $cleanup = Invoke-IsolatedDocker -Arguments @('rm', '--force', $containerName) -AllowFailure $true
            $remainingContainer = Invoke-IsolatedDocker -Arguments @('container', 'ls', '--all', '--filter', ('name=^/' + $containerName + '$'), '--format', '{{.Names}}')
            if (-not [string]::IsNullOrWhiteSpace($remainingContainer.Text)) { throw 'The exact disposable container remains.' }
        } catch {
            $cleanupFailure = 'Isolated restore cleanup could not be confirmed for ' + $containerName + '; no success report was written.'
            if ($null -eq $failure) { $failure = $cleanupFailure } else { $failure += ' ' + $cleanupFailure }
        }
    }
    foreach ($bytes in @($key, $databaseBytes, $roleBytes, $roleReplayBytes, $databaseMetadataBytes, $observationBytes, $authProbeBytes)) {
        if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    }
}
if ($null -ne $failure) { throw $failure }
if ($null -eq $reportPath) { throw 'No validated local restore report is available.' }
$report | Add-Member -NotePropertyName ContainerCleanupVerified -NotePropertyValue $true
if ($SupervisionRunId) { $report | Add-Member -NotePropertyName SupervisionRunId -NotePropertyValue $SupervisionRunId }
if ($SupervisionRunId) {
    $report | Add-Member -NotePropertyName ManifestSha256 -NotePropertyValue (Get-BytesSha256 $supervisedManifestBytes)
    $snapshotProperty=$manifest.PSObject.Properties['ExportedSnapshot']
    $report | Add-Member -NotePropertyName ExportedSnapshot -NotePropertyValue $(if ($null -eq $snapshotProperty) { $null } else { $snapshotProperty.Value })
    $report | Add-Member -NotePropertyName DatabaseCipherSha256 -NotePropertyValue $manifest.DatabaseCipherSha256
    $report | Add-Member -NotePropertyName RolesCipherSha256 -NotePropertyValue $manifest.RolesCipherSha256
}
$reportBytes = [Text.Encoding]::UTF8.GetBytes(($report | ConvertTo-Json -Depth 8))
Write-NewPrivateFile -LiteralPath $reportPath -Bytes $reportBytes -OwnerSid $ownerSid
if ($InspectDatabaseMetadata) {
    Write-Host 'Archive metadata inventory completed without replaying roles/database SQL; its disposable container was removed. Recovery remains unverified.'
} else {
    Write-Host 'Isolated PostgreSQL restore completed and its disposable container was removed. Full Supabase recovery remains unverified.'
}
Write-Host $reportPath
