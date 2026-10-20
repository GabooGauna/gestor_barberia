# Reinicio diario y calendario — 20 de octubre de 2026

## Seguimiento autorizado: asignaciones diarias reales

Aplicado directamente en Supabase `20261020000000_daily_assignments.sql`,
en una transacción: RLS FORCE, SELECT autenticado sin escrituras directas,
RPC administrativa por fecha argentina y snapshot de IDs de tareas; cero filas
iniciales y huellas de las seis tablas anteriores intactas. Readback confirma
permisos mínimos y bloqueo de cancelación histórica/completada en servidor.
Legado sin fecha conservado, sin inventar asignaciones. Calendario único,
diálogo GNS, nombres de colores simples y mensajes sin “bytes”.

Lint/build PASS (se conserva advertencia previa de bundle >500 kB).
Tester aprobó 27 casos distintos: corrida focal 25/27 y repetición puntual
4/4 tras ajustar sesión sintética al simular mañana y repetir navegación/HMR.
Comandos: Playwright sobre `daily-audit`, `account-management`,
`routine-colors-enabled`, `routine-colors-disabled` y `panels` con `--workers=2`;
repetición `--grep 'comienzan vacías|diálogo de contraseña|accesibilidad y responsive' --workers=1`.
Axe sin violaciones serias/críticas claro/oscuro 375/1440. Reviewer independiente
aprueba el gate focal tras readback. No hubo escrituras de prueba en producción.
Lo siguiente conserva la evidencia de la primera intervención, anterior a la
decisión de convertir las asignaciones en diarias reales.

## Alcance y contrato

Intervención acotada solicitada después del despliegue aprobado de Etapa 4.
Commit/push autorizados por el propietario para actualizar Vercel; sin cambios
de Supabase, migraciones, borrados ni repetición de auditorías de seguridad.
No representa cierre del roadmap completo de Etapa 5.

Backend auditado: `private.business_today()` ya usa
`America/Argentina/Buenos_Aires`; `set_task_completion` escribe únicamente
cumplimiento del día actual y `set_urgent_completion` exige fecha actual.
No requiere modificar el contrato servidor.

`empleado_rutinas` es configuración permanente sin fecha, no una asignación
puntual diaria. `tareas_urgentes.fecha` delimita tareas puntuales y
`auditoria_diaria.fecha` conserva cumplimientos/anulaciones de rutinas. La vista
anterior proyectaba las asignaciones actuales sobre cualquier fecha histórica;
eso fabricaba pendientes sin evidencia. Ahora el detalle consulta sólo registros
reales del día. No existe snapshot histórico de rutinas pendientes: no se infiere
su existencia ni se reconstruye desde la configuración actual.

## Cambios y conservación

- `useBusinessDate` verifica la fecha argentina cada segundo y al recuperar foco
  o visibilidad. Las pestañas suspendidas se actualizan al reanudarse; una recarga
  calcula directamente la fecha argentina actual.
- Empleado conserva rutinas y consulta urgencias/cumplimiento del día. La vista
  oculta datos del día previo mientras carga; respuestas o mutaciones tardías
  no reemplazan el estado del día nuevo.
- Calendario mensual muestra puntos por urgencias o cumplimientos reales,
  incluso cancelados/anulados porque son historia real. No marca fechas por
  configuración permanente. Seleccionar día muestra responsables, tareas y
  estados; “Hoy” vuelve a seguir automáticamente el día de Argentina.
- Indicadores consultan sólo `id,fecha` del mes visible, páginas de 500 filas
  ordenadas por ID. Detalle consulta sólo el día, con joins de nombre/tarea/rutina
  autorizados por RLS. AbortController descarta respuestas de fechas anteriores.
- Cancelar sigue usando la RPC existente; el registro continúa visible como
  cancelado. El reinicio diario nunca escribe, copia ni elimina registros.
- CSS usa tokens GNS existentes de superficie, cobre, texto y estados en ambos
  temas. Se mantiene el selector de fecha y se agregan botones de mes y día.

## Handoff

Backend: contrato vigente compatible, sin implementación de datos. Frontend:
archivos `PanelEmpleado.jsx`, `CalendarioAuditoria.jsx`, `useBusinessDate.js` y
`index.css`. Decisión: distinguir configuración de evidencia diaria sin agregar
snapshots. Riesgo conocido: el historial muestra descripciones actuales de las
tareas, como permite el modelo existente, no versiones del texto original.
Tester verifica con Supabase interceptado localmente y sin escrituras reales;
Reviewer independiente revisa después de las validaciones.

## Validación local

- `npm run lint`: PASS, sin warnings ESLint.
- `npm run build`: PASS; 532,22 kB JS / 152,99 kB gzip. Se mantiene la
  advertencia previa de bundle mayor de 500 kB, fuera de esta corrección.
- `node node_modules/@playwright/test/cli.js test --workers=2`: 55/56 PASS.
  Las diez pruebas nuevas de `daily-audit.spec.js` pasaron: medianoche argentina
  frente a UTC, recarga, foco/visibilidad, seguimiento de hoy y selección histórica,
  puntos reales, navegación mensual, error/reintento y accesibilidad/responsive.
- El único fallo global fue el test previo de colores
  `routine-colors-enabled.spec.js:92`, que no capturó el estado transitorio de
  guardado de 300 ms aunque la operación terminó correctamente. La repetición
  aislada del mismo caso pasó 1/1 (2,7 s). No se modificó código ni pruebas de
  colores; no se atribuye 56/56 a una corrida completa.
- Axe en calendario claro/oscuro y anchos 375/1440: cero violaciones serias o
  críticas; sin desbordamiento horizontal. Se corrigió la coincidencia entre
  números visibles y etiquetas accesibles detectada durante la validación.
- Supabase usa únicamente mocks en `127.0.0.1:54321`; el fixture bloquea cualquier
  solicitud a proyectos remotos. El arranque requirió ejecución fuera del
  sandbox por `connect EACCES` a los servidores HTTP locales de Playwright.

Tester aprueba el alcance focal. Incidencia residual: sensibilidad temporal de
una prueba previa de colores, sin regresión funcional reproducible en el caso
aislado. No se declara una nueva auditoría de producción ni cierre integral
de Etapa 5.

Reproducción de la incidencia aislada:
`node node_modules/@playwright/test/cli.js test tests/e2e/routine-colors-enabled.spec.js --grep 'crea y edita' --workers=1`.
QA visual final:
`node node_modules/@playwright/test/cli.js test tests/e2e/daily-audit.spec.js --grep 'accesibilidad y responsive' --workers=1 --output=test-results/calendar-visual --reporter=list`
→ 2/2 PASS. Capturas sintéticas bajo `test-results/calendar-visual/` (ignoradas
por Git). Inspección visual de claro1440 y oscuro375: calendario, puntos,
selección, responsable y detalle legibles, sin cortes ni desbordamiento.

Reviewer independiente aprueba el gate focal para commit/push después de estas
validaciones: sin hallazgos bloqueantes, altos o medios en el diff revisado.
Acepta registrar la incidencia transitoria del test de colores fuera del cambio
con ambos resultados exactos; no atribuye causalidad demostrada ni 56/56 global.
