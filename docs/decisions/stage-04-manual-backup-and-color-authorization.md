# Etapa 4 — Respaldo manual y color como operación posterior

Decisión del propietario, 18 de octubre de 2026, en este mismo chat.

## Alcance vigente

Se autoriza utilizar la contraseña PostgreSQL recién restablecida mediante el
Session pooler del proyecto `ucmwykzrepmjucssjnum` para crear un respaldo manual
cifrado fuera del repositorio, verificar integridad y restaurarlo en aislamiento.
Debe cubrir esquemas existentes `public`, `private`, los datos Auth necesarios,
roles y permisos, con inventario de componentes de plataforma fuera del dump.
`private` aún ausente en el último baseline se registra como tal y se incorpora
en los checkpoints posteriores a expand; no se crea para aparentar cobertura.

Esta solicitud sustituye la limitación anterior del runbook a respaldos sólo
administrados por el proveedor. El archivo completo contiene datos sensibles:
la captura debe tratarlos como un flujo opaco, cifrar antes de persistir, no
mostrar ni inspeccionar valores PIN, credenciales/hashes, tokens o filas reales
innecesarias. No se sustituye el PIN por una contraseña ni se utiliza para
provisionar cuentas. No se denomina completo a un export que omite información
necesaria para recuperar el estado y no documenta sus limitaciones.

Se conserva la aceptación explícita de cambio propio por API directa con Auth
nativo. El despliegue Auth/RLS/Edge continúa condicionado a backup, restore y
recuperación viables, configuración/contención verificadas y validaciones reales.
Resetear PostgreSQL no resuelve por sí mismo los 403 de Management API, no entrega
credenciales Auth/Admin API y no acredita acceso de hosting o MFA del titular.

## Entrada segura y checkpoint actual

Actualización posterior: el titular ya guardó la credencial y su importación
DPAPI/ACL pasó. La conexión se detuvo en validación TLS antes de autenticar;
falta la CA oficial según `../reviews/stage-04-session-pooler-tls-checkpoint.md`.
Los párrafos siguientes conservan el estado previo a la captura local.

La nueva contraseña aún no fue facilitada al proceso. El usuario debe introducirla
en un prompt local oculto, nunca chat, archivo del repositorio, URI en argumentos,
historial o logs. Se prepara `scripts/stage04-store-db-credential.ps1`: almacén
DPAPI Windows fuera del repositorio, para el mismo usuario/equipo, con permisos
restringidos. Es un almacén local de conexión, no el cifrado ni la clave de
recuperación del backup. No se cambia configuración remota al ejecutarlo.

Hasta que exista ese acceso no se puede afirmar conexión Session pooler, captura,
restore ni despliegue ejecutados. Tampoco se promete que SQL solo permita recuperar
Storage, Edge, configuración Auth, JWT, Vault, secretos o toda la plataforma.
Se inventariarán y verificarán esos componentes por canales seguros de gestión.

## Secuencia adicional de color

El propietario autoriza **como operación independiente posterior a validar
autenticación en producción**, no en el mismo lote de migraciones:

1. Revisar estado y precondiciones de `20261016000000_add_rutinas_color.sql`,
   conservar UUID/conteos/contenido de rutinas y disponer de recuperación.
2. Aplicar sólo ese archivo y verificar columna, default `copper`, NOT NULL y
   constraint de la paleta, con las rutinas existentes conservadas.
3. Construir/desplegar el frontend correspondiente con
   `VITE_ENABLE_RUTINAS_COLOR=true`, sólo después de verificar el esquema.
4. Verificar asignación/edición de colores por admin y visualización por empleado,
   junto a permisos por rol e integridad histórica. Registrar resultado separado.

Hasta ese checkpoint la capacidad permanece OFF y color no se aplica. Se
conservan pruebas anteriores; sólo se ejecutan validaciones afectadas y reales
necesarias. No usar `supabase db push` indiscriminado. No autoriza push ni Etapa 5
ni exceptúa gates críticos o reparaciones destructivas no revisadas.
