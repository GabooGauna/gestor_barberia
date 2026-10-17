-- Solo para una fase expand que aun no haya ejecutado el cutover.
-- No elimina usuarios de auth.users; esas cuentas se revisan por separado.

begin;

drop function if exists private.bootstrap_first_admin(uuid, uuid, text);
drop function if exists public.admin_set_employee_role(uuid, uuid, text);
drop function if exists public.admin_activate_account(uuid, uuid);
drop function if exists public.admin_deactivate_account(uuid, uuid);
drop function if exists public.admin_create_employee_account(uuid, uuid, uuid, text, text, text);
drop function if exists public.admin_record_auth_operation(uuid, uuid, text);
drop function if exists public.admin_link_auth_account(uuid, uuid, uuid, text);
drop function if exists private.write_auth_admin_audit(uuid, uuid, text, jsonb);
drop function if exists private.assert_admin_actor(uuid);
drop function if exists private.is_admin();
drop function if exists private.current_employee_id();
drop function if exists private.technical_auth_email(text);
drop function if exists private.canonical_username(text);

drop table if exists private.task_completion_events;
drop table if exists private.auth_admin_audit;

alter table public.tareas_urgentes drop column if exists cancelada_en;
alter table public.auditoria_diaria drop column if exists anulada_en;
alter table public.tareas_rutina drop column if exists archivada_en;
alter table public.rutinas drop column if exists archivada_en;

drop index if exists public.empleados_usuario_lower_unique;
drop index if exists public.empleados_auth_user_id_unique;

alter table public.empleados
  drop constraint if exists empleados_estado_cuenta_check,
  drop constraint if exists empleados_usuario_formato_check,
  drop constraint if exists empleados_auth_user_id_fkey,
  drop column if exists desactivado_en,
  drop column if exists activo,
  drop column if exists usuario,
  drop column if exists auth_user_id;

-- El schema private puede ser compartido por otros artefactos Supabase. Se
-- conserva vacio en vez de asumir que esta migracion fue quien lo creo.

commit;
