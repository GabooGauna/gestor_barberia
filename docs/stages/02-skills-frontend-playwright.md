# Etapa 02 — Skills de frontend y Playwright

## Objetivo

Preparar estándares/herramientas de frontend y una base E2E confiable antes del rediseño o Auth.

## Dependencias

- Etapa 1 aprobada.
- Navegadores objetivo y entorno de prueba aislado decididos.
- Autorización para dependencias y binarios Playwright.

## Alcance

- Evaluar/configurar skills de frontend aplicables.
- Regularizar la línea base de ESLint en hooks sin cambiar comportamiento funcional.
- Instalar `@playwright/test` con scripts, configuración, trazas, screenshots y reportes.
- Definir fixtures/helpers mínimos y estrategia de datos aislados.
- Crear smoke tests del comportamiento actual sin convertir vulnerabilidades en requisitos.
- Documentar selectores, matriz de navegadores y ejecución local/CI futura.

## Fuera de alcance

Rediseño visual, Auth/RLS, cambios de negocio y E2E con escrituras sobre datos remotos.

## Criterios de aceptación

- Instalación reproducible y scripts claros.
- Login visible, navegación básica controlada y estados sin datos validables en aislamiento.
- Artefactos útiles sin secretos y sin dependencia de producción.
- Lint, build y suite E2E base pasan.

## Validación y gate

Ejecutar `npm ci` cuando sea posible, lint, build y Playwright en la matriz acordada. Tester demuestra reproducibilidad; Reviewer valida aislamiento. No iniciar Etapa 3 automáticamente.

## Resultado de ejecución

- Skill `frontend-design` instalada, licenciada y adaptada a las paletas del Gestor de Barbería sin implementar el rediseño.
- Playwright Test configurado con Chromium, trazas, capturas, video y reporte HTML en fallas.
- Supabase sustituido por un mock local; hosts remotos y escrituras quedan bloqueados por defecto.
- Seis E2E cubren navegación, componentes principales, estados vacío/error y Axe básico.
- Línea base de ESLint regularizada sin desactivar reglas; build exitoso.
- Bundle de 510,68 kB documentado con optimizaciones candidatas en `docs/PROJECT_CONTEXT.md`.
- Auditoría npm sin vulnerabilidades conocidas al cierre.

El gate técnico queda satisfecho. Iniciar Etapa 3 requiere una instrucción explícita.
