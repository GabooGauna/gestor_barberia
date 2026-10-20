# Scoped delivery cleanup. Never prints credentials or raw Auth records.
param([ValidateSet('Inspect','Backup','Apply','Verify')][string]$Action='Inspect')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$phase='guards'; $record=$null; $pat=$null
try {
  $tokens=$null; $errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'stage04-store-db-credential.ps1'),[ref]$tokens,[ref]$errors)
  if($errors.Count){throw 'Guard parser failed'}
  foreach($name in @('Assert-NoReparsePath','Assert-PrivateAcl','Assert-LocalOnlyDestination','Set-PrivateAcl')){
    $nodes=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false))
    if($nodes.Count -ne 1){throw 'Guard unavailable'}
    . ([scriptblock]::Create($nodes[0].Extent.Text))
  }
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $app=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GestorBarberia'
  $directory=Join-Path $app 'secrets'; $path=Join-Path $directory 'stage04-management-token.clixml'
  Assert-LocalOnlyDestination $path
  foreach($entry in @($app,$directory,$path)){Assert-NoReparsePath $entry; Assert-PrivateAcl -LiteralPath $entry -OwnerSid $sid}
  $phase='credential_import'; $record=Import-Clixml -LiteralPath $path
  if($record.FormatVersion -ne 1 -or $record.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $record.Purpose -cne 'stage04_management_api' -or $record.Token -isnot [Security.SecureString]){throw 'Credential rejected'}
  $pat=[Net.NetworkCredential]::new('management',$record.Token).Password
  $headers=@{Authorization=('Bearer '+$pat)}
  $base='https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum'
  $phase='target_identity'; $project=Invoke-RestMethod -Uri $base -Headers $headers -TimeoutSec 20
  if($project.id -cne 'ucmwykzrepmjucssjnum' -or $project.region -cne 'sa-east-1' -or $project.status -cne 'ACTIVE_HEALTHY'){throw 'Target mismatch'}
  function Invoke-Query([string]$Sql,[bool]$ReadOnly=$true){
    $r=Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$Sql;read_only=$ReadOnly}|ConvertTo-Json -Compress) -TimeoutSec 45
    return $r
  }
  if($Action -eq 'Inspect'){
    $phase='inventory'
    $sql=@'
select jsonb_build_object(
 'profiles',(select jsonb_agg(jsonb_build_object('id',id,'is_cesar',lower(nombre) in ('césar','cesar'),'rol',rol,'activo',activo,'auth_linked',auth_user_id is not null,'creado_en',creado_en)) from public.empleados),
 'daily',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.asignaciones_diarias a),
 'audits',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.auditoria_diaria a),
 'urgent',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.tareas_urgentes a),
 'legacy',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.empleado_rutinas a),
 'completion_events',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from private.task_completion_events a),
 'admin_events',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from private.auth_admin_audit a),
 'tables',(select jsonb_agg(schemaname||'.'||tablename) from pg_tables where schemaname in ('public','private')),
 'operational_columns',(select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name)) from information_schema.columns where table_schema='private' and table_name in ('security_operations','admin_operation_admissions')),
 'admission_counts',jsonb_build_object('total',(select count(*) from private.admin_operation_admissions),'in_flight',(select count(*) from private.admin_operation_admissions where finished_at is null),'cesar_actor',(select count(*) from private.admin_operation_admissions where actor_id='eb36b62d-de89-4277-876b-123099d6d281'),'cesar_id_target',(select count(*) from private.admin_operation_admissions where target_key=encode(sha256(convert_to('bd5735c9-03c0-4220-8b24-f834b51847ed','UTF8')),'hex'))),
 'cesar_username',(select usuario from public.empleados where id='bd5735c9-03c0-4220-8b24-f834b51847ed'),
 'fks',(select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'definition',pg_get_constraintdef(oid))) from pg_constraint where contype='f' and (connamespace in ('public'::regnamespace,'private'::regnamespace) or confrelid='auth.users'::regclass)),
 'triggers',(select jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'definition',pg_get_triggerdef(oid))) from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace in ('public'::regnamespace,'private'::regnamespace))),
 'preserved_counts',jsonb_build_object('rutinas',(select count(*) from public.rutinas),'tasks',(select count(*) from public.tareas_rutina)),
 'auth_summary',(select jsonb_agg(jsonb_build_object('profile',e.id,'role',e.rol,'active',e.activo,'auth_exists',u.id is not null,'banned',u.banned_until>now(),'password_present',u.encrypted_password is not null and u.encrypted_password<>'','verified_factors',(select count(*) from auth.mfa_factors f where f.user_id=u.id and f.status='verified'))) from public.empleados e left join auth.users u on u.id=e.auth_user_id)
) as result;
'@
    Invoke-Query $sql | ConvertTo-Json -Depth 20 -Compress
    return
  }
  $snapshotSql=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../supabase/inspections/stage06-cleanup-snapshot.sql') -Raw
  $backupDirectory=Join-Path $app 'backups'
  # v1/v2 are retained unchanged. v3 also backs up the exact SHA256-keyed
  # administrative admission for Cesar, discovered by the fail-closed guard.
  $backupPath=Join-Path $backupDirectory 'stage06-cesar-cleanup-v3.clixml'
  Assert-LocalOnlyDestination $backupPath
  Assert-NoReparsePath $backupPath
  if($Action -eq 'Backup'){
    $phase='snapshot_read'
    $snapshot=@(Invoke-Query $snapshotSql)[0].result
    if($snapshot.project -cne 'ucmwykzrepmjucssjnum' -or @($snapshot.payload.empleados).Count -ne 1 -or $snapshot.payload.empleados[0].rol -cne 'empleado' -or $snapshot.payload.empleados[0].nombre.ToLowerInvariant() -cnotin @('césar','cesar') -or $snapshot.payload.empleados[0].auth_user_id -cne 'eb36b62d-de89-4277-876b-123099d6d281'){throw 'Snapshot target rejected'}
    $phase='encrypted_backup'
    if(Test-Path -LiteralPath $backupPath){throw 'Backup already exists; never overwrite'}
    if(-not(Test-Path -LiteralPath $backupDirectory)){
      $null=[IO.Directory]::CreateDirectory($backupDirectory)
      Set-PrivateAcl -LiteralPath $backupDirectory -IsDirectory $true -OwnerSid $sid
    }
    Assert-PrivateAcl -LiteralPath $backupDirectory -OwnerSid $sid
    $json=$snapshot|ConvertTo-Json -Depth 30 -Compress
    $protectedData=ConvertTo-SecureString $json -AsPlainText -Force
    [pscustomobject]@{FormatVersion=1;ProjectRef=$project.id;CreatedAt=[DateTime]::UtcNow.ToString('o');Data=$protectedData}|Export-Clixml -LiteralPath $backupPath
    Set-PrivateAcl -LiteralPath $backupPath -IsDirectory $false -OwnerSid $sid
    $readback=Import-Clixml -LiteralPath $backupPath
    $readbackJson=[Net.NetworkCredential]::new('snapshot',$readback.Data).Password
    if($readbackJson -cne $json){throw 'Backup readback failed'}
    $counts=@{};foreach($p in $snapshot.payload.PSObject.Properties){$counts[$p.Name]=@($p.Value).Count}
    [pscustomobject]@{Backup=$backupPath;Sha256=(Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash;Encrypted=$true;ReadbackVerified=$true;Counts=$counts;AuthIdentityMetadataOnly=$true;AuthRecovery='reprovision; no password/token/factor secrets copied'}|ConvertTo-Json -Depth 5 -Compress
    $protectedData.Dispose();$readback.Data.Dispose();$json=$null;$readbackJson=$null
    return
  }
  Assert-PrivateAcl -LiteralPath $backupDirectory -OwnerSid $sid
  Assert-PrivateAcl -LiteralPath $backupPath -OwnerSid $sid
  $phase='backup_readback';$backup=Import-Clixml -LiteralPath $backupPath
  if($backup.FormatVersion -ne 1 -or $backup.ProjectRef -cne $project.id -or $backup.Data -isnot [Security.SecureString]){throw 'Backup rejected'}
  $backupJson=[Net.NetworkCredential]::new('snapshot',$backup.Data).Password
  $expected=$backupJson|ConvertFrom-Json
  if($Action -eq 'Apply'){
    $phase='pre_apply_readback'
    $before=@(Invoke-Query $snapshotSql)[0].result
    $businessAbsent=$true
    foreach($p in $before.payload.PSObject.Properties){if(@($p.Value).Count -ne 0){$businessAbsent=$false}}
    foreach($p in $expected.preserved.PSObject.Properties){if($before.preserved.($p.Name) -cne $p.Value){throw 'Preserved data drift; stop'}}
    if(-not $businessAbsent){
      # information_schema exposes grants for the current role. Management
      # read_only and write modes use different roles; preserve both contexts.
      $roleSql="select current_user as actor, current_role as role, (select count(*) from information_schema.role_table_grants where table_schema in ('public','private')) as visible_grants;"
      $readContext=@(Invoke-Query $roleSql)[0]
      $writeContext=@(Invoke-Query $roleSql $false)[0]
      [pscustomobject]@{ReadContext=$readContext;ExecutionContext=$writeContext}|ConvertTo-Json -Depth 4 -Compress
      $execution=@(Invoke-Query $snapshotSql $false)[0].result
      foreach($p in $expected.preserved.PSObject.Properties){
        if($p.Name -ne 'grants' -and $execution.preserved.($p.Name) -cne $p.Value){throw 'Execution-context preservation drift'}
      }
      if($execution.preserved.grants -cne $expected.preserved.grants -and $readContext.actor -ceq $writeContext.actor){throw 'Grant drift not explained by role context'}
      $transactionExpected=$backupJson|ConvertFrom-Json
      $transactionExpected.preserved.grants=$execution.preserved.grants
      $supplementJson=@{ProjectRef=$project.id;BackupSha256=(Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash;ExecutionRole=$writeContext.actor;GrantsDigest=$execution.preserved.grants}|ConvertTo-Json -Compress
      $supplementPath=Join-Path $backupDirectory 'stage06-grants-context-v3.clixml'
      Assert-NoReparsePath $supplementPath
      if(Test-Path -LiteralPath $supplementPath){
        Assert-PrivateAcl -LiteralPath $supplementPath -OwnerSid $sid
        $supplement=Import-Clixml -LiteralPath $supplementPath
        $saved=[Net.NetworkCredential]::new('supplement',$supplement).Password|ConvertFrom-Json
        $wanted=$supplementJson|ConvertFrom-Json
        if($saved.ProjectRef -cne $wanted.ProjectRef -or $saved.BackupSha256 -cne $wanted.BackupSha256 -or $saved.ExecutionRole -cne $wanted.ExecutionRole -or $saved.GrantsDigest -cne $wanted.GrantsDigest){throw 'Grant context supplement drift'}
        $supplement.Dispose()
      } else {
        $supplement=ConvertTo-SecureString $supplementJson -AsPlainText -Force
        $supplement|Export-Clixml -LiteralPath $supplementPath
        Set-PrivateAcl -LiteralPath $supplementPath -IsDirectory $false -OwnerSid $sid
        $supplement.Dispose()
        $supplement=Import-Clixml -LiteralPath $supplementPath
        if([Net.NetworkCredential]::new('supplement',$supplement).Password -cne $supplementJson){throw 'Grant context supplement readback failed'}
        $supplement.Dispose()
      }
      $encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($transactionExpected|ConvertTo-Json -Depth 30 -Compress)))
      $repair=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../supabase/repairs/stage06-cleanup-cesar.sql') -Raw
      $prefix=@'
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.empleados,public.rutinas,public.tareas_rutina,public.asignaciones_diarias,public.empleado_rutinas,public.auditoria_diaria,public.tareas_urgentes,private.task_completion_events,private.auth_admin_audit,private.admin_operation_admissions in share row exclusive mode;
'@
      # Base64 has no SQL metacharacters; no data or secrets in a command line.
      $prefix+="`ncreate temp table expected_snapshot on commit drop as select convert_from(decode('$encoded','base64'),'UTF8')::jsonb as result;`ncreate temp table actual_snapshot on commit drop as `n"
      $post=@'
do $$ begin
 if (select result->'preserved' from post_snapshot) is distinct from (select result->'preserved' from expected_snapshot)
 or exists(select 1 from post_snapshot s cross join lateral jsonb_each(s.result->'payload') p where jsonb_array_length(p.value)<>0)
 then raise exception 'cleanup_postcondition_failed'; end if;
end $$;
commit;
select true as business_cleanup_committed;
'@
      $transaction=$prefix+$snapshotSql+"`n"+$repair+"`ncreate temp table post_snapshot on commit drop as `n"+$snapshotSql+"`n"+$post
      $phase='business_transaction'
      $ack=@(Invoke-Query $transaction $false)
      if($ack.Count -ne 1 -or $ack[0].business_cleanup_committed -ne $true){throw 'Commit outcome unclear; reconcile Verify before retry'}
      Write-Output '{"BusinessCleanupCommitted":true,"ExactBackupIdsOnly":true}'
    }
    # The public profile FK is RESTRICT. Remove its backed-up relations/profile
    # transactionally first; use the supported Auth Admin API for identity and
    # native session/identity/factor cascades. Never DELETE auth.users in SQL.
    $phase='auth_delete_precondition'
    $afterBusiness=@(Invoke-Query $snapshotSql)[0].result
    if($null -ne $afterBusiness.auth_identity){
      if($afterBusiness.auth_identity.id -cne 'eb36b62d-de89-4277-876b-123099d6d281'){throw 'Auth target mismatch'}
      foreach($p in $afterBusiness.payload.PSObject.Properties){if(@($p.Value).Count -ne 0){throw 'Target relations remain'}}
      $phase='service_key_in_memory'
      $keys=Invoke-RestMethod -Uri ($base+'/api-keys?reveal=true') -Headers $headers -TimeoutSec 20
      $selected=@($keys|Where-Object {$_.name -ceq 'service_role'})
      if($selected.Count -ne 1){throw 'Service key unavailable'}
      $serviceKey=$selected[0].api_key;$keys=$null;$selected=$null
      $phase='auth_admin_delete'
      $handler=[Net.Http.HttpClientHandler]::new();$handler.AllowAutoRedirect=$false
      $client=[Net.Http.HttpClient]::new($handler);$client.Timeout=[TimeSpan]::FromSeconds(25)
      $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Delete,'https://ucmwykzrepmjucssjnum.supabase.co/auth/v1/admin/users/eb36b62d-de89-4277-876b-123099d6d281')
      $request.Headers.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$serviceKey)
      $request.Headers.Add('apikey',$serviceKey)
      $request.Content=[Net.Http.StringContent]::new('{"should_soft_delete":false}',[Text.Encoding]::UTF8,'application/json')
      try{
        $response=$client.SendAsync($request).GetAwaiter().GetResult()
        if([int]$response.StatusCode -notin @(200,204)){throw 'Auth deletion failed; reconcile before retry'}
        # Response can contain full Auth data: deliberately do not read or log.
        $response.Dispose()
      } finally {$request.Dispose();$client.Dispose();$handler.Dispose();$serviceKey=$null}
      Write-Output '{"AuthHardDeleteAcknowledged":true}'
    }
  }
  $phase='verify_snapshot'
  $current=@(Invoke-Query $snapshotSql)[0].result
  $same=$true;$changed=@()
  foreach($p in $expected.preserved.PSObject.Properties){if($current.preserved.($p.Name) -cne $p.Value){$same=$false;$changed+=$p.Name}}
  $counts=@{};foreach($p in $current.payload.PSObject.Properties){$counts[$p.Name]=@($p.Value).Count}
  [pscustomobject]@{PreservedDigestsMatch=$same;ChangedPreservationGroups=$changed;RemainingTargetRows=$counts;TargetAuthAbsent=($null -eq $current.auth_identity)}|ConvertTo-Json -Depth 5 -Compress
  if($Action -eq 'Apply' -and (-not $same -or $null -ne $current.auth_identity -or @($counts.Values|Where-Object {$_ -ne 0}).Count)){throw 'Final cleanup verification failed'}
  $phase='integrity_readback'
  Invoke-Query (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../supabase/inspections/stage06-cleanup-integrity.sql') -Raw)|ConvertTo-Json -Depth 8 -Compress
  foreach($adminId in @('929b1530-6889-4a06-a275-70ef0ba347cf','64ec7320-2a39-43d4-90d9-778544bb7b5a')){
    $probe=@'
begin read only;
do $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',(select auth_user_id from public.empleados where id='ADMIN_ID' and rol='admin' and activo),'aal','aal2','role','authenticated')::text,true); end $$;
set local role authenticated;
select jsonb_build_object('admin','ADMIN_ID','authorized_aal2_read',true,'routines',(select count(*) from public.rutinas),'tasks',(select count(*) from public.tareas_rutina),'daily',(select count(*) from public.asignaciones_diarias),'audits',(select count(*) from public.auditoria_diaria),'urgent',(select count(*) from public.tareas_urgentes)) as result;
rollback;
'@
    Invoke-Query ($probe.Replace('ADMIN_ID',$adminId)) $false|ConvertTo-Json -Depth 5 -Compress
  }
} catch {
  $status=0
  if($null -ne $_.Exception.PSObject.Properties['Response'] -and $null -ne $_.Exception.Response){$status=[int]$_.Exception.Response.StatusCode}
  if($phase -eq 'business_transaction' -and $_.ErrorDetails.Message){
    $detail=$_.ErrorDetails.Message|ConvertFrom-Json -ErrorAction SilentlyContinue
    if($null -ne $detail -and $detail.message -is [string]){
      # This SQL contains only backed-up business rows and combined digests;
      # return the error message only, never SQL, parameters or error context.
      [pscustomobject]@{SqlDiagnostic=$detail.message.Substring(0,[Math]::Min(250,$detail.message.Length))}|ConvertTo-Json -Compress
    }
  }
  [pscustomobject]@{Result='STOPPED';Phase=$phase;HttpStatus=$status;ErrorType=$_.Exception.GetType().Name;ErrorId=$_.FullyQualifiedErrorId;GuardMessage=$(if($_.Exception.Message -like 'Snapshot target*'){$_.Exception.Message}else{$null});RawDiagnosticsSuppressed=$true}|ConvertTo-Json -Compress
  exit 1
} finally {
  if($null -ne $record -and $record.Token -is [Security.SecureString]){$record.Token.Dispose()}
  if($null -ne (Get-Variable backup -ErrorAction SilentlyContinue) -and $null -ne $backup -and $backup.Data -is [Security.SecureString]){$backup.Data.Dispose()}
  $record=$null; $pat=$null; $headers=$null
}
