select jsonb_build_object(
 'routines',(select count(*) from public.rutinas),
 'routine_tasks',(select count(*) from public.tareas_rutina),
 'daily_assignments',(select count(*) from public.asignaciones_diarias),
 'legacy_assignments',(select count(*) from public.empleado_rutinas),
 'audits',(select count(*) from public.auditoria_diaria),
 'urgent_tasks',(select count(*) from public.tareas_urgentes),
 'completion_events',(select count(*) from private.task_completion_events),
 'calendar_activity_dates',(select count(*) from(select fecha from public.auditoria_diaria union select fecha from public.asignaciones_diarias union select fecha from public.tareas_urgentes) d),
 'target_auth_relations',(select count(*) from auth.identities where user_id='eb36b62d-de89-4277-876b-123099d6d281')+(select count(*) from auth.sessions where user_id='eb36b62d-de89-4277-876b-123099d6d281')+(select count(*) from auth.mfa_factors where user_id='eb36b62d-de89-4277-876b-123099d6d281'),
 'orphan_references',
 (select count(*) from public.empleados e left join auth.users u on u.id=e.auth_user_id where e.auth_user_id is not null and u.id is null)+
 (select count(*) from public.tareas_rutina t left join public.rutinas r on r.id=t.rutina_id where r.id is null)+
 (select count(*) from private.task_completion_events c left join public.auditoria_diaria a on a.id=c.auditoria_id where a.id is null)+
 (select count(*) from private.auth_admin_audit a left join public.empleados e on e.id=a.target_empleado_id left join auth.users u on u.id=a.actor_auth_user_id where (a.target_empleado_id is not null and e.id is null) or (a.actor_auth_user_id is not null and u.id is null)),
 'administrators',(select jsonb_agg(jsonb_build_object('id',e.id,'active',e.activo,'role',e.rol,'auth_exists',u.id is not null,'password_present',u.encrypted_password is not null and u.encrypted_password<>'','banned',coalesce(u.banned_until>now(),false),'verified_mfa_factors',(select count(*) from auth.mfa_factors f where f.user_id=u.id and f.status='verified')) order by e.id) from public.empleados e left join auth.users u on u.id=e.auth_user_id where e.rol='admin')
) as result;
