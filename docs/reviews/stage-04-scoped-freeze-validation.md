# Etapa 4 — Ensayo de congelamiento de negocio y Auth

18 de octubre de 2026. Preparación de la alternativa B aceptada por el propietario,
con exclusividad de operadores confirmada para la futura ventana. Decisión:
`../decisions/stage-04-scoped-cutover-rpo.md`. No hubo cambios remotos.

## Evidencia nueva

Backend implementó `scripts/stage04-cutover-freeze.mjs`. Ensayo sintético local
`node scripts/stage04-cutover-freeze.mjs`: **22 controles PASS, 6,13 s**, limpieza
exacta confirmada. No se repitieron suites anteriores de MFA, E2E o criptografía.

- Inventario actual de tablas lockables y dependencias FK antes y después de
  adquirir SHARE; PID y locks retenidos se verifican. Detecta incluso ROLLBACK
  accidental en el mismo backend.
- Drena un writer previo y exporta un snapshot que incluye su commit.
- INSERT bajo rol Auth no avanza su secuencia mientras espera. Escrituras del
  operador y ALTER sobre tabla existente quedan bloqueados.
- Cliente anon encolado antes de REVOKE termina con SQLSTATE 42501 después del
  COMMIT de expand; no agrega una fila al liberar locks.
- BEGIN original, prelude de freeze y continuación/COMMIT originales conservan
  todos los bytes de la migración. SHA original:
  `ae5be96cb0b1394785a3396a388a8d6ae1583681779333f961db52fa09d85095`.
- Cambios directos de secuencia, DDL nuevo y metadata managed provocan aborto;
  no se afirma que SHARE impida esos bypasses.
- Timeout y pérdida de sesión detienen el protocolo. COMMIT sin ACK queda
  `expand_outcome_unknown`, sin repetir la entrega; exige conciliación en lectura.

Caso focal adicional `node scripts/stage04-cutover-freeze.mjs --snapshot-only`:
**10 controles PASS, 5,10 s**, sin repetir los 22 anteriores. `pg_dump -Fc`
importa el snapshot desde otra conexión mientras el holder conserva sus locks;
el binario por RAM/pipe se restaura íntegro en `snapshot_clone` descartable.
Incluye al writer drenado, excluye al encolado y conserva Auth vacío. No se
persiste archivo en claro. Limpieza exacta confirmada; paging del host no excluido.

Root añadió opt-in `-ExportedSnapshot` al capturador existente. Los argumentos
predeterminados no cambian; el ID validado se pasa a pg_dump como argumento
separado. Manifiesto conserva freeze/RPO0/restore sin certificar automáticamente.
AST y pruebas puras de argumentos en PS5.1/7: default idéntico, snapshot presente
y tres entradas inválidas rechazadas PASS. No se ejecutó captura real.

## Observación remota, exclusivamente lectura

`supabase/inspections/stage04-cutover-drift.sql`: sintaxis PASS, 1355 registros
de catálogo y 156 filas de metadata managed observadas. Hashes server-side de
schemas/objetos/ACL/policies/funciones/roles, versiones Auth/Storage y metadata
vectorial; vistas/tipos/enums/reglas/event triggers incluidos. Sin filas de
negocio, PIN o runtime Auth ni contraseñas. Int8 de secuencias serializados como
texto; secuencia Auth last_value=1/is_called=false, cache=1. El consumidor debe
usar una conexión fresca separada; ROLLBACK de este archivo jamás va al holder.

`scripts/stage04-observe-control-plane.ps1`: dos observaciones GET con los cinco
hashes iguales (proyecto, AuthConfig, funciones, nombres y metadata de secretos).
Funciones 0, metadata de secretos 1; no se exportaron valores. AST/normalización
canónica/orden/array vacío/mutación PASS en PS5.1/7. GET no es prueba de freeze.

GUC de roles/base sólo se inventaría por nombres, no se comparan sus valores
secretos. El plano de control no queda congelado y dos hashes iguales no
descartan cambios intermedios/revertidos. Son límites explícitos del inventario.

Catálogo operativo adicional: postgres y supabase_auth_admin no son superusers;
postgres puede usar pg_signal_backend. No se ejecutaron cancelaciones remotas.
statement_timeout observado 2min; idle_in_transaction_session_timeout 0.

## Verificaciones finales focales de esta reanudación

