# Contexto técnico — Gestor de Barbería

## Etapa 6 vigente — 20 de octubre de 2026

El propietario abrió expresamente Etapa 6 sobre los flujos aprobados de Etapa 5,
con optimización, regresión, limpieza real puntual de pruebas/César y publicación
GitHub–Vercel. No incorpora filtros avanzados pendientes ni cambia Auth/RLS.
Panel/roles/Auditoría usan carga diferida; Equipo consulta al entrar. JS inicial
538,10→488,29 kB y logo servido 964,66→176,13 kB; PNG maestro conservado, assets
del template retirados tras verificar no uso. Diseño/CSS GNS y temas intactos.
El respaldo puntual DPAPI de César está verificado fuera de Git/OneDrive y el
SQL selectivo pasó seis controles sintéticos. Limpieza remota con COMMIT y hard
delete Auth reconocidos: calendario/asignaciones vacíos, cinco rutinas/53 tareas,
colores y ambos administradores preservados; cero referencias huérfanas.
Evidencia y estado de limpieza,
regresión y publicación: `docs/reviews/stage-06-delivery.md`.

Los apartados siguientes son cronología del relevamiento y etapas anteriores;
sus bloqueos ya resueltos no vuelven a abrirse por este trabajo.

## Estado del relevamiento histórico

- Fecha de corte: 15 de octubre de 2026.
- Repositorio: SPA construida con React y Vite.
- Backend: Supabase, proyecto `ucmwykzrepmjucssjnum`.
- Inspección remota: MCP `supabase_barberia` en modo solo lectura.
- Alcance: auditoría y documentación; no se modificó lógica ni esquema remoto.

## Estado local de Etapa 4

Corrección de Auditoría del 20 de octubre: las tarjetas requieren al menos una
tarea vigente o un cumplimiento válido. Se omiten rutinas sin tareas y tarjetas
con sólo registros anulados/cancelados; el historial se conserva en datos,
indicadores y detalles mixtos. Sin cambios de Supabase. Alcance y evidencia en
`docs/reviews/audit-empty-cards.md`; no cierra toda Etapa 5.

Seguimiento visual del 20 de octubre: acciones de Equipo alineadas al selector
de rol y logo móvil dentro del flujo para respetar el padding de la cabecera.
Sólo CSS; evidencia local en `docs/reviews/control-sizing-mobile-nav.md`.

Seguimiento visual general del 20 de octubre, autorizado en el alcance acotado
de Etapa 5: refinamiento de controles, superficies, fondos, navegación y
tipografía en las pantallas existentes, conservando estructura y funcionalidad.
Sin cambios de backend ni Supabase. Dirección, pruebas y revisión en
`docs/reviews/visual-polish.md`; no implica cierre completo de Etapa 5.

Intervención visual del 20 de octubre en el alcance acotado de Etapa 5:
Auditoría presenta detalles agrupados por rutina (identidad, título y orden de
tareas), con colores configurados y emergencias en un bloque separado.
Consultas mantienen fecha/RLS y capacidad de color OFF/ON; sin migraciones.
Evidencia y límites en `docs/reviews/audit-task-grouping.md`.

Seguimiento del 20 de octubre: el propietario confirmó asignaciones diarias
reales y SQL mínimo directo en Supabase. `asignaciones_diarias` y su RPC por
fecha reemplazan el uso operativo de `empleado_rutinas`, conservado como legado
sin backfill. Nuevo día sin selecciones; historial con pendientes reales desde
su asignación. Calendario único, diálogo GNS y cancelación sólo de urgencias
pendientes de hoy en UI/servidor. Ver alcance actualizado en Etapa 5.

Intervención posterior solicitada el 20 de octubre: reinicio diario de tareas y
calendario con indicadores, acotados al alcance autorizado en
`docs/stages/05-auditoria-actividad-calendario.md`. Etapa 4 se conserva aprobada;
no se repite su auditoría ni se modifica Supabase. El frontend separa
configuración permanente (`empleado_rutinas`) de registros por fecha
(`auditoria_diaria`/`tareas_urgentes`), renueva el día argentino automáticamente
y consulta sólo registros reales en el calendario. Decisiones y validación en
`docs/reviews/daily-audit-calendar.md`. No implica cierre completo de Etapa 5.

