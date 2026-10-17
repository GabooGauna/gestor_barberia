# Runbook de despliegue seguro — Etapa 4

Este documento prepara el despliegue; no autoriza operaciones remotas.

## Artefactos y orden

La migración `20261016000000_add_rutinas_color.sql` tiene su propio ensayo,
autorización y activación con `VITE_ENABLE_RUTINAS_COLOR=false`. No es una
precondición del corte Auth y no se incluye en su cadena de aplicación.

1. `20261016010000_auth_profiles_expand.sql`: expansión Auth y comienzo de la
   ventana de mantenimiento; revoca inmediatamente todo acceso de `anon` y
   `authenticated` para que las columnas nuevas no hereden grants legacy.
2. Desplegar `admin-users` con verificación JWT, `ALLOWED_ORIGIN` exacto y
   secretos sólo de runtime; bootstrap del primer admin y vinculación controlada
   de los empleados existentes mediante Admin API y RPC administrativa.
3. `20261016020000_auth_rls_cutover.sql`: preflight, RLS/grants, retención y
   retiro de PIN en una transacción.
4. Desplegar el cliente Auth. Solo después de verificar color en cada ambiente
   puede habilitarse su flag.

No ejecutar todas las migraciones pendientes ciegamente: entre las fases 1 y
3 existe un paso obligatorio de provisión. Aplicar cada archivo explícitamente
en staging y luego en el ambiente autorizado.

## Preparación y backup

- Activar ventana de mantenimiento y evitar clientes viejos durante el corte.
- Crear backup consistente de `auth` y `public`, cifrado y con acceso limitado.
- Restaurarlo en una base descartable y verificar conteos y FK; un backup sin
  restore drill no satisface el gate.
- Verificar, sin mostrar valores: roles inválidos, FK/fechas nulas, duplicados
  `(empleado_id,tarea_id,fecha)`, perfiles activos sin vínculo y cantidad de
  admins activos.
- Configurar signup global OFF manteniendo habilitado el proveedor email para
  login, redirect allowlist, password policy, rate limits, CAPTCHA si
  corresponde y SMTP solo si se adopta otro flujo futuro.

## Bootstrap y provisión

1. Aplicar solo la migración expand. Desde ese instante el cliente anterior
   queda deliberadamente sin acceso hasta completar el cutover.
2. Crear la primera cuenta Auth administrativa mediante Admin API desde un
   entorno seguro. Usar el email técnico calculado por el contrato, contraseña
   inicial de 12–72 bytes, con al menos tres clases entre minúsculas,
   mayúsculas, dígitos y símbolos, y `email_confirm=true`.
3. En una sesión SQL administrativa autorizada ejecutar una vez:

```sql
select private.bootstrap_first_admin(
  '<empleados.id>', '<auth.users.id>', '<usuario-canonico>'
);
```

4. Para cada empleado existente que se conservará activo, mantener su
   `empleados.id`. Crear su identidad Auth mediante Admin API en el mismo
   entorno seguro, con la política de contraseña del paso 2, email técnico
   contractual y `email_confirm=true`. Vincular desde la sesión administrativa
   autorizada, usando el UUID Auth del primer administrador como actor:

```sql
select public.admin_link_auth_account(
  '<auth.users.id-del-admin>', '<empleados.id-existente>',
  '<auth.users.id-creado>', '<usuario-canonico>'
);
```

   La RPC sólo permite `service_role` (o propietario), revalida que el actor
   sea admin activo y rechaza una identidad discordante o un perfil ya vinculado
   a otro UUID. Si Auth se creó pero falla el vínculo, no continuar al cutover:
   verificar los UUID y compensar mediante Admin API únicamente si la identidad
   está sin vínculo, o corregir la causa y reintentar el vínculo autorizado.
   No crear otro perfil. Registrar el seguimiento operativo sin contraseñas.

   `admin-users` con acción `create` se reserva para integrantes nuevos: genera
   otro `empleados.id` y no migra empleados existentes. Entregar contraseñas
   iniciales por un canal separado y no
   conservarlas; no usar ni consultar el PIN anterior. Esta versión no tiene
   credenciales de un solo uso ni cambio obligatorio en el primer login: los
   reemplazos se realizan exclusivamente mediante reset administrativo.
5. Desactivar explícitamente perfiles que no deban migrarse. Todo perfil que
   permanezca activo debe tener `auth_user_id` y `usuario`.
   Un perfil legacy inactivo sin cuenta se conserva históricamente, pero no
   puede reactivarse desde la UI: ésta requiere una cuenta previamente
   vinculada. Si se prevé reactivarlo, provisionar y vincular durante esta
   ventana mientras está activo, y luego desactivarlo mediante la RPC
   administrativa antes del cutover. Los perfiles que se dejen sin vínculo
   requerirán después un procedimiento privilegiado revisado y autorizado de
   provisión/vinculación; no borrar/recrear el perfil ni habilitar su acceso
   antes de completar la identidad verificada.
