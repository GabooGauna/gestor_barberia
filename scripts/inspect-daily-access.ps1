# Diagnose / repair the date helper ACL. No business rows are returned or changed.
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
 'today_function',pg_get_functiondef('private.business_today()'::regprocedure),
 'authenticated_execute',has_function_privilege('authenticated','private.business_today()','EXECUTE'),
 'anon_execute',has_function_privilege('anon','private.business_today()','EXECUTE'),
 'schema_usage',has_schema_privilege('authenticated','private','USAGE'),
 'daily_rls',(select relrowsecurity and relforcerowsecurity from pg_class where oid='public.asignaciones_diarias'::regclass),
 'policies',(select jsonb_agg(jsonb_build_object('table',tablename,'policy',policyname,'qual',qual)) from pg_policies where tablename in ('rutinas','tareas_rutina','asignaciones_diarias')),
 'counts',jsonb_build_object('daily',(select count(*) from public.asignaciones_diarias),'audits',(select count(*) from public.auditoria_diaria),'urgent',(select count(*) from public.tareas_urgentes))
) as result;
'@
  $result=Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$inspect;read_only=$true}|ConvertTo-Json) -TimeoutSec 30
  $result | ConvertTo-Json -Depth 8 -Compress
  if ($Action -eq 'Apply') {
    $stage='apply_transaction'; $attempted=$true
    $fix=@'
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$ begin
 if pg_get_functiondef('private.business_today()'::regprocedure) not like '%America/Argentina/Buenos_Aires%'
 or (select prosecdef from pg_proc where oid='private.business_today()'::regprocedure)
 or has_function_privilege('anon','private.business_today()','EXECUTE')
 or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid='private.business_today()'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')
 then raise exception 'date_helper_guard_failed'; end if;
end $$;
revoke execute on function private.business_today() from public, anon;
grant execute on function private.business_today() to authenticated;
do $$ begin
 if not has_function_privilege('authenticated','private.business_today()','EXECUTE')
 or has_function_privilege('anon','private.business_today()','EXECUTE')
 or not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.asignaciones_diarias'::regclass)
 or has_table_privilege('authenticated','public.asignaciones_diarias','INSERT,UPDATE,DELETE')
 then raise exception 'postcondition_failed'; end if;
end $$;
commit;
select jsonb_build_object('applied',true,'authenticated_execute',has_function_privilege('authenticated','private.business_today()','EXECUTE'),
 'anon_execute',has_function_privilege('anon','private.business_today()','EXECUTE')) as result;
'@
    $applyResult=Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$fix}|ConvertTo-Json) -TimeoutSec 30
    $applyResult | ConvertTo-Json -Depth 4 -Compress
  }
  $stage='authenticated_read'
  $probe=@'
begin read only;
do $$ begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(
  select auth_user_id from public.empleados where rol='admin' and activo limit 1),
  'aal','aal2','role','authenticated')::text,true);
end $$;
set local role authenticated;
select jsonb_build_object('routines',(select count(*) from public.rutinas),
 'tasks',(select count(*) from public.tareas_rutina),
 'daily',(select count(*) from public.asignaciones_diarias),
 'audits',(select count(*) from public.auditoria_diaria),
 'audit_nested_visible',(select count(*) from public.auditoria_diaria a
 join public.empleados e on e.id=a.empleado_id
 join public.tareas_rutina t on t.id=a.tarea_id join public.rutinas r on r.id=t.rutina_id),
 'daily_nested_visible',(select count(*) from public.asignaciones_diarias a
 join public.empleados e on e.id=a.empleado_id
 join public.rutinas r on r.id=a.rutina_id
 left join public.tareas_rutina t on t.rutina_id=r.id),
 'urgent_nested_visible',(select count(*) from public.tareas_urgentes u join public.empleados e on e.id=u.empleado_id)
 ) as result;
rollback;
'@
  foreach ($roleName in @('admin','empleado','admin_aal1','unlinked')) {
    $roleProbe=$probe
    if ($roleName -eq 'empleado') { $roleProbe=$probe.Replace("rol='admin'","rol='empleado'").Replace("'aal2'","'aal1'") }
    if ($roleName -eq 'admin_aal1') { $roleProbe=$probe.Replace("'aal2'","'aal1'") }
    if ($roleName -eq 'unlinked') { $roleProbe=$probe.Replace("rol='admin'","rol='nonexistent'") }
    $probeResult=Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$roleProbe;read_only=$false}|ConvertTo-Json) -TimeoutSec 30
    [pscustomobject]@{Role=$roleName;ReadProbe=$probeResult}|ConvertTo-Json -Depth 6 -Compress
  }
  $stage='anonymous_read'
  $anonProbe='begin read only; set local role anon; select count(*) from public.asignaciones_diarias; rollback;'
  $anonymousDenied=$false
  try {
    $null=Invoke-RestMethod -Method Post -Uri ($base+'/database/query') -Headers $headers -ContentType 'application/json' -Body (@{query=$anonProbe;read_only=$false}|ConvertTo-Json) -TimeoutSec 30
  } catch {
    if ($_.ErrorDetails.Message -match 'permission denied for table asignaciones_diarias') { $anonymousDenied=$true }
    else { throw }
  }
  if (-not $anonymousDenied) { throw 'Anonymous read unexpectedly allowed' }
  Write-Output '{"Role":"anon","DailySelectDenied":true}'
} catch {
  $status=0
  if ($null -ne $_.Exception.PSObject.Properties['Response'] -and $null -ne $_.Exception.Response) { $status=[int]$_.Exception.Response.StatusCode }
  if ($stage -eq 'authenticated_read' -and $_.ErrorDetails.Message -match 'permission denied for function business_today') {
    Write-Output '{"AuthenticatedRead":"FAIL","Diagnostic":"permission denied for function business_today"}'
  }
  if ($stage -eq 'authenticated_read' -and $_.ErrorDetails.Message) {
    $diagnostic=$_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($null -ne $diagnostic) { [pscustomobject]@{ProbeDiagnostic=$diagnostic.message}|ConvertTo-Json -Compress }
  }
  [pscustomobject]@{Result='STOPPED';Stage=$stage;HttpStatus=$status;MutationAttempted=$attempted;RawDiagnosticsSuppressed=$true}|ConvertTo-Json -Compress
  exit 1
} finally {
  if ($null -ne $record -and $record.Token -is [Security.SecureString]) {$record.Token.Dispose()}
  $record=$null;$pat=$null;$headers=$null
}
