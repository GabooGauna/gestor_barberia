# Checkpoint operativo del corte controlado — 19 de octubre de 2026

El propietario acepta riesgo residual de handlers internos Auth no enumerables;
no se afirma RPO 0 absoluto. No se repiten ensayos aprobados. Cambio de contrato
en el addendum de `../decisions/stage-04-scoped-cutover-rpo.md`.

Inspecciones frescas READ ONLY antes de modificar Supabase:

- Proyecto correcto, sa-east-1, ACTIVE_HEALTHY; 26 flags de proveedor, sólo email
  habilitado. Signup todavía ON: no se había iniciado mantenimiento.
- Las 26 tablas runtime Auth vacías. Writers desconocidos, transacciones abiertas
  ajenas, TX Auth y waits Auth: cero observados. Sin pg_cron/pg_net instalados.
- Ventana de logs de negocio REST de diez minutos, más minuto redondeado actual:
  solicitudes 0, escrituras 0. Son observaciones, no garantía universal.
- Otras cinco tablas conservan conteos y huellas UUID del respaldo conciliado:
  empleados 2, rutinas 5, tareas 53, auditorías 45, urgencias 4. Se calcularon
  además huellas legacy sin PIN para conciliar antes/después de operaciones.
- `empleado_rutinas`: conteo directo 0; RLS false, FORCE RLS false, owner postgres.
  El informe aprobado del respaldo original registra 3, UUID SHA256
  `48cf4bd6a0d2b09629e36dcfb9d3be7210edaec5c6b6dbbea2209c723996855f`
  y UUID/FK SHA256
  `da48ea43f92199f8de6c21fa881b489f2ed48ef0eb5cf5818543cace32b78d31`.

El propietario respondió «No; deben conservarse y recuperarse» al consultar si
la eliminación fue intencional. Autoriza recuperar exactamente esas tres
asignaciones. No se atribuye causa. Se detuvo el corte antes de PATCH, captura o
migraciones para preparar recuperación aislada y reparación INSERT-only.

Plan acotado aceptado por Reviewer: extraer sólo la tabla desde el respaldo
original autenticado; paquete DPAPI privado fuera del repositorio; destino vacío,
schema exacto, FK padres existentes y hashes originales. Locks/timeout y
verificación de las otras cinco tablas antes/después. Sin UPDATE/DELETE ni
restauración general. ACK incierto obliga conciliación, sin retry. El respaldo
definitivo se realizará después de recuperar y verificar las asignaciones.

El motor Docker local estaba apagado; se inició Desktop oculto y se verificó
listo/sin recursos TLS pendientes. No hubo conexión remota en el intento fallido
anterior por ausencia del daemon. Credenciales y CA existentes conservadas.

## Recuperación puntual ejecutada

El 19 de octubre se autenticó el archivo original y se extrajo exclusivamente
`empleado_rutinas`: tres filas, UUID y huella UUID/FK originales coincidentes.
Paquete privado DPAPI `ae32dc6044a8458a8e8a638b592f323d`, SHA256
`556af8219647f9ef5044d815b6ad2872cabc1139568f50833543b58741695b9a`.
No se imprimieron filas ni se consultaron PIN. Contenedor eliminado y ausencia
confirmada. El fallo previo de salida vacía se corrigió con `AllowEmpty` opt-in;
tres pruebas focales PASS, manteniendo el rechazo predeterminado.

Ensayo aislado `f2382c7ff0b5475ca80adc4d7bb729db`: mismo SQL, tres filas
recuperadas y padres ficticios; UUID/FK y otras cinco tablas del fixture
preservados. Segundo intento rechazado con SQLSTATE 40001, sin alterar las tres
filas; limpieza confirmada. No se repitieron suites Auth ni restauraciones completas.

Tras aprobación independiente se ejecutó únicamente el INSERT-only revisado,
SQL SHA256 `71f0172c87b993252a5165df5ddd830585e636360662802782398aa1782e925f`.
RunId `4226f6f84a4a437cab1c3794ca28e896`: COMMIT reconocido, tres filas y
huellas originales verificadas. Una lectura TLS posterior confirmó tres
asignaciones, UUID original y las huellas UUID/contenido legacy de las otras
cinco tablas sin variaciones. Defectos de roles, auditorías, referencias,
writers desconocidos, TX abiertas/Auth y waits: cero observados.