Checkpoint vigente del 20 de octubre: desplegados y aceptados Auth/RLS/MFA,
Edge admin-users y colores de rutinas en el proyecto Supabase existente.
Frontend publicado mediante GitHub–Vercel: `c03511e` Auth y `cc8a40d` colores;
artefacto `/assets/index-BPXc_bpY.js`, bandera Production true comprobada.
Se mantienen los dos UUID de empleados y los seis conjuntos históricos,
incluidas tres asignaciones recuperadas. Admin AAL2 y empleado AAL1 acceden
exactamente a los UUID permitidos; anónimo/AAL1 administrativo/usuario ajeno
bloqueados. MFA nativo configurado y acceso real del propietario aprobado.
Color probado por UI administrativa copper→sage→copper con ACK/readback;
empleado real API lee sage y PATCH del valor actual devuelve 200 sin filas.
No se atribuye esa prueba API al navegador real del empleado; su UI local
aprobada se conserva. Después el propietario cambió los cinco colores y
confirmó expresamente conservarlos: steel2/plum1/sage2. No se sobrescribieron.
Servicio abierto: mantenimiento false e in-flight cero, con ACK y lectura
fresca. Reviewer independiente aprobó el alcance desplegado. No Etapa 5.
El respaldo definitivo verificado sigue siendo preexpand; recuperación Auth
usa reset/reprovisión/reenrolamiento, no restauración exacta del factor actual.
Se conservan los límites de riesgo residual y custodia aprobados. La cronología
siguiente no autoriza repetir migraciones, provisiones o pruebas completadas.

Avance remoto posterior: administrador inicial `admin.gns` creado por Admin API
y vinculado por bootstrap al perfil existente, sin cambiar UUID/históricos.
Reconcile y lectura de integridad PASS. Configuración Auth de producción
confirmada (signup OFF, email ON, origen Vercel exacto, mínimo 12). Smoke real
login/identidad/refresh/logout de su sesión y rechazo de refresh revocado PASS.
Todavía sin MFA/AAL2 aceptado, vínculo del empleado, cutover RLS, suplemento,
Edge o frontend; negocio permanece cerrado. Color sigue pendiente independiente.

Checkpoint remoto posterior: respaldo definitivo cifrado/restauración aislada
supervisados PASS (`2abb1ac7f0d7611a54ab8b1ced9d7afe`), seis tablas conciliadas
con el respaldo original y aplicada únicamente expand Auth
`20261016010000_auth_profiles_expand.sql`. Catálogo exacto y lectura posterior
PASS, UUID/históricos preservados; signup/email y grants de clientes cerrados.
No reejecutar expand: se aplicó por SQL explícito, sin ledger CLI ni db push.
Pendientes provisión/bootstrap/vínculos, cutover RLS, suplemento, Edge y frontend;
color separado y todavía ausente. No restaurar flags legacy tras expand.

Checkpoint posterior del 19 de octubre: recuperadas en origen exactamente las
tres asignaciones históricas autorizadas mediante INSERT-only revisado y
ensayado; COMMIT reconocido. Lectura posterior confirma UUID/FK originales y
las otras cinco tablas sin cambios en conteos/huellas. Evidencia en
`docs/reviews/stage-04-controlled-cutover-checkpoint.md`. Sigue pendiente el
respaldo definitivo antes de expand; no hay migraciones Auth/color aplicadas
en este checkpoint, ni despliegues o push.

Decisión más reciente del 19 de octubre: propietario acepta corte controlado
con riesgo residual y sin RPO 0 absoluto; no requiere consultar a Supabase ni
probar drenaje exhaustivo interno. Se conservan los demás gates. Actividad
observable sin writers/TX/waits externos, REST de negocio reciente cero, Auth26
vacío. Apareció discrepancia concreta: empleado_rutinas 0 en origen frente a 3
en respaldo verificado; propietario confirma que deben conservarse/recuperarse.
Preparar reparación acotada INSERT-only con UUID/FK originales, antes del
respaldo definitivo y de Auth. Sin escrituras remotas ejecutadas en ese checkpoint.
El bloqueo de garantía absoluta del párrafo histórico siguiente queda retirado.

