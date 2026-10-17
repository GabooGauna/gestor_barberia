# Evidencia de validación local — Etapa 4

Fecha de consolidación: 17 de octubre de 2026. Este registro conserva los
resultados de Tester y Orquestador obtenidos antes de la última interrupción
y las repeticiones afectadas por correcciones del Reviewer. No valida el
proyecto remoto.

## Resultados conservados

| Verificación | Entorno y resultado |
|---|---|
| `npm run lint` | Local, exit 0; repetido después de las correcciones finales. |
| `npm run build` | Local, exit 0 después de las correcciones finales. Advertencia existente: chunk principal 526,58 kB (150,57 kB gzip), mayor a 500 kB. |
| `npm run test:e2e` | Chromium, 40/40, 36,7 s; Auth/PostgREST/Edge simulados exclusivamente en localhost, requests a `*.supabase.co` bloqueados. |
| `npx playwright test tests/e2e/account-management.spec.js --project=chromium` | 7/7, 16,3 s después de corregir el diálogo; incluye el nuevo caso teclado/Axe en tres anchos y dos temas. Los otros 34 casos anteriores conservan validez: cobertura vigente de 41 casos, sin afirmar una ejecución completa de 41/41. |
| `node --test tests/backend/*.test.mjs` | 6/6 después de corregir CORS: cuatro de contrato y dos del handler OPTIONS real con Fetch nativo, sin acceso a Auth/base. |
| Cadena SQL con `psql -v ON_ERROR_STOP=1` | PostgreSQL Docker `public.ecr.aws/supabase/postgres:17.11.0.004`, 8/8 pasos exit 0, sólo datos sintéticos. |
| Supabase Auth y Edge reales | Stack Supabase CLI temporal local; flujos HTTP listados debajo correctos. Stack detenido y directorio temporal eliminado. |
| `git diff --check` | Sin errores; advertencias de conversión LF/CRLF. |

La suite E2E cubre login correcto/incorrecto, username inválido, logout,
refresh vencido, rutas protegidas, manipulación de identidad/rol legacy,
alta/reset/activación/desactivación/cambio de rol, restricciones del empleado,
regresiones operativas y comprobaciones Axe/responsive en ambos temas.

## SQL y retención

Cadena ejecutada después de las correcciones de ACL y locks:

1. `supabase/tests/00_legacy_schema.sql`.
2. `supabase/migrations/20261016010000_auth_profiles_expand.sql`.
3. `supabase/tests/02_expand_security_test.sql`.
4. `supabase/tests/01_auth_cutover_seed.sql`.
5. `supabase/migrations/20261016020000_auth_rls_cutover.sql`.
6. `supabase/tests/04_auth_rls_test.sql`.
7. `supabase/rollbacks/20261016020000_auth_rls_cutover.down.sql`.
8. `supabase/rollbacks/20261016010000_auth_profiles_expand.down.sql`.

Los pasos 7 y 8 se encadenaron solamente para probar sintaxis/compatibilidad
en la base descartable. En operación, el rollback de expand se limita a la fase
anterior al cutover: no es un procedimiento de recuperación posterior.

Las pruebas verifican ACL de bootstrap y RPC administrativas, permisos por
columna, RLS positiva/negativa, alcance propio, rechazo de payload/IDs ajenos,
retención de auditoría/urgencias, FK restrictivas, reactivación con email Auth
discordante y rechazo de degradación/desactivación del único administrador.
El catálogo posterior al rollback confirmó ausencia de SELECT de `anon` y
`authenticated` sobre empleados. El rollback de cutover mantiene RLS forzado y
revoca acceso sin restaurar PIN ni cascadas. El contenedor fue eliminado.

Las mutaciones del padrón administrativo usan el mismo advisory lock y
revalidan al actor después de adquirirlo. La prueba SQL verifica presencia del
lock; no constituye una prueba de estrés con transacciones concurrentes.

## Auth/Edge reales con datos sintéticos

- Login incorrecto rechazado y correcto con sesión/perfil admin verificable.
- Acceso anónimo a negocio denegado y signup público rechazado.
- Alta administrativa HTTP 201 y login de la cuenta creada.
- Elevación por empleado rechazada tanto por Edge como por PATCH REST.
- Desactivación HTTP 200, perfil RLS vacío inmediatamente y login bloqueado.
- Reactivación HTTP 200 y nuevo login válido.
- Reset HTTP 200; contraseña anterior rechazada y nueva aceptada.
- Logout HTTP 204 y refresh revocado.

Esto complementa los mocks E2E; no demuestra la configuración que finalmente
se desplegará. Los fallos distribuidos tienen auditoría/compensación revisadas;
no se afirma cobertura integral mediante inyección de cada fallo de red.

## Handoff

Backend y Frontend entregados; Tester aprueba el gate local con la evidencia
anterior. Reviewer independiente aprobó el cierre local en
`stage-04-final-review.md`; Orquestador formalizó el cierre el 17 de octubre
de 2026 en el stage y contexto técnico. Los cuatro puntos
residuales quedaron trazados en contrato, runbook y tests: conocimiento
administrativo de la contraseña, política de bootstrap, identidad de
reactivación y ACL/protección del último admin.

La revisión final adicional detectó y cerró cinco hallazgos: CORS 204/header
del SDK (alto), foco del diálogo (medio), reconciliación de huérfanos (medio),
redacción de contraseña inicial (bajo) y procedimiento de migración de
empleados existentes (alto). Las correcciones funcionales afectadas se
revalidaron con los comandos y resultados de la tabla; las correcciones de
procedimiento se contrastaron con el contrato SQL existente.

Pendientes de despliegue: autorización separada, backup/restauración real,
configuración candidata Auth/Edge/RLS, controles de abuso y canal de entrega de
credenciales. `rutinas.color` conserva ensayo y activación independientes.
