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
