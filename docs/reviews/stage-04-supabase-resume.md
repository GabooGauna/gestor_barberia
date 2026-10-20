# Etapa 4 — Reanudación Supabase posterior a 10bc305

Actualización vigente posterior al informe: propietario aceptó preparar y ensayar
alternativa B (RPO 0 de negocio/runtime Auth, metadata interna con drift/aborto)
y confirmó exclusividad de operadores para el corte. Sustituye el bloqueo literal
ALLwriters descrito históricamente debajo; no certifica aún ejecución real.
Protocolo nuevo 22 controles PASS y caso focal snapshot/dump/restore 10 PASS;
preparación local revisada. Evidencia, límites y pendientes de integración en
`stage-04-scoped-freeze-validation.md`.

18 de octubre de 2026. User confirma tres variables Vercel configuradas y
autoriza continuar el despliegue backend condicionado. Solicita preparar push
y publicación después de validar Supabase; no se ejecutan en este checkpoint.

## Evidencia nueva, sin repetir lo aprobado

- Commit local 10bc305 conservado; .codex/config.toml modificado localmente,
  fuera del commit y sin imprimir. Respaldo preparatorio existente y restore
  aprobados no se repiten ni se crea otra captura.
- MCP de proyecto operativo: migraciones [] y Edge Functions [].
- Management GET proyecto/config-auth/backups: 403. Diagnóstico sanitizado del
  mensaje JSON: privilegios insuficientes; no se atribuye a una causa más fina
  sin verificar scopes/rol. Nunca se emite token ni respuesta completa de config.
- Navegador de herramientas sin Dashboard autenticado disponible; no se accedió
  a sesiones privadas por otro mecanismo. Hace falta acceso de gestión válido.
- Dominio aportado: https://gestor-barberia-five.vercel.app, GET 200/HTML.
  No login ni prueba funcional real del frontend. Variables Vercel declaradas
  configuradas por usuario, sin verificación remota de valores/alcance.
- Auth health con clave pública en memoria: GoTrue v2.197.0. Esquema Auth:
  82 migraciones, fingerprint SHA256
  `7315402992f867a9b5f03b14aef2c1d0f9cf9a7ad66b15ae01c965102b21c4f2`.
- Sólo cuatro tablas carecen de privilegio SHARE para postgres:
  auth.schema_migrations, storage.migrations, storage.buckets_vectors y
  storage.vector_indexes. Los nombres/ACL son catálogo; no se ejecutó LOCK.
  Las 26 tablas runtime Auth restantes sí cubren el privilegio, sin que eso
  certifique un procedimiento integral. postgres no puede SET los roles
  supabase_admin, supabase_auth_admin ni supabase_storage_admin.
- Conteos read-only: las 26 tablas Auth distintas de schema_migrations tienen
  cero filas, incluyendo OAuth/SSO/SAML/SCIM/WebAuthn, auditoría, instancias,
  sesiones/factores/identidades y tokens. Vault 0; Storage buckets/objects 0.
  No se leyeron sus valores, PIN ni claves. Es observación actual, no snapshot
  del respaldo: el ensayo nuevo debe comprobar también el estado del archivo.
- DATABASE: ACL efectiva leída sin secretos, diez entradas; owner postgres.
  Configuración específica única `app.settings.jwt_exp=3600`, proyectada mediante
  allowlist exacta de ese nombre/valor numérico. No se leen otros valores GUC.

## Cambios y validación acotada

Nuevo intake interactivo `scripts/stage04-store-management-token.ps1`, reutiliza
helpers DPAPI/ACL aprobados; flujo descrito en `stage-04-management-access.md`.
No se agrega otra bóveda ni custodio. Token sólo fuera del repo, bajo el mismo
usuario/equipo; nada de secretos en Vercel, argumentos, chat o logs.

