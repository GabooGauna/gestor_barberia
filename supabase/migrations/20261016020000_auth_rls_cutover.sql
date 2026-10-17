-- Etapa 4, fase cutover. Ejecutar solo despues de provisionar y validar todas
-- las cuentas activas. Es fail-closed y no depende de rutinas.color.

begin;

do $$
begin
  if exists (
    select 1 from public.empleados
    where rol is null or rol not in ('admin', 'empleado')
  ) then
    raise exception 'cutover_blocked_invalid_roles';
  end if;

  if exists (
    select 1 from public.empleados
    where activo and (auth_user_id is null or usuario is null)
  ) then
    raise exception 'cutover_blocked_unlinked_active_employee';
  end if;

  if not exists (
    select 1 from public.empleados
    where activo and rol = 'admin' and auth_user_id is not null
  ) then
    raise exception 'cutover_blocked_no_active_admin';
  end if;

  if exists (
    select 1
    from public.empleados e
    join auth.users u on u.id = e.auth_user_id
    where e.activo
      and lower(u.email) is distinct from private.technical_auth_email(e.usuario)
  ) then
    raise exception 'cutover_blocked_auth_identity_mismatch';
  end if;

  if exists (
    select 1 from public.tareas_rutina where rutina_id is null
  ) or exists (
    select 1 from public.empleado_rutinas
    where empleado_id is null or rutina_id is null
  ) or exists (
    select 1 from public.auditoria_diaria
    where empleado_id is null or tarea_id is null or fecha is null
  ) or exists (
    select 1 from public.tareas_urgentes
    where empleado_id is null or fecha is null
  ) then
    raise exception 'cutover_blocked_null_foreign_key_or_date';
  end if;

  if exists (
    select 1
    from public.auditoria_diaria
    group by empleado_id, tarea_id, fecha
    having count(*) > 1
  ) then
    raise exception 'cutover_blocked_duplicate_daily_audit';
  end if;
end;
$$;

alter table public.empleados
  validate constraint empleados_auth_user_id_fkey,
  validate constraint empleados_usuario_formato_check,
  validate constraint empleados_estado_cuenta_check;

alter table public.empleados
  alter column rol set not null,
  add constraint empleados_rol_check check (rol in ('admin', 'empleado'));

alter table public.tareas_rutina
  alter column rutina_id set not null;

alter table public.empleado_rutinas
  alter column empleado_id set not null,
  alter column rutina_id set not null;

alter table public.auditoria_diaria
  alter column empleado_id set not null,
  alter column tarea_id set not null,
  alter column fecha set not null,
  add constraint auditoria_diaria_empleado_tarea_fecha_key
    unique (empleado_id, tarea_id, fecha);

alter table public.tareas_urgentes
  alter column empleado_id set not null,
  alter column fecha set not null;

alter table public.auditoria_diaria
  drop constraint auditoria_diaria_empleado_id_fkey,
  drop constraint auditoria_diaria_tarea_id_fkey,
  add constraint auditoria_diaria_empleado_id_fkey
    foreign key (empleado_id) references public.empleados(id) on delete restrict,
  add constraint auditoria_diaria_tarea_id_fkey
    foreign key (tarea_id) references public.tareas_rutina(id) on delete restrict;

alter table public.tareas_urgentes
  drop constraint tareas_urgentes_empleado_id_fkey,
  add constraint tareas_urgentes_empleado_id_fkey
    foreign key (empleado_id) references public.empleados(id) on delete restrict;

alter table public.tareas_rutina
  drop constraint tareas_rutina_rutina_id_fkey,
  add constraint tareas_rutina_rutina_id_fkey
    foreign key (rutina_id) references public.rutinas(id) on delete restrict;

alter table public.empleado_rutinas
  drop constraint empleado_rutinas_empleado_id_fkey,
  drop constraint empleado_rutinas_rutina_id_fkey,
  add constraint empleado_rutinas_empleado_id_fkey
    foreign key (empleado_id) references public.empleados(id) on delete restrict,
  add constraint empleado_rutinas_rutina_id_fkey
    foreign key (rutina_id) references public.rutinas(id) on delete restrict;

create index if not exists auditoria_diaria_empleado_fecha_idx
  on public.auditoria_diaria (empleado_id, fecha);
create index if not exists tareas_urgentes_empleado_fecha_idx
  on public.tareas_urgentes (empleado_id, fecha);
create index if not exists tareas_rutina_rutina_id_idx
  on public.tareas_rutina (rutina_id);
create index if not exists empleado_rutinas_rutina_id_idx
  on public.empleado_rutinas (rutina_id);

insert into private.task_completion_events (
  auditoria_id, actor_auth_user_id, action, occurred_at
)
select a.id, e.auth_user_id, 'completed', coalesce(a.completado_en, now())
from public.auditoria_diaria a
join public.empleados e on e.id = a.empleado_id
where not exists (
    select 1 from private.task_completion_events ev
    where ev.auditoria_id = a.id
  );

