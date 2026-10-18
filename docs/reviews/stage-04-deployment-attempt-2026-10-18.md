# Etapa 4 — Autorización condicional y parada de despliegue

Reintento posterior en el mismo chat: MCP recuperado para esquema, migraciones,
Edge y SQL de lectura; el checkpoint de backup/configuración sigue bloqueado.
Estado vigente en `stage-04-mcp-retry-2026-10-18.md`. El informe siguiente
conserva la evidencia del primer intento, cuando no estaba expuesto el MCP.

Fecha: 18 de octubre de 2026. Estado: **DETENIDO ANTES DE CUALQUIER ESCRITURA
REMOTA**. Producción no habilitada; cierre local histórico conservado.

## Decisión y alcance

El propietario autorizó desplegar Auth/RLS/seguridad, Edge y frontend compatibles
si los prerrequisitos críticos estaban satisfechos. Aceptó explícitamente
Supabase Auth nativo con cambio propio por API directa, administración de altas/
reset y sin opción visible para empleados. Registro en
`../decisions/stage-04-native-auth-risk-acceptance.md`. Se sustituye el requisito
de exclusividad; no se implementa otro proveedor ni control adicional por esa
causa. No autoriza color, push o Etapa 5, ni relajar los demás gates.

## Inspección realizada y límites

Se leyeron AGENTS, contexto, PRD, reglas, stage/workflow, runbooks, contratos,
ADR y último dictamen. Git status mostró cambios locales previos, preservados,
incluido `.codex/config.toml`, que no se modificó ni se imprimió.

- Inventario de herramientas: sin MCP Supabase disponible.
- `.env.local` contiene sólo nombres `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY`. Comparación en memoria de la URL con
  `https://ucmwykzrepmjucssjnum.supabase.co`: coincide. No se imprimieron claves.
  Esto identifica el destino local esperado, no certifica el proyecto remoto.
- Existe `SUPABASE_ACCESS_TOKEN` en el entorno; no se imprimió ni persistió.
  No hay conexión DB en `DATABASE_URL`/`SUPABASE_DB_URL`, CLI Supabase/psql/
  pg_dump en PATH ni configuración local Vercel/Netlify de destino encontrada.
  No se presume que no existan otros accesos bajo custodia del propietario.
- GET autenticados a Management API, sin cuerpo ni consultas SQL: conexión
  inicial restringida por sandbox sin respuesta HTTP; reintento permitido fuera
  del sandbox obtuvo HTTP 403 en los cuatro recursos siguientes:

| Recurso relativo a `https://api.supabase.com/v1/` | Resultado |
|---|---|
| `projects/ucmwykzrepmjucssjnum` | HTTP 403 |
| `projects/ucmwykzrepmjucssjnum/database/backups` | HTTP 403 |
| `projects/ucmwykzrepmjucssjnum/config/auth` | HTTP 403 |
| `projects/ucmwykzrepmjucssjnum/functions` | HTTP 403 |

No se atribuye el 403 a una causa específica no comprobada. Debe corregirse el
acceso de gestión/red/permisos de proyecto y repetir exclusivamente estos checks
de lectura antes de continuar. No se intentó sortear la denegación con claves
de frontend ni leer filas Auth/PIN. No se descargó ningún backup.

## Checklist indispensable antes de escribir

