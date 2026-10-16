# Workflow 02 — Skills de frontend y Playwright

## Entrada

Etapa 1 aprobada, navegadores/entorno definidos y autorización para dependencias.

## Secuencia

1. **Orquestador** confirma skills, matriz y estrategia sin datos reales.
2. **Frontend** corrige la línea base de lint sin alterar comportamiento y configura estándares y selectores accesibles/estables necesarios.
3. **Tester** instala/configura Playwright, fixtures, reportes y smoke tests.
4. **Backend** revisa que mocks/local representen contratos sin debilitar seguridad.
5. **Tester** ejecuta instalación limpia, lint, build y E2E; artefactos solo de fallas y sin secretos.
6. **Reviewer** revisa reproducibilidad, flakiness, aislamiento y alcance.
7. **Orquestador** actualiza instrucciones y cierra.

## Controles y salida

No escribir contra el remoto, fijar credenciales reales ni aceptar vulnerabilidades como comportamiento requerido. Salida: comandos reproducibles, suite base verde y handoff. No iniciar Etapa 3.
