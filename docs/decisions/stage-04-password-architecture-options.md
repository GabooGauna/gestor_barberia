# Etapa 4 — Opciones para contraseñas exclusivamente administrativas

Investigación histórica: 18 de octubre de 2026. El propietario decidió conservar
Auth nativo y aceptar el cambio propio por API directa, según
`stage-04-native-auth-risk-acceptance.md`. No corresponde implementar estas
alternativas por exclusividad. Se conserva el análisis y sus límites como
evidencia; sus gates de exclusividad quedan sustituidos. El despliegue está
autorizado condicionalmente, sujeto a los demás prerrequisitos del runbook.

## Requisito y evidencia conservada

El propietario confirmó que TODO establecimiento o cambio de contraseña debe
ser administrativo. El usuario, incluido un administrador actuando desde su
sesión de usuario, no puede cambiarla por un endpoint de autoservicio. Alta y
reset necesitan autorización administrativa real, auditoría y entrega privada;
ocultar botones, CORS o un proxy con origen público accesible no cumplen.

Se conserva el ensayo focal de `stage-04-password-policy-gap.md`: Auth real
2.197.0 permite el cambio propio del empleado; el reset Admin API posterior
funciona sin alterar sus UUID/vínculos. Sus diez assertions prueban el hueco,
no la política requerida. No se repitió ese ensayo ni los 40 controles Auth,
MFA, cuotas y mantenimiento ya revisados. Esta investigación sólo consulta
documentación/código públicos y modifica este documento.

## Qué está soportado y qué no se verificó

La documentación actual permite el cambio propio con `updateUser`. Exigir
contraseña actual o reautenticación agrega condiciones al autoservicio, sin
reservarlo al administrador. No se verificó un ajuste administrado que
implemente la exclusividad requerida para cuentas password existentes.
Esto no afirma imposibilidad universal ni sustituye una confirmación específica
del proveedor sobre la configuración candidata.
[API updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser),
[seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security).

