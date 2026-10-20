-- Invoked only by stage06-cleanup.ps1 inside its locked transaction, after a
-- verified encrypted backup. expected_snapshot and actual_snapshot are temp.
do $$
declare expected jsonb; actual jsonb; item record; normalized jsonb; field text; n bigint; wanted bigint;
begin
 select result into expected from expected_snapshot;
 select result into actual from actual_snapshot;
 -- The Management API/PowerShell JSON transport normalizes timestamp offsets.
 -- Compare typed PostgreSQL rows so equivalent timestamp spellings do not
 -- trigger drift. IDs, contents and instants still have to match exactly.
 for item in select * from (values
  ('private','task_completion_events'),('private','auth_admin_audit'),
  ('private','admin_operation_admissions'),('public','auditoria_diaria'),
  ('public','tareas_urgentes'),('public','asignaciones_diarias'),
  ('public','empleado_rutinas'),('public','empleados')
 ) as tables(schema_name,table_name) loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by id),''[]''::jsonb) from jsonb_populate_recordset(null::%I.%I,$1) r',item.schema_name,item.table_name)
   into normalized using expected->'payload'->item.table_name;
  expected:=jsonb_set(expected,array['payload',item.table_name],normalized);
 end loop;
 foreach field in array array['created_at','email_confirmed_at'] loop
  expected:=jsonb_set(expected,array['auth_identity',field],coalesce(to_jsonb((expected#>>array['auth_identity',field])::timestamptz),'null'::jsonb));
 end loop;
 if actual->'payload' is distinct from expected->'payload' then
  raise exception 'snapshot_drift_abort_payload: %',(select string_agg(p.key,',') from jsonb_each(actual->'payload') p where p.value is distinct from expected->'payload'->p.key);
 end if;
 if actual->'auth_identity' is distinct from expected->'auth_identity' then
  raise exception 'snapshot_drift_abort_auth: %',(select string_agg(p.key,',') from jsonb_each(actual->'auth_identity') p where p.value is distinct from expected->'auth_identity'->p.key);
 end if;
 if actual->'preserved' is distinct from expected->'preserved' then
  raise exception 'snapshot_drift_abort_preserved: %',(select string_agg(p.key,',') from jsonb_each(actual->'preserved') p where p.value is distinct from expected->'preserved'->p.key);
 end if;
 if jsonb_array_length(expected->'payload'->'empleados')<>1
 or expected#>>'{payload,empleados,0,id}'<>'bd5735c9-03c0-4220-8b24-f834b51847ed'
 or expected#>>'{payload,empleados,0,rol}'<>'empleado'
 or expected#>>'{payload,empleados,0,auth_user_id}'<>'eb36b62d-de89-4277-876b-123099d6d281'
 or lower(expected#>>'{payload,empleados,0,nombre}') not in ('césar','cesar')
 or expected#>>'{auth_identity,id}'<>'eb36b62d-de89-4277-876b-123099d6d281'
 or exists(select 1 from private.admin_operation_admissions where finished_at is null)
 or (select count(*) from public.empleados where rol='admin' and activo)<>2
 then raise exception 'identity_or_inflight_guard_failed'; end if;
 -- Relations first. Each DELETE has an explicit ID allowlist from the backup.
 for item in select * from (values
  ('private','task_completion_events','bigint'),
  ('private','auth_admin_audit','bigint'),
  ('private','admin_operation_admissions','uuid'),
  ('public','auditoria_diaria','uuid'),
  ('public','tareas_urgentes','uuid'),
  ('public','asignaciones_diarias','uuid'),
  ('public','empleado_rutinas','uuid'),
  ('public','empleados','uuid')
 ) as tables(schema_name,table_name,id_type) loop
  wanted:=jsonb_array_length(expected->'payload'->item.table_name);
  if wanted=0 then continue; end if;
  execute format('delete from %I.%I where id in (select (r->>''id'')::%s from jsonb_array_elements($1) r)',item.schema_name,item.table_name,item.id_type)
   using expected->'payload'->item.table_name;
  get diagnostics n=row_count;
  if n<>wanted then raise exception 'delete_count_mismatch'; end if;
 end loop;
end $$;
