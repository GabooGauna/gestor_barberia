-- Daily assignments: preserve legacy configuration and every historical row.
begin;
create table public.asignaciones_diarias (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete restrict,
  rutina_id uuid not null references public.rutinas(id) on delete restrict,
  fecha date not null default private.business_today(),
  creado_en timestamptz not null default now(),
  cancelada_en timestamptz,
  tarea_ids uuid[] not null,
  unique (empleado_id, rutina_id, fecha)
);
create index asignaciones_diarias_fecha_idx on public.asignaciones_diarias(fecha);
create index asignaciones_diarias_rutina_idx on public.asignaciones_diarias(rutina_id);
alter table public.asignaciones_diarias enable row level security;
alter table public.asignaciones_diarias force row level security;
create trigger security_maintenance_write before insert or update or delete or truncate
on public.asignaciones_diarias for each statement execute function private.guard_business_write();
revoke all on public.asignaciones_diarias from public, anon, authenticated;
grant select on public.asignaciones_diarias to authenticated;
create policy asignaciones_diarias_select on public.asignaciones_diarias for select to authenticated
using (private.is_admin() or (empleado_id = private.current_employee_id()
  and fecha = private.business_today() and cancelada_en is null));
-- Old browser versions must not continue writing undated assignments.
revoke insert, delete on public.empleado_rutinas from authenticated;
alter policy empleado_rutinas_select_own_or_admin on public.empleado_rutinas using (private.is_admin());
alter policy rutinas_select_assigned_or_admin on public.rutinas using (
 private.is_admin() or (archivada_en is null and exists (
 select 1 from public.asignaciones_diarias ad where ad.rutina_id = rutinas.id
 and ad.empleado_id = private.current_employee_id()
 and ad.fecha = private.business_today() and ad.cancelada_en is null)));
alter policy tareas_rutina_select_assigned_or_admin on public.tareas_rutina using (
 private.is_admin() or (archivada_en is null and exists (
 select 1 from public.asignaciones_diarias ad join public.rutinas r on r.id = ad.rutina_id
 where ad.rutina_id = tareas_rutina.rutina_id and ad.empleado_id = private.current_employee_id()
 and ad.fecha = private.business_today() and ad.cancelada_en is null
 and tareas_rutina.id=any(ad.tarea_ids) and r.archivada_en is null)));

create function public.set_daily_routine_assignment(p_empleado_id uuid,p_rutina_id uuid,p_assigned boolean,p_fecha date)
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
 if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 if p_fecha is distinct from private.business_today() then raise exception 'assignment_date_changed' using errcode='22023'; end if;
 if p_assigned is null then raise exception 'invalid_assignment_state' using errcode='22023'; end if;
 if not exists(select 1 from public.empleados where id=p_empleado_id and activo)
 or not exists(select 1 from public.rutinas where id=p_rutina_id and archivada_en is null)
 then raise exception 'assignment_target_not_available' using errcode='22023'; end if;
 if p_assigned then
   insert into public.asignaciones_diarias(empleado_id,rutina_id,fecha,tarea_ids)
   values(p_empleado_id,p_rutina_id,private.business_today(),array(
    select id from public.tareas_rutina where rutina_id=p_rutina_id and archivada_en is null order by id))
   on conflict(empleado_id,rutina_id,fecha) do update set cancelada_en=null;
 else
   update public.asignaciones_diarias set cancelada_en=coalesce(cancelada_en,now())
   where empleado_id=p_empleado_id and rutina_id=p_rutina_id and fecha=private.business_today();
 end if;
end;
$$;
revoke all on function public.set_daily_routine_assignment(uuid,uuid,boolean,date) from public,anon,authenticated;
grant execute on function public.set_daily_routine_assignment(uuid,uuid,boolean,date) to authenticated;

create or replace function public.set_task_completion(
  p_tarea_id uuid,
  p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_employee_id uuid := private.current_employee_id();
  v_today date := private.business_today();
  v_audit_id uuid;
  v_is_currently_completed boolean;
begin
  if v_employee_id is null then
    raise exception 'active_employee_required' using errcode = '42501';
  end if;

  perform 1 from public.asignaciones_diarias ad
  join public.tareas_rutina tr on tr.rutina_id = ad.rutina_id
  where tr.id = p_tarea_id and ad.empleado_id = v_employee_id
    and ad.fecha = v_today and ad.cancelada_en is null and p_tarea_id=any(ad.tarea_ids)
  for share of ad;

  if not exists (
    select 1
    from public.tareas_rutina tr
    join public.asignaciones_diarias er on er.rutina_id = tr.rutina_id
    join public.rutinas r on r.id = tr.rutina_id
    where tr.id = p_tarea_id
      and er.empleado_id = v_employee_id
      and er.fecha = v_today and er.cancelada_en is null and p_tarea_id=any(er.tarea_ids)
      and tr.archivada_en is null
      and r.archivada_en is null
  ) then
    raise exception 'task_not_assigned' using errcode = '42501';
  end if;

  select a.id, a.anulada_en is null
  into v_audit_id, v_is_currently_completed
  from public.auditoria_diaria a
  where a.empleado_id = v_employee_id
    and a.tarea_id = p_tarea_id
    and a.fecha = v_today
  for update;

  if v_audit_id is null then
    if not p_completed then
      raise exception 'completion_not_found' using errcode = '22023';
    end if;

    insert into public.auditoria_diaria (tarea_id, empleado_id, fecha)
    values (p_tarea_id, v_employee_id, v_today)
    returning id into v_audit_id;

    insert into private.task_completion_events (
      auditoria_id, actor_auth_user_id, action
    ) values (v_audit_id, auth.uid(), 'completed');
    return;
  end if;

  if v_is_currently_completed = p_completed then
    return;
  end if;

  update public.auditoria_diaria
  set anulada_en = case when p_completed then null else now() end
  where id = v_audit_id;

  insert into private.task_completion_events (
    auditoria_id, actor_auth_user_id, action
  ) values (
    v_audit_id,
    auth.uid(),
    case when p_completed then 'completed' else 'annulled' end
  );
end;
$$;


create or replace function public.cancel_urgent_task(p_urgent_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare v_target_employee_id uuid;
begin
 if not private.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 update public.tareas_urgentes u set cancelada_en=now()
 where u.id=p_urgent_id and u.cancelada_en is null
 and u.fecha=private.business_today() and not coalesce(u.completada,false)
 returning u.empleado_id into v_target_employee_id;
 if not found then raise exception 'urgent_task_not_available' using errcode='42501'; end if;
 perform private.write_auth_admin_audit(auth.uid(),v_target_employee_id,'urgent_cancelled',jsonb_build_object('urgent_id',p_urgent_id));
end;
$$;
notify pgrst, 'reload schema';
commit;
