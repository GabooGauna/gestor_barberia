# Revisión independiente previa al restore aislado — Etapa 4

Fecha: 18 de octubre de 2026. Dictamen: **APROBADA la ejecución local aislada
del backup existente `ab70bce0fa53469f8f8659c4564970ba`** mediante la versión
revisada de `scripts/stage04-isolated-restore.ps1`. No aprueba otra captura,
restauración en producción, migraciones ni recuperación integral de Supabase.
Este dictamen previo no afirma que el restore real ya haya pasado.

## Alcance y evidencia

Reviewer independiente de Backend y Orquestador. Se revisó el script completo,
incluido el agregado final de conteos/hashes UUID/FK de las seis tablas, y las
funciones que reutiliza del capturador/intake ya revisados. Se conservan
`stage-04-backup-pipeline-review.md` y
`stage-04-backup-candidate-validation.md`, sin repetir sus pruebas.

Backend entregó AST PowerShell 5.1/7 y el probe autorizado del bootstrap
extraído de la versión final: exit 0, 3,325 s, sin archivo real ni secretos.
Se verificaron arranque, las cinco versiones default de extensiones requeridas,
aislamiento inspeccionado y cleanup exacto. El cambio posterior sólo añadió
la consulta agregada; Backend informó nuevo AST sin repetir bootstrap.
Reviewer inspeccionó código/evidencia recibida, sin ejecutar el script, importar
claves o credenciales, descifrar datos ni consultar remoto.

## Controles que permiten el ensayo

- BackupId restringido, paths fijos fuera de Git/OneDrive, no reparse y ACL
  del titular/SYSTEM. No se elige otro backup automáticamente ni se importa
  el almacén de contraseña PostgreSQL. La única clave necesaria es la DPAPI
  del backup existente.
- Se validan manifiesto, tamaños y hashes de ciphertext/clave; AES-GCM se
  autentica antes de emitir plaintext y se comprueban longitud/hash del dump
  y roles antes de cargarlos. Los bytes descifrados permanecen en memoria.
- Docker local comprobado y endpoint fijado. Imagen Supabase PostgreSQL
  17.11.0.004 fijada por digest
  `06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108`.
  Manual initdb evita roles iniciales de plataforma; bootstrap aleatorio
  permite restaurar los roles originales sin colisiones ni filtrarlos.
- Antes de datos reales se inspecciona el contenedor: red none, log-driver
  none, filesystem sólo lectura, sin binds u otros montajes persistentes,
  datos/socket/tmp en tmpfs y swap del contenedor deshabilitado. Usuario
  postgres UID 100/GID 101, sin capacidades ni privilegios nuevos. No hay
  password de producción, servicio Auth o ruta de conexión al origen en él.
- Escucha TCP PostgreSQL vacía, sockets privados, autenticación host reject,
  logging collector apagado y diagnósticos no impresos. El wrapper drena
  salida/error mientras entrega el archivo por stdin. SQL/errores crudos
  no se convierten en evidencia pública.

La inspección y los defaults de extensiones constituyen gates: falta o drift
detienen sin excluir objetos. Roles se cargan sin reescribirlos; pg_restore
usa clean/if-exists, exit-on-error y una transacción sobre el contenedor
descartable, nunca sobre el proyecto remoto. Una incompatibilidad real debe
diagnosticarse y revisarse; esta aprobación no garantiza que toda dependencia
del proveedor vaya a restaurarse correctamente.

## Verificación, limpieza y límites

La consulta agregada lee sólo UUID/FK y conteos de negocio, sin PIN, nombres,
contenido de tareas ni secretos Auth. Incluye tablas vacías, orden nativo de
UUID y tuplas JSONB que conservan null. Genera hashes reproducibles sin emitir
identificadores individuales. No compara por sí sola contra el origen y no
declara igualdad de todos los campos o filas.

El script mantiene SourceCatalogComparisonVerified y UuidRowReconciliationVerified
en false. Si Orquestador compara después con lecturas actuales del origen,
debe registrar que sin freeze no son necesariamente el mismo snapshot. No
se interpreta una diferencia como pérdida de datos ni se promete RPO 0.

El reporte de éxito sólo se escribe tras confirmar ausencia del contenedor
exacto; errores de restore o cleanup impiden ese PASS. Se limpian los arrays
sensibles. Swap del contenedor deshabilitado no excluye paging del host:
HostPagingExcluded permanece false, dentro de la confianza del custodio en
la estación Windows. No se promete eliminación de copias privilegiadas del OS.

PG restore exitoso no demuestra GoTrue/Auth HTTP, factores utilizables, sesiones,
claves de plataforma, Storage, Edge o configuración recuperados. Propiedades/
owner/ACL/settings DATABASE, comparación de fuente, custodia portable, RPO y
RTO integral siguen sin verificar y así lo refleja el reporte. No se cambia
el manifiesto de captura para aparentar esos gates satisfechos.

