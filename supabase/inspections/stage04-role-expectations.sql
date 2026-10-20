-- Independent business predicates, NOT evaluated through RLS/role claims.
-- Expected sets WHEN maintenance is open: admin AAL2 / employee AAL1.
-- Output contains only counts and aggregate UUID digests, never row IDs.
BEGIN TRANSACTION READ ONLY;
WITH employee AS (
 SELECT id FROM public.empleados WHERE activo AND rol='empleado' AND auth_user_id IS NOT NULL
), resources(resource) AS (
 VALUES ('empleados'),('rutinas'),('tareas_rutina'),('empleado_rutinas'),('auditoria_diaria'),('tareas_urgentes')
), all_ids(resource,id) AS (
 SELECT 'empleados',id FROM public.empleados UNION ALL
 SELECT 'rutinas',id FROM public.rutinas UNION ALL
 SELECT 'tareas_rutina',id FROM public.tareas_rutina UNION ALL
 SELECT 'empleado_rutinas',id FROM public.empleado_rutinas UNION ALL
 SELECT 'auditoria_diaria',id FROM public.auditoria_diaria UNION ALL
 SELECT 'tareas_urgentes',id FROM public.tareas_urgentes
), employee_ids(resource,id) AS (
 SELECT 'empleados',id FROM employee UNION ALL
 SELECT 'rutinas',r.id FROM public.rutinas r WHERE r.archivada_en IS NULL AND EXISTS (
  SELECT 1 FROM public.empleado_rutinas er JOIN employee e ON e.id=er.empleado_id WHERE er.rutina_id=r.id
 ) UNION ALL
 SELECT 'tareas_rutina',t.id FROM public.tareas_rutina t WHERE t.archivada_en IS NULL AND EXISTS (
  SELECT 1 FROM public.empleado_rutinas er JOIN employee e ON e.id=er.empleado_id
  JOIN public.rutinas r ON r.id=er.rutina_id WHERE er.rutina_id=t.rutina_id AND r.archivada_en IS NULL
 ) UNION ALL
 SELECT 'empleado_rutinas',er.id FROM public.empleado_rutinas er WHERE EXISTS(SELECT 1 FROM employee e WHERE e.id=er.empleado_id) UNION ALL
 SELECT 'auditoria_diaria',a.id FROM public.auditoria_diaria a WHERE EXISTS(SELECT 1 FROM employee e WHERE e.id=a.empleado_id) UNION ALL
 SELECT 'tareas_urgentes',t.id FROM public.tareas_urgentes t WHERE EXISTS(SELECT 1 FROM employee e WHERE e.id=t.empleado_id)
), role_sets AS (
 SELECT 'admin' AS role,r.resource,count(a.id) AS count,
 encode(sha256(convert_to(coalesce(string_agg(a.id::text,chr(10) ORDER BY a.id),''),'UTF8')),'hex') AS uuid_sha256
 FROM resources r LEFT JOIN all_ids a USING(resource) GROUP BY r.resource
 UNION ALL
 SELECT 'employee',r.resource,count(e.id),
 encode(sha256(convert_to(coalesce(string_agg(e.id::text,chr(10) ORDER BY e.id),''),'UTF8')),'hex')
 FROM resources r LEFT JOIN employee_ids e USING(resource) GROUP BY r.resource
)
SELECT json_build_object(
 'kind','stage04.role_expectations.v1','expected_when_maintenance_open',true,
 'maintenance_current',(SELECT maintenance FROM private.security_operations WHERE singleton),
 'active_linked_profiles',(SELECT count(*) FROM public.empleados WHERE activo AND auth_user_id IS NOT NULL),
 'active_linked_admins',(SELECT count(*) FROM public.empleados WHERE activo AND rol='admin' AND auth_user_id IS NOT NULL),
 'active_linked_employees',(SELECT count(*) FROM employee),
 'admin',(SELECT json_agg(json_build_object('resource',resource,'count',count,'uuid_sha256',uuid_sha256) ORDER BY resource) FROM role_sets WHERE role='admin'),
 'employee',(SELECT json_agg(json_build_object('resource',resource,'count',count,'uuid_sha256',uuid_sha256) ORDER BY resource) FROM role_sets WHERE role='employee')
);
ROLLBACK;