Checkpoint 19 de octubre: runtime local, TLS, cancelación del restore real y
evidencia estricta aprobados; GET Auth correlacionado PASS preservado. Los logs
remotos sólo aportan finalizaciones (23 h: seis eventos/seis completions/cero
starts), no prueba exhaustiva de drenaje. Corte detenido antes de escrituras:
falta mecanismo soportado de terminación/quiescencia únicamente Auth o inventario
inflight fiable. Alternativa mínima y consulta preparada al proveedor en
`docs/runbooks/stage-04-cutover-maintenance.md`. Se conserva B, el respaldo
preparatorio verificado y la autorización condicional; sin nuevas migraciones
aplicadas, despliegues o push. No repetir pruebas aprobadas.

Actualización vigente: nuevo PAT guardado por el propietario, GET de gestión de
proyecto/Auth/backups ya exitosos; 403 resuelto. No repetir captura del token.
Identificador remoto coincide; nombre interno `barberia-sop`, aplicación GNS.
Configuración Auth original preservada en suplemento DPAPI verificado fuera
del repo. Corrección del diagnóstico TOC: `pg_restore --list` oculta metadata
DATABASE si no se agrega `--create`; los conteos 0 anteriores NO demuestran
ausencia en el archivo. Fixture real confirma el filtro. Inventario real corregido
PASS: DATABASE1/PROPERTIES1/ACL1, identidad inesperada0, hashes/GCM y cleanup PASS.
No se necesita reconstrucción desde suplemento. Nuevo ensayo combinado PASS:
metadata DATABASE original y comparación owner/ACL/settings/locale, arranque
Auth restaurado vacío, cuenta sintética/login/refresh/reinicio y UUID/FK
conservados; limpieza confirmada. No equivale a todo Supabase/RTO integral.
Decisión posterior recibida: preparar y ensayar alternativa B, RPO 0 de negocio
y runtime Auth con metadata administrada/plano de control sujetos a drift/aborto.
Sustituye suspensión literal del proveedor; no certifica implementación ni abre
producción. Decisión `docs/decisions/stage-04-scoped-cutover-rpo.md` y procedimiento
en `docs/runbooks/stage-04-cutover-maintenance.md`.
No se modificó producción. Detalle en `docs/reviews/stage-04-supabase-resume.md`.

Reanudación posterior al commit local `10bc305`: propietario confirma variables
Vercel y origen `https://gestor-barberia-five.vercel.app` (GET público 200).
MCP de proyecto funciona; Management API devuelve 403 con mensaje explícito
de privilegios insuficientes, sin distinguir aún rol de cuenta/scopes. Captura
DPAPI de PAT preparada y revisada; intervención humana en
`docs/runbooks/stage-04-management-access.md`. Auth v2.197.0 con 26 tablas runtime
vacías; sólo schema_migrations tiene 82 filas. Vault/Storage sin contenido
inventariado. Faltan SHARE privileges sólo en cuatro tablas internas identificadas,
no en todas las runtime. No se ejecutaron locks. Nuevo ensayo de metadata DATABASE
detenido en validación TOC; PASS SQL previo conservado, sin otro respaldo.
Detalle vigente en `docs/reviews/stage-04-supabase-resume.md`.
Sin cambios de producción, push ni publicación por esta reanudación.

Última decisión del 18 de octubre: frontend React en Vercel y backend en
Supabase. Configuración local preparada en `vercel.json` y `.env.example`;
procedimiento en `docs/runbooks/stage-04-vercel.md`. Falta vincular proyecto
Vercel y verificar dominio/variables; no hubo deploy ni cambios de Supabase.
Esta decisión sustituye la falta de elección de hosting descrita debajo,
sin levantar los gates de recuperación/configuración/mantenimiento pendientes.
Lectura adicional acotada: el operador `postgres` no cubre los privilegios de
SHARE lock en todas las tablas Auth/Storage; no se ejecutaron locks. Falta
mecanismo de suspensión integral soportado/verificado. Detalle y evidencia
de preparación en `docs/reviews/stage-04-vercel-preparation.md`.

Estado vigente tras la interrupción del 18 de octubre: TLS ya funciona y existe
el respaldo preparatorio cifrado `ab70bce0fa53469f8f8659c4564970ba`, fuera del repo;
NO volver a capturarlo ni repetir ensayos aprobados. Reanudación de restore:
clave DPAPI/GCM/hashes verificados; se resolvió el fallo de roles conservando
bootstrap OID 10 con excepción única CREATE documentada. Restore PostgreSQL
aislado PASS y cleanup confirmado; conteos/UUID/FK y metadatos de roles coinciden
con observaciones posteriores a captura. No prueba todo Supabase ni RPO 0.
Propietario es
custodio principal y pospone suplente/bóveda/ubicación definitiva; no hay hosting.
GET público Auth confirma signup habilitado; no se cambió configuración.
Evidencia vigente en `docs/reviews/stage-04-existing-backup-recovery.md`.
No se aplicaron migraciones ni color. Los estados siguientes son cronología
anterior y no deben volver a interpretarse como CA/contraseña faltantes.

