# Etapa 05 — Auditoría, actividad e historial

## Objetivo

Transformar la auditoría en experiencia trazable/escalable con actividad reciente, filtros, historial visual y calendario secundario.

## Intervención acotada autorizada — 20 de octubre de 2026

El propietario confirma Etapa 4 desplegada/aprobada y autoriza únicamente
corregir el reinicio diario y sumar indicadores al calendario existente,
incluido commit/push para Vercel. No se repiten auditorías de Etapa 4 ni se
declara completada toda Etapa 5. Filtros avanzados y actividad incremental del
roadmap general quedan fuera de esta intervención.

Contrato: `empleado_rutinas` configura rutinas permanentes sin fecha; no es
evidencia de asignación histórica diaria. `tareas_urgentes.fecha` delimita una
asignación puntual y `auditoria_diaria.fecha` un cumplimiento real (incluida su
anulación). No existe snapshot de pendientes de rutinas por fecha: no se
reconstruye ni se inventa. Calendario y detalle usan registros diarios reales,
incluyen cancelaciones/anulaciones y nunca proyectan la configuración actual
sobre fechas históricas. El empleado conserva sus rutinas y consulta únicamente
el cumplimiento y las urgencias de hoy en `America/Argentina/Buenos_Aires`.

Retención: sin borrados, migraciones ni escrituras de inicialización diaria.
Visibilidad y RPC siguen bajo Auth/RLS existente. Tester debe comprobar
medianoche argentina frente a UTC, pestaña abierta/reanudada, recarga, consultas
mensuales, indicadores, selección, estados y ausencia de escrituras ficticias.
Reviewer independiente revisará después de las validaciones.

## Dependencias

Corrección autorizada el 20 de octubre: ocultar tarjetas de integrantes sin
tareas o con todos sus registros anulados/cancelados. Las rutinas vacías no
generan tareas de presentación. Las tareas pendientes y los cumplimientos
válidos siguen visibles; el detalle mixto conserva registros inactivos y los
indicadores del calendario conservan su semántica histórica. Sin borrar datos
ni cambiar Supabase. Esta solicitud actualiza la visibilidad definida en las
intervenciones anteriores; incluye pruebas, commit/push y publicación en Vercel.
Evidencia en `docs/reviews/audit-empty-cards.md`. No cierra toda Etapa 5.

Seguimiento visual solicitado el 20 de octubre: compactar las acciones de
Equipo mostradas en la captura y dejar padding efectivo alrededor del logo
del nav móvil. Sólo CSS, con validación local; evidencia en
`docs/reviews/control-sizing-mobile-nav.md`. No cierra toda Etapa 5.

Refinamiento visual general autorizado el 20 de octubre: login, panel admin,
empleados, rutinas, asignaciones, urgencias y auditoría. Conservar estructura,
funcionalidades, identidad negro/cobre y ambos temas; ajustar tokens, controles,
profundidad, jerarquía y microinteracciones con movimiento reducido. Incluye
capturas locales, lint/build, verificaciones puntuales y commit/push a GitHub
para Vercel. Sin cambios en Supabase, migraciones ni lógica de negocio.
Dirección y evidencia en `docs/reviews/visual-polish.md`. No cierra toda Etapa 5.

Intervención visual adicional autorizada el 20 de octubre: en el detalle de
Auditoría, agrupar por identidad de rutina, ordenar rutinas por título y tareas
por `orden`, con desempate por descripción/ID. Separar emergencias en un bloque
propio al final. Reutilizar colores configurados con capacidad ON y fallback
Cobre con capacidad OFF, sin leer `color` en ese caso. Mantener estados,
históricos, cancelaciones y permisos. Incluye pruebas locales, commit y push;
sin migraciones ni cambios remotos de datos. No cierra toda Etapa 5.

Actualización autorizada el 20 de octubre: el propietario eligió asignaciones
diarias reales y autorizó directamente el SQL mínimo en Supabase, commit/push.
Sustituye la configuración permanente como fuente del trabajo actual: tabla
`asignaciones_diarias` por empleado/rutina/fecha, con `tarea_ids` capturados al
asignar, cancelación lógica y RLS. El legado sin fecha se conserva intacto y no
se copia a fechas ficticias. Cada día comienza sin selecciones. Calendario único,
diálogo GNS, urgencias históricas/completadas sin cancelación (UI y servidor),
textos de contraseña claros y colores Cobre/Verde/Azul/Violeta. Alcance acotado;
no reauditar Etapa 4 ni declarar cerrada toda Etapa 5.

Etapa 4 aprobada y política de retención, corrección, visibilidad y zona horaria definida.

## Alcance

- Modelo/consulta eficiente y autorizada de actividad.
- Actividad reciente con actor, objetivo, tipo, fecha y estado apropiados.
- Filtros por rango, persona, rutina, tipo y estado.
- Historial paginado/incremental y calendario secundario.
- Estados vacíos/errores, zona horaria y formatos consistentes.
- Exportación solo con aprobación y privacidad garantizada.

## Fuera de alcance

Agregación completa en navegador, historial mutable por no autorizados y analítica no definida.

## Criterios de aceptación

- Resultados respetan RLS y filtros combinables/predictibles.
- Paginación evita traer conjuntos completos.
- Fechas usan zona canónica y las vistas comparten un contrato consistente.
- Playwright cubre filtros, tiempo, permisos y vacío/error.

## Validación y gate

Lint, build, pruebas de consulta/política, E2E, volumen sintético y revisión accesible/responsive. Backend, Frontend, Tester y Reviewer aprueban. No iniciar Etapa 6.
