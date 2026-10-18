# Revisión independiente de preparación operativa — Etapa 4

Fecha: 17 de octubre de 2026. Dictamen: **APROBADO el suplemento documental y
el ensayo SQL sintético local**, con alcance limitado. **NO APROBADO el
despliegue ni la apertura de producción**: siguen pendientes los gates
operativos indicados abajo. Se conserva el cierre local previo de Etapa 4.

## Alcance y evidencia

Reviewer independiente del autor del cambio. Se leyeron AGENTS, contexto, PRD,
reglas, stage/workflow 04, contratos Auth/color, dictamen anterior, ambos
runbooks, informe del Tester y harness. Se inspeccionó el diff mediante
`git --git-dir=.git --work-tree=. diff` y el estado local. Los cambios tracked
son documentales; el harness y los dos suplementos son nuevos. No se revisan
como modificados src, Edge, contratos, migraciones ni pruebas aprobadas.

El Tester entrega ejecución final del harness exitosa, exit 0, 7,685 s,
PostgreSQL 17 en Docker con imagen fijada por digest. Reviewer verificó el
código final y `node --check scripts/stage04-restore-drill.mjs` (exit 0); no
repite suites de aplicación ni se atribuye una nueva ejecución Docker propia.
No hubo consultas remotas, PIN reales, usuarios reales, push o despliegues.

## Hallazgos de la revisión

- **Medio, resuelto:** la primera comparación de funciones omitía las RPC
  públicas de trabajo. El harness final incluye funciones public ajenas a
  extensiones, private/auth, propietarios, seguridad, configuración y ACL;
  añade default ACL, tipos y nulabilidad. El Tester reejecutó el artefacto.
- **Bajo, resuelto:** la limpieza inicial ignoraba un fallo del motor Docker.
  La versión final exige limpieza exitosa antes de emitir PASS y borra la
  clave en finally; identifica únicamente su contenedor sintético si falla.
- **Medio, límite explícito:** las filas de negocio/eventos se comparan
  íntegramente en memoria, pero auth.users sólo por UUID. El roundtrip cifrado
  comprueba igualdad binaria del dump, no restauración semántica completa de
  identidades, hashes, tokens, factores, sesiones o configuración de Auth.
  El informe debe conservar esta distinción al resumir resultados.

No quedan hallazgos bloqueantes o altos introducidos por este suplemento en
su alcance local. Las pendientes siguientes son bloqueantes para despliegue,
no controles implementados por escribir su procedimiento.

## Gates pendientes de despliegue

1. **Bloqueante:** respaldo real completo bajo custodia autorizada, compatible
   con el proveedor y restaurado en recinto aislado. El ensayo usa dos bases
   del mismo cluster, comparte roles y concilia dependencias/ACL conocidas;
   no prueba restauración de roles entre clusters ni plataforma Supabase.
   Faltan medir RPO/RTO representativos y aprobar custodia/retención/cifrado.
2. **Bloqueante:** limitación distribuida y no eludible de Edge y método real
   de contención del endpoint directo. No hay contador ni kill switch nuevo.
   Implementar solución revisada y probar concurrencia, 429/Retry-After,
   caída del contador, cero efectos y drenaje antes de autorizar despliegue.
3. **Alto, pendiente:** recuperación del único administrador mediante Auth
   real aislado, entrega y recepción segura, revocación/expiración de tokens,
   suplencia del custodio y autorización individual de emergencia. El SQL
   sintético no demuestra estos flujos HTTP.
4. **Alto, pendiente:** inspección permitida de configuración/drift remotos y
   prueba de configuración candidata Auth/JWT/orígenes/secretos, enumeración,
   recuperación pública, signup y controles de abuso. La ausencia de MCP no
   permite certificar el estado real. Nunca registrar valores sensibles.
5. **Decisión del propietario:** MFA/AAL2 y CAPTCHA requieren integración y
   verificación efectivas, o decisión explícita de riesgo residual cuando
   corresponda. Un ajuste Dashboard aislado no completa esos controles.
   Toda modificación del contrato aprobado vuelve a Reviewer y Tester.

## Controles y límites aceptados

El orden expand → bootstrap/vinculación conservando UUID → conciliación →
checkpoint → cutover → cliente Auth está documentado. Color queda separado.
Mantenimiento contempla escritores directos/privilegiados y no confía en UI.
El rollback conserva RLS, no restaura PIN ni permisos anónimos y requiere
contener Edge; las reparaciones posteriores son versionadas y autorizadas.
El ensayo comprueba RLS/FORCE de las seis tablas y denegación de lectura de
empleados tras rollback; no se presenta como prueba exhaustiva nueva de
todos los consumidores, sesiones o métodos administrativos.

La propuesta de retención y objetivos no se trata como decisión aprobada.
La contraseña inicial no se describe como de un solo uso. El respaldo legacy
queda a cargo del custodio, sin acceso del agente a PIN. La configuración y
la recuperación reales siguen sin certificar; producción permanece bloqueada.

Handoff al Orquestador: sincronizar el informe con la última ejecución y sus
límites, conservar aprobaciones locales previas y presentar al propietario
los gates pendientes. Próxima acción autorizada: preparación local revisada;
cualquier escritura remota, restauración real o despliegue exige autorización
separada. No se inicia Etapa 5.
