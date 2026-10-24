# Revisión independiente — orden de plantillas

Fecha: 24 de octubre de 2026. Rol Reviewer, independiente del autor principal.
Fuentes: AGENTS, PROJECT_CONTEXT, PRD, RULES, stage/workflow 06, contrato
`template-ordering.md`, diff de implementación y handoffs de Backend, Tester y
Orquestador en `template-ordering.md`. Esta revisión no ejecutó operaciones
remotas ni repitió comprobaciones aprobadas.

## Dictamen

**Aprobado para commit/push y comprobación del despliegue Vercel**, dentro de la
autorización expresa del propietario. Sin hallazgos bloqueantes, altos o medios
abiertos introducidos por este cambio. Tester aprobó sus gates. La publicación
todavía requiere verificar el commit desplegado; este dictamen no afirma que
esa publicación ya ocurrió ni vuelve a certificar áreas ajenas al alcance.

## Contrato y revisión

- Persistencia mínima: `rutinas.orden` nullable, sin backfill; tareas reutilizan
  su columna existente. RPC SECURITY INVOKER, autorización administrativa AAL2
  vigente, permisos de tablas/RLS/guards conservados y EXECUTE anónimo denegado.
- Conjunto activo exacto, rechazo de duplicados/archivados/tareas ajenas y locks
  de tablas en orden fijo, con timeout. El lote es atómico; concurrencia conserva
  la última operación aceptada, sin intercambiar tareas entre rutinas.
- Apply valida destino, drift y conservación interna de siete tablas, ACL y
  políticas antes del COMMIT. Rollback elimina sólo la RPC y la nueva columna,
  después de revertir el frontend. El SQL fue revisado y aprobado antes de Apply.
  Según el handoff del Orquestador, Apply y lectura fresca remotos resultaron
  PASS, con cinco rutinas/54 tareas y controles conservados; sin reordenamientos
  de prueba sobre datos reales.
- Asas con pointer/teclado, listas independientes, instrucciones/anuncios en
  español, foco y controles separados. Touch restringido al asa, estados GNS en
  ambos temas y respeto a movimiento reducido. Guardados serializados y acciones
  incompatibles bloqueadas durante arrastre/guardado.
- Actualización optimista, timeout y restauración visual ante error. El mensaje
  distingue el estado de pantalla de una posible respuesta perdida después del
  COMMIT y pide recargar para verificar. UUID, colores, relaciones, históricos y
  cumplimiento conservados. Asignaciones, trabajo y Auditoría consumen el orden;
  pasos nuevos usan máximo + 1.

Hallazgos corregidos durante revisión: indicador de destino inicialmente siempre
superior (medio), ahora inferior al bajar/superior al subir; anuncio de guardado
en no-op (bajo), ahora anuncia orden sin cambios. Código final revisado y marcador
en ambos sentidos comprobado por Tester. `git diff --check` PASS, con avisos de
normalización CRLF solamente.

## Evidencia aceptada y límites

Backend: `node scripts/template-order-drill.mjs`, 26 assertions SQL PASS en
PostgreSQL local aislado. Incluye autorización negativa, readback empleado,
fallo real por trigger con rollback de todo el lote, conservación de datos/ACL,
transacción exacta Apply y rollback; cleanup confirmado.

Tester: `npm ci` PASS (228 paquetes), `npm run lint` PASS y `npm run build` PASS,
sin advertencia de chunk. JS inicial 488,34 kB; chunk administrativo 76,59 kB
(24,22 kB gzip). `npx playwright test tests/e2e/template-ordering.spec.js
--project=chromium --workers=2`: 8/8 PASS. Cubre persistencia tras recarga/segunda
sesión, teclado/foco, mouse/asa, cancelación/no-op, rollback/reintento, separación
de listas, controles de archivado, consumidores y touch CDP en ambos temas con
Axe sin hallazgos serios/críticos.

`npm run test:e2e -- --workers=2`: 94/95 PASS. El único caso de hover preexistente
falló en `page.goto` con `net::ERR_NO_BUFFER_SPACE`, antes de cargar la aplicación.
`npx playwright test --last-failed --workers=1`: 1/1 PASS sin cambios de código.
Los 95 escenarios quedaron validados entre corridas; no se afirma una corrida
única 95/95 ni una causa exhaustivamente demostrada para la falla de navegación.
Las ocho pruebas nuevas también pasaron dentro de la regresión completa.

Persistencia UI probada contra mock local y contrato real mediante SQL sintético;
touch emulado con eventos reales CDP Chromium, sin dispositivo físico. No se
realizaron escrituras E2E en el remoto. Los dos HIGH preexistentes Vite/Zod de
`npm audit`, sin cambio de resolución por dnd-kit, quedan documentados fuera del
alcance de esta función; no se presentan como corregidos.

Próximo rol/acción: Orquestador, excluir cambios previos del propietario en
`.codex/config.toml` y `.env.example`, publicar el alcance revisado y registrar
commit, push y comprobación de Vercel.
