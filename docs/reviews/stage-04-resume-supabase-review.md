# Etapa 4 — Revisión independiente de reanudación Supabase

18 de octubre de 2026. Alcance inicial: intake local del token de gestión;
sin aprobar cambios remotos ni nuevos ensayos de datos reales.

**APROBADO scripts/stage04-store-management-token.ps1 para ejecución manual
del propietario.** Reviewer leyó el capturador y las definiciones reutilizadas
del helper DPAPI/ACL aprobado. Sin hallazgos bloqueantes/altos nuevos para
esta captura. No se ejecutó el script ni se abrió un almacén real en la revisión.

El script rechaza argumentos y plataformas distintas de Windows. Importa
sólo funciones AST, sin ejecutar el cuerpo del capturador PostgreSQL. Exige
directorios previamente protegidos, usuario custodio distinto de SYSTEM y
destino fijo LocalAppData fuera del repositorio/OneDrive, sin reparse points.
CreateNew rechaza un archivo previo; aplica ACL usuario/SYSTEM antes de
exportar. La entrada manual oculta sigue siendo SecureString y Export-Clixml
usa DPAPI del usuario Windows. Reimporta para comprobar tipo/estructura y
longitud; no construye texto claro, argumentos de proceso ni variables de
entorno con el PAT. Libera SecureStrings y limpia su archivo incompleto cuando
puede, con aviso genérico si no se logra. No hay llamadas de red ni cambios
en cuentas, configuración Supabase o secretos remotos.

Orquestador entregó AST PowerShell 5.1/7 y roundtrip sintético de la nueva
estructura CLIXML/SecureString: PASS, sin texto claro en archivo y con cleanup.
Reviewer conserva esa evidencia sin repetirla. Estas pruebas no son una
captura humana integral ni certifican validez, permisos, identidad de cuenta
o alcance de proyecto del token futuro. DPAPI depende del usuario/equipo;
no constituye custodia portable. La ejecución humana debe realizarse con el
mismo SID fuera de AppContainer, sin ampliar las ACL.

La captura permite preparar una lectura de gestión posterior; esa lectura
requiere validar propósito/proyecto/ACL al importar y proteger el token en
memoria. Guardarlo no habilita escrituras de Auth, migraciones o despliegues.
Los 403 comunicados por Orquestador expresan privilegios insuficientes según
el proveedor; no determinan por sí solos si la causa concreta es cuenta,
rol, scopes o una combinación. No se solicita nuevamente autorización
genérica de despliegue ni se da por resuelto su gate técnico.

Se conservan restore SQL y suites ya aprobados. Recuperación integral Auth,
DATABASE/ACL/settings, configuración de seguridad y contención integral/RPO0
siguen necesitando evidencia; dominio público o variables Vercel declaradas
no la sustituyen. No push, publicación, producción habilitada ni Etapa 5 por
este dictamen. Color conserva su orden independiente después de Auth validada.

## Handoff documental y delta DATABASE

Reviewer leyó `stage-04-supabase-resume.md` y
`../runbooks/stage-04-management-access.md`. La matriz PAT se atribuye a la
verificación oficial entregada por Orquestador: Auth Config write depende de
Project Settings write. El runbook distingue capacidad de autorización,
restringe proyecto/vencimiento y exige primero GET; esos scopes no autorizan
borrar, pausar o recrear proyectos. No se afirma haber inspeccionado las
variables Vercel ni que GET 200 equivalga a validar login/MFA/RLS.

La precisión de catálogo reemplaza la anterior agregación de cobertura por
schema: faltan privilegios SHARE en cuatro tablas identificadas, no en todas
las tablas runtime Auth. No se ejecutaron locks. Runtime vacío observado en
origen no prueba que el archivo tenga idéntico estado ni contención integral.

**APROBADO un ensayo local adicional opt-in `-VerifyDatabaseMetadata` del mismo
BackupId `ab70bce0fa53469f8f8659c4564970ba`.** Reviewer inspeccionó la delta de
stage04-isolated-restore.ps1 tras evidencia Backend: AST PowerShell 5.1/7 PASS,
selector TOC positivo y rechazo de DATABASE faltante, identidad ajena y
DATABASE duplicada. No se usaron archivo/clave reales en esos tests.

La selección exacta exige DATABASE postgres con owner postgres y permite sus
entradas DATABASE PROPERTIES/ACL/COMMENT/SECURITY LABEL, nunca TABLE DATA.
La lista temporal contiene sólo identificadores metadata en tmpfs del recinto
aprobado. Se crea una DB control local para ejecutar pg_restore --create/clean
de esa metadata fuera de transacción; después se conserva el replay completo
de objetos/datos en una transacción. No hay conexión al origen en el script,
adaptación nueva de roles ni cambio del archivo cifrado.

Get-DatabaseMetadataCatalogSql permite comparación fuente/clone de propiedades,
owner, locale/versiones de collation, ACL efectiva normalizada y hashes de
settings sin valores en claro. Su resultado no equivale a comparación exitosa:
el reporte mantiene flags de comparación/propiedades verificados en false.
Toda diferencia, incluidas versiones efectivas de collation, debe registrarse
y resolverse explícitamente; no se permite omitirla para cerrar el gate.

No hay bloqueantes/altos nuevos para ese ensayo aislado. Es validación nueva
del gate DATABASE pendiente, no repetición gratuita de suites aprobadas.
Cleanup y hashes/GCM previos se conservan; resultado real y comparación siguen
pendientes. No se aprueba todavía recuperación GoTrue ni escrituras remotas.

## Addendum — inventario diagnóstico sin replay

El ensayo opt-in DATABASE se detuvo en validate_archived_database_metadata,
con cleanup sin fallo informado; no demostró recuperación DATABASE. Se preserva
el restore SQL aprobado anterior sin atribuir este fallo a pérdida del archivo.

**APROBADO `-InspectDatabaseMetadata` del mismo BackupId como diagnóstico TOC
exclusivamente.** Reviewer inspeccionó el candidato tras recibir AST 5.1/7,
cuatro casos sintéticos de inventario y tres rechazos de diagnósticos no
permitidos PASS. La rama ejecuta pg_restore --list sobre bytes autenticados y
sale del flujo antes de importar roles o ejecutar SQL del archivo. No imprime
TOC, SQL o nombres inesperados: devuelve causas enumeradas y cuatro conteos.
Inspección y replay son mutuamente excluyentes. El reporte identifica inventory
y deja recuperación DATABASE/Auth en false; sólo se guarda tras cleanup.

El diagnóstico añadido al modo replay conserva Exception.Data y catch final
con protocolo allowlist de causas/conteos; no vuelca texto de excepciones ni
habilita correcciones según sus resultados. Aislamiento, hashes/GCM y limpieza
de memoria se mantienen. No hay hallazgos bloqueantes/altos nuevos para este
inventario. Reviewer no repitió ensayos ni abrió archivos protegidos.

Orquestador comunicó después acceso de gestión GET 200 con el PAT guardado:
identidad confirmada por project_ref, Auth y backups accesibles. Esto supera
el bloqueo de acceso 403 para esas lecturas; no certifica todavía configuración
segura, freeze ni autorización técnica de escribir. La captura opaca de config
Auth propuesta y cualquier nueva receta de recuperación requieren sus revisiones
previas específicas; no quedan aprobadas por este inventario.

## Addendum — suplemento opaco de configuración Auth

**APROBADO stage04-capture-auth-config.ps1 para captura GET y almacenamiento
local cifrado del proyecto fijo**, antes de cambios Auth. Reviewer inspeccionó
el script tras AST PowerShell 5.1/7 PASS entregado por Orquestador y la evidencia
previa de roundtrip sintético del patrón SecureString/CLIXML. No ejecutó captura
real ni reimportó secretos para esta revisión.

Se validan SID, ACL/rutas sin reparse, propósito/ref del PAT y project.id
devuelto. Sólo realiza GET de proyecto y config/auth; no importa credencial DB,
clave o archivo del respaldo. Serializa Project/AuthConfig/ObservedUtc, nunca
el header Authorization ni el PAT. JSON pasa a SecureString y CLIXML DPAPI del
custodio, en suplemento GUID dentro del directorio protegido del mismo backup,
con CreateNew, ACL explícita y sin sobrescribir. La salida se limita a ubicación,
identificador, fecha, tamaño/hash y flags; los errores crudos se suprimen.

La verificación de reimportación comprueba estructura/tipo/longitud y metadata,
no ejecuta restauración ni demuestra fidelidad funcional de todos los ajustes.
SameSnapshotAsDatabase=false y ConfigurationRestoreVerified=false son correctos:
es suplemento posterior, no otra captura DB ni snapshot atómico. Los strings
transitorios .NET, incluido el PAT usado por HTTP, no admiten promesa de
zeroización completa de memoria; no se escriben en claro ni en logs por el
script. Se mantiene confianza en el equipo/custodio y límite DPAPI usuario/host.

No hay hallazgos bloqueantes/altos nuevos para esa captura. No autoriza PATCH
Auth, creación de cuentas, migraciones ni despliegue; dichos pasos conservan
los gates de recuperación/contención y revisión del candidato.

## Corrección de inventario — listado con create

Backend identificó y reprodujo con PostgreSQL real sintético que pg_restore
--list filtra entradas DATABASE/PROPERTIES/ACL si no se selecciona --create.
Por ello, cero entradas en el inventario anterior **no prueba ausencia de
metadata en el archivo**. Queda retirada esa posible interpretación, sin
alterar el restore SQL aprobado ni afirmar pérdida del respaldo.

**APROBADO únicamente otro `-InspectDatabaseMetadata` del mismo BackupId con
`--list --create`.** Reviewer verificó que esta delta sólo cambia la selección
del listado en esa rama, sin ejecutar comandos SQL del archivo; el diagnóstico
continúa antes del replay. El modo suplemento permanece excluido y no lee su
archivo en Inspect. Se recibió fixture real sintético 2/2: archivos custom con
y sin create al capturar muestran DATABASE 1/PROPERTIES 1/ACL 1 al listar con
create, con cleanup confirmado y AST 5.1/7 PASS. No se repitieron estas pruebas.

Sin bloqueantes/altos nuevos para ese inventario. El candidato de reconstrucción
suplementaria y cualquier integración Auth quedan fuera de esta aprobación;
la metadata original debe inventariarse correctamente antes de decidir si
hace falta una receta alternativa. No recuperación integral ni escrituras
remotas aprobadas por este addendum.

## Addendum — ensayo combinado metadata y Auth sobre clone

Orquestador entregó inventario real corregido
`89656de8374049f897e12ec355790b41`: DATABASE 1, PROPERTIES 1, ACL 1,
identidad inesperada 0, hashes/GCM y cleanup PASS, SQL del archivo no ejecutado.
La metadata está en el original. Se retiró la reconstrucción suplementaria
innecesaria; la observación posterior sólo participa en comparación.

**APROBADO un ensayo combinado aislado del mismo BackupId con
`-VerifyDatabaseMetadata`, hash explícito de observación y `-VerifyRestoredAuth`.**
No autoriza ejecución remota, nuevos backups ni modificación de cuentas reales.
Reviewer inspeccionó el padre actual y stage04-auth-restore-probe.mjs después
del handoff final de sus autores. Evidencia recibida: AST PS5.1/7, guards
negativos PS5.1 ejecutados antes de IO 2/2, comparación negativa 4/4, TOC real
sintético/selector 2/2 con cleanup, node --check y contrato helper 5 casos PASS.
No se repitieron pruebas ni se abrieron artefactos/credenciales reales.

La metadata original se restaura fuera de la transacción completa; luego se
carga el archivo completo y se compara estrictamente contra la observación
validada por SHA, ACL, formato, proyecto y BackupId. La comparación incluye
owner/ACL/settings y versiones de collation, sin valores secretos emitidos.
No permite reconstrucción silenciosa a partir de la observación. Comparar
con esa observación posterior no acredita estado exacto del instante de captura.

Auth sólo arranca después del replay y comparación DATABASE. El helper exige
imagen PostgreSQL fijada, recinto local sin red/puertos/binds/logs persistentes,
82 migraciones con fingerprint esperado y las 26 tablas runtime vacías. El
opt-in abre PostgreSQL únicamente en 127.0.0.1 del namespace aislado, con regla
SCRAM para supabase_auth_admin/postgres/127.0.0.1/32. GoTrue fijado comparte ese
namespace, escucha loopback y recibe claves nuevas en RAM/config tmpfs; headers
HTTP/curl y password de rol viajan por stdin, sin argumentos/env persistidos
en la definición del contenedor. No usa claves productivas ni credencial DB.

