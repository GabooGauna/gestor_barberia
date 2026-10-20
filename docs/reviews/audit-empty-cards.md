# Auditoría: tarjetas sin tareas vigentes — 20 de octubre de 2026

## Orquestador → Backend → Frontend

Etapa 5, corrección acotada solicitada por el propietario, con commit, push y
publicación mediante la integración GitHub–Vercel existente autorizados.
El código creaba una tarjeta incluso para un cumplimiento histórico anulado
sin asignación diaria; mostraba `Realizadas: 0 de 0`. También creaba una tarea
ficticia de presentación para asignaciones con `tarea_ids` vacío.

Decisión: actualizar la visibilidad anterior según la solicitud actual. Una
tarjeta necesita una tarea no inactiva (pendiente o completada válida). Las
rutinas vacías no generan filas. El detalle mixto conserva registros inactivos
y los indicadores mantienen evidencia histórica; ninguna fila se elimina.
Backend: no aplica implementación; contratos, consultas, Auth/RLS y RPC intactos.
Frontend: `CalendarioAuditoria.jsx` omite placeholders vacíos, filtra tarjetas
al finalizar la agrupación y ajusta el texto vacío a la nueva semántica.
Los estados sin verificar siguen visibles cuando falla la lectura de auditoría.

## Frontend → Tester

Archivo: `tests/e2e/daily-audit.spec.js`. Casos nuevos: sin registros, rutina
vacía, cumplimiento anulado sin asignación, asignación cancelada, urgencia
cancelada y fuentes inactivas combinadas. Se comprueban ausencia de tarjeta,
estado vacío y conservación de datos sin mutaciones. Dos casos comprueban que
una asignación vigente con cumplimiento anulado sigue pendiente o sin verificar
si falla auditoría. Los casos existentes se ajustan al ocultamiento de la última
tarea cancelada. El detalle mixto conserva anulados, rutinas homónimas, orden,
colores, temas, responsive y accesibilidad.

Entorno: Playwright local con Supabase interceptado en 127.0.0.1:54321 y bloqueo
de solicitudes de producción; sin pruebas sobre datos reales.
`npm run lint`: PASS. `npm run build`: PASS, con advertencia preexistente de
bundle >500 kB (538,10 kB; gzip 154,63 kB).
`npm run test:e2e -- --workers=2`: PASS, 77/77 en una corrida completa
(nueve casos nuevos), incluidos sesión, permisos, errores/reintentos, temas,
colores OFF/ON y accesibilidad/responsive. Primer intento dirigido en sandbox
interrumpido durante el arranque sin ejecutar pruebas por restricción de sockets;
la corrida completa autorizada fuera del sandbox sí ejecutó todos los casos.
Tester aprueba el alcance. Reviewer independiente aprueba sin hallazgos
accionables en `audit-empty-cards-review.md`. Orquestador acepta el gate de esta
corrección acotada; próxima acción: commit/push autorizados y verificar el
status Vercel del commit y el artefacto servido por el dominio público.

Se preserva y excluye del commit `.codex/config.toml`, cambio previo del usuario.
No se cierra toda Etapa 5 ni se inicia Etapa 6.