Se resuelve la discrepancia de asignaciones. En este checkpoint todavía no se
aplicaron migraciones, cambios Auth, Edge, color, frontend ni push; sigue pendiente
el respaldo definitivo del corte antes de expand.

## Respaldo definitivo y expand ejecutados

Se cerraron signup y login email mediante PATCH acotado y GET confirmatorio;
26 proveedores inventariados, ninguno habilitado. Configuración original
recuperable en el suplemento cifrado ya verificado. Es contención de admisión,
no prueba de drenaje interno absoluto.

El runtime supervisado finalizó `expanded_closed`, sin razón de aborto ni
conciliación pendiente: RunId y BackupId
`2abb1ac7f0d7611a54ab8b1ced9d7afe`, snapshot `00000019-000007E6-1`.
Evidencia estructurada y limpieza de workers/sesiones confirmadas. El respaldo
definitivo cifrado está fuera del repositorio, junto a su manifiesto y reporte
de restauración aislada; la clave está protegida mediante DPAPI del custodio.

- Manifest SHA256: `bceac7d3bff49f9ec3320dabef8cb019175ee7f6239c9e488241f11069ea1206`.
- Database ciphertext SHA256: `1071b4464f3b8fd31cc767841003fa532e1b3a13ab53ebc933c4a0c5f7e4c705`.
- Roles ciphertext SHA256: `cca7d861f654905233ae1e56039e1ad82c31af08835661736d1990b3a8c2475b`.

GCM, hashes de ciphertext/plaintext, pg_restore transaccional y propiedades/
owner/ACL/settings DATABASE verificados. Se conserva la adaptación revisada
del bootstrap OID 10 al restaurar roles, sin afirmar replay sin modificaciones.
Comparación entre reportes original y definitivo: conteos, UUID y UUID/FK de
las seis tablas coinciden, incluidas las tres asignaciones recuperadas.
No equivale a recuperación integral del proveedor ni acredita RPO 0 absoluto,
RTO integral o custodia portable independiente.

Aplicada únicamente `20261016010000_auth_profiles_expand.sql`, SHA256 original
`ae5be96cb0b1394785a3396a388a8d6ae1583681779333f961db52fa09d85095`.
Verificación exacta de catálogo postexpand PASS; lectura posterior confirma las
seis tablas y sus huellas legacy sin cambios. Grants de clientes quedan cerrados;
no restaurar los flags legacy tras este COMMIT. Auth26 vacío antes del bootstrap.

Aplicación por SQL explícito supervisado; no se creó/modificó el ledger
`supabase_migrations` ni se ejecutó `db push`. No reentregar expand por aparecer
pendiente en herramientas CLI. Cutover RLS, suplemento operativo, provisión,
Edge, frontend y color aún pendientes en este checkpoint. Reviewer aprobó el
subgate; próxima acción: candidato revisado de creación/bootstrap inicial.

## Administrador inicial vinculado y login real verificado

El candidato PS7 de provisión pasó AST y validaciones focales sintéticas de
credencial, gates, HTTP y argumentos; Reviewer aprobó Plan y una única Apply
condicionada. Plan remoto READ ONLY PASS. Apply
`930da5767dc243e4ac9b0928d796866c`: creación Auth y COMMIT de
`private.bootstrap_first_admin` reconocidos, audit verificado, sin INSERT de
empleado. Credencial tomada del PSCredential DPAPI aportado por el propietario,
sin imprimirla. Reconcile devolvió `expected_bootstrap_link_observed`; lectura
posterior de las seis tablas confirma UUID y huellas legacy sin cambios.

Se aplicó el payload Auth revisado y se confirmó por GET: signup deshabilitado,
email habilitado, Site URL y allowlist exactos
`https://gestor-barberia-five.vercel.app`, mínimo de contraseña 12. Ningún otro
proveedor habilitado; grants de negocio permanecen cerrados.

