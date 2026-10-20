# Etapa 4 — Respaldo, seguridad operativa y continuidad

Decisión posterior vigente: preparar y ensayar RPO 0 de negocio/runtime Auth;
metadata interna del proveedor sujeta a drift y aborto, según
`../decisions/stage-04-scoped-cutover-rpo.md`. Sustituye el alcance literal de
todos los escritores, sin sustituir el respaldo definitivo ni dar por ensayado
el protocolo de mantenimiento. Ver `stage-04-cutover-maintenance.md`.

Fecha: 17 de octubre de 2026. Complementa `stage-04-auth-cutover.md`.
Estado actualizado el 18 de octubre: autorización remota condicional recibida,
sin ejecución si faltan gates; ver `../decisions/stage-04-native-auth-risk-acceptance.md`
y `../reviews/stage-04-deployment-attempt-2026-10-18.md`. Conserva preparación y
evidencia históricas. `rutinas.color` queda aparte. La aceptación de cambio propio
por API no exceptúa respaldo, recuperación ni controles de abuso.

Checkpoint vigente: respaldo preparatorio cifrado existente, clave recuperable
localmente y GCM/hashes verificados; restore PostgreSQL aislado PASS tras reparar
la receta bootstrap OID 10. Comparación observacional de conteos/UUID/FK y
metadatos de roles PASS; cleanup confirmado. No acredita todo Supabase ni RPO 0.
Reutilizar ese archivo; no recapturar.
Evidencia: `../reviews/stage-04-existing-backup-recovery.md`.
El propietario es custodio principal y pospone suplente, gestor y ubicación
definitiva; se conserva el mecanismo local protegido para este ensayo. Las
recomendaciones de bóveda/copia independiente siguientes quedan pendientes,
sin agregarlas como trámites para continuar localmente. No se certifica
recuperación ante pérdida del usuario/equipo ni recuperación integral Supabase.
El respaldo definitivo del corte requerirá suspensión probada de escritores.

Actualización posterior: el usuario autorizó implementar y validar localmente
MFA obligatorio, cuotas y mantenimiento. El candidato y sus gates actuales
están en `stage-04-security-controls.md`; sustituyen las descripciones siguientes
de MFA opcional/contadores no implementados. Este documento conserva evidencia
y decisiones históricas, no habilita despliegue. Retención 30 días/RPO0/RTO4h
son ahora objetivos del candidato, sujetos a aprobación definitiva y medición.

## Alcance y responsabilidades

Orquestador congela commit, hashes de artefactos, ambiente, ventana y responsables.
Backend prepara respaldos y recuperación; Frontend no requiere implementación.
Tester ejecuta sólo verificaciones afectadas; Reviewer independiente revisa el
suplemento después de recibir evidencia. El preflight de origen fue el informe
de esta conversación: no existía un archivo de preflight previo en el repositorio.
Hallazgos: cobertura incompleta de backup, abuso/MFA sin configuración candidata,
recuperación del único admin y contención Edge sin ensayo.

## Respaldo completo y consistente

Actualización de alcance del 18 de octubre: el propietario autoriza respaldo
manual cifrado por Session pooler y restore aislado; ver
`../decisions/stage-04-manual-backup-and-color-authorization.md`. Sustituye la
restricción histórica del paso 3 a backup administrado por proveedor. Una
captura autorizada debe tratar el contenido sensible como flujo opaco, sin
mostrar ni inspeccionar PIN/credenciales. Sólo persistir ciphertext fuera del
repositorio, con clave recuperable por custodia separada y restauración aislada.
Este permiso no demuestra todavía que la captura o el restore hayan ocurrido.

1. Inventariar versiones PostgreSQL/Auth/CLI/Edge, extensiones, schemas expuestos,
   tablas, propietarios, roles (sin contraseñas), grants por columna, default ACL,
   funciones SECURITY DEFINER/search_path, policies y RLS/FORCE. Capturar historia
   de migraciones y hashes; no marcar color aplicado si no lo está.
2. Preparar manifiesto sin secretos: ambiente, hora UTC, commit, método/snapshot,
   tamaño, hash SHA-256 del archivo cifrado, custodio, ubicación, vencimiento,
   claves referenciadas por ID, lista de componentes y resultado de restore.
