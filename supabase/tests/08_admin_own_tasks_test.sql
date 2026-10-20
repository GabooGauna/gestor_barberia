-- Synthetic, isolated PostgreSQL/Supabase only; never run against production.
-- Requires Auth helpers plus expand, cutover, security_operations and both daily
-- assignment migrations. Run as the local database owner. All fixtures roll back.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_own_tasks(ok boolean, label text) returns void
language plpgsql as $$begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end$$;
create function pg_temp.reject_own_tasks(statement text, label text) returns void
language plpgsql as $$begin
  begin execute statement;
  exception when insufficient_privilege then
    raise notice 'PASS: %', label; return;
  end;
  raise exception 'FAIL: unexpectedly allowed: %', label;
end$$;

-- No passwords, real identities, network access or persistent security changes.
insert into auth.users(id, email) values
 ('81000000-0000-4000-8000-000000000001','admin.own.tasks@auth.gestor-barberia.invalid'),
 ('81000000-0000-4000-8000-000000000002','employee.own.tasks@auth.gestor-barberia.invalid');
update private.security_operations set maintenance=false where singleton;
insert into public.empleados(id,nombre,rol,auth_user_id,usuario,activo) values
 ('82000000-0000-4000-8000-000000000001','Synthetic working admin','admin','81000000-0000-4000-8000-000000000001','admin.own.tasks',true),
 ('82000000-0000-4000-8000-000000000002','Synthetic other employee','empleado','81000000-0000-4000-8000-000000000002','employee.own.tasks',true);
insert into public.rutinas(id,titulo) values
 ('83000000-0000-4000-8000-000000000001','Synthetic own routine'),
 ('83000000-0000-4000-8000-000000000002','Synthetic other routine');
insert into public.tareas_rutina(id,rutina_id,seccion,descripcion,orden) values
 ('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','Own','Synthetic own task',1),
 ('84000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002','Other','Synthetic other task',1);
insert into public.asignaciones_diarias(empleado_id,rutina_id,fecha,tarea_ids) values
 ('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',private.business_today()-1,array['84000000-0000-4000-8000-000000000001'::uuid]);
insert into public.auditoria_diaria(empleado_id,tarea_id,fecha) values
 ('82000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',private.business_today()-1);
insert into public.tareas_urgentes(id,empleado_id,descripcion,fecha) values
 ('85000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Synthetic own urgency',private.business_today()),
 ('85000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','Synthetic other urgency',private.business_today()),
 ('85000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001','Synthetic past urgency',private.business_today()-1);

set local role authenticated;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select pg_temp.assert_own_tasks(private.is_admin() and private.current_employee_id()='82000000-0000-4000-8000-000000000001','admin AAL2 retains role and existing profile UUID');
select pg_temp.assert_own_tasks(not exists(select 1 from public.asignaciones_diarias where empleado_id=private.current_employee_id() and fecha=private.business_today()),'previous day does not assign today');
select pg_temp.reject_own_tasks($s$select public.set_task_completion('84000000-0000-4000-8000-000000000001',true)$s$,'admin cannot complete a task before assignment');
select public.set_daily_routine_assignment('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',true,private.business_today());
select public.set_daily_routine_assignment('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',true,private.business_today());
select pg_temp.assert_own_tasks((select count(*)=1 from public.asignaciones_diarias where empleado_id=private.current_employee_id() and fecha=private.business_today() and cancelada_en is null),'self assignment is dated and idempotent');
select public.set_daily_routine_assignment('82000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002',true,private.business_today());
select pg_temp.reject_own_tasks($s$select public.set_task_completion('84000000-0000-4000-8000-000000000002',true)$s$,'admin cannot complete another persons assigned task');
select public.set_task_completion('84000000-0000-4000-8000-000000000001',true);
select public.set_task_completion('84000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_own_tasks((select count(*)=1 from public.auditoria_diaria where empleado_id=private.current_employee_id() and fecha=private.business_today() and anulada_en is null),'own completion uses same daily audit without duplicates');
select public.set_task_completion('84000000-0000-4000-8000-000000000001',false);
select pg_temp.assert_own_tasks((select count(*)=1 from public.auditoria_diaria where empleado_id=private.current_employee_id() and fecha=private.business_today() and anulada_en is not null),'marking pending preserves annulled audit');
select public.set_task_completion('84000000-0000-4000-8000-000000000001',true);
select public.set_urgent_completion('85000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_own_tasks((select completada from public.tareas_urgentes where id='85000000-0000-4000-8000-000000000001' and empleado_id=private.current_employee_id()),'own urgency completion preserves responsible identity');
select public.set_urgent_completion('85000000-0000-4000-8000-000000000001',false);
select pg_temp.assert_own_tasks((select not completada from public.tareas_urgentes where id='85000000-0000-4000-8000-000000000001'),'own urgency can return to pending');
select pg_temp.reject_own_tasks($s$select public.set_urgent_completion('85000000-0000-4000-8000-000000000002',true)$s$,'admin cannot complete another persons urgency');
select pg_temp.reject_own_tasks($s$select public.set_urgent_completion('85000000-0000-4000-8000-000000000003',true)$s$,'admin cannot change historical urgency');
select pg_temp.reject_own_tasks($s$insert into public.auditoria_diaria(empleado_id,tarea_id,fecha) values('82000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000001',current_date)$s$,'direct audit writes remain denied');

reset role;
select pg_temp.assert_own_tasks((select count(*)=3 and bool_and(e.actor_auth_user_id='81000000-0000-4000-8000-000000000001') and count(*) filter(where action='completed')=2 and count(*) filter(where action='annulled')=1 from private.task_completion_events e join public.auditoria_diaria a on a.id=e.auditoria_id where a.empleado_id='82000000-0000-4000-8000-000000000001' and a.fecha=private.business_today()),'completion events record actual admin actor for complete/pending/complete');
select pg_temp.assert_own_tasks((select count(*)=1 from public.asignaciones_diarias where empleado_id='82000000-0000-4000-8000-000000000001' and fecha=private.business_today()-1) and (select count(*)=1 from public.auditoria_diaria where empleado_id='82000000-0000-4000-8000-000000000001' and fecha=private.business_today()-1 and anulada_en is null),'yesterday assignment and history are preserved');

set local role authenticated;
set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select pg_temp.assert_own_tasks(private.current_employee_id() is null and not private.is_admin(),'admin still requires AAL2');
select pg_temp.reject_own_tasks($s$select public.set_task_completion('84000000-0000-4000-8000-000000000001',false)$s$,'admin AAL1 cannot mutate task completion');
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000002';
set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}';
select pg_temp.assert_own_tasks((select count(*)=1 from public.asignaciones_diarias) and not exists(select 1 from public.auditoria_diaria where empleado_id='82000000-0000-4000-8000-000000000001'),'employee cannot read admin assignments or audit');
select pg_temp.reject_own_tasks($s$select public.set_daily_routine_assignment('82000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001',true,private.business_today())$s$,'employee still cannot assign routines');
select pg_temp.reject_own_tasks($s$select public.set_task_completion('84000000-0000-4000-8000-000000000001',true)$s$,'employee cannot complete admins task');
select public.set_task_completion('84000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_own_tasks((select count(*)=1 from public.auditoria_diaria where empleado_id=private.current_employee_id() and fecha=private.business_today()),'employee completion still works');
reset role;
rollback;
