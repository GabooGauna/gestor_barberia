# Etapa 4 — Preparación de entrada segura y próximo checkpoint

Fecha: 18 de octubre de 2026. Contraseña real todavía no introducida. No hay
backup, restauración, conexión Session pooler ni despliegue ejecutados por este
turno. La autorización condicional sigue vigente; color se autoriza como fase
independiente posterior a validar Auth, según el ADR actualizado.

Backend entregó `scripts/stage04-store-db-credential.ps1`, capturador manual
Windows. Frontend, Edge, SQL y migraciones no se modifican. Pasos para el titular
en `../runbooks/stage-04-secure-db-input.md`; no compartir secretos por el chat.

## Validaciones nuevas y límites

- Orquestador/Tester: AST de PowerShell sin errores; extraído únicamente el
  validador de hostname (sin ejecutar el cuerpo de captura), acepta hostname
  Session pooler y rechaza cinco entradas con esquema, puerto, sufijo ajeno,
  IP o ruta. Exit 0. No se ejecutó el prompt real ni hubo llamadas remotas.
- Backend: Windows PowerShell 5.1 y PowerShell 7.6.5, parseo AST y prueba
  sintética de PSCredential anidado con Export/Import-Clixml. Archivo con DPAPI,
  sin texto del secreto sintético y SecureString restaurado con longitud esperada;
  hostname válido y cuatro inválidos. Archivo/directorio de ese roundtrip
  eliminados. No se descifra ni captura contraseña real.
- La prueba sintética anterior valida serialización DPAPI, NO la ejecución
  integral del helper en sesión humana. Al restringir ACL a usuario+SYSTEM en
  el ensayo inicial, el proceso AppContainer perdió acceso: no se relajó el ACL
  del capturador para hacerlo funcionar dentro del sandbox. El flujo real debe
  iniciarlo el usuario en PowerShell Windows sin AppContainer.
  La importación posterior por el agente requiere el mismo SID fuera de
  AppContainer mediante ejecución autorizada; no se ampliará el ACL al sandbox.
  La limpieza indicada arriba corresponde al roundtrip DPAPI, no acredita
  limpieza global del ensayo inicial ACL con directorios vacíos e inaccesibles
  desde AppContainer. No se usaron secretos reales en esos ensayos.
  Seguimiento posterior fuera de AppContainer, sobre los dos paths exactos
  entregados por Backend: Get-Item -Force devolvió ItemNotFound en ambos
  (exit 0 del control). No hubo borrado ni relajación de ACL; los directorios
  ya estaban ausentes en ese contexto autorizado.
- `SslMode=verify-full` es metadata para la conexión futura; aún no prueba TLS,
  CA, hostname del servidor, contraseña correcta ni permisos PostgreSQL. No
  reducir a `require`/`disable` para ocultar un fallo de validación.
- Sin repetición de auditorías, suites locales, SQL, Auth/MFA/recuperación o E2E
  previamente aprobados. Este cambio sólo añade un helper operacional y docs;
  no se atribuyen pruebas de frontend nuevas.

Comando reproducible de parseo, sin prompts ni acceso a credenciales:

```powershell
$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path .\scripts\stage04-store-db-credential.ps1).Path,
  [ref]$tokens, [ref]$parseErrors
)
if ($parseErrors.Count) { throw 'Credential helper AST failed' }
```

Reviewer independiente aprobó el helper para ejecución humana con estos límites:
`stage-04-credential-intake-review.md`. La revisión del
helper no certifica backup/restore integral ni autoriza saltar los gates de Auth,
contención, custodia, primer admin, hosting o recuperación. La intervención humana
pendiente es introducir host/contraseña localmente y confirmar sólo el resultado.
