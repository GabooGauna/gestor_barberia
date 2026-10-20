# Etapa 4 — Desbloquear acceso de gestión

Acceso resuelto en esta reanudación: el propietario guardó el token; DPAPI/ACL
verificados y GET de proyecto/Auth/backups exitosos. No repetir la captura.
Ref correcto `ucmwykzrepmjucssjnum`; nombre interno Supabase `barberia-sop`,
aplicación GNS Hair Studio. El procedimiento siguiente queda para referencia.

Checkpoint posterior al commit local `10bc305`, 18 de octubre de 2026.
MCP de proyecto responde, pero GET Management API de proyecto, Auth y backups
devuelve 403. El mensaje del proveedor indica privilegios insuficientes.
No permite distinguir por sí solo permisos de cuenta de scopes del token.
No es un error de herramientas de cuenta deshabilitadas por project_ref.

## Intervención mínima del propietario

1. Entrar a [Access Tokens de Supabase](https://supabase.com/dashboard/account/tokens)
   con una cuenta que tenga acceso de administración a GNS Hair Studio.
2. Crear un token con alcance **sólo** proyecto `ucmwykzrepmjucssjnum`, vencimiento
   acorde a la operación, y permisos para el despliegue autorizado:
   - Read-write: Project Settings, Auth Config, Edge Functions y Edge Function Secrets.
   - Read: Backups, API Keys, API Key Secrets, Database Config, Data API Config,
     Realtime Config, Storage Config, SSL Enforcement y Network Restrictions.
   No se necesitan permisos de organización, facturación, contratación o gestión
   de otros proyectos. Si la cuenta no puede otorgarlos, un propietario/admin
   del proyecto debe resolver el acceso; no se intenta ampliar permisos por SQL.
3. En PowerShell bajo el mismo usuario Windows, desde el repositorio, ejecutar:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\stage04-store-management-token.ps1
```

4. Introducir el token únicamente en el prompt oculto. Responder al chat sólo
   «Token de gestión guardado». No modificar .env, Vercel ni configuración MCP.

La captura usa SecureString/DPAPI del usuario actual y ACL titular/SYSTEM;
reutiliza los helpers revisados de la credencial DB. Sólo acepta el destino
`%LOCALAPPDATA%\GestorBarberia\secrets\stage04-management-token.clixml`, exige las
carpetas seguras ya existentes, rechaza reparse/repositorios/sincronización y
no sobrescribe archivos. No cambia el token de entorno anterior, hace conexiones
ni consulta credenciales PostgreSQL o claves del backup. El consumidor importará
el archivo bajo ese mismo SID, validará estructura/ACL y probará primero sólo GET.
El almacenamiento no demuestra que los permisos del token sean suficientes.

La matriz de scopes se contrastó con la [documentación oficial de PAT](https://supabase.com/docs/guides/platform/personal-access-tokens).
La capacidad del token depende también del rol de su titular. Read-write de
Project Settings es dependencia documentada de actualizar Auth Config; no implica
autorización para borrar/pausar/recrear proyectos ni ejecutar otras operaciones.
Los secretos se usarán sólo en runtime seguro, sin volcarlos a informes.

## Continuación del operador

Primero GET de identidad/configuración autorizada, proyectar únicamente ajustes
no secretos para revisar el candidato y preservar referencias seguras de lo
necesario para recuperación. No imprimir respuestas completas de Auth/API Keys.
Luego completar los gates pendientes de restauración/mantenimiento, y sólo
entonces ejecutar la cadena específica ya autorizada. Este token no sustituye
el respaldo definitivo bajo suspensión de escritores ni la aprobación técnica.

Origen de producción informado por el propietario y GET público 200:
`https://gestor-barberia-five.vercel.app`. La presencia y valores de las tres
variables Vercel fueron confirmados por el usuario, aún sin inspección remota.
Color debe seguir false hasta validar Auth y aplicar su migración independiente.
No push ni publicación en esta intervención de acceso.
