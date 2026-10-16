# Workflow 03 — Rediseño visual

## Entrada

Playwright estable, alcance/paletas aprobados y flujos inventariados.

## Secuencia

1. **Orquestador** fija pantallas, breakpoints, criterios y no-cambios funcionales.
2. **Frontend** define tokens/componentes e implementa shell, temas y navegación por incrementos.
3. **Backend** confirma contratos y selecciones/permisos sin ampliación.
4. **Tester** valida claro/oscuro, desktop/móvil, teclado y movimiento reducido; actualiza E2E sin acoplar a CSS.
5. **Reviewer** revisa consistencia, contraste, foco, destructivos y regresiones.
6. **Orquestador** registra decisiones y cierra.

## Controles y salida

No ocultar seguridad con UI; botones con nombre accesible; movimiento prescindible. Salida: sistema visual documentado y lint/build/E2E verdes. No iniciar Etapa 4.
