# Contrato de autenticacion, roles y RLS

## Decision aprobada

La interfaz recibe un nombre de usuario y una contraseña. El usuario se
normaliza con `trim()` y lowercase y debe cumplir
`^[a-z0-9][a-z0-9._-]{2,31}$`. No se transliteran acentos ni se hacen búsquedas
por nombre. El email técnico enviado a Supabase Auth es determinista:

```text
<usuario-canonico>@auth.gestor-barberia.invalid
```

El dominio `.invalid` evita entrega accidental. La recuperación es
administrada; signup y recuperación pública deben permanecer deshabilitados.
La misma regla está implementada en SQL (`private.canonical_username`,
`private.technical_auth_email`) y en
`supabase/functions/_shared/auth-contract.ts`.

Los errores de login son genéricos. El email técnico no se muestra en la UI,
no se devuelve desde `admin-users` ni se persiste como perfil público. Sí forma
parte de la solicitud y de la sesión estándar de Supabase Auth, por lo que se
trata como identificador derivado, no como secreto ni como fuente de permisos.
La contraseña solo viaja por TLS hacia Auth o hacia la función administrativa
durante un alta/reset; nunca se registra. Longitud contractual: 12 a 72 bytes
y al menos tres clases entre minúsculas, mayúsculas, dígitos y símbolos.

## Identidad y rol

`empleados.id` se conserva como identidad de dominio y mantiene todas las
relaciones históricas. `empleados.auth_user_id` vincula, de forma única, con
`auth.users.id`; la FK usa `ON DELETE RESTRICT`.

El rol autorizado es `empleados.rol`, limitado a `admin` o `empleado`. Las
políticas lo leen mediante funciones `SECURITY DEFINER` con `search_path`
fijo. No se usa `localStorage`, `user_metadata` ni un rol enviado por el
cliente como autoridad. Un perfil inactivo no obtiene identidad ni permisos.

La migración de empleados existentes conserva `empleados.id`: el operador crea
la identidad con Admin API y ejecuta `admin_link_auth_account` desde un entorno
administrativo privilegiado. La acción `create` de `admin-users` es sólo para
integrantes nuevos; no se utiliza para migrar perfiles con relaciones previas.

## Matriz efectiva

| Tabla | `anon` | Empleado | Administrador |
|---|---|---|---|
| `empleados` | Ninguno | SELECT propio | SELECT todos |
| `rutinas` | Ninguno | SELECT asignadas no archivadas | SELECT/INSERT/UPDATE |
| `tareas_rutina` | Ninguno | SELECT de rutinas asignadas | SELECT/INSERT/UPDATE |
| `empleado_rutinas` | Ninguno | SELECT propias | SELECT/INSERT/DELETE |
| `auditoria_diaria` | Ninguno | SELECT propia; cambios por RPC | SELECT global |
| `tareas_urgentes` | Ninguno | SELECT propias; cambios por RPC | SELECT/INSERT; cancelar por RPC |

No existen grants de hard-delete sobre perfiles, rutinas, tareas, auditoría o
urgencias. Las asignaciones sí pueden retirarse sin borrar su historial.

## RPC de trabajo

- `get_current_employee_profile()`: devuelve únicamente `id`, `nombre`,
  `usuario`, `rol` y `activo` del perfil activo vinculado al JWT. Permite
  hidratar la sesión sin conceder `SELECT` sobre `auth_user_id`.
- `set_task_completion(tarea_id, completed)`: solo la tarea asignada al
  empleado activo y el día de negocio. Desmarcar una tarea inexistente falla;
  cada completar/anular queda en `private.task_completion_events`, mientras la
  fila de auditoría conserva el estado actual mediante `anulada_en`.
- `set_urgent_completion(urgent_id, completed)`: solo urgencia propia, vigente
  y del día de negocio.
- `cancel_urgent_task(urgent_id)`: solo admin; conserva la fila con
  `cancelada_en`.

El día de negocio usa `America/Argentina/Buenos_Aires`; no se deriva con UTC
en el cliente.

## Administración de cuentas

`admin-users` verifica el JWT con Auth y después consulta que el actor sea un
admin activo en la base. La service role existe solo en el runtime de la Edge
Function. Acciones: alta completa, reset administrado, desactivación,
reactivación y cambio de rol.

La modalidad aprobada implica que el administrador que asigna o restablece
una contraseña llega a conocerla durante esa operación. Debe entregarla por
un canal separado y no conservarla. Es un riesgo aceptado para esta etapa, no
una propiedad deseable a largo plazo. Alternativas futuras son invitaciones
de un solo uso, recuperación autoservicio con correo real verificado o un
flujo de cambio obligatorio con credencial temporal; cualquiera exige una
nueva decisión de producto y trazabilidad individual antes de reemplazar este
contrato.

Cada operación distribuida deja primero un evento durable. Un alta cuyo perfil
no puede crearse intenta eliminar la identidad Auth; si también falla, queda
registrada para reconciliación. La desactivación cambia primero el estado de
base, de modo que RLS deniega inmediatamente incluso si falla el bloqueo Auth.
Un reset conserva eventos `started` y `completed`/`failed`; un fallo posterior
al cambio de Auth devuelve `reconciliation_required` sin fingir atomicidad. La
auditoría privada registra actor, perfil objetivo, acción y timestamp; rechaza
claves llamadas `password`, `pin`, `token`, `email` o `technical_email`.