Checkpoint vigente del 18 de octubre: el propietario guardó la credencial;
importación DPAPI y ACL verificadas fuera de AppContainer. El intento de conexión
Session pooler con `verify-full` y raíces del sistema falló antes de autenticar
por validación TLS; también falló el diagnóstico TLS sin contraseña con confianza
Windows. Falta aportar la CA oficial descargada del Dashboard. No hubo backup,
restore ni escrituras de despliegue. Evidencia y paso manual exacto en
`docs/reviews/stage-04-session-pooler-tls-checkpoint.md`. La contraseña PostgreSQL
todavía no se pudo validar; no se afirma incorrecta ni se baja el nivel TLS.

Solicitud más reciente del 18 de octubre: contraseña PostgreSQL restablecida
por el propietario; falta introducirla mediante canal local seguro. Se autoriza
respaldo manual cifrado por Session pooler y restore aislado. También se autoriza
`rutinas.color` como operación independiente únicamente después de validar el
despliegue Auth, con flag OFF hasta verificar esa migración. Decisión vigente:
`docs/decisions/stage-04-manual-backup-and-color-authorization.md`. No hubo
backup, restore ni escrituras de despliegue en esta preparación de credenciales.
Las exclusiones anteriores de color/backup manual quedan actualizadas por esa
solicitud; los demás requisitos críticos y Etapa 5 permanecen sin cambios.

Último reintento del 18 de octubre: MCP `supabase_barberia`, acotado al ref
esperado, volvió a responder a esquema/migraciones/Edge/SQL read-only. No hay
migraciones registradas ni Edge; baseline legacy con seis tablas sin RLS y
grants anon, sin `private`, vínculo Auth o `rutinas.color`. No se escribió.
Los GET de respaldo y Auth con el token de Management API siguen en 403 por
esa ruta distinta; no es fallo de acceso MCP ni de herramientas de cuenta
deshabilitadas por `project_ref`. Continúa parada antes de escrituras por falta
de backup/restore integral y configuración/contención verificables. Evidencia
actual en `docs/reviews/stage-04-mcp-retry-2026-10-18.md`; la autorización
condicional y el riesgo aceptado siguen vigentes. Lo que sigue es cronología.

Decisión vigente del 18 de octubre de 2026: el propietario conserva Supabase
Auth nativo, altas/reset administrativos y ninguna opción visible de cambio
para empleados; acepta expresamente el cambio propio por API directa. El gate
anterior de exclusividad queda sustituido, no implementado. Decisión en
`docs/decisions/stage-04-native-auth-risk-acceptance.md`. Autorizó el despliegue
real CONDICIONADO a verificar los prerrequisitos del runbook; el intento se
detuvo antes de escribir porque cuatro GET de Management API devolvieron 403.
La URL local coincide con el ref esperado, pero no verifica acceso/identidad
remotos. Backup, restore integral, drift/configuración y recuperación del
ambiente siguen sin certificar. Informe en
`docs/reviews/stage-04-deployment-attempt-2026-10-18.md`. Sin migraciones,
cuentas, configuración, Edge o frontend remotos modificados; no push/color/Etapa 5.

Los párrafos siguientes conservan la cronología previa a esa decisión; las
prohibiciones absolutas de cambio propio y falta de autorización allí descritas
están sustituidas por la decisión vigente, sin alterar resultados de pruebas.

Reanudación del 18 de octubre de 2026: nuevo foco con reautenticación y
contraseña actual ON reproduce self-update del empleado (13 assertions de
reproducción, no cumplimiento). Las 40+10 pruebas anteriores se conservan.
No se garantiza exclusividad con la arquitectura actual demostrada; alternativas
previas a implementar en `docs/decisions/stage-04-password-architecture-options.md`.
Estado y pendientes en `docs/reviews/stage-04-resumption-2026-10-18.md`;
el bloqueante sigue abierto, sin cambio automático de arquitectura ni remoto.

