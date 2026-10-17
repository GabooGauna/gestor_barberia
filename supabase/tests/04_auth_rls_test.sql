-- Pruebas de seguridad para una base Supabase local/descartable.
-- Requieren las migraciones 010000 y 020000 ya aplicadas sobre datos
-- sinteticos. Todo se ejecuta dentro de una transaccion y termina en rollback.

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion_failed: %', p_message;
  end if;
end;
$$;

create or replace function pg_temp.assert_sqlstate(
  p_statement text,
  p_expected_state text,
  p_message text
)
returns void language plpgsql as $$
begin
  begin
    execute p_statement;
  exception when others then
    if sqlstate = p_expected_state then
      return;
    end if;
    raise exception 'assertion_failed: %, got SQLSTATE %', p_message, sqlstate;
  end;
  raise exception 'assertion_failed: %, statement unexpectedly succeeded', p_message;
end;
$$;

create or replace function pg_temp.insert_auth_test_user(
  p_id uuid,
  p_email text,
  p_password text
)
returns void
language plpgsql
as $$
declare
  v_confirmation_column text;
  v_email_change_token_column text;
begin
  select case when exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
      and column_name = 'email_confirmed_at'
  ) then 'email_confirmed_at' else 'confirmed_at' end
  into v_confirmation_column;

  select case when exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
      and column_name = 'email_change_token_new'
  ) then 'email_change_token_new' else 'email_change_token' end
  into v_email_change_token_column;

  execute format($insert$
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      %I, created_at, updated_at,
      confirmation_token, recovery_token, %I, email_change,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', $1,
      'authenticated', 'authenticated', $2,
      crypt($3, gen_salt('bf')), now(), now(), now(),
      '', '', '', '', '{}'::jsonb, '{}'::jsonb
    )
  $insert$, v_confirmation_column, v_email_change_token_column)
  using p_id, p_email, p_password;
end;
$$;

-- IDs fijos exclusivamente sinteticos.
select pg_temp.insert_auth_test_user(
  '10000000-0000-4000-8000-000000000001',
  'admin.test@auth.gestor-barberia.invalid',
  'local-test-password-1'
);
select pg_temp.insert_auth_test_user(
  '10000000-0000-4000-8000-000000000002',
  'empleado.a@auth.gestor-barberia.invalid',
  'local-test-password-2'
);
select pg_temp.insert_auth_test_user(
  '10000000-0000-4000-8000-000000000003',
  'empleado.b@auth.gestor-barberia.invalid',
  'local-test-password-3'
);

insert into public.empleados (id, nombre, rol, auth_user_id, usuario, activo)
values
  ('20000000-0000-4000-8000-000000000001', 'Admin Test', 'admin',
   '10000000-0000-4000-8000-000000000001', 'admin.test', true),
  ('20000000-0000-4000-8000-000000000002', 'Empleado A', 'empleado',
   '10000000-0000-4000-8000-000000000002', 'empleado.a', true),
  ('20000000-0000-4000-8000-000000000003', 'Empleado B', 'empleado',
   '10000000-0000-4000-8000-000000000003', 'empleado.b', true);

insert into public.rutinas (id, titulo) values
  ('30000000-0000-4000-8000-000000000001', 'Rutina A'),
  ('30000000-0000-4000-8000-000000000002', 'Rutina B');
insert into public.tareas_rutina (id, rutina_id, seccion, descripcion, orden)
values
  ('40000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', 'A', 'Tarea A', 1),
  ('40000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000002', 'B', 'Tarea B', 1);
insert into public.empleado_rutinas (empleado_id, rutina_id)
values
  ('20000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000003',
   '30000000-0000-4000-8000-000000000002');
insert into public.tareas_urgentes (id, empleado_id, descripcion, fecha)
values
  ('50000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000002', 'Urgente A', private.business_today()),
  ('50000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000003', 'Urgente B', private.business_today());

