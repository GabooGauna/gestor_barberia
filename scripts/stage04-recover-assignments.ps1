#requires -Version 5.1
# Candidate exact-assignment recovery. Review BEFORE executing either action.
# Extract is default/local only. Apply is an EXPLICIT separate remote repair;
# neither action selects PIN or prints rows. No capture, Auth or migration.
param(
    [ValidateSet('Extract','Rehearse','Apply')][string] $Action='Extract',
    [ValidatePattern('^[0-9a-f]{32}$')][string] $RecoveryId,
    [ValidatePattern('^[0-9a-f]{64}$')][string] $PackageSha256,
    [ValidatePattern('^[0-9a-f]{64}$')][string] $RepairSqlSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$argumentVariable=Get-Variable -Name args -Scope Local -ErrorAction SilentlyContinue
if ($null -ne $argumentVariable -and @($argumentVariable.Value).Count -gt 0) { throw 'Unexpected positional arguments rejected.' }
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows current-user DPAPI required.' }
foreach ($source in @(
    @{File='stage04-store-db-credential.ps1';Names=@('Assert-NoReparsePath','Assert-LocalOnlyDestination','Assert-PrivateAcl','Set-PrivateAcl')},
    @{File='stage04-encrypted-backup.ps1';Names=@('ConvertTo-ProcessArgument','Invoke-BinaryProcess','Get-VerifiedLocalDockerEndpoint','Get-BytesSha256','Write-NewPrivateFile')}
)) {
    $tokens=$null;$errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $source.File),[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw 'Reviewed helper source failed to parse.' }
    foreach ($name in $source.Names) {
        $nodes=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false))
        if ($nodes.Count -ne 1) { throw 'Reviewed helper unavailable.' }
        . ([scriptblock]::Create($nodes[0].Extent.Text))
    }
}
$backupId='ab70bce0fa53469f8f8659c4564970ba'
$runId=[Guid]::NewGuid().ToString('N')
$container='stage04-assignment-extract-'+$runId
$expectedUuid='48cf4bd6a0d2b09629e36dcfb9d3be7210edaec5c6b6dbbea2209c723996855f'
$expectedFk='da48ea43f92199f8de6c21fa881b489f2ed48ef0eb5cf5818543cace32b78d31'
$key=$null;$archive=$null;$rowBytes=$null;$payload=$null;$docker=$null;$endpoint=$null;$containerMayExist=$false
$packagePath=$null;$failure=$null;$stage='local_artifact_validation';$cleanupVerified=$false
function Invoke-ExtractorDocker([string[]] $Arguments,[byte[]] $InputBytes=@(),[int] $MaximumBytes=2097152) {
    return ,(Invoke-BinaryProcess -Executable $script:docker -Arguments (@('--host',$script:endpoint)+$Arguments) -Payload $InputBytes -MaximumBytes $MaximumBytes -AllowEmpty)
}
function Invoke-AssignmentRehearsal {
    param([byte[]] $RowsBytes,[string] $BoundSql,[string] $Id)
    $name='stage04-assignment-rehearse-'+$Id;$mayExist=$false;$clean=$false;$result=$null
    $script:docker=(Get-Command docker -CommandType Application | Select-Object -First 1).Source
    $script:endpoint=Get-VerifiedLocalDockerEndpoint $script:docker
    try {
        $image='public.ecr.aws/supabase/postgres:17.11.0.004@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108'
        $bootstrap='set -eu; initdb -D /var/lib/postgresql/data --username=postgres --auth-local=trust --auth-host=reject --no-locale >/dev/null 2>&1; exec postgres -D /var/lib/postgresql/data -c shared_preload_libraries= -c listen_addresses= -c unix_socket_directories=/var/run/postgresql -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_min_messages=panic'
        $mayExist=$true
        $null=Invoke-ExtractorDocker @('run','--detach','--pull','never','--name',$name,'--network','none','--log-driver','none','--read-only','--user','postgres','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--memory-swap','512m','--pids-limit','64',
            '--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,nodev,uid=100,gid=101,mode=0700','--tmpfs','/var/run/postgresql:rw,noexec,nosuid,nodev,uid=100,gid=101,mode=0755',
            '--tmpfs','/tmp:rw,noexec,nosuid,nodev,mode=1777','--entrypoint','sh',$image,'-c',$bootstrap)
        $state=[Text.Encoding]::UTF8.GetString((Invoke-ExtractorDocker @('inspect','--format','{{json .}}',$name))) | ConvertFrom-Json
        if ($state.HostConfig.NetworkMode -cne 'none' -or $state.HostConfig.LogConfig.Type -cne 'none' -or -not $state.HostConfig.ReadonlyRootfs -or
            ($null -ne $state.HostConfig.Binds -and @($state.HostConfig.Binds).Count -gt 0) -or
            ($null -ne $state.HostConfig.PortBindings -and @($state.HostConfig.PortBindings.PSObject.Properties).Count -gt 0) -or
            $state.HostConfig.Memory -ne $state.HostConfig.MemorySwap -or @($state.Mounts | Where-Object {$_.Type -cne 'tmpfs'}).Count -gt 0) { throw 'Rehearsal isolation failed.' }
        $ready=$false
        for($i=0;$i -lt 60;$i++){try{$null=Invoke-ExtractorDocker @('exec',$name,'pg_isready','-h','/var/run/postgresql','-U','postgres','-d','postgres');$ready=$true;break}catch{Start-Sleep -Milliseconds 100}}
        if(-not $ready){throw 'Rehearsal PostgreSQL not ready.'}
        $psql=@('exec','-i','--user','postgres',$name,'psql','-XqAt','--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--host','/var/run/postgresql','--username','postgres','--dbname','postgres')
        # Only recovered FK UUIDs enter dummy parents. No employee/PIN/profile,
        # original archive, Auth schema or other original rows are accessed.
        $fixture=@'
CREATE TABLE public.empleados(id uuid PRIMARY KEY,nombre text NOT NULL,rol text NOT NULL);
CREATE TABLE public.rutinas(id uuid PRIMARY KEY);
CREATE TABLE public.tareas_rutina(id uuid PRIMARY KEY);
CREATE TABLE public.auditoria_diaria(id uuid PRIMARY KEY);
CREATE TABLE public.tareas_urgentes(id uuid PRIMARY KEY);
CREATE TABLE public.empleado_rutinas(id uuid PRIMARY KEY,empleado_id uuid REFERENCES public.empleados(id),rutina_id uuid REFERENCES public.rutinas(id),UNIQUE(empleado_id,rutina_id));
INSERT INTO public.empleados(id,nombre,rol) SELECT DISTINCT empleado_id,'synthetic','empleado' FROM jsonb_to_recordset(convert_from(decode('__ROWS__','base64'),'UTF8')::jsonb) AS r(empleado_id uuid);
INSERT INTO public.rutinas(id) SELECT DISTINCT rutina_id FROM jsonb_to_recordset(convert_from(decode('__ROWS__','base64'),'UTF8')::jsonb) AS r(rutina_id uuid);
'@
        $fixture=$fixture.Replace('__ROWS__',[Convert]::ToBase64String($RowsBytes))
        $null=Invoke-ExtractorDocker $psql ([Text.Encoding]::UTF8.GetBytes($fixture))
        $proof=[Text.Encoding]::UTF8.GetString((Invoke-ExtractorDocker $psql ([Text.Encoding]::UTF8.GetBytes($BoundSql)))) | ConvertFrom-Json
        if($proof.kind -cne 'stage04.assignment_recovery.v1' -or $proof.row_count -ne 3 -or $proof.uuid_sha256 -cne $script:expectedUuid -or
            $proof.uuid_fk_sha256 -cne $script:expectedFk -or $proof.other_business_preserved -isnot [bool] -or $proof.other_business_preserved -ne $true){throw 'Rehearsal positive proof failed.'}
        # Execute the SAME reviewed SQL again. Capture ONLY SQLSTATE, never
        # return stderr/SQL/rows. It must specifically reject target nonempty.
        $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$script:docker
        $start.Arguments=((@('--host',$script:endpoint)+$psql | ForEach-Object {ConvertTo-ProcessArgument $_}) -join ' ')
        $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
        $process=[Diagnostics.Process]::new();$process.StartInfo=$start;$started=$false
        try {
            if(-not $process.Start()){throw 'Negative rehearsal process failed.'};$started=$true
            $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
            $bytes=[Text.Encoding]::UTF8.GetBytes($BoundSql)
            $write=$process.StandardInput.BaseStream.WriteAsync($bytes,0,$bytes.Length)
            if(-not $write.Wait(30000)){throw 'Negative rehearsal input timeout.'};$process.StandardInput.Close()
            if(-not $process.WaitForExit(30000) -or -not $out.Wait(5000) -or -not $err.Wait(5000)){throw 'Negative rehearsal timeout.'}
            if($process.ExitCode -eq 0 -or $err.Result.Length -gt 65536 -or $err.Result -cnotmatch '(?m)^ERROR:\s+40001\s*\r?$'){throw 'Expected nonempty-target rejection missing.'}
        } finally {if($started -and -not $process.HasExited){$process.Kill();$process.WaitForExit()};$process.Dispose()}
        $verify="SELECT json_build_object('row_count',count(id),'uuid_sha256',encode(sha256(convert_to(string_agg(id::text,chr(10) order by id),'UTF8')),'hex'),'uuid_fk_sha256',encode(sha256(convert_to(string_agg(jsonb_build_array(id,empleado_id,rutina_id)::text,chr(10) order by id),'UTF8')),'hex')) FROM public.empleado_rutinas;"
        $after=[Text.Encoding]::UTF8.GetString((Invoke-ExtractorDocker $psql ([Text.Encoding]::UTF8.GetBytes($verify)))) | ConvertFrom-Json
        if($after.row_count -ne 3 -or $after.uuid_sha256 -cne $script:expectedUuid -or $after.uuid_fk_sha256 -cne $script:expectedFk){throw 'Negative rehearsal changed recovered rows.'}
        $result=[pscustomobject]@{Action='Rehearse';RunId=$Id;ExactRowCount=3;OriginalUuidAndFkHashesVerified=$true;OtherFiveFixtureBusinessPreserved=$true;
            SameReviewedSqlPositiveVerified=$true;NonemptyTargetRejectedSqlstate='40001';NegativeAttemptRolledBack=$true;
            SourceConnected=$false;OriginalArchiveRead=$false;OtherOriginalRowsRead=$false;AuthInvoked=$false;RowsPrinted=$false;PinSelected=$false}
    } finally {
        if($mayExist){try{try{$null=Invoke-ExtractorDocker @('rm','--force',$name)}catch{};$remaining=[Text.Encoding]::UTF8.GetString((Invoke-ExtractorDocker @('container','ls','--all','--filter',('name=^/'+$name+'$'),'--format','{{.Names}}'))).Trim();$clean=($remaining -ceq '')}catch{$clean=$false}}
        if(-not $clean){throw 'Assignment rehearsal cleanup unconfirmed.'}
    }
    $result | Add-Member -NotePropertyName ContainerCleanupVerified -NotePropertyValue $true
    return $result
}
if ($Action -in @('Apply','Rehearse')) {
    if (-not $RecoveryId -or -not $PackageSha256 -or -not $RepairSqlSha256) { throw 'Package actions require explicit recovery/package/SQL identities.' }
    $submitted=$false;$rowsSecure=$null;$rowsBuffer=$null;$requestBytes=$null
    try {
        $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
        if ($sid.Value -eq 'S-1-5-18') { throw 'Named custodian required.' }
        $app=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) 'GestorBarberia'
        $recoveryDirectory=Join-Path $app 'recovery'
        $path=Join-Path $recoveryDirectory ('stage04-assignments-'+$RecoveryId+'.clixml')
        Assert-LocalOnlyDestination $path
        foreach($item in @($app,$recoveryDirectory,$path)) { Assert-NoReparsePath $item;Assert-PrivateAcl -LiteralPath $item -OwnerSid $sid }
        if ((Get-Item -LiteralPath $path).Length -gt 131072 -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $PackageSha256) { throw 'Package integrity rejected.' }
        $package=Import-Clixml -LiteralPath $path
        if ($package.FormatVersion -ne 1 -or $package.Purpose -cne 'stage04_exact_historical_assignments_recovery' -or
            $package.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $package.RunId -cne $RecoveryId -or $package.BackupId -cne $backupId -or
            $package.RowCount -ne 3 -or $package.UuidSha256 -cne $expectedUuid -or $package.UuidFkSha256 -cne $expectedFk -or
            $package.IntegrityAlgorithm -cne 'sha256_utf8_newline_uuid_order_and_jsonb_uuid_fk_tuples_v1' -or $package.Rows -isnot [Security.SecureString]) { throw 'Recovery package binding rejected.' }
        $sourceManifestPath=Join-Path (Join-Path (Join-Path $app 'backups') ('stage04-'+$backupId)) 'manifest.json'
        Assert-NoReparsePath $sourceManifestPath;Assert-PrivateAcl -LiteralPath $sourceManifestPath -OwnerSid $sid
        if ((Get-FileHash -LiteralPath $sourceManifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $package.SourceManifestSha256) { throw 'Original manifest binding changed.' }
        $rowsSecure=$package.Rows
        $rowJson=[Net.NetworkCredential]::new('recovery_rows',$rowsSecure).Password
        $rows=$rowJson | ConvertFrom-Json
        if (@($rows).Count -ne 3) { throw 'Recovery row count rejected.' }
        foreach($row in $rows) {
            if ((@($row.PSObject.Properties.Name | Sort-Object) -join '|') -cne 'empleado_id|id|rutina_id') { throw 'Recovery fields rejected.' }
            foreach($name in @('id','empleado_id','rutina_id')) {
                if ($null -ne $row.$name) { $null=[Guid]::ParseExact($row.$name,'D') }
                elseif ($name -ceq 'id') { throw 'Recovery UUID missing.' }
            }
        }
        $rowsBuffer=[Text.Encoding]::UTF8.GetBytes($rowJson)
        $templatePath=Join-Path $PSScriptRoot '..\supabase\repairs\stage04-recover-existing-assignments.sql'
        if ($RepairSqlSha256 -cne '71f0172c87b993252a5165df5ddd830585e636360662802782398aa1782e925f' -or
            (Get-FileHash -LiteralPath $templatePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $RepairSqlSha256) { throw 'Reviewed repair SQL changed.' }
        $template=[Text.UTF8Encoding]::new($false,$true).GetString([IO.File]::ReadAllBytes($templatePath))
        if ([regex]::Matches($template,'__STAGE04_ROWS_BASE64__').Count -ne 1) { throw 'Expected one bounded recovery placeholder.' }
        $sql=$template.Replace('__STAGE04_ROWS_BASE64__',[Convert]::ToBase64String($rowsBuffer))
        if($Action -eq 'Rehearse') {
            Invoke-AssignmentRehearsal -RowsBytes $rowsBuffer -BoundSql $sql -Id $runId | ConvertTo-Json -Compress
            return
        }
        $requestId=[Guid]::NewGuid().ToString('N').Substring(0,24)
        $request=@{id=$requestId;operation='query';sqlBase64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sql))} | ConvertTo-Json -Compress
        $close=@{id=([Guid]::NewGuid().ToString('N').Substring(0,24));operation='close'} | ConvertTo-Json -Compress
        $requestBytes=[Text.Encoding]::UTF8.GetBytes($request+"`n"+$close+"`n")
        $pwsh=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)) '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe'
        if (-not [IO.File]::Exists($pwsh)) { throw 'Reviewed PS7 runtime unavailable; no fallback.' }
        $submitted=$true
        $replyBytes=Invoke-BinaryProcess -Executable $pwsh -Arguments @('-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',
            (Join-Path $PSScriptRoot 'stage04-cutover-runtime.ps1'),'-Mode','Session','-RunId',$runId,'-SessionKind','holder') -Payload $requestBytes -MaximumBytes 65536
        $messages=@([Text.Encoding]::UTF8.GetString($replyBytes).Split([char]10) | Where-Object {$_.Trim()} | ForEach-Object {$_ | ConvertFrom-Json})
        $acks=@($messages | Where-Object {$null -ne $_.PSObject.Properties['id'] -and $_.id -ceq $requestId})
        if ($acks.Count -ne 1 -or $acks[0].ok -isnot [bool] -or $acks[0].ok -ne $true) { throw 'Repair acknowledgement missing.' }
        $proof=$acks[0].text | ConvertFrom-Json
        # Root-owned SQL returns metadata-only post-COMMIT acknowledgement.
        if ($proof.kind -cne 'stage04.assignment_recovery.v1' -or $proof.row_count -ne 3 -or $proof.uuid_sha256 -cne $expectedUuid -or
            $proof.uuid_fk_sha256 -cne $expectedFk -or $proof.other_business_preserved -isnot [bool] -or $proof.other_business_preserved -ne $true) { throw 'Repair acknowledgement integrity differs.' }
        [pscustomobject]@{Action='Apply';RunId=$runId;RecoveryId=$RecoveryId;ExactRowCount=3;UuidAndFkHashesVerified=$true;
            CommitAcknowledged=$true;AutomaticRetryAllowed=$false;RowsPrinted=$false;PinSelected=$false} | ConvertTo-Json -Compress
    } catch {
        if($Action -eq 'Rehearse'){throw 'Assignment rehearsal failed; source not connected, raw rows/diagnostics suppressed.'}
        if ($submitted) { throw 'Assignment repair outcome requires read-only reconciliation; no automatic retry. Raw diagnostics/rows suppressed.' }
        throw 'Assignment repair rejected before SQL submission; raw diagnostics/rows suppressed.'
    } finally {
        foreach($bytes in @($rowsBuffer,$requestBytes)) { if ($null -ne $bytes) { [Array]::Clear($bytes,0,$bytes.Length) } }
        if ($null -ne $rowsSecure) { $rowsSecure.Dispose() }
    }
    return
}
try {
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($sid.Value -eq 'S-1-5-18') { throw 'Named custodian required.' }
    $app=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) 'GestorBarberia'
    Assert-LocalOnlyDestination $app
    $directory=Join-Path (Join-Path $app 'backups') ('stage04-'+$backupId)
    $manifestPath=Join-Path $directory 'manifest.json';$cipherPath=Join-Path $directory 'database.gbbk'
    $secretDirectory=Join-Path $app 'secrets';$keyPath=Join-Path $secretDirectory ('stage04-backup-'+$backupId+'.dpapi')
    foreach ($path in @($app,(Join-Path $app 'backups'),$directory,$secretDirectory,$manifestPath,$cipherPath,$keyPath)) {
        Assert-NoReparsePath $path;Assert-PrivateAcl -LiteralPath $path -OwnerSid $sid
    }
    if ((Get-Item -LiteralPath $manifestPath).Length -gt 65536) { throw 'Oversized manifest.' }
    $manifestBytes=[IO.File]::ReadAllBytes($manifestPath)
    $manifest=[Text.UTF8Encoding]::new($false,$true).GetString($manifestBytes) | ConvertFrom-Json
    if ($manifest.FormatVersion -ne 1 -or $manifest.BackupId -cne $backupId -or $manifest.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or
        $manifest.Database -cne 'postgres' -or $manifest.KeyPath -cne $keyPath -or $manifest.Cipher -cne 'AES-256-GCM' -or
        $manifest.Envelope -cne 'GBBK1|nonce12|tag16|ciphertext' -or $manifest.Capture -cne 'full_database_custom_dump_single_snapshot') { throw 'Reviewed archive identity mismatch.' }
    foreach ($entry in @(@{Path=$cipherPath;Hash=$manifest.DatabaseCipherSha256;Maximum=268435489},@{Path=$keyPath;Hash=$manifest.WrappedKeySha256;Maximum=8192})) {
        if ($entry.Hash -cnotmatch '^[0-9a-f]{64}$' -or (Get-Item -LiteralPath $entry.Path).Length -gt $entry.Maximum -or
            (Get-FileHash -LiteralPath $entry.Path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Hash) { throw 'Encrypted artifact integrity mismatch.' }
    }
    $stage='authenticated_archive_decryption_in_memory'
    $key=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($keyPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ($key.Length -ne 32) { throw 'Invalid AES key.' }
    $node=(Get-Command node -CommandType Application | Select-Object -First 1).Source
    $archive=Invoke-BinaryProcess -Executable $node -Arguments @((Join-Path $PSScriptRoot 'stage04-backup-crypto.mjs'),'decrypt') -Prefix $key -Payload ([IO.File]::ReadAllBytes($cipherPath))
    if ($archive.Length -ne $manifest.DatabasePlainBytes -or (Get-BytesSha256 $archive) -cne $manifest.DatabasePlainSha256 -or
        [Text.Encoding]::ASCII.GetString($archive,0,5) -cne 'PGDMP') { throw 'Archive plaintext integrity mismatch.' }
    $stage='isolated_bootstrap'
    $docker=(Get-Command docker -CommandType Application | Select-Object -First 1).Source
    $endpoint=Get-VerifiedLocalDockerEndpoint $docker
    $image='public.ecr.aws/supabase/postgres:17.11.0.004@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108'
    $bootstrap='set -eu; initdb -D /var/lib/postgresql/data --username=postgres --auth-local=trust --auth-host=reject --no-locale >/dev/null 2>&1; exec postgres -D /var/lib/postgresql/data -c shared_preload_libraries= -c listen_addresses= -c unix_socket_directories=/var/run/postgresql -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_min_messages=panic'
    $containerMayExist=$true
    $null=Invoke-ExtractorDocker @('run','--detach','--pull','never','--name',$container,'--network','none','--log-driver','none','--read-only','--user','postgres','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--memory-swap','512m','--pids-limit','64',
        '--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,nodev,uid=100,gid=101,mode=0700','--tmpfs','/var/run/postgresql:rw,noexec,nosuid,nodev,uid=100,gid=101,mode=0755',
        '--tmpfs','/tmp:rw,noexec,nosuid,nodev,mode=1777','--entrypoint','sh',$image,'-c',$bootstrap)
    $state=[Text.Encoding]::UTF8.GetString((Invoke-ExtractorDocker @('inspect','--format','{{json .}}',$container))) | ConvertFrom-Json
    if ($state.HostConfig.NetworkMode -cne 'none' -or $state.HostConfig.LogConfig.Type -cne 'none' -or -not $state.HostConfig.ReadonlyRootfs -or
        ($null -ne $state.HostConfig.Binds -and @($state.HostConfig.Binds).Count -gt 0) -or
        ($null -ne $state.HostConfig.PortBindings -and @($state.HostConfig.PortBindings.PSObject.Properties).Count -gt 0) -or
        $state.HostConfig.Memory -ne $state.HostConfig.MemorySwap -or @($state.Mounts | Where-Object {$_.Type -cne 'tmpfs'}).Count -gt 0) { throw 'Isolation contract failed.' }
    $ready=$false
    for($i=0;$i -lt 60;$i++) { try {$null=Invoke-ExtractorDocker @('exec',$container,'pg_isready','-h','/var/run/postgresql','-U','postgres','-d','postgres');$ready=$true;break}catch{Start-Sleep -Milliseconds 100} }
    if (-not $ready) { throw 'Isolated PostgreSQL not ready.' }
    # Deliberately table-only extraction, no owner/ACL/post-data/FK replay and
    # no other application/Auth tables. This is NOT a full restoration claim.
    foreach($section in @('pre-data','data')) {
        $stage='table_only_'+$section
        $null=Invoke-ExtractorDocker @('exec','-i','--user','postgres',$container,'pg_restore','--no-password','--host','/var/run/postgresql','--username','postgres','--dbname','postgres',
            '--exit-on-error','--single-transaction','--no-owner','--no-privileges','--schema','public','--table','empleado_rutinas',('--section='+$section)) $archive
    }
    $psql=@('exec','-i','--user','postgres',$container,'psql','-XqAt','--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--host','/var/run/postgresql','--username','postgres','--dbname','postgres')
    $stage='assignment_integrity_verification'
    $checkSql=@'
begin transaction read only;
select json_build_object('columns',(select json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod)) order by a.attnum) from pg_attribute a where a.attrelid='public.empleado_rutinas'::regclass and a.attnum>0 and not a.attisdropped),
 'row_count',count(id),
 'uuid_sha256',encode(sha256(convert_to(coalesce(string_agg(id::text,chr(10) order by id),''),'UTF8')),'hex'),
 'uuid_fk_sha256',encode(sha256(convert_to(coalesce(string_agg(jsonb_build_array(id,empleado_id,rutina_id)::text,chr(10) order by id),''),'UTF8')),'hex')) from public.empleado_rutinas;
