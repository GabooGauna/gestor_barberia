# Etapa 4 — Reintento MCP y checkpoint de respaldo

Fecha: 18 de octubre de 2026. Estado: **lecturas MCP recuperadas; despliegue
detenido antes de escrituras por gates de respaldo/configuración no verificables**.
Actualiza el estado del intento anterior sin borrar su evidencia HTTP 403.
La autorización condicional del propietario sigue vigente y no se vuelve a pedir.

## Conexión y permisos realmente comprobados

El inventario ahora expone `mcp__supabase_barberia`. Se ejecutaron correctamente
`list_tables(public,private)`, `list_migrations`, `list_edge_functions` y consultas
`execute_sql` con `BEGIN TRANSACTION READ ONLY`, timeout de 15 s y `ROLLBACK`.
Las lecturas de catálogos/agregados funcionaron; no se ensayaron permisos de
escritura. SQL informa PostgreSQL 17.6, base `postgres`, rol `postgres` y
`transaction_read_only=on`; el nombre del rol no prueba autorización de DDL.

La configuración MCP local contiene `project_ref=ucmwykzrepmjucssjnum`, el mismo
destino esperado por el runbook. Sólo se extrajo ese identificador en memoria;
no se imprimió el archivo, cabeceras ni secretos. La variable SQL opcional
`app.settings.project_ref` devuelve null: su ausencia no es un fallo de acceso
ni una certificación adicional de identidad de cuenta. El ref configurado es la
evidencia de enrutamiento disponible, no un GET exitoso de metadatos de cuenta.

El MCP está acotado por proyecto. Herramientas de cuenta no ofrecidas en ese
modo no se interpretan como denegación del proyecto; no se llamó `list_projects`
ni otra herramienta de cuenta deshabilitada. La conectividad MCP NO permanece
bloqueada por los 403 históricos de otra ruta de autenticación.

## Estado remoto observado, sin consultar PIN ni filas Auth

- Seis tablas de negocio legacy; RLS y FORCE RLS desactivados en todas.
  `anon` tiene privilegios de tabla y columna; cero policies públicas. Permanece
  la exposición crítica del baseline, sin afirmar que el cutover esté desplegado.
- `list_migrations`: lista vacía. Además, no existe
  `supabase_migrations.schema_migrations`. No se concluye que jamás hubo DDL
  manual; sólo que no hay historia registrada disponible.
- `list_edge_functions`: lista vacía; `admin-users` no está desplegada según
  ese inventario.
- No existen `private`, `empleados.auth_user_id` ni
  `private.security_operations`; la columna legacy `pin` existe, sin leer valores.
- `rutinas.color` NO existe. No se aplicó ni se activó su migración/capacidad.

Conteos `COUNT(*)` de una consulta de lectura, sin mantenimiento ni snapshot de
respaldo. Son una observación del momento, no conciliación definitiva de corte:

| Recurso | Conteo |
|---|---:|
| empleados | 2 |
| administradores legacy por rol | 1 |
| rutinas | 5 |
| tareas_rutina | 53 |
| empleado_rutinas | 3 |
| auditoria_diaria | 45 |
| tareas_urgentes | 4 |

El campo `rows` de `list_tables` no coincidió con estos conteos. No se toma como
conteo exacto ni se infiere pérdida de datos. La captura válida para el corte
exige congelación, snapshot y conciliación de UUID/FK según el runbook.

Controles agregados consultados: roles inválidos 0; grupos de auditoría
duplicados 0; auditorías con empleado/tarea ausentes o fecha nula 0; grupos de
asignación duplicados 0; referencias inválidas de asignaciones y tareas 0;
urgencias con empleado ausente o fecha nula 0; constraints no validados 0.
Las seis FK inspeccionadas siguen validadas con `ON DELETE CASCADE` legacy.
No equivale a aprobar todos los preflights de cutover ni a demostrar conservación
histórica después de un despliegue que no ocurrió.

## Primer checkpoint pendiente y causa de parada

Después de recuperar las lecturas se continuó el checklist hasta respaldo y
configuración. El MCP ofrecido no tiene herramientas de backups, restore,
configuración Auth o gestión de secretos. Eso es un límite de capacidades
expuestas, no prueba de falta de permisos del proyecto ni de inexistencia de
backups en el proveedor.

Se reintentaron únicamente dos GET de Management API usando el token existente
del entorno, sin imprimirlo, fuera del sandbox de red:

| Endpoint de `https://api.supabase.com/v1/` | Resultado |
|---|---|
| `projects/ucmwykzrepmjucssjnum/database/backups` | HTTP 403 |
| `projects/ucmwykzrepmjucssjnum/config/auth` | HTTP 403 |

Se desconoce la causa interna de esos 403. No se atribuyen a `project_ref`, al
MCP ni a SQL. La causa concreta de la parada operativa es que **no se puede
obtener/verificar el respaldo completo ni la configuración Auth por las rutas
disponibles**, y no hay evidencia de restore integral compatible o congelación
de todos los escritores que permita dar esos gates por satisfechos.

Para reanudar, habilitar un canal seguro de gestión del proveedor o intervención
del custodio que permita comprobar backup consistente de `auth`, `public`,
`private` y complementos externos, cifrado/integridad/retención/clave recuperable
y restauración aislada completa del candidato, sin acceder a PIN. Comprobar
ausencias del baseline en el manifiesto: `private` aún no existe y se incluirá
en los checkpoints posteriores a expand; no se crea para aparentar un backup.
Comprobar
configuración Auth/JWT/MFA/antiabuso y mecanismo real de contención/drenaje,
incluidos Auth directo, jobs y operadores, antes de cualquier escritura de corte.
No se solicita enviar tokens, contraseñas ni claves por el chat.

Continúan los demás requisitos documentados: primer admin y recuperación bajo
custodia, canal privado y TOTP del titular, vínculo sobre UUID existentes,
destino/origen de frontend, ventana/checkpoints y objetivos RPO/RTO verificables.
La aceptación del cambio propio de contraseña permanece; no se reabre ese gate.

## Ejecución y handoff

No se aplicaron migraciones, DDL, cambios de cuentas/configuración/secretos,
mantenimiento remoto, despliegues Edge/frontend, backups ni restauraciones.
No se ejecutó `supabase db push`. No se repitió ninguna prueba local aprobada.
No se consultaron valores PIN/contraseñas/tokens, hashes Auth ni datos personales.
No se usaron funciones SQL administrativas que escriben.

Los únicos cambios locales de esta reanudación son documentación. Se preservan
runtime, migraciones y trabajo anterior. Las lecturas del baseline no habilitan
producción ni cierran Etapa 4 remota. `rutinas.color`, push y Etapa 5 siguen fuera.
Reviewer independiente aprobó el informe y la parada en
`stage-04-mcp-retry-review.md`, sin certificar prerrequisitos ni producción.

Al superar estos gates se continúa exclusivamente con expand
`20261016010000_auth_profiles_expand.sql` → bootstrap/vínculos de empleados
existentes y conciliación → checkpoint backup → cutover
`20261016020000_auth_rls_cutover.sql` → suplemento
`20261017000000_security_operations.sql` → configuración/Edge/frontend
compatibles/MFA → validaciones y apertura controlada según runbooks. La Edge
nueva permanece sin uso hasta tener sus RPC; ninguna lista de pendientes se
ejecuta indiscriminadamente. Color se trata después, en otra operación.