6. Comparar antes/después los conteos y UUID de empleados, asignaciones,
   auditorías, rutinas, tareas y urgencias, además de sus FK. La vinculación no
   debe alterar esos identificadores ni crear empleados duplicados. Entregar
   evidencia de la conciliación al operador del cutover sin datos sensibles.

La función bootstrap falla si ya existe un admin activo vinculado, si el perfil
objetivo no era admin activo o si el email Auth no coincide con el username.
Su ACL excluye a `PUBLIC`, `anon` y `authenticated`; sólo `service_role` (y el
operador propietario de la base) puede ejecutarla. No exponer esta función por
un endpoint de bootstrap público. Los UUID se obtienen de los registros
autorizados; nunca se resuelve el vínculo por nombre visible.

## Ensayo aislado

- Aplicar migraciones a una restauración sintética/local.
- Ejecutar `psql -v ON_ERROR_STOP=1 -f supabase/tests/04_auth_rls_test.sql`.
- Probar login correcto/incorrecto, refresh, logout, token vencido/revocado,
  perfil inactivo, IDs ajenos, rol/storage/payload manipulados y errores 429.
- Confirmar con catálogos que RLS está habilitado/forzado, que `anon` no tiene
  privilegios y que no existe `empleados.pin`.
- Inspeccionar el bundle: nunca debe contener service role ni secretos.
- Simular fallos parciales de alta/reset/estado y reconciliar todo evento
  `started`, `*_failed` o `*_compensation_failed` antes de continuar.

## Cutover

1. Mantener el frontend en mantenimiento.
2. Repetir backup y preflight.
3. Aplicar la migración cutover. Cualquier precondición inválida aborta toda la
   transacción; no corregir filas automáticamente.
4. Verificar que la versión predesplegada de `admin-users` conserva JWT
   verification, origen exacto y secretos del runtime.
5. Desplegar frontend Auth y retirar caches/service workers del cliente PIN.
6. Ejecutar smoke tests por rol y pruebas negativas directas.
7. Mantener `VITE_ENABLE_RUTINAS_COLOR=false` hasta verificar esa capacidad de
   forma independiente.

## Recuperación

El rollback de cutover es fail-closed: revoca grants, elimina policies/RPC de
trabajo y deja RLS habilitado sin acceso. No restaura PIN, cascadas, CRUD anon
ni el frontend anterior. Ante una falla, mantener mantenimiento y preferir
roll-forward.

El rollback de expand solo es válido antes del cutover. No elimina cuentas de
`auth.users`; deben reconciliarse manualmente. Un backup se restaura primero en
un ambiente aislado, nunca encima de producción sin un plan aprobado.

## Reconciliación de operaciones administrativas

- `account_create_started` sin `account_created`: el UUID del evento identifica
  el perfil solicitado, no la identidad Auth. La auditoría actual no conserva
  el UUID Auth de una creación fallida. Desde el entorno administrativo seguro,
  recuperar el username de la solicitud operativa, calcular su email técnico y
  localizar la identidad con Admin API paginada. Verificar su UUID y la ausencia
  de vínculo en `empleados` antes de eliminarla con Admin API o reintentar el
  alta. No imprimir listados, emails ni credenciales. Si falta el username o hay
  ambigüedad, mantener mantenimiento y escalar la reconciliación; nunca vincular
  por nombre visible ni inferir que ambos UUID son iguales.
- `account_create_compensation_failed`: tratar como identidad huérfana y
  mantenerla sin perfil; RLS no le concede acceso.
- `password_reset_started` sin `completed`/`failed`: asumir que la contraseña
  pudo cambiar. El administrador debe establecer una nueva contraseña y cerrar
  el evento con otro reset, sin intentar recuperar la anterior.
- `account_deactivation_auth_failed`: el perfil ya está inactivo y RLS bloquea
  datos. Reintentar el bloqueo Auth antes de considerar reconciliado.
- `account_reactivation_failed`: mantener el perfil inactivo, volver a bloquear
  Auth si fuese necesario y reintentar la reactivación completa.

Toda reconciliación se realiza desde un entorno administrativo autorizado y se
registra sin contraseñas, PIN, tokens ni email técnico.

## Gate

No declarar producción hasta ejecutar sobre la configuración candidata real:
lint, build, E2E, prueba SQL, verificación de Auth/RLS/grants, revisión de
secretos, rate limits y Reviewer independiente. La aplicación remota requiere
otra autorización explícita.
