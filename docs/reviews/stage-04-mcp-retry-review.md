# Revisión independiente del reintento MCP — Etapa 4

Fecha: 18 de octubre de 2026. Dictamen: **APROBADO el addendum documental y
la parada en el checkpoint de respaldo/configuración**. Las lecturas MCP ahora
funcionan. No se certifican los prerrequisitos del corte ni producción habilitada.
La autorización condicional y la aceptación del cambio propio por API siguen
vigentes; no corresponde volver a solicitarlas.

## Alcance y evidencia

Reviewer independiente del Orquestador autor de este reintento. Se revisaron
`stage-04-mcp-retry-2026-10-18.md`, las notas superiores de contexto/stage y
el enlace de actualización en `stage-04-deployment-attempt-2026-10-18.md`.
Se conservan contrato, runbooks y dictámenes previos, incluida la sustitución
del requisito de exclusividad en `../decisions/stage-04-native-auth-risk-acceptance.md`.

La evidencia de lecturas la entrega el Orquestador: inventarios de tablas,
migraciones y Edge, más SQL con transacción read-only, timeout y rollback.
Reviewer no ejecutó operaciones remotas ni repitió pruebas locales. El
diff-check documental informado pasó; no cambió runtime en esta reanudación.

## Coherencia del estado actualizado

El documento distingue correctamente la conexión MCP configurada con
`project_ref=ucmwykzrepmjucssjnum` de la ruta independiente de Management API.
La lectura informa PostgreSQL 17.6 y read-only activo. El rol `postgres` no se
presenta como prueba de permiso de escritura, y el ajuste opcional de ref SQL
ausente no se interpreta como fallo ni certificación extra de identidad.
Herramientas de cuenta no expuestas por un MCP acotado al proyecto tampoco
se tratan como denegación de acceso.

El baseline observado sigue siendo crítico: seis tablas con RLS/FORCE
desactivados y permisos anon; sin policies, expand, esquema privado, vínculo
Auth, funciones Edge o historia de migraciones registrada. Las FK CASCADE
legacy y la columna PIN permanecen, sin lectura de sus valores. No se afirma
que nunca hubiera DDL manual ni que ya se hubiera aplicado el candidato.

Los conteos exactos proceden de COUNT, no de estimaciones de list_tables.
El informe no deduce pérdida de datos de la diferencia y reconoce que, sin
quiescencia ni snapshot, son observaciones del momento. Los agregados sin
anomalías no se presentan como conciliación histórica ni preflight completo
de un corte todavía no ejecutado.

## Causa correcta de parada y siguiente gate

El MCP ofrecido no expone gestión de respaldo/restauración, configuración Auth
o secretos. Ese límite no demuestra inexistencia de backups ni falta de permisos
del proyecto. Los dos GET externos de backups y Auth devolvieron 403 por otra
ruta; su causa interna permanece desconocida. Por tanto es correcto **no atribuir
la parada a SQL inaccesible**.

Falta evidencia de backup completo bajo custodia, restauración integral del
proveedor/candidato, configuración segura y contención de todos los escritores.
Antes de escribir se necesita una ruta de gestión segura o intervención del
custodio que permita verificarlos. El inventario de respaldo debe cubrir schemas
existentes y registrar ausencias: `private` todavía no existe en el baseline,
pero debe incluirse en los checkpoints posteriores a expand y en el candidato.
No se crea un schema ni se consulta PIN para aparentar un respaldo completo.

También siguen pendientes primer admin/custodios y entrega privada, origen de
frontend, conciliación UUID/FK, ventana, antiabuso y RPO/RTO comprobables. El
orden expand → bootstrap/vínculos → conciliación/checkpoint → cutover → suplemento
→ Edge/frontend/MFA permanece condicionado a esos gates. Color queda fuera.

No se detectan nuevos hallazgos bloqueantes/altos en este cambio documental.
La exposición crítica legacy y los bloqueantes operativos persisten; la revisión
no los exceptúa. Es correcto detener antes de DDL, cuentas, mantenimiento,
configuración o despliegues. No hubo pruebas repetidas, backup/restore real o
escrituras que se puedan declarar aprobadas.

Handoff al Orquestador: continuar sólo con acceso/evidencia segura de gestión
y custodia, sin pedir secretos por chat ni renovar el permiso general ya
recibido. Al comprobar los gates puede retomarse el alcance autorizado con
sus checkpoints; ante discrepancias, decisión y reparación revisadas. No hay
habilitación de producción, push, `rutinas.color` ni Etapa 5 por este addendum.
