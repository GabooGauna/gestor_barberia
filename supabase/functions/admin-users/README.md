# `admin-users`

Función administrativa de Etapa 4 para crear cuentas y perfiles, restablecer
contraseñas, desactivar/reactivar accesos y cambiar roles. No es un endpoint de
login y nunca devuelve el email técnico.

## Variables del servidor

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`: secreto exclusivo del runtime de Functions.
- `ALLOWED_ORIGIN`: origen exacto del frontend autorizado.

No usar prefijo `VITE_` para secretos. Desplegar con verificación JWT habilitada.
La función vuelve a verificar el token con `auth.getUser()` y consulta el rol
activo en `public.empleados`; no confía en metadata ni en el payload.

## Suplemento operativo candidato

Requiere `20261017000000_security_operations.sql` después del cutover y JWT
AAL2 validado por Auth. `admin_begin_operation` impone cuotas persistentes
distribuidas antes de efectos y devuelve 429/Retry-After; error del control o
mantenimiento cerrado devuelve 503. Incluye solicitudes sin Origin.

El suplemento inicia maintenance=true. Sólo el operador privilegiado puede
abrirlo/cerrarlo con `set_security_maintenance`; al cerrar debe esperar y
reconciliar in_flight=0. Errores Auth o transporte conservan lease pendiente,
sin TTL que suponga terminación. El cierre de negocio no congela Auth directo:
ver `docs/runbooks/stage-04-security-controls.md` para RPO0 y recuperación MFA.
La implementación es candidata local, no está desplegada ni autorizada remotamente.

## Acciones `POST`

- `create`: `name`, `username`, `password`, `role`.
- `reset_password`: `employeeId`, `password`.
- `deactivate`: `employeeId`.
- `reactivate`: `employeeId`.
- `change_role`: `employeeId`, `role` (`admin` o `empleado`).

Contraseñas: entre 12 y 72 bytes y al menos tres clases de caracteres. No se
registran ni se incluyen en auditoría. Las operaciones distribuidas dejan un
evento durable previo. Un alta huérfana se elimina de Auth; una desactivación
revoca primero el perfil/RLS y luego intenta bloquear Auth, por lo que falla
cerrada. Los estados `reconciliation_required` se resuelven con el runbook.
