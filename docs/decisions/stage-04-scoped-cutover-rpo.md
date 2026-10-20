# Etapa 4 — RPO del corte acotado a negocio y Auth

18 de octubre de 2026. Decisión explícita del propietario en este chat:
«Preparar y ensayar RPO 0 para negocio y Auth; aceptar el alcance limitado
sobre metadata interna».

Se adopta la alternativa B de `../runbooks/stage-04-cutover-maintenance.md` para
su implementación y ensayo. Sustituye el requisito literal de suspender todo
escritor interno del proveedor por este contrato:

- Congelar datos de negocio y estado runtime Auth mediante un procedimiento
  verificable, con drenaje, sesión de bloqueo supervisada, respaldo definitivo
  y transición sin ventana hacia mantenimiento fail-closed.
- Inventariar dependencias, secuencias, DDL y otros escritores. No deducir que
  un lock de tabla bloquea por sí solo todas las operaciones sobre secuencias,
  crea objetos nuevos o contiene al propietario de la plataforma.
- La metadata administrada y el plano de control del proveedor no quedan
  congelados por esos locks. Se comparan antes/después de la captura y antes
  de migrar; ante diferencias, pérdida de sesión, timeout o writer no contenido,
  abortar. Hashes iguales no prueban ausencia de cambios intermedios/revertidos.
- No se promete recuperación física de Supabase ni RPO 0 de su estado interno.

La autorización es para preparar y ensayar esta alternativa. La autorización
condicional previa de despliegue se conserva, pero su ejecución exige pruebas
afectadas, revisión independiente y todos los demás gates: respaldo de corte,
recuperación viable, configuración/antiabuso, primer administrador, MFA, RLS,
integridad de UUID/históricos y aceptación real. No equivale a aprobar un
procedimiento todavía no implementado.

No se modifica la aceptación previa del cambio propio de contraseña por API
nativa, ni el alcance separado de `rutinas.color` después de validar Auth.
No autoriza push, Etapa 5, reparaciones destructivas ni cambios de proveedor.

## Exclusividad confirmada para la ventana futura

El propietario respondió «Sí; puedo asegurar esa exclusividad durante el corte»
a la consulta sobre ausencia de otros cambios en Supabase y detención de scripts,
integraciones y procesos con credenciales privilegiadas. Esta declaración cubre
SQL/DDL/nextval/setval que SHARE no bloquea; no se interpreta como un lock técnico
ni como suspensión actual ya ejecutada. Al activar la ventana se debe respetar
esa exclusividad, registrar las sesiones esperadas y abortar ante un consumidor
privilegiado desconocido. No hace falta repetir la pregunta genérica.

## Addendum vinculante — 19 de octubre de 2026

El propietario acepta ejecutar un **corte controlado con riesgo residual**, sin
contactar al proveedor ni exigir garantía absoluta de drenaje de los procesos
internos Auth. Retira la afirmación/requisito de RPO 0 absoluto para este corte;
no se declara satisfecha retrospectivamente la garantía anterior.

Se conservan cierre y comprobación de admisiones nativas, exclusividad del
operador ya confirmada, inspección de actividad observable de usuarios/procesos
externos, locks supervisados de negocio/Auth, inventario Auth vacío previo al
bootstrap, secuencias/metadata/configuración sin discrepancias, respaldo
definitivo cifrado con snapshot exportado, restauración aislada e integridad
antes de continuar expand. Actividad externa no conciliada, modificaciones
inesperadas, pérdida de holder o evidencia/cleanup inciertos siguen abortando.

Riesgo aceptado: los logs y las observaciones SQL no excluyen todos los handlers
Auth internos previamente admitidos ni escritores internos no observados.
Podrían intentar escribir después de un checkpoint o al liberar locks. El
control detecta cambios observables y detiene la continuación; no garantiza
evitar toda escritura tardía ni recuperar físicamente todo Supabase.

La atestación operativa pasa a `authAdmissionControlsVerified`, acompañada de
`controlledCutoverResidualRiskAccepted`; no significa fin de goroutines.
Registrar `ControlledCutoverResidualRiskAccepted=true` y `RpoZeroVerified=false`.
El bloqueo histórico de soporte/contador inflight exhaustivo queda retirado
por esta decisión. Continúan la autorización previa de despliegue y su orden:
Auth/RLS/Edge y aceptación real primero; `rutinas.color` después, independiente.
No autoriza pérdida de información conocida, operaciones destructivas, push
automático, otra arquitectura o Etapa 5.