No se encontraron hallazgos bloqueantes/altos nuevos para este ensayo aislado.
Handoff al Orquestador: ejecutar sólo el BackupId indicado y documentar exit,
resultado de integridad/catálogos y cleanup sin datos sensibles. Ante fallo,
mantener parada, revisar corrección y revalidar sólo lo afectado; no obtener
otro backup ni ampliar a producción por este permiso. La apertura Auth y la
operación posterior de color conservan sus gates independientes; sin push
ni Etapa 5.

## Addendum — fallo de roles y diagnóstico acotado

Tras la aprobación previa, Orquestador informó un primer intento interrumpido
por Docker detenido y otro intento del mismo backup detenido en
`restore_all_roles_without_passwords`. En el segundo pasaron hashes, GCM,
recuperación de clave y dependencias; no hubo reporte PASS ni cambios remotos.
Esto no demuestra todavía restore completo ni permite atribuir una causa de
compatibilidad sin diagnóstico.

**APROBADO el reintento diagnóstico exclusivamente aislado del mismo BackupId.**
Reviewer inspeccionó la modificación mínima: psql usa VERBOSITY=sqlstate;
Get-SafeRestoreDiagnostic reconoce líneas completas con códigos conocidos,
operación/categoría constantes y número de línea acotado. No devuelve SQL,
nombres de roles ni texto de error. Lo desconocido queda none/unclassified.
La excepción transporta sólo ese protocolo y el catch final vuelve a validarlo.
Cleanup conserva el fallo primario y agrega un eventual problema de limpieza,
en vez de reemplazar su diagnóstico. No se filtra, reescribe o repara el archive
automáticamente y el aislamiento anterior permanece.

Backend entregó AST PowerShell 5.1/7 y cinco casos puros de la función
diagnóstica, incluidos marcador de contenido sensible y código desconocido,
sin Docker, credenciales o archivo real. Reviewer no repitió pruebas. No se
encontraron hallazgos bloqueantes/altos nuevos en esta delta; un código seguro
observado no autoriza por sí solo una corrección del restore.

La decisión posterior del propietario identifica al propio titular como
custodio principal y posterga suplente, bóveda y ubicación definitiva. No se
añaden esos trámites como bloqueos administrativos de este ensayo. Se mantiene
la exigencia de backup recuperable y clave segura/accesible antes de producción;
DPAPI ya permitió recuperar la clave en este equipo, pero no protege frente a
pérdida del usuario/equipo ni demuestra custodia portable. La recuperación SQL
completa, Auth/configuración y restantes gates técnicos siguen pendientes.

## Addendum — línea de entrada y clasificación segura

Orquestador entregó el tercer resultado: SQLSTATE 42501, sin número de línea,
sin PASS ni cambios remotos. Reviewer revisó
`stage-04-existing-backup-recovery.md` y los checkpoints de auth-cutover,
backup-continuity y secure-db-input. Distinguen el respaldo existente de un
restore aún fallido, la observación de fuente posterior del snapshot original
y el constraint global no validado del alcance público anterior. Signup activo
y hosting/origen HTTPS ausente siguen siendo gates técnicos, sin inferir MFA
del campo que no devuelve settings. La decisión del custodio no añade trámites
de bóveda/suplente para continuar este ensayo.