Suplemento operativo candidato posterior al cierre histórico: cuotas Edge
persistentes, mantenimiento del servidor y MFA administrativo obligatorio con
TOTP/AAL2 se implementan localmente en `20261017000000_security_operations.sql`,
Edge y guard de UI. Contrato y gates en `docs/runbooks/stage-04-security-controls.md`.
No se aplica al remoto ni se declara validado todo Supabase por el ensayo SQL
anterior; las evidencias y revisión del candidato se registran por separado.
Resultados del suplemento: lint/build,11 unitarios,45 E2E y40 assertions Auth
real locales aprobados; ver `docs/reviews/stage-04-security-controls-validation.md`.
Reviewer aprueba sólo subcontroles: el propietario confirmó exclusividad
administrativa de TODO cambio de contraseña y Auth directo todavía permite
cambio propio. Es BLOQUEANTE abierto documentado en
`docs/decisions/stage-04-admin-only-passwords.md`; no se declara candidato completo
aprobado ni staging/producción autorizados. Rate limiting de login Auth del
gateway, backup/restore proveedor y RPO/RTO integral siguen pendientes.

Al 17 de octubre de 2026, el repositorio local reemplaza el acceso por PIN por
Supabase Auth con username y contraseña. El username canónico se traduce a un
email técnico determinista; Supabase conserva las contraseñas. La sesión se
verifica contra `get_current_employee_profile()`, el rol autorizado vive en
`empleados.rol` y todas las operaciones de negocio quedan limitadas por RLS o
RPC. La administración de cuentas usa la Edge Function `admin-users`; la
service role no llega al navegador.

Las migraciones expand/cutover, sus rollbacks, pruebas SQL y el runbook están
preparados, pero **no se aplicaron al proyecto remoto**. Por eso, las secciones
de relevamiento remoto que siguen conservan el baseline inseguro observado y
no describen un despliegue ya realizado. Producción continúa bloqueada hasta
ensayar backup/restauración y verificar exactamente la configuración candidata
de Auth, Edge, grants y RLS con autorización separada.

La Etapa 4 quedó cerrada localmente el 17 de octubre de 2026 con Backend,
Frontend, Tester y Reviewer aprobados y sin hallazgos bloqueantes/altos
abiertos. La evidencia y sus límites se conservan en
`docs/reviews/stage-04-validation.md`; el dictamen independiente está en
`docs/reviews/stage-04-final-review.md`. Pasaron lint/build, 40/40 E2E de la
suite previa, 7/7 casos afectados reejecutados con el nuevo test de teclado
del diálogo, 6/6 unitarios y 8/8 pasos SQL. También se validaron Auth y Edge
reales en un stack local sintético; el ajuste final de preflight se verificó
con el handler y Fetch nativo. No se declara una repetición completa de 41
E2E ni del stack real después de ese ajuste acotado.

Las correcciones finales cubren CORS, foco del diálogo, ACL bootstrap,
protección del único admin y locks antes de revalidar al actor. La migración de
empleados existentes usa Admin API y `admin_link_auth_account` conservando sus
UUID; la acción `create` de Edge es sólo para integrantes nuevos. El runbook
documenta bootstrap, reconciliación y rollback fail-closed. No se inició
Etapa 5 ni se autorizó producción.

```text
Browser
└─ React 19 + React Router 7
   ├─ /                 Login username/password
   ├─ /panel            Ruta protegida por sesión + perfil DB activo
   └─ supabase-js       anon key pública, JWT de Auth
      ├─ Auth           sesión/refresh/logout
      ├─ PostgREST      RLS en seis tablas + RPC de trabajo
      └─ admin-users    operaciones de cuenta con service role sólo en runtime
```

## Propósito actual

La aplicación administra protocolos operativos de una barbería. Un administrador crea rutinas y tareas, registra personal, asigna rutinas, envía tareas urgentes y revisa cumplimiento diario. Un empleado visualiza sus asignaciones y marca tareas como realizadas.

## Arquitectura remota relevada antes de Etapa 4

```text
Browser
└─ React 19 + React Router 7 + Tailwind CSS 4
   ├─ /                 Login por selección de empleado + PIN
   ├─ /panel            Panel elegido por rol guardado en localStorage
   └─ supabase-js       Acceso directo con clave anon
      └─ PostgREST / PostgreSQL (esquema public)
```

