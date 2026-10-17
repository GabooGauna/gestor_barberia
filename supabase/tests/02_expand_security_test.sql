-- Gate de la fase expand: el prototipo queda en mantenimiento fail-closed
-- antes de exponer columnas de vinculacion con Auth.

begin;

do $$
declare
  v_signature text;
begin
  if has_table_privilege('anon', 'public.empleados', 'select')
     or has_table_privilege('anon', 'public.empleados', 'update')
     or has_table_privilege('authenticated', 'public.empleados', 'select')
     or has_table_privilege('authenticated', 'public.empleados', 'update') then
    raise exception 'expand_must_revoke_legacy_employee_access';
  end if;

  foreach v_signature in array array[
    'public.admin_link_auth_account(uuid,uuid,uuid,text)',
    'public.admin_record_auth_operation(uuid,uuid,text)',
    'public.admin_create_employee_account(uuid,uuid,uuid,text,text,text)',
    'public.admin_deactivate_account(uuid,uuid)',
    'public.admin_activate_account(uuid,uuid)',
    'public.admin_set_employee_role(uuid,uuid,text)',
    'private.bootstrap_first_admin(uuid,uuid,text)'
  ] loop
    if has_function_privilege('anon', v_signature, 'execute')
       or has_function_privilege('authenticated', v_signature, 'execute')
       or not has_function_privilege('service_role', v_signature, 'execute') then
      raise exception 'admin_function_acl_invalid: %', v_signature;
    end if;
  end loop;
end;
$$;

rollback;
