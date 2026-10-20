# Etapa 4 — Controles operativos candidatos

Actualización posterior del 18 de octubre: propietario acepta preparar y ensayar
RPO 0 para negocio/runtime Auth y detectar drift/abortar sobre metadata interna.
`../decisions/stage-04-scoped-cutover-rpo.md` sustituye el requisito literal de
congelar todos los escritores del proveedor en los apartados históricos debajo.
No demuestra aún el procedimiento, respaldo definitivo ni RTO integral; seguir
`stage-04-cutover-maintenance.md` y su revisión antes del corte real.

Fecha original: 17 de octubre de 2026. Implementación local solicitada;
autorización real condicional recibida el 18 de octubre, sin ejecución hasta
verificar los gates de seguridad y recuperación. Complementa auth-cutover y
backup-continuity, sustituyendo sus apartados que describían estos controles
como no implementados. Conserva cierre/aprobaciones históricas y no inicia Etapa 5.

## Contratos y aplicación

Decisión posterior del propietario, 18 de octubre: se conserva Auth nativo y
se acepta el cambio propio por API directa, sin opción visible para empleados.
Se retira el gate de exclusividad; no se implementa otra arquitectura ni un
control exclusivo adicional. Ver `../decisions/stage-04-native-auth-risk-acceptance.md`.
El despliegue real está autorizado sólo si se verifican todos los demás
prerrequisitos. La autorización no es evidencia de backup, recuperación o drift.

Orden por ambiente autorizado: backup consistente/restauración ensayada → expand
→ bootstrap de admin/vínculos de UUID originales → conciliación → checkpoint
de respaldo (revalidación controlada del definitivo según auth-cutover, sin
recaptura por vínculos trazados ni sesiones de smoke cerradas; no estado MFA o
negocio nuevo) → cutover → `20261017000000_security_operations.sql` → nueva Edge y
cliente MFA verificados → enrolamiento AAL2 → abrir gate → aceptación.
La nueva Edge puede predesplegarse sin uso: falla cerrada si falta el suplemento.
No ejecutar todas las migraciones pendientes: color sigue separado y OFF.

Migración suplementaria no tiene down que restaure AAL1 o quite mantenimiento.
Rollback operativo: cerrar gate, drenar/reconciliar, conservar tablas/policies,
reparar con artefacto nuevo versionado. El rollback antiguo de cutover sigue
siendo cierre de clientes, no recuperación funcional del candidato MFA.

## Cuotas y contención efectiva

Estado y admisiones están en private y no son accesibles al navegador. Un lock
de fila serializa cuotas entre procesos Edge/actores. Ventanas móviles: 10/min
y burst 3/10 s por actor; create/reset 3/15 min por objetivo y acción. La cuota
de objetivo es común entre actores. Username normalizado/UUID se hashean sin
guardar secretos. Los errores 429 exponen Retry-After; indisponibilidad produce
503 antes de escribir auditoría o modificar Auth.

Admisiones finalizadas se purgan después de un día en la siguiente admisión;
pendientes no caducan. Error Auth, incluso ambiguo de transporte, deja lease
abierto: verificar estado real, evento y resultado con operador antes de
finalizarlo. Nunca borrar pendientes para que el checkpoint diga cero.

Procedimiento privilegiado autorizado, no endpoint público de mantenimiento:

```sql
select public.set_security_maintenance(true);
```

La respuesta confirma maintenance e in_flight. La operación espera locks de
escritores SQL ya iniciados; nuevas escrituras de las seis tablas fallan y RLS
no permite negocio. Incluso service_role debe pasar triggers; una credencial
de propietario que desactive triggers es un bypass privilegiado y debe quedar
retirada a operadores/jobs durante la captura. Verificar también peticiones
directas Edge con y sin Origin, REST, RPC y escritores en vuelo. El perfil mínimo
de enrolamiento permanece disponible; no confundirlo con lectura operativa.

Esperar in_flight=0 o resolver cada lease sin fingir atomicidad. No basta con
ocultar UI, CORS, retirar el frontend o un WAF sólo sobre dominio propio.
Después del cierre, el custodio puede monitorear sin nuevas escrituras con
una sesión SQL privilegiada de lectura (estas tablas no tienen grants para
clientes/service_role directos):

```sql
begin transaction read only;
select maintenance,
       (select count(*) from private.admin_operation_admissions
        where finished_at is null) as in_flight
from private.security_operations where singleton;
rollback;
```

No usar repetidamente `set_security_maintenance(true)` como si fuera una lectura
de estado durante la captura: es una mutación del plano de control.
Para reabrir, aprobación de checkpoint y `set_security_maintenance(false)` por
operador; si estado falta o dependencia falla, no abrir.

Esto bloquea operaciones administrativas nuevas de la Edge candidata y negocio
de seis tablas; NO bloquea el API Auth directo (login, refresh, cambios de
contraseña/factores), jobs u otras funciones privilegiadas. Para RPO 0 durante
cutover hay que suspender también esas entradas/escritores por mecanismo real
del proveedor y probarlo. Un bloqueo de frontend no prueba suspensión de Auth.
Si el proveedor no permite congelación integral verificable, no prometer RPO 0:
mantener el despliegue bloqueado hasta diseñar un mecanismo compatible.

