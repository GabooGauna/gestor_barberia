# Etapa 4 — Recuperación del respaldo preparatorio existente

Fecha: 18 de octubre de 2026. Continuación de la interrupción por límite de uso.
Se conserva la autorización condicional y **no se genera otro respaldo**.

## Artefactos y evidencia conservada

BackupId: `ab70bce0fa53469f8f8659c4564970ba`.
Ubicación: `%LOCALAPPDATA%\GestorBarberia\backups\stage04-ab70bce0fa53469f8f8659c4564970ba`.
Captura original: 2026-10-18 05:01:28–05:01:46 UTC.

| Artefacto cifrado | Bytes | SHA-256 conservado |
|---|---:|---|
| database.gbbk | 381676 | c9a99c3614b98a5b9810f0de2a69eb95d2e2ad5fb8fe348c4a062934b3fe5ccb |
| roles.gbbk | 5989 | 4a7ca29f5307a62791753d350e0c1f405a294a8708371c37d9b9cb8c23181755 |

TLS autenticado con CA oficial y verify-full, captura cifrada y verificación de
hashes de ciphertext ya estaban aprobados/ejecutados; no se repiten. Clave AES
envuelta con DPAPI en archivo separado y ACL nominal. Captura DB en snapshot
única, roles por separado sin contraseñas de rol. No es captura de corte ni RPO 0.

Revisión de captura: `stage-04-backup-pipeline-review.md`. Revisión previa del
restore: `stage-04-isolated-restore-review.md`. Se conservan tests sintéticos y
bootstrap compatible previos sin repetirlos.

## Ejecución aislada y diagnóstico

Comando autorizado:

```powershell
.\scripts\stage04-isolated-restore.ps1 -BackupId ab70bce0fa53469f8f8659c4564970ba
```

- Primer intento: Docker Desktop estaba detenido. No se pudo iniciar el recinto
  y la limpieza no se pudo certificar mientras faltaba el daemon. Se inició
  Docker Desktop mediante su CLI local, sin cambios de Supabase. Luego se
  verificó Docker 29.8.2 y ausencia del contenedor exacto de ese intento.
- Segundo intento: recuperación DPAPI, autenticación AES-GCM y hashes del
  plaintext pasaron (precondiciones anteriores a arrancar/importar roles).
  Se detuvo en `restore_all_roles_without_passwords`; no escribió reporte PASS
  ni llegó a restaurar la base completa. Cleanup no informó fallos. No se
  excluyen roles/objetos ni se vuelca stderr/SQL sin sanitizar para forzar éxito.
- Tercer intento, con diagnóstico revisado: mismo archivo y fallo en importación
  de roles, SQLSTATE `42501` (`insufficient_privilege`), sin línea disponible
  en el modo stdin usado. No hubo restore completo ni reporte PASS. La causa
  precisa requiere diagnóstico adicional del contexto local; no prueba por sí
  misma corrupción del respaldo. No se omiten roles para aparentar éxito.
