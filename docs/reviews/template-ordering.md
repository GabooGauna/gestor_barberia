# Orden de plantillas — 24/10/2026

## Orquestador: apertura y contratos

Etapa 6, ampliación expresa del propietario: reordenar rutinas y pasos mediante
asa, mouse/touch/teclado; persistencia automática, rollback visual y orden
compartido en todas las vistas. Commit/push autorizados tras comprobaciones.
Cambios previos del usuario en `.codex/config.toml` y `.env.example` se preservan
y quedan fuera del commit.

Backend interviene primero en `rutinas.orden` nullable y RPC transaccional que
reutiliza `tareas_rutina.orden`, con permisos vigentes y conjunto exacto activo.
Frontend consume ese contrato con dnd-kit, contextos independientes por lista y
mutaciones serializadas. Tester verifica SQL sintético y Playwright aislado,
incluidos error, recarga, teclado, mouse, touch y consumidores. Reviewer
independiente interviene después de las validaciones. Riesgos a resolver:
concurrencia, guardado parcial, respuesta perdida y despliegue DB antes de UI.

## Backend → Frontend / Tester

`20261024000000_template_order.sql`, rollback homónimo,
`09_template_order_test.sql`, `template-order-drill.mjs` y
`apply-template-order.ps1`: columna nullable sin backfill y RPC invoker atómica.
Conjunto exacto activo, rechazo de duplicados/archivados/cambios de pertenencia,
locks fijos con timeout 5 s y autorización administrativa AAL2 existente.
Sin modificación de grants/políticas/guards de tablas ni cumplimiento.

`node scripts/template-order-drill.mjs`: PASS, 26 assertions SQL sobre cadena
completa Auth/MFA/diarias/color en PostgreSQL 17 Docker local sin red, puertos ni
montajes. Incluye fallo real por trigger y rollback de todo el lote, casos
negativos, readback de orden como empleado, conservación UUID/colores/historial,
ACL/RLS, transacción exacta de Apply, rollback de migración y cleanup confirmado.

## Persistencia remota (Orquestador)

La revisión independiente aprobó el SQL antes de su aplicación. Inspect previo
confirmó: columna ausente, tareas.orden integer, guard vigente, RLS forzado,
UPDATE administrativo por autorización existente y cero acceso anon. Conteos:
5 rutinas y 54 tareas. No se inspeccionaron descripciones ni datos personales.

`pwsh -NoProfile -File scripts/apply-template-order.ps1 -Action Apply`: PASS,
COMMIT reconocido, siete tablas preservadas por comparación interna de huellas,
ACL/RLS/políticas conservados, sin backfill ni pruebas sobre datos reales.
Lectura fresca con `-Action Inspect`: columna y RPC invoker presentes, conteos
5/54 iguales, anon sin acceso y guard/RLS forzado intactos. No reejecutar Apply.

## Frontend → Tester / Reviewer

dnd-kit core/sortable/utilities fijados en lockfile, importados en el chunk
administrativo. Asas con pointer/teclado, anuncios españoles, listas aisladas,
destino direccional, tokens GNS y respeto a movimiento reducido. Guardado
optimista con timeout 15 s, bloqueo de acciones incompatibles, foco del asa
conservado y rollback visual ante error. Se explica que una respuesta perdida
requiere recargar para verificar el estado real. Lecturas de Asignaciones,
Mis tareas y Auditoría comparten orden; alta de pasos usa máximo + 1.

Revisión intermedia: corregido marcador inferior al bajar/superior al subir y
anuncio de no-op sin falso guardado. Pendiente evidencia final de Tester y gate
independiente antes de commit/push.

Estado posterior: Reviewer aprobó el gate final para este seguimiento;
dictamen independiente en `docs/reviews/template-ordering-review.md`, sin
bloqueantes/altos/medios abiertos introducidos. Orquestador autoriza la
publicación conforme a la solicitud del propietario, excluyendo sus cambios
previos. No se declara cierre de otra etapa ni resolución de alertas ajenas.

## Tester → Reviewer

- `npm ci`: PASS, instalación limpia del lockfile.
- `npm run lint`: PASS.
- `npm run build`: PASS, inicial 488,34 kB / 142,07 kB gzip;
  PanelAdmin 76,59 kB / 24,22 kB gzip. dnd-kit queda en chunk administrativo;
  sin advertencia de chunk >500 kB.
- `npx playwright test tests/e2e/template-ordering.spec.js --project=chromium
  --workers=1`: 8/8 PASS (19,8 s). Teclado/foco, mouse/asa, marcadores arriba y
  abajo, Escape/no-op, bloqueo y rollback de ambos tipos, reintento, recarga y
  segundo contexto de navegador; otras rutinas, colores e identidades intactos.
  Asignaciones/Mis tareas/Auditoría consumen el nuevo orden sin mutar cumplimiento.
  Touch CDP Chromium en claro/oscuro, viewport 390×844, sin overflow, cero
  violaciones Axe serias/críticas. Touch es emulado, no dispositivo físico.
- `npm run test:e2e -- --workers=2`: 94/95 PASS (2,5 min). El test preexistente
  de hover falló en `page.goto` con `net::ERR_NO_BUFFER_SPACE` antes de cargar la
  aplicación y sin ejecutar assertions. `npx playwright test --last-failed
  --workers=1`: 1/1 PASS (9 s), sin cambios de código. Los 95 escenarios quedan
  validados; no se afirma un único pase completo de 95/95.

Servidores 4173/4174, Supabase simulado en 127.0.0.1:54321, bloqueo de conexiones
remotas del fixture conservado. Las pruebas puntuales usan persistencia mock
compartida entre sesiones; la persistencia/atomicidad SQL real se valida por
separado en el drill local. Primeras iteraciones del harness sincronizaron
sensores/frames y centraron la lista táctil para evitar auto-scroll accidental;
no implicaron cambios de negocio. Sin configuraciones temporales ni escrituras
de prueba remotas. Tester aprueba este seguimiento puntual, sin cerrar otra etapa.

`npm audit --json`: dos hallazgos HIGH preexistentes en herramientas Vite 8.3.0 y
Zod (lockfile sin cambios en esas dependencias). Ninguno corresponde a dnd-kit;
se registran fuera del alcance funcional y no se actualizan automáticamente.

## Publicación verificada

Commit de implementación `751b4c67b1d59cb16b4d7ad9707ce58908a09df5`, push
`origin/main` exitoso. Estado GitHub `Vercel: success`, despliegue
`QheruaTbNcm4iyc7EzYzMAa2vw4y`. HTTP 200 en
`https://gestor-barberia-five.vercel.app`; bundle servido
`/assets/index-D-Y-A9nv.js`, administrativo `PanelAdmin-COKkqwMk.js`.
Lectura pública de assets confirma RPC `reorder_template_items`,
`data-drop-position`, asas accesibles y mensaje de rollback presentes. No se
inició sesión ni se reordenaron datos reales para esta comprobación.

Orquestador cierra únicamente este seguimiento: Backend, Tester y Reviewer
aprobados; persistencia mínima aplicada, frontend publicado y documentación
sincronizada. Los únicos cambios previos del propietario (`.codex/config.toml`
y `.env.example`) permanecen fuera de los commits y se conservan.
