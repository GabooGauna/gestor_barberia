# Revisión independiente de entrada local de credenciales — Etapa 4

Fecha: 18 de octubre de 2026. Dictamen: **APROBADO el helper para ejecución
manual por el titular Windows, con los límites documentados**. No certifica
un almacén real ya creado, conexión TLS, respaldo, restauración o despliegue.
La contraseña real todavía no fue introducida en esta preparación.

## Alcance y evidencia

Reviewer independiente de Backend y Orquestador. Se revisaron
`scripts/stage04-store-db-credential.ps1`, el procedimiento
`../runbooks/stage-04-secure-db-input.md`, el ADR
`../decisions/stage-04-manual-backup-and-color-authorization.md`,
`stage-04-secure-input-preparation.md` y las actualizaciones de contexto,
runbook de respaldo, aceptación Auth y contrato de color.

Tester/Backend entregan parseo AST en Windows PowerShell 5.1 y PowerShell
7.6.5, roundtrip sintético de PSCredential anidado mediante Export/Import-Clixml,
sin secreto sintético en texto claro y con SecureString restaurado. Entregan
también casos de hostname válido e inválidos. Orquestador verificó AST y
validador extraído sin ejecutar el cuerpo: un válido y cinco inválidos, exit 0.
Diff-check documental informado: exit 0. Reviewer inspeccionó el código final;
no repitió pruebas ni hizo conexiones remotas o captura de credenciales.

## Controles del helper

- Sólo Windows, sin argumentos, sin llamadas de red/DB ni URI de conexión.
  La contraseña se solicita con Read-Host AsSecureString y se conserva en un
  PSCredential; no se construye texto claro, argumento ni variable de entorno
  para el secreto. La salida no incluye objetos de credenciales ni excepciones
  con sus valores.
- Almacén DPAPI del usuario/equipo en LocalApplicationData, fuera de Git y
  OneDrive; rechaza rutas no locales y reparse points. No es una clave portable
  ni el mecanismo de cifrado/recuperación del futuro respaldo.
- Directorios restringidos antes de exportar; propietario SID del usuario y
  SYSTEM, sin herencia ni otras reglas. El código vuelve a comprobar ACL,
  estructura y rutas. Archivo temporal CreateNew, movimiento sin sobrescritura
  y negativa ante un destino existente. Ante error, no elimina archivos previos.
- Hostname DNS de pooler validado; usuario/proyecto, base y puerto de sesión
  fijados. `SslMode=verify-full` consta tanto al guardar como al validar la
  estructura. Ese metadato NO demuestra certificado, CA, servidor correcto,
  contraseña válida o permisos: la conexión futura debe verificarlos sin
  degradar TLS para obtener acceso.

No se encontraron hallazgos bloqueantes/altos nuevos en el helper o las
instrucciones revisadas.

## Límites que deben conservarse

No se ejecutó el flujo completo con el titular ni se validó su archivo real.
El ensayo de ACL restringida impidió acceso al proceso AppContainer; es correcto
no ampliar permisos para acomodar el sandbox. La importación posterior debe
usar el mismo SID fuera de AppContainer por el canal de ejecución autorizado.
El usuario introduce host/secreto localmente y comunica únicamente resultado;
no se solicitan contraseña, URI, capturas ni CLIXML en el chat.

La limpieza comprobada corresponde al roundtrip DPAPI sintético. No se afirma
limpieza global de los directorios vacíos/inaccesibles del primer ensayo ACL;
no contienen secretos según la evidencia recibida. **Bajo, pendiente operativo:**
identificar esos paths y comprobar/cerrar su limpieza de forma acotada, sin
relajar el ACL del almacén ni borrar árboles a ciegas.

**Addendum de seguimiento, 18 de octubre: bajo cerrado.** Orquestador comprobó
fuera de AppContainer los dos paths exactos de ensayo entregados por Backend,
terminados en `stage04-dpapi-check.59e3870ee58a47838cc7fdfbc258a3ec` y
`stage04-dpapi-check.39aef38110f2483584a799c67af167a7`. Get-Item con Force,
ErrorAction Stop y captura específica de ItemNotFoundException informó ambos
ya ausentes, exit 0. Reviewer revisó esa evidencia en
`stage-04-secure-input-preparation.md`; no ejecutó otra inspección. No hubo
borrado, operación recursiva ni cambio de ACL. El cierre se limita a esos
dos paths y no afirma limpieza global ni ejecución integral del capturador.

## Alcance actualizado y siguiente checkpoint

El propietario autorizó respaldo manual cifrado fuera del repositorio por
Session pooler y restauración aislada. Sustituye la anterior limitación a backup
administrado por proveedor. Un respaldo completo puede transportar contenido
sensible como flujo opaco: no habilita consultar, mostrar o usar valores PIN,
hashes, tokens o filas reales innecesarias. Persistir sólo ciphertext y custodiar
la clave recuperable aparte. Un dump SQL no prueba restauración de toda Supabase.

También está autorizada la operación independiente de `rutinas.color`, sólo
después de validar Auth/RLS/seguridad en producción. La capacidad sigue OFF
hasta verificar su propia migración y frontend; no se incluye en el lote Auth.
Los dictámenes anteriores reflejan sus alcances históricos y no se reescriben.

Handoff al Orquestador: entregar las instrucciones de ejecución humana ya
revisadas. Después verificar almacén/ACL bajo contexto autorizado y conexión
TLS de lectura; continuar captura cifrada, restauración e inventario integral
sólo con condiciones verificadas. Persisten Auth/configuración/antiabuso,
contención de todos los escritores, custodia, primer admin, hosting e integridad.
No hubo respaldo real ni despliegue por esta preparación, y producción sigue
sin certificar. No se autoriza push ni Etapa 5 ni se pide repetir permisos ya
otorgados para el mismo alcance.
