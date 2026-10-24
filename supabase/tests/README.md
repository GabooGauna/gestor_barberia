# Pruebas locales de Etapa 4

## Orden de plantillas (ampliación de Etapa 6)

`node scripts/template-order-drill.mjs` prueba la cadena de permisos vigente,
el SQL exacto de publicación, 26 comprobaciones de reordenamiento/persistencia,
atomicidad y casos negativos en PostgreSQL Docker descartable sin red/puertos.
Comprueba rollback de fixtures y migración y eliminación del contenedor. Nunca
acepta destino remoto. Contrato: `docs/contracts/template-ordering.md`.

## Administradores con tareas propias (ampliación de Etapa 6)

`node scripts/admin-own-tasks-drill.mjs` ejecuta
`08_admin_own_tasks_test.sql` sobre toda la cadena de contratos diarios, en un
PostgreSQL Docker local descartable para Windows. Usa imagen ya instalada,
sin red, puertos ni montajes. Verifica autoasignación, cumplimiento/anulación,
actor auditado, urgencias propias, AAL2, aislamiento entre integrantes y
conservación del historial. El SQL hace rollback y el runner comprueba la
preservación del baseline y elimina el contenedor. No acepta un destino remoto.

## Ensayo suplementario de respaldo

`node scripts/stage04-restore-drill.mjs` desde la raíz ejecuta sólo Docker
PostgreSQL sintético sin destino configurable. Verifica snapshot/cifrado,
restauración, integridad, ACL/RLS y rollback; no sustituye Auth/Edge HTTP ni
el restore del proveedor. Véase `docs/runbooks/stage-04-backup-continuity.md`.

## Ensayo nuevo Auth real y controles operativos

`node scripts/stage04-auth-security-drill.mjs` usa contenedores locales aislados
de GoTrue/PostgREST/Edge con cuentas sintéticas y aplica el suplemento
`20261017000000_security_operations.sql` después de la cadena histórica.
No acepta destino remoto. La evidencia delimita gateway, proveedor, restauración
de plataforma y RPO/RTO: no se infieren del resultado PostgreSQL ni de mocks.
El script de inspección `supabase/inspections/stage04-readonly-preflight.sql`
es sólo lectura de catálogos/agregados, sin PIN ni secretos; no es una migración.

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