3. Para el baseline real con PIN, usar backup/snapshot administrado bajo custodia
   del propietario/proveedor; este agente no consultará, descargará, copiará ni
   inspeccionará valores de PIN. Un dump real de empleados leería esa columna y
   no está permitido por la restricción vigente. Autorizar aparte al custodio
   cualquier restauración real en un recinto aislado. Un export que excluya PIN
   puede servir para conciliación, pero no se llamará backup completo.
4. Congelar escrituras de clientes, Edge, jobs, operadores y Auth durante la
   captura de corte. Un único `pg_dump -Fc` autorizado ofrece un snapshot
   consistente de datos/esquema de esa base. Si el método exige varios dumps,
   compartir snapshot exportado y mantener viva su transacción, o mantener
   quiescencia comprobada durante todas las capturas. No asumir consistencia
   entre exports independientes de Auth y public.
5. Incluir `auth`, `public`, `private`, secuencias/valores, funciones, triggers,
   FK/checks/índices, policies, ACL, propietarios y dependencias. En Supabase
   administrado, validar compatibilidad con schemas protegidos y roles del
   destino; no reproducir indiscriminadamente roles de plataforma ni desactivar
   integridad como sustituto de validarla. Respaldar personalizaciones de auth
   y storage explícitamente; no asumir que la CLI las incluye por defecto.
6. Complemento fuera del dump: configuración Auth (signup, proveedores, sesiones,
   contraseñas, rate limits, CAPTCHA/MFA, redirects, hooks), JWT/clave de firma
   por referencia segura, Edge fuente/dependencias/versiones/verify_jwt/origen,
   nombres y referencias de secretos, publicaciones Realtime, jobs/webhooks,
   Storage metadatos y objetos si existen. Marcar ausencias verificadas; no
   inferirlas. Secretos y claves necesarias para descifrar Vault/Auth requieren
   procedimiento del proveedor y bóveda separada, nunca documentos/Git/logs.
7. Cifrar antes de persistir o transferir fuera del recinto protegido: AES-256-GCM
   o herramienta de cifrado autenticado aprobada. Clave en KMS/bóveda separada,
   acceso nominal mínimo, MFA del custodio, auditoría de accesos y copia cifrada
   en ubicación independiente. Verificar hash, etiqueta de autenticación y
   recuperación de clave. SHA-256 solo no garantiza autenticidad ni secreto.

Propuesta pendiente de aprobación: conservar respaldo previo a expand y previo
a cutover durante 30 días, cifrado y sin acceso de aplicación; revisión al día
7 y borrado seguro al vencer, incluyendo copias. Conservar manifiesto sin datos
180 días. Objetivos: RPO 0 durante corte con escrituras detenidas y RTO 4 horas.
No son garantías: medir tiempos de restore del volumen real; si se exceden,
ajustar ventana/objetivos y pedir decisión antes de abrir el servicio. Definir
backup/PITR posterior al despliegue; estas capturas no son una política permanente.

## Restauración verificable

Destino nuevo, descartable, identificado y sin rutas a producción; restringir
salida de red, correo, webhooks, jobs, conectores y acceso público antes de
cargar datos. Usar versiones compatibles. No restaurar encima del origen.

Restaurar plataforma y roles compatibles, dependencias/extensiones y schemas,
datos y secuencias, constraints/índices, funciones/policies/ACL, historial de
migraciones y configuración externa por el método ensayado para ese destino.
Fallar ante cualquier error; si se usa `pg_restore`, usar `--exit-on-error` y
`--single-transaction`. Un destino Supabase existente requiere su receta
específica: el ensayo PostgreSQL sintético no prueba esa compatibilidad.

Gate del restore:

- Comparar conjuntos de UUID y relaciones de las seis tablas, conteos exactos,
  asignaciones, auditorías/urgencias y eventos privados; no volcar filas ni PIN.
  En evidencia real, publicar sólo igualdad/conteos agregados, no identidades.
- Verificar huérfanos, nulidades, duplicados por empleado/tarea/fecha y constraints
  validados; secuencias coherentes y sin colisiones en siguiente inserción.
- Comparar funciones/cuerpos y search_path, policies/roles, RLS/FORCE, ACL por
  tabla/columna/schema/función, propietarios, default ACL, extensiones y versiones.
