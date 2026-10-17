-- Recuperacion fail-closed del cutover.
-- Deliberadamente NO restaura PIN, CRUD anon, cascadas ni RLS deshabilitado.
-- Mantiene las tablas inaccesibles mientras se corrige o se avanza hacia
-- adelante. Un backup solo se restaura en un entorno aislado.

begin;

revoke all privileges on table public.empleados from anon, authenticated;
revoke all privileges on table public.rutinas from anon, authenticated;
revoke all privileges on table public.tareas_rutina from anon, authenticated;
revoke all privileges on table public.empleado_rutinas from anon, authenticated;
revoke all privileges on table public.auditoria_diaria from anon, authenticated;
revoke all privileges on table public.tareas_urgentes from anon, authenticated;

drop policy if exists tareas_urgentes_insert_admin on public.tareas_urgentes;
drop policy if exists tareas_urgentes_select_own_or_admin on public.tareas_urgentes;
drop policy if exists auditoria_diaria_select_own_or_admin on public.auditoria_diaria;
drop policy if exists empleado_rutinas_delete_admin on public.empleado_rutinas;
drop policy if exists empleado_rutinas_insert_admin on public.empleado_rutinas;
drop policy if exists empleado_rutinas_select_own_or_admin on public.empleado_rutinas;
drop policy if exists tareas_rutina_update_admin on public.tareas_rutina;
drop policy if exists tareas_rutina_insert_admin on public.tareas_rutina;
drop policy if exists tareas_rutina_select_assigned_or_admin on public.tareas_rutina;
drop policy if exists rutinas_update_admin on public.rutinas;
drop policy if exists rutinas_insert_admin on public.rutinas;
drop policy if exists rutinas_select_assigned_or_admin on public.rutinas;
drop policy if exists empleados_select_own_or_admin on public.empleados;

revoke all on function public.cancel_urgent_task(uuid) from public, anon, authenticated;
revoke all on function public.set_urgent_completion(uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_task_completion(uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_current_employee_profile() from public, anon, authenticated;

drop function if exists public.cancel_urgent_task(uuid);
drop function if exists public.set_urgent_completion(uuid, boolean);
drop function if exists public.set_task_completion(uuid, boolean);
drop function if exists public.get_current_employee_profile();
drop function if exists private.business_today();

-- RLS queda habilitado y forzado sin policies: denegacion total a clientes.
commit;
