# Etapa 06 — Refactorización, optimización y regresión

## Objetivo

Consolidar arquitectura, reducir deuda y demostrar estabilidad sin funcionalidad nueva.

## Dependencias

Etapas 1–5 aprobadas, suite E2E estable y métricas base disponibles.

## Alcance

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
