-- Operational supplement after Auth cutover. Independent of rutinas.color.
begin;

create table private.security_operations (
  singleton boolean primary key default true check (singleton),
  maintenance boolean not null default true
);
insert into private.security_operations values (true, true);
create table private.admin_operation_admissions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  target_key text not null,
  admitted_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz
);
create index admin_admissions_actor_time on private.admin_operation_admissions(actor_id, admitted_at);
create index admin_admissions_target_time on private.admin_operation_admissions(target_key, admitted_at);
revoke all on private.security_operations, private.admin_operation_admissions from public, anon, authenticated, service_role;

create function private.business_access_open() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
 select coalesce((select not maintenance from private.security_operations where singleton), false)
$$;
revoke all on function private.business_access_open() from public, anon, authenticated;
grant execute on function private.business_access_open() to authenticated;

create or replace function private.current_employee_id() returns uuid
language sql stable security definer set search_path = pg_catalog as $$
 select e.id from public.empleados e
 where e.auth_user_id = auth.uid() and e.activo
   and private.business_access_open()
   and (e.rol <> 'admin' or auth.jwt()->>'aal' = 'aal2') limit 1
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
 select private.business_access_open() and coalesce(auth.jwt()->>'aal' = 'aal2', false)
   and exists (select 1 from public.empleados e
     where e.auth_user_id = auth.uid() and e.activo and e.rol = 'admin')
$$;
alter policy empleados_select_own_or_admin on public.empleados
 using (id = private.current_employee_id() or private.is_admin());

-- Share lock lives until transaction end. Closing maintenance waits for writers
-- already admitted by this trigger. New writers then observe the closed gate.
create function private.guard_business_write() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare v_closed boolean;
begin
 select maintenance into v_closed from private.security_operations where singleton for share;
 if coalesce(v_closed, true) then
   raise exception 'maintenance_active' using errcode = '55000';
 end if;
 return null;
end;
$$;
revoke all on function private.guard_business_write() from public, anon, authenticated, service_role;
do $$
declare v_table text;
begin
 foreach v_table in array array['empleados','rutinas','tareas_rutina','empleado_rutinas','auditoria_diaria','tareas_urgentes'] loop
   execute format('create trigger security_maintenance_write before insert or update or delete or truncate on public.%I for each statement execute function private.guard_business_write()', v_table);
 end loop;
end;
$$;

create function public.set_security_maintenance(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_in_flight integer;
begin
 if p_enabled is null then raise exception 'invalid_maintenance_state'; end if;
 update private.security_operations set maintenance = p_enabled where singleton;
 if not found then raise exception 'security_state_missing'; end if;
 select count(*) into v_in_flight from private.admin_operation_admissions where finished_at is null;
 return jsonb_build_object('maintenance',p_enabled,'in_flight',v_in_flight);
end;
$$;

create function public.admin_begin_operation(
 p_actor_auth_user_id uuid, p_action text, p_target_key text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
 v_closed boolean;
 v_now timestamptz;
 v_retry integer := 0;
 v_wait integer;
 v_id uuid;
begin
 -- One durable row serializes admissions across isolates and actors, including
 -- target quotas. Lock order is the same as maintenance and write guards.
 select maintenance into v_closed from private.security_operations where singleton for update;
 if coalesce(v_closed,true) then
   return jsonb_build_object('allowed',false,'error','maintenance_active','retry_after',60);
 end if;
 v_now := clock_timestamp();
 perform private.assert_admin_actor(p_actor_auth_user_id);
 if p_action not in ('create','reset_password','deactivate','reactivate','change_role')
   or p_target_key is null or p_target_key !~ '^[0-9a-f]{64}$' then
   raise exception 'invalid_operation';
 end if;
 -- Never prune unresolved leases: time passing does not prove an Auth request
 -- finished. They require explicit incident reconciliation, not automatic TTL.
 delete from private.admin_operation_admissions
 where finished_at is not null and admitted_at < v_now - interval '1 day';
 select case when count(*) >= 10 then greatest(1,ceil(extract(epoch from min(admitted_at)+interval '60 seconds'-v_now))::integer) else 0 end
 into v_retry from private.admin_operation_admissions
 where actor_id=p_actor_auth_user_id and admitted_at > v_now-interval '60 seconds';
 select case when count(*) >= 3 then greatest(1,ceil(extract(epoch from min(admitted_at)+interval '10 seconds'-v_now))::integer) else 0 end
 into v_wait from private.admin_operation_admissions
 where actor_id=p_actor_auth_user_id and admitted_at > v_now-interval '10 seconds';
 v_retry := greatest(v_retry,v_wait);
 if p_action in ('create','reset_password') then
   select case when count(*) >= 3 then greatest(1,ceil(extract(epoch from min(admitted_at)+interval '15 minutes'-v_now))::integer) else 0 end
   into v_wait from private.admin_operation_admissions
   where target_key=p_target_key and action=p_action and admitted_at > v_now-interval '15 minutes';
   v_retry := greatest(v_retry,v_wait);
 end if;
 if v_retry > 0 then return jsonb_build_object('allowed',false,'error','rate_limited','retry_after',v_retry); end if;
 insert into private.admin_operation_admissions(actor_id,action,target_key,admitted_at)
 values(p_actor_auth_user_id,p_action,p_target_key,v_now) returning id into v_id;
 return jsonb_build_object('allowed',true,'operation_id',v_id);
end;
$$;
create function public.admin_finish_operation(p_operation_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
 update private.admin_operation_admissions set finished_at=clock_timestamp()
 where id=p_operation_id and finished_at is null;
end;
$$;
revoke all on function public.set_security_maintenance(boolean) from public,anon,authenticated;
revoke all on function public.admin_begin_operation(uuid,text,text) from public,anon,authenticated;
revoke all on function public.admin_finish_operation(uuid) from public,anon,authenticated;
grant execute on function public.set_security_maintenance(boolean) to service_role;
grant execute on function public.admin_begin_operation(uuid,text,text) to service_role;
grant execute on function public.admin_finish_operation(uuid) to service_role;

commit;