create or replace function private.business_today()
returns date
language sql
stable
set search_path = pg_catalog
as $$
  select (current_timestamp at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create or replace function public.get_current_employee_profile()
returns table (
  id uuid,
  nombre text,
  usuario text,
  rol text,
  activo boolean
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select e.id, e.nombre, e.usuario, e.rol, e.activo
  from public.empleados e
  where e.auth_user_id = auth.uid()
    and e.activo
  limit 1
$$;

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

  if not exists (
    select 1
    from public.tareas_rutina tr
    join public.empleado_rutinas er on er.rutina_id = tr.rutina_id
    join public.rutinas r on r.id = tr.rutina_id
    where tr.id = p_tarea_id
      and er.empleado_id = v_employee_id
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

create or replace function public.set_urgent_completion(
  p_urgent_id uuid,
  p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_employee_id uuid := private.current_employee_id();
begin
  if v_employee_id is null then
    raise exception 'active_employee_required' using errcode = '42501';
  end if;

  update public.tareas_urgentes
  set completada = p_completed
  where id = p_urgent_id
    and empleado_id = v_employee_id
    and fecha = private.business_today()
    and cancelada_en is null;

  if not found then
    raise exception 'urgent_task_not_available' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.cancel_urgent_task(p_urgent_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_target_employee_id uuid;
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  update public.tareas_urgentes u
  set cancelada_en = coalesce(cancelada_en, now())
  where u.id = p_urgent_id
    and u.cancelada_en is null
  returning u.empleado_id into v_target_employee_id;

  if not found then
    raise exception 'urgent_task_not_found' using errcode = 'P0002';
  end if;

  perform private.write_auth_admin_audit(
    auth.uid(),
    v_target_employee_id,
    'urgent_cancelled',
    jsonb_build_object('urgent_id', p_urgent_id)
  );
end;
$$;

revoke all on function private.business_today() from public, anon, authenticated;
revoke all on function public.get_current_employee_profile() from public, anon, authenticated;
revoke all on function public.set_task_completion(uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_urgent_completion(uuid, boolean) from public, anon, authenticated;
revoke all on function public.cancel_urgent_task(uuid) from public, anon, authenticated;
grant execute on function public.set_task_completion(uuid, boolean) to authenticated;
grant execute on function public.set_urgent_completion(uuid, boolean) to authenticated;
grant execute on function public.cancel_urgent_task(uuid) to authenticated;
grant execute on function public.get_current_employee_profile() to authenticated;

alter table public.empleados enable row level security;
alter table public.rutinas enable row level security;
alter table public.tareas_rutina enable row level security;
alter table public.empleado_rutinas enable row level security;
alter table public.auditoria_diaria enable row level security;
alter table public.tareas_urgentes enable row level security;

alter table public.empleados force row level security;
alter table public.rutinas force row level security;
alter table public.tareas_rutina force row level security;
alter table public.empleado_rutinas force row level security;
alter table public.auditoria_diaria force row level security;
alter table public.tareas_urgentes force row level security;

create policy empleados_select_own_or_admin
  on public.empleados for select to authenticated
  using ((activo and auth_user_id = auth.uid()) or private.is_admin());

create policy rutinas_select_assigned_or_admin
  on public.rutinas for select to authenticated
  using (
    private.is_admin()
    or (
      archivada_en is null
      and exists (
        select 1 from public.empleado_rutinas er
        where er.rutina_id = rutinas.id
          and er.empleado_id = private.current_employee_id()
      )
    )
  );
create policy rutinas_insert_admin
  on public.rutinas for insert to authenticated
  with check (private.is_admin());
create policy rutinas_update_admin
  on public.rutinas for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy tareas_rutina_select_assigned_or_admin
  on public.tareas_rutina for select to authenticated
  using (
    private.is_admin()
    or (
      archivada_en is null
      and exists (
        select 1
        from public.empleado_rutinas er
        join public.rutinas r on r.id = er.rutina_id
        where er.rutina_id = tareas_rutina.rutina_id
          and er.empleado_id = private.current_employee_id()
          and r.archivada_en is null
      )
    )
  );
create policy tareas_rutina_insert_admin
  on public.tareas_rutina for insert to authenticated
  with check (private.is_admin());
create policy tareas_rutina_update_admin
  on public.tareas_rutina for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy empleado_rutinas_select_own_or_admin
  on public.empleado_rutinas for select to authenticated
  using (empleado_id = private.current_employee_id() or private.is_admin());
create policy empleado_rutinas_insert_admin
  on public.empleado_rutinas for insert to authenticated
  with check (private.is_admin());
create policy empleado_rutinas_delete_admin
  on public.empleado_rutinas for delete to authenticated
  using (private.is_admin());

create policy auditoria_diaria_select_own_or_admin
  on public.auditoria_diaria for select to authenticated
  using (empleado_id = private.current_employee_id() or private.is_admin());

create policy tareas_urgentes_select_own_or_admin
  on public.tareas_urgentes for select to authenticated
  using (empleado_id = private.current_employee_id() or private.is_admin());
create policy tareas_urgentes_insert_admin
  on public.tareas_urgentes for insert to authenticated
  with check (private.is_admin());

revoke all privileges on table public.empleados from anon, authenticated;
revoke all privileges on table public.rutinas from anon, authenticated;
revoke all privileges on table public.tareas_rutina from anon, authenticated;
revoke all privileges on table public.empleado_rutinas from anon, authenticated;
revoke all privileges on table public.auditoria_diaria from anon, authenticated;
revoke all privileges on table public.tareas_urgentes from anon, authenticated;

grant select (id, nombre, usuario, rol, activo, creado_en)
  on table public.empleados to authenticated;
grant select, insert, update on table public.rutinas to authenticated;
grant select, insert, update on table public.tareas_rutina to authenticated;
grant select, insert, delete on table public.empleado_rutinas to authenticated;
grant select on table public.auditoria_diaria to authenticated;
grant select, insert on table public.tareas_urgentes to authenticated;

-- El PIN no se conserva ni se transforma en password. Al estar todas las
-- cuentas activas vinculadas y el corte dentro de una transaccion, se retira
-- junto con su indice unico sin dejar un fallback inseguro.
alter table public.empleados drop column pin;

commit;
