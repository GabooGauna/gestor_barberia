# Revisión independiente — candidato operativo de seguridad Etapa 4

Fecha: 17 de octubre de 2026. Dictamen: **APROBADOS los subcontroles locales de
cuotas Edge, MFA/AAL2 y mantenimiento/recuperación ensayados**. **NO APROBADO
el objetivo completo**: queda el bloqueante confirmado de exclusividad
administrativa de todos los cambios de contraseña. No autoriza staging,
producción ni escrituras remotas.

## Alcance y método

Reviewer independiente de los autores de Backend, Frontend y harness. Se
leyeron AGENTS, contexto, PRD, reglas, stage/workflow 04, contrato Auth,
dictamen operativo anterior, runbooks de cutover/backup/seguridad y evidencia
`stage-04-security-controls-validation.md`. Se revisaron la migración nueva
`20261017000000_security_operations.sql`, Edge, AuthContext, ProtectedRoute,
AdminMfa, tests afectados, harness Auth real e inspección read-only.

No se atribuyen al candidato los ensayos de respaldo anteriores. No se
repitieron backup, lint/build ni E2E aprobados; se revisó código y evidencia
entregada por Tester. No hubo acceso a PIN, cuentas reales, remoto, push o
despliegue por Reviewer. No se inició Etapa 5 y color queda independiente.

## Hallazgos y correcciones

- **Medio, resuelto:** faltaba inventariar binding/estado de los triggers que
  sostienen mantenimiento. La inspección ahora incluye `pg_trigger`,
  `tgenabled`, tabla/propietario, función vinculada y definición. Su ausencia
  o deshabilitación debe bloquear la autorización.
- **Medio, resuelto y revalidado:** el primer test de drenaje medía el
  tiempo después de esperar al escritor, lo que podía dar un falso positivo.
  Ahora captura duración inmediatamente al retornar la RPC de mantenimiento,
  antes de esperar la conexión escritora. La ejecución corregida pasó.
- **Alto potencial en recuperación, resuelto localmente:** Auth rechazó
  un JWT expirado mientras REST aún lo aceptaba por tolerancia del verificador.
  No basta `getUser()` ni `exp` nominal para reabrir negocio. El procedimiento
  debe mantener mantenimiento hasta comprobar rechazo directo Auth/REST/Edge,
  considerando TTL máximo histórico al emitir y skew de cada verificador.
  El ensayo corregido demostró REST 401 antes y después de reabrir: el rechazo
  REST ocurrió 31 segundos después de exp nominal con mantenimiento cerrado.
- **Medio, precisión resuelta; gate externo abierto:** una variable no soportada
  de GoTrue no impuso cuotas al login por contraseña. No corresponde declarar
  Auth 429 verificado: ese control requiere ingress/gateway/proveedor soportado
  y ensayo de configuración candidata. Las cuotas administrativas Edge son
  independientes y sí tienen implementación persistente.

## Evaluación de controles

Cuotas persistentes serializadas en PostgreSQL, previas a efectos y auditoría,
con 429/Retry-After y dependencia caída 503. No dependen de memoria ni CORS.
Leases ambiguos no expiran automáticamente; un error Auth no prueba drenaje.
La RPC de admisión revalida admin activo y su ACL excluye clientes públicos.

El mantenimiento nace cerrado, bloquea nuevas admisiones y negocio por RLS;
los triggers cubren INSERT/UPDATE/DELETE/TRUNCATE de seis tablas incluso para
service_role. El lock compartido del escritor dura hasta fin de transacción.
Los propietarios y Auth directo siguen siendo confianza privilegiada: este
gate no demuestra congelación completa del proveedor ni RPO 0.

Admin AAL1 no puede usar policies de empleado para llegar a negocio. El perfil
mínimo sigue disponible para enrolar/desafiar TOTP. Edge verifica el mismo bearer
con Auth y exige AAL2; se comprobó en el SDK instalado que la variante con JWT
explícito vuelve a ejecutar `getUser(jwt)`. El guard de UI complementa al servidor;
QR/código sólo viven en memoria y el empleado conserva AAL1.

La recuperación usa identidad/perfil originales, mantenimiento, reset Admin API,
eliminación del factor perdido, revocación/expiración verificadas y nuevo TOTP.
No incorpora bypass de MFA, PIN ni privilegios anónimos. Rollback del suplemento
es contención y reparación versionada; no vuelve a helpers AAL1.

## Evidencia y límites

Tester informa lint/build exitosos; handler/contratos 11/11; E2E 45/45 (48,2 s)
y focal posterior 1/1 (10 s) para QR/overflow/Axe en ambos temas y tres anchos.
El focal sólo modificó assertions, no la aplicación; no se afirma una segunda
suite completa posterior.

