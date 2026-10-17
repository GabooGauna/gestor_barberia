# Contexto técnico — Gestor de Barbería

## Estado del relevamiento

- Fecha de corte: 15 de octubre de 2026.
- Repositorio: SPA construida con React y Vite.
- Backend: Supabase, proyecto `ucmwykzrepmjucssjnum`.
- Inspección remota: MCP `supabase_barberia` en modo solo lectura.
- Alcance: auditoría y documentación; no se modificó lógica ni esquema remoto.

## Estado local de Etapa 4

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
