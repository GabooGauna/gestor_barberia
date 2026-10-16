# Etapa 04 — Autenticación segura, roles y RLS

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