- Confirmar login y recuperación con cuentas sintéticas en candidato Supabase;
  perfil propio/admin, empleado ajeno, anónimo, inactivo, JWT inválido/vencido,
  bypass por requests y operaciones Edge. Probar rollback y recuperación allí.
- Registrar duración, resultado y límites, eliminar recinto y temporales según
  retención; las claves deben seguir disponibles mientras exista backup válido.

Ensayo reproducible sin destino configurable:

```powershell
node scripts/stage04-restore-drill.mjs
```

Sólo usa fixtures sintéticas y Docker PostgreSQL 17, sin puertos publicados,
sin red del contenedor y con datos en tmpfs. Crea nombres aleatorios propios y
los elimina al terminar; necesita imagen `postgres:17-alpine` disponible o pull.
Falla si recibe argumentos. Ejecuta expand/seed/cutover para construir el estado
que se respalda; no reaplica esos archivos a ningún ambiente real. Hace un
snapshot de tres schemas, cifra AES-GCM con clave sólo en memoria, rechaza un
archivo alterado, restaura atómicamente y compara datos/catálogos; ejecuta la
suite RLS existente sobre la restauración y comprueba cierre tras rollback.
La receta sintética prepara `public` vacío y reconstruye la dependencia pgcrypto;
concilia explícitamente USAGE de schema public y ACL del propietario de las dos
secuencias identity conforme al origen. No son grants a tablas de negocio. Estas
diferencias observadas impiden considerar un dump parcial de schemas como paquete
autosuficiente; el destino real requiere su propio inventario/receta revisada.
El auth del fixture es un esquema SQL mínimo: no ejecuta GoTrue, HTTP, Edge,
MFA, CAPTCHA ni restaura configuración de plataforma. No conserva un backup
utilizable al salir: archivo y contenedor se eliminan, clave efímera descartada.

## Configuración candidata y controles de abuso

Checklist a completar con valores y evidencia, nunca claves:

| Control | Preparación / gate |
|---|---|
| Auth | Signup global OFF, anonymous sign-in OFF, sólo proveedores necesarios; email/password ON; no OTP/magic-link/recuperación pública utilizable para el dominio técnico. Verificar endpoints directos, no sólo UI. No existe aquí evidencia de un interruptor único para toda recuperación pública. |
| Contraseñas | Política contractual 12–72 bytes y tres clases también en bootstrap/Admin API; revisar política Auth sin asumir equivalencia entre caracteres y bytes. |
| Sesión/JWT | Registrar expiración/refresh/revocación y algoritmo de firma; probar token real del candidato con gateway JWT ON y `getUser()`. No desactivar verificación para resolver incompatibilidades. |
| Orígenes | URL/redirects exactos HTTPS en ambiente real, sin comodines; `ALLOWED_ORIGIN` exacto. OPTIONS 204 y headers reales del SDK. CORS no impide llamadas sin Origin ni sustituye autenticación o rate limiting. |
| Secretos | URL/anon/runtime service role en servidor; frontend sólo variables públicas. Bóveda, permisos y rotación por incidente; sin secretos en `VITE_*`, source maps, cuerpos/logs o informes. Probar configuración ausente en entorno aislado. |
| Enumeración | Login genérico existente; sin consulta pública de empleados ni endpoint de disponibilidad de username. Comparar respuestas de usuario inexistente/contraseña errónea y signup/reset directos en candidato; no prometer tiempos constantes. |
| Observación | Alertas por 401/403/429, volumen y errores de reconciliación; sólo métricas agregadas/IDs internos necesarios, nunca cuerpos de login/reset. Nombrar operador y canal de incidente. |

Propuesta de límites (no aplicada ni probada en remoto):

- Auth password login: iniciar evaluación con 30 intentos por 5 minutos por IP;
  registrar el límite realmente soportado por la plataforma y ajustar por NAT
  del local. No inventar una cuota por username si Auth no la ofrece. Refresh
  conserva su cuota separada documentada; no bloquear renovaciones legítimas.
