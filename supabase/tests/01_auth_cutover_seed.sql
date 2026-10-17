-- Datos sinteticos para atravesar expand -> provision -> cutover.
-- Los PIN son ficticios y solo prueban que el cutover elimina la columna.

insert into public.empleados (id, nombre, pin, rol)
values
  ('01000000-0000-4000-8000-000000000001', 'Admin previo', '0000', 'admin'),
  ('01000000-0000-4000-8000-000000000002', 'Empleado previo', '1111', 'empleado');

create or replace function pg_temp.insert_auth_seed_user(
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

select pg_temp.insert_auth_seed_user(
  '02000000-0000-4000-8000-000000000001',
  'admin.previo@auth.gestor-barberia.invalid',
  'synthetic-admin-password'
);
select pg_temp.insert_auth_seed_user(
  '02000000-0000-4000-8000-000000000002',
  'empleado.previo@auth.gestor-barberia.invalid',
  'synthetic-employee-password'
);

select private.bootstrap_first_admin(
  '01000000-0000-4000-8000-000000000001',
  '02000000-0000-4000-8000-000000000001',
  'admin.previo'
);

select public.admin_link_auth_account(
  '02000000-0000-4000-8000-000000000001',
  '01000000-0000-4000-8000-000000000002',
  '02000000-0000-4000-8000-000000000002',
  'empleado.previo'
);
