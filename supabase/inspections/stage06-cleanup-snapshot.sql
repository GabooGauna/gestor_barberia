-- Fixed identity confirmed by the owner and the remote inventory. No secrets
-- leave PostgreSQL: protected Auth values contribute only to a combined digest.
with target as (
 select id, nombre, rol, creado_en, auth_user_id, usuario, activo, desactivado_en
 from public.empleados where id='bd5735c9-03c0-4220-8b24-f834b51847ed'
), audits as (
 select * from public.auditoria_diaria where empleado_id='bd5735c9-03c0-4220-8b24-f834b51847ed'
), urgent as (
 select * from public.tareas_urgentes where empleado_id='bd5735c9-03c0-4220-8b24-f834b51847ed'
)
select jsonb_build_object(
 'project','ucmwykzrepmjucssjnum',
 'payload',jsonb_build_object(
  'empleados',coalesce((select jsonb_agg(to_jsonb(x) order by id) from target x),'[]'),
  'auditoria_diaria',coalesce((select jsonb_agg(to_jsonb(x) order by id) from audits x),'[]'),
  'tareas_urgentes',coalesce((select jsonb_agg(to_jsonb(x) order by id) from urgent x),'[]'),
  'asignaciones_diarias',coalesce((select jsonb_agg(to_jsonb(x) order by id) from public.asignaciones_diarias x where empleado_id='bd5735c9-03c0-4220-8b24-f834b51847ed'),'[]'),
  'empleado_rutinas',coalesce((select jsonb_agg(to_jsonb(x) order by id) from public.empleado_rutinas x where empleado_id='bd5735c9-03c0-4220-8b24-f834b51847ed'),'[]'),
  'task_completion_events',coalesce((select jsonb_agg(to_jsonb(x) order by id) from private.task_completion_events x where auditoria_id in(select id from audits) or actor_auth_user_id='eb36b62d-de89-4277-876b-123099d6d281'),'[]'),
  'auth_admin_audit',coalesce((select jsonb_agg(to_jsonb(x) order by id) from private.auth_admin_audit x where target_empleado_id='bd5735c9-03c0-4220-8b24-f834b51847ed' or actor_auth_user_id='eb36b62d-de89-4277-876b-123099d6d281' or details->>'auth_user_id'='eb36b62d-de89-4277-876b-123099d6d281' or details->>'urgent_id' in(select id::text from urgent)),'[]'),
  'admin_operation_admissions',coalesce((select jsonb_agg(to_jsonb(x) order by id) from private.admin_operation_admissions x where actor_id='eb36b62d-de89-4277-876b-123099d6d281' or target_key in(select encode(sha256(convert_to(v,'UTF8')),'hex') from(select 'bd5735c9-03c0-4220-8b24-f834b51847ed' v union select 'empleado.gns') keys)),'[]')
 ),
 'auth_identity',(select jsonb_build_object('id',id,'email',email,'created_at',created_at,'email_confirmed_at',email_confirmed_at,'identities',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'provider',i.provider,'user_id',i.user_id)),'[]') from auth.identities i where i.user_id=u.id),'factors',(select count(*) from auth.mfa_factors f where f.user_id=u.id)) from auth.users u where id='eb36b62d-de89-4277-876b-123099d6d281'),
 'preserved',jsonb_build_object(
  'routines',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'')) from public.rutinas x),
  'tasks',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'')) from public.tareas_rutina x),
  'other_profiles',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'')) from public.empleados x where id<>'bd5735c9-03c0-4220-8b24-f834b51847ed'),
  'other_auth_credentials',(select md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'password',encrypted_password,'confirmed',email_confirmed_at,'banned',banned_until,'role',role,'app',raw_app_meta_data,'metadata',raw_user_meta_data) order by id)::text,'')) from auth.users where id<>'eb36b62d-de89-4277-876b-123099d6d281'),
  -- Login updates these timestamps; factor identity/status/material must remain
  -- identical. Factor material is hashed here and never returned in plaintext.
  'other_mfa',(select md5(coalesce(jsonb_agg(to_jsonb(f)-'updated_at'-'last_challenged_at' order by id)::text,'')) from auth.mfa_factors f where user_id<>'eb36b62d-de89-4277-876b-123099d6d281'),
  'policies',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)::text,'')) from pg_policies p where schemaname in ('public','private')),
  'grants',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by table_schema,table_name,grantee,privilege_type)::text,'')) from information_schema.role_table_grants p where table_schema in ('public','private')),
  'functions',(select md5(coalesce(string_agg(pg_get_functiondef(p.oid),chr(10) order by p.oid),'')) from pg_proc p where pronamespace in ('public'::regnamespace,'private'::regnamespace) and prokind='f'),
  'security_operations',(select md5(coalesce(jsonb_agg(to_jsonb(x))::text,'')) from private.security_operations x)
  ,'other_admissions',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'')) from private.admin_operation_admissions x where actor_id<>'eb36b62d-de89-4277-876b-123099d6d281' and target_key not in(select encode(sha256(convert_to(v,'UTF8')),'hex') from(select 'bd5735c9-03c0-4220-8b24-f834b51847ed' v union select 'empleado.gns') keys))
 )
) as result;