## MFA administrativo y emergencia

Login por contraseña produce AAL1. El administrador enrola TOTP si no tiene un
factor verificado, confirma código vigente y obtiene AAL2. Si ya tiene factor,
completa desafío. La interfaz no monta el panel ni consulta negocio hasta AAL2;
Edge y RLS repiten el control del lado servidor. El empleado conserva AAL1.
QR y códigos sólo en memoria; no copiar a logs/tickets/almacenamiento. La sesión
estándar Auth permanece conforme al contrato previo. No hay cuenta de emergencia
que saltee MFA ni autenticación por PIN.

Pérdida de acceso del único admin:

1. Declarar incidente y mantenimiento del servidor; identificar al titular por
   canal previamente acordado, autorización individual de propietario y segundo
   verificador. Custodio/suplente nominal con MFA de plataforma y acceso de bóveda.
2. Confirmar UUID original de perfil/identidad y activo/rol, sin PIN ni listados
   de datos innecesarios. Con Admin API segura resetear contraseña y, si se
   perdió el factor, listar/eliminar únicamente factores de esa identidad.
   No crear otro empleado ni repetir bootstrap. Conservar UUID/FK/historial.
3. Revocar sesiones/refresh por API soportada. Comprobar rechazo del refresh
   antiguo; esto no prueba invalidación de access JWT ya emitidos. Conservar
   mantenimiento hasta rechazo comprobado de todos los tokens previos por Auth,
   REST y Edge, incluidos endpoints directos. Usar el TTL máximo que tenían al
   emitirse, historial de configuración y tolerancia/skew de CADA verificador.
   El ensayo detectó que REST aún aceptaba un JWT que Auth ya rechazaba: exp
   nominal más un margen supuesto no basta. Medir/revalidar rechazo efectivo
   antes de abrir. Reducir TTL actual no acorta JWT firmados anteriormente.
   Si no puede demostrarse, no reabrir.
4. Entregar contraseña aleatoria 12–72 bytes/tres clases por canal privado
   verificado, separado del username. Registrar recepción, no contraseña.
   El administrador puede conocer contraseñas que asigna; no son de un solo uso.
5. Titular inicia AAL1, enrola un TOTP nuevo y verifica AAL2. Probar que el factor
   anterior y contraseña vieja fallan, que perfil e historial siguen intactos y
   que sólo entonces puede usar negocio. Reabrir con aprobación de incidente.
6. Registrar incidente sin secretos en bitácora externa restringida; reset
   directo no genera por sí solo auditoría Edge. Falta perfil/vínculo discordante,
   ban o ningún admin activo: detener y preparar reparación versionada revisada.

El ensayo nuevo debe utilizar GoTrue/Auth real: PostgreSQL con tabla auth.users
simulada no prueba enrolamiento, TOTP, sesión, recuperación o revocación.
Tampoco ese ensayo Auth equivale a restaurar toda la plataforma del proveedor.

El requisito anterior de exclusividad fue sustituido expresamente el 18 de
octubre: altas/reset administrativos, sin UI de cambio propio y con aceptación
del cambio por API directa. Véase `../decisions/stage-04-native-auth-risk-acceptance.md`.
No se afirma que UI/CORS/RLS impidan ese cambio ni se implementa otro proveedor.
La recuperación y revocación siguen siendo gates independientes del riesgo
aceptado; un reset no prueba rechazo inmediato de tokens previos.

## Abuso, CAPTCHA y enumeración

Login conserva error genérico. No hay consulta pública de disponibilidad de
username ni directorio de empleados. Edge sólo trata objetivos después de JWT,
AAL2 y rol activo; cuotas no sustituyen Auth ni evitan abuso distribuido previo
a autenticación. Definir límites Auth por IP disponibles realmente, umbrales de
alertas y comportamiento de NAT. No confiar en X-Forwarded-For enviado por el
cliente para imponer cuotas; ingress/IP/DDoS es un gate adicional de plataforma.
El GoTrue aislado ensayado no implementa una variable
`GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UPS`: no se usa ni se atribuye protección a esa
configuración. La limitación efectiva de login por contraseña debe demostrarse
en la infraestructura/gateway candidata mediante 429 y límites reales; permanece
pendiente y no se infiere de las cuotas Edge, que sí se probaron.