No existe servidor de aplicación, capa de dominio, API propia, funciones públicas de base de datos ni middleware de autorización. Los componentes llaman directamente a Supabase y concentran consulta, reglas de presentación y mutaciones.

## Estructura y responsabilidades

| Archivo | Responsabilidad actual |
|---|---|
| `src/main.jsx` | Bootstrap de React con `StrictMode` e inicialización temprana del tema. |
| `src/App.jsx` | Rutas públicas `/` y `/panel`; no hay guard de sesión. |
| `src/services/supabase.js` | Cliente con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. |
| `src/pages/Login.jsx` | Lista empleados, verifica PIN y guarda la fila obtenida en `localStorage`. |
| `src/pages/Panel.jsx` | Lee `usuarioBarberia` y elige panel por `rol`. |
| `src/components/BrandLogo.jsx` | Integra el logo transparente de GNS Hair Studio. |
| `src/components/UserActionsMenu.jsx` | Menú responsive de cuenta, apariencia y cierre de sesión. |
| `src/components/ThemeSelector.jsx` | Selector visual persistido para tema claro, oscuro o sistema. |
| `src/components/PanelAdmin.jsx` | Navegación admin; CRUD de rutinas, tareas y empleados. |
| `src/components/RegistroEmpleados.jsx` | Alta de empleado, PIN y rol. |
| `src/components/AsignarRutinas.jsx` | Alta/baja de relaciones empleado-rutina. |
| `src/components/EnviarTareaUrgente.jsx` | Alta de tarea urgente para la fecha calculada en cliente. |
| `src/components/CalendarioAuditoria.jsx` | Agrega actividad por fecha y permite borrar urgencias. |
| `src/components/PanelEmpleado.jsx` | Lee asignaciones, urgencias y auditoría; marca/desmarca cumplimiento. |
| `src/utils/coloresSeccion.js` | Paleta determinista de secciones. |
| `src/utils/coloresRutina.js` | Contrato visual y feature flag de colores de rutina. |
| `src/index.css` | Tokens semánticos, temas, shell responsive y adaptación de estados. |

`src/App.css` y varios assets públicos conservan contenido del template de Vite y no forman parte del flujo principal.

## Dependencias y tooling

- Ejecución: React, React DOM, React Router DOM y `@supabase/supabase-js`.
- UI: Tailwind CSS mediante `@tailwindcss/vite`.
- Build: Vite. Calidad: ESLint con reglas base, hooks y refresh.
- E2E: Playwright Test 1.64 con Chromium y Axe para accesibilidad básica.
- No hay TypeScript, gestor de estado externo, capa de fetching ni tests unitarios/integración.
- Scripts: `dev`, `build`, `lint`, `preview` y variantes `test:e2e*`.
- `package.json` declara rangos con `^`; `package-lock.json` es la fuente reproducible para `npm ci`.

## Flujos remotos relevados antes de Etapa 4

### Acceso

1. La pantalla pública obtiene `id`, `nombre` y `rol` de todos los empleados.
2. El usuario selecciona un perfil e ingresa un PIN de cuatro dígitos.
3. El navegador consulta `empleados` por `id` y `pin` con `select("*")`.
4. Si coincide, guarda la fila completa en `localStorage.usuarioBarberia` y navega a `/panel`.
5. `/panel` confía en el campo `rol` local para renderizar administración o tareas.

No hay Supabase Auth, JWT, sesión verificable ni claims confiables.

### Administración

- Crear/eliminar plantillas de rutina y agregar/eliminar tareas.
- Registrar empleados con rol `empleado` o `admin` y PIN; eliminar no administradores.
- Asignar/desasignar rutinas, crear urgencias y consultar cumplimiento por fecha.

### Empleado

- Ver rutinas y urgencias asignadas.
- Marcar/desmarcar tareas creando/eliminando auditoría o actualizando una urgencia.

## Modelo de datos inspeccionado

Todas las tablas están en `public`, usan UUID como clave primaria y tienen RLS desactivado.

