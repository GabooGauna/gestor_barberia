#requires -Version 5.1
# New metadata recipe only; no backup, keys, credential store or remote target.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$argumentVariable=Get-Variable -Name args -Scope Local -ErrorAction SilentlyContinue
if ($null -ne $argumentVariable -and @($argumentVariable.Value).Count -gt 0) {throw 'Arguments are forbidden: synthetic local only.'}
foreach ($source in @(
    @{ Path='stage04-encrypted-backup.ps1'; Names=@('ConvertTo-ProcessArgument','Invoke-BinaryProcess','Get-VerifiedLocalDockerEndpoint','Get-BytesSha256') },
    @{ Path='stage04-isolated-restore.ps1'; Names=@('Invoke-IsolatedDocker','Get-SafeRestoreDiagnostic','Get-SafeRoleStatementKind','Assert-DatabaseMetadataEquality','Get-DatabaseMetadataCatalogSql','Get-DatabaseMetadataInventory','Get-DatabaseMetadataReplay') }
)) {
    $tokens=$null; $errors=$null
    $tree=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $source.Path),[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw 'AST failed.' }
    foreach ($functionName in $source.Names) {
        $node=@($tree.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $functionName},$false))
        if ($node.Count -ne 1) { throw 'Required helper definition missing.' }
        . ([scriptblock]::Create($node[0].Extent.Text))
    }
}
$metadata=[pscustomobject]@{
    name='postgres';owner='postgres';encoding='UTF8';locale_provider='i';collate='en_US.UTF-8';ctype='en_US.UTF-8';locale='en-US';icu_rules=$null
    collation_version='153.121';actual_collation_version='153.121';tablespace='pg_default';connection_limit=-1;allow_connections=$true
    acl_entry_count=10;acl_sha256='be1ce8b898a93d61ffa37811377d77dff9b9bc0777cd0a51f30180203bc62a0c'
    setting_entry_count=1;setting_names=@('app.settings.jwt_exp');settings_sha256='7b17b6f417acb5e2c652a1a26f53a70f4848e1bff95e34c20fd645cff98d09dd';settings_values_exposed=$false
}
# Synthetic fixture setup, never a production reconstruction recipe.
$recipe=@'
DROP DATABASE postgres;
CREATE DATABASE postgres OWNER postgres TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'en-US' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' COLLATION_VERSION '153.121';
SET ROLE postgres;
REVOKE ALL PRIVILEGES ON DATABASE postgres FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE postgres FROM postgres;
GRANT CONNECT, TEMPORARY ON DATABASE postgres TO PUBLIC;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE postgres TO postgres;
GRANT CREATE ON DATABASE postgres TO supabase_etl_admin;
GRANT CREATE ON DATABASE postgres TO supabase_storage_admin;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE postgres TO dashboard_user;
RESET ROLE;
ALTER DATABASE postgres SET app.settings.jwt_exp = '3600';
'@
$script:dockerExecutable=(Get-Command docker).Source
$script:dockerEndpoint=Get-VerifiedLocalDockerEndpoint -Executable $script:dockerExecutable
$name='stage04-dbmeta-synthetic-'+[guid]::NewGuid().ToString('N')
$image='public.ecr.aws/supabase/postgres:17.11.0.004@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108'
$shell='set -eu; initdb -D /var/lib/postgresql/data --username=supabase_admin --auth-local=trust --auth-host=reject --no-locale >/dev/null 2>&1; exec postgres -D /var/lib/postgresql/data -c shared_preload_libraries= -c listen_addresses= -c unix_socket_directories=/var/run/postgresql -c logging_collector=off -c log_statement=none -c log_min_error_statement=panic -c log_min_messages=panic'
$stage='bootstrap_synthetic';$failure=$null;$result=$null
try {
    $null=Invoke-IsolatedDocker -Arguments @('run','--detach','--pull','never','--name',$name,'--network','none','--log-driver','none','--read-only','--user','postgres','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--memory-swap','512m','--pids-limit','128','--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,noexec,uid=100,gid=101,mode=0700','--tmpfs','/var/run/postgresql:rw,nosuid,nodev,noexec,uid=100,gid=101,mode=0755','--tmpfs','/tmp:rw,nosuid,nodev,noexec,mode=1777','--entrypoint','sh',$image,'-c',$shell)
    $ready=$false
    for($i=0;$i -lt 30;$i++) {
        $probe=Invoke-IsolatedDocker -Arguments @('exec','--user','postgres',$name,'pg_isready','-h','/var/run/postgresql','-U','supabase_admin','-d','postgres') -AllowFailure $true
        if ($probe.ExitCode -eq 0) {$ready=$true;break}
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {throw 'Synthetic PostgreSQL readiness failed.'}
    $inspect=(Invoke-IsolatedDocker -Arguments @('inspect','--format','{{json .}}',$name)).Text | ConvertFrom-Json
    if ($inspect.HostConfig.NetworkMode -cne 'none' -or $inspect.HostConfig.LogConfig.Type -cne 'none' -or
        $inspect.HostConfig.Memory -ne $inspect.HostConfig.MemorySwap -or -not $inspect.HostConfig.ReadonlyRootfs -or
        ($null -ne $inspect.HostConfig.Binds -and $inspect.HostConfig.Binds.Count -gt 0) -or
        @($inspect.HostConfig.PortBindings.PSObject.Properties).Count -gt 0) {throw 'Synthetic isolation failed.'}
    $psql=@('exec','-i','--user','postgres',$name,'psql','-XqAt','--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--host','/var/run/postgresql','--username','supabase_admin','--dbname','postgres')
    $stage='create_synthetic_roles'
    $null=Invoke-IsolatedDocker -Arguments $psql -InputBytes ([Text.Encoding]::UTF8.GetBytes('CREATE ROLE postgres LOGIN CREATEDB CREATEROLE;CREATE ROLE dashboard_user;CREATE ROLE supabase_etl_admin;CREATE ROLE supabase_storage_admin;CREATE DATABASE stage04_restore_control TEMPLATE template0;')) -Operation 'database_restore'
    $control=@($psql);$control[$control.Count-1]='stage04_restore_control'
    $stage='execute_observed_metadata_recipe'
    $null=Invoke-IsolatedDocker -Arguments ($control+@('--file=-')) -InputBytes ([Text.Encoding]::UTF8.GetBytes($recipe)) -Operation 'database_restore'
    $stage='compare_database_metadata'
    $actual=(Invoke-IsolatedDocker -Arguments $psql -InputBytes ([Text.Encoding]::UTF8.GetBytes((Get-DatabaseMetadataCatalogSql))) -Operation 'catalog_read').Text.Trim() | ConvertFrom-Json
    Assert-DatabaseMetadataEquality -Expected $metadata -Actual $actual
    $negativePass=0
    foreach ($field in @('owner','acl_sha256','settings_sha256','setting_names')) {
        $bad=($metadata | ConvertTo-Json -Depth 6) | ConvertFrom-Json
        $bad.$field='unexpected'
        try {Assert-DatabaseMetadataEquality -Expected $bad -Actual $actual} catch {$negativePass++}
    }
    if ($negativePass -ne 4) {throw 'Negative metadata comparison gates failed.'}
    $stage='synthetic_custom_dump_with_create'
    $toc=(Invoke-IsolatedDocker -Arguments @('exec','--user','postgres',$name,'sh','-c','pg_dump -Fc --create -h /var/run/postgresql -U supabase_admin -d postgres | pg_restore --list --create')).Text
    $inventory=Get-DatabaseMetadataInventory -Toc $toc
    $withoutCreateToc=(Invoke-IsolatedDocker -Arguments @('exec','--user','postgres',$name,'sh','-c','pg_dump -Fc -h /var/run/postgresql -U supabase_admin -d postgres | pg_restore --list --create')).Text
    $withoutCreateInventory=Get-DatabaseMetadataInventory -Toc $withoutCreateToc
    if (-not $inventory.ReadyForMetadataReplay -or -not $withoutCreateInventory.ReadyForMetadataReplay -or
        $inventory.PropertiesEntryCount -ne 1 -or $inventory.AclEntryCount -ne 1 -or
        $withoutCreateInventory.PropertiesEntryCount -ne 1 -or $withoutCreateInventory.AclEntryCount -ne 1) {throw 'Synthetic custom-archive metadata inspection failed.'}
    foreach ($metadataToc in @($toc,$withoutCreateToc)) {
        $selection=Get-DatabaseMetadataReplay -Toc $metadataToc
        if ($selection.EntryCount -lt 3) {throw 'Actual synthetic TOC selection omitted metadata.'}
        [Array]::Clear($selection.Bytes,0,$selection.Bytes.Length)
    }
    $result=[pscustomobject]@{ComparisonNegativeGates='4/4 PASS';SyntheticFixture='PASS';MetadataEquality='PASS';DumpFcWithCreateInventory=$inventory;DumpFcWithoutCreateInventory=$withoutCreateInventory;ActualTocSelector='2/2 PASS';RestoreListRequiresCreate=$true;BackupOrKeysRead=$false}
} catch {
    $failure='Synthetic metadata drill stopped at '+$stage+'.'
    if ($_.Exception.Data.Contains('Stage04SafeDiagnostic')) {$failure+=' '+$_.Exception.Data['Stage04SafeDiagnostic']}
} finally {
    $null=Invoke-IsolatedDocker -Arguments @('rm','--force',$name) -AllowFailure $true
    $remaining=(Invoke-IsolatedDocker -Arguments @('container','ls','--all','--filter',('name=^/'+$name+'$'),'--format','{{.Names}}')).Text
    if (-not [string]::IsNullOrWhiteSpace($remaining)) {throw 'Exact synthetic cleanup unconfirmed.'}
}
if ($failure) {throw ($failure+' Exact container cleanup verified.')}
$result | Add-Member -NotePropertyName ExactContainerCleanupVerified -NotePropertyValue $true
$result | ConvertTo-Json -Depth 6 -Compress