CAPTCHA evaluado: Supabase requiere token/challenge del cliente y secreto en
Auth. El cliente actual aún no integra CAPTCHA; activarlo solo puede bloquear
login. Se propone decidir proveedor/integración en cambio revisado antes de
activarlo, o controles de entrada compensatorios demostrados. MFA es obligatorio
en este candidato y no tiene excepción de contraseña sola. Fuentes:
[TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp),
[CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha),
[cuotas Auth](https://supabase.com/docs/guides/auth/rate-limits).

## Respaldo, proveedor y drift

Objetivos locales del propietario: respaldo cifrado 30 días; RPO 0 sólo con
suspensión integral probada; RTO objetivo 4 h todavía sin medición integral.
Custodios y canal de credenciales deben identificarse nominalmente antes del
despliegue. La aprobación definitiva de estos objetivos sigue pendiente.

Conservar ensayo SQL aprobado, sin repetirlo. Agregar al inventario del backup
private.security_operations y admin_operation_admissions; el suplemento amplía
el esquema que debe restaurarse. La compatibilidad de la receta con el candidato
completo requiere validación adicional antes de staging; no afirmar que el
ensayo anterior ya incluía estas tablas nuevas. Referir al manifiesto anterior
y añadir dependencias/ACL nuevas sin releer PIN.

Supabase administrado: restaurar schemas propios y personalizaciones de auth/
storage requiere receta compatible con versiones/roles protegidos. Backups de
base no restauran por sí solos objetos Storage, Edge, configuración de Auth,
secrets, JWT, claves de cifrado/Vault ni consumidores externos. Inventariar
dependencias y comprobar procedimientos de claves del proveedor por custodia,
nunca exportar secretos a Git. La migración/restore de identidades/factores y
sesiones puede necesitar revocación y nuevo login/enrolamiento por decisión
explícita; comprobarlo con entorno aislado compatible.

Cuando exista MCP Supabase, sólo lectura: confirmar proyecto/ambiente antes de
consultas, inspeccionar capacidades y ejecutar sólo catálogos/agregados de
`supabase/inspections/stage04-readonly-preflight.sql`. No ejecutar ese archivo
si el conector no permite transacción read-only o no garantiza permiso de
lectura; usar herramientas específicas de catálogo. No consultar PIN, filas
Auth, secretos ni funciones administrativas que escriban. Comparar esquema,
ACL por columna, funciones por checksum, RLS/policies, constraints/default ACL
y migraciones con el manifiesto del candidato. Baseline legacy distinto del
candidato es esperado: identificar diferencias, nunca corregirlas en inspección.

Auth/JWT/verify_jwt, orígenes, secrets (sólo nombres/presencia), quotas, TOTP,
CAPTCHA, recovery pública, jobs, publicaciones, Storage y capacidades de backup
requieren herramientas de configuración read-only o evidencia del operador
redactada. SQL por sí solo no certifica esos ajustes. Sin MCP registrar pendiente.

## Checklist de autorización por ambiente

Para autorizar staging remoto, no para ejecutarlo automáticamente:

- [ ] Reviewer aprueba nuevo contrato/migración/Edge/flujo MFA y pruebas afectadas.
- [x] Propietario acepta el cambio propio por API directa y conserva Auth nativo,
  sin opción visible para empleados. Gate previo de exclusividad sustituido;
  Reviewer revisa el cambio documental sin afirmar una denegación de servidor.
- [ ] Entorno staging aislado, cuentas sintéticas, sin copia de PIN/datos reales;
  versión/configuración candidata y artefactos identificados por hash.
- [ ] Cuotas concurrentes/persistencia/outage, maintenance/drenaje y AAL1/AAL2
  probados; recuperación Auth real y límites de tokens documentados.
- [ ] Procedimiento para respaldar/restaurar esquema suplementario y plataforma
  con versiones compatibles; contención de fuentes de escritura inventariada.
- [ ] Propietario aprueba custodios/canal, MFA obligatorio, cuotas y tratamiento
  CAPTCHA/ingress, objetivos de retención/RPO/RTO y alcance específico de staging.
- [x] Autorización condicional de despliegue real recibida el 18 de octubre;
  no requiere reiteración genérica. No incluye push, color ni Etapa 5.
- [ ] Identificar destino aislado y alcance del ensayo. Si requiere crear otro
  proyecto/contratar recursos fuera del alcance autorizado, decidir ese alcance
  concreto antes de hacerlo; no sustituye la verificación de los gates técnicos.

Después, para autorizar producción:

- [ ] Staging candidato pasa y Reviewer aprueba evidencia completa, sin altos.
- [ ] Drift remoto inspeccionado en lectura, conciliación UUID/FK y provisión
  confirmadas; backup real completo bajo custodia y restore proveedor aislado
  verificados, con retención/cifrado/recuperación de claves.
- [ ] RTO integral medido <=4 h o excepción explícita; suspensión completa de
  todos los escritores probada para RPO 0, incluidos Auth y consumidores externos.
- [ ] Config Auth/JWT/AAL2/Edge/origen/secrets, antiabuso, sesiones y emergencia
  del único admin/suplente verificados en configuración equivalente.
- [x] Autorización condicional de producción del propietario recibida el 18 de
  octubre; no acredita que los requisitos técnicos estén satisfechos.
- [ ] Ventana, operador, checkpoints, abortos y restauración/roll-forward
  documentados y verificados; no abrir antes del gate.

La autorización condicional de producción del 18 de octubre está recibida.
Estos checks pendientes deben verificarse antes de ejecutar escrituras; no se
solicita repetir la autorización ni se interpreta como aceptación de fallas.
