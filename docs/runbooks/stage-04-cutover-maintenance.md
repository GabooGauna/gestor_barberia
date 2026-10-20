# Etapa 4 — Mantenimiento del corte con RPO acotado

**Decisión vigente posterior del 19 de octubre:** el propietario autoriza un
corte controlado con riesgo residual documentado, sin garantía absoluta de
drenaje interno ni afirmación de RPO 0. El addendum de
`../decisions/stage-04-scoped-cutover-rpo.md` sustituye el gate histórico de
soporte/inflight exhaustivo descrito más abajo. Se conservan controles de
admisión, actividad observable, locks, supervisión, respaldo/restore e integridad;
no se atesta fin de workers. `authAdmissionControlsVerified=true`,
`ControlledCutoverResidualRiskAccepted=true`, `RpoZeroVerified=false`.

Checkpoint previo a escrituras: proyecto/origen verificados; Auth26 vacío,
sin writers/TX/esperas externos observados y sin solicitudes REST de negocio
en la ventana consultada. Se detectó una discrepancia concreta: asignaciones
3 en respaldo verificado, 0 en origen (sin RLS). El propietario confirmó que
deben recuperarse. Primero reparación INSERT-only de esas tres asignaciones,
revisada/ensayada y conservando UUID/FK; después respaldo definitivo y cadena
Auth. No se trata del gate de garantía absoluta que el propietario retiró.

18 de octubre de 2026. **El propietario aceptó preparar y ensayar la alternativa B**;
decisión en `../decisions/stage-04-scoped-cutover-rpo.md`. Primitivas locales y
las dos verificaciones focales aprobadas por Reviewer; integración productiva
pendiente, sin ejecución remota. Complementa auth-cutover y
security-controls; sustituye su alcance literal de todos los escritores por el
alcance explícito negocio/runtime Auth y detección/aborto sobre metadata interna.

## Hechos comprobados

- Acceso al proyecto correcto y Management API recuperados. Respaldo existente
  autenticado y restaurado en aislamiento, incluida metadata DATABASE original.
  Arranque GoTrue v2.197.0 sobre Auth restaurado vacío, cuenta sintética,
  login/refresh/reinicio y conservación de UUID/FK PASS. No es recuperación de
  cuentas/factores preexistentes, todo el proveedor ni RTO integral.
- Las 26 tablas runtime Auth están vacías en la observación remota y en el
  respaldo. Edge no tiene funciones registradas; no están instaladas extensiones
  pg_cron/pg_net ni sus relaciones de jobs/cola. No acredita ausencia de otros
  operadores, procesos externos o escrituras futuras.
- `postgres` puede obtener SHARE locks en las seis tablas de negocio y las
  tablas runtime Auth, pero no en `auth.schema_migrations`, `storage.migrations`,
  `storage.buckets_vectors` ni `storage.vector_indexes`. No puede adoptar los
  roles administrados que poseen esos objetos. No se ejecutaron locks remotos.
- El ensayo Auth cerrado rechaza signup y login email. Esos flags no contienen
  Admin API, todas las demás rutas Auth ni escritores privilegiados. No basta
  con deshabilitar el frontend o CORS.

## Alternativa A — Referencia anterior, no elegida

Confirmar con Supabase un mecanismo soportado para suspender sus ejecutores
de migraciones Auth/Storage y control de vectores durante la ventana, conservando
acceso a PostgreSQL/pooler para el respaldo. Su disponibilidad no está comprobada;
no se afirma que exista un interruptor en Dashboard o API.

Combinarlo con parada de escritores externos/privilegiados, cierre de entradas
Auth, locks de tablas runtime/negocio, drenaje y respaldo definitivo. Verificar
el mecanismo antes de usarlo. No pausar/borrar/recrear el proyecto, alterar roles
protegidos ni desactivar controles de seguridad como sustituto. Si no puede
demostrarse esta suspensión, el requisito literal sigue bloqueando el corte.

## Alternativa B — Cambio explícito del alcance de RPO 0

Decisión del propietario recibida para preparar y ensayar; sigue requiriendo
revisión del procedimiento implementado. RPO 0 para datos de negocio y estado runtime Auth bajo bloqueo;
metadata administrada y plano de control del proveedor se tratan mediante
detección de drift y aborto. No equivale a suspender todos los escritores.

Implementación local del protocolo: 22 controles sintéticos PASS y caso focal
snapshot importado por pg_dump/restauración 10 PASS, limpieza confirmada. La
captura admite `-ExportedSnapshot` sin certificar por sí sola freeze/RPO0.
Evidencia y límites en `../reviews/stage-04-scoped-freeze-validation.md`.
HTTP Auth y pérdida real de holder/limpieza Docker pasaron y tienen dictamen
independiente final. El adaptador de sesión/captura/restauración y sus gates
locales también están integrados y aprobados en el alcance revisado. Todavía
faltan el drenaje Auth verificable en destino, el punto de entrada concreto
del corte y el respaldo definitivo; no confundir el módulo probado con
un despliegue ejecutado. Secuencia a completar para la ventana real:

1. Inventariar y cesar operadores, Admin API, service roles, jobs, funciones y
   consumidores externos. No iniciar provisión hasta el checkpoint autorizado.
2. Con configuración original recuperable, cerrar signup/email y todos los
   proveedores/entradas innecesarias; verificar estado runtime y solicitudes
   directas. No inferir bloqueo de Admin API a partir de esos ajustes.
