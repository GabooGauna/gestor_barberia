# Etapa 06 — Refactorización, optimización y regresión

## Objetivo

Consolidar arquitectura, reducir deuda y demostrar estabilidad sin funcionalidad nueva.

## Dependencias

Etapas 1–5 aprobadas, suite E2E estable y métricas base disponibles.

### Apertura autorizada — 20 de octubre de 2026

El propietario solicita expresamente iniciar Etapa 6 sobre los flujos de Etapa 5
ya desplegados y aceptados. Orquestador acepta este alcance: el roadmap general
de filtros avanzados/actividad incremental de Etapa 5 permanece diferido, sin
declararlo implementado. Producto congelado; diseño GNS, temas, Auth/RLS y
contratos existentes se conservan. No se repiten auditorías históricas.

Autoriza optimizaciones medibles, regresión local aislada, limpieza real puntual
en el proyecto Supabase existente, commit/push y comprobación de Vercel. La
limpieza incluye exclusivamente pruebas identificadas y César con su identidad
Auth/relaciones; requiere inventario, respaldo puntual verificado y control de
integridad. Conserva ambos administradores/contraseñas/MFA, demás usuarios,
plantillas/tareas/colores, permisos y configuración. Registros ambiguos quedan
fuera. Sin migraciones, cambios de autenticación/RLS ni funcionalidades nuevas.

Handoffs y evidencia de cierre en `docs/reviews/stage-06-delivery.md` y revisión
independiente en `docs/reviews/stage-06-review.md`.

## Alcance

### Ampliación visual autorizada — GNS (24/10/2026)

El propietario autoriza refactor visual integral con Impeccable y commit/push
para Vercel. Conserva logo, cobre/grafito, ambos temas, funcionalidades y datos.
Sólo presentación, tipografía local, navegación y estados; sin Supabase/RLS.
La reanudación conserva las validaciones aprobadas y corrige sólo defectos
detectados. Evidencia acotada: `docs/reviews/gns-visual-refactor.md`.

### Ampliación puntual autorizada — orden de plantillas (24/10/2026)

El propietario solicita arrastre por asa y teclado de rutinas y sus pasos,
persistencia automática en Supabase y recuperación visual ante error. Se permite
únicamente `rutinas.orden` como dato nuevo; se reutiliza `tareas_rutina.orden` y
una RPC atómica con la autorización administrativa vigente. No se mueven tareas
entre rutinas ni se alteran UUID, colores, históricos, cumplimiento o permisos.
Las lecturas de plantillas, asignaciones, trabajo y auditoría respetan el orden.
Se autoriza la persistencia mínima necesaria y commit/push para Vercel después
de validación local aislada y revisión independiente. Evidencia y handoffs en
`docs/reviews/template-ordering.md`.

### Ampliación puntual autorizada — administradores con tareas (20/10/2026)

El propietario autoriza incorporar «Mis tareas» al panel administrativo,
autoasignación con la cuenta existente, cumplimiento/pendiente de rutinas y
urgencias, progreso diario e identificación en la auditoría común. Esta solicitud
sustituye el congelamiento de producto sólo para este flujo. Se reutilizan los
contratos diarios y componentes existentes; se conservan rol, MFA, historial,
colores y temas. Sin cuentas duplicadas ni cambios remotos de datos de prueba.
Commit/push para publicación GitHub–Vercel expresamente autorizados tras lint,
build, E2E y revisión independiente. Handoffs/evidencia en
`docs/reviews/admin-own-tasks.md`.

- Separar datos, sesión, dominio y presentación donde aporte claridad.
- Centralizar contratos/tipos, errores y fechas.
- Eliminar código/assets/dependencias muertos con evidencia.
- Optimizar consultas, renders y bundle desde mediciones.
- Completar regresión crítica, permisos y destructivos.
- Revisar documentación y preparación operativa.

## Fuera de alcance

Nuevas funciones, rediseños amplios, microservicios sin necesidad y optimización especulativa.

## Criterios de aceptación

- Contratos visibles no cambian sin decisión.
- E2E cubre sesión, roles, rutinas, asignaciones, urgencias y auditoría.
- Instalación limpia, lint, build y pruebas pasan.
- Sin críticos/altos; medios aceptados tienen responsable/plazo.
- Métricas mejoran o no regresan y documentación coincide.

## Validación y gate

Ejecutar `npm ci`, lint, build, tests disponibles y Playwright; auditar dependencias/bundle con herramientas aprobadas y revisar seguridad/accesibilidad. Orquestador presenta readiness. Push/deploy requieren autorización.