- Edge: candidato 10 mutaciones/minuto por actor JWT verificado, burst 3 y
  3 altas/resets por objetivo/15 minutos, más límite agregado por IP en entrada.
  Contador compartido atómico y persistente entre instancias; responder 429 con
  Retry-After antes de efectos/auditoría de operación, sin revelar existencia
  de objetivos a quien no sea admin. Falla del contador deniega mutaciones
  (503); no usar memoria de proceso como límite global.
- `admin-users` aprobado NO implementa estos contadores. Un proxy propio sólo
  sirve si el endpoint directo no puede eludirlo. Elegir e implementar protección
  real del destino requiere diseño y revisión independiente antes de despliegue;
  es bloqueante hasta demostrar 429 y ausencia de mutaciones bajo abuso.
- CAPTCHA requiere token/challenge en el cliente, hoy ausentes. No activarlo
  aisladamente: puede impedir login. Decidir integración revisada o alternativa
  explícita de protección demostrada. No afirmar que rate limits evitan toda
  enumeración o abuso distribuido.

MFA de administradores: recomendación de TOTP/AAL2 con enrolamiento, challenge,
verificación en Edge y RLS de operaciones admin y recuperación de factores.
La implementación actual no lo exige. Encender MFA en Dashboard no impone AAL2.
Decisión pendiente: implementar este cambio de contrato mediante revisión o
aceptar explícitamente riesgo de una sola contraseña con controles compensatorios,
responsable y fecha de revisión. MFA del custodio de plataforma es independiente.

## Credenciales y recuperación del único administrador

Provisión: identificar al destinatario fuera del sistema y conciliar UUID de
perfil/identidad; generar contraseña aleatoria con política aprobada en entorno
seguro. Entrega presencial o canal cifrado previamente verificado, separado del
username. No chat de desarrollo/email técnico, tickets, capturas, historial de
shell ni logs. Registrar sólo recepción/fecha/operador; destruir copia operativa.
Una entrega de mensaje autodestructivo no vuelve de un solo uso a la contraseña.
No hay cambio obligatorio ni expiración inicial; conservar esta limitación.

Recuperación de emergencia (autorización individual, nunca endpoint público):

1. Activar incidente y verificar identidad del solicitante por canal conocido;
   obtener aprobación del propietario y segundo verificador. Custodio con acceso
   de plataforma protegido por MFA y credencial privilegiada de bóveda.
2. Leer sólo UUID, rol, activo y vínculo del perfil esperado. Verificar concordancia
   con identidad Auth sin imprimir email/listados. No buscar por nombre visible.
3. Si el perfil admin sigue activo y vinculado, resetear contraseña por Admin API
   privilegiada desde recinto seguro. No depende de login en Edge ni de repetir
   bootstrap. Revocar sesiones/refresh de esa identidad por API soportada y
   verificar; JWT ya emitidos pueden seguir válidos hasta expirar. Si hay sospecha
   de robo, mantener negocio cerrado hasta garantizar revocación efectiva o
   expiración; reset por sí solo no demuestra expulsión de sesiones.
4. Si hay ban, identidad ausente, vínculo discordante, perfil inactivo o ningún
   admin válido: abortar reset automático. Backend prepara reparación versionada
   exacta de identidad/estado con revisión, autorización y auditoría; conservar
   UUID y FK. No reusar bootstrap como bypass ni crear otro empleado para tapar
   el problema. No abrir acceso hasta verificar identidad y política.
5. Registrar incidente/UUID/operador/resultados sin secretos en bitácora restringida.
   El reset directo no produce por sí solo eventos de Edge. Si no hay actor admin
   utilizable, no falsificarlo para invocar la RPC de auditoría: preservar bitácora
   externa y conciliar mediante procedimiento revisado. Entregar nueva contraseña
   como arriba, verificar login con titular, reabrir sólo con gate aprobado.

Ensayar esto en Auth real aislado antes de autorizar producción. La recuperación
de factores MFA y pérdida del acceso del propio custodio también deben quedar
probadas; proponer custodio suplente independiente sin cuentas compartidas.

## Contencion y recuperacion

1. Declarar mantenimiento y detener nuevas operaciones. Ocultar UI no detiene
   REST, Auth, jobs ni Edge. Identificar credenciales comprometidas y conservar
   evidencia mínima protegida.