Los escenarios previstos cubren rechazo signup/login email en configuración
local cerrada, creación sintética Admin API, login/refresh y continuidad de esa
identidad tras recrear GoTrue con su misma clave local, junto a fingerprint
de migraciones y UUID/FK de negocio inalterados. Ese rechazo no demuestra
contención de service_role, todos los endpoints, jobs ni plano de control.
El cambio de password del rol Auth sólo ocurre en el clone desechable.

El padre valida el resultado estructurado; cleanup exacto Auth antecede al DB
y se vuelve a comprobar aun si el helper termina abruptamente. Los PASS sólo
se escriben tras cleanup. Se conserva el límite de paging del host. El helper
fija Docker Desktop Linux local; otro endpoint admitido por el padre puede
detenerse de forma cerrada, sin ampliar destinos para resolverlo.

Sin hallazgos bloqueantes/altos nuevos para este ensayo. Un eventual éxito
acreditará únicamente baseline Auth vacío restaurado, nuevas claves locales y
cuenta sintética. No continuidad de JWT/claves originales, recuperación de
factores/cuentas preexistentes, configuración real restaurada, todo Supabase,
RPO 0 o RTO integral. El resultado real y gates restantes siguen pendientes.

### Corrección acotada del parser de observación

El intento combinado se detuvo antes de leer el respaldo/arrancar Docker:
PowerShell 7 convirtió la fecha ISO JSON en DateTime, incompatible con el
contrato string; hash e identidad de la observación eran correctos según la
inspección acotada del Orquestador. No hubo resultado de restore adicional.

Reviewer inspeccionó ConvertFrom-MetadataObservationJson: solicita DateKind
String cuando el comando dispone de esa opción y conserva el parser habitual
en PS5.1. No relaja hash, identidad, bool/snapshot o fecha requeridos. Backend
entregó AST y fixture de fecha exacta/string, bool y versión PASS en PS7.6.5 y
Windows PS5.1.26100, sin datos reales. **Aprobada esta delta mínima y la
continuación del mismo ensayo combinado aislado**; no se repitieron pruebas
ni se amplía la aprobación a producción.

## Dictamen del resultado combinado y mantenimiento pendiente

**APROBADO el resultado acotado del ensayo combinado** informado por
Orquestador, DrillId `d70d6eb157644b8eb72825283e94a610`, reporte UTC
2026-10-18T16:15:02.9646725Z. Hashes/GCM/replay completo/cleanup Auth y DB PASS.
Metadata DATABASE recuperada del archivo original, sin reconstrucción: owner,
diez ACL, hash de settings y locale/ICU efectiva 153.121 coinciden con la
observación posterior. Catálogo y agregados de roles coinciden con el reporte
previo conciliado `61ead80090684621b20e695466d4a16f`.

GoTrue v2.197.0 arrancó sobre el baseline restaurado: 26 tablas runtime vacías,
82 migraciones/fingerprint inalterados; rechazo signup/login email cerrado,
cuenta sintética Admin API, login/refresh y refresh tras recrear Auth con su
misma clave local PASS. UUID/FK de negocio inalterados. No se utilizaron cuentas
ni claves reales. Esto cierra la comprobación local DATABASE y el arranque
funcional del baseline Auth vacío, sin probar JWT/claves/factores originales,
restauración efectiva de configuración remota o plataforma completa.

Reviewer leyó la evidencia documentada en stage-04-supabase-resume, el contexto
vigente y stage-04-cutover-maintenance. Revisa la evidencia entregada, sin
ejecutar un segundo ensayo ni acceder al archivo/clave. Se conservan las suites
anteriores, sin repetición. La captura opaca Auth no se considera restore de
configuración ensayado y la duración del drill no es RTO integral.

**Permanece el bloqueante operativo del corte: suspensión literal de TODOS
los escritores y RPO 0 no demostrados.** Las cuatro tablas administradas sin
locks y el plano de control/roles/configuración impiden certificar la receta
actual. Ni flags de login/signup, runtime vacío ni igualdad de hashes antes/
después prueban ausencia de escrituras intermedias o privilegiadas.

El nuevo runbook no relaja ese requisito silenciosamente. Alternativa A
conserva el alcance vigente y exige un mecanismo soportado cuya disponibilidad
aún no está demostrada. Alternativa B es una propuesta de cambiar explícitamente
el alcance de RPO 0 a negocio/runtime Auth y tratar metadata administrada con
drift/aborto; requiere decisión del propietario, implementación y ensayo.
No queda aceptada por el dictamen ni por la autorización anterior de despliegue.
Su futura revisión debe comprobar dependencias/escritores, secuencias/DDL y
transferencia sin ventana entre locks y mantenimiento, además de evitar
confundir detección de cambios con prevención.

Sin hallazgos bloqueantes/altos nuevos introducidos por la documentación o el
ensayo aprobado. Los gates operativos pendientes siguen bloqueando el despliegue:
contención y backup definitivo del corte, configuración/antiabuso, primer
administrador y aceptación real de MFA/RLS/Edge, recuperación y RTO del alcance
acordado. No se conceden permisos nuevos de escritura, no producción habilitada,
no push/publicación ni Etapa 5. Color continúa posterior e independiente.

## Decisión posterior — RPO acotado aprobado para ensayo

El propietario eligió expresamente preparar y ensayar RPO 0 para negocio y
Auth, aceptando el alcance limitado sobre metadata interna. Reviewer leyó
`../decisions/stage-04-scoped-cutover-rpo.md` y los encabezados vigentes de
contexto, auth-cutover, security-controls y mantenimiento. **Aprobada la
formulación documental de ese alcance**, sin hallazgos nuevos: alternativa B
ya está elegida para implementar/ensayar y la alternativa A queda de referencia.
Sustituye la exigencia anterior de congelar literalmente todo el proveedor;
el dictamen histórico anterior conserva su contexto y no prevalece sobre esta
decisión explícita posterior.

La aceptación no prueba el procedimiento ni satisface el gate de corte.
Negocio y runtime Auth deben permanecer congelados mediante drenaje, bloqueo
supervisado y transferencia sin ventana hacia mantenimiento fail-closed,
con respaldo definitivo verificable. Metadata/plano de control quedan sujetos
a drift/aborto y al riesgo explícito de cambios intermedios no observables;
no se promete RPO 0 de ese estado interno. Secuencias, dependencias, DDL,
objetos nuevos y escritores privilegiados requieren resolver su tratamiento
antes de certificar RPO del alcance acordado, sin asumir cobertura por locks
de tabla. Se conservan recuperación, antiabuso, UUID/históricos y validación
real de administrador/MFA/RLS/Edge; ningún gate satisfecho por consentimiento.

La implementación y sus nuevas pruebas afectadas requieren handoff/revisión
independiente posterior. Reviewer no repitió pruebas aprobadas ni consultó
remoto/secretos. Esta revisión documental no aprueba un protocolo todavía
no implementado, nuevas escrituras, push/publicación ni Etapa 5.

### Inspección de drift candidata

**Aprobada la ejecución MCP exclusivamente read-only de
supabase/inspections/stage04-cutover-drift.sql** para validar sintaxis y obtener
la observación delimitada. Reviewer inspeccionó BEGIN READ ONLY, timeout local
15 s, search_path pg_catalog y ROLLBACK. La salida son conteos/hashes server-side
de catálogos y cuatro tablas de metadata administrada, más observaciones de
secuencias; no filas de negocio/runtime Auth ni valores PIN/password/tokens.
pg_roles no incluye contraseñas. Valores role/database GUC no salen: sólo
nombres; definiciones de función/proconfig se incorporan al hash opaco.

No es fingerprint exhaustivo de todo objeto/estado PostgreSQL: entre otros,
no incluye texto de views vía pg_get_viewdef ni definiciones de tipos/enum o
large objects. pg_sequences last_value puede ser null por permisos y no
demuestra is_called, agotamiento del cache o ausencia de nextval concurrente.
Esas limitaciones requieren inventario/control del protocolo, sin presentar
esta consulta como garantía de detectar todo DDL. configuración Auth/plano de
control requiere observación separada protegida.

Los flags configuration_values_compared=false/provider_writers_frozen=false
son correctos. Igualdad sólo acredita ausencia de diferencias en lo observado;
no suspensión ni aceptación de la captura/protocolo. Sin pruebas previas
repetidas ni lecturas remotas realizadas por Reviewer.

### Observación opaca del plano de control

**Aprobado stage04-observe-control-plane.ps1 para observación real GET-only**
del proyecto fijo, sin nuevos archivos, captura DB o modificaciones remotas.
Reviewer inspeccionó el script tras recibir AST y tres comprobaciones focales
de orden estable, array vacío/null y mutación PASS en PS7 y PS5.1. El comando
PS5 inicialmente mal citado fue descartado; no se atribuye PASS a ese intento.
Reviewer no repitió las pruebas ni importó el PAT.

El script valida almacén/ACL/SID/propósito/ref, identidad y salud antes de
consultar Auth/functions/secrets. Serialización canónica ordena claves ordinales
y conserva arrays/null; sólo se emiten hashes, conteos, fecha y flags. Headers,
configuración Auth y metadata de secretos permanecen en memoria y errores
crudos se suprimen. Comparaciones deben usar la misma versión/runtime y
contrato: variaciones de representación/listas pueden producir aborto por
diferencia, sin interpretarse automáticamente como alteración real.

SecretValueRecoveryVerified=false y RoleGucValuesCompared=false delimitan
correctamente la observación. No sustituye recovery de valores secretos ni
congelación del plano de control. Se conserva la confianza en el custodio/equipo
y el límite de strings transitorios .NET no zeroizables. Sin hallazgos nuevos
para esa lectura; protocolo freeze y aceptación de RPO siguen pendientes.

### Ampliación del inventario y estabilidad del comparador

**Aprobada la lectura final del SQL drift ampliado y una segunda observación
GET-only del comparador ya revisado.** La delta inspeccionada conserva READ ONLY,
timeout y rollback; añade viewdef, tipos/enum, reglas/event triggers y schemas
no sistema al hash opaco. Los vacíos concretos anteriores de views/tipos quedan
ampliados, sin declarar inventario físico exhaustivo ni incluir payload de
large objects o valores GUC de rol/base.

Los int8 de pg_sequences se proyectan como texto para evitar redondeo en JSON/JS.
SELECT explícito sobre auth.refresh_tokens_id_seq añade last_value/is_called
y permiso SELECT del operador, sin nextval/setval. No demuestra por sí solo
flush de cache ni suspensión concurrente. Orquestador entregó primera lectura
SQL PASS y primera observación control-plane GET-only PASS (functions 0 y una
metadata de secreto), sin valores exportados. La segunda observación sólo
validará estabilidad de las representaciones comparadas; hashes iguales no
certifican quiescencia. No se aprueba freeze ni corte por estas lecturas.

### Capturador candidato con snapshot exportado

**Aprobada la delta local de stage04-encrypted-backup.ps1** que incorpora
`-ExportedSnapshot`. Reviewer inspeccionó su validación hex-hex-decimal y
construcción de argumentos separados `--snapshot`, sin shell. Sin opción se
conserva la secuencia de argumentos pg_dump anterior; no cambia cifrado,
DPAPI, CA/TLS ni el export separado de roles. El manifiesto sólo añade snapshot
y SnapshotHolderVerifiedByThisScript=false en opt-in; freeze/RPO0/restore
siguen false. No se certifica liveness del holder por recibir su identificador.

Orquestador entregó AST y casos puros de default idéntico, snapshot preservado
y tres entradas inválidas rechazadas PASS en PS5.1/7, sin captura real. No se
repiten esas comprobaciones ni las pruebas crypto/backup previas. El ensayo
nuevo de pg_dump desde conexión separada importando el snapshot y su restore,
el handoff final del protocolo y la atestación operativa de exclusividad
todavía son pendientes; esta revisión no habilita captura/corte remoto.

## Revisión del protocolo local RPO acotado

