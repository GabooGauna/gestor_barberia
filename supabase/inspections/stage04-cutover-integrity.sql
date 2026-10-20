-- Operational checkpoint only. No PIN/auth payloads or business values returned.
-- Employee projection never reads PIN. Added auth/archive/color columns are
-- excluded from legacy hashes so UUID/history remain comparable across phases.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL timezone='UTC';
SET LOCAL datestyle='ISO,YMD';
WITH records(resource,id,legacy) AS (
 SELECT 'empleados',id::text,jsonb_build_array(id,nombre,rol) FROM public.empleados
 UNION ALL SELECT 'rutinas',id::text,to_jsonb(r)-'archivada_en'-'color' FROM public.rutinas r
 UNION ALL SELECT 'tareas_rutina',id::text,to_jsonb(t)-'archivada_en' FROM public.tareas_rutina t
 UNION ALL SELECT 'empleado_rutinas',id::text,to_jsonb(e) FROM public.empleado_rutinas e
 UNION ALL SELECT 'auditoria_diaria',id::text,to_jsonb(a)-'anulada_en' FROM public.auditoria_diaria a
 UNION ALL SELECT 'tareas_urgentes',id::text,to_jsonb(u)-'cancelada_en' FROM public.tareas_urgentes u
), expected_resources(resource) AS (VALUES ('empleados'),('rutinas'),('tareas_rutina'),('empleado_rutinas'),('auditoria_diaria'),('tareas_urgentes')),
summaries AS (
 SELECT e.resource,count(r.id)::text AS count,
 encode(sha256(convert_to(coalesce(string_agg(r.id,chr(10) ORDER BY r.id COLLATE "C"),''),'UTF8')),'hex') AS uuid_sha256,
 encode(sha256(convert_to(coalesce(string_agg(r.legacy::text,chr(10) ORDER BY r.id COLLATE "C"),''),'UTF8')),'hex') AS legacy_sha256
 FROM expected_resources e LEFT JOIN records r ON r.resource=e.resource GROUP BY e.resource
)
SELECT json_build_object(
 'database',current_database(),'actor',current_user,
 'business',(SELECT json_agg(s ORDER BY resource COLLATE "C") FROM summaries s),
 'invalid_roles',(SELECT count(*) FROM public.empleados WHERE rol IS NULL OR rol NOT IN ('admin','empleado')),
 'admin_profile_ids',(SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM public.empleados WHERE rol='admin'),
 'duplicate_audit_groups',(SELECT count(*) FROM (SELECT 1 FROM public.auditoria_diaria GROUP BY empleado_id,tarea_id,fecha HAVING count(*)>1) d),
 'invalid_audit_reference',(SELECT count(*) FROM public.auditoria_diaria a LEFT JOIN public.empleados e ON e.id=a.empleado_id
   LEFT JOIN public.tareas_rutina t ON t.id=a.tarea_id WHERE e.id IS NULL OR t.id IS NULL OR a.fecha IS NULL),
 'unexpected_active_writers',(SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend'
   AND state='active' AND application_name NOT LIKE 'stage04_%'
   AND query ~* '(^|[;[:space:]])(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|nextval|setval)([[:space:](]|$)'),
 'unexpected_open_transactions',(SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend'
   AND state LIKE 'idle in transaction%' AND application_name NOT LIKE 'stage04_%'),
 'active_auth_transactions',(SELECT count(*) FROM pg_stat_activity WHERE usename='supabase_auth_admin' AND xact_start IS NOT NULL),
 'auth_lock_waits',(SELECT count(*) FROM pg_stat_activity WHERE usename='supabase_auth_admin' AND wait_event_type='Lock'),
 'cron_installed',EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron'),
 'net_installed',EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_net'),
 'auth_expand_present',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empleados'::regclass AND attname='auth_user_id' AND NOT attisdropped),
 'color_present',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.rutinas'::regclass AND attname='color' AND NOT attisdropped)
);
ROLLBACK;
