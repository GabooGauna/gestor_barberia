# Etapa 04 — Autenticación segura, roles y RLS

## Estado

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