**Aprobada la preparación local del módulo stage04-cutover-freeze.mjs y su
integración candidata de snapshot exportado. No aprobada todavía ejecución
remota de captura/corte.** Reviewer leyó el módulo actual, la decisión del
propietario y la evidencia entregada; no ejecutó nuevas pruebas ni abrió
artefactos/credenciales. La exclusividad SQL/DDL/nextval/setval ya confirmada
por el propietario es prerrequisito operativo para la futura ventana, no
prevención técnica que se atribuya a SHARE.

Evidencia Backend: 22 comprobaciones del nuevo protocolo, 6,13 s, PASS con
cleanup; después, diez comprobaciones focales de la nueva rama --snapshot-only,
5,10 s, PASS con cleanup. La segunda prueba importa el snapshot desde otra
conexión con pg_dump custom en RAM y restaura íntegramente en otra DB sintética:
incluye writer drenado y excluye el writer en espera/Auth rows, conservando
holder y locks durante capture/restore. No se repiten las 22 pruebas, suites
crypto/MFA/E2E o el backup real; no se presenta la evidencia como una segunda
ejecución completa del archivo actualizado. Paging del host sigue sin excluirse.

El módulo exige atestaciones explícitas, inventario lockable y dependencias FK
cubiertas; verifica mismo PID y locks otorgados antes de cada checkpoint. Usa
BEGIN original de expand, añade prelude de locks/timeout y retiene exactamente
el cuerpo/COMMIT originales para la transición en esa misma transacción.
SHA de expand aprobado entregado: ae5be96cb0b1394785a3396a388a8d6ae1583681779333f961db52fa09d85095.
El export de snapshot se mantiene mientras la sesión conserva sus locks.
Observe requiere fingerprints válidos y señal explícita de writer desconocido;
el adaptador debe consultar desde conexión separada/fresca, nunca ejecutar un
SQL con ROLLBACK sobre el holder.

Las pruebas distinguen prevención de DML/ALTER existente y drenaje frente a
bypasses nextval/setval/CREATE nuevo, que sólo se detectan/abordan con
exclusividad. Writer anon ya encolado antes de REVOKE fue denegado después del
COMMIT sin escritura. Drift, writer desconocido, timeout, pérdida de sesión
y ROLLBACK accidental abortan. COMMIT real con ACK perdido queda
expand_outcome_unknown/committed=null y requiere conciliación, sin redelivery
ni bootstrap automático. Postcommit drift conserva cierre y estado de incidente.

Antes de captura/corte real faltan adaptador/orquestación revisados con binding
de proyecto/migración/holder, vigilancia y cancelación de trabajo si se pierde
el holder, sesión/fingerprints frescos y verificación explícita del respaldo
definitivo restaurado antes de continuarExpand. checkpointVerified=true es una
atestación del caller, no verifica por sí solo captura/restauración. El CLI del
módulo es sintético, sin credenciales ni ejecutor remoto: no usarlo como prueba
de readiness del origen. AuthHttpDuringFreezeTested=false se conserva: falta
resolver/ensayar comportamiento de peticiones Auth encoladas y entradas
cerradas durante la ventana, sin suponer cobertura HTTP por un INSERT SQL.
También siguen configuración/antiabuso, primer admin y aceptación real MFA/RLS/
Edge, recuperación y RTO del alcance acordado. No color, push ni publicación.

Hallazgo documental medio comunicado al Orquestador: el informe resume aún
contenía la alternativa B como no aceptada y la suspensión literal como gate
vigente, y el runbook no registraba todavía las subpruebas 22+10. Debe
sincronizarse el estado con B/exclusividad aprobadas y módulo sintético
verificado, manteniendo integración/operación remota pendientes. No requiere
repetir pruebas aprobadas; esta revisión no acepta un waiver silencioso.

### Revisión previa de ensayo HTTP Auth en ventana

**Aprobado stage04-auth-freeze-drill.mjs exclusivamente para fixture sintético
focal.** Reviewer inspeccionó el candidato estable tras node --check PASS;
todavía no hay resultado de ejecución. No utiliza respaldo existente,
credenciales, cuenta real o endpoints remotos, ni repite suites 22/10/40.

Imágenes PG/GoTrue fijadas, namespace de red none compartido sin puertos/binds,
logs none y config tmpfs. GoTrue permanece vivo antes y después de liberar
locks. Credentials/cuenta son sintéticas y sólo RAM. Adjunta stdout vivo de
Auth en memoria, sin persistir/imprimir logs: consume marcadores request-id
de finalización de sus dos requests sintéticos. Nunca usa timeout curl como
prueba de drenaje.

La fixture reproduce postgres NOSUPER con pg_signal_backend/pg_monitor,
observa exactamente dos backends Auth/appname propios esperando locks,
termina sólo esos PID si siguen presentes y exige fin de ambos handlers,
ausencia de transacciones/waits y snapshot Auth inalterado antes de unlock.
Después realiza cinco observaciones durante un segundo con servicio vivo.
El reporte acota esa ventana y mantiene remoteEquivalenceVerified/RPO0 false.
No demuestra ausencia universal de writers, señales remotas equivalentes o
futuras peticiones; éstas conservan su integración/gate antes del corte.

Sin hallazgos bloqueantes/altos nuevos para ese ensayo. No se aprueba por esta
revisión señalizar backends remotos o relajar los requisitos del supervisor.

El hallazgo documental medio anterior queda resuelto: Reviewer confirmó los
encabezados/estado corregidos de resume y mantenimiento, y el nuevo informe
stage-04-scoped-freeze-validation registra B/exclusividad aceptadas, subpruebas
22+10 y límites de integración real. La suspensión literal quedó marcada como
histórica; no se requiere volver a consultar esa decisión al propietario.

### Resultado HTTP y supervisor candidato

Reviewer acepta el **PASS local acotado del ensayo HTTP Auth** entregado por
Root/Tester y registrado en scoped-freeze-validation. Se revisaron las deltas
finales: stdout y stderr del logger sólo en RAM, REQUEST_ID_HEADER explícito
de fixture y fases diagnósticas. Se conservan correlación exacta, fin de ambos
handlers, cero TX/waits antes de unlock y observación de cinco muestras/1 s
con GoTrue vivo. Dos fallos previos de instrumentación quedan documentados;
no se les atribuye PASS ni se eliminaron gates para obtenerlo. No se repitió
ninguna suite anterior o ensayo en esta revisión.

También se inspeccionó CutoverSupervision después de 13 casos mock PASS y
node --check entregados por Backend. **Aprobada su preparación local**, sin
ejecutor remoto. Serializa checkpoints, liga evidencia estructurada al RunId,
proyecto, snapshot, BackupId y hashes; rechaza booleano como restore. Señal de
aborto cancela workers y exige settlement más prueba explícita de ausencia de
recursos propios; promesa terminada o parent muerto no bastan. Cleanup no
confirmado nunca continúa expand. ACK ambiguo se propaga sin retry; error/drift
control-plane después de ACK requiere conciliación, sin declararlo rollback.

El contrato confía en adaptadores honestos que implementen esos controles y
el ledger completo de recursos; no verifica por magia el disco o procesos de
una función inyectada. remoteAdapterReady=false es correcto. La verificación
focal de pérdida real de holder y cancelación/limpieza de proceso/contendor
owned sigue pendiente antes del dictamen conjunto; mocks no la sustituyen.
No nuevas escrituras ni captura remota aprobadas.

## Dictamen final de las dos verificaciones focales

**APROBADAS ambas verificaciones locales pendientes:** Auth HTTP bajo bloqueo
y pérdida real del holder con cancelación/limpieza Docker. Sin hallazgos
bloqueantes/altos nuevos en ese alcance. Reviewer leyó los candidatos finales,
la coordinación y scoped-freeze-validation; no repitió ejecuciones ni consultó
remoto, backups o secretos. Los pendientes históricos HTTP/local-cleanup de
este dictamen quedan cerrados por esta evidencia, con los límites siguientes.

El caso Auth HTTP conserva el PASS acotado descrito arriba: servicio vivo,
handlers correlacionados finalizados, cero TX/waits antes de desbloquear y
snapshot inalterado/no latewrites observado durante un segundo. Sigue sin
demostrar equivalencia del proveedor real ni ausencia universal de requests.

Backend entregó node --check y una ejecución real local de
stage04-loss-cleanup-drill.mjs, exit 0/3,28 s. FixtureRunId
c208ff490ea12ae2c3264558670214c3 y supervisionRunId
234382da75b49077409aafc2cb3d230c. pg_dump real quedó esperando metadata
excluida y se terminó el backend holder real. El supervisor abortó, el worker
finalizó y se verificaron contenedor lector exacto ausente, salida del proceso
host docker-start y backend lector ausente, ligado a application_name, PID y
backend_start. También holder ausente, cero expand/restore y ambos contenedores
propios ausentes tras finally. No se escribió dump en claro ni se abrieron
artefactos existentes; no se repitieron 22/10/40/13 ni suites previas.

Esta prueba cierra la primitiva local real Docker/PG del caso, no un árbol
PowerShell ni el adaptador de producción. El informe mantiene explícitamente
productionAdapterReady=false y no debe reetiquetarse como ejecución remota
lista. El escenario sintético usa sus propias sesiones/roles: no concede
capacidad o permiso para terminar conexiones ajenas del proyecto.

Antes de proceder real, los gates concretos son:

1. Integrar y revisar el adaptador de sesión TLS persistente, observaciones
   separadas/frescas y captura/restauración reales. Ligar proyecto, migración
   original, RunId, snapshot, BackupId y hashes, con ledger exacto de procesos,
   contenedores/backends y prueba de ausencia al cancelar; no basta matar el
   parent PowerShell. Validar sólo los caminos nuevos que afecte esa integración.
2. Establecer en el destino controles de ingreso y equivalencia verificable del
   drenaje Auth; activar la exclusividad ya confirmada y detectar operadores
   desconocidos, sin volver a solicitar esa decisión genérica.
3. Generar el respaldo definitivo del corte con holder supervisado, importar
   su snapshot, verificar cifrado/restore y conciliación antes de continuar
   expand en la misma transacción. Drift/sessionloss/timeout/cleanup incierto
   abortan; COMMIT ambiguo exige conciliación y nunca retry automático.
4. Completar configuración/antiabuso y los checkpoints de primer administrador,
   vínculos conservando UUID/históricos y aceptación real Auth/MFA/RLS/Edge,
   recuperación y RTO del alcance acordado antes de abrir servicio.

No se agrega una auditoría genérica ni se repiten gates ya aprobados. Queda
aprobada preparación local; **captura y corte remotos aún no habilitados por
este dictamen**. La aceptación del RPO acotado no cambia metadata drift en
prevención ni elimina esos gates. Color posterior e independiente, sin push,
publicación ni Etapa 5.

### Revisión previa de correlación Auth GET en destino

**Aprobado stage04-auth-request-observation.ps1 únicamente para GET no mutante
y correlación agregada de su handler.** Reviewer inspeccionó el candidato y
las deltas de contador/clave pública tras AST PASS entregado por Root. Usa
PAT DPAPI con guards revisados y endpoints HTTPS fijos; clave publishable o
legacy anon sólo en RAM. Para legacy comprueba role/ref decodificados de la
respuesta de gestión confiable, sin llamarlo verificación criptográfica.

Nonce/request-id y referer únicos se generan/filtran antes de formar la query.
Sólo retorna count de completion con método/path/status esperados, sin eventos
o payloads; polls y timeouts están acotados. Exige una fila y entero o cadena
decimal ASCII acotada, rechazando bool/arrays/fracciones/coerciones truthy.
Errores se suprimen a fase genérica. No hay cambios de cuentas/config, locks,
backup ni entrada de corte. No se ejecutó el candidato en esta revisión.

Un eventual HandlerCompletionCorrelated=true sólo cierra la observabilidad de
ese GET. AuthWritersDrained=false y CutoverAuthorizedByThisProbe=false son
correctos: no sustituye cierre de ingreso, drenaje real o equivalencia del
destino durante la ventana. Sin autorización de escritura por este addendum.

### Resultado GET Auth y siguiente plan operativo

Root entregó **PASS del GET Auth correlacionado**: HTTP 200, completion del
handler identificado mediante agregado, clave pública y RemoteModified=false.
Reviewer revisó la corrección mínima del campo error opcional omitido en una
respuesta exitosa, sin relajar matching de método/path/status/completion y
marcador. No se atribuye PASS al primer fallo de instrumentación ni se leen
eventos/payloads en esta revisión. Queda cerrado este gate de observabilidad;
AuthWritersDrained y autorización de corte continúan false.

