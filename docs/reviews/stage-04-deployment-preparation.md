# Preparación operativa de despliegue — Etapa 4

Fecha: 17 de octubre de 2026. Suplemento del cierre local aprobado; producción
continúa bloqueada. Origen: preflight de esta conversación, sin archivo previo.

## Alcance y decisiones del Orquestador

Se completan runbook y ensayo sintético de backup/restore, sin modificar src,
Edge, contratos de negocio, migraciones, rollbacks ni tests previamente aprobados.
Frontend no requiere intervención. Backend entrega receta operativa y harness;
Tester valida el artefacto nuevo. El Reviewer independiente recibe este handoff.
La ausencia del esquema private en el backup del runbook se corrige en la
documentación; no se altera la base para adaptarla a supuestos.

Preparado documentalmente: inventario de backup de tres schemas y configuración
externa, consistencia, cifrado/custodia/retención, restauración verificable,
contención Edge, recuperación del único admin, entrega de credenciales,
checkpoints/abortos y reparaciones versionadas. Los procedimientos operativos
que dependen del proveedor quedan preparados, no ejecutados ni certificados.

## Evidencia afectada del Tester

Comando: `node scripts/stage04-restore-drill.mjs` (Node 24.18.0, Docker 29.8.2,
imagen PostgreSQL `postgres:17-alpine`, fijada al digest
`sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`).
Última ejecución del harness final: exit 0, 7,7 s.
Datos exclusivamente sintéticos, contenedor sin red ni puertos, almacenamiento
tmpfs; nombre propio aleatorio, dos bases descartables dentro del mismo cluster.

Verificaciones PASS:

- Cutover sin administrador aborta; columna legacy permanece por rollback
  transaccional, sin consultar sus valores.
- Un único dump custom contiene auth/public/private; cifrado AES-256-GCM en
  temporal, descifrado íntegro y rechazo de ciphertext alterado.
- Restore atómico con fallo inmediato; igualdad de filas/UUID/FK y constraints,
  RLS/policies, ACL efectivas por tabla y explícitas por columna/schema,
  propietarios de tablas, funciones propias públicas/privadas/Auth, default ACL,
  tipos/nulabilidad de columnas, extensiones y
  valores de secuencias. Los roles globales son compartidos por ambas bases;
  este ensayo NO demuestra restauración de roles entre clusters. Auth sólo
  compara conjuntos de UUID, no contenido completo de users/identities/sesiones,
  hashes ni autenticación de contraseñas. Su esquema es un fixture mínimo.
- Suite existente `04_auth_rls_test.sql` pasa sobre destino restaurado. Se repite
  por la nueva restauración, no por cambios en implementación aprobada.
- Rollback cutover mantiene RLS/FORCE y deniega lecturas a anon/authenticated.
  `has_column_privilege(authenticated,empleados,id,select)=false`. Se corrige la
  sospecha previa, aún no ensayada, de que REVOKE ALL dejaría grants por columna.

El ensayo inicialmente detectó que `public` ya existe en la base plantilla y
que el dump por schemas no reconstituye por sí solo toda la dependencia pgcrypto
ni determinadas ACL de schema/secuencias identity. La receta local prepara el
destino vacío y concilia explícitamente esas ACL del propietario según origen;
posteriormente exige igualdad. No se ocultan diferencias con un gate de sólo
conteos. No se recomienda esa conciliación genérica contra Supabase administrado.

SHA-256 del archivo cifrado efímero de la ejecución exitosa:
`dbe08594fc6ff4ec137e3b82d0df0fac1d917daa4340bf8e943682f66be51470`.
No es backup real conservado: temporal eliminado y clave sólo en memoria. El
harness sólo imprime PASS después de confirmar limpieza Docker y temporal;
un fallo de limpieza aborta con el nombre del único contenedor a inspeccionar.

`node --check scripts/stage04-restore-drill.mjs`: exit 0.
`git diff --check`: exit 0 (advertencia LF/CRLF).
Se conservan lint/build, E2E y unitarios aprobados en stage-04-validation.md;
sin cambios de aplicación no se repiten esas suites. No se ejecutó un servidor
Auth/Edge nuevo ni se probaron MFA/CAPTCHA/429/recovery HTTP en este suplemento.

Docker inicialmente detenido y luego inaccesible desde sandbox: se inició
Docker Desktop y el ensayo autorizado se ejecutó con acceso elevado al motor
local. No se utilizó red del contenedor ni credenciales/proyecto reales.
MCP Supabase no está disponible entre las herramientas de esta sesión; no se
realizaron inspecciones remotas ni se certifica configuración actual.

## Pendientes y decisiones del propietario

1. Aprobar custodios, canal de entrega, acceso de emergencia, retención propuesta
   30 días/manifiesto 180 días y objetivos RPO 0 en corte/RTO 4 h medidos con
   volumen representativo. Backup real completo debe gestionarlo custodio sin
   acceso de este agente a PIN; restauración real requiere permiso separado.
2. Elegir/implementar limitación Edge distribuida no eludible y contención del
   endpoint directo; ensayar concurrencia, 429/Retry-After, caída del contador,
   cero efectos y solicitudes en vuelo. Las cuotas propuestas no están activas.
3. Decidir MFA/AAL2 y CAPTCHA/integración o riesgo residual expresamente aceptado.
   Cambios a código/contratos requieren Reviewer antes de adopción.
4. Ensayar emergencia del único admin en Auth real aislado, revocación de sesiones
   y suplencia del custodio. El ensayo SQL no lo cubre.
5. Inspeccionar configuración remota en lectura cuando exista conector; validar
   drift, datos agregados, grants por columna, default ACL, funciones y policies
   adicionales. No leer PIN ni secretos. Validar candidato en entorno sintético.
6. Reviewer aprobó el suplemento documental/SQL local en
   `stage-04-operational-review.md`, con los gates remotos anteriores abiertos.
   El dictamen no aprueba despliegue ni producción.

## Handoff a Reviewer

Etapa 4, objetivo: preparación operativa local. Archivos: runbook principal,
stage-04-backup-continuity.md, este informe, scripts/stage04-restore-drill.mjs y
supabase/tests/README.md. Supuestos: fixture SQL mínimo, roles compartidos,
origen real no inspeccionado; riesgo principal: confundir ensayo parcial con
aptitud productiva. Validaciones y límites arriba. Próxima acción: revisión
independiente, resolver hallazgos y emitir dictamen suplementario sin reabrir
Etapa 5 ni autorizar remoto.

Recepción del Orquestador: informe sincronizado con la ejecución final y sus
límites; hallazgos de cobertura y limpieza resueltos. Preparación documental y
ensayo SQL local aprobados por Reviewer. El propietario debe resolver las
decisiones y verificaciones pendientes antes de autorizar cualquier despliegue.