| Tabla | Campos relevantes | Relaciones y observaciones |
|---|---|---|
| `empleados` | `id`, `nombre`, `pin`, `rol`, `creado_en` | `pin` es texto y `UNIQUE`; no se inspeccionaron valores. `rol` no tiene constraint de dominio. |
| `rutinas` | `id`, `titulo`, `creado_en` | Plantilla raíz. |
| `tareas_rutina` | `id`, `rutina_id`, `seccion`, `descripcion`, `orden` | FK a `rutinas` con cascade. |
| `empleado_rutinas` | `id`, `empleado_id`, `rutina_id` | Ambas FK con cascade; combinación empleado-rutina única. |
| `auditoria_diaria` | `id`, `tarea_id`, `empleado_id`, `fecha`, `completado_en` | Ambas FK con cascade; falta unicidad por empleado, tarea y fecha. |
| `tareas_urgentes` | `id`, `empleado_id`, `descripcion`, `completada`, `fecha`, `creado_en` | FK a empleado con cascade. |

Varias FK admiten `NULL`. No se observaron checks de rol, longitud/formato del PIN, fechas o contenido; tampoco triggers ni migraciones registradas. Los únicos índices observados son PK, PIN único y asignación empleado-rutina única, sin índices específicos para filtros frecuentes por FK y fecha.

### Cambio local pendiente de aplicación: color de rutina

La Etapa 3 prepara la migración local
`supabase/migrations/20261016000000_add_rutinas_color.sql`, pero la columna aún
no forma parte del esquema remoto inspeccionado. El contrato, la capacidad
`VITE_ENABLE_RUTINAS_COLOR`, el orden seguro de habilitación y el rollback están
documentados en `docs/contracts/rutinas-color.md`. Mientras la capacidad no esté
habilitada después de aplicar la migración en cada ambiente, el cliente no debe
leer ni escribir `rutinas.color` y debe usar el fallback visual local `copper`.

## Contratos remotos relevados antes de Etapa 4

| Flujo | Tabla | Operaciones y filtros |
|---|---|---|
| Login | `empleados` | `SELECT id,nombre,rol`; luego `SELECT * WHERE id=? AND pin=?`. |
| Panel admin | `empleados` | `SELECT *`, `INSERT`, `DELETE WHERE id=?`. |
| Plantillas | `rutinas` | `SELECT` con `tareas_rutina`, `INSERT`, `DELETE`. |
| Tareas | `tareas_rutina` | `INSERT`, `DELETE`; lectura anidada. |
| Asignaciones | `empleado_rutinas` | `SELECT`, `INSERT`, `DELETE` por empleado/rutina. |
| Urgencias | `tareas_urgentes` | `INSERT`, `SELECT`, `UPDATE`, `DELETE`. |
| Cumplimiento | `auditoria_diaria` | `SELECT`, `INSERT`, `DELETE` por empleado, tarea y fecha. |

No hay tipos compartidos ni validación de respuesta; tabla y columna se escriben como strings en componentes.

## Semántica de borrado

Todas las FK usan `ON DELETE CASCADE`: borrar un empleado elimina asignaciones, auditorías y urgencias; borrar una rutina elimina asignaciones y tareas; borrar una tarea elimina su historial. Las confirmaciones no describen todo el impacto y no existe papelera, soft delete, export previo ni recuperación documentada.

## Hallazgos de seguridad

### Críticos

1. **RLS desactivado en las seis tablas públicas** y ninguna política definida.
2. **Permisos amplios:** `anon` y `authenticated` tienen `SELECT`, `INSERT`, `UPDATE` y `DELETE` en todas las tablas.
3. **PIN expuesto al cliente:** login y panel admin usan `select("*")`; la fila de login, incluido el PIN, queda en `localStorage`.
4. **Identidad y rol falsificables:** modificar `usuarioBarberia` permite adoptar cualquier identidad/rol visual, y la base tampoco autoriza.

### Altos

1. Cascadas con pérdida de historial, ampliadas por acceso anónimo de escritura.
2. `/panel` no valida sesión ni redirige ante estado ausente o inválido.
3. Auditoría mutable y sin `UNIQUE (empleado_id, tarea_id, fecha)`.
4. PIN de cuatro dígitos en texto, enumerable y sin rate limiting observado.

### Medios

1. `toISOString()` usa UTC y puede desplazar el día respecto de `America/Buenos_Aires`.
2. Faltan constraints `NOT NULL`, checks de dominio e índices para FK/fecha.
3. Errores inconsistentes; una eliminación de auditoría no comprueba `error` antes de actualizar UI.
4. Auditoría agregada en cliente mediante múltiples consultas completas, con baja escalabilidad.
5. No hay pruebas automatizadas, guards de regresión ni observabilidad estructurada.
6. Varios `div` interactivos carecen de semántica/teclado adecuados.

