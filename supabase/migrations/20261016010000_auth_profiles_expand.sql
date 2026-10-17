-- Etapa 4, fase expand: vinculo entre perfiles existentes y Supabase Auth.
-- No habilita RLS ni elimina el PIN. Inicia mantenimiento revocando los grants
-- legacy, y permite provisionar/validar cuentas antes del cutover. No depende
-- de public.rutinas.color.

begin;

-- La fase expand inicia una ventana de mantenimiento fail-closed. Los grants
-- heredados del prototipo cubririan automaticamente las columnas nuevas, por
-- lo que se revocan antes de agregar cualquier vinculo de identidad.
revoke all privileges on table public.empleados from public, anon, authenticated;
revoke all privileges on table public.rutinas from public, anon, authenticated;
revoke all privileges on table public.tareas_rutina from public, anon, authenticated;
revoke all privileges on table public.empleado_rutinas from public, anon, authenticated;
revoke all privileges on table public.auditoria_diaria from public, anon, authenticated;
revoke all privileges on table public.tareas_urgentes from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.empleados
  add column auth_user_id uuid,
  add column usuario text,
  add column activo boolean not null default true,
  add column desactivado_en timestamptz;

alter table public.empleados
  add constraint empleados_auth_user_id_fkey
    foreign key (auth_user_id) references auth.users(id) on delete restrict
    not valid,
  add constraint empleados_usuario_formato_check
    check (
      usuario is null
      or usuario ~ '^[a-z0-9][a-z0-9._-]{2,31}$'
    ) not valid,
  add constraint empleados_estado_cuenta_check
    check (
      (activo and desactivado_en is null)
      or (not activo and desactivado_en is not null)
    ) not valid;

create unique index empleados_auth_user_id_unique
  on public.empleados (auth_user_id)
  where auth_user_id is not null;

create unique index empleados_usuario_lower_unique
  on public.empleados (lower(usuario))
  where usuario is not null;

alter table public.rutinas
  add column archivada_en timestamptz;

alter table public.tareas_rutina
  add column archivada_en timestamptz;

alter table public.auditoria_diaria
  add column anulada_en timestamptz;

alter table public.tareas_urgentes
  add column cancelada_en timestamptz;

create table private.auth_admin_audit (
  id bigint generated always as identity primary key,
  actor_auth_user_id uuid,
  target_empleado_id uuid,
  action text not null check (
    action in (
      'bootstrap',
      'account_create_started',
      'account_create_auth_failed',
      'account_create_compensated',
      'account_create_compensation_failed',
      'account_created',
      'password_reset_started',
      'password_reset_completed',
      'password_reset_failed',
      'account_deactivated',
      'account_deactivation_auth_failed',
      'account_reactivated',
      'account_reactivation_failed',
      'role_changed',
      'urgent_cancelled'
    )
  ),
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint auth_admin_audit_details_object_check
    check (jsonb_typeof(details) = 'object')
);

revoke all on table private.auth_admin_audit from public, anon, authenticated;
revoke all on sequence private.auth_admin_audit_id_seq from public, anon, authenticated;

create table private.task_completion_events (
  id bigint generated always as identity primary key,
  auditoria_id uuid not null references public.auditoria_diaria(id) on delete restrict,
  actor_auth_user_id uuid,
  action text not null check (action in ('completed', 'annulled')),
  occurred_at timestamptz not null default now()
);

revoke all on table private.task_completion_events from public, anon, authenticated;
revoke all on sequence private.task_completion_events_id_seq from public, anon, authenticated;

comment on table private.auth_admin_audit is
  'Auditoria sin secretos de altas, resets, desactivaciones y cambios de rol.';
comment on column private.auth_admin_audit.details is
  'Solo metadatos operativos no sensibles. Nunca contrasenas, PIN, tokens ni email tecnico.';

create or replace function private.canonical_username(p_username text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_username text := lower(btrim(p_username));
begin
  if v_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
    raise exception 'invalid_username' using errcode = '22023';
  end if;
  return v_username;
end;
$$;

create or replace function private.technical_auth_email(p_username text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select private.canonical_username(p_username)
    || '@auth.gestor-barberia.invalid'
$$;

create or replace function private.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select e.id
  from public.empleados e
  where e.auth_user_id = auth.uid()
    and e.activo
  limit 1
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select e.rol = 'admin'
    from public.empleados e
    where e.auth_user_id = auth.uid()
      and e.activo
    limit 1
  ), false)
$$;

