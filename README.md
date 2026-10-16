# Gestor de Barbería

Aplicación web para organizar protocolos operativos de una barbería, asignar rutinas al personal, enviar tareas urgentes y consultar cumplimiento diario.

> **Estado de seguridad:** prototipo no apto para producción. Actualmente usa PIN desde el cliente, confía el rol a `localStorage` y accede a tablas públicas con RLS desactivado y permisos amplios para `anon`. La remediación está planificada en la Etapa 4 y debe completarse antes de cualquier uso productivo.

## Funcionalidad actual

- Selección de empleado e ingreso por PIN.
- Panel administrador para plantillas, tareas, empleados y asignaciones.
- Envío y seguimiento de tareas urgentes.
- Panel de empleado para marcar cumplimiento diario.
- Vista administrativa de auditoría por fecha.
- Identidad visual GNS Hair Studio, temas claro/oscuro/sistema y navegación responsive.
- Colores semánticos de rutina preparados detrás de `VITE_ENABLE_RUTINAS_COLOR`.

## Stack

- React 19, React Router 7, Vite 8 y Tailwind CSS 4.
- Supabase JS 2 contra el proyecto configurado por variables de entorno.
- ESLint 10.

## Requisitos y ejecución local

Se requiere Node.js compatible con Vite 8, npm y un `.env.local` no versionado:

```dotenv
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

La clave anónima es publicable por diseño, pero no reemplaza RLS. Nunca agregues `service_role`, contraseñas, PIN u otros secretos a variables `VITE_*` o al repositorio.

```bash
npm ci
npm run dev
```

## Verificaciones

```bash
npm run lint
npm run build
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
npm run preview
```

Playwright usa Chromium y un mock PostgREST en memoria. El servidor de pruebas
recibe una URL local ficticia y bloquea cualquier intento hacia `*.supabase.co`.
Consulta [la guía E2E](tests/e2e/README.md) antes de ampliar la suite.

## Documentación

- [Contexto técnico](docs/PROJECT_CONTEXT.md)
- [PRD](docs/PRD.md)
- [Reglas](docs/RULES.md)
- [Roles de agentes](AGENTS.md)
- [Etapas](docs/stages/)
- [Workflows](.agents/workflows/)
- [Skill de frontend](.agents/skills/frontend-design/SKILL.md)

Los stages definen **qué** se implementa y los workflows **cómo** colaboran los agentes. Se trabaja una etapa por vez y no se avanza automáticamente.

## Supabase y seguridad operativa

El frontend consume directamente `empleados`, `rutinas`, `tareas_rutina`, `empleado_rutinas`, `auditoria_diaria` y `tareas_urgentes` desde `src/services/supabase.js`.

No ejecutes migraciones ni pruebas con escritura contra datos remotos reales. Auth, roles, RLS, grants y cascadas requieren diseño, revisión, pruebas aisladas y autorización expresa.

## Roadmap

1. Auditoría, documentación y agentes — completada.
2. Skills de frontend, calidad y Playwright — completada.
3. Rediseño visual claro/oscuro — completada.
4. Supabase Auth, sesiones, roles y RLS.
5. Rediseño de auditoría.
6. Refactorización, optimización y regresión.

Consulta `docs/stages/` para criterios detallados.
