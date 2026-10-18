-- Inspection only. Never applies migrations or reads PIN/credentials.
-- Run ONLY through an authorized read-only connection/MCP. Candidate checks
-- below require the operational supplement; absent objects remain a gate.
begin transaction read only;
set local statement_timeout = '15s';

select current_database() as database_name, current_setting('server_version') as postgres_version;
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner,
       has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as anon_any_privilege,
       has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE') as anon_any_column_privilege
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

select table_name, column_name, data_type, is_nullable
from information_schema.columns where table_schema='public'
  and table_name in ('empleados','rutinas','tareas_rutina','empleado_rutinas','auditoria_diaria','tareas_urgentes')
order by table_name, ordinal_position;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public','private') order by schemaname,tablename,policyname;
select table_schema,table_name,grantee,privilege_type
from information_schema.table_privileges where table_schema in ('public','private')
order by table_schema,table_name,grantee,privilege_type;
select table_name,column_name,grantee,privilege_type
from information_schema.column_privileges where table_schema='public'
order by table_name,column_name,grantee,privilege_type;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as signature,
       pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig,
       md5(pg_get_functiondef(p.oid)) as definition_checksum,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.prokind='f'
  and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
order by n.nspname,p.proname,signature;
select n.nspname,c.relname,k.conname,k.convalidated,pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') order by n.nspname,c.relname,k.conname;
select n.nspname,c.relname,t.tgname,t.tgenabled,
       pg_get_userbyid(c.relowner) as table_owner,
       fn.nspname as function_schema,p.proname as function_name,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid join pg_namespace fn on fn.oid=p.pronamespace
where not t.tgisinternal and n.nspname in ('public','private')
order by n.nspname,c.relname,t.tgname;
select pg_get_userbyid(d.defaclrole) as role_name,n.nspname,d.defaclobjtype,d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace;

-- Aggregates only: exact UUID reconciliation remains inside the protected
-- operator environment. No SELECT *, to_jsonb(employee), auth rows or PIN.
select 'empleados' as resource,count(*) from public.empleados
union all select 'rutinas',count(*) from public.rutinas
union all select 'tareas_rutina',count(*) from public.tareas_rutina
union all select 'empleado_rutinas',count(*) from public.empleado_rutinas
union all select 'auditoria_diaria',count(*) from public.auditoria_diaria
union all select 'tareas_urgentes',count(*) from public.tareas_urgentes;
select count(*) as invalid_roles from public.empleados where rol is null or rol not in ('admin','empleado');
select count(*) as duplicate_audit_groups from (
 select 1 from public.auditoria_diaria group by empleado_id,tarea_id,fecha having count(*)>1
) duplicates;
select count(*) as invalid_audit_reference from public.auditoria_diaria a
left join public.empleados e on e.id=a.empleado_id
left join public.tareas_rutina t on t.id=a.tarea_id
where e.id is null or t.id is null or a.fecha is null;

-- Missing candidates are reported without attempting DDL or corrective writes.
select to_regclass('private.security_operations') is not null as operational_state_exists,
       to_regprocedure('public.admin_begin_operation(uuid,text,text)') is not null as edge_admission_exists;
rollback;