AST PowerShell 5.1 y 7 PASS. Prueba sintética de nueva estructura SecureString
CLIXML: DPAPI round-trip, estructura, ausencia del literal en disco y cleanup
PASS. No se capturó token real ni se repitieron suites SQL/Auth/MFA/E2E/build.
Intake aprobado por Reviewer en `stage-04-resume-supabase-review.md`; paso manual
enviado al propietario. Aún no hay confirmación/archivo de token utilizable.

Ensayo nuevo opt-in `-VerifyDatabaseMetadata` revisado por Reviewer sobre el mismo
BackupId: detenido en `validate_archived_database_metadata`, sin error de cleanup,
antes de replay DB. No se atribuye a corrupción ni se invalida el PASS SQL previo.
Se prepara diagnóstico acotado TOC para distinguir falta/identidad/formato de
metadata, sin mostrar SQL. No se recapturó el respaldo ni se cambiaron sus archivos.

Observación DATABASE fuente adicional: ICU/collation version declarada y efectiva
153.121; ACL normalizada SHA256
`be1ce8b898a93d61ffa37811377d77dff9b9bc0777cd0a51f30180203bc62a0c` y settings SHA256
`7b17b6f417acb5e2c652a1a26f53a70f4848e1bff95e34c20fd645cff98d09dd`.
Son metadatos actuales, no comparación exitosa contra el archivo.

Inventario adicional de escritores, sólo lectura: no están instaladas las
extensiones pg_cron/pg_net ni existen cron.job/net.http_request_queue. Los
workers precargados observados no prueban jobs activos. Una consulta previa
que asumía cron.job abortó con 42P01, sin escrituras. Publicación
supabase_realtime presente, all_tables=false; no constituye por sí sola un
escritor de negocio. Esto no certifica ausencia de operadores/servicios externos.

## Gates que siguen cerrados

### Actualización tras intervención humana

Token de gestión guardado por el propietario; estructura DPAPI/ACL verificadas.
GET de proyecto, Auth y metadatos de backups ahora exitosos. Ref esperado exacto,
nombre interno `barberia-sop`, región sa-east-1, estado ACTIVE_HEALTHY. No se
confunde ese nombre técnico con la marca GNS ni se cambia el destino autorizado.
El bloqueo 403 queda resuelto; no repetir captura ni pedir permisos genéricos.

