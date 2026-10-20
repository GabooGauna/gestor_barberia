#requires -Version 5.1
# Explicit adapter only. Never invokes capture, restore or expand on its own.
# JSONL stdin/stdout are private parent pipes; no password/key is sent to Node.
param(
    [Parameter(Mandatory=$true)][ValidateSet('Session','CaptureEvidence','RestoreEvidence','StoreMetadataComparison','Worker','InspectJob','JobProbe','AppAclProbe')][string] $Mode,
    [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{32}$')][string] $RunId,
    [ValidatePattern('^[0-9a-f]{32}$')][string] $BackupId,
    [ValidateSet('holder','observer','cleanup')][string] $SessionKind='observer',
    [ValidateSet('capture','restore')][string] $Worker='capture',
    [ValidatePattern('^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$')][string] $ExportedSnapshot,
    [ValidatePattern('^[0-9a-f]{64}$')][string] $ObservationSha256,
    [switch] $VerifyRestoredAuth
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$runtimeStage='platform_guard'
trap {
    [Console]::Out.WriteLine((@{kind='adapter_error';code='runtime_operation_failed_raw_diagnostics_suppressed';stage=$runtimeStage;
        exceptionClass=$_.Exception.GetType().Name;category=$_.CategoryInfo.Category.ToString()} | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
    exit 1
}
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows required.' }
if ($Mode -in @('Worker','InspectJob','JobProbe')) {
    # Microsoft Job Objects: descendants inherit membership; breakaway flags
    # are NOT enabled. Closing the last handle kills the whole owned tree.
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Stage04Job {
 [StructLayout(LayoutKind.Sequential)] struct Basic {public long a,b;public uint flags;public UIntPtr min,max;public uint limit;public UIntPtr affinity;public uint priority,schedule;}
 [StructLayout(LayoutKind.Sequential)] struct Io {public ulong a,b,c,d,e,f;}
 [StructLayout(LayoutKind.Sequential)] struct Extended {public Basic basic;public Io io;public UIntPtr process,job,peakProcess,peakJob;}
 [StructLayout(LayoutKind.Sequential)] struct Accounting {public long a,b,c,d;public uint faults,total,active,terminated;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr OpenJobObject(uint access,bool inherit,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int info,ref Extended data,uint length);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int info,out Accounting data,uint length,IntPtr returned);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr value);
 public static IntPtr Own(string name) {
   IntPtr handle=CreateJobObject(IntPtr.Zero,name);int error=Marshal.GetLastWin32Error();
   if(handle==IntPtr.Zero||error==183)throw new Exception("job_create_failed");
   Extended data=new Extended();data.basic.flags=0x2000;
   if(!SetInformationJobObject(handle,9,ref data,(uint)Marshal.SizeOf(typeof(Extended)))||!AssignProcessToJobObject(handle,GetCurrentProcess())){CloseHandle(handle);throw new Exception("job_containment_failed");}
   return handle;
 }
 public static int Active(IntPtr handle){Accounting data;if(!QueryInformationJobObject(handle,1,out data,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero))throw new Exception("job_query_failed");return (int)data.active;}
 public static bool Contains(IntPtr handle,int pid){bool result;using(var process=System.Diagnostics.Process.GetProcessById(pid)){if(!IsProcessInJob(process.Handle,handle,out result))throw new Exception("job_membership_failed");}return result;}
 public static int Inspect(string name){IntPtr handle=OpenJobObject(4,false,name);if(handle==IntPtr.Zero){if(Marshal.GetLastWin32Error()==2)return 0;throw new Exception("job_inspect_failed");}try{return Active(handle);}finally{CloseHandle(handle);}}
}
'@
    $jobName='Local\GestorBarberia-stage04-'+$RunId+'-'+$Worker
    if ($Mode -eq 'InspectJob') { [Console]::Out.WriteLine((@{activeProcesses=[Stage04Job]::Inspect($jobName);jobName=$jobName} | ConvertTo-Json -Compress)); return }
    # Keep this handle until process exit, when the OS closes it. Never close a
    # job containing this wrapper prematurely; normal success first checks that
    # this wrapper is its sole remaining process.
    $ownedJob=[Stage04Job]::Own($jobName)
    if ($Mode -eq 'JobProbe') {
        $probeExecutable=[Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
        $probe=Start-Process -FilePath $probeExecutable -ArgumentList @('-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 60') -WindowStyle Hidden -PassThru
        [Console]::Out.WriteLine((@{kind='synthetic_job_started';parentPid=$PID;childPid=$probe.Id;childInJob=[Stage04Job]::Contains($ownedJob,$probe.Id);activeProcesses=[Stage04Job]::Active($ownedJob)} | ConvertTo-Json -Compress)); [Console]::Out.Flush()
        Start-Sleep -Seconds 60
        exit 1
    }
    if ($Worker -eq 'capture') {
        if (-not $ExportedSnapshot) { throw 'Snapshot required.' }
        & (Join-Path $PSScriptRoot 'stage04-encrypted-backup.ps1') -ExportedSnapshot $ExportedSnapshot -SupervisionRunId $RunId
    } else {
        if (-not $BackupId -or -not $ObservationSha256) { throw 'Restore binding required.' }
        & (Join-Path $PSScriptRoot 'stage04-isolated-restore.ps1') -BackupId $BackupId -SupervisionRunId $RunId -VerifyDatabaseMetadata -DatabaseMetadataObservationSha256 $ObservationSha256 -VerifyRestoredAuth:$VerifyRestoredAuth
    }
    if ([Stage04Job]::Active($ownedJob) -ne 1) { throw 'Worker descendants remain active.' }
    exit 0
}
$runtimeStage='load_reviewed_helpers'
foreach ($source in @(
    @{File='stage04-store-db-credential.ps1';Names=@('Assert-NoReparsePath','Assert-PrivateAcl','Assert-LocalOnlyDestination','Assert-SessionPoolerHost','Set-PrivateAcl')},
    @{File='stage04-encrypted-backup.ps1';Names=@('ConvertTo-ProcessArgument','Invoke-BinaryProcess','Get-VerifiedLocalDockerEndpoint','Get-BytesSha256','Write-NewPrivateFile')},
    @{File='stage04-isolated-restore.ps1';Names=@('Get-DatabaseMetadataCatalogSql')}
)) {
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $source.File),[ref]$tokens,[ref]$errors)
    if ($errors.Count) { throw 'Reviewed helper unavailable.' }
    foreach ($name in $source.Names) {
        $nodes=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false))
        if ($nodes.Count -ne 1) { throw 'Reviewed helper unavailable.' }
        . ([scriptblock]::Create($nodes[0].Extent.Text))
    }
}
$runtimeStage='custodian_app_acl'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
if ($sid.Value -eq 'S-1-5-18') { throw 'Named custodian required.' }
$app=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) 'GestorBarberia'
$runtimeStage='app_local_destination'
Assert-LocalOnlyDestination $app
$runtimeStage='app_no_reparse'
Assert-NoReparsePath $app
$runtimeStage='app_private_acl'
if ($Mode -eq 'AppAclProbe') {
    # Local metadata only, same Node -> PS process path as the TLS adapter.
    # No credential, CA, Docker, database or network is accessed in this mode.
    $runtimeStage='app_probe_get_acl'
    $acl=Get-Acl -LiteralPath $app
    $runtimeStage='app_probe_rules'
    $aclRules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    $expectedSids=@($sid.Value,'S-1-5-18')
    $guardPassed=$false; $guardCause='none'
    $runtimeStage='app_probe_guard'
    try { Assert-PrivateAcl -LiteralPath $app -OwnerSid $sid; $guardPassed=$true }
    catch {
        switch ($_.Exception.Message) {
            'The credential path owner or inheritance could not be secured.' { $guardCause='owner_or_inheritance' }
            'Unexpected credential path access rules.' { $guardCause='rule_count' }
            'The credential path has unexpected permissions.' { $guardCause='rule_attributes' }
            'A required credential path access rule is missing.' { $guardCause='required_rule_missing' }
            default { $guardCause='guard_runtime_error' }
        }
    }
    $runtimeStage='app_probe_output'
    [Console]::Out.WriteLine((@{kind='stage04_app_acl_probe';ownerMatchesCustodian=($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ceq $sid.Value);
        protected=[bool]$acl.AreAccessRulesProtected;ruleCount=$aclRules.Count;
        inheritedRuleCount=@($aclRules | Where-Object {$_.IsInherited}).Count;
        expectedFullControlOnly=(@($aclRules | Where-Object {$_.IdentityReference.Value -notin $expectedSids -or $_.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or $_.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow}).Count -eq 0);
        sidObjectTypeMatches=($sid -is [Security.Principal.SecurityIdentifier]);guardPassed=$guardPassed;guardCause=$guardCause} | ConvertTo-Json -Compress))
    return
}
Assert-PrivateAcl -LiteralPath $app -OwnerSid $sid
function Read-PrivateBytes([string] $Path,[int] $Maximum=2097152) {
    Assert-NoReparsePath $Path
    Assert-PrivateAcl -LiteralPath ([IO.Path]::GetDirectoryName($Path)) -OwnerSid $sid
    Assert-PrivateAcl -LiteralPath $Path -OwnerSid $sid
    $info=Get-Item -LiteralPath $Path
    if ($info.Length -le 0 -or $info.Length -gt $Maximum) { throw 'Bounded artifact required.' }
    return ,([IO.File]::ReadAllBytes($Path))
}
function Parse-JsonBytes([byte[]] $Bytes) {
    $text=[Text.UTF8Encoding]::new($false,$true).GetString($Bytes)
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) { return ConvertFrom-Json -InputObject $text -DateKind String }
    return ConvertFrom-Json -InputObject $text
}
function Emit($Object) { [Console]::Out.WriteLine(($Object | ConvertTo-Json -Depth 12 -Compress)); [Console]::Out.Flush() }
function Get-EvidenceField {
    param($Object,[string] $Name)
    if ($null -eq $Object -or $Object -isnot [pscustomobject]) { throw 'Evidence object rejected.' }
    $property=$Object.PSObject.Properties[$Name]
    if ($null -eq $property) { throw 'Evidence field missing.' }
    # Preserve arrays as arrays: [true] must not be unwrapped into bool true.
    return ,($property.Value)
}
function Assert-SupervisedManifestBinding {
    param($Manifest,[string] $ExpectedRunId,[string] $ExpectedBackupId)
    if ($ExpectedRunId -cnotmatch '^[0-9a-f]{32}$' -or $ExpectedBackupId -cnotmatch '^[0-9a-f]{32}$') { throw 'Evidence expected identity rejected.' }
    $version=Get-EvidenceField $Manifest 'FormatVersion'
    if (($version -isnot [int] -and $version -isnot [long]) -or $version -ne 1) { throw 'Evidence version rejected.' }
    foreach ($pair in @(@{Name='SupervisionRunId';Expected=$ExpectedRunId},@{Name='BackupId';Expected=$ExpectedBackupId},@{Name='ProjectRef';Expected='ucmwykzrepmjucssjnum'})) {
        $value=Get-EvidenceField $Manifest $pair.Name
        if ($value -isnot [string] -or $value -cne $pair.Expected) { throw 'Evidence identity rejected.' }
    }
    $snapshot=Get-EvidenceField $Manifest 'ExportedSnapshot'
    if ($snapshot -isnot [string] -or $snapshot -cnotmatch '^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$') { throw 'Evidence snapshot rejected.' }
    foreach ($name in @('DatabaseCipherSha256','RolesCipherSha256')) {
        $value=Get-EvidenceField $Manifest $name
        if ($value -isnot [string] -or $value -cnotmatch '^[0-9a-f]{64}$') { throw 'Evidence hash rejected.' }
    }
}
function Assert-SupervisedRestoreBinding {
    param($Report,$Manifest,[string] $ManifestSha256,[string] $ExpectedRunId,[string] $ExpectedBackupId)
    Assert-SupervisedManifestBinding $Manifest $ExpectedRunId $ExpectedBackupId
    if ($ManifestSha256 -cnotmatch '^[0-9a-f]{64}$') { throw 'Evidence manifest hash rejected.' }
    foreach ($pair in @(@{Name='SupervisionRunId';Expected=$ExpectedRunId},@{Name='DrillId';Expected=$ExpectedRunId},
        @{Name='BackupId';Expected=$ExpectedBackupId},@{Name='ProjectRef';Expected='ucmwykzrepmjucssjnum'},
        @{Name='ExportedSnapshot';Expected=$Manifest.ExportedSnapshot},@{Name='ManifestSha256';Expected=$ManifestSha256},
        @{Name='DatabaseCipherSha256';Expected=$Manifest.DatabaseCipherSha256},@{Name='RolesCipherSha256';Expected=$Manifest.RolesCipherSha256})) {
        $value=Get-EvidenceField $Report $pair.Name
        if ($value -isnot [string] -or $value -cne $pair.Expected) { throw 'Restore evidence binding rejected.' }
    }
    foreach ($name in @('ContainerCleanupVerified','CiphertextHashesVerified','GcmAuthenticated','PlainHashesVerified',
        'PgRestoreSingleTransactionExitZero','DatabasePropertiesOwnerAclSettingsVerified')) {
        $value=Get-EvidenceField $Report $name
        if ($value -isnot [bool] -or $value -ne $true) { throw 'Restore evidence flag rejected.' }
    }
}
$child=$null; $record=$null; $docker=$null; $endpoint=$null; $name='stage04-tls-'+$SessionKind+'-'+$RunId
try {
    if ($Mode -ne 'Session') {
        if (-not $BackupId) { throw 'Backup identity required.' }
        $directory=Join-Path (Join-Path $app 'backups') ('stage04-'+$BackupId)
        if ($Mode -eq 'StoreMetadataComparison') {
            $line=[Console]::In.ReadLine()
            if (-not $line -or $line.Length -gt 65536) { throw 'Bounded metadata observation required.' }
            $observation=ConvertFrom-Json -InputObject $line
            if ($observation.format_version -ne 1 -or $observation.backup_id -cne $BackupId -or
                $observation.project_ref -cne 'ucmwykzrepmjucssjnum' -or $observation.same_snapshot_as_database -ne $false -or
                $observation.database_metadata.name -cne 'postgres' -or $observation.database_metadata.settings_values_exposed -ne $false) { throw 'Metadata comparison rejected.' }
            $bytes=[Text.Encoding]::UTF8.GetBytes($line)
            Write-NewPrivateFile -LiteralPath (Join-Path $directory 'source-database-metadata.json') -Bytes $bytes -OwnerSid $sid
            Emit @{sha256=(Get-BytesSha256 $bytes)}
            return
        }
        $bytes=Read-PrivateBytes (Join-Path $directory 'manifest.json')
        $manifest=Parse-JsonBytes $bytes
        Assert-SupervisedManifestBinding $manifest $RunId $BackupId
        $manifestHash=Get-BytesSha256 $bytes
        foreach ($file in @(@{Name='database.gbbk';Hash=$manifest.DatabaseCipherSha256},@{Name='roles.gbbk';Hash=$manifest.RolesCipherSha256})) {
            $path=Join-Path $directory $file.Name
            Assert-NoReparsePath $path; Assert-PrivateAcl -LiteralPath $path -OwnerSid $sid
            if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.Hash) { throw 'Cipher artifact hash rejected.' }
        }
        $proof=[ordered]@{runId=$RunId;projectRef='ucmwykzrepmjucssjnum';backupId=$BackupId;snapshot=$manifest.ExportedSnapshot;
            manifestSha256=$manifestHash;databaseCipherSha256=$manifest.DatabaseCipherSha256;rolesCipherSha256=$manifest.RolesCipherSha256}
        if ($Mode -eq 'CaptureEvidence') { $proof.kind='stage04.capture.v1'; $proof.artifact=@{backupId=$BackupId} }
        else {
            $report=Parse-JsonBytes (Read-PrivateBytes (Join-Path $directory ('isolated-restore-'+$RunId+'.json')))
            Assert-SupervisedRestoreBinding $report $manifest $manifestHash $RunId $BackupId
            $proof.kind='stage04.restore.v1'; $proof.gcmAuthenticated=$true; $proof.ciphertextHashesVerified=$true
            $proof.plaintextHashesVerified=$true; $proof.postgresRestoreVerified=$true
        }
        Emit $proof
        return
    }
    $runtimeStage='credential_acl_and_import'
    $credentialPath=Join-Path (Join-Path $app 'secrets') 'stage04-postgres.clixml'
    $null=Read-PrivateBytes $credentialPath 65536
    $record=Import-Clixml -LiteralPath $credentialPath
    $runtimeStage='credential_metadata'
    if ($record.FormatVersion -ne 1 -or $record.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $record.Database -cne 'postgres' -or
        $record.Port -ne 5432 -or $record.SslMode -cne 'verify-full' -or $record.Credential -isnot [Management.Automation.PSCredential] -or
        $record.Credential.UserName -cne 'postgres.ucmwykzrepmjucssjnum' -or $record.Credential.Password.Length -eq 0) { throw 'Credential rejected.' }
    Assert-SessionPoolerHost $record.Host
    if ($record.Host -cne 'aws-0-sa-east-1.pooler.supabase.com') { throw 'Reviewed project pooler host required.' }
    $runtimeStage='official_ca_validation'
    $ca=Join-Path (Join-Path $app 'certs') 'prod-ca-2021.crt'
    Assert-LocalOnlyDestination $ca; Assert-NoReparsePath $ca
    if (-not [IO.File]::Exists($ca) -or $ca.Contains(',')) { throw 'Official CA required.' }
    if ((Get-FileHash -LiteralPath $ca -Algorithm SHA256).Hash.ToLowerInvariant() -cne '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7') { throw 'Reviewed official CA hash required.' }
    $runtimeStage='local_docker_context'
    $docker=(Get-Command docker -CommandType Application | Select-Object -First 1).Source
    $endpoint=Get-VerifiedLocalDockerEndpoint $docker
    $connection='host='+$record.Host+' port=5432 user=postgres.ucmwykzrepmjucssjnum dbname=postgres sslmode=verify-full sslrootcert=/run/gestor-prod-ca.crt connect_timeout=15 application_name=stage04_'+$SessionKind+'_'+$RunId
    $arguments=@('--host',$endpoint,'run','--rm','-i','--name',$name,'--log-driver','none','--read-only','--network','bridge','--user','postgres',
        '--cap-drop','ALL','--security-opt','no-new-privileges','--memory','128m','--memory-swap','128m','--pids-limit','32',
        '--mount',('type=bind,source='+$ca+',destination=/run/gestor-prod-ca.crt,readonly'),
        'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',
        'psql','-XqAt','--password','--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--dbname',$connection)
    $start=[Diagnostics.ProcessStartInfo]::new(); $start.FileName=$docker
    $start.Arguments=(($arguments | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join ' ')
    $start.UseShellExecute=$false; $start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
    $child=[Diagnostics.Process]::new(); $child.StartInfo=$start
    $runtimeStage='tls_process_start'
    if (-not $child.Start()) { throw 'TLS transport unavailable.' }
    $stderr=$child.StandardError.ReadToEndAsync()
    $runtimeStage='credential_stdin'
    $pointer=[IntPtr]::Zero; $characters=New-Object char[] $record.Credential.Password.Length
    try {
        $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($record.Credential.Password)
        for ($i=0;$i -lt $characters.Length;$i++) { $characters[$i]=[char]([Runtime.InteropServices.Marshal]::ReadInt16($pointer,2*$i) -band 0xffff) }
        $child.StandardInput.Write($characters,0,$characters.Length); $child.StandardInput.WriteLine(); $child.StandardInput.Flush()
    } finally { if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }; [Array]::Clear($characters,0,$characters.Length) }
    # No ready claim until the parent query receives a marker over verified TLS.
    Emit @{kind='transport_started';runId=$RunId;container=$name}
    $runtimeStage='request_framing'
    while ($null -ne ($line=[Console]::In.ReadLine())) {
        if ($line.Length -gt 2097152) { throw 'Bounded request required.' }
        $request=ConvertFrom-Json -InputObject $line
        if ($request.id -isnot [string] -or $request.id -cnotmatch '^[0-9a-f]{24}$') { throw 'Request identity rejected.' }
        if ($request.operation -ceq 'close') { break }
        if ($request.operation -ceq 'database_metadata') { $query=[Text.Encoding]::UTF8.GetBytes((Get-DatabaseMetadataCatalogSql)) }
        elseif ($request.operation -ceq 'query' -and $request.sqlBase64 -is [string]) { $query=[Convert]::FromBase64String($request.sqlBase64) }
        else { throw 'Query request rejected.' }
        if ($query.Length -gt 1048576) { throw 'Bounded query required.' }
        $sql=[Text.UTF8Encoding]::new($false,$true).GetString($query)
        # Reject psql meta commands supplied by adapters; broker owns framing.
        if ($sql -match '(?m)^\s*\\') { throw 'SQL-only transport required.' }
        $marker='stage04_end_'+$request.id
        $runtimeStage='query_write'
        $child.StandardInput.WriteLine($sql); $child.StandardInput.WriteLine('\echo '+$marker); $child.StandardInput.Flush()
        $runtimeStage='query_read'
        $output=[Text.StringBuilder]::new(); $clock=[Diagnostics.Stopwatch]::StartNew()
        while ($true) {
            $read=$child.StandardOutput.ReadLineAsync()
            if (-not $read.Wait(45000)) { throw 'SQL transport timeout.' }
            if ($null -eq $read.Result) { throw 'SQL transport closed.' }
            if ($read.Result -ceq $marker) { break }
            [void]$output.AppendLine($read.Result)
            if ($output.Length -gt 2097152 -or $clock.ElapsedMilliseconds -gt 45000) { throw 'SQL response limit.' }
        }
        Emit @{id=$request.id;ok=$true;text=$output.ToString().Trim()}
    }
} catch {
    Emit @{kind='adapter_error';code='runtime_operation_failed_raw_diagnostics_suppressed';stage=$runtimeStage}
    exit 1
} finally {
    if ($null -ne $child) { try { if (-not $child.HasExited) { $child.StandardInput.Close(); if (-not $child.WaitForExit(1000)) { $child.Kill(); $child.WaitForExit() } } } catch {}; $child.Dispose() }
    if ($Mode -eq 'Session' -and $docker -and $endpoint) {
        try { $null=Invoke-BinaryProcess -Executable $docker -Arguments @('--host',$endpoint,'rm','--force',$name) -MaximumBytes 4096 } catch {}
    }
    if ($null -ne $record -and $record.Credential -is [Management.Automation.PSCredential]) { $record.Credential.Password.Dispose() }
}
