# Applies only the reviewed template-order contract to the existing GNS project.
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
 'routine_order_exists',exists(select 1 from information_schema.columns where table_schema='public' and table_name='rutinas' and column_name='orden'),
 'task_order_integer',exists(select 1 from information_schema.columns where table_schema='public' and table_name='tareas_rutina' and column_name='orden' and data_type='integer'),
 'maintenance_guard',to_regprocedure('private.guard_business_write()') is not null,
 'order_rpc_exists',to_regprocedure('public.reorder_template_items(uuid[],uuid)') is not null,
 'order_rpc_invoker',(select not prosecdef from pg_proc where oid=to_regprocedure('public.reorder_template_items(uuid[],uuid)')),
 'tables_rls_forced',(select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in('public.rutinas'::regclass,'public.tareas_rutina'::regclass)),
 'authenticated_update',has_table_privilege('authenticated','public.rutinas','UPDATE') and has_table_privilege('authenticated','public.tareas_rutina','UPDATE'),
 'anon_access',has_table_privilege('anon','public.rutinas','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon','public.tareas_rutina','SELECT,INSERT,UPDATE,DELETE'),
 'routine_count',(select count(*) from public.rutinas),
 'task_count',(select count(*) from public.tareas_rutina)
) as result;
'@
  $before=Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$inspect;read_only=$true}|ConvertTo-Json) -TimeoutSec 30
  if ($Action -eq 'Inspect') { $before | ConvertTo-Json -Depth 5 -Compress; return }
  if ($before[0].result.routine_order_exists -or $before[0].result.order_rpc_exists -or -not $before[0].result.task_order_integer -or -not $before[0].result.maintenance_guard -or -not $before[0].result.tables_rls_forced -or -not $before[0].result.authenticated_update -or $before[0].result.anon_access) { throw 'Schema differs; do not reapply' }
  $migration=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../supabase/migrations/20261024000000_template_order.sql') -Raw
  $migration=$migration -replace '(?m)^begin;\s*$','' -replace '(?m)^commit;\s*$',''
  $prefix=@'
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.empleados,public.rutinas,public.tareas_rutina,public.empleado_rutinas,public.auditoria_diaria,public.tareas_urgentes,public.asignaciones_diarias in share mode;
create temp table order_preserved(table_name text primary key, fingerprint text) on commit drop;
create temp table order_access on commit drop as select c.oid,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
 (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p where p.polrelid=c.oid) policies
 from pg_class c where c.oid in('public.rutinas'::regclass,'public.tareas_rutina'::regclass);
do $$ declare t text; f text; begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='rutinas' and column_name='orden')
 or to_regprocedure('public.reorder_template_items(uuid[],uuid)') is not null then raise exception 'schema_drift'; end if;
 foreach t in array array['empleados','rutinas','tareas_rutina','empleado_rutinas','auditoria_diaria','tareas_urgentes','asignaciones_diarias'] loop
 execute format('select md5(coalesce(string_agg((to_jsonb(x)-case when %L=''rutinas'' then ''orden'' else ''__absent__'' end)::text,chr(10) order by id),'''')) from public.%I x',t,t) into f;
 insert into order_preserved values(t,f);
 end loop;
end $$;
'@
  $suffix=@'
do $$ declare t text; f text; expected text; begin
 foreach t in array array['empleados','rutinas','tareas_rutina','empleado_rutinas','auditoria_diaria','tareas_urgentes','asignaciones_diarias'] loop
 execute format('select md5(coalesce(string_agg((to_jsonb(x)-case when %L=''rutinas'' then ''orden'' else ''__absent__'' end)::text,chr(10) order by id),'''')) from public.%I x',t,t) into f;
 select fingerprint into expected from order_preserved where table_name=t;
 if f is distinct from expected then raise exception 'history_changed'; end if;
 end loop;
 if exists(select 1 from public.rutinas where orden is not null) then raise exception 'unexpected_order_backfill'; end if;
 if exists(select 1 from order_access p join pg_class c on c.oid=p.oid where p.relacl is distinct from c.relacl
 or p.relrowsecurity<>c.relrowsecurity or p.relforcerowsecurity<>c.relforcerowsecurity
 or p.policies is distinct from (select jsonb_agg(to_jsonb(q) order by q.oid) from pg_policy q where q.polrelid=c.oid)) then raise exception 'access_changed'; end if;
 if (select prosecdef from pg_proc where oid='public.reorder_template_items(uuid[],uuid)'::regprocedure)
 or has_function_privilege('anon','public.reorder_template_items(uuid[],uuid)','EXECUTE')
 or not has_function_privilege('authenticated','public.reorder_template_items(uuid[],uuid)','EXECUTE') then raise exception 'privilege_check_failed'; end if;
end $$;
commit;
select jsonb_build_object('applied',true,'historical_tables_preserved',7,'existing_order_backfilled',false,'table_access_preserved',true,'rpc_security_invoker',true) as result;
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
