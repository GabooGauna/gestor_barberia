# Etapa 05 — Auditoría, actividad e historial

## Objetivo

Transformar la auditoría en experiencia trazable/escalable con actividad reciente, filtros, historial visual y calendario secundario.

## Dependencias

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
