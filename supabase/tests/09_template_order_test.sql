-- Synthetic local PostgreSQL only. Every fixture and mutation rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_order(ok boolean,label text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'FAIL: %',label; end if;
raise notice 'PASS: %',label; end$$;
create function pg_temp.reject_order(statement text,expected text,label text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if sqlstate=expected then raise notice 'PASS: %',label; return; end if;
  raise;
 end;
 raise exception 'FAIL: unexpectedly allowed: %',label;
end$$;
update private.security_operations set maintenance=false where singleton;
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','order.admin@auth.gestor-barberia.invalid'),
 ('91000000-0000-4000-8000-000000000002','order.employee@auth.gestor-barberia.invalid');
insert into public.empleados(id,nombre,rol,auth_user_id,usuario,activo) values
 ('92000000-0000-4000-8000-000000000001','Synthetic ordering admin','admin','91000000-0000-4000-8000-000000000001','order.admin',true),
 ('92000000-0000-4000-8000-000000000002','Synthetic ordering employee','empleado','91000000-0000-4000-8000-000000000002','order.employee',true);
insert into public.rutinas(id,titulo,color,archivada_en) values
 ('93000000-0000-4000-8000-000000000001','A routine','copper',null),
 ('93000000-0000-4000-8000-000000000002','B routine','sage',null),
 ('93000000-0000-4000-8000-000000000003','Archived routine','plum',now());
insert into public.tareas_rutina(id,rutina_id,seccion,descripcion,orden,archivada_en) values
 ('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Same section','Step A',null,null),
 ('94000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001','Same section','Step B',7,null),
 ('94000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000002','Other routine','Step C',5,null),
 ('94000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000001','Archive','Step archived',2,now());
insert into public.asignaciones_diarias(empleado_id,rutina_id,fecha,tarea_ids) values
 ('92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',private.business_today(),array['94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002']::uuid[]);
insert into public.auditoria_diaria(empleado_id,tarea_id,fecha) values
 ('92000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000001',private.business_today()-1);
create temp table preserved_order as
select 'routine' kind,id,to_jsonb(r)-'orden' payload from public.rutinas r
union all select 'task',id,to_jsonb(t)-'orden' from public.tareas_rutina t
union all select 'assignment',id,to_jsonb(a) from public.asignaciones_diarias a
union all select 'audit',id,to_jsonb(a) from public.auditoria_diaria a;
create temp table preserved_access as select c.oid,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
 (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p where p.polrelid=c.oid) policies
 from pg_class c where c.oid in('public.rutinas'::regclass,'public.tareas_rutina'::regclass);
select pg_temp.assert_order(not (select prosecdef from pg_proc where oid='public.reorder_template_items(uuid[],uuid)'::regprocedure),'RPC uses invoker privileges');
select pg_temp.assert_order(not has_function_privilege('anon','public.reorder_template_items(uuid[],uuid)','EXECUTE'),'anonymous RPC execution denied');
select pg_temp.assert_order(not exists(select 1 from public.rutinas where orden is not null),'existing routine metadata stays untouched before reorder');
set local role authenticated;
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select public.reorder_template_items(array['93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001']::uuid[]);
select pg_temp.assert_order((select count(*)=2 from pg_locks where pid=pg_backend_pid() and relation in('public.rutinas'::regclass,'public.tareas_rutina'::regclass) and mode='ShareRowExclusiveLock' and granted),'reorder holds writer serialization locks until transaction end');
select pg_temp.assert_order((select array_agg(id order by orden nulls last,titulo,id)=array['93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001']::uuid[] from public.rutinas where archivada_en is null),'routine order persists with deterministic readback');
select public.reorder_template_items(array['94000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000001']::uuid[],'93000000-0000-4000-8000-000000000001');
select pg_temp.assert_order((select array_agg(id order by orden,id)=array['94000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000001']::uuid[] from public.tareas_rutina where rutina_id='93000000-0000-4000-8000-000000000001' and archivada_en is null),'task order reuses existing orden and normalizes gaps/nulls');
select pg_temp.assert_order((select orden=5 from public.tareas_rutina where id='94000000-0000-4000-8000-000000000003'),'other routine task order stays intact');
select pg_temp.assert_order((select orden=2 from public.tareas_rutina where id='94000000-0000-4000-8000-000000000004') and (select orden is null from public.rutinas where id='93000000-0000-4000-8000-000000000003'),'archived routine and task order stay intact');
select pg_temp.reject_order($s$select public.reorder_template_items(null)$s$,'22023','null list rejected');
select pg_temp.reject_order($s$select public.reorder_template_items('{}'::uuid[])$s$,'22023','empty list rejected');
select pg_temp.reject_order($s$select public.reorder_template_items(array[null]::uuid[])$s$,'22023','null item rejected');
select pg_temp.reject_order($s$select public.reorder_template_items(array['93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001']::uuid[])$s$,'22023','duplicate list rejected');
select pg_temp.reject_order($s$select public.reorder_template_items(array['93000000-0000-4000-8000-000000000001']::uuid[])$s$,'22023','stale incomplete routine membership rejected');
select pg_temp.reject_order($s$select public.reorder_template_items(array['93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000003']::uuid[])$s$,'22023','archived routine membership rejected');
select pg_temp.reject_order($s$select public.reorder_template_items(array['94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000003']::uuid[],'93000000-0000-4000-8000-000000000001')$s$,'22023','cross routine task movement rejected');
select pg_temp.reject_order($s$select public.reorder_template_items(array['94000000-0000-4000-8000-000000000001']::uuid[],'93000000-0000-4000-8000-000000000003')$s$,'22023','archived target routine rejected');
select pg_temp.assert_order((select orden=1 from public.rutinas where id='93000000-0000-4000-8000-000000000002') and (select orden=1 from public.tareas_rutina where id='94000000-0000-4000-8000-000000000002'),'invalid requests leave prior order intact');
reset role;
-- A real failing row trigger demonstrates rollback of every row in one save.
create function pg_temp.fail_order() returns trigger language plpgsql as $$begin
 if new.id='94000000-0000-4000-8000-000000000002' then raise exception 'synthetic failure' using errcode='23514'; end if;
 return new; end$$;
create trigger synthetic_order_failure before update on public.tareas_rutina for each row execute function pg_temp.fail_order();
set local role authenticated;
select pg_temp.reject_order($s$select public.reorder_template_items(array['94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002']::uuid[],'93000000-0000-4000-8000-000000000001')$s$,'23514','database save failure is reported');
select pg_temp.assert_order((select orden=2 from public.tareas_rutina where id='94000000-0000-4000-8000-000000000001') and (select orden=1 from public.tareas_rutina where id='94000000-0000-4000-8000-000000000002'),'failed save rolls back whole batch');
reset role;
drop trigger synthetic_order_failure on public.tareas_rutina;
set local role authenticated;
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select pg_temp.reject_order($s$select public.reorder_template_items(array['93000000-0000-4000-8000-000000000001']::uuid[])$s$,'42501','administrator AAL1 cannot reorder');
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}';
select pg_temp.reject_order($s$select public.reorder_template_items(array['94000000-0000-4000-8000-000000000001']::uuid[],'93000000-0000-4000-8000-000000000001')$s$,'42501','employee cannot reorder assigned tasks');
select pg_temp.assert_order((select array_agg(id order by orden,id)=array['94000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000001']::uuid[] from public.tareas_rutina),'employee reads the administrator task order through existing RLS');
set local request.jwt.claims='{}';
select pg_temp.reject_order($s$select public.reorder_template_items(array['93000000-0000-4000-8000-000000000001']::uuid[])$s$,'42501','missing session cannot reorder');
reset role;
update private.security_operations set maintenance=true where singleton;
set local role authenticated;
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select pg_temp.reject_order($s$select public.reorder_template_items(array['93000000-0000-4000-8000-000000000001']::uuid[])$s$,'42501','maintenance denies reorder');
reset role;
select pg_temp.assert_order(not exists(select 1 from preserved_order p full join (
 select 'routine' kind,id,to_jsonb(r)-'orden' payload from public.rutinas r
 union all select 'task',id,to_jsonb(t)-'orden' from public.tareas_rutina t
 union all select 'assignment',id,to_jsonb(a) from public.asignaciones_diarias a
 union all select 'audit',id,to_jsonb(a) from public.auditoria_diaria a
) c using(kind,id) where p.payload is distinct from c.payload),'UUIDs colors tasks assignments and history remain unchanged');
select pg_temp.assert_order(not exists(select 1 from preserved_access p join pg_class c on c.oid=p.oid where
 p.relacl is distinct from c.relacl or p.relrowsecurity<>c.relrowsecurity or p.relforcerowsecurity<>c.relforcerowsecurity
 or p.policies is distinct from (select jsonb_agg(to_jsonb(q) order by q.oid) from pg_policy q where q.polrelid=c.oid)),'table privileges and RLS policies remain unchanged');
rollback;