Los access tokens ya emitidos pueden vivir hasta su expiración, pero la
desactivación corta acceso a datos inmediatamente porque cada helper RLS exige
`empleados.activo=true`. El suplemento candidato siguiente convierte MFA/AAL2
administrativo en obligatorio; su despliegue requiere aprobación separada.

## Suplemento operativo candidato — 17 de octubre de 2026

Implementación y pruebas locales autorizadas históricamente. El 18 de octubre
el propietario autorizó el despliegue real de forma condicional a los gates del
runbook. Conserva contraseñas administradas y entrega privada, con la aceptación
explícita de cambio propio por API descrita debajo; no acredita por sí mismo
verificación remota ni permite omitir prerrequisitos.

- La migración nueva `20261017000000_security_operations.sql` se aplica DESPUÉS
  de expand, bootstrap/vínculos y cutover. No modifica archivos ya aprobados ni
  depende de color. Instala mantenimiento cerrado inicialmente.
- Administradores necesitan JWT de Auth `aal2` para TODO negocio. Los helpers
  RLS niegan también que un admin AAL1 actúe por las policies de empleado.
  `get_current_employee_profile` devuelve sólo el perfil mínimo para permitir
  enrolamiento/desafío antes de abrir el panel; no concede acceso operativo.
  El frontend usa TOTP enroll/challenge/verify y guarda QR/código sólo en memoria.
  No se implementa bypass de MFA en emergencia.
- Edge verifica JWT mediante Auth y consulta AAL del mismo bearer validado;
  exige admin activo y AAL2, incluido en solicitudes sin Origin. Un estado
  visual, metadata o claims sin verificar no reemplaza esto.
- Admisión service_role `admin_begin_operation(actor,action,target_key)` atómica
  en PostgreSQL: actor 10/60 s y burst 3/10 s; altas/reset mismo objetivo
  3/15 min por acción, compartido entre actores. Objetivo usa SHA-256 del usuario
  canónico para alta o UUID para otras operaciones, sin guardar credenciales.
  Digest no equivale a anonimización; la tabla privada tiene acceso restringido.
  Respuesta 429 con Retry-After antes de auditoría/efectos; dependencia caída
  produce 503 cerrado. Sin contadores en memoria ni dependencia de CORS.
- `admin_finish_operation` termina la admisión; errores Auth/transportes ambiguos
  conservan lease pendiente hasta reconciliación. No expira por tiempo. El
  mantenimiento con `set_security_maintenance(true)` impide admisiones nuevas,
  deniega negocio por RLS y bloquea escrituras en seis tablas incluso por
  service_role mediante triggers. Drena transacciones SQL anteriores y reporta
  `in_flight`; el operador debe esperar cero y verificar fuentes externas.
- Los propietarios SQL y service_role siguen siendo confianza privilegiada:
  RPC de bootstrap/admin offline no prueban AAL de usuario. No se exponen al
  navegador ni se usan para eludir Edge. Auth directo, jobs y DDL requieren
  contención adicional para certificar suspensión completa y RPO 0.
- Acceso JWT AAL2 ya emitido puede sobrevivir a reset/logout/eliminación de
  factores. En emergencia mantener mantenimiento hasta comprobar rechazo o
  expiración de todos los tokens anteriores en Auth, REST y Edge, contemplando
  tolerancias de cada verificador; después volver a enrolar TOTP y
  comprobar AAL2 con la misma identidad/perfil. Ver runbook suplementario.

La evidencia y dictamen nuevos se registran aparte de la aprobación histórica.
CAPTCHA se evalúa; no se activa sin integración de token/challenge en login.

Decisión vigente del propietario, 18 de octubre de 2026: administrador crea
cuentas y asigna/restablece contraseñas; no hay opción visible de cambio para
empleados. Se conserva Supabase Auth nativo y se acepta expresamente que un
empleado autenticado pueda cambiar su contraseña por la API directa. Ese cambio
no pasa por `admin-users` ni su auditoría; ocultar UI no es una prohibición de
servidor. Se sustituye el requisito previo de exclusividad, sin implementar otro
proveedor ni controles adicionales para impedirlo. Ver
`docs/decisions/stage-04-native-auth-risk-acceptance.md`. La autorización de
despliegue es condicional a verificar los restantes gates operativos, no a
implementar exclusividad. La evidencia histórica se conserva sin repetirla.

## Retención mínima

Las FK que antes borraban datos en cascada pasan a `ON DELETE RESTRICT`.
Rutinas y tareas pueden archivarse; auditorías se anulan y urgencias se
cancelan. No se implementa todavía versionado de asignaciones ni un event log
general. Solo los cambios de cumplimiento tienen el registro append-only
mínimo necesario para no borrar una corrección.

`PIN` no se copia ni se transforma en contraseña. El cutover lo elimina
después de comprobar que todo perfil activo tiene cuenta vinculada y que hay
al menos un admin activo.
