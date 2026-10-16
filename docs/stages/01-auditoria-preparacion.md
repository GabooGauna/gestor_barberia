# Etapa 01 — Auditoría y preparación

## Objetivo

Establecer una línea base verificable del repositorio y Supabase, documentar riesgos y preparar la coordinación de agentes sin modificar lógica funcional ni sistemas remotos.

## Alcance

- Inventario de arquitectura, dependencias, rutas, componentes, funcionalidades y contratos Supabase.
- Inspección read-only de esquema, constraints, índices, RLS, políticas, permisos, funciones, triggers, migraciones y cascadas.
- Riesgos priorizados; creación de agentes, contexto, PRD, reglas, stages y workflows.
- Actualización del README y verificación local con lint/build.

## Fuera de alcance

- Cambios de UI, lógica, autenticación, permisos o esquema.
- Migraciones, escrituras remotas, lectura de valores de PIN, push o despliegue.
- Instalación de Playwright o skills de frontend, reservada a Etapa 2.

## Entregables

- `AGENTS.md`, documentos base, seis stages, seis workflows y README real.
- Evidencia de verificaciones y riesgos para el handoff.

## Criterios de aceptación

- Mapa de componentes/operaciones consistente con código y seis tablas documentadas sin datos sensibles.
- RLS, permisos `anon`, autenticación local y cascadas clasificados correctamente.
- Prohibición explícita de producción hasta corregir identidad, autorización y exposición.
- Etapas 2–6 con alcance, exclusiones, dependencias, criterios y validación.
- Lint/build ejecutados y fallas documentadas; ningún cambio funcional/remoto.

## Resultado de validación de esta ejecución

- Build exitoso; se registró advertencia por chunk JavaScript superior a 500 kB.
- Lint no pasa: 9 errores y 2 advertencias preexistentes documentados en `docs/PROJECT_CONTEXT.md`.
- La falla de lint no se corrigió para respetar el alcance exclusivamente documental.

## Gate de salida

Tester adjunta resultados; Reviewer confirma coherencia y ausencia de secretos. El Orquestador entrega y se detiene. Etapa 2 requiere instrucción explícita.