## Gate de producción

La aplicación **no es apta para producción**. El gate solo puede revisarse después de demostrar autenticación con Supabase Auth, autorización efectiva mediante RLS, privilegios mínimos, eliminación del PIN/secretos del cliente, protección frente a navegador manipulado, pruebas negativas y una política segura para cascadas e historial.

## Cierre local de Etapa 3

- `npm run lint`: exitoso, sin reglas deshabilitadas ni advertencias silenciadas.
- `npm run build`: exitoso con Vite 8.3.0.
- Bundle principal: 519,50 kB minificado y 147,34 kB gzip; mantiene la advertencia de chunk mayor a 500 kB.
- Logo fuente: PNG transparente de 964,66 kB; se conserva sin alteración y queda pendiente un derivado optimizado.
- `npm run test:e2e`: 31 pruebas exitosas en Chromium, incluidos tema, branding, menú, responsive, accesibilidad y colores de rutina con capacidad OFF/ON.
- Axe no reportó violaciones críticas o serias en los escenarios cubiertos de ambos temas.
- E2E usa servidores locales en 4173/4174, reemplaza Supabase por `127.0.0.1:54321`, intercepta PostgREST y falla si aparece un request a `*.supabase.co`.
- La revisión visual cubrió 375, 768 y 1440 px con estados vacíos y poblados. Dos adjuntos móviles del Login resultaron corruptos por el harness; capturas aisladas y medición geométrica verificaron el logo y el foco sin desplazamiento.
- `npm audit`: 0 vulnerabilidades luego de actualizar la resolución transitiva de `source-map-js` a una versión corregida.

Tester y Reviewer aprobaron la Etapa 3 el 16 de octubre de 2026. La aplicación
continuaba bloqueada para producción por los riesgos críticos de autenticación,
rol local, RLS y privilegios anónimos. Este es el registro histórico del cierre
de Etapa 3; el estado local posterior de Etapa 4 se describe al inicio.

## Oportunidades de optimización del bundle

Estas acciones quedan documentadas, no implementadas en Etapa 2:

1. Dividir por ruta con `React.lazy` para que Login y Panel no compartan el mismo chunk inicial.
2. Cargar bajo demanda las vistas administrativas de auditoría, asignaciones y urgencias.
3. Medir la participación de Supabase/React con un visualizador antes de definir `manualChunks`.
4. Retirar `App.css` y assets del template solo después de confirmar que no se usan.
5. Comparar peso total, carga inicial y navegación antes/después; aumentar el límite de advertencia sin reducir bytes no cuenta como optimización.

## Decisiones y verificaciones pendientes de despliegue

La preparación operativa suplementaria del 17 de octubre está en
`docs/runbooks/stage-04-backup-continuity.md` y su evidencia delimitada en
`docs/reviews/stage-04-deployment-preparation.md`. Añade un ensayo Docker de
backup/restore SQL sintético y procedimientos de continuidad; no cambia los
contratos aprobados ni valida Auth/Edge/configuración remotos. Los pendientes
registrados en esa preparación histórica fueron cuotas Edge, MFA/CAPTCHA,
recuperación HTTP y backup real. El suplemento posterior validó localmente
cuotas/MFA/recuperación HTTP; estado vigente al inicio de este documento y en
`docs/reviews/stage-04-security-controls-validation.md`. La configuración remota,
CAPTCHA y el backup/restore completo del proveedor siguen sin validar.
Reviewer independiente aprobó únicamente este suplemento local en
`docs/reviews/stage-04-operational-review.md`; mantiene bloqueado el despliegue.

- Autorizar y ejecutar backup/restore drill sobre staging antes de cualquier
  cambio remoto.
- Verificar signup global OFF con proveedor email habilitado para login,
  redirect allowlist, límites de intentos, CAPTCHA si corresponde y MFA/AAL2
  para administradores.
- Definir el canal operativo de entrega de contraseñas iniciales y el eventual
  reemplazo por invitaciones de un solo uso o recuperación con correo real.
- Aplicar y verificar `rutinas.color` por separado; no forma parte del cutover
  Auth.
- Repetir Auth/RLS/Edge/E2E contra la configuración candidata real antes de
  levantar el bloqueo de producción.