Es viable preparar el plan operativo exacto dentro de B ya aceptada: no hay
evidencia de un impedimento universal del proveedor ni se exige otra aceptación
genérica. El plan/payload debe pasar revisión antes de ejecutar: preservar
config/reversión, cerrar/verificar ingreso nativo, activar exclusividad,
inventariar sesiones y requests pendientes, drenar bajo locks con 26 tablas
Auth vacías y secuencia estable, confirmar fin de handlers propios y cero
TX/waits, supervisar backup/restore/transición y AuthEmpty final antes bootstrap.
Si hay handlers desconocidos/no correlacionables o no se verifica cierre
efectivo, abortar. Config GET, counts cero o ausencia instantánea de TX no
prueban por sí solos ausencia de handlers pendientes. Esto aprueba preparar
el plan concreto; no declara drenaje ya cumplido ni habilita corte real.

### Reanudación 19 de octubre — límite de logs y alternativa sin migración

Orquestador entregó sólo cuatro agregados de 23 h: seis eventos, cero starts,
seis completions y seis con request_id. Se conserva el GET correlacionado PASS;
no se repitió ni se leyeron eventos. Esa fuente no permite inventario exhaustivo
de handlers pendientes mediante starts menos completions.

Reviewer consultó fuentes primarias versionadas, sin acceso al proyecto:
[APIConfiguration v2.197.0](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/conf/configuration.go)
define MaxRequestDuration con default 10 s, pero el
[timeoutMiddleware](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/middleware.go)
ejecuta el handler en goroutine y, ante DeadlineExceeded, responde 504 sin
esperar serverDone. El
[router de esa versión](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/api.go)
activa ese middleware sólo con duración positiva. El default de código no es
valor managed verificado; aun verificándolo no demuestra fin del writer.
Esperar un timeout arbitrario o completion de respuesta 504 no cierra el gate.

Un bloqueo efectivo de gateway/claves cerraría admisión nueva, no solicitudes
ya admitidas. Counts Auth cero y ausencia instantánea de TX/waits bajo locks
no excluyen un signup pausado antes de adquirir conexión. No se aprueba como
equivalente cierre de claves más una espera MaxRequestDuration; tampoco se
afirma que cualquier mecanismo de claves propuesto esté disponible o cubra
todas las rutas del proyecto.

Alternativa mínima defendible sin nueva migración: mecanismo soportado por
el proveedor que suspenda/reinicie sólo Auth con garantía de terminación de
todos los workers antiguos, ingreso cerrado durante la transición y DB/pooler
disponible para respaldo. Después comprobar cero TX/waits y Auth26 vacío bajo
locks antes de seguir. Un restart de nombre o PATCH de config sin semántica
de terminación comprobada no basta. También serviría una observación fiable
de inflight cero; los agregados actuales no la ofrecen. Disponibilidad de esa
operación del proveedor pendiente, no imposibilidad universal declarada.

Permanece cerrado el gate operativo de drenaje real. No se baja el alcance RPO
aceptado ni se proponen alteraciones de roles protegidos, ACL DATABASE o triggers
administrados improvisados. Todos los PASS locales se conservan y no requieren
repetición por este límite. Sin escrituras, locks, push o despliegue de Reviewer.

### Dictamen vigente — 19 de octubre de 2026

**Correlación del GET Auth: cerrada y aprobada. Drenaje exhaustivo de handlers
en el destino: bloqueante operativo todavía abierto.** El agregado 23 h
6 eventos/0 starts/6 completions/6 request_id no demuestra inflight cero.
La alternativa de soporte requerida se limita al ciclo de vida/quiescencia
de Auth; no vuelve al requisito anterior de congelar todo el proveedor ni
cambia el alcance B aceptado.

Se conservan los PASS de runtime TLS, JobObject, cancelación del restore real
PS/Docker, 63 controles de evidencia y todos los demás ensayos aprobados.
No se ejecutan nuevas pruebas ni se exige repetirlas. Reviewer no realizó
operaciones remotas del proyecto; la investigación primaria fue lectura pública
de código. No hay aprobación de locks, cambios Auth/cuentas/secretos, migraciones,
push o despliegue. No ejecutar el corte hasta obtener evidencia soportada del
prerrequisito de drenaje. La consulta propuesta al soporte queda para el
propietario; no se envía ningún mensaje externo desde esta revisión.

### Confirmación documental final del checkpoint 19 de octubre

Reviewer leyó ahora las versiones materializadas de cutover-maintenance,
scoped-freeze-validation y PROJECT_CONTEXT. **Documentación vigente coherente,
sin hallazgos nuevos.** Sustituyen correctamente el estado stale del launcher/
integración por sus PASS, conservan 6/0/6/6 y separan correlación aprobada de
drenaje pendiente. La alternativa se limita a Auth y mantiene B; no afirma
que recargar config garantice terminación ni propone cambiar ajustes para
provocar un restart supuesto. El texto para soporte solicita operación y
garantía observable manteniendo DB/pooler/Management accesibles, sin secretos,
pausa global ni mensaje externo enviado. Se conserva el dictamen: no corte
hasta verificar ese prerrequisito. Sin nuevas pruebas ni escrituras remotas.

## Decisión posterior 19 de octubre — corte controlado con riesgo residual

El propietario sustituyó expresamente el requisito de soporte/garantía
exhaustiva de drenaje interno por un corte controlado con riesgo residual
documentado, sin afirmar RPO 0 absoluto. **Aceptado el ajuste de alcance para
preparar el plan mínimo.** El bloqueo vendor/inflight anterior queda histórico,
retirado por esa decisión; no se declara que haya sido demostrado o satisfecho.
No se exige consultar soporte ni volver a pedir aceptación genérica.

La atestación debe expresar controles verificables: authAdmissionControlsVerified
para flags nativos de admisión comprobados y operación exclusiva/actividad
observable; nunca fin de todas las goroutines. Los reportes deben mantener
RpoZeroVerified=false e identificar la aceptación del riesgo residual del corte.
No convertir snapshots/hashes iguales, 0 TX o logs de completion en garantía
de ausencia de escritores internos. El riesgo de un handler ya admitido que
termine más tarde permanece documentado y expresamente aceptado.

No se retiran locks/drenaje SQL observable, supervisión del holder, Auth26
vacío, secuencias, checkpoints/drift, respaldo definitivo íntegro/restaurado,
cleanup exacto ni aborto ante writer desconocido, cambio observable, pérdida
de sesión o ACK ambiguo. Se conservan UUID/históricos, primer admin/MFA/RLS/
Edge y aceptación real antes de abrir, con color independiente sólo después.

Antes de ejecutar, materializar el addendum contractual, la delta de atestación
y el punto de entrada/payload exactos para revisión. Un renombre del contrato
requiere sólo negativos focales del constructor/entrada (nuevo nombre true,
missing/nombre anterior rechazados), sin repetir 22/10/40 u otras suites.
Esta revisión del ajuste no aprueba todavía un comando remoto no presentado
ni una migración nueva; no push, publicación o Etapa 5.

### Candidatos estables del contrato y control de admisión

Reviewer leyó el addendum vinculante, constructores/factory, bridge de lectura,
fecha ISO y stage04-auth-deployment-control.ps1. Renombre y aceptación de riesgo
son explícitos antes de TLS; reports mantienen RpoZeroVerified=false. Backend
entregó doce contratos de atestación y nueve de fecha ISO/calendario UTC PASS,
sin reejecutar suites aprobadas. La fecha deja de depender del 18 de octubre,
sin aceptar fecha imposible u offset arbitrario.

**Aprobados Inspect GET y bridge read-only para SQL estático revisado.** El
bridge verifica postgres/postgres/read_only, usa sesión fresca/default READ ONLY
y cleanup; no se presenta como sandbox para SQL arbitrario. Inspect verifica
proyecto/región/salud, inventario de proveedores/tipos y entradas inesperadas,
sin modificar cuentas/config. No requiere atestaciones falsas de freeze.