Smoke Auth REAL del administrador PASS: password login, identidad mediante
GET user, refresh, logout `scope=local` de su propia sesión de prueba y rechazo
posterior de su refresh token. No se revocaron otras sesiones ni se afirma
revocación instantánea del JWT de acceso. Tokens/contraseña sólo en RAM, no
impresos. Este resultado no acredita MFA/AAL2, acceso de negocio o RLS.

Pendientes en este punto: vincular el perfil empleado existente, cutover y
suplemento operativo, Edge, enrolamiento MFA/aceptación real por rol y frontend.
`rutinas.color` todavía no aplicada ni activada. Sin push o Etapa 5.

## Checkpoint posterior: RLS, Edge y MFA

Empleado existente vinculado sin INSERT de perfil: operación
`d39133b506d848269166e6b50c641b39`, COMMIT/audit y seis huellas UUID/FK
confirmados. Reconcile `expected_employee_link_observed`; lectura posterior
conserva las seis huellas legacy. Credencial inicial aleatoria protegida con
DPAPI del custodio, fuera del repositorio, sin salida ni clipboard automático.
Login/refresh/logout local y rechazo de refresh revocado del empleado PASS.

Aplicadas atómicamente las migraciones `20261016020000_auth_rls_cutover.sql`
y `20261017000000_security_operations.sql`, sin cambiar sus archivos ni incluir
color. Originales SHA256 `dc022fe321d954b0ca656cf3cf9708d7a15207ba6af17f7f97d740dd4b861a87`
y `ae06841c3730e6007ea1084c95410b444814772255a7b95b4f325ac8230c1c52`.
Composición revisada SHA256 `20af70c475f2bf7799ce51567ca4809397d26e6565c4b3d30c772654949599bf`:
se omiten sólo dos límites de transacción, preservando el resto de ambos
archivos y cerrando el mantenimiento en el mismo COMMIT. Ensayo focal de éxito
y rollback 7 checks PASS y adaptación TLS aprobados, sin repetir suites.
ACK/proof real PASS: seis RLS FORCE, grants anon de tabla/columna cero, columna
PIN ausente, maintenance true y sin admisiones pendientes. Históricos sin cambios.

Respaldo definitivo revalidado por hashes/ACL y clave DPAPI accesible, sin otra
captura/restauración. Se reutiliza el baseline preexpand según el runbook actualizado;
no equivale a copia del estado Auth posterior ni de los factores recién enrolados.

Edge `admin-users` desplegada con los dos archivos aprobados, verify_jwt=true,
ACTIVE/version confirmados por GET y origen exacto por digest SHA256. El primer
verificador esperaba `digest`; la API llama `value` a su metadato hash. Se
concilió el POST inicial por GET con el validador corregido, sin repetir escritura.
No se leyó ni imprimió ningún valor de secreto. Pruebas reales para ambos usuarios:
anon denegado en seis tablas y Edge, negocio cerrado para AAL1, JWT real aceptado
por gateway y Edge devuelve mfa_required; se cerraron sólo las sesiones de prueba.

20 de octubre: corregido el transporte del SVG original de Supabase (el SDK
prefija SVG sin escapar), sin generar otro QR. Imagen responsive 320 px sobre
fondo blanco y margen; alternativa manual con secret sólo en memoria/DOM de
enrolamiento, eliminado al verificar/reiniciar/cerrar sesión. Unit5, lint y build
PASS, dos E2E MFA aislados PASS/11,6 s; Reviewer independiente aprobó. No se
inspeccionó el QR real ni se afirma validación automática de cámara.
Propietario informó MFA configurado y lectura de metadatos confirmó un factor
TOTP verificado y una sesión AAL2; maintenance true e in_flight cero.
El factor y las sesiones actuales no están en el respaldo preexpand. Recuperar
el acceso exige el reset privilegiado y reenrolamiento por el propietario del
procedimiento Auth real aislado ya aprobado, con PAT/credenciales/journals
accesibles; no se afirma restauración exacta del factor ni se reactiva PIN/anon.

