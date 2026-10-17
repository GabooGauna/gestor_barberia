# Revisión independiente final — Etapa 4

Fecha: 17 de octubre de 2026. Dictamen final: **APROBADO para cierre local de
Etapa 4**, sin hallazgos bloqueantes ni altos abiertos. Este documento no
autoriza operaciones remotas ni despliegue ni declara producción apta.

## Alcance y evidencia

Revisión independiente del código de Auth, administración Edge, migraciones
expand/cutover, ACL/RLS de las seis tablas, rollbacks, pruebas y contratos.
Se leyeron AGENTS, contexto, PRD, reglas, stage y workflow antes de revisar.
Se conserva la evidencia del Tester confirmada por el Orquestador: lint/build
correctos, 40/40 E2E, 4/4 unitarios, 8/8 verificaciones SQL en PostgreSQL
descartable y Auth/Edge reales locales con datos sintéticos. No se repitieron
esas suites porque el código cubierto continuaba válido. Tras las correcciones
de esta revisión, el Tester repitió lint/build (exit 0), los unitarios Backend
(6/6) y account-management (7/7, incluido el nuevo caso modal en tres anchos y
dos temas). La cobertura vigente reúne 41 casos E2E; no se afirma una ejecución
completa de 41/41. Evidencia y límites en `stage-04-validation.md`.

## Controles revisados

- Bootstrap: EXECUTE exclusivo de service_role (además del propietario SQL),
  bloqueo del segundo bootstrap y coincidencia UUID/email técnico; ACL incluida
  en la prueba expand.
- Último administrador: rechazo real de degradación y autodesactivación con
  conservación del perfil activo; ausencia de UPDATE directo de empleados.
- Concurrencia: link, deactivate, activate y set_role toman el mismo advisory
  lock transaccional antes de revalidar al actor y bloquear la fila objetivo.
  Esto serializa cambios del padrón y evita usar un rol comprobado antes de
  esperar el lock. La revisión verifica el código y las aserciones SQL; no
  presenta una prueba de estrés multiconexión como realizada.
- RLS habilitado y forzado en seis tablas; anon sin negocio; proyección pública
  de empleados por columna y funciones administrativas no ejecutables por
  authenticated. La autoridad proviene del perfil activo vinculado a Auth.
- Historial conservado mediante FK RESTRICT, archivo/anulación/cancelación y
  eventos append-only de cumplimiento. El rollback cutover mantiene cierre
  de acceso y no restaura PIN, grants anónimos ni cascadas.
- Fallos parciales Edge: alta compensada, desactivación DB antes de ban Auth,
  reactivación con validación de identidad, reset con auditoría durable y
  respuesta de reconciliación cuando no puede afirmarse atomicidad.

## Hallazgos

### R4-01 — Alto — Resuelto — Preflight CORS administrativo

`supabase/functions/admin-users/index.ts:28` serializa siempre un JSON y la
rama OPTIONS en la línea 85 solicita status 204. Fetch rechaza cuerpos para
ese status; la reproducción con Response nativo produjo TypeError. El
preflight CORS del navegador puede impedir las acciones administrativas.
Además, allow-headers omite x-client-info, enviado por supabase-js según
`node_modules/@supabase/supabase-js/src/lib/constants.ts`. Requiere cuerpo null
para 204, permitir ese header y pruebas directas del handler con origen
permitido/denegado y los headers reales del SDK. Las pruebas E2E interceptadas
y las llamadas POST locales previas no cubrían este caso.

Corrección revisada: response usa cuerpo null para 204 y permite x-client-info.
Dos pruebas ejecutan el handler real, transformado sin tipos, con Fetch nativo:
OPTIONS permitido valida status, ausencia de cuerpo, origen y todos los headers;
origen ajeno/configuración ausente se rechazan. No se construye cliente Auth/DB
en el preflight. Resultado del gate Backend: 6/6.

### R4-02 — Medio — Resuelto — Manejo de foco del modal de reset

`src/components/PanelAdmin.jsx:670` declara aria-modal y autofocus, pero no
contiene Tab, maneja Escape ni devuelve foco al disparador. La revisión Axe
de vistas no equivale a verificar el modal abierto con teclado.

Corrección revisada: dialog nativo con showModal, cancelación Escape, limpieza
de campos y devolución de foco al disparador. El nuevo caso E2E valida Tab y
Shift+Tab dentro del modal, Escape, Cancelar, foco restaurado, campos vacíos al
reabrir, ancho y Axe en 375/768/1440 y ambos temas. Suite afectada: 7/7.

### R4-03 — Medio — Resuelto documentalmente — Reconciliación de huérfanos

Ante fallo de perfil y de compensación, account_create_compensation_failed
conserva el UUID de empleado, pero no el UUID Auth recién creado. La identidad
sin perfil queda sin permisos RLS; el riesgo es operativo. El runbook debe
explicar cómo identificarla de forma autorizada o conservar ese UUID no
secreto en la auditoría para reconciliarla sin registrar credenciales.

El runbook ahora distingue ambos UUID y define búsqueda administrativa paginada
por el username de la solicitud operativa, verificación del UUID Auth y ausencia
de vínculo antes de compensar. Si falta contexto o hay ambigüedad, exige escalar
y conservar mantenimiento. Permanece la limitación operativa explícita de que
el evento de compensación no conserva el UUID Auth; no permite acceso RLS.

### R4-04 — Bajo — Resuelto — Redacción de contraseña inicial

El runbook y la UI usan “temporal” sin expiración ni cambio obligatorio
implementados. Deben describir contraseña inicial y reset administrativo,
sin prometer un mecanismo de un solo uso.

UI y runbook usan contraseña inicial; el runbook aclara que los reemplazos son
administrativos y que no hay expiración de un solo uso ni cambio forzado.

### R4-05 — Alto — Resuelto — Vinculación de empleados existentes

El paso de provisión del runbook remitía a admin-users para las demás cuentas.
La acción create genera siempre un UUID y perfil nuevos; no vincula empleados
existentes. Aplicar ese procedimiento duplicaría perfiles y dejaría los
originales activos sin vínculo, bloqueando cutover. La transición debe crear
la identidad mediante Admin API administrativa y ejecutar
admin_link_auth_account con el empleados.id existente; create debe reservarse
para incorporaciones nuevas. Requiere corregir runbook y verificar conteos y
relaciones de los perfiles preservados antes/después de la vinculación.

Contrato y runbook ahora indican Admin API segura seguida de
admin_link_auth_account con el empleados.id original, compensación ante fallo y
conciliación de conteos/UUID/FK. Edge create queda reservado para altas nuevas.
Se documenta que legacy inactivo sin vínculo no puede reactivarse desde UI y
requiere provisión planificada o procedimiento privilegiado autorizado.

## Límites del gate y handoff

R4-01 a R4-05 quedan cerrados con las correcciones y evidencias indicadas.
Los cuatro residuales previos también quedan trazados: conocimiento de la
contraseña por admin, política bootstrap 12–72 bytes/tres clases, reactivación
con UUID/email concordantes y ACL/protección del último administrador.
Backend, Frontend y Tester tienen gate local satisfecho; Reviewer aprueba y
entrega al Orquestador la actualización documental y cierre formal de Etapa 4.
La configuración remota real, el restore drill, rate limits/CAPTCHA/MFA,
secretos de runtime y el canal de entrega de contraseñas quedan sujetos al
runbook y a autorización separada. El administrador conoce las contraseñas
que asigna: riesgo del contrato aprobado, expresamente documentado.