create or replace function private.assert_admin_actor(p_actor_auth_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_employee_id uuid;
begin
  select e.id into v_actor_employee_id
  from public.empleados e
  where e.auth_user_id = p_actor_auth_user_id
    and e.activo
    and e.rol = 'admin';

  if v_actor_employee_id is null then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return v_actor_employee_id;
end;
$$;

create or replace function private.write_auth_admin_audit(
  p_actor_auth_user_id uuid,
  p_target_empleado_id uuid,
  p_action text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'invalid_audit_details' using errcode = '22023';
  end if;

  if p_details ?| array['password', 'pin', 'token', 'email', 'technical_email'] then
    raise exception 'sensitive_audit_field' using errcode = '22023';
  end if;

  insert into private.auth_admin_audit (
    actor_auth_user_id,
    target_empleado_id,
    action,
    details
  ) values (
    p_actor_auth_user_id,
    p_target_empleado_id,
    p_action,
    p_details
  );
end;
$$;

create or replace function public.admin_link_auth_account(
  p_actor_auth_user_id uuid,
  p_target_empleado_id uuid,
  p_auth_user_id uuid,
  p_usuario text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_usuario text := private.canonical_username(p_usuario);
  v_current_auth_user_id uuid;
  v_target_active boolean;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('gestor_barberia_admin_roster', 0)
  );
  perform private.assert_admin_actor(p_actor_auth_user_id);

  if not exists (
    select 1
    from auth.users u
    where u.id = p_auth_user_id
      and lower(u.email) = private.technical_auth_email(v_usuario)
  ) then
    raise exception 'auth_identity_mismatch' using errcode = '23503';
  end if;

  select e.auth_user_id, e.activo
    into v_current_auth_user_id, v_target_active
  from public.empleados e
  where e.id = p_target_empleado_id
  for update;

  if not found then
    raise exception 'employee_not_found' using errcode = 'P0002';
  end if;

  if not v_target_active then
    raise exception 'account_already_inactive' using errcode = '22023';
  end if;

  if v_current_auth_user_id is not null
     and v_current_auth_user_id <> p_auth_user_id then
    raise exception 'employee_already_linked' using errcode = '23505';
  end if;

  update public.empleados
  set auth_user_id = p_auth_user_id,
      usuario = v_usuario,
      activo = true,
      desactivado_en = null
  where id = p_target_empleado_id;

  perform private.write_auth_admin_audit(
    p_actor_auth_user_id,
    p_target_empleado_id,
    'account_created',
    jsonb_build_object('auth_user_id', p_auth_user_id)
  );
end;
$$;

create or replace function public.admin_record_auth_operation(
  p_actor_auth_user_id uuid,
  p_target_empleado_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform private.assert_admin_actor(p_actor_auth_user_id);

  if p_action not in (
    'account_create_started',
    'account_create_auth_failed',
    'account_create_compensated',
    'account_create_compensation_failed',
    'password_reset_started',
    'password_reset_completed',
    'password_reset_failed',
    'account_deactivation_auth_failed',
    'account_reactivation_failed'
  ) then
    raise exception 'invalid_auth_operation' using errcode = '22023';
  end if;

  perform private.write_auth_admin_audit(
    p_actor_auth_user_id,
    p_target_empleado_id,
    p_action
  );
end;
$$;

create or replace function public.admin_create_employee_account(
  p_actor_auth_user_id uuid,
  p_target_empleado_id uuid,
  p_auth_user_id uuid,
  p_nombre text,
  p_usuario text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_nombre text := btrim(p_nombre);
  v_usuario text := private.canonical_username(p_usuario);
begin
  perform private.assert_admin_actor(p_actor_auth_user_id);

  if char_length(v_nombre) < 2 or char_length(v_nombre) > 100 then
    raise exception 'invalid_employee_name' using errcode = '22023';
  end if;

  if p_role not in ('admin', 'empleado') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = p_auth_user_id
      and lower(u.email) = private.technical_auth_email(v_usuario)
  ) then
    raise exception 'auth_identity_mismatch' using errcode = '23503';
  end if;

  insert into public.empleados (
    id, nombre, rol, auth_user_id, usuario, activo, desactivado_en
  ) values (
    p_target_empleado_id, v_nombre, p_role, p_auth_user_id, v_usuario,
    true, null
  );

  perform private.write_auth_admin_audit(
    p_actor_auth_user_id,
    p_target_empleado_id,
    'account_created',
    jsonb_build_object('role', p_role)
  );

  return p_target_empleado_id;
end;
$$;

create or replace function public.admin_deactivate_account(
  p_actor_auth_user_id uuid,
  p_target_empleado_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_target public.empleados%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('gestor_barberia_admin_roster', 0)
  );
  perform private.assert_admin_actor(p_actor_auth_user_id);

  select * into v_target
  from public.empleados
  where id = p_target_empleado_id
  for update;

  if not found then
    raise exception 'employee_not_found' using errcode = 'P0002';
  end if;

  if v_target.auth_user_id = p_actor_auth_user_id then
    raise exception 'cannot_deactivate_current_account' using errcode = '22023';
  end if;

  if v_target.rol = 'admin' and v_target.activo and not exists (
    select 1 from public.empleados e
    where e.rol = 'admin' and e.activo and e.id <> v_target.id
  ) then
    raise exception 'cannot_deactivate_last_admin' using errcode = '22023';
  end if;

  update public.empleados
  set activo = false,
      desactivado_en = coalesce(desactivado_en, now())
  where id = p_target_empleado_id;

  perform private.write_auth_admin_audit(
    p_actor_auth_user_id,
    p_target_empleado_id,
    'account_deactivated'
  );
end;
$$;

create or replace function public.admin_activate_account(
  p_actor_auth_user_id uuid,
  p_target_empleado_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_target public.empleados%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('gestor_barberia_admin_roster', 0)
  );
  perform private.assert_admin_actor(p_actor_auth_user_id);

  select * into v_target
  from public.empleados
  where id = p_target_empleado_id
  for update;

  if not found or v_target.auth_user_id is null then
    raise exception 'linked_employee_not_found' using errcode = 'P0002';
  end if;

  if v_target.activo then
    raise exception 'account_already_active' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = v_target.auth_user_id
      and lower(u.email) = private.technical_auth_email(v_target.usuario)
  ) then
    raise exception 'auth_identity_mismatch' using errcode = '23503';
  end if;

  update public.empleados
  set activo = true,
      desactivado_en = null
  where id = p_target_empleado_id;

  perform private.write_auth_admin_audit(
    p_actor_auth_user_id,
    p_target_empleado_id,
    'account_reactivated'
  );
end;
$$;

create or replace function public.admin_set_employee_role(
  p_actor_auth_user_id uuid,
  p_target_empleado_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_previous_role text;
  v_target_active boolean;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('gestor_barberia_admin_roster', 0)
  );
  perform private.assert_admin_actor(p_actor_auth_user_id);

  if p_role not in ('admin', 'empleado') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select rol, activo into v_previous_role, v_target_active
  from public.empleados
  where id = p_target_empleado_id
  for update;

  if not found then
    raise exception 'employee_not_found' using errcode = 'P0002';
  end if;

  if v_previous_role = 'admin' and p_role <> 'admin' and v_target_active
     and not exists (
       select 1 from public.empleados e
       where e.rol = 'admin' and e.activo and e.id <> p_target_empleado_id
     ) then
    raise exception 'cannot_demote_last_admin' using errcode = '22023';
  end if;

  update public.empleados set rol = p_role where id = p_target_empleado_id;

  if v_previous_role is distinct from p_role then
    perform private.write_auth_admin_audit(
      p_actor_auth_user_id,
      p_target_empleado_id,
      'role_changed',
      jsonb_build_object('from', v_previous_role, 'to', p_role)
    );
  end if;
end;
$$;

create or replace function private.bootstrap_first_admin(
  p_target_empleado_id uuid,
  p_auth_user_id uuid,
  p_usuario text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_usuario text := private.canonical_username(p_usuario);
begin
  perform pg_advisory_xact_lock(
    hashtextextended('gestor_barberia_admin_roster', 0)
  );

  if exists (
    select 1 from public.empleados
    where rol = 'admin' and activo and auth_user_id is not null
  ) then
    raise exception 'bootstrap_already_completed' using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.empleados
    where id = p_target_empleado_id and rol = 'admin' and activo
  ) then
    raise exception 'active_admin_profile_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = p_auth_user_id
      and lower(u.email) = private.technical_auth_email(v_usuario)
  ) then
    raise exception 'auth_identity_mismatch' using errcode = '23503';
  end if;

  update public.empleados
  set auth_user_id = p_auth_user_id,
      usuario = v_usuario,
      activo = true,
      desactivado_en = null
  where id = p_target_empleado_id;

  perform private.write_auth_admin_audit(
    p_auth_user_id,
    p_target_empleado_id,
    'bootstrap',
    jsonb_build_object('auth_user_id', p_auth_user_id)
  );
end;
$$;

revoke all on function private.canonical_username(text) from public, anon, authenticated;
revoke all on function private.technical_auth_email(text) from public, anon, authenticated;
revoke all on function private.current_employee_id() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
revoke all on function private.assert_admin_actor(uuid) from public, anon, authenticated;
revoke all on function private.write_auth_admin_audit(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.bootstrap_first_admin(uuid, uuid, text) from public, anon, authenticated;

revoke all on function public.admin_link_auth_account(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_record_auth_operation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_create_employee_account(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_deactivate_account(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_activate_account(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_set_employee_role(uuid, uuid, text) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant usage on schema private to service_role;
grant execute on function private.current_employee_id() to authenticated;
grant execute on function private.is_admin() to authenticated;

grant execute on function private.bootstrap_first_admin(uuid, uuid, text) to service_role;
grant execute on function public.admin_link_auth_account(uuid, uuid, uuid, text) to service_role;
grant execute on function public.admin_record_auth_operation(uuid, uuid, text) to service_role;
grant execute on function public.admin_create_employee_account(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.admin_deactivate_account(uuid, uuid) to service_role;
grant execute on function public.admin_activate_account(uuid, uuid) to service_role;
grant execute on function public.admin_set_employee_role(uuid, uuid, text) to service_role;

comment on function private.bootstrap_first_admin(uuid, uuid, text) is
  'Vincula exactamente el primer admin. Solo service_role y solo despues de crear auth.users fuera de SQL.';

commit;
