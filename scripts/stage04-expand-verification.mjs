// Read-only post-COMMIT gate for the already approved expand bytes. Importing
// does not connect, read credentials, apply SQL or certify a deployment.
export const approvedExpandSha256 = 'ae5be96cb0b1394785a3396a388a8d6ae1583681779333f961db52fa09d85095';

export const expandedCatalogSql = `
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='15s';
WITH expected_columns(schema_name,table_name,column_name,type_name,not_null) AS (VALUES
 ('public','empleados','auth_user_id','uuid',false),
 ('public','empleados','usuario','text',false),
 ('public','empleados','activo','boolean',true),
 ('public','empleados','desactivado_en','timestamp with time zone',false),
 ('public','rutinas','archivada_en','timestamp with time zone',false),
 ('public','tareas_rutina','archivada_en','timestamp with time zone',false),
 ('public','auditoria_diaria','anulada_en','timestamp with time zone',false),
 ('public','tareas_urgentes','cancelada_en','timestamp with time zone',false)
), expected_tables(schema_name,table_name) AS (VALUES
 ('public','empleados'),('public','rutinas'),('public','tareas_rutina'),
 ('public','empleado_rutinas'),('public','auditoria_diaria'),('public','tareas_urgentes'),
 ('private','auth_admin_audit'),('private','task_completion_events')
), expected_functions(signature,definer,authenticated_execute,service_execute) AS (VALUES
 ('private.canonical_username(text)',false,false,false),
 ('private.technical_auth_email(text)',false,false,false),
 ('private.current_employee_id()',true,true,false),
 ('private.is_admin()',true,true,false),
 ('private.assert_admin_actor(uuid)',true,false,false),
 ('private.write_auth_admin_audit(uuid,uuid,text,jsonb)',true,false,false),
 ('private.bootstrap_first_admin(uuid,uuid,text)',true,false,true),
 ('public.admin_link_auth_account(uuid,uuid,uuid,text)',true,false,true),
 ('public.admin_record_auth_operation(uuid,uuid,text)',true,false,true),
 ('public.admin_create_employee_account(uuid,uuid,uuid,text,text,text)',true,false,true),
 ('public.admin_deactivate_account(uuid,uuid)',true,false,true),
 ('public.admin_activate_account(uuid,uuid)',true,false,true),
 ('public.admin_set_employee_role(uuid,uuid,text)',true,false,true)
), table_objects AS (
 SELECT e.*,c.oid FROM expected_tables e
 LEFT JOIN pg_namespace n ON n.nspname=e.schema_name
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.table_name AND c.relkind='r'
), function_objects AS (
 SELECT e.*,p.* FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
)
SELECT json_build_object(
 'columns',(SELECT bool_and(coalesce(a.atttypid IS NOT NULL AND
   format_type(a.atttypid,a.atttypmod)=e.type_name AND a.attnotnull=e.not_null,false))
   FROM expected_columns e LEFT JOIN pg_namespace n ON n.nspname=e.schema_name
   LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.table_name
   LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped),
 'active_default',(SELECT coalesce(bool_and(pg_get_expr(d.adbin,d.adrelid)='true'),false)
   FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
   WHERE d.adrelid=to_regclass('public.empleados') AND a.attname='activo'),
 'closed_table_and_column_grants',(SELECT bool_and(CASE WHEN t.oid IS NULL THEN false ELSE
   NOT EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated')) r(role_name)
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege)
    WHERE has_table_privilege(r.role_name,t.oid,v.privilege))
   AND NOT EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN (VALUES ('anon'),('authenticated')) r(role_name)
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(privilege)
    WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
    AND has_column_privilege(r.role_name,t.oid,a.attnum,v.privilege)) END) FROM table_objects t),
 'function_security',(SELECT bool_and(coalesce(oid IS NOT NULL AND prosecdef=definer
   AND proconfig=ARRAY['search_path=pg_catalog']::text[] AND proowner=current_user::regrole
   AND NOT has_function_privilege('anon',oid,'EXECUTE')
   AND has_function_privilege('authenticated',oid,'EXECUTE')=authenticated_execute
   AND (NOT service_execute OR has_function_privilege('service_role',oid,'EXECUTE'))
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) x WHERE x.grantee=0),false)) FROM function_objects),
 'private_schema',(SELECT coalesce(bool_and(NOT has_schema_privilege('anon',oid,'USAGE')
   AND NOT has_schema_privilege('anon',oid,'CREATE') AND nspowner=current_user::regrole
   AND NOT has_schema_privilege('authenticated',oid,'CREATE')
   AND has_schema_privilege('authenticated',oid,'USAGE')
   AND has_schema_privilege('service_role',oid,'USAGE')),false) FROM pg_namespace WHERE nspname='private'),
 'constraints',(SELECT count(*)=3 FROM pg_constraint WHERE conrelid=to_regclass('public.empleados')
   AND conname IN ('empleados_auth_user_id_fkey','empleados_usuario_formato_check','empleados_estado_cuenta_check') AND NOT convalidated),
 'unique_indexes',(SELECT count(*)=2 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
   WHERE i.indrelid=to_regclass('public.empleados') AND c.relname IN ('empleados_auth_user_id_unique','empleados_usuario_lower_unique')
   AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NOT NULL),
 'new_sequences',(SELECT count(*)=2 AND bool_and(NOT has_sequence_privilege('anon',c.oid,'USAGE')
   AND NOT has_sequence_privilege('anon',c.oid,'SELECT') AND NOT has_sequence_privilege('anon',c.oid,'UPDATE')
   AND NOT has_sequence_privilege('authenticated',c.oid,'USAGE') AND NOT has_sequence_privilege('authenticated',c.oid,'SELECT')
   AND NOT has_sequence_privilege('authenticated',c.oid,'UPDATE'))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='S'
   AND c.relname IN ('auth_admin_audit_id_seq','task_completion_events_id_seq'))
);
ROLLBACK;
`;

export function acceptExpandedCatalog(value) {
  const keys = ['columns', 'active_default', 'closed_table_and_column_grants',
    'function_security', 'private_schema', 'constraints', 'unique_indexes', 'new_sequences'];
  return value != null && typeof value === 'object' &&
    keys.every(key => Object.hasOwn(value, key) && value[key] === true);
}
