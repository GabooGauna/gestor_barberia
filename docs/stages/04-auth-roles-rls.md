# Etapa 04 — Autenticación segura, roles y RLS

## Estado

**Despliegue real aceptado el 20 de octubre de 2026.** Auth, vinculación de ambos
perfiles existentes, RLS FORCE, MFA administrativo y Edge desplegados;
frontend GitHub–Vercel `c03511e` y `cc8a40d` verificado. Color aplicado después
por separado, probado UI admin/API empleado y habilitado en Production.
Integridad de seis tablas e históricos intacta. Reviewer aprobó evidencia real;
servicio abierto con maintenance=false/in-flight0. Colores editados después por
propietario confirmados y preservados. No Etapa 5 ni garantía de RPO 0 absoluto
/recuperación integral Supabase. Evidencia y límites en
`../reviews/stage-04-controlled-cutover-checkpoint.md` y dictamen independiente
`../reviews/stage-04-resume-supabase-review.md`. Lo siguiente es cronología.

Checkpoint vigente del 18 de octubre: credencial/CA/TLS resueltos; respaldo
preparatorio existente cifrado, clave recuperada y restore PostgreSQL aislado
PASS con comparación delimitada de conteos/UUID/FK y roles. No se recaptura ni
se repiten pruebas aprobadas. No es recuperación integral Supabase ni backup
de corte con RPO 0. Custodio principal propietario, suplente/bóveda/ubicación
definitiva pospuestos; frontend con destino Vercel elegido, aún sin proyecto/
dominio verificados (`../runbooks/stage-04-vercel.md`). No se aplicaron migraciones ni
otros cambios remotos. Evidencia en
`../reviews/stage-04-existing-backup-recovery.md`. Lo siguiente es cronología.

Solicitud posterior del propietario: respaldo manual cifrado fuera del repo
por Session pooler, con captura local segura de contraseña todavía pendiente.
Autoriza color de manera independiente sólo tras validar autenticación real;
no se aplicó ni activó. Decisión vigente y límites en
`../decisions/stage-04-manual-backup-and-color-authorization.md`.

Reintento posterior del 18 de octubre: lecturas MCP recuperadas; baseline
legacy verificado, sin migraciones ni Edge registradas y sin RLS activo.
Despliegue detenido antes de escrituras por gates de respaldo/restore integral
y configuración/contención no verificados. Los 403 de Management API para
backup/Auth no representan un fallo del MCP de proyecto. Estado vigente en
`../reviews/stage-04-mcp-retry-2026-10-18.md`; cronología anterior debajo.

Actualización operativa del 18 de octubre de 2026: el propietario acepta el
cambio propio por API directa y conserva Auth nativo, según
`../decisions/stage-04-native-auth-risk-acceptance.md`. Autoriza despliegue real
condicional a los gates del runbook. La ejecución se detuvo antes de escrituras
por acceso de gestión HTTP 403 y prerrequisitos no verificados; ver
`../reviews/stage-04-deployment-attempt-2026-10-18.md`. No es un cierre remoto
ni habilitación de producción. El estado local histórico siguiente se conserva.

**Cerrada localmente el 17 de octubre de 2026.** Backend y Frontend entregados;
Tester y Reviewer independiente aprobaron sus gates. No quedan hallazgos
bloqueantes o altos abiertos en el alcance local revisado.

Evidencia: `docs/reviews/stage-04-validation.md` y dictamen independiente en
`docs/reviews/stage-04-final-review.md`. Lint/build correctos; E2E completo
40/40 previo y 7/7 casos afectados reejecutados tras las correcciones finales
(incluido un caso nuevo); unitarios 6/6; cadena SQL 8/8 y Auth/Edge reales
locales con datos sintéticos. Se conservan los límites de evidencia allí
detallados, incluida la ausencia de estrés concurrente multiconexión.

El cierre no habilita producción ni autoriza despliegue. Supabase remoto no
fue modificado; migraciones, provisión real, backup/restore drill y validación
de la configuración candidata requieren autorización separada y el runbook.
`rutinas.color` continúa independiente. No se inicia la Etapa 5.

## Objetivo

Reemplazar PIN/autorización local por Supabase Auth, sesiones verificables, roles confiables y RLS de mínimo privilegio.

## Dependencias

- Etapas 1–3 aprobadas y entorno local/staging con datos sintéticos.
- Política de alta, recuperación, baja y cambio de rol.
- Matriz tabla/operación/rol y política de conservación.
- Backup y plan de migración/reversión antes de cambios remotos.

## Alcance

- Perfil vinculado a `auth.users`; login usuario/contraseña, refresh, logout y recuperación acordada.
- Protección de rutas/estados de sesión.
- RLS en seis tablas, políticas por identidad/rol y reducción de grants.
- Retiro de PIN del flujo, requests, storage y selección; tratamiento seguro de columna histórica.
- Constraints, índices y cascadas necesarios para seguridad/rendimiento.
- Pruebas positivas/negativas, incluidas requests manipuladas.

## Fuera de alcance

Cambios directos en producción sin aprobación, `service_role` en frontend, confiar solo en guards/UI y rediseño de auditoría.

## Criterios de aceptación

- `anon` no accede a negocio salvo excepción justificada.
- Empleado accede solo a su alcance; admin autorizado conserva operaciones definidas.
- Alterar storage, payload, ids o rol visual no eleva privilegios.
- PIN/perfil completo no llega ni persiste en navegador.
- Sesión ausente/expirada/revocada falla en forma segura.
- Migraciones/políticas versionadas y ensayadas; lint/build/políticas/E2E pasan.

## Gate de producción y salida

Reviewer solo puede levantar el bloqueo de seguridad con evidencia de Auth, RLS, grants mínimos y pruebas negativas. Backend, Frontend y Tester entregan sus evidencias; una aplicación remota requiere autorización separada. No iniciar Etapa 5.