select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.empleados', 'select')
  and not has_table_privilege('anon', 'public.rutinas', 'select')
  and not has_table_privilege('anon', 'public.tareas_rutina', 'select')
  and not has_table_privilege('anon', 'public.empleado_rutinas', 'select')
  and not has_table_privilege('anon', 'public.auditoria_diaria', 'select')
  and not has_table_privilege('anon', 'public.tareas_urgentes', 'select'),
  'anon must not read business tables'
);
select pg_temp.assert_true(
  has_column_privilege('authenticated', 'public.empleados', 'id', 'select')
  and not has_column_privilege(
    'authenticated', 'public.empleados', 'auth_user_id', 'select'
  )
  and not has_table_privilege(
    'authenticated', 'private.task_completion_events', 'select'
  ),
  'authenticated receives only the public employee projection'
);
select pg_temp.assert_true(
  position(
    'pg_advisory_xact_lock' in
    pg_get_functiondef(
      'public.admin_deactivate_account(uuid,uuid)'::regprocedure
    )
  ) > 0
  and position(
    'pg_advisory_xact_lock' in
    pg_get_functiondef(
      'public.admin_set_employee_role(uuid,uuid,text)'::regprocedure
    )
  ) > 0,
  'last-admin mutations serialize on the roster lock'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';

select pg_temp.assert_true(
  (select count(*) = 1 from public.empleados),
  'employee reads only own profile'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.get_current_employee_profile()
   where id = '20000000-0000-4000-8000-000000000002'
     and rol = 'empleado' and activo),
  'authenticated user resolves only its verified active profile'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.rutinas),
  'employee reads only assigned routine'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.tareas_rutina),
  'employee reads only tasks in assigned routines'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.tareas_urgentes),
  'employee reads only own urgent task'
);

select pg_temp.assert_sqlstate(
  $$update public.empleados set rol = 'admin'
    where id = '20000000-0000-4000-8000-000000000002'$$,
  '42501',
  'employee cannot elevate role'
);
select pg_temp.assert_sqlstate(
  $$insert into public.rutinas (titulo) values ('Injected')$$,
  '42501',
  'employee cannot create routines'
);

select pg_temp.assert_sqlstate(
  $$select public.set_task_completion(
      '40000000-0000-4000-8000-000000000001', false)$$,
  '22023',
  'cannot annul a completion that never existed'
);
select public.set_task_completion(
  '40000000-0000-4000-8000-000000000001', true
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.auditoria_diaria where anulada_en is null),
  'employee completes assigned task through RPC'
);
select public.set_task_completion(
  '40000000-0000-4000-8000-000000000001', false
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.auditoria_diaria where anulada_en is not null),
  'unmark preserves an annulled audit row'
);
reset role;
select pg_temp.assert_true(
  (select count(*) = 2 from private.task_completion_events ev
   join public.auditoria_diaria a on a.id = ev.auditoria_id
   where a.empleado_id = '20000000-0000-4000-8000-000000000002'),
  'completion and annulment events are append-only'
);
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';
select public.set_task_completion(
  '40000000-0000-4000-8000-000000000001', true
);
reset role;
select pg_temp.assert_true(
  (select count(*) = 3 from private.task_completion_events ev
   join public.auditoria_diaria a on a.id = ev.auditoria_id
   where a.empleado_id = '20000000-0000-4000-8000-000000000002'),
  're-completing appends an event without erasing the annulment event'
);
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';
select pg_temp.assert_sqlstate(
  $$select public.set_task_completion(
      '40000000-0000-4000-8000-000000000002', true)$$,
  '42501',
  'employee cannot complete another employee task'
);