Pendientes: publicación Auth y aceptación final con AAL2/negocio, apertura
controlada y después color separado. Integración GitHub–Vercel existente
confirmada y commits/push autorizados. Sin Etapa 5 ni declaración de producción lista.

## Publicación Auth — 20 de octubre de 2026

- Commit `c03511e`, push normal autorizado a `main`; Vercel status `success`,
  deployment `4zkLmVx3AELLaohWbzYkkubC9Dm2` del proyecto existente.
- Dominio de producción HTTP 200, asset `/assets/index-n4vvqqeR.js`: cliente Auth,
  clave manual MFA, referencia Supabase correcta y bandera compilada de colores
  `false` comprobados. No se crearon proyectos ni configuraciones duplicadas.
- El propietario confirmó MFA configurado; consulta de metadatos previa:
  un factor TOTP administrativo verificado, una sesión AAL2, mantenimiento activo
  e in-flight cero. No se inspeccionaron semillas ni tokens.
- Pendiente login del propietario con MFA en el dominio definitivo y aceptación
  real de Edge/mantenimiento y datos por rol antes de habilitar el servicio.
- `rutinas.color` sigue sin aplicar y su bandera OFF. No se repitieron pruebas
  locales aprobadas ni respaldos/restauraciones.

### Aceptación del cliente y mantenimiento con MFA

Propietario confirmó login con contraseña y TOTP en Vercel: navegación de
administrador visible y paneles vacíos por mantenimiento. En sesión controlada
del mismo dominio se verificaron Auth GET user 200 y perfil activo admin, las
seis tablas REST sin filas y Edge `admin-users` con solicitud dummy a UUID
inexistente: HTTP 503 / `maintenance_active`. Esto demuestra paso de MFA y rol
antes del bloqueo de admisión; no hubo mutación de negocio. `/panel` responde
200 con el mismo artefacto Auth y no muestra el QR tras verificar.

Lectura de metadatos: un factor TOTP verificado, dos sesiones AAL2, mantenimiento
true e in-flight cero. Pendientes únicamente apertura controlada, comparación
de conjuntos UUID por rol y, después, entrega independiente de colores.

## Auth aceptado y color aplicado por separado

Open explícito devolvió ACK y lectura fresca maintenance=false/in-flight0.
Admin AAL2: seis conjuntos UUID exactos (45 auditorías, 3 asignaciones,
2 perfiles, 5 rutinas, 53 tareas, 4 urgencias). Empleado AAL1: conjuntos propios
exactos (45/3/1/3/36/4 por esos mismos recursos), filtro al perfil administrativo
vacío y logout sólo de su sesión de prueba. La referencia independiente se
obtuvo por SQL de sólo lectura, sin evaluar RLS ni claims para calcularla.
Edge AAL2 admitió solicitud dummy y rechazó destino inexistente 404; ninguna
mutación Auth ni negocio, admisión terminada. Reviewer aceptó Auth/RLS/Edge.

Luego Close explícito ACK/freshtrue/in-flight0. Se ejecutó sólo la migración
`20261016000000_add_rutinas_color.sql`, SHA256
`243940a950e51280b6a892df39f2ccbea67e9bbbfe04de27b338a0d963462b60`.
ACK positivo, seis hashes UUID/legacy invariantes, columna NOT NULL, paleta
validada y todas las rutinas copper. No db push ni otras migraciones.

Adaptador de reapertura: default sigue exigiendo columna ausente;
`-RoutineColorApplied` exige columna NOT NULL/default copper/constraint validado
sin cambiar las demás precondiciones. AST y dos Inspect reales PASS: fase
precolor rechaza, fase postcolor acepta; mantenimiento true/in-flight0.
Reviewer aprobó este guard y EmployeeColor condicionado a artefacto TRUE.
Nuevo transporte EmployeeRead: 28 guardas + parser/hash vacío PASS;
EmployeeColor: 12 guardas + parser PASS. No suites/backup/restore repetidos.
Pendiente confirmación del propietario de la variable Production true antes
del push que publicará colores y de las verificaciones finales de esa capacidad.