Los hooks publicados no incluyen BeforeUserUpdated/BeforePasswordChanged;
Password Verification Attempt actúa al verificar login. Auth usa
`supabase_auth_admin` para comunicarse con PostgreSQL: ese rol SQL compartido no
prueba que una petición provino de Admin API. No corresponde cambiar sus ACL
globales para intentar distinguir endpoints.
[Hooks y su modelo de seguridad](https://supabase.com/docs/guides/auth/auth-hooks).

La restricción de red de PostgreSQL/pooler no bloquea las APIs HTTPS. Por tanto,
envolver Auth en otro dominio manteniendo accesible la URL original del proyecto
deja un bypass. El guard experimental sobre auditoría interna sigue descartado
como solución adoptada; sus riesgos de compatibilidad/reencriptación están en
`stage-04-admin-only-passwords.md`.
[Restricciones de red](https://supabase.com/docs/guides/platform/network-restrictions).

Existe una distinción nativa relevante: en GoTrue 2.197.0, `UserUpdate` rechaza
cambios de password, email, teléfono y nonce para usuarios `IsSSOUser` con error
`user_sso_managed`. No equivale a convertir manualmente una cuenta password
mediante SQL: el mismo código advierte que esa clasificación tiene detalles
internos pendientes. La rama actual consultada conserva ese rechazo; ninguna
de las dos consultas certifica la versión/configuración remota.
[Fuente fijada, líneas 111–120](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/user.go),
[rama actual consultada](https://raw.githubusercontent.com/supabase/auth/master/internal/api/user.go).

## Comparación para decidir antes de implementar

Las garantías de las opciones B y C siguientes son objetivos condicionados a
pruebas y revisión. No se ensayó todavía ninguna de estas arquitecturas.

| Aspecto | A. Password nativo administrado actual | B. SAML SSO administrado + IdP con prohibición real de cambio propio | C. Auth/stack bajo control operativo completo |
|---|---|---|---|
| Control de contraseña | Hueco reproducido; no cumple. | El directorio/IdP es dueño de la contraseña. Necesita política verificable que deniegue cambio/reset propio por todas sus interfaces; cuentas SSO no deben recibir password local. | Política explícita en servidor Auth o ingress exclusivo que deniegue toda mutación de contraseña de usuario antes de efectos. Admin API sólo por canal privado autorizado. |
| Bypass del origen | El endpoint Auth directo acepta cambio propio. | El origen Supabase puede seguir público porque debe rechazar mutaciones para cuentas SSO; también probar todos los endpoints del IdP. Retirar cuentas password residuales y flujos de creación de credenciales alternativas. | Auth no tiene puerto, dirección alternativa, balanceador, IPv6 ni red lateral accesible al usuario fuera del control. Un proxy aislado sin ese cierre no alcanza. |
| Login username/password | Conserva interfaz y email técnico actuales. | Se sustituye por redirección SSO; el IdP puede pedir username/password. El formulario actual y `signInWithPassword` dejan de ser el flujo. | Puede conservar username/password y email técnico, si se mantiene GoTrue con política de servidor revisada. |
| Dominio `.invalid` | Sigue como identificador técnico, no canal de recuperación. | No prometer compatibilidad automática del email técnico con el IdP. Diseñar NameID/email estable y aprovisionamiento; el username de negocio puede mantenerse. No requiere entregar correo público a la UI. | Puede conservarse sin correo de recuperación público; reset y entrega siguen administrados. |
| Identidad y vínculos | Sin cambio respecto al candidato; hueco abierto. | Conservar `empleados.id`, rutinas, asignaciones y auditorías. Planificar UUID Auth SSO y vínculo verificado; no vincular por nombre/email ni recrear perfiles. | Un restore compatible puede conservar UUID Auth y de dominio. Mover sólo Auth a otra base no conserva automáticamente FK ni confianza del sistema. |
| JWT, RLS y Edge | Subcontroles locales permanecen aprobados en su alcance. | JWT de Supabase continúa; verificar emisor, audiencia, método/proveedor SSO y perfil. Adaptar administración: reset en IdP con cuenta de servicio limitada; Admin API Supabase no es el reset del directorio. | Fijar emisor/JWKS, audiencia, rol, session_id y rotación en Auth/PostgREST/Edge/Storage/Realtime. Si se migra stack completo, volver a comprobar privilegios y consumidores. |
| MFA administrativo | TOTP/AAL2 local ya ensayado; no cierra el hueco password. | Mantener desafío TOTP Supabase que obtenga AAL2 hasta demostrar otra equivalencia efectiva. MFA del IdP no se presume traducido a `aal2`. | Conservar contrato AAL2 y comprobarlo en todos los verificadores; el acceso custodio a infraestructura/API también requiere MFA. |
| Emergencia del único admin | Procedimiento Auth ensayado con límites JWT ya registrados. | Recuperación del directorio y del factor Supabase son dos planos. Custodio/suplente, prueba de identidad, reset privilegiado y revocación de ambos; sin crear otro empleado ni habilitar PIN. | Custodios recuperan Auth/MFA/infraestructura desde canal privado; cierre de ingress y recuperación no pueden depender del único panel averiado. |
| Respaldo y RPO/RTO | Restore integral proveedor sigue pendiente. | Añadir directorio, configuración SAML/certificados y mapeos al respaldo Auth/public/private y configuración. Congelar ambos planos; SQL solo no recupera el IdP. | Añadir infraestructura, secretos/cifrado y todos los servicios al backup. Congelar ingress, jobs y conexiones privilegiadas; medir restauración integral y disponibilidad. |
| Costo y operación | Menor cambio de hosting, pero requisito incumplido. | Presupuestar capacidad SSO del plan, uso y licencias/hosting/operador del IdP; no hay monto aprobado. Mayor carga si no existe directorio organizacional. | Servidores, TLS/DNS, red, actualizaciones, monitoreo, alta disponibilidad, almacenamiento, backups y guardia recaen en operadores. No existe estimación aprobada. |

Las diferencias SAML publicadas que condicionan B: requiere plan Pro o superior;
no enlaza automáticamente identidades SSO a cuentas password existentes y puede
crear otra identidad con el mismo email; el UUID es la referencia. Hay que
aportar email en la aserción y puede iniciarse SSO por provider ID sin discovery
por dominio. Supabase no soporta Single Logout; retirar la conexión no es un
rollback inocuo. Mantener un inventario de EntityID, NameID, provider ID y ciclo
de certificados. Estas restricciones hacen necesario un contrato de migración
distinto; no justifican alterar `is_sso_user` directamente.
[SAML para proyectos](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml).

La recomendación de conservar AAL2 es deliberada: Supabase expresa el nivel
efectivo en el JWT y requiere enrolamiento/desafío/verificación. La recuperación
debe comprobar rechazo de tokens anteriores en Auth, REST y Edge; ninguna
alternativa permite asumir que cerrar el IdP invalida todos los JWT existentes.
[MFA de Supabase](https://supabase.com/docs/guides/auth/auth-mfa).

## Ejemplo de IdP con política documentada para evaluar B

Un candidato concreto es AD DS con federación AD FS: Microsoft documenta
`CannotChangePassword` como modificación del descriptor de seguridad para
impedir que el titular cambie su contraseña. Permitir al custodio únicamente
el reset administrativo es un diseño a probar con permisos delegados mínimos;
no requiere entregar privilegios de directorio al empleado ni al navegador.
[Set-ADAccountControl, ejemplo 2](https://learn.microsoft.com/en-us/powershell/module/activedirectory/set-adaccountcontrol?view=windowsserver2025-ps).

AD FS dispone de endpoint público de actualización de contraseña; ocultarlo
no sustituye la prohibición del directorio. Ensayar la denegación también por
ese endpoint y protocolos del directorio, contraseñas vencidas, primer login,
SSPR y cualquier writeback/sincronización habilitada. No se verificó que una
configuración Entra híbrida herede todas esas garantías. No configurar cambio
obligatorio al primer login si el usuario tiene prohibido cambiar contraseña.
El candidato requiere compatibilidad SAML y MFA verificadas, infraestructura,
licencias y operador; no se recomienda adquirirlo ni instalarlo automáticamente.
Para una barbería sin directorio existente, esa carga puede ser desproporcionada:
es un ejemplo de política verificable, no la recomendación de proveedor.
[Página AD FS de actualización](https://learn.microsoft.com/en-us/windows-server/identity/ad-fs/operations/update-password-customization).

## Variante de integración externa y límite de mover sólo Auth

Supabase publica integración de JWT externos y Custom OIDC: requiere issuer
HTTPS, discovery/JWKS, firma asimétrica, `kid` y rol `authenticated`. `sub` no
necesariamente es UUID; `auth.uid()` falla si no lo es. Es necesario separar
identidad por emisor y sujeto, evitando colisiones. Custom OIDC no se configura
actualmente en el stack CLI: no presentar un mock local como prueba managed.
[Custom OIDC](https://supabase.com/docs/guides/auth/third-party/custom-oidc).

La documentación de terceros indica que Supabase Auth nativo no se puede
deshabilitar actualmente. Adoptar OIDC externo, por sí solo, no cierra el
endpoint nativo ni elimina cuentas password existentes. Esa variante necesita
retirar sus credenciales/sesiones autorizadamente y restringir la identidad
aceptada del negocio, además de probar la política en el IdP.
[Limitaciones de terceros](https://supabase.com/docs/guides/auth/third-party/overview).

En este repositorio, además, `empleados.auth_user_id` referencia `auth.users`,
los helpers usan `auth.uid()`, y Edge valida `getUser()` y MFA de Supabase.
Por eso una identidad externa no es un reemplazo directo: hay que aprobar
un nuevo contrato de vínculo, validación y recuperación. No recrear filas
artificiales de Auth ni asignar arbitrariamente sub para aparentar compatibilidad.
La opción C que mejor conserva esos contratos es evaluar el stack completo
compatible; la variante híbrida debe justificar expresamente cada dependencia.

Self-hosting transfiere al operador seguridad, mantenimiento, disponibilidad,
backups y recuperación; el stack CLI de desarrollo no está endurecido para
producción. La guía de restauración desde la plataforma cubre base, sin cubrir
por sí sola objetos Storage ni redespliegue Edge. Conservar UUID en SQL no
demuestra recuperación de factores, claves, sesiones o toda la plataforma.
[Responsabilidades self-hosting](https://supabase.com/docs/guides/self-hosting),
[Restore desde plataforma](https://supabase.com/docs/guides/self-hosting/restore-from-platform).

## Decisión y condiciones verificables previas a implementar

No se selecciona B, C ni la variante OIDC. El siguiente paso es aprobación
explícita de arquitectura/contratos y recursos por el propietario, después de
revisión independiente. La decisión confirmada de exclusividad no se vuelve
a someter a interpretación ni se relaja para ahorrar la migración.

Orden recomendado de decisión: primero identificar una capacidad soportada del
proveedor actual, si existe y puede demostrarse sin depender de auditoría
interna. Si no se obtiene esa garantía, evaluar C por su posibilidad de
conservar username/password y el contrato de identidad, con costo operativo
explícito; comparar B si ya existe o se justifica un IdP con la política requerida.
Es una prioridad de evaluación, no una selección ni autorización de hosting.

1. Definir quién conserva las contraseñas (Supabase privado o IdP), mecanismo
   de prohibición de servidor, versiones compatibles y ruta administrativa
   con mínimo privilegio. Si se propone mantener A, aportar garantía concreta
   del proveedor y reproducirla antes de considerarla una solución.
2. Presentar mapa de endpoints y redes, incluidas URL originales/alternativas,
   autoservicio, recovery, primer password, cambios de identidad y APIs
   administrativas. Documentar exactamente dónde se deniega cada operación.
3. Aprobar conservación de `empleados.id` y conciliación completa de UUID/FK;
   definir cambio de UUID Auth o subject sólo cuando corresponda, con reparación
   versionada, checkpoint y rollback fail-closed sin borrar historial.
4. Probar el nuevo control en entorno sintético aislado: empleado y admin
   AAL1/AAL2, llamadas directas sin UI/Origin, recovery, solicitudes combinadas,
   fallos y concurrencia. Intentos denegados no cambian credencial ni sesiones;
   reset autorizado y entrega privada siguen funcionando. Verificar también
   cuentas residuales, emisión de nuevas credenciales y reinstauración tras
   backup/restore, rehash/cifrado y actualización de versiones.
5. Ensayar emergencia del único administrador sin bypass de MFA, con
   credenciales de plataforma/directorio fuera del navegador; demostrar
   revocación/rechazo de tokens previos según cada consumidor.
6. Completar presupuesto/operadores, cifrado y retención 30 días, custodia y
   canal privado; medir RTO integral objetivo 4 h y suspensión de TODOS los
   escritores para RPO 0, incluidos Auth/IdP y jobs.
7. Tester y Reviewer deben aprobar el candidato y sus contratos afectados.
   Una decisión de arquitectura no autoriza escrituras remotas ni despliegues.

`rutinas.color` permanece independiente y OFF; no se inicia Etapa 5. La
inspección remota, cuando exista herramienta autorizada, sigue siendo sólo
lectura. No se consultaron cuentas, PIN, secretos o configuración remotos.
