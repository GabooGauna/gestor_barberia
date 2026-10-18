# Validación del candidato de controles operativos — Etapa 4

Fecha: 17 de octubre de 2026. Alcance autorizado: implementación y pruebas locales,
sin aprobación de staging/producción. No se inició Etapa 5 ni se aplicó color.

## Handoff y trazabilidad

Orquestador confirmó objetivos del usuario: retención cifrada 30 días, RPO0 con
escrituras suspendidas verificablemente, RTO4h por medir, MFA admin obligatorio,
contraseñas administradas y canal privado, cuotas persistentes y evaluación
CAPTCHA. Son objetivos candidatos, no autorización de configuración remota.

Backend entregó exclusivamente nueva migración operational, Edge y tests de
seguridad. Frontend implementó enrolamiento/desafío TOTP y guard del panel,
manteniendo empleado AAL1. Tester entrega evidencia Backend/Frontend aquí y
Auth real aislado en `stage-04-auth-security-validation.md` (40 assertions,
exit0,117,882s, limpieza confirmada). Reviewer independiente
revisa cambios, correcciones y límites en `stage-04-security-final-review.md`.

Contratos/archivos: `20261017000000_security_operations.sql`, admin-users,
AuthContext/ProtectedRoute/AdminMfa, fixtures y casos MFA; contrato Auth y
runbooks actualizados. Migraciones históricas/rollbacks y ensayo backup SQL
aprobados se conservan, sin reejecutar ese ensayo. Drift preparado sólo lectura.

## Evidencia Frontend y handler

| Comando / verificación | Resultado |
|---|---|
| `npm run lint` | exit0; repetido tras ampliar el caso responsive de MFA. |
| `npm run build` | exit0; 90 módulos, bundle530,13kB/151,64kB gzip. Advertencia >500kB ya conocida. |
| `node --test tests/backend/*.test.mjs` | 11/11; Fetch real del handler con Auth/DB simulados, contratos de credenciales, CORS, AAL1 rechazado, cuota429, mantenimiento/caída503, admisión antes de efectos y lease conservado en error Auth/red. |
| `npx playwright test tests/e2e/admin-mfa.spec.js --project=chromium` | 4/4; después de separar dos escenarios que compartían init-script de sesión. |
| `npx playwright test` | 45/45,48,2s. Justificado porque el guard Auth común y formato de JWT fixture afectan todas las rutas. Requests a proyectos Supabase remotos bloqueados por harness. |
| Focal `admin sin factor` | 1/1,10s después de añadir QR/overflow/Axe en375/768/1440 y ambos temas. No se afirma una segunda suite45 completa tras ese cambio sólo de assertions. |
| `git diff --check` | exit0, advertencias habituales de LF/CRLF. |

Los fixtures previos de negocio representan sesión ya elevada AAL2 para conservar
su propósito. Los casos MFA nuevos usan explícitamente AAL1: no se infiere MFA
real de mocks ni de decodificar tokens de Playwright. No persisten QR/secreto
TOTP ni código fuera de memoria; la sesión estándar Auth conserva su contrato.

## Controles implementados y límites

- Cuotas en tabla privada persistente y admisión serializada por lock DB antes
  de auditoría/Auth; sin CORS/memoria como limitador. 429/Retry-After y503 cerrado.
- Mantenimiento inicial cerrado; triggers INSERT/UPDATE/DELETE/TRUNCATE de seis
  tablas y helpers RLS. Leases Auth ambiguos no caducan ni se marcan drenados.
  Cierre integral requiere además Auth directo, jobs y escritores privilegiados.
- MFA AAL2 exigido en Edge y helpers de identidad/admin, sin policy de empleado
  que dé acceso a admin AAL1. Perfil mínimo sigue habilitado para enrolamiento.
- Script de drift read-only inventaría grants por tabla/columna, funciones por
  checksum, RLS/policies, constraints/default ACL y binding/estado de triggers.
  No consulta PIN, secretos ni filas Auth. MCP Supabase no disponible en sesión;
  configuración remota permanece sin inspección ni certificación.

Runbook vigente: `../runbooks/stage-04-security-controls.md`, complementa backup
y cutover. El suplemento cambia esquema/cuenta de controles y requiere su
propio gate; el restore histórico no demuestra cobertura de las tablas nuevas.

## Pendientes para autorización

No se equiparan: SQL restore, Auth real local, gateway hosted y recuperación
completa del proveedor. Quedan backup/cifrado/custodia y restore integral del
candidato/proveedor, congelación de todos los escritores para RPO0 y RTO4h
medido. Staging necesita autorización propia y datos sintéticos; producción
requiere evidencia staging/revisión, drift/configuración reales y otra autorización.
CAPTCHA/ingress/IP, custodios/canal, valores de cuotas y objetivos requieren
decisión definitiva. MFA es obligatorio en el candidato: no hay excepción AAL1.

Hallazgos operativos del ensayo Auth real: los verificadores no invalidan JWT
al mismo tiempo (REST toleró31s tras exp nominal en este entorno). El cierre
debe mantenerse hasta rechazo efectivo por Auth/REST/Edge, con historial de TTL
y tolerancia, antes de reabrir. La prueba exploratoria429 de login se retiró:
GoTrue aislado no soporta la variable propuesta de sign_in_sign_ups; no hay
limitación de login validada en este candidato local. Debe probarse en gateway/
infraestructura compatible, sin atribuirle las cuotas distribuidas de Edge.

El propietario confirmó exclusividad de TODO cambio de contraseña, incluido
cambio propio: Auth estándar permite updateUser(password) autenticado y este
candidato no lo bloquea. Es BLOQUEANTE abierto. Decisión del Orquestador y
caminos verificables en `../decisions/stage-04-admin-only-passwords.md`;
no se implementa un control aparente ni un trigger de auditoría interna sin
compatibilidad/decisión de alcance revisada.

Focal adicional del requisito confirmado:
`node scripts/stage04-password-policy-probe.mjs`: 10 assertions,6,392s,exit0
como REPRODUCCIÓN de incumplimiento, **POLICY FAIL**. Con Auth real y JWT
authenticated nuevo, self-update directo cambia la contraseña; la nueva permite
login y la previa falla. Admin API restablece y conserva UUID/perfil. No se
repite MFA/cuotas ni se interpreta ese exit0 como cumplimiento de la política.
Evidencia en `stage-04-password-policy-gap.md`, con limpieza confirmada.

Esta evidencia conserva los resultados aprobados previos y no autoriza push,
despliegue, cuentas/configuración reales ni modificaciones Supabase remoto.
