# Applies only the dated-assignment contract to the existing GNS project.
param([ValidateSet('Inspect','Apply')][string] $Action='Inspect')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$stage='guards'; $record=$null; $pat=$null; $headers=$null; $attempted=$false
try {
  $tokens=$null; $errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'stage04-store-db-credential.ps1'),[ref]$tokens,[ref]$errors)
  if ($errors.Count) { throw 'Guard parser failed' }
  foreach ($name in @('Assert-NoReparsePath','Assert-PrivateAcl','Assert-LocalOnlyDestination')) {
    $nodes=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$false))
    if ($nodes.Count -ne 1) { throw 'Guard unavailable' }
    . ([scriptblock]::Create($nodes[0].Extent.Text))
  }
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $app=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'GestorBarberia'
  $directory=Join-Path $app 'secrets'; $path=Join-Path $directory 'stage04-management-token.clixml'
  Assert-LocalOnlyDestination $path
  foreach ($entry in @($app,$directory,$path)) { Assert-NoReparsePath $entry; Assert-PrivateAcl -LiteralPath $entry -OwnerSid $sid }
  $stage='credential_import'; $record=Import-Clixml -LiteralPath $path
  if ($record.FormatVersion -ne 1 -or $record.ProjectRef -cne 'ucmwykzrepmjucssjnum' -or $record.Purpose -cne 'stage04_management_api' -or $record.Token -isnot [Security.SecureString]) { throw 'Credential rejected' }
  $pat=[Net.NetworkCredential]::new('management',$record.Token).Password
  $headers=@{Authorization=('Bearer '+$pat)}
  $base='https://api.supabase.com/v1/projects/ucmwykzrepmjucssjnum'
  $stage='target_identity'; $project=Invoke-RestMethod -Uri $base -Headers $headers -TimeoutSec 20
  if ($project.id -cne 'ucmwykzrepmjucssjnum' -or $project.region -cne 'sa-east-1' -or $project.status -cne 'ACTIVE_HEALTHY') { throw 'Target mismatch' }
  $stage='schema_inspection'
  $inspect=@'
select jsonb_build_object(
 'daily_exists',to_regclass('public.asignaciones_diarias') is not null,
 'legacy_exists',to_regclass('public.empleado_rutinas') is not null,
 'today',(current_timestamp at time zone 'America/Argentina/Buenos_Aires')::date,
 'maintenance_guard',to_regprocedure('private.guard_business_write()') is not null,
 'assignment_rpc',to_regprocedure('public.set_daily_routine_assignment(uuid,uuid,boolean,date)') is not null,
 'daily_rls_forced',(select relrowsecurity and relforcerowsecurity from pg_class where oid=to_regclass('public.asignaciones_diarias')),
 'daily_select_granted',case when to_regclass('public.asignaciones_diarias') is not null then has_table_privilege('authenticated','public.asignaciones_diarias','SELECT') end,
 'daily_direct_writes',case when to_regclass('public.asignaciones_diarias') is not null then has_table_privilege('authenticated','public.asignaciones_diarias','INSERT,UPDATE,DELETE') end,
 'anon_daily_access',case when to_regclass('public.asignaciones_diarias') is not null then has_table_privilege('anon','public.asignaciones_diarias','SELECT,INSERT,UPDATE,DELETE') end,
 'completion_uses_daily',(select prosrc like '%public.asignaciones_diarias%' from pg_proc where oid=to_regprocedure('public.set_task_completion(uuid,boolean)')),
 'cancel_requires_today',(select prosrc like '%private.business_today()%' and prosrc like '%not coalesce(u.completada,false)%' from pg_proc where oid=to_regprocedure('public.cancel_urgent_task(uuid)'))
) as result;
'@
  $before=Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$inspect;read_only=$true}|ConvertTo-Json) -TimeoutSec 30
  if ($Action -eq 'Inspect') { $before | ConvertTo-Json -Depth 5 -Compress; return }
  if ($before[0].result.daily_exists -or -not $before[0].result.legacy_exists -or -not $before[0].result.maintenance_guard) { throw 'Schema differs; do not reapply' }
  $migration=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../supabase/migrations/20261020000000_daily_assignments.sql') -Raw
  $migration=$migration -replace '(?m)^begin;\s*$','' -replace '(?m)^commit;\s*$',''
  $prefix=@'
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.empleados,public.rutinas,public.tareas_rutina,public.empleado_rutinas,public.auditoria_diaria,public.tareas_urgentes in share mode;
create temp table daily_preserved(table_name text primary key, fingerprint text) on commit drop;
do $$ declare t text; f text; begin
 foreach t in array array['empleados','rutinas','tareas_rutina','empleado_rutinas','auditoria_diaria','tareas_urgentes'] loop
 execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,chr(10) order by id),'''')) from public.%I x',t) into f;
 insert into daily_preserved values(t,f);
 end loop;
end $$;
'@
  $suffix=@'
do $$ declare t text; f text; expected text; begin
 foreach t in array array['empleados','rutinas','tareas_rutina','empleado_rutinas','auditoria_diaria','tareas_urgentes'] loop
 execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,chr(10) order by id),'''')) from public.%I x',t) into f;
 select fingerprint into expected from daily_preserved where table_name=t;
 if f is distinct from expected then raise exception 'history_changed'; end if;
 end loop;
 if exists(select 1 from public.asignaciones_diarias) then raise exception 'unexpected_daily_rows'; end if;
 if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.asignaciones_diarias'::regclass) then raise exception 'rls_required'; end if;
 if has_table_privilege('anon','public.asignaciones_diarias','SELECT')
 or has_table_privilege('authenticated','public.asignaciones_diarias','INSERT,UPDATE,DELETE')
 or has_function_privilege('anon','public.set_daily_routine_assignment(uuid,uuid,boolean,date)','EXECUTE')
 or not has_function_privilege('authenticated','public.set_daily_routine_assignment(uuid,uuid,boolean,date)','EXECUTE') then raise exception 'privilege_check_failed'; end if;
end $$;
commit;
select jsonb_build_object('applied',true,'historical_tables_preserved',6,'daily_rows',count(*),'rls_enabled',true,'direct_writes_granted',false) as result from public.asignaciones_diarias;
'@
  $stage='apply_transaction'; $attempted=$true
  $result=Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$prefix+"`n"+$migration+"`n"+$suffix}|ConvertTo-Json) -TimeoutSec 60
  $result | ConvertTo-Json -Depth 5 -Compress
} catch {
  $status=0
  if ($null -ne $_.Exception.PSObject.Properties['Response'] -and $null -ne $_.Exception.Response) { $status=[int]$_.Exception.Response.StatusCode }
  if ($stage -eq 'schema_inspection' -and $_.ErrorDetails.Message) {
    $detail=$_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($null -ne $detail) { [pscustomobject]@{SchemaDiagnostic=$detail.message}|ConvertTo-Json -Compress }
  }
  [pscustomobject]@{Result='STOPPED';Stage=$stage;HttpStatus=$status;MutationAttempted=$attempted;RawDiagnosticsSuppressed=$true}|ConvertTo-Json -Compress
  exit 1
} finally {
  if ($null -ne $record -and $record.Token -is [Security.SecureString]) {$record.Token.Dispose()}
  $record=$null;$pat=$null;$headers=$null
}
