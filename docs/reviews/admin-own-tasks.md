# Administradores con tareas propias — 20/10/2026

## Orquestador → Backend

Ampliación puntual de Etapa 6 autorizada por el propietario: «Mis tareas» en
administración, autoasignación sin cuenta adicional ni cambio de rol,
cumplimiento/pendiente, urgencias, progreso diario y auditoría común. Commit y
push autorizados después de validaciones. Se preservan los cambios previos del
usuario en `.codex/config.toml` y `.env.example`, fuera de esta entrega.

Contratos: `asignaciones_diarias` por persona/fecha, snapshot `tarea_ids`,
`set_daily_routine_assignment`, `set_task_completion`, `set_urgent_completion`.
Riesgos a validar: lectura amplia del administrador, identidad de actor, cruce
de medianoche argentina y conservación del historial. Sin pruebas sobre datos
reales ni nuevas operaciones remotas de Supabase.

## Backend → Frontend

Revisión independiente del SQL versionado: los destinatarios de asignaciones y
urgencias ya admiten administradores activos. `private.current_employee_id()`
identifica el mismo perfil administrativo con AAL2; el cumplimiento exige
asignación propia vigente para hoy, sin recibir un UUID de empleado del cliente.
Las rutinas registran `empleado_id` y eventos con `actor_auth_user_id = auth.uid()`;
urgencias conservan su contrato existente de estado sobre la fila propia,
identificada en Auditoría por `empleado_id` (sin añadir una tabla de eventos).
No se necesitan migraciones, nuevas tablas ni cambios de RLS/Auth/MFA.

## Frontend → Tester

`PanelAdmin` monta bajo demanda el mismo `PanelEmpleado` con perfil verificado y
título «Mis tareas». Cada entrada vuelve a consultar datos, incluyendo cambios
hechos desde Asignaciones/Urgencias/Auditoría. Asignaciones señala «(vos)» sobre
el UUID propio; conserva el selector de integrantes activos y su RPC existente.
El componente compartido añade progreso accesible de tareas vigentes y urgentes,
con porcentaje, total completado y pendientes en ambos roles. Reutiliza paleta,
colores, toggles y estilos responsive existentes; barra con tokens de tema.

La consulta personal conserva persona/fecha/cancelación/anulación y añade
filtros explícitos de archivado de rutina/tareas para el administrador, cuya RLS
permite inspeccionar historial archivado. Los días anteriores permanecen en
Auditoría; no hay reset destructivo, copia ni herencia de asignaciones.

## Tester → Reviewer

- `npm run lint` y `npm run build`: PASS. Sin dependencias nuevas; JS inicial
  488,33 kB, carga de tareas bajo demanda.
- `node --test tests/unit/*.test.mjs tests/backend/*.test.mjs`: 16/16 PASS.
- `npm run test:e2e -- tests/e2e/admin-own-tasks.spec.js --workers=1 --retries=0`:
  8/8 PASS. Autoasignación de rutina/urgencia, cumplimiento/pendiente, navegación
  a Auditoría, misma cuenta y rol, consultas por persona/fecha/vigencia,
  medianoche argentina e historial, errores de lectura/permisos y recuperación.
  Tema claro/oscuro a 375 px, color sage, teclado y Axe sin críticos/serios;
  capturas revisadas visualmente por Tester y Orquestador.
- `node scripts/admin-own-tasks-drill.mjs`: 20/20 assertions SQL PASS sobre
  PostgreSQL local con cadena de migraciones existente. Comprueba identidad
  del actor, autoasignación idempotente, cumplimiento/anulación, urgencias
  propias, rechazo ajeno/histórico, AAL2, RLS de empleados y retención. Rollback,
  mantenimiento original y eliminación del contenedor confirmados. Primera
  corrida corrigió únicamente un email del fixture sintético del runner.
- El arranque Playwright dentro del sandbox quedó detenido antes de ejecutar
  casos; se canceló y se ejecutó fuera de la restricción con Vite/Chromium
  locales. Docker también requirió acceso al pipe local. Sin escrituras de
  prueba remotas; E2E bloquea requests a Supabase de producción.

- `npm run test:e2e -- --workers=1 --retries=0`: 86/87 PASS (4,5 min).
  Único fallo: el caso de respuesta atrasada buscaba el texto anterior
  «Administración Administración». Se ajustó exclusivamente su selector exacto
  a «Administración (vos) Administración», sin cambios de aplicación.
- `npm run test:e2e -- tests/e2e/daily-audit.spec.js --grep 'al cambiar de persona' --workers=1 --retries=0 --reporter=list --output=test-results/selector-recheck`:
  1/1 PASS (7,2 s). Los 87 casos quedan verificados entre ambas corridas; no se
  afirma una única corrida completa verde. La revalidación conserva el reporte
  completo anterior y la evidencia del fallo corregido.

## Reviewer → Orquestador

Reviewer independiente aprueba el cambio completo después de las validaciones:
sin hallazgos accionables. Verificó UUID/rol administrativo, identidad derivada
del JWT, filtros personales/archivados, autoasignación, urgencias, progreso,
historial y límites de mocks frente al ensayo SQL. `git diff --check`: PASS.
Tester aprueba el gate general con los 87 casos verificados entre ambas corridas.

## Cierre del alcance puntual

Orquestador aprueba esta ampliación, con documentación sincronizada y sin
hallazgos bloqueantes/altos introducidos. No declara implementados los flujos
generales diferidos del roadmap. Se habilita commit/push expresamente solicitado
por el propietario hacia GitHub–Vercel, excluyendo los cambios locales previos
de configuración y variables de ejemplo. El resultado de la comprobación pública
del despliegue se informa al propietario en el cierre de la conversación.
No se efectuaron escrituras sobre datos reales ni cambios remotos de Supabase.