2. Contener `admin-users` en el endpoint real (gateway/pausa/bloqueo soportado por
   proveedor); probar solicitud directa, con y sin Origin, y confirmar cero
   mutaciones. Si esa capacidad no está disponible, preparar handler de denegación
   total revisado, con JWT ON, para despliegue de emergencia autorizado. No
   asumir que un WAF de un dominio propio protege la URL directa de Supabase.
   Hoy no hay kill switch implementado: método concreto y ensayo pendientes.
3. Drenar solicitudes en vuelo y detener otros escritores privilegiados. El
   rollback de cutover bloquea clientes DB, pero no service_role ni Admin API.
   No rotar claves globales a ciegas; si hay compromiso, usar plan de rotación
   aprobado que cubra todos los consumidores y medir el corte.
4. Elegir camino por estado observado: si cutover abortó antes de COMMIT,
   comprobar rollback transaccional y precondición fallida; corregir datos sólo
   con decisión explícita y volver a evaluar. Si confirmó, mantener RLS/FORCE y
   usar rollback cutover autorizado o roll-forward revisado. Después del rollback
   verificar privilegios por columna además de tabla. En el ensayo PostgreSQL 17,
   `REVOKE ALL PRIVILEGES ON TABLE` del rollback también retiró SELECT de la
   columna id (`has_column_privilege=false`); se corrige la sospecha del preflight
   de que quedarían esos grants. No quitar RLS para recuperar acceso.
5. Reparación: nuevo archivo fuera de la cadena autoaplicable hasta aprobación,
   con estado/versión esperado, asserts de catálogo, cambio mínimo transaccional,
   ensayo sobre restore sintético representativo y plan de recuperación. Tras
   rollback, el cutover original no es idempotente: no ejecutarlo nuevamente.
   No preparar SQL genérico que borre/recree producción sin conocer el fallo.
6. Recuperar acceso por procedimiento privilegiado anterior, reconciliar eventos
   incompletos, validar identidades/FK/ACL/RLS y liberar escritores uno a uno.
   Abrir tráfico sólo con autorización y revisión de evidencia nueva.

## Ventana, abortos y autorización

Orden obligatorio por ambiente: aprobación de preparación → ensayo aislado y
Reviewer → autorización específica del ambiente → mantenimiento y backup previo
a expand → expand → configuración/Edge verificados → bootstrap y vínculos →
conciliación → backup/checkpoint previo a corte → cutover → cliente Auth con color
OFF → pruebas de aceptación → Reviewer/propietario autorizan abrir servicio.
Validaciones con escrituras sólo en cuentas/datos sintéticos aislados; en remoto
real inspeccionar catálogos y metadatos en lectura hasta aprobación explícita.

Abortar y mantener cierre ante restore fallido, hash/cifrado inválido, writers
activos, drift de esquema/ACL, UUID/conteos discordantes, FK/fechas inválidas,
auditorías duplicadas, perfil activo sin vínculo, cero admin válido, secretos/JWT
incorrectos, endpoint Edge sin contención ni limitación verificadas, operación
administrativa incompleta o tiempo de ventana agotado. No corregir filas ni
relajar seguridad automáticamente.

Puntos sensibles: COMMIT expand corta clientes legacy; provisión crea identidades
que requieren reconciliación; COMMIT cutover elimina PIN y cambia retención;
restaurar un snapshot puede perder escrituras posteriores. Aprobar cada checkpoint.
Rollback expand sólo antes de cutover y previa preservación de auditorías y
vínculos que elimina; no elimina las cuentas Auth ni restaura grants legacy.

Antes de autorizar despliegue, propietario debe completar:

- Ambiente/ventana/operadores y alcance explícito (sin push, Etapa 5 ni color).
- Custodios, backup íntegro recuperable, ensayo del método del proveedor y RPO/RTO.
- Valores de Auth/rate limits, método Edge no eludible y ensayo 429/contención.
- Decisión MFA/CAPTCHA y cualquier cambio de contrato aprobado por Reviewer.
- Canal de contraseñas, recuperación del único admin/suplente y revocación probadas.
- Configuración candidata verificada, conciliación y Reviewer sin altos/bloqueantes.

Fuentes oficiales consultadas para esta preparación:
[backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha),
[MFA](https://supabase.com/docs/guides/auth/auth-mfa).