- Reintento siguiente con `--file=-` y clasificador seguro aprobados: mismo
  `42501`, línea 117, tipo `grant_membership`; sin SQL crudo ni fallo de cleanup.
  Una lectura específica de `pg_roles`/`pg_auth_members` confirmó que el bootstrap
  de origen (OID 10) es `supabase_admin` y otorga membresías. El destino usa un
  bootstrap aleatorio diferente: PostgreSQL 17 exige ADMIN OPTION al grantor
  explícito salvo al bootstrap. Backend reprodujo el mismo error con fixture
  sintético y corrigió la receta local: initdb con `supabase_admin` OID 10,
  comprobado antes de cargar; exactamente un CREATE ya satisfecho se deja vacío
  sólo en un flujo derivado en memoria. Todos los ALTER/configuraciones/grants
  se conservan. Original cifrado intacto; reporte distingue hash original y
  ejecutado y deja `RolesRestoredUnfiltered=false`. Fixture corregido PASS,
  ambos contenedores eliminados; AST 5.1/7 y casos puros de excepción exacta
  aprobados. Esto todavía no acredita el restore real. Fuente:
  [GRANT PostgreSQL 17](https://www.postgresql.org/docs/17/sql-grant.html).

El recinto revisado usa imagen Supabase PostgreSQL 17 compatible con versiones
de extensiones inventariadas, initdb sin seeds de plataforma, Docker local
fijado, red none, sin puertos/binds, logs none, tmpfs y swap del contenedor
deshabilitado. No se promete excluir paginación del host. No importa credenciales
del origen ni ejecuta SQL remoto. Los bytes descifrados no se imprimen ni se
guardan como dump en claro.

### Resultado vigente: restore PostgreSQL PASS

Después de aprobar Reviewer la receta exacta y recibir las pruebas sintéticas,
Orquestador ejecutó el mismo comando/BackupId: exit 0, 5,43 s de ejecución local.
DrillId `61ead80090684621b20e695466d4a16f`. Roles y pg_restore de base completa
terminaron correctamente; limpieza del contenedor exacto verificada antes de
escribir el reporte. No se volvió a capturar ni se alteraron ciphertext/manifest.
La única adaptación de roles fue el CREATE bootstrap ya satisfecho, sólo en RAM;
no se omitieron ALTER, configuraciones, grants ni objetos del archivo DB.

Reportes con ACL restringida junto al respaldo, fuera del repo:
`isolated-restore-61ead80090684621b20e695466d4a16f.json` y
`isolated-comparison-61ead80090684621b20e695466d4a16f.json`.

Comparación contra observaciones de origen posteriores a captura: **PASS**.
Coinciden los seis conteos y SHA-256 de UUID y tuplas UUID/FK (empleados 2,
rutinas 5, tareas 53, asignaciones 3, auditorías 45, urgencias 4). Coinciden
schemas y agregados de tablas 45/FK 35/constraints no validados 1/policies 0/
RLS 25/funciones 4. También roles 30, sus atributos normalizados, membresías 24,
otorgantes/opciones y presencia/cantidad de configuraciones de rol; no se
comparan valores GUC ni contraseñas. Observación de roles guardada aparte en
`source-role-observation.json`.

Esto verifica recuperación de los archivos PostgreSQL y conciliación delimitada,
no igualdad de todos los campos históricos ni de ACL individuales. Propiedades/
owner/ACL/settings DATABASE siguen sin verificación separada. No valida GoTrue,
JWT/claves de cifrado, MFA utilizable, servicios/configuración externos ni RTO
integral; los 5,43 s no son RTO de plataforma. No demuestra RPO 0 por falta de
freeze/snapshot compartido de las observaciones. `private` no existía en el
baseline; su ausencia restaurada coincide y no se inventa un esquema capturado.

## Comparación y configuración pendiente

Para este respaldo se añadió observación de origen con conteos y SHA-256
agregados de UUID/FK de las seis tablas; no incluye PIN, nombres ni valores Auth.
Se guarda fuera del repo junto a los artefactos como `source-observation.json`.
Conteos observados: empleados 2, rutinas 5, tareas 53, asignaciones 3, auditorías
45, urgencias 4. La comparación delimitada ya pasó como se registra arriba.
Esta observación posterior a la captura no usa su mismo snapshot ni demuestra
quiescencia o RPO 0. El agregado global presenta un constraint no validado en
el catálogo; no confundirlo con los controles públicos anteriores de alcance
distinto ni corregirlo a ciegas.

GET de lectura de `/auth/v1/settings`, con clave pública sólo en memoria:
`disable_signup=false`, email habilitado, `mailer_autoconfirm=false`.
`mfa_enabled` no está disponible en esa respuesta; no se infiere MFA desactivado.
Signup público activo requiere configurar/verificar el candidato antes del
corte. No se modificó Auth ni se repitieron los GET 403 anteriores de Management
API; el acceso integral de configuración continúa pendiente de evidencia.

## Decisiones del propietario y gates

El propietario se identifica como custodio principal y **pospone** suplente,
gestor de contraseñas y ubicación definitiva. Se acepta ese deferimiento como
decisión operativa, sin añadir dichos mecanismos ahora. La clave ya se recuperó
localmente para GCM bajo su SID y completó el restore PostgreSQL. DPAPI sigue ligado
al usuario/equipo: no se certifica recuperación ante pérdida de ambos ni custodia
portable/independiente. No se vuelcan claves en chat/logs.

Frontend: el propietario confirmó **sin hosting**. Falta un destino/origen HTTPS
antes de desplegar y validar el frontend real y configurar su origen exacto.
Todavía no se creó un servicio ni se publicó una URL. Se preparará una opción
de despliegue coherente con el alcance antes de configurar el origen del corte.

Siguen pendientes recuperación integral del
proveedor/Auth y componentes externos, configuración/antiabuso, primer admin/MFA,
contención y suspensión de TODOS los escritores, backup definitivo de corte y
RPO/RTO verificables. Un restore SQL no equivale a restaurar GoTrue/Edge/Storage.
Se continúa trabajo independiente permitido; no se atraviesa el gate de corte
sin evidencias indispensables.

Migraciones remotas aplicadas: **ninguna**. Sin cambios de cuentas, RLS, Auth,
Edge, frontend o mantenimiento de producción. `rutinas.color` está autorizada
como operación independiente sólo después de Auth validada; sigue sin aplicar
y OFF. No `db push`, push ni Etapa 5.