| Gate | Resultado actual / resolución necesaria |
|---|---|
| Proyecto y estado actuales | Ref esperado en configuración local; identidad remota, actividad, versión e historial de migraciones NO verificables por 403. Restablecer acceso autorizado y verificar destino antes de SQL. |
| Esquema, RLS, grants, datos y drift | Pendiente. Inspección de catálogos/agregados read-only preparada; no aplicada. Conciliar con candidato y registrar discrepancias antes de corregir nada. |
| Backup completo y verificable | NO realizado. Custodio y método proveedor deben cubrir `auth`, `public`, `private`, dependencias, políticas/ACL, configuración y claves por referencias seguras; cifrado, integridad, retención y recuperación según runbook. No consultar PIN. |
| Restore integral y recuperación viable | Ensayo SQL y Auth sintético anteriores conservados; no equivalen a restore integral del proveedor. Falta evidencia compatible con candidato completo, esquema suplementario, identidad/factores, claves/configuración y tiempos reales. |
| Suspensión de escrituras / mantenimiento | NO activados remotamente. Preparar mecanismo real para todos los escritores, incluidos Auth, jobs y operadores; medir drenaje. El suplemento aún no verificado en destino no puede usarse como prueba de contención previa a expand. |
| Primer admin / emergencia | No se crearon cuentas. Falta confirmar custodio/suplente, titular/perfil UUID, username, acceso privilegiado, disponibilidad de credencial por bóveda/canal privado y TOTP del titular. No enviar contraseñas o TOTP al chat. |
| Vinculación e históricos | Procedimiento preparado, sin ejecutar. Usar Admin API + bootstrap/vínculo sobre `empleados.id` existente; nunca `create` Edge para migrar perfiles. Comparar UUID/FK/conteos de las seis tablas sin exponer filas. |
| Auth/Edge/antiabuso | Pendiente configuración real de signup/recovery, JWT/TTL/skew, TOTP/AAL2, origen, secretos, gateway JWT, cuotas y límites efectivos de login; CAPTCHA requiere decisión/integración si se adopta. Aceptar self-update no exceptúa estos controles. |
| Frontend / entrega | Falta confirmar destino de hosting, acceso de despliegue y origen HTTPS exacto. Canal privado de credenciales y operadores no identificados en evidencia. Color OFF. |
| RPO/RTO | RPO 0 exige congelación integral verificable. RTO objetivo 4 h sigue sin medición integral o excepción específica; no se convierte en garantía por la autorización. |

La autorización general de despliegue está recibida. No hace falta solicitarla
otra vez; se necesita completar acceso/evidencia y decisiones operativas que
faltan. No se acepta implícitamente ninguna excepción a estos gates.

## Secuencia pendiente, únicamente después del gate

1. Identificar proyecto/configuración actual, fijar artefactos y hashes, ventana,
   custodios, mecanismo de contención y acceso seguro. Completar ensayo integral
   y revisión del candidato; no repetir suites intactas sin causa.
2. Contener TODOS los escritores y verificar quiescencia; capturar backup
   completo consistente pre-expand, cifrado y recuperable. Confirmar restore y
   manifiesto. No descargar PIN ni poner secretos en archivos versionados.
3. Aplicar exclusivamente `20261016010000_auth_profiles_expand.sql`.
4. Provisión Admin API, `private.bootstrap_first_admin` y
   `public.admin_link_auth_account` para perfiles existentes; conciliar UUID/FK
   e históricos. Edge nueva sin uso hasta disponer de sus RPC operativas.
5. Capturar checkpoint/backup pre-cutover coherente; aplicar exclusivamente
   `20261016020000_auth_rls_cutover.sql`. El COMMIT elimina PIN y cambia retención;
   abortar ante una precondición inválida, sin arreglos automáticos.
6. Aplicar exclusivamente `20261017000000_security_operations.sql` después de
   los vínculos y cutover; mantenimiento cerrado. Configurar Auth y desplegar
   Edge compatible con JWT y secretos sólo runtime; verificar configuración y
   mantener contención de escritores ajenos durante la transición.
7. Desplegar frontend compatible en el destino confirmado, con color OFF.
   Titular enrola/desafía TOTP; verificar AAL2, acceso por rol, denegaciones
   directas, integridad y recuperación. Abrir negocio sólo tras checkpoint
   aprobado y verificar funcionamiento real; cerrar de nuevo ante fallo crítico.

Se excluye `20261016000000_add_rutinas_color.sql`. Nunca ejecutar `db push`
de todas las pendientes. Rollback fail-closed y reparación versionada según
runbooks; no restaurar PIN/anon ni un snapshot encima de producción de forma
improvisada.

## Ejecución, validación y handoff

Migraciones aplicadas: **ninguna**. Cuentas creadas/vinculadas: **ninguna**.
Mantenimiento, configuración, secretos, Edge/frontend remotos: **sin cambios**.
Backup real y restauración integral: **no ejecutados**. Login/roles/RLS/gestión/
MFA/históricos/funcionamiento en producción: **no validados**.

Cambios de este turno sólo documentales; inspección estática de `src` no
encontró llamadas `updateUser`, `resetPasswordForEmail` ni una UI de cambio
propio. No se repitieron pruebas aprobadas, lint/build o E2E al no cambiar el
runtime. Diff-check documental: exit 0. Reviewer independiente aprobó la
sustitución del contrato y la parada antes de escrituras en
`stage-04-deployment-authorization-review.md`; no certifica preparación remota ni
producción habilitada. Sus dictámenes históricos se conservan. Orquestador no
declara cierre remoto ni producción lista.