Auth original: signup ON, email ON, anonymous y todos los demás proveedores
externos OFF; passkey/SAML/OAuth server OFF; min password 6, TOTP enrol/verify ON,
JWT 3600, Site URL localhost:3000, redirects vacío. Límites actuales numéricos:
anonymous 30, email 2, SMS 30, token_refresh 150, verify 30, OTP 30, Web3 30.
Todavía sin aplicar el candidato. La [tabla oficial](https://supabase.com/docs/guides/auth/rate-limits)
atribuye al token endpoint password/refresh/ID/PKCE un límite compartido de
150/5 min con burst 30; no inventar un campo sign_in_sign_ups ausente en API.
Falta validación focal efectiva, sin repetir las 40 pruebas locales aprobadas.

JWKS público presenta una clave ES256. La [referencia oficial de headers Edge](https://supabase.com/docs/guides/functions/auth-headers)
confirma que verify_jwt admite JWT HS256 y claves asimétricas; se conserva ON.
Esto resuelve la duda documental, no sustituye la prueba real posterior con
sesión de usuario y autorización del handler (perfil activo/AAL2).

Se capturó sólo Project/AuthConfig por GET en suplemento opaco SecureString
DPAPI fuera del repo: `auth-config-2a5df45aef8f43e597f51d407a75690b.clixml`,
2026-10-18T15:56:45.3601116Z. Bytes plaintext 13302, SHA256
`fa39f4183542121c13f68eeec2eed914e34cb8221f8a5ff3c3878f83d76b3d9c`.
Reimportación DPAPI, hash/bytes y JSON/ref verificados en memoria sin contenido
sensible en logs. No se incluyó PAT/headers. Restore de configuración remota no
ensayado, captura posterior a la base, no snapshot compartido. Original intacto.

Inventario TOC-only real revisado, sin replay SQL: exit0, 3,97s, cleanup confirmado.
DrillId `369fe34eaef0432fb888535f187154c7`; DATABASE/PROPERTIES/ACL entries 0,
identidad inesperada 0. **Interpretación corregida:** ese listado se ejecutó sin
`--create`, por lo que pg_restore filtra DATABASE/PROPERTIES/ACL. No demuestra
que el archivo carezca de ellas. Fixture real con dumps custom con/sin -C y
`pg_restore --list --create` devuelve DATABASE1/PROPERTIES1/ACL1 en ambos casos.
Inventario corregido real PASS, DrillId `89656de8374049f897e12ec355790b41`:
DATABASE1/PROPERTIES1/ACL1, identidad inesperada0, hashes/GCM PASS y cleanup
confirmado. No se ejecutó SQL del archivo en esa inspección. No hace falta
reconstruir metadata desde el suplemento; se retirará esa receta innecesaria.
No se invalida la recuperación SQL previa.

Suplemento no secreto con ACL privada `source-database-metadata.json`, junto al
backup existente: SHA256
`2d75f900f2cbc2b17df687729f9606e104095c5b9b5dd30fb86f30ecade514d6`.
Incluye propiedades observadas, diez ACL y sólo setting allowlist jwt_exp=3600.
No corresponde al snapshot de las 05:01 UTC. Se conserva como observación para
comparar; no se utilizará para reconstruir si la metadata ya está en el archivo.

Ensayo combinado nuevo PASS, DrillId `d70d6eb157644b8eb72825283e94a610`,
reporte UTC `2026-10-18T16:15:02.9646725Z`. Recuperación de metadata DATABASE
desde el original (sin reconstrucción): owner, diez ACL, setting por hash,
locale y versión efectiva ICU 153.121 coinciden con observación postcaptura.
Replay SQL completo, hashes/GCM, cleanup Auth/DB PASS. Catálogo y agregados de
roles del nuevo reporte coinciden con el restore previamente conciliado.
Auth v2.197.0 arranca sobre las 26 tablas runtime vacías restauradas y conserva
las 82 migraciones/fingerprint. Signup/login email cerrado rechazados; cuenta
local sintética creada por Admin API, login/refresh y refresh tras recrear Auth
con la misma clave local PASS. Fingerprint UUID/FK de negocio inalterado.
No se usaron cuentas, claves o sesiones productivas en el helper. No se repitió
la suite MFA de 40 assertions ni E2E/lint/build ya aprobados.

Correcciones necesarias del nuevo runner: guard args compatible con PS5.1 y
parser de observación que conserva timestamp string en PS7.5+ (-DateKind String)
y PS5.1. Primeros intentos abortaron antes de abrir el archivo por validación
del argumento/fecha; tests focales y Reviewer aprobaron las correcciones.
No hay indicio de corrupción ni se generó otro respaldo DB.

**Bloqueo histórico, sustituido por la decisión B posterior:** suspensión literal
de todos los escritores no verificada. Locks disponibles no cubren cuatro tablas managed ni cambios
globales de roles/configuración. No adoptar roles protegidos ni prometer RPO0
por sólo comparar hashes antes/después. Alternativa B posteriormente aceptada
para preparar/ensayar en `../runbooks/stage-04-cutover-maintenance.md`; ejecución
remota sigue pendiente de sus gates específicos.

Pendientes: configuración candidata/antiabuso, contención
integral de escritores/plano de control, backup definitivo y RPO/RTO verificables,
provisión/vínculos del primer admin y aceptación real de MFA/RLS/Edge. El baseline
Auth vacío permite acotar el ensayo sin exportar claves de identidades inexistentes;
el ensayo nuevo cubre ese baseline, no demuestra recuperación completa del proveedor
ni continuidad de tokens/factores preexistentes y no elimina el gate de mantenimiento.

Sin migraciones, cambios Auth/cuentas/secretos, locks, despliegues o push remotos.
Color no aplicado/activado. Etapa 5 no iniciada.