rollback;
'@
    $integrity=[Text.Encoding]::UTF8.GetString((Invoke-ExtractorDocker $psql ([Text.Encoding]::UTF8.GetBytes($checkSql)))) | ConvertFrom-Json
    if ($integrity.row_count -ne 3 -or $integrity.uuid_sha256 -cne $expectedUuid -or $integrity.uuid_fk_sha256 -cne $expectedFk -or
        @($integrity.columns).Count -ne 3 -or (@($integrity.columns.name | Sort-Object) -join '|') -cne 'empleado_id|id|rutina_id' -or
        @($integrity.columns | Where-Object {$_.type -cne 'uuid'}).Count -gt 0) { throw 'Exactly three historical assignments/UUID/FK expected.' }
    $stage='protect_exact_rows_in_memory'
    $rowsSql='begin transaction read only; select json_agg(json_build_object(''id'',id,''empleado_id'',empleado_id,''rutina_id'',rutina_id) order by id) from public.empleado_rutinas; rollback;'
    $rowBytes=Invoke-ExtractorDocker $psql ([Text.Encoding]::UTF8.GetBytes($rowsSql)) 65536
    $rows=[Text.UTF8Encoding]::new($false,$true).GetString($rowBytes) | ConvertFrom-Json
    if (@($rows).Count -ne 3) { throw 'Assignment payload count mismatch.' }
    $payload=ConvertTo-SecureString -String ([Text.Encoding]::UTF8.GetString($rowBytes)) -AsPlainText -Force
    $package=[pscustomobject]@{FormatVersion=1;Purpose='stage04_exact_historical_assignments_recovery';ProjectRef='ucmwykzrepmjucssjnum';
        RunId=$runId;BackupId=$backupId;ExtractedUtc=[DateTime]::UtcNow.ToString('o');SourceManifestSha256=(Get-BytesSha256 $manifestBytes);
        SourceDatabasePlainSha256=$manifest.DatabasePlainSha256;RowCount=3;Columns=$integrity.columns;
        IntegrityAlgorithm='sha256_utf8_newline_uuid_order_and_jsonb_uuid_fk_tuples_v1';UuidSha256=$expectedUuid;UuidFkSha256=$expectedFk;
        Rows=$payload;KeyCustody='Windows_current_user_DPAPI';SourceModified=$false;FullRestoreClaimed=$false;SourceFkTargetsVerified=$false}
    $stage='private_immutable_package'
    $recoveryDirectory=Join-Path $app 'recovery';Assert-LocalOnlyDestination $recoveryDirectory;Assert-NoReparsePath $recoveryDirectory
    if (-not (Test-Path -LiteralPath $recoveryDirectory)) { $null=[IO.Directory]::CreateDirectory($recoveryDirectory);Set-PrivateAcl -LiteralPath $recoveryDirectory -IsDirectory $true -OwnerSid $sid }
    Assert-PrivateAcl -LiteralPath $recoveryDirectory -OwnerSid $sid
    $packagePath=Join-Path $recoveryDirectory ('stage04-assignments-'+$runId+'.clixml')
    # PSSerializer serializes SecureString as Windows DPAPI ciphertext, the same
    # representation as Export-Clixml, before CreateNew writes a single byte.
    $packageBytes=[Text.Encoding]::UTF8.GetBytes([Management.Automation.PSSerializer]::Serialize($package,8))
    Write-NewPrivateFile -LiteralPath $packagePath -Bytes $packageBytes -OwnerSid $sid
} catch { $failure='Assignment extraction stopped at '+$stage+'; raw diagnostics and rows suppressed.' }
finally {
    if ($containerMayExist -and $docker -and $endpoint) {
        try {
            try { $null=Invoke-ExtractorDocker @('rm','--force',$container) } catch {}
            $remaining=[Text.Encoding]::UTF8.GetString((Invoke-ExtractorDocker @('container','ls','--all','--filter',('name=^/'+$container+'$'),'--format','{{.Names}}'))).Trim()
            $cleanupVerified=($remaining -ceq '')
        }catch{$cleanupVerified=$false}
    } else { $cleanupVerified=$true }
    foreach($bytes in @($key,$archive,$rowBytes)) { if ($null -ne $bytes) { [Array]::Clear($bytes,0,$bytes.Length) } }
    if ($null -ne $payload) { $payload.Dispose() }
}
if (-not $cleanupVerified) { throw ('Assignment extractor cleanup unconfirmed; stage='+$stage+'; priorFailure='+[bool]$failure+'; package must not be used.') }
if ($failure) { throw $failure }
[pscustomobject]@{RunId=$runId;BackupId=$backupId;ExactRowCount=3;UuidAndFkHashesVerified=$true;PackagePath=$packagePath;
    PackageSha256=(Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant();ContainerCleanupVerified=$true;
    SourceModified=$false;SourceFkTargetsVerified=$false;FullRestoreClaimed=$false;RowsPrinted=$false;PinSelected=$false} | ConvertTo-Json -Compress
