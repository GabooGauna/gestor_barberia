-- Metadata only: no factor secrets, challenges, tokens or credential values.
BEGIN TRANSACTION READ ONLY;
SELECT json_build_object(
 'admin_verified_totp_factors',(SELECT count(*) FROM auth.mfa_factors f
   JOIN public.empleados e ON e.auth_user_id=f.user_id
   WHERE e.usuario='admin.gns' AND f.factor_type='totp' AND f.status='verified'),
 'admin_aal2_sessions',(SELECT count(*) FROM auth.sessions s
   JOIN public.empleados e ON e.auth_user_id=s.user_id
   WHERE e.usuario='admin.gns' AND s.aal='aal2'),
 'maintenance',(SELECT maintenance FROM private.security_operations WHERE singleton),
 'in_flight',(SELECT count(*) FROM private.admin_operation_admissions WHERE finished_at IS NULL));
ROLLBACK;