**CloseAdmission aprobado técnicamente, condicionado al checkpoint fresco de
actividad/writers observable y recuperación manual documentada antes de usarlo.**
Payload exacto: disable_signup=true, external_email_enabled=false. Verifica
original DPAPI por hash fijo recuperado en RAM, identidad/tipos y coincidencia
de flags originales, exige selección explícita/ObservedWritersVerified y
confirma por GET; PATCH incierto demanda conciliación, sin retry automático.
La [referencia oficial](https://supabase.com/docs/reference/api/v1-update-auth-service-config)
confirma PATCH del proyecto y campos de configuración opcionales. No implica
fin de todos los handlers ni aprobación del corte por cambiar esos flags.

Se comunicó ajuste menor de salida: EnabledProviderNames calculado antes del
PATCH debe recalcularse desde el GET posterior para no presentar estado stale.
No cambia el payload. ConfigureCandidate queda fuera de esta aprobación hasta
su checkpoint expanded_closed/vínculos: no habilitar email por anticipado.
Reversión manual de flags originales no es rollback de migración ni autoriza
reactivar permisos anónimos/PIN; después de expand, conservar cierre ante
incidente. Sin ejecución de Reviewer ni pruebas nuevas repetidas.

### Checkpoint de integridad y actividad observable

**Aprobado el reintento read-only de stage04-cutover-integrity.sql** tras
inspección estática. BEGIN READ ONLY/timeout/UTC/ISO, hashes de legacy/UUID de
seis tablas; empleados proyecta sólo id/nombre/rol para hash, nunca PIN.
Excluye campos nuevos y color para comparar fases. Devuelve agregados de
roles/referencias/auditoría y actividad observable, más IDs admin necesarios
para bootstrap; no payloads Auth ni valores de negocio en claro. Es checkpoint
fresco de operación, no repetición de auditoría. Comparar también lista de
recursos exacta: una tabla vacía no figura en summaries y no debe ignorarse.

La heurística SQL/application_name no certifica ausencia universal de writers.
Count REST agregado de la ventana acotada tampoco: no exportar eventos/PII.
El primer intento no conectó por daemon Docker apagado, sin SQL o recursos
creados; no se atribuye PASS/cleanup al endpoint ausente. Resolver el runtime
local no obliga a repetir los TLS/Job/restore ya aprobados.

Inspect Auth actual PASS entregado: proyecto/ref/región/salud, 26 flags y sólo
email activo, signup aún ON. Se confirmó la corrección de EnabledProviderNames
recalculado del GET posterior al PATCH; ajuste menor cerrado. No cierre
ejecutado ni corte acreditado por estas lecturas en el momento de esta revisión.

### Bloqueante de integridad observado — antes de cualquier PATCH

Orquestador informó una discrepancia concreta en el checkpoint fresco del
19 de octubre: empleado_rutinas tiene cero filas en origen frente a tres en
el respaldo/restauración conciliados. Confirmó count directo, RLS/FORCE false,
owner postgres y tabla ordinaria; los otros cinco conteos/UUID coinciden.
No se atribuye la diferencia a visibilidad RLS, al ejecutor ni a causa accidental
sin evidencia. Actividad observable cero en esa ventana no explica cambios
previos ni prueba intencionalidad.

**Bloqueante de datos abierto: detener antes de CloseAdmission/PATCH, captura,
migraciones o restauración remota.** La aceptación de riesgo residual de Auth
no autoriza pérdida conocida de asignaciones ni resuelve la discrepancia.
AGENTS exige registrar la diferencia y decisión del Orquestador/propietario.
La consulta al propietario sobre eliminación intencional o recuperación está
pendiente; no se solicita autorización genérica de despliegue otra vez.

Si el cambio es intencional, registrar baseline nueva expresamente aceptada;
si se deben recuperar, preparar plan acotado que preserve UUID/relaciones y
revise colisiones/FK/estado actual antes de autorización específica. Nunca
restaurar automáticamente toda la base antigua ni sobrescribir otros datos.
Se conservan todos los PASS previos; no hay pruebas nuevas que repetir por
esta duda de intención. Según el handoff no se ejecutaron PATCH, nueva captura,
migraciones o escrituras de recuperación. Reviewer no accedió al archivo/filas
ni ejecutó operaciones del proyecto.

### Decisión del propietario — recuperar las tres asignaciones

El propietario confirmó que las asignaciones deben conservarse y recuperarse,
autorizando expresamente esas tres. **Plan acotado aceptable**, pendiente de
revisar extractor/SQL concretos; no nueva autorización genérica. El bloqueante
de datos sigue abierto hasta verificar recuperación/conciliación. No se atribuye
causa a la desaparición y Auth permanece detenido.

Extracción aislada limitada a empleado_rutinas del backup verificado, sin PIN,
otras filas o secretos, preservando todas sus columnas/UUID y empaquetando
fuera del repo con DPAPI/ACL. Vincular paquete al BackupId, tres filas y hashes
UUID/FK conciliados; comparar esquema/columnas/tipos con el destino.

Reparación permitida por el plan: INSERT exactamente esas tres, transacción
explícita, target COUNT 0 y sin colisiones; padres/FK vigentes, locks ordenados
y timeouts. Para garantizar los hashes de las otras cinco tablas, protegerlas
con SHARE durante la comprobación y usar lock adecuado en el target. Forzar
constraints inmediatas y verificar conteos/hashes/columnas y ausencia de cambios
en las otras tablas antes de COMMIT. Cualquier discrepancia aborta, sin UPDATE,
DELETE, filtros permisivos o restauración global. ACK ambiguo exige conciliación
por lectura y nunca retry automático.

Con preimagen vacía certificada y operación sólo INSERT transaccional, no se
exige otro fullbackup antes de esa reparación no destructiva; conservar el
backup original y hacer el definitivo completo después de recuperarla, antes
del corte Auth. No se generaliza esta excepción a modificaciones/deletes.
La escritura debe usar entrada explícita revisada, nunca desactivar el bridge
readonly. Se justifica únicamente extracción y controles afectados, sin repetir
Auth/MFA/E2E o todo el restore aprobado. No ejecutado por Reviewer.

### Revisión previa del extractor y reparación SQL acotados

Reviewer leyó stage04-recover-assignments.ps1 y la reparación SQL fija
71f0172c87b993252a5165df5ddd830585e636360662802782398aa1782e925f.
**Aprobado sólo Extract** sobre el backup original, tras comprobar el foco
sintético de la nueva ruta PSSerializer SecureString→archivo privado→reimport
(sin literal claro y tipo SecureString). Con PASS y sin cambios no requiere
otro handoff ni nueva autorización del propietario. AST PASS entregado por
Backend no sustituye por sí solo esa comprobación del paquete antes de disco.

El extractor valida ACL/rutas, identidad y hashes/GCM del archivo, usa imagen
fijada, red none/logs none/tmpfs y carga únicamente pre-data/data de la tabla.
No reconstruye Auth ni selecciona PIN/otras tablas. Exige tres columnas UUID,
tres filas y hashes UUID/FK originales, preserva las tres columnas y genera
paquete DPAPI/ACL fuera del repo, sin imprimir filas. Debe verificarse ausencia
del contenedor exacto antes de admitir el paquete. No es fullrestore ni prueba
de padres vigentes en origen.

El SQL revisado bloquea cinco tablas SHARE y target SHARE ROW EXCLUSIVE con
timeouts, exige postgres/postgres, destino vacío/esquema exacto/sin expand o
triggers ajenos. Temp rows con PK/pareja única, hash original y padres vigentes;
INSERT-only, constraints inmediatas y comprobación de tres hashes/otras cinco
tablas antes del COMMIT. No filtra conflictos ni permite UPDATE/DELETE.

Apply no queda aprobado para remoto por esta revisión. Antes necesita ensayo
focal del mismo SQL con el paquete extraído y padres dummy en aislamiento,
negativos de precondiciones/segunda entrega y cleanup; no otras filas reales,
fullbackup, suite Auth o restore total. También revisar el Apply estable y
evidencia post-ACK/conciliación. Se conserva la autorización del propietario
para las tres asignaciones, sin extenderla a otras escrituras.

## Revisión previa del nuevo observador post-expand

Reviewer inspeccionó stage04-expand-verification.mjs y su drill tras evidencia
Root de ocho casos focales PASS y cleanup exacto. SQL sólo catálogo READ ONLY,
timeout y rollback; no filas/PIN. El SHA fijado vincula los bytes de la migración
aprobada. Los negativos entregados cubren grants tabla/columna anon, EXECUTE
bootstrap authenticated, search_path y rechazo de un booleano como evidencia.
No se repitió el drill ni se reabrió la auditoría Auth aprobada.

**Hallazgo medio del nuevo gate, pendiente antes de integrarlo como verificador
productivo:** private_schema no niega CREATE a anon y function_security no
verifica owner confiable de SECURITY DEFINER. La función is_admin/current_employee_id
puede conservar definer/search_path/EXECUTE permitido a authenticated aun cuando
su owner haya cambiado a authenticated; el gate actual lo aceptaría, aunque
ese owner podría modificarla. No es defecto atribuido a los bytes aprobados
de expand, sino cobertura insuficiente del nuevo detector de drift postcommit.
Se solicitó negar anon CREATE y comprobar owner, con negativos focales nuevos.

El observador tampoco compara cuerpos de función ni definiciones completas de
constraints/predicados de índices: sus ocho booleans son comprobaciones
delimitadas, no equivalencia total del catálogo expand. SHA de bytes entregados
no acredita ausencia de cambios posteriores. No hay aprobación de ejecución
remota por esta revisión; se conserva preparación local y espera handoff delta.

### Cierre del hallazgo del observador post-expand

**Hallazgo medio resuelto; aprobada la preparación local del gate acotado.**
Reviewer confirmó la delta: niega CREATE a anon sobre private y exige owner
de schema/funciones igual al actor de inspección. Root entregó sólo el drill
afectado actualizado: once casos PASS y cleanup exacto, incluidos anon CREATE,
owner de is_admin cambiado a authenticated (rechazado) y reparación a postgres
(aceptada). No se repitió la suite Auth ni ejecutó pruebas en esta revisión.

El adaptador debe verificar que current_user sea el actor postgres esperado
antes de usar esa comparación relativa de owner. Se mantienen los límites
de ocho campos del gate: no equivalencia completa de cuerpos/constraints/
predicados, ni prueba de ausencia de drift por el SHA de entrega. Sin
autorización nueva de ejecución remota; runtime productivo aún en integración.

## Revisión inicial del runtime y prueba TLS acotada

Reviewer inspeccionó stage04-cutover-runtime.ps1/.mjs y los opt-ins
SupervisionRunId de captura/restauración, sin ejecutar transporte, workers o
credenciales. Backend entregó AST PS5.1/7, node --check, seis contratos de
entrada/nombres y prueba real Windows JobObject PASS en 6,74 s, RunId
ed73805fc9350a8d1386e741b8b75371: parent y child miembros, parent terminado,
job activo 0 y salida observada. No se presenta como captura/restore real.

**Aprobado únicamente probeTlsReadOnly() del nuevo transporte**, con SELECT
actor/database/probe y cleanup, sin construir FreezeProtocol ni llamar
prepareCutoverRuntime/run. Host, ref/usuario, CA hash, imagen y verify-full
están fijados; contraseña permanece en PS y stdin, sin secreto en Node,
argumentos/env o diagnósticos. El actor postgres es verificado antes del gate
de owner relativo. Esta prueba nueva de integración no repite el TLS histórico.

Los nombres opt-in ligan RunId/BackupId, contenedores y reportes; defaults
anteriores se conservan. Se revisaron JobObject sin breakaway, ledger,
cleanup de procesos/contenedores y lector fuente por PID/backend_start/
application_name/actor, además de manifest/cipher hashes y prueba de restore.
Helpers metadata/evidence y conexiones frescas tienen sus propios deadlines:
cancelación durante esos pasos puede quedar cancellation_unconfirmed. Eso
debe impedir continuar, sin afirmar cierre real por la sola señal o JobObject.

**Hallazgo alto antes de uso real: falta gate de runtime Auth después de expand.**
El observer actual de catálogo/metadata/secuencias no detectaría necesariamente
un INSERT tardío en auth.users que no avance una secuencia. Antes de bootstrap
debe verificarse el baseline Auth vacío de las 26 tablas, en checkpoints y
tras ACK, con fallo/drift tratado como incidente cerrado y sin bootstrap.
Para ese baseline los conteos cero bastan, sin leer payloads ni tokens. Este
gate no sustituye equivalencia del drenaje de handlers/0TX en el destino.
Se comunicó al Orquestador; no afecta las suites históricas aprobadas.

Captura/expand reales quedan sin aprobación técnica hasta resolver ese hallazgo
y validar sólo las rutas nuevas: transporte TLS, integración worker/evidence
y cancelación de los recursos efectivamente usados por el adaptador. Además,
la heurística pg_stat_activity de SQL activo/application_name es una observación
limitada, no autenticación de writers ni sustituto de la exclusividad ya
atestada. No se agrega auditoría general ni se pide repetir 22/10/40/13.

### Corrección AuthEmpty y ensayo mínimo del worker PowerShell

**Hallazgo alto de implementación Auth tardío corregido.** Reviewer confirmó
inventario exacto congelado de 26 tablas, SQL READ ONLY de COUNT(*)::text y
rechazo de nombres/conteos distintos, booleanos o valores no cero. Se invoca
en observe de baseline/checkpoints/post-expand y como última comprobación de
freshControlObservation, después de los GET de gestión también tras ACK.
La excepción posterior al ACK se procesa como conciliación requerida, nunca
permiso de bootstrap. Root entregó consulta MCP de 26 ceros y Backend nueve
contratos focales PASS; no se leyeron payloads. No se repitieron pruebas.
La integración completa sigue sin aprobarse para remoto.

**Aceptable el ensayo focal de cancelación PS/JobObject/Docker** reutilizando
el respaldo ya verificado, con SupervisionRunId nuevo y restore exclusivamente
aislado, sin helper Auth, recaptura ni cambio del manifest original. Debe
observar wrapper y contenedor owned todavía activos al cancelar y comprobar
exit/Job0/ausencia de todos sus contenedores exactos. Este worker no abre
conexión al origen; no se permite un supuesto cleanup de backend remoto que
no llegó a existir. Si finaliza antes de cancelar, no acredita cancelación:
resultado inconcluso para ese caso, sin forzar un PASS.

Binding de artefactos puede validarse con fixtures/negativos en RAM, incluido
rechazo del manifiesto original sin SupervisionRunId; no modificarlo para
hacerlo pasar. El probe TLS actual falló localmente en ACL antes de conexión:
se conserva como fallo diagnóstico, no prueba de permisos remotos ni motivo
para relajar la ACL. El arreglo de ese transporte y el resultado del worker
requieren evidencia afectada; no auditorías o suites anteriores repetidas.

### Launcher PS7 y transporte TLS nuevo verificados

**Aprobada la corrección del launcher.** Reviewer confirmó que los procesos
del adaptador usan ruta absoluta al PS7 bundled ya inspeccionado y que el hijo
JobProbe usa el ejecutable del proceso actual. No se modifican permisos,
credenciales, CA ni variables globales para resolver Get-Acl ausente en el
Windows PS5 lanzado por Node. Los diagnósticos sólo añaden fase/clase/categoría,
sin Exception.Message ni respuestas/secretos crudos.

Root entregó Node→PS7 ACL probe PASS, nuevo JobLoss PS7 PASS/7,19 s RunId
ef8fb189af8648ef8e85e35afef24bca y probe TLS read-only PASS/4,44 s: actor/base
verificados, verify-full/CA fijada, remoteWrite=false y freezeStarted=false.
Esos gates de integración afectados quedan comprobados; no se repiten el TLS
histórico o suites previas. Cancelación del worker restore PowerShell/Docker
con archivo existente y validación final de evidencia siguen pendientes del
candidato estable y su prueba focal. Captura/expand remotos no habilitados.

### Revisión previa del probe de cancelación del restorer real

**Aprobado ejecutar únicamente probeRestoreCancellation()** tras inspeccionar
su versión estable y cleanupLocalWorker compartido. Fija el único BackupId
previamente autorizado y hash de observación original; genera RunId distinto.
Invoca wrapper restore PS7 sin Auth helper, transporte fuente o FreezeProtocol.
No modifica el manifiesto ni toma otra captura. Exige parent vivo y contenedor
restore running antes de cancelar; si no lo observa, falla como inconcluso.

La limpieza compartida termina árbol propio, retira los dos nombres exactos
Auth/DB del RunId e inspecciona Job0 más exit del parent y ausencia de ambos.
Sólo entonces afirma cancelación; no declara restore completo o readiness
productiva. No hay hallazgos nuevos para esa prueba focal. Reviewer no abre
el archivo ni repite pruebas; el resultado real continúa pendiente.

### Resultado PS7/Docker y último gate local de evidencia

**Aceptado PASS del probe de cancelación real del worker restore**, entregado
por Root: exit 0/7,82 s, RunId 0faee69033877bf321ed0b5b3e62d5be sobre el
backup existente. Parent y DB estaban activos al cancelar; Job0, exit y
ausencia de recursos exactos confirmados mediante cleanup compartido de
producción. Sin conexión al origen, helper Auth, cambio del manifest,
recaptura o afirmación de restore completo. Cierra ese scope PS↔Docker;
Reviewer no repitió ejecución.

Queda una validación focal de evidencia, sin necesitar nueva captura: probar
validadores del mismo camino CaptureEvidence/RestoreEvidence con fixtures
positivos y negativos de RunId/proyecto/BackupId/snapshot/hashes/report/cleanup,
incluido rechazo de manifest original sin SupervisionRunId. No alterar el
manifest original para el test. Una función de validación pura extraída y
usada por esos modos permite verificar el contrato sin artefactos reales.

**Hallazgo medio de ese camino nuevo:** las condiciones PS `-not $report.flag`
aceptan cadenas truthy como 'false'; deben exigir tipo boolean y true antes
de emitir prueba con flags true. Incluir ese negativo en los casos focales,
sin nuevas auditorías ni repetición de suites. Captura/expand siguen pendientes
de cierre de ese gate, revisión del punto de entrada real y equivalencia de
ingreso/drenaje Auth en el destino; luego corresponden los checkpoints del
runbook autorizado (respaldo definitivo supervisado/restaurado y aceptación
real posterior), sin volver a preguntar autorización genérica.

### Cierre del gate de evidencia y preparación local vigente

**Hallazgo medio de flags truthy resuelto; preparación local del runtime
aprobada en el alcance revisado.** Reviewer inspeccionó Get-EvidenceField,
Assert-SupervisedManifestBinding y Assert-SupervisedRestoreBinding, ejecutadas
por los mismos modos CaptureEvidence/RestoreEvidence. Exigen tipos correctos,
identidades/ref/RunId/BackupId/DrillId/snapshot ligados y seis flags bool true;
arrays no se desempaquetan como booleanos. El restorer opt-in incorpora hash
de los bytes de manifiesto que realmente interpretó, snapshot y ambos hashes
cipher, conservando el comportamiento default. La prueba final liga esas
propiedades al manifiesto y ciphertext comprobados, sin elevar flags por
coerción PS.

Backend entregó el drill focal de los mismos validadores: 63 casos PASS/1,02 s
y AST tres archivos PASS. Incluye negativos de identidades/campos faltantes,
flags false/cadenas/número/array y rechazo del manifiesto preparatorio original
sin SupervisionRunId, leído sólo como metadata y sin modificarlo. Sin cipher,
clave, credencial, restauración, captura o remoto para ese gate. Reviewer no
repitió ejecución. No quedan hallazgos altos/medios de código abiertos
introducidos en este alcance local; no equivale a certificación de producción.

Los pendientes mínimos son operativos y de aceptación, no nuevas auditorías:

- Verificar correlación de handler Auth no mutante en destino y, al cerrar
  ingreso, equivalencia real del drenaje/cero TX-waits antes de liberar locks.
  Acceso agregado a logs o 401 gateway sin apikey no constituyen esa evidencia.
- Revisar el punto de entrada concreto del corte, configuración candidata,
  fingerprints esperados tras cerrar ingreso, identidad/sesiones autorizadas y
  condiciones de aborto/conciliación; activar exclusividad ya confirmada.
- Ejecutar sólo el respaldo definitivo supervisado autorizado, validar evidencia
  y restore/conciliación antes de continuar expand; pérdida de holder/cleanup
  incierto impiden seguir y COMMIT ambiguo no se reentrega.
- Completar checkpoints del runbook de bootstrap/vínculos/primer admin y
  aceptación real Auth/MFA/RLS/Edge, recuperación/RTO antes de apertura.

La observación GET de gestión/Auth puede continuar dentro del alcance de
lectura autorizado. Este dictamen no concede permisos nuevos de escritura ni
declara freeze real, backup de corte o producción listos. No repetir suites
aprobadas salvo deltas/fallos que lo justifiquen; color posterior, sin push,
publicación ni Etapa 5.

## Checkpoint vigente final — recuperación acotada, 19 de octubre

Prevalece la decisión explícita posterior de corte controlado con riesgo
residual aceptado, sin exigir soporte o garantía absoluta de drenaje interno.
El antiguo gate exhaustivo es histórico y queda retirado por decisión, no
demostrado. Se conservan controles observables/locks/supervisor/aborto y
RpoZeroVerified=false; ningún PASS anterior se invalida o repite.

El bloqueante vigente de datos es empleado_rutinas 0 frente a 3 originales.
El propietario autorizó recuperar exactamente esas tres, conservando UUID/FK;
no autoriza pérdidas, restauración global ni otras modificaciones. Auth sigue
sin iniciarse hasta cerrar esa conciliación. Preparación local aprobada;
producción no declarada lista.

Primer Extract no PASS: helper rechazaba stdout vacío legítimo de pg_restore/
listado. No se creó paquete aceptado y Orquestador comprobó aparte ausencia
del contenedor exacto. Reviewer revisó la delta mínima: AllowEmpty opt-in,
default false, manteniendo rechazo de salida vacía en crypto/captura y exit
no cero en cualquier modo. Backend entregó tres contratos focales PASS/3,26 s
y AST de ambos archivos; no se repitieron suites.

**Aprobados reintento Extract y Rehearse exclusivamente aislados**, el segundo
sólo tras paquete válido del primero. Rehearse usa ese paquete y el mismo SQL
SHA revisado, seis tablas fixture y padres dummy derivados sólo de los UUID
de sus tres filas; no otras filas reales ni Auth. Debe verificar positivo,
segundo intento rechazado con 40001 sin alterar lo recuperado y cleanup exacto
antes del reporte. El foco nuevo PSSerializer/DPAPI ya pasó según Orquestador.
Reviewer inspeccionó código/evidencia sin ejecutar archivo, clave o pruebas.

Apply remoto todavía pendiente de esos resultados y cierre de revisión del
camino de reparación. Se preserva la autorización específica del propietario;
no hace falta volver a preguntarla. ACK incierto exige conciliación de lectura,
sin retry. Después de recuperar/verificar las tres, corresponde respaldo
definitivo supervisado/restaurado y los checkpoints Auth/RLS/MFA/Edge, con color
posterior e independiente. Sin push, publicación o Etapa 5.

## Aprobación específica de reparación — 19 de octubre

**APROBADO Apply únicamente para recuperar las tres asignaciones autorizadas.**
RecoveryId ae32dc6044a8458a8e8a638b592f323d; package SHA256
556af8219647f9ef5044d815b6ad2872cabc1139568f50833543b58741695b9a;
SQL SHA256 71f0172c87b993252a5165df5ddd830585e636360662802782398aa1782e925f.
Esta aprobación sustituye el pendiente Apply del checkpoint anterior; no amplía
la autorización del propietario a otras filas o migraciones.

Extract PASS/4,13 s entregado: tres filas/UUID/FK originales y cleanup exacto,
sin PIN. Rehearse PASS/3,76 s, RunId f2382c7ff0b5475ca80adc4d7bb729db: mismo
SQL positivo conserva las otras cinco tablas fixture; segunda entrega rechazada
con 40001 y hashes invariantes, cleanup confirmado. No fuente/Auth/archivo
original leídos por Rehearse. Reviewer revisó el Apply estable, SQL y evidencia,
sin repetir ejecuciones ni consultar las filas.

Los guards transaccionales son la comprobación atómica definitiva: actor/base,
target cero, esquema exacto/pre-expand/sin triggers, hashes de las tres y padres
vigentes bajo locks, INSERT-only, constraints inmediatas y verificación de las
otras cinco tablas antes de COMMIT. No se exige duplicar una lectura previa
que no sustituye esos guards. Orquestador además entregó lectura TLS fresca
de target cero, las otras cinco sin cambios, roles/referencias/auditoría válidos,
sin actividad inesperada y expand/color aún ausentes; no fue una escritura.

Ante cualquier discrepancia, parar sin reparación permisiva. ACK incierto exige
lectura/conciliación y no retry; después del ACK se debe conciliar origen para
cerrar el bloqueante de datos. El resultado remoto aún no está demostrado en
este dictamen. La operación autorizada es reparación INSERT de tres, no
CloseAdmission/PATCH, nueva captura, migración Auth o corte. Se mantiene corte
controlado con riesgo residual aceptado/RpoZeroVerified=false, sin gate vendor
exhaustivo, sin producción lista ni push/Etapa 5.

## Reparación conciliada y entrada a expand — 19 de octubre

El Orquestador entregó Apply PASS/5,63 s, RunId
4226f6f84a4a437cab1c3794ca28e896, CommitAcknowledged=true. La lectura posterior
PASS/5,34 s confirma las tres asignaciones con sus UUID/FK originales, las otras
cinco tablas con UUID y hash legado invariantes, cero defectos/actividad
inesperada y expand/color ausentes. **Cerrado el bloqueante concreto de las
asignaciones.** Reviewer registra esta evidencia entregada, sin nuevas consultas
o pruebas ni atribuir una causa a la desaparición previa.

**Aprobación condicional del entrypoint mínimo:** CloseAdmission explícito con
actividad observable verificada y las dos flags originales recuperables; luego
fingerprint fresco de los cinco campos en el orden del runtime y
prepareCutoverRuntime con expandPath/SHA aprobados, las cinco atestaciones
verdaderas bajo la decisión vigente, verifyRestoredAuth=false, run y close en
finally. La recuperación Auth real aislada anterior se conserva como evidencia;
no se repite por esta ejecución. El runtime debe mantener sus guards de Auth
vacío y sus comprobaciones de evidencia, snapshot, drift, cancelación y cleanup.

Esta aprobación comprende cierre nativo, respaldo definitivo supervisado,
restauración verificable y **expand solamente**. Para continuar se exige
state===expanded_closed, evidencia/cleanup satisfactorios y conciliación fresca
de UUID/FK y contenido legado antes de bootstrap. Cualquier otro estado exige
parar/conciliar; no bootstrap automático ni redelivery de COMMIT incierto.

Ante aborto confirmado anterior a expand, es aceptable recuperar explícitamente
sólo las dos flags originales mediante PATCH revisado, después de demostrar por
lectura que no hubo expand ni resultado de COMMIT desconocido. No se agrega
reapertura automática. Tras ACK de expand o resultado incierto, mantener cierre
y conciliar; no restaurar permisos anónimos ni PIN. La aceptación del riesgo
residual del propietario está vigente y RpoZeroVerified permanece false: no se
exige la garantía exhaustiva de handlers/proveedor sustituida el 19 de octubre.
No se declara producción lista ni se aprueban por este párrafo bootstrap,
cutover, color, push o publicación.

## Resultado definitivo de respaldo y expand — 19 de octubre

**Aprobado el subgate ejecutado de respaldo definitivo, restauración y expand.**
Orquestador entrega state=expanded_closed, reason=null, RunId/BackupId
2abb1ac7f0d7611a54ab8b1ced9d7afe, snapshot 00000019-000007E6-1;
evidencia de workers y cleanup verdaderos, sin incidente de reconciliación
señalado por el resultado. SHA256 del manifiesto:
bceac7d3bff49f9ec3320dabef8cb019175ee7f6239c9e488241f11069ea1206.
La migración expand corresponde al SHA aprobado ae5be96cb0b1394785a3396a388a8d6ae1583681779333f961db52fa09d85095.

Evidencia entregada: integridad GCM/cipher/plain, restauración PostgreSQL
single-transaction, metadatos de base y cleanup satisfactorios. El reporte
comparativo del respaldo original y definitivo concilia los seis conteos y
hashes UUID/FK. La lectura TLS posterior concilia además los seis contenidos
legados, incluidas las tres asignaciones recuperadas, sin defectos ni actividad
inesperada observada; expand presente y color ausente. RolesRestoredUnfiltered
permanece false por la transformación exacta OID10 revisada; no se presenta como
importación de roles sin modificaciones.

Reviewer registra resultados entregados del camino revisado, sin abrir archivos
cifrados, importar credenciales o repetir ensayos. FullSupabase y RpoZeroVerified
permanecen false bajo el riesgo residual aceptado. Auth conserva admisión nativa
cerrada; no recuperar ahora las flags pre-expand. El siguiente candidato es
provisión/bootstrap del administrador existente mediante Plan/Apply/Reconcile,
con revisión independiente de su código antes de POST o SQL administrativo.
Este subgate no habilita por sí solo vinculación restante, cutover, MFA/Edge,
color, publicación ni producción.

Trazabilidad de expand: se entregaron los bytes SQL originales mediante sesión
TLS supervisada, sin CLI. Ese archivo no registra supabase_migrations; no hubo
reparación del ledger del proveedor. El registro de ejecución y el verificador
de catálogo aprobado son la evidencia actual. La ausencia de ledger no autoriza
reentregar expand mediante db push u otra ejecución automática. Conciliar ese
estado explícitamente antes de adoptar una herramienta que decida pendientes
por ledger; no constituye por sí sola un bloqueo nuevo para vincular perfiles
por el procedimiento privilegiado revisado.

## Provisión del administrador existente — revisión previa, 19 de octubre

**Aprobado Plan de scripts/stage04-provision-initial-admin.ps1**, sólo lectura.
**Aprobado Apply explícito una vez, condicionado al Plan satisfactorio y al
estado fuente esperado**, para la única identidad admin.gns y el UUID de perfil
legacy fijado en el candidato; no crea un perfil empleado. No es una aprobación
de cuentas adicionales ni de cutover.

Reviewer inspeccionó el candidato estable completo y la RPC bootstrap ya
aprobada. Plan verifica credencial local DPAPI/ACL/política, catálogo expand,
inventario Auth vacío y perfil admin activo existente sin vínculo; no crea
journal ni llama POST. Apply valida proyecto y clave de servicio recibida por
Management HTTPS sólo en RAM, usa allowlist exacta método/origen/path sin
redirects ni cookies, email técnico contractual y email_confirm=true. La clave
no se escribe ni entrega al frontend. Journal DPAPI CreateNew anterior al POST
impide reentrega automática; estados posteriores ligan OperationId/proyecto,
perfil y UUID Auth. Bootstrap usa la RPC privilegiada existente con exclusión
del roster y prueba posterior de vínculo, único admin vinculado y auditoría.

Backend entregó AST PASS, 15 casos puros de política/gate y 11 adicionales de
límites UTF8/tipos/URI/handler, además de rechazo de argumentos desconocidos
antes de acciones. No ejecutó Plan/Apply ni leyó credenciales reales. Reviewer
no repitió esas pruebas ni la suite Auth aprobada; la nueva evidencia valida
este adaptador y conserva el ensayo Auth real aislado anterior.

Creación Auth y bootstrap SQL son operaciones distintas. Ante cualquier error,
respuesta incompleta o ACK incierto, detener y ejecutar Reconcile readonly:
compara identidad derivada exacta, UUID del journal y vínculo del perfil; no
promete recreación ni autoriza reset/delete/retry. No borrar el intent para
reintentar. Tras éxito se requiere conciliación independiente del vínculo y
de las seis tablas, admitiendo sólo los cambios previstos de perfil/auditoría
de seguridad, antes del siguiente handoff. Email puede continuar deshabilitado
durante creación Admin API. Configuración de login, TOTP/AAL2 administrativo,
vinculación restante, cutover/RLS, Edge y color continúan como gates separados;
no se declara producción lista.

## Bootstrap ejecutado y configuración de login — 19 de octubre

Orquestador entrega Plan PASS y Apply PASS, OperationId
930da5767dc243e4ac9b0928d796866c: ACK de creación y bootstrap, auditoría y UUID
legacy preservado. Reconcile readonly PASS/6,04 s devuelve
expected_bootstrap_link_observed. Lectura posterior PASS/5,17 s concilia los
seis UUID/hashes legados, tres asignaciones y referencias, sin actividad
inesperada; expand presente/color ausente. **Cerrado el subgate de creación y
vinculación del administrador existente.** El cleanup defensivo final del
candidato sólo dispone PSCredential/Token cuando sus tipos/propiedades existen;
se revisó esa delta, con AST PASS entregado, sin cambiar HTTP/journal/SQL.

**Aprobado ConfigureCandidate explícito del script Auth control revisado**, con
checkpoint de escritores observables vigente y selección del operador. Payload
limitado a disable_signup=true, external_email_enabled=true, site_url y
uri_allow_list iguales al origen HTTPS productivo fijado, password_min_length=12.
Exigir GET de confirmación exacta y restantes providers deshabilitados. El
suplemento original DPAPI sigue recuperable; no se publican sus valores.
Ante PATCH incierto, parar y conciliar por GET, sin reintento ciego ni reapertura
de permisos. Esta acción habilita login nativo manteniendo signup cerrado y
los permisos de negocio/mantenimiento vigentes.

Login disponible no acredita MFA/AAL2 ni operación administrativa de producto.
El perfil empleado restante, cutover RLS, controles operativos/security y Edge
requieren sus handoffs concretos antes de ejecutar; no se autoriza un db push
general. Color continúa independiente y posterior a aceptación Auth/RLS. Se
conservan los ensayos previos, el riesgo residual aceptado y RpoZeroVerified=false;
no producción lista, publicación o Etapa 5.

## Configuración confirmada y smoke Auth administrativo — 19 de octubre

ConfigureCandidate PASS/6,51 s entregado por Orquestador: signup deshabilitado,
email habilitado, sólo ese provider entre 26 flags y GET confirma el payload
exacto. **Cerrado este checkpoint de configuración**, sin atribuirle MFA/RLS.

**Aprobado ejecutar CredentialKind=Admin de
scripts/stage04-auth-production-smoke.ps1.** Reviewer leyó el candidato completo;
AST y seis negativos del guard HTTP fueron entregados PASS sin red/credenciales.
El flujo real autorizado usa la credencial DPAPI validada, verifica proyecto,
login nativo, GET user con la misma identidad, refresh, logout scope=local de
esa sesión y posterior rechazo del refresh con status/código conocidos. HTTP
está restringido a HTTPS/proyecto/path revisados, sin redirects/cookies; secretos
y respuestas crudas no se imprimen. Logout no afecta otras sesiones y no se
afirma revocación instantánea de access JWT, AAL2 ni permisos de negocio.

Si el flujo falla después de abrir sesión, su logout final es best-effort:
SessionClosed=false no prueba cleanup, exige registrar/reconciliar esa sesión
antes de continuar. Observación menor no bloqueante: el finally del token
malformado puede enmascarar diagnóstico al acceder a Token sin guard de
propiedad; conviene el mismo cleanup defensivo del provisionador. No permite
acceso ni afecta el store ya validado para esta ejecución. La rama Employee
no queda aprobada por este párrafo: requiere primero su identidad/vínculo.
No se repiten suites locales ni se habilitan cutover/Edge/color por este smoke.

## Smoke real y vigencia del respaldo definitivo — 19 de octubre

Orquestador entregó smoke administrativo real PASS/5,22 s: login, identidad,
refresh, logout de su sesión y rechazo del refresh revocado. **Subgate cerrado**;
no afirma MFA, negocio, otras sesiones o revocación instantánea de JWT. El
finally fue corregido para acceder a Token sólo si existe su propiedad;
la observación menor anterior queda resuelta.

No se exige otra captura completa sólo por los vínculos controlados y sus
auditorías durante esta ventana cerrada: el respaldo definitivo 2abb ya está
restaurado y conciliado. Antes del cutover, su checkpoint puede revalidarse
con integridad/accesibilidad de ese artefacto, seis tablas legadas invariantes
y journal, credenciales y procedimiento de reprovisión disponibles. Esto está
condicionado a que esos vínculos sean el único delta, sin uso de negocio ni
factores MFA nuevos u otro estado no regenerable. Cualquier delta adicional
obliga a evaluar su recuperación concreta, sin repetir por defecto ensayos.

Los runbooks actuales dicen literalmente repetir backup/checkpoint backup:
Orquestador debe registrar esta reutilización controlada y adecuar ese paso
antes de marcarlo satisfecho. El definitivo recupera el baseline preexpand,
seguido del replay/provisión revisados; no conserva el estado Auth posterior,
ni demuestra restauración exacta de sus UUID Auth o sesiones nuevas. No se
debe presentar como un segundo respaldo postvínculos ni como recuperación
completa de todo Supabase. Se mantiene aprobación pendiente del vínculo
restante y de los checkpoints del cutover; no producción lista.

## Vinculación del único empleado existente — revisión previa, 19 de octubre

**Aprobados Plan readonly y PrepareCredential local** de
scripts/stage04-provision-existing-employee.ps1 estable. **Aprobado Apply una
vez, condicionado al Plan fresco satisfactorio y la credencial privada lista**:
único empleado activo existente sin vínculo, actor admin.gns ligado a la cuenta
Auth esperada, una cuenta Auth actual y ninguna identidad empleado.gns previa.
El UUID target se obtiene del único perfil comprobado, se valida como UUID y
se fija en journal/SQL; no se resuelve por nombre visible ni se inserta empleado.

Reviewer leyó el candidato y la RPC vigente. Credencial aleatoria de 32 bytes
de entropía/47 ASCII/cuatro clases se guarda PSCredential DPAPI CreateNew fuera
del repo con ACL privada; no se imprime ni copia al clipboard. Su entrega
privada al propietario/empleado sigue pendiente, no se considera realizada por
guardar el archivo. Apply reutiliza allowlist HTTP y controles de servicio
revisados, Admin API con email confirmado y admin_link_auth_account sobre el
perfil existente. SQL bloquea seis tablas, compara hash UUID/FK antes/después
en la transacción y verifica vínculo/auditoría tras COMMIT. Journal previo
CreateNew y estados actor/target/Auth impiden reentrega automática; incertidumbre
requiere Reconcile readonly y revisión, nunca recreate/reset/delete/retry.

Backend entregó AST, rechazo de argumentos desconocidos y 16 casos puros nuevos
del generador/gate PASS/2,95 s, sin credenciales reales, fuente o cuentas. No se
repiten suites de Auth/respaldo/expand. Tras Apply exigir
expected_employee_link_observed y conciliación fresca de UUID/FK/contenidos
legados antes de cutover; el hash interno del adaptador cubre UUID/FK, no todos
los contenidos de las tablas.

**Hallazgo medio de integración, separado del provisionamiento:** el smoke
CredentialKind=Employee actualmente busca stage04-initial-employee.clixml, pero
el candidato guarda stage04-existing-employee.clixml. Corregir referencia y
revisar esa delta antes del smoke empleado; no duplicar/copiar el secreto como
workaround. No bloquea Plan/Prepare/Apply. La preparación no acredita login,
MFA/RLS/Edge ni entrega privada; producción permanece pendiente.

## Empleado conciliado y composición del corte — 19 de octubre

Orquestador entrega Plan/PrepareCredential/Apply PASS, OperationId
d39133b506d848269166e6b50c641b39, con UUID existente/seis hashes/auditoría ACK;
Reconcile expected_employee_link_observed y lectura posterior de contenidos
legados/UUID invariantes, sin defectos o actividad inesperada. **Cerrado el
vínculo del empleado.** Se revisó la corrección de una literal del smoke para
usar stage04-existing-employee.clixml: hallazgo medio resuelto. **Aprobada rama
Employee del smoke** con el mismo alcance limitado de login/refresh/logout
local/rechazo de refresh, sin negocio, MFA u otras sesiones.

**Aprobado preparar y ensayar, no ejecutar remotamente aún**, la composición
atómica de cutover y security_operations. Las dos transacciones separadas
dejarían una ventana de permisos intermedios antes del mantenimiento/AAL2;
se evita con una sola transacción. Fuentes originales inmutables, hashes
dc022fe321d954b0ca656cf3cf9708d7a15207ba6af17f7f97d740dd4b861a87 y
ae06841c3730e6007ea1084c95410b444814772255a7b95b4f325ac8230c1c52.
Retirar únicamente COMMIT terminal de cutover y BEGIN inicial de security,
validando sus posiciones exactas y conservando los demás bytes y el COMMIT
final; no sustituir BEGIN internos de PL/pgSQL ni editar las migraciones.
Calcular hash de composición y colocar locks/timeouts dentro del BEGIN inicial.

El ensayo focal debe confirmar éxito conjunto con RLS/FORCE en seis tablas,
cero privilegios anon, columna PIN ausente y maintenance=true; y un fallo
provocado antes de COMMIT debe revertir ambos cambios conservando estructura
previa, sin consultar valores PIN. ACK incierto exige stop/conciliación, no
redelivery. No db push, nuevas migraciones o repetición de suites aprobadas.
La autorización de ejecución real de esa composición espera evidencia focal y
revisión de su implementador concreto. Producción y color siguen pendientes.

## Corte atómico y despliegue Edge — revisión previa, 19 de octubre

Smoke Employee real PASS/3,84 s entregado por Orquestador: login, identidad,
refresh, logout local y rechazo del refresh. Cerrado su subgate sin atribuir
MFA ni autorización de negocio.

**Aprobado Apply explícito de scripts/stage04-atomic-cutover.mjs**, sobre fuente
actual vinculada/conciliada, sesión TLS con actor/base verificados,
authorized=true y observer posterior fresco/separado con prueba real parseada.
Composición SHA256
20af70c475f2bf7799ce51567ca4809397d26e6565c4b3d30c772654949599bf.
Reviewer leyó el candidato completo: fija hashes originales, scanner externo,
dos límites validados/reconstrucción byte exacta, un BEGIN/COMMIT y locks ACCESS
EXCLUSIVE de seis tablas dentro de esa transacción. Backend entregó ensayo
aislado siete checks/4,16 s y tres casos mock adicionales de autorización,
ACK perdido y rechazo de booleano como proof; no suites previas repetidas.
Fallo final probado revierte cutover y suplemento, preserva columna PIN sin
leer valores; éxito exige RLS/FORCE seis, anon tabla/columnas cero, PIN ausente,
maintenance cerrado/inflight cero. Exigir close en finally; continuar sólo con
atomic_cutover_security_committed_maintenance_closed. Otro estado: stop y
conciliación sin redelivery, permisos anónimos ni fallback PIN.

**Aprobado Plan GET-only de scripts/stage04-deploy-admin-edge.ps1 después del
PASS anterior. ConfigureOrigin y Deploy quedan condicionados a ese Plan**:
maintenance=true/inflight=0, cero funciones admin-users existentes, hash exacto
de ALLOWED_ORIGIN HTTPS productivo y dos TS fijados por SHA. Reviewer leyó el
candidato y Backend/Orquestador entregó AST y 11 casos de guard HTTP PASS;
no se ejecutaron por Reviewer. Sólo configura ese origen público; claves de
servicio quedan en runtime backend, no frontend. Multipart de dos fuentes con
entrypoint/rutas relativos y metadata verify_jwt=true concuerda con la
[documentación oficial de despliegue Management API](https://supabase.com/changelog/33720-deploy-and-update-edge-functions-using-the-management-api).
No actualiza una función existente ni reintenta una mutación incierta.

ACK y GET ACTIVE/verify_jwt/version son prueba de despliegue, no de invocación
real ni compatibilidad efectiva del JWT asimétrico actual. Eso requiere smoke
posterior. Mantener mantenimiento cerrado después de desplegar; MFA/AAL2,
permisos negativos y aceptación Edge siguen como gates de apertura. No color,
frontend publication, push, Etapa 5 ni declaración de producción lista.

## Adaptador dedicado del corte aprobado — 19 de octubre

**Aprobado runApprovedAtomicCutover** añadido al runtime: autorización true y
SHA compuesto exacto antes de abrir procesos, inspección de hashes/reconstrucción
originales, sesión TLS con prestate readonly tipado (actor/base, columna PIN
presente, operaciones aún ausentes, dos activos vinculados/un admin/dos Auth,
cero factores TOTP verificados), ejecución del compositor revisado, observer
posterior fresco/separado y close en finally. Reviewer leyó la delta; Backend
entregó 21 checks puros nuevos y node check PASS sin procesos o fuente real.
No se repite el fixture atómico ni suites anteriores. Ejecutar una vez con
SHA20af70c475f2bf7799ce51567ca4809397d26e6565c4b3d30c772654949599bf;
continuar sólo con el estado de éxito cerrado ya definido. Excepción, ACK o
cleanup inciertos requieren lectura/conciliación, no retry ni asumir rollback.

Orquestador entregó revalidación real PASS/1,38 s del manifiesto definitivo
bcea..., hashes de database/roles/keywrapped, ACL privadas y recuperación DPAPI
de clave de 32 bytes. Los contenidos/UUID legados posteriores al vínculo ya
están conciliados y los runbooks registran reutilización controlada. Este
checkpoint de respaldo está satisfecho bajo esas condiciones, sin nueva captura
ni afirmar que el backup preexpand contiene el estado Auth postvínculos.
El permiso posterior del propietario para commit/push/publicación no sustituye
los gates Auth/RLS/MFA/Edge de apertura; no constituye su aceptación técnica.

## Corte atómico confirmado y conciliación del origen Edge — 19 de octubre

Orquestador entrega ejecución real con estado
atomic_cutover_security_committed_maintenance_closed, ACK/proof verdaderos y SHA
compuesto revisado. Lectura posterior concilia UUID y contenido legado de las
seis tablas, maintenance cerrado; Plan Edge comprueba cero funciones.
**Cerrado subgate real del corte atómico**, sin nueva repetición de pruebas.

ConfigureOrigin se detuvo tras un POST y no se reentregó. GET de conciliación
observó una entrada cuyo hash aparece bajo campo value, no digest. Reviewer
leyó la delta Test-AllowedOriginDigest: exige exactamente una fila y un único
campo value o digest, string de 64 hex igual al SHA del origen HTTPS fijo;
rechaza ambigüedad, texto plano, tipo/longitud/conteo incorrectos. Diez casos
focales y AST entregados PASS. No se imprime ningún valor de metadata.

**Aprobado GET Plan corregido.** Si confirma OriginDigestVerified=true,
maintenance cerrado/inflight cero y funciones cero, queda conciliado el POST
anterior: no repetir ConfigureOrigin. Deploy mantiene su aprobación condicional
original, seguido de ACK/GET ACTIVE/verify_jwt/version. Si el hash no coincide,
parar sin sobrescribir. Este cambio adapta el formato observado sin relajar la
comparación de origen ni las condiciones de apertura. Aún pendiente aceptación
real de Edge y MFA/AAL2; no producción lista.

## Edge desplegada y negativos con mantenimiento — 19 de octubre

Orquestador entrega GET de origen conciliado PASS/6,20 s, sin repetir POST;
Deploy PASS/6,90 s: una función admin-users, ACTIVE, verify_jwt=true y versión
coincidente por GET, fuentes fijadas. **Cerrado despliegue técnico de Edge**;
apertura/aceptación por token siguen separadas.

**Aprobado Scope=SecurityClosed de auth-production-smoke para Admin y Employee.**
Reviewer leyó la delta completa; AST, seis negativos de guard y tres casos de
arrays entregados PASS sin red/credenciales. Sólo GET select=id&limit=1 en seis
tablas y POST admin-users se agregan al transporte restringido. Arrays JSON
preservados permiten exigir 200 con cero filas o denegación explícita para la
sesión autenticada; anon exige 401/403. POST negativo usa UUID sintético ajeno
a perfiles reales y rol empleado, sin Origin, exigiendo anon 401 y token AAL1
403/mfa_required. Ese gate en TS aprobado precede payload/admisión/mutaciones.
Logout se limita a la sesión creada por la prueba, sin repetir refresh suite.

Éxito permite afirmar anon negado, sesiones AAL1 sin filas bajo mantenimiento
actual y JWT real admitido hasta el handler que exige MFA. No prueba aún
mantenimiento para administrador AAL2, enrolamiento MFA, cuotas remotas o acceso
positivo de negocio. BusinessMutationExecuted=false sólo se entrega después
de los rechazos esperados; si el flujo falla, parar/conciliar sesión y resultado
sin esa afirmación. Mantener maintenance=true; no producción lista ni color.

## Corrección focal de QR MFA y entrada manual — 20 de octubre

**APROBADO el arreglo local del QR y fallback manual**, sin hallazgos
bloqueantes/altos introducidos. Alcance revisado: AdminMfa.jsx, mfa-qr.js,
clases mfa de index.css, pruebas unitarias y dos E2E afectados. No cambia
enroll/challenge, contratos Auth, roles, RLS o mecanismos de autorización.

El helper transporta el SVG original de Supabase codificándolo una vez cuando
es SVG crudo o el prefijo SDK contiene SVG sin escape; evita que # se trate
como fragmento. Conserva sin recodificar URI ya escapada/base64, sin generar
otra matriz QR ni otpauth. Presentación responsive con fondo blanco y margen
en ambos temas. La entrada manual muestra la misma semilla TOTP del proveedor
en details explícito, label/input readonly e instrucciones basadas en tiempo;
sólo estado React, sin storage, clipboard o logs. Se limpia al verificar,
reiniciar enrolamiento o cerrar sesión; no se promete borrado físico de RAM.

Evidencia entregada por Orquestador/Tester: unitarias 5/5, ESLint del alcance
PASS, build PASS/91 módulos (warning de tamaño preexistente), dos E2E focales
PASS/11,6 s y diff check PASS con avisos CRLF. E2E comprueba carga del SVG
sintético con #, payload exacto/sin fragmento, entrada manual, OTP inválido y
válido, ausencia de semilla en storage/log, limpieza al verificar/logout,
responsive y Axe en ambos temas. Usa vector RFC público, no semilla real.
Primer intento E2E no llegó a ejecutar casos por espera del servidor en el
entorno restringido; reejecución focal justificada. Cleanup entregado: sin
listeners de prueba en 4173/4174, sesión local del usuario preservada.

Reviewer inspeccionó código y pruebas sin ejecutar suites ni acceder a QR,
semilla o OTP reales. No se afirma escaneo por cámara con estas pruebas. El
propietario informó MFA configurado, pero el gate real de factor verificado/
sesión AAL2 queda sujeto a lectura de metadatos del servidor; Docker apagado
impidió el primer intento de esa lectura, sin ser fallo de esta corrección.
Los PASS anteriores se conservan. Mantenimiento sigue cerrado; esta aprobación
no abre servicio ni sustituye gates positivos por rol/Edge o revisión posterior
de publicación y color. No producción lista.

## MFA confirmado y publicación del cliente cerrado — 20 de octubre

Orquestador entrega lectura de metadatos: un TOTP administrativo verificado,
una sesión AAL2, maintenance=true e in_flight=0. **Confirmado el enrolamiento y
existencia de sesión AAL2**, sin leer factores/semillas/tokens ni afirmar todavía
aceptación positiva de todos los permisos. Los negativos SecurityClosed reales
Admin/Employee previos fueron PASS: anon denegado en seis tablas/Edge, AAL1 sin
filas y Edge mfa_required con bearer real, logout de sus sesiones propias.

**Sin bloqueante nuevo para publicar el cliente Auth manteniendo mantenimiento
cerrado**, dentro de la autorización posterior de commit/push del propietario.
Reviewer inspeccionó vercel.json: única delta deploymentEnabled false a true,
integración GitHub–Vercel existente y main verificados por Orquestador; no nuevo
proyecto/CLI. Cambios MFA aprobados y lint/build focales PASS se conservan;
no se exige repetir suites por esa configuración de publicación.

Se reevaluó el delta del factor frente al respaldo: el definitivo 2abb no
contiene factores/sesiones nuevos. La recuperación de este factor es reset
privilegiado y reenrolamiento del propietario, mediante el procedimiento Auth
real aislado previamente probado y las credenciales/PAT/journals accesibles;
no restauración de su semilla desde ese backup ni retorno a PIN/anon. Esta
distinción debe constar operativamente; no exige otra captura completa para
publicar el cliente cerrado. No se declara recuperación integral de Supabase.

Después de publicar, comprobar commit/artefacto/origen y color OFF, y aceptación
real AAL2/negocio/Edge antes de maintenance=false. La apertura no está aprobada
por este párrafo. Observación documental baja: el runbook Vercel conserva una
frase histórica de vinculación CLI pendiente pese al header vigente; retirar
esa parte para coherencia, sin ejecutar CLI ni bloquear la publicación.
Color continúa independiente/posterior; no Etapa 5 ni producción lista.