Tester independiente del Backend entregó `node scripts/stage04-auth-security-drill.mjs`:
exit 0, 40 assertions, 117,882 s y eliminación verificada de recursos propios.
Además `node --check` y ESLint del harness: exit 0. Se revisaron la versión final
y `stage-04-auth-security-validation.md`: GoTrue real 2.197.0, PostgreSQL 17,
PostgREST 16.4 y Edge Runtime 1.77.4 locales, cuentas sintéticas, puertos loopback.

Pasaron cuotas concurrentes (3/8 admitidas), persistencia tras reinicio Edge,
objetivo compartido entre actores, 10/min actor, 429/Retry-After, outage 503,
ACL negativas, mantenimiento con lease pendiente/reconciliación y drenaje SQL
multiconexión corregido. Auth real probó TOTP inválido/válido, AAL1 sin negocio,
recuperación del único admin con factor nuevo, rechazo de credenciales/factor
anteriores, contención hasta expiración efectiva y recuperación RLS/Edge con
UUID/relaciones intactos. No demuestra restauración de toda Supabase.

La sonda de login Auth obtuvo 0/35 respuestas 429: es límite pendiente de
ingress/proveedor, no un test aprobado de rate limiting Auth ni fallo de las
cuotas administrativas implementadas. El gateway JWT hosted no se ejecutó.

Ante la confirmación posterior de exclusividad de contraseña, Tester ejecutó
sólo `node scripts/stage04-password-policy-probe.mjs`: 10 assertions, 6,392 s,
exit 0 y limpieza correcta. **Exit 0 significa reproducción exitosa del fallo
de política, no cumplimiento del requisito.** Un empleado sintético con JWT
ordinario vigente modificó su contraseña por `auth.updateUser(password)`;
la nueva permitió login y la anterior dejó de funcionar. El reset administrativo
posterior funcionó conservando UUID/vínculo. Se revisó el harness focal, sin
repetir las 40 assertions de MFA/cuotas ni afirmar una nueva suite de negocio.

## Gates externos que permanecen

Antes de staging: aprobar el contrato MFA/cuotas, custodios/canal privado,
retención 30 días/RPO 0/RTO 4 h como objetivos medibles, tratamiento CAPTCHA e
ingress; identificar staging sintético, versiones/hashes y receta de respaldo
del esquema suplementario. Resolver el bloqueante de contraseñas descrito abajo
antes de aprobar este objetivo completo. Luego autorización explícita propia
del ambiente.

Antes de producción: staging y revisión completos, drift/configuración remotos
en lectura, respaldo real completo cifrado bajo custodia, restauración aislada
compatible con proveedor incluyendo dependencias/configuración, RTO integral
medido y congelación de todos los escritores para RPO 0. Verificar gateway JWT,
Auth, secretos por presencia, orígenes, antiabuso, recuperación y factores con
configuración equivalente. CAPTCHA no está integrado ni probado como defensa.

**Bloqueante del alcance actualizado:** el propietario confirmó que TODO cambio
de contraseña debe ser exclusivamente administrativo. Auth estándar también
permite cambio propio de contraseña: la implementación actual no satisface esa
exclusividad. La aprobación de cuotas/MFA no aprueba el objetivo completo.
Backend debe entregar una solución soportada que cierre el endpoint directo o
una decisión de arquitectura concreta para aprobación; luego contrato, Reviewer
y prueba negativa directa de `updateUser(password)` del empleado. Ocultar UI,
CORS o RLS no imponen este requisito en Auth. No desplegar mientras siga abierto.

Se aprueba como registro de decisión y bloqueo
`../decisions/stage-04-admin-only-passwords.md`. Sus alternativas no son controles
implementados ni una autorización de arquitectura nueva. Es correcto no adoptar
un trigger sobre auditoría interna de Auth: depende de comportamiento no
contractual y podría impedir login durante rehash/reencriptación o rotación.
Un proxy propio con origen managed aún accesible tampoco cierra el bypass.
Las vías revisables son una capacidad soportada demostrada en el proveedor o
una arquitectura explícitamente aprobada con origen Auth privado/no eludible,
incluyendo identidades, FK, JWT, MFA, respaldo y operación. No se relaja el
requisito confirmado mientras se investiga.

SQL restaurado, Auth real local y recuperación de toda la plataforma Supabase
son evidencias distintas. MCP Supabase no disponible: configuración/drift real
siguen pendientes. Producción permanece bloqueada y no se solicita autorización
automática de escritura, despliegue, cuentas, push o color.

Handoff al Orquestador: conservar la aprobación histórica y de estos subcontroles;
no declarar cerrada toda la preparación solicitada. Backend debe resolver o
presentar una decisión de arquitectura para el requisito confirmado de contraseña,
actualizar contrato, validar el endpoint directo y volver a Reviewer. Los gates
externos siguen abiertos aunque ese bloqueante se resuelva localmente.
