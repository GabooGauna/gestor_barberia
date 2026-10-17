# Pruebas locales de Etapa 4

Estos archivos son destructivos para el esquema donde se ejecutan. Usarlos
únicamente en PostgreSQL/Supabase local y descartable; nunca contra el proyecto
remoto.

## Cadena SQL

Aplicar en este orden con `psql -v ON_ERROR_STOP=1`:

1. `00_legacy_schema.sql` — esquema legacy sintético.
2. `../migrations/20261016010000_auth_profiles_expand.sql`.
3. `02_expand_security_test.sql` — ACL de mantenimiento (termina en rollback).
4. `01_auth_cutover_seed.sql` — identidades y perfiles exclusivamente sintéticos.
5. `../migrations/20261016020000_auth_rls_cutover.sql`.
6. `04_auth_rls_test.sql` — RLS, RPC, retención y último admin (termina en rollback).

La migración de `rutinas.color` no forma parte de esta cadena. Debe ensayarse y
aplicarse por separado según su propio contrato.

## Auth y Edge reales

Para el smoke test integral, crear un proyecto Supabase CLI temporal fuera de
los artefactos versionados y copiar allí sólo la cadena anterior, intercalando
el seed entre expand y cutover. Configurar localmente:

- signup global deshabilitado y proveedor email habilitado para login;
- contraseña mínima de 12 bytes;
- `ALLOWED_ORIGIN` igual al origen local exacto del frontend;
- verificación JWT de `admin-users` habilitada.

Con las credenciales sintéticas del seed, verificar por HTTP local:

- preflight OPTIONS del origen permitido con los headers
  `authorization, content-type, apikey, x-client-info`: 204 sin cuerpo; origen
  ajeno rechazado (las pruebas nativas del handler están en
  `tests/backend/admin-users-cors.test.mjs`);
- login correcto/incorrecto y `get_current_employee_profile`;
- lectura anónima denegada y signup público rechazado;
- alta administrativa por `admin-users` y login de la cuenta creada;
- intento de cambio de rol por empleado rechazado por Edge y REST;
- desactivación con pérdida inmediata del perfil RLS y login bloqueado;
- reactivación, reset, rechazo de la contraseña anterior y aceptación de la nueva;
- logout y refresh token revocado.

No guardar ni imprimir access tokens, refresh tokens, claves de servicio o
contraseñas fuera de este escenario sintético. Detener el stack sin backup y
eliminar su directorio temporal al terminar.

La evidencia consolidada y sus límites están en
`docs/reviews/stage-04-validation.md`. El preflight agregado después del smoke
local se verificó ejecutando el handler con Fetch nativo; ese ajuste no implica
una nueva ejecución de todo el stack Supabase.
