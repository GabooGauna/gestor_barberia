# Etapa 4 — Introducir la contraseña PostgreSQL sin compartirla

Proyecto autorizado: `ucmwykzrepmjucssjnum` (GNS Hair Studio). Preparación local;
no realiza conexiones, respaldos, migraciones ni cambios en Supabase.

## Intervención del propietario

1. En Supabase, abrir Connect → Direct → Session pooler del proyecto correcto.
   Identificar sólo el hostname de la conexión, con formato
   `aws-<indice>-<region>.pooler.supabase.com`. No copiar la URI con contraseña.
2. Abrir PowerShell con el mismo usuario de Windows que utiliza Codex. Ejecutar:

```powershell
Set-Location 'C:\Users\gauna\OneDrive\Escritorio\Gestor Barberia\gestor-barberia'
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\stage04-store-db-credential.ps1
```

3. Introducir el hostname cuando se solicite. Introducir la contraseña nueva
   sólo en el prompt oculto del script, sin comillas ni codificación de URI.
   El usuario de conexión queda fijado como
   `postgres.ucmwykzrepmjucssjnum`, base `postgres`, puerto de sesión 5432.
4. Confirmar únicamente el mensaje de guardado. En el chat responder «Credencial
   guardada», o el error sin secretos. No mostrar el archivo ni su contenido,
   no pegar la contraseña, URI, screenshot del secreto o salida de descifrado.

La política de ejecución indicada se limita al proceso iniciado; no cambia
configuración global. Si una política corporativa bloquea el script, informar
ese error y resolverlo mediante el responsable; no desactivar políticas globales.

## Almacén y límites

El script guarda un objeto de credenciales cifrado mediante DPAPI de Windows
en `%LOCALAPPDATA%\GestorBarberia\secrets\stage04-postgres.clixml`, fuera del
repositorio y de OneDrive, con ACL restringida. No acepta el secreto como argumento,
no lo imprime, no lo añade a una variable de entorno persistente ni al historial.
El hostname y metadatos no son secretos; la contraseña queda como SecureString.
No sobrescribe un archivo previo ni sigue rutas de enlace aceptadas a ciegas.

Sólo el mismo usuario/equipo puede descifrar ese almacén. No es un mecanismo
para conservar backups a largo plazo ni su clave de recuperación: esa clave
requiere custodia separada y comprobación propia. No cambiar de usuario Windows
ni copiar el CLIXML a otro equipo esperando que funcione allí.

La ejecución de este script no valida que la contraseña sea correcta. El siguiente
paso del agente será importar el almacén bajo el mismo usuario autorizado y probar
una conexión TLS de lectura al Session pooler, sin credenciales en argumentos o
logs. Esa importación deberá ejecutarse bajo el mismo SID Windows y fuera del
AppContainer, mediante la ejecución autorizada correspondiente; no se ampliará
el ACL al sandbox para facilitar el acceso. La metadata requiere `verify-full`:
falta comprobar confianza CA e identidad TLS, sin bajar el nivel para conectar.
No se usa la contraseña PostgreSQL para iniciar sesión como empleado/admin
ni para sustituir secretos Auth/Edge.

## Continuación condicionada

Estado vigente posterior: contraseña y CA guardadas; TLS `verify-full` funciona
y el respaldo preparatorio `ab70bce0fa53469f8f8659c4564970ba` ya existe. No repetir
ingreso de credencial/CA ni captura. Clave del respaldo recuperada por DPAPI y
GCM/hashes verificados; restore PostgreSQL aislado y comparación observacional
de conteos/UUID/FK y metadatos de roles PASS. Se corrigió el contexto bootstrap
de roles, con adaptación única documentada. No acredita todo Supabase ni RPO 0.
Ver `../reviews/stage-04-existing-backup-recovery.md`.
El checkpoint siguiente conserva la cronología del primer fallo, ya resuelto.

Checkpoint real del 18 de octubre: almacén importado y ACL verificadas. La
primera conexión `verify-full` con raíces del sistema falló por validación TLS.
Antes de reintentar, descargar la CA oficial desde Database Settings → SSL
Configuration y seguir `../reviews/stage-04-session-pooler-tls-checkpoint.md`.
No volver a capturar contraseña ni reducir TLS para sortear el fallo.

Con acceso disponible: captura manual opaca y cifrada fuera del repositorio,
inventario y hash/etiqueta de autenticación, restauración aislada y controles de
integridad, configuración/contención y recuperación. Un dump SQL no conserva por
sí solo objetos Storage, Edge, configuración Auth/JWT, secretos o toda la
plataforma. Los gates del runbook siguen vigentes.

Sólo entonces cadena específica expand → bootstrap/vínculos → conciliación y
checkpoint → cutover → suplemento operativo → Edge/frontend/MFA → verificaciones
reales y apertura. Tras aprobar autenticación se aborda color como operación
independiente. Sin `db push` indiscriminado, push ni Etapa 5.

Referencias primarias: [Export-Clixml y DPAPI](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/export-clixml?view=powershell-5.1),
[conexión y Session pooler](https://supabase.com/docs/guides/database/connecting-to-postgres),
[respaldo y restauración Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
