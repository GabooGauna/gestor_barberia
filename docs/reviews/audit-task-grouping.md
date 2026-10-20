# Detalle de Auditoría por rutinas y emergencias — 20 de octubre de 2026

## Orquestador → Backend → Frontend

Solicitud: separar el detalle por rutina y diferenciar emergencias mediante
estructura y color; pruebas, commit y push autorizados. Alcance acotado de
Etapa 5, sin cierre completo ni inicio de Etapa 6.

Backend: no aplica implementación ni migración. Se reutilizan ID, título,
`orden` y color existentes, bajo consultas por fecha y RLS. `color` sólo se
solicita cuando la capacidad está habilitada. Sin operaciones sobre datos reales.

Frontend: `CalendarioAuditoria.jsx` agrupa por ID de rutina, ordena títulos en
español y tareas por `orden` con desempate descripción/ID. Los títulos duplicados
permanecen separados; el cumplimiento histórico sin asignación se integra por
ID. Datos sin relación usan grupo de respaldo. Rutinas vacías conservan aviso.
Los estados y la cancelación de urgencias no cambian. `index.css` reutiliza
tokens de ambas paletas: borde de rutina según color y bloque rojo con título
explícito para emergencias. Sin dependencias nuevas.

## Frontend → Tester

Estrategia: regresión completa Playwright con Supabase interceptado/local;
cuatro casos adicionales combinan tema claro/oscuro y capacidad OFF/ON,
rutinas homónimas, orden de tareas, registros históricos anulados, asignación
cancelada, rutina vacía, emergencias separadas y ausencia de mutaciones.
Cada caso comprueba responsive 375/1440 y axe sin hallazgos serios/críticos.
Las pruebas previas cubren vacío, error/reintento y cancelación accesible.

Validaciones: `npm run lint` y `npm run build` PASS. Build conserva advertencia
preexistente de bundle superior a 500 kB (538,74 kB / gzip 154,73 kB).
Playwright requiere ejecución fuera del sandbox por restricción local de sockets;
el intento inicial se interrumpió antes de ejecutar pruebas.

Primera ejecución completa: 61 PASS / 7 FAIL. Seis fallas provienen del selector
antiguo de Asignaciones y una del fixture hover que intentaba cancelar una
urgencia completada (acción correctamente ausente). Decisión de Orquestador:
actualizar sólo el título esperado y hacer pendiente esa urgencia únicamente en
el caso hover, para restaurar validación del contrato actual; sin ampliar cambios
funcionales. Archivo adicional: `tests/e2e/visual-accessibility.spec.js`.

Segunda ejecución completa `npm run test:e2e -- --workers=2`: 67 PASS / 1 FAIL
por timeout intermitente del caso previo de cambio de persona en Asignaciones
(la captura muestra regreso a Plantillas). El caso había pasado en la primera
corrida y pasa sin modificar código en `npm run test:e2e -- --last-failed
--workers=1`: 1 PASS. Tester aprueba este cambio con 68 casos verificados entre
la corrida y la reejecución; no afirma una corrida única 68/68. Riesgo residual:
flakiness de navegación del caso previo, fuera del alcance funcional.

Reviewer independiente aprueba el alcance acotado sin hallazgos bloqueantes,
altos ni medios introducidos. Dictamen en `audit-task-grouping-review.md`.
Orquestador acepta la entrega visual con las limitaciones de prueba descritas;
no declara cierre completo de Etapa 5. Próxima acción: commit/push autorizados.
Inspección visual de captura móvil oscura ON: bloques legibles,
rutinas identificadas por color y emergencias separadas, sin desbordamiento.

Se preserva el cambio preexistente del usuario en `.codex/config.toml`, excluido
del commit. Push podrá activar la integración GitHub–Vercel ya configurada;
esta intervención no certifica el despliegue resultante.