select public.set_urgent_completion(
  '50000000-0000-4000-8000-000000000001', true
);
select pg_temp.assert_sqlstate(
  $$select public.set_urgent_completion(
      '50000000-0000-4000-8000-000000000002', true)$$,
  '42501',
  'employee cannot update another employee urgent task'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select pg_temp.assert_true(
  (select count(*) = 5
   from public.empleados
   where id in (
     '01000000-0000-4000-8000-000000000001',
     '01000000-0000-4000-8000-000000000002',
     '20000000-0000-4000-8000-000000000001',
     '20000000-0000-4000-8000-000000000002',
     '20000000-0000-4000-8000-000000000003'
   )),
  'admin reads every expected profile even when other synthetic rows exist'
);
insert into public.rutinas (titulo) values ('Admin-created');
select public.cancel_urgent_task('50000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(
  (select cancelada_en is not null from public.tareas_urgentes
   where id = '50000000-0000-4000-8000-000000000001'),
  'admin cancellation preserves urgent row'
);
reset role;
select pg_temp.assert_true(
  (select count(*) = 1 from private.auth_admin_audit
   where action = 'urgent_cancelled'
     and actor_auth_user_id = '10000000-0000-4000-8000-000000000001'),
  'urgent cancellation records the authenticated admin actor'
);

select public.admin_deactivate_account(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000003'
);
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';
select pg_temp.assert_true(
  (select count(*) = 0 from public.empleados),
  'inactive profile cannot read even its own employee row'
);
select pg_temp.assert_sqlstate(
  $$select public.set_urgent_completion(
      '50000000-0000-4000-8000-000000000002', true)$$,
  '42501',
  'inactive profile cannot mutate business data'
);
reset role;
update auth.users
set email = 'identity.changed@auth.gestor-barberia.invalid'
where id = '10000000-0000-4000-8000-000000000003';
select pg_temp.assert_sqlstate(
  $$select public.admin_activate_account(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000003')$$,
  '23503',
  'reactivation rejects an Auth identity whose technical email changed'
);
update auth.users
set email = 'empleado.b@auth.gestor-barberia.invalid'
where id = '10000000-0000-4000-8000-000000000003';
select public.admin_activate_account(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000003'
);

select pg_temp.insert_auth_test_user(
  '10000000-0000-4000-8000-000000000004',
  'nuevo.test@auth.gestor-barberia.invalid',
  'Local-strong-password-4'
);
select public.admin_record_auth_operation(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000004',
  'account_create_started'
);
select public.admin_create_employee_account(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000004',
  'Nuevo Test',
  'nuevo.test',
  'empleado'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.empleados
   where id = '20000000-0000-4000-8000-000000000004'
     and usuario = 'nuevo.test' and activo),
  'service-only account creation links Auth and employee atomically in SQL'
);
select public.admin_record_auth_operation(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000004',
  'password_reset_started'
);
select public.admin_record_auth_operation(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000004',
  'password_reset_completed'
);
select pg_temp.assert_true(
  (select count(*) = 2 from private.auth_admin_audit
   where target_empleado_id = '20000000-0000-4000-8000-000000000004'
     and action in ('password_reset_started', 'password_reset_completed')),
  'password reset leaves a durable start and completion trail'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
select pg_temp.assert_sqlstate(
  $$delete from public.empleados
    where id = '20000000-0000-4000-8000-000000000002'$$,
  '42501',
  'admin cannot hard-delete employee'
);

reset role;

-- Escenario sintetico: se deja un solo admin para verificar el rechazo real.
update public.empleados
set rol = 'empleado'
where rol = 'admin'
  and auth_user_id <> '10000000-0000-4000-8000-000000000001';
select pg_temp.assert_sqlstate(
  $$select public.admin_set_employee_role(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'empleado')$$,
  '22023',
  'last active admin cannot demote itself'
);
select pg_temp.assert_true(
  (select rol = 'admin' and activo
   from public.empleados
   where id = '20000000-0000-4000-8000-000000000001'),
  'rejected last-admin change leaves the admin active'
);
select pg_temp.assert_sqlstate(
  $$select public.admin_deactivate_account(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001')$$,
  '22023',
  'last active admin cannot deactivate its own account'
);
select pg_temp.assert_true(
  (select rol = 'admin' and activo
   from public.empleados
   where id = '20000000-0000-4000-8000-000000000001'),
  'rejected last-admin deactivation leaves the admin active'
);
rollback;