`node scripts/stage04-auth-freeze-drill.mjs`: **PASS**, ejecutado por Root/Tester
en fixture fresca con GoTrue v2.197.0 real y Docker sin red externa/puertos/logs
persistentes. SHARE sobre 26 tablas runtime; refresh y Admin API create observados
esperando, sin cambios de usuarios/sesiones/refresh/secuencia. Se agotó el timeout
de los clientes; eso no se trató como drenaje. El operador NOSUPER con
pg_signal_backend/pg_monitor observó y terminó únicamente los backends exactos
pendientes, verificó finalización correlacionada de ambos handlers y cero TX/
esperas antes de desbloquear. GoTrue siguió vivo antes/después, sin escrituras
tardías durante cinco muestras en un segundo. Limpieza exacta confirmada.
Resultado acotado: no prueba universal de futuras peticiones ni equivalencia
remota; requiere ingreso/exclusividad durante la ventana. Sin cuentas reales,
secretstore o respaldos existentes.

Dos intentos previos se detuvieron conservadoramente en el verificador de logs:
faltaba consumir stderr y configurar REQUEST_ID_HEADER en la fixture. Se corrigió
la instrumentación sin omitir IDs exactos/completion/cero TX. La
[configuración v2.197.0](https://github.com/supabase/auth/blob/v2.197.0/internal/conf/configuration.go)
no asigna un default a ese header; el
[logger de esa versión](https://github.com/supabase/auth/blob/v2.197.0/internal/observability/logging.go)
usa formato JSON. Sólo se reejecutó el caso fallido, sin las suites aprobadas.

`scripts/stage04-cutover-supervision.mjs`: 13 casos con adaptadores sintéticos
PASS, Node syntax PASS, autor Backend. Cubren evidencia ligada al snapshot/
RunId/BackupId/hashes, observaciones seriales, cancelación durante capture/restore,
timeout, cancelación ignorada o cleanup no confirmado, restore fallido, rechazo
de booleano sin evidencia, COMMIT ambiguo y drift después de ACK. No equivalen
a matar procesos PowerShell/Docker reales; el caso focal Docker se registra abajo.

`node scripts/stage04-loss-cleanup-drill.mjs`: **PASS**, autor/ejecutor Backend,
exit0 en 3,28 s. Fixture `c208ff490ea12ae2c3264558670214c3`, supervisión
`234382da75b49077409aafc2cb3d230c`. Un pg_dump real importó el snapshot y quedó
esperando un lock sobre metadata excluida. Se terminó realmente el backend
holder; el supervisor abortó y canceló el lector. Se verificaron ausencia del
contenedor lector exacto, salida del proceso host docker-start y ausencia del
backend lector ligado a PID/application_name/backend_start, además del holder.
Worker finalizado, cleanup confirmado y cero llamadas a expand/restauración.
Ambos contenedores propios ausentes tras finally. Sin remoto, credenciales,
respaldos existentes ni archivo en claro; sin repetir 22/10/40.
Este caso cierra la primitiva local real de pérdida/cancelación/limpieza Docker;
no demuestra el árbol de procesos PowerShell ni un adaptador productivo integrado.

## Pendientes antes de ejecutar el corte

Actualización de integración: la credencial del primer administrador pasó la
validación local DPAPI, ACL y contrato de contraseña; no se creó la cuenta.
El nuevo observador post-expand (`stage04-expand-verification.mjs`) pasó once
casos SQL focales en una fixture PostgreSQL aislada, con limpieza exacta. Comprueba
columnas/default, cierre de grants de tabla/columna, funciones y sus propietarios,
search_path, schema privado, constraints/índices esperados y dos secuencias nuevas.
Rechazó grants anónimos, CREATE anónimo en private, ejecución administrativa por
authenticated, propietario no confiable y search_path inseguro. Reviewer cerró
el hallazgo medio de propietario/CREATE y aprobó este gate local acotado.
La integración debe confirmar current_user=postgres antes del chequeo relativo
de propietarios. No es equivalencia completa de cuerpos de funciones, predicados
de índices o definiciones de constraints; requiere bytes originales verificados,
exclusividad y los demás controles. No se repitieron suites históricas.

- Las dos verificaciones focales locales pasaron. La ejecución productiva debe
  usar la supervisión/cancelación/ledger demostrado y comprobar todos sus recursos
  propios. Un AbortSignal o matar PowerShell sin verificar hijos no basta. La
  integración local y sus pruebas focales ya fueron aprobadas; falta el punto
  de entrada concreto y el drenaje verificable en el destino.
- El caso HTTP Auth focal ya pasó localmente según la evidencia anterior;
  verificar sus condiciones en el destino durante la ventana. Los flags false
  históricos del ensayo SQL anterior se conservan, no se reescriben como HTTP.
- Usar el adaptador revisado de sesiones TLS/observaciones frescas/captura y
  restauración, con evidencia ligada al snapshot y validadores estrictos.
- Activar la exclusividad prometida y los controles de ingreso de la ventana;
  respaldo definitivo con el holder supervisado y restore correspondiente.
- Configuración/antiabuso, bootstrap con la credencial inicial ya validada y vinculación,
  aceptación real de Auth/RLS/Edge/MFA, recuperación y RTO del alcance acordado.

Reviewer aprobó la preparación local del protocolo/snapshot y la delta del
capturador, sin habilitar captura ni corte remotos. Dictamen independiente en
`stage-04-resume-supabase-review.md`. No se aplicó ninguna migración, no se creó
otro respaldo preparatorio real, ni usuarios, secretos o configuración remotos.
Color sigue separado y posterior; sin push, publicación ni Etapa 5.

## Integración del ejecutor: gates nuevos, sin corte remoto

El adaptador `stage04-cutover-runtime.ps1/.mjs` enlaza los módulos existentes;
importarlo no inicia el corte. Capture/restore admiten SupervisionRunId opcional,
sin cambiar sus defaults ni el respaldo preparatorio. La prueba nueva Windows
JobObject pasó (6,74 s; RunId ed73805fc9350a8d1386e741b8b75371): padre e hijo
asignados, pérdida del padre y job con cero procesos. No equivale por sí sola
a cancelación del worker real PostgreSQL/Docker.

Reviewer identificó un hallazgo alto: catálogo/secuencias no detectaban un
INSERT tardío en auth.users. La integración ahora exige inventario exacto de
26 tablas runtime y COUNT(*) textual cero en baseline, checkpoints, post-ACK
y después de la última lectura del plano de control, antes del bootstrap.
Error, inventario diferente o filas nuevas impiden continuar; tras COMMIT
requieren conciliación. Nueve contratos focales PASS; la consulta generada
se ejecutó por MCP en transacción READ ONLY y devolvió 26 conteos cero.
Sin payloads, PIN, tokens ni cambios remotos. Reviewer cerró el hallazgo de
código; esto complementa, no reemplaza, el drenaje de peticiones en el destino.

El fallo inicial de ACL quedó resuelto fijando el launcher PS7 verificado, sin
cambiar guards, permisos, credenciales ni CA. El nuevo transporte TLS read-only
pasó (4,44 s), JobObject PS7 pasó (7,19 s) y el worker restore real se canceló
mientras padre/contenedor estaban activos: Job0 y recursos exactos ausentes,
PASS (7,82 s; RunId 0faee69033877bf321ed0b5b3e62d5be). Se reutilizó el respaldo
original, sin recaptura, modificación del manifiesto o helper Auth. Los mismos
validadores de evidencia productivos pasaron 63 casos focales, incluido rechazo
de flags truthy y del manifiesto preparatorio sin SupervisionRunId. Reviewer
aprobó la preparación local. Estos ensayos no se repitieron.

## Drenaje en destino — actualización 19 de octubre

El GET Auth no mutante correlacionado con su finalización ya pasó; no se volvió
a ejecutar. Consulta nueva READ-ONLY de capacidad de logs, ventana 23 h:
events=6, starts=0, completions=6, with_request_id=6. Sólo agregados; sin mensajes,
datos personales, PIN, claves o tokens emitidos. No permite demostrar cero
handlers pendientes. Reviewer conserva el bloqueo operativo, aunque el código
y las pruebas locales estén aprobados.

Timeout HTTP no prueba fin del trabajo interno: DeadlineExceeded puede devolver
504 sin esperar serverDone en GoTrue v2.197.0. Alternativa mínima y texto de
consulta al proveedor en `../runbooks/stage-04-cutover-maintenance.md`: ciclo de
vida soportado sólo de Auth con terminación observable de workers anteriores,
o contador inflight fiable. No se ha confirmado su disponibilidad; no es una
operación ejecutada, un nuevo requisito de congelación total o una reducción
del RPO acordado. Ninguna migración/configuración/cuenta/despliegue remoto
ejecutado; sin respaldo definitivo nuevo. Color sigue posterior e independiente.