**APROBADO el siguiente reintento diagnóstico del mismo archivo, sólo aislado.**
La delta revisada añade `--file=-` exclusivamente al psql de roles, junto a
single-transaction. El archivo completo sigue por stdin, sin filtrar/reparar
sentencias. También habilita el modo documentado de psql para números de línea
y la combinación de single-transaction con file; no se atribuye la causa del
42501 a esa precisión. [PostgreSQL 17: opciones psql](https://www.postgresql.org/docs/17/app-psql.html).

Get-SafeRoleStatementKind examina únicamente la línea indicada en memoria y
devuelve una clase enumerada, nunca texto SQL, identificadores o valores GUC.
Continuaciones no reconocidas quedan unknown. El protocolo final valida esa
enumeración y los campos seguros anteriores; no habilita una reparación según
el código/clase obtenidos. No cambia aislamiento, descifrado ni contenido
del archivo restaurado.

Backend entregó AST PowerShell 5.1/7 y seis casos puros de diagnóstico/línea,
incluido marcador privado no emitido, línea desconocida/cero y alias stdin/dash;
sin Docker, archivo real o credenciales. Reviewer leyó la delta, sin repetir
pruebas ni ejecutar remoto. No hay hallazgos bloqueantes/altos nuevos para este
reintento. La recuperación completa y la corrección precisa de roles siguen
pendientes hasta obtener evidencia; no se declara restore aprobado funcionalmente.

## Addendum — identidad bootstrap y excepción única de replay

El ensayo diagnóstico devolvió `42501`, línea 117, `grant_membership`, con
cleanup confirmado. Orquestador entregó metadata de origen obtenida en sólo
lectura: `supabase_admin` es el bootstrap OID 10 y grantor de membresías;
`postgres` no es superusuario. Backend reprodujo el fallo con bootstrap
distinto y reprodujo el éxito del mismo GRANT sintético usando la identidad
bootstrap correcta. No se atribuye el fallo a corrupción del respaldo.

**APROBADO otro ensayo exclusivamente aislado del backup existente
`ab70bce0fa53469f8f8659c4564970ba`, con la receta revisada.** Esta aprobación
sustituye la receta bootstrap aleatoria y la afirmación de replay de roles
sin adaptación de los apartados anteriores; conserva su carácter histórico.

Reviewer inspeccionó el script actual. initdb usa `supabase_admin` y, antes
del replay, exige OID 10, SUPERUSER, CREATEROLE y actor/session correctos.
Get-LocalBootstrapRoleReplay exige exactamente una línea canónica
`CREATE ROLE supabase_admin;` (también acepta su identificador citado) y deja
esa sentencia vacía en un array derivado en memoria, conservando los saltos
de línea. Cero o dos coincidencias detienen el ensayo. No modifica el archivo
cifrado ni las demás sentencias, ALTER, configuraciones o GRANT. El diagnóstico
clasifica los bytes realmente ejecutados y el array derivado se limpia al salir.

El reporte registra `RolesRestoredUnfiltered=false`, la excepción de una sola
sentencia y hashes original/ejecutado diferentes, sin presentar la adaptación
como replay literal. La nueva integridad de roles agrega hashes de atributos
y membresías normalizados por nombres y opciones, evitando comparar OIDs
ordinarios que pueden variar. Configuración sólo compara presencia/conteos;
no valores GUC. `SourceRoleComparisonVerified` continúa false: la comparación
externa y la fidelidad de configuración no se dan por demostradas.

Evidencia Backend recibida: fixture aislado de aproximadamente 5,48 s, fallo
42501 con bootstrap distinto y PASS con bootstrap OID 10, conservando
ALTER/GUC/GRANT, grantor y opciones; cleanup de ambos contenedores confirmado.
AST PowerShell 5.1/7 y casos puros verificaron original intacto, replay exacto,
líneas conservadas y rechazo de cero/dos coincidencias. No usaron el respaldo,
la clave ni el origen real. Reviewer revisó código y evidencia sin repetirlos.

No se encontraron bloqueantes/altos nuevos para este ensayo. Aislamiento,
hash/GCM, archivo de base completo y gates de cleanup se conservan. La próxima
ejecución debe informar resultado real y reconciliación con origen sin
valores sensibles. Esta aprobación no declara restore PASS, recuperación
completa de Supabase Auth, RPO 0, RTO integral ni producción habilitada.

## Resultado final del ensayo PostgreSQL — 18 de octubre

**APROBADO el resultado acotado de restauración PostgreSQL y conciliación
observacional.** Orquestador entregó exit 0, duración local 5,4256 s y DrillId
`61ead80090684621b20e695466d4a16f` sobre el mismo BackupId. Se confirmó cleanup
del contenedor exacto antes de emitir PASS; el reporte mantiene la excepción
única CREATE y `RolesRestoredUnfiltered=false`. No hubo otra captura ni cambios
remotos de despliegue.

Reviewer revisó el resultado documentado en
`stage-04-existing-backup-recovery.md`, el estado vigente de PROJECT_CONTEXT
y los checkpoints de los runbooks. La evidencia entregada registra coincidencia
de los seis conteos y hashes UUID/FK: 2 empleados, 5 rutinas, 53 tareas,
3 asignaciones, 45 auditorías y 4 urgencias. Coinciden schemas y agregados de
45 tablas, 35 FK, 1 constraint no validado, 0 policies, 25 tablas con RLS y
4 funciones del alcance inventariado. Coinciden 30 roles, hashes de atributos,
24 membresías con otorgantes/opciones y presencia/cantidad de configuración.
Estos últimos controles no comparan valores GUC ni contraseñas. Los 25 RLS
globales no contradicen que las seis tablas de negocio aún carecen de RLS.

Los reportes de restore/comparación quedan fuera del repo con ACL restringida.
Reviewer revisó la evidencia estructurada entregada por Orquestador y su
documentación, sin volver a descifrar archivos, ejecutar ensayos ni consultar
el origen. No se atribuye una segunda ejecución independiente de esos controles.
Los fallos anteriores quedan como cronología, superados por este resultado.

No hay hallazgos bloqueantes/altos nuevos en el alcance revisado. Queda probado
un restore SQL del respaldo preparatorio y la conciliación delimitada contra
observaciones posteriores, sin freeze compartido. No demuestra igualdad de
todo contenido, ACL individuales o propiedades/owner/ACL/settings DATABASE.
Auth HTTP/MFA/JWT y claves utilizables, servicios/configuración externos,
RPO 0, RTO integral, contención de todos los escritores y respaldo definitivo
de corte permanecen pendientes. La duración local no es RTO de Supabase.

Se respeta que el propietario pospone suplente/bóveda/ubicación definitiva;
no se incorporan como trámites nuevos. Sigue explícito el riesgo de pérdida
del equipo/usuario DPAPI. Sin hosting/origen HTTPS y demás gates indispensables
verificados, el éxito PostgreSQL no habilita migraciones, cuentas, cambios
Auth/RLS, Edge o frontend de producción. Color conserva su orden posterior
a Auth validada; no push ni Etapa 5.