3. Mantener una sesión administrativa con locks sobre todas las tablas runtime
   Auth y tablas de aplicación/dependencias alcanzadas. Drenar escrituras ya
   iniciadas; demostrar que nuevas escrituras directas quedan bloqueadas.
   Pérdida de esa sesión, timeout, objeto nuevo o writer sin contener: abortar.
4. Capturar el respaldo definitivo cifrado y roles bajo esa suspensión, registrar
   snapshot y observaciones de configuración, y verificarlo en el recinto aislado.
   El preparatorio existente no reemplaza esta captura del corte.
5. Comparar versiones/metadata gestionada, objetos, permisos, roles y configuración
   antes/después de la captura y antes de expand. Cualquier drift: abortar sin
   migrar. Igualdad no demuestra que no hubo escrituras intermedias/revertidas.
6. Ensayar la transferencia sin ventana de escritura entre locks y mantenimiento
   fail-closed de expand; no liberar bloqueos y aplicar después suponiendo que no
   existen solicitudes concurrentes. Sólo entonces seguir bootstrap/vínculos,
   conciliación y checkpoint previo a cutover según el runbook principal.

Riesgo adicional de B: cambios internos del proveedor no quedan impedidos por
esos locks; el control detecta diferencias observables y puede detener el corte,
pero no garantiza ausencia absoluta de cambios internos ni recuperación física
del proveedor. No relaja identidad, UUID/históricos, Auth/RLS/MFA, respaldo,
recuperación, secretos, antiabuso ni validación real. RTO integral sigue pendiente.

## Estado de ejecución

La credencial inicial fue guardada por el propietario y validada localmente:
DPAPI accesible por el custodio, ruta fuera del repositorio/OneDrive sin reparse,
ACL exclusiva custodio/SYSTEM, usuario y política de contraseña conformes.
El propietario inicial BUILTIN\\Administrators y las dos reglas heredadas de
la carpeta privada se normalizaron al SID del custodio antes de importar, con
revisión independiente del ajuste. No se registra la contraseña ni se creó una
cuenta remota. Este control no sustituye bootstrap, enrolamiento MFA o recuperación.

Se eligió B para preparar y ensayar; no se certifica todavía su cumplimiento.
No hay backup definitivo, configuración de mantenimiento, migraciones, cuentas
reales ni despliegues ejecutados. Color conserva su operación independiente
posterior a la aceptación Auth. No push ni Etapa 5.

## Checkpoint 19 de octubre: correlación cerrada, drenaje pendiente

Se conserva el PASS del GET `/auth/v1/settings` correlacionado con su marcador
de finalización en `auth_logs` mediante IDs/referer propios y consulta agregada.
No se repitió ese ensayo. Una consulta nueva, exclusivamente de lectura, sobre
23 horas devolvió seis eventos, cero marcadores `request started`, seis
`request completed` y seis con request_id. No se recuperaron mensajes ni datos
de usuarios. Ese registro acredita finalizaciones observadas, no un inventario
exhaustivo de handlers todavía activos.

El [middleware de GoTrue v2.197.0](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/middleware.go)
puede devolver 504 por DeadlineExceeded sin esperar `serverDone`. Por tanto,
esperar el timeout o cerrar claves de gateway no basta para certificar fin de
trabajos previamente admitidos. Cero TX/esperas PostgreSQL, Auth vacío o un GET
200 tampoco sustituyen por sí solos ese control. El ensayo local aprobado de
cancelación antes del timeout y los demás PASS conservan su alcance.

**Alternativa mínima pendiente de confirmar con el proveedor:** un mecanismo
soportado para cerrar ingreso y suspender/reiniciar únicamente Auth, que asegure
terminación de todos los workers anteriores y mantenga PostgreSQL, Session
pooler y Management API disponibles. También sirve un contador fiable que
incluya todos los handlers/trabajos Auth pendientes. No implica volver a congelar
metadata interna del proveedor ni modifica la alternativa B ya aceptada.

La [documentación de Supabase](https://supabase.com/docs/guides/troubleshooting/auth-error-503-authretryablefetcherror-51b88c)
describe recarga/reinicio al actualizar configuración Auth, pero no especifica
la garantía anterior ni cómo demostrarla. No cambiar ajustes sólo para provocar
un reinicio suponiendo esa semántica; no usar instrucciones de self-hosting en
el proyecto administrado, pausar todo el proyecto o alterar roles protegidos.

Intervención mínima: consultar a soporte de Supabase, sin enviar secretos:

> For project ucmwykzrepmjucssjnum, we need a supported Auth-only maintenance
> operation for an authentication/RLS cutover. Can an Auth configuration reload,
> or another supported operation, close ingress and guarantee termination of
> every previous Auth worker/handler, while keeping PostgreSQL, the Session
> pooler and Management API available? Please specify the operation and the
> observable completion guarantee, including workers that outlive HTTP 504s.
> Our Auth logs expose completion events but no reliable inflight inventory.
> We do not want to pause/recreate the project or alter protected database roles.

Con esa respuesta, revisar sólo el punto de entrada correspondiente, activar
la exclusividad ya confirmada y verificar cierre/terminación, cero TX/esperas,
Auth26 vacío y locks supervisados. Después ejecutar el respaldo definitivo y
su restore antes de expand, siguiendo el orden ya aprobado. Si el proveedor no
ofrece un mecanismo verificable, detener y presentar otra alternativa antes de
implementarla; no reducir RPO ni declarar drenaje por inferencia.
