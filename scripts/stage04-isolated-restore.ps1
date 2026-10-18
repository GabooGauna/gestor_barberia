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
    [string] $BackupId
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'Only the explicit BackupId is accepted.' }
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

$key = $null; $databaseBytes = $null; $roleBytes = $null; $roleReplayBytes = $null
$containerName = $null; $containerMayExist = $false
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
    foreach ($path in @($application, $backupRoot, $backupDirectory, $secretDirectory, $keyPath, $manifestPath, $databasePath, $rolePath)) {
        Assert-NoReparsePath $path
        Assert-PrivateAcl -LiteralPath $path -OwnerSid $ownerSid
    }
    if ((Get-Item -LiteralPath $manifestPath).Length -gt 65536) { throw 'Oversized manifest rejected.' }
    $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
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
    $drillId = [Guid]::NewGuid().ToString('N')
    $containerName = 'stage04-isolated-restore-' + $drillId
    $localOwner = 'supabase_admin'
    # Root verified this digest's postgres uid=100/gid=101. Bypass platform
    # seeding but preserve the confirmed source bootstrap name/OID 10. Only
    # fixed shell text and this fixed non-secret role enter the shell.
    $bootstrap = 'set -eu; initdb -D /var/lib/postgresql/data --username="$1" --auth-local=trust --auth-host=reject --no-locale; exec postgres -D /var/lib/postgresql/data -c shared_preload_libraries= -c listen_addresses= -c unix_socket_directories=/var/run/postgresql -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_min_messages=panic'
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
    $toc = (Invoke-IsolatedDocker -Arguments @('exec', '-i', '--user', 'postgres', $containerName, 'pg_restore', '--list') -InputBytes $databaseBytes).Text
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
        DatabasePropertiesOwnerAclSettingsVerified = $false
        SupabaseAuthRecoveryVerified = $false; FullSupabaseRecoveryVerified = $false
        RpoZeroVerified = $false; RtoIntegralVerified = $false; PortableKeyCustodyVerified = $false
        Limitation = 'PostgreSQL schema/data restore only. DATABASE properties/owner/ACL/settings require a separate reviewed verification/restore procedure; do not add --create to a single-transaction restore blindly. Requires source UUID/count/FK/ACL comparison and full provider/Auth/config/key/Storage recovery evidence.'
    }
    # Save a PASS report only after cleanup is confirmed in finally.
    $reportPath = [IO.Path]::Combine($backupDirectory, 'isolated-restore-' + $drillId + '.json')
} catch {
    $failure = 'Isolated PostgreSQL restore stopped at ' + $stage + '. Database archive objects were not excluded; the roles recipe permits only the reviewed single bootstrap CREATE adaptation. No raw diagnostics were emitted.'
    if ($_.Exception.Data.Contains('Stage04SafeDiagnostic')) {
        $safeDiagnostic = $_.Exception.Data['Stage04SafeDiagnostic']
        if ($safeDiagnostic -is [string] -and $safeDiagnostic -cmatch '^operation=(control|roles_restore|database_restore|dependency_probe|catalog_read);sqlstate=(none|[0-9A-Z]{5});cause=[a-z_]+;input_line=[0-9]{1,7};statement=(not_applicable|unknown|psql_control|create_role|alter_role_configuration|alter_role_attributes|grant_parameter_privileges|grant_membership|revoke_privileges|comment_role|security_label|session_configuration)$') {
            $failure += ' ' + $safeDiagnostic
        }
    }
} finally {
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
    foreach ($bytes in @($key, $databaseBytes, $roleBytes, $roleReplayBytes)) {
        if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    }
}
if ($null -ne $failure) { throw $failure }
if ($null -eq $reportPath) { throw 'No validated local restore report is available.' }
$report | Add-Member -NotePropertyName ContainerCleanupVerified -NotePropertyValue $true
$reportBytes = [Text.Encoding]::UTF8.GetBytes(($report | ConvertTo-Json -Depth 8))
Write-NewPrivateFile -LiteralPath $reportPath -Bytes $reportBytes -OwnerSid $ownerSid
Write-Host 'Isolated PostgreSQL restore completed and its disposable container was removed. Full Supabase recovery remains unverified.'
Write-Host $reportPath
