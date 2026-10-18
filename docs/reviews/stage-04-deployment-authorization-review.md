# Revisión independiente de autorización y parada — Etapa 4

Fecha: 18 de octubre de 2026. Dictamen: **APROBADOS el cambio de contrato por
decisión explícita del propietario y la parada antes de escrituras**.
**NO se certifica preparación del destino ni producción habilitada.** Existe
autorización condicional de despliegue; sus prerrequisitos todavía no se pueden
comprobar. No falta otra autorización genérica para el mismo alcance.

## Alcance y método

Reviewer independiente del Orquestador autor de este cambio documental.
Se revisaron `../decisions/stage-04-native-auth-risk-acceptance.md`,
`stage-04-deployment-attempt-2026-10-18.md`, contrato Auth, contexto, stage,
los tres runbooks y las notas de sustitución en los ADR anteriores.
Se conservaron fuentes/reglas y dictámenes históricos; no se reescriben sus
pruebas o conclusiones bajo el requisito que estaba vigente entonces.

La revisión es documental. Orquestador entregó diff-check exit 0 e inspección
estática de `src` sin cambio propio de contraseña visible o llamadas nuevas a
`updateUser`/`resetPasswordForEmail`. No cambió runtime en este turno. Reviewer
no repitió pruebas, lint/build, E2E, SQL, las 40 comprobaciones operativas ni las
sondas de 10 y 13 casos; tampoco realizó inspecciones remotas o escrituras.

## Requisito sustituido y riesgo aceptado

La decisión conserva Supabase Auth, altas/reset por administrador y ausencia
de opción visible de cambio para empleados. Acepta expresamente que un empleado
autenticado cambie su contraseña por la API directa. El bloqueo anterior de
exclusividad se retira **por sustitución del criterio**, no por haber implementado
una prohibición de servidor ni corregido el comportamiento observado.

El ADR registra consecuencias concretas: la credencial puede dejar de ser la
asignada por el administrador y ese cambio no pasa por la auditoría de negocio
de Edge. Ello no concede roles, no cambia la identidad de dominio y no exceptúa
RLS, estado activo, MFA/AAL2 administrativo, cuotas, recuperación o integridad.
No corresponde introducir IdP, guard sobre Auth ni otra arquitectura para
resolver un requisito que el propietario ya sustituyó.

Los documentos vigentes distinguen correctamente esta aceptación de las
evidencias históricas de incumplimiento. Esas sondas siguen siendo válidas para
describir el riesgo aceptado, sin necesitar repetición.

## Evidencia de parada y límites

Orquestador informa MCP Supabase ausente y cuatro GET autenticados a Management
API con HTTP 403: proyecto, backups, configuración Auth y funciones. Reviewer
revisa esa evidencia entregada; no se atribuye una nueva ejecución. No se conoce
la causa de los 403. La coincidencia del ref en configuración local no demuestra
identidad, estado o acceso efectivo al proyecto remoto.

El informe delimita además la ausencia de conexión DB/herramientas y destino
de hosting identificados en este entorno, sin afirmar que no existan accesos
bajo otra custodia. No se muestran claves, tokens, credenciales ni PIN. No se
obtuvo backup real ni se certificaron esquema, grants, RLS, Auth o configuración
por disponer de una clave pública del frontend.

Ante esas condiciones es correcto parar antes de mantenimiento remoto,
provisión, migraciones, configuración o despliegues. El informe no confunde
autorización con acceso ni con evidencia. No declara smoke tests de producción,
restore integral o escrituras que no se ejecutaron.

## Hallazgo resuelto y gates restantes

**Medio, resuelto:** el checklist activo aún solicitaba autorización genérica
posterior pese a la decisión recibida. Ahora marca por separado la autorización
condicional recibida y la evidencia pendiente. Sólo recursos/proyectos fuera
del alcance requieren una decisión concreta adicional; no se pide reiterar el
permiso general. No quedan hallazgos bloqueantes/altos nuevos en este suplemento.

Persisten bloqueantes operativos antes de escribir: acceso autorizado y destino
verificables; drift/esquema/datos inspeccionados en lectura; respaldo completo
bajo custodia y restauración compatible con proveedor/candidato; contención
de todos los escritores y drenaje; primer admin/custodio/suplente y canal privado;
vínculos UUID/FK; configuración Auth/JWT/AAL2/Edge/secretos/orígenes y antiabuso;
hosting, ventana, checkpoints, recuperación y objetivos RPO/RTO verificables.
La aceptación del cambio propio no exonera ninguno.

Handoff al Orquestador: conservar parada documentada, restablecer acceso de
gestión autorizado sin compartir secretos en el chat y completar exclusivamente
las inspecciones/evidencias pendientes. Continuar el alcance ya autorizado sólo
cuando sus condiciones estén satisfechas; si hay discrepancia, aplicar el flujo
de decisión/reparación revisado. No declarar producción lista por este dictamen.
No hay permiso para push, `rutinas.color` o Etapa 5; siguen fuera del alcance.
