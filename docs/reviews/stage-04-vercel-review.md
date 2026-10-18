# Etapa 4 — Revisión independiente de preparación Vercel

18 de octubre de 2026. Reviewer independiente del autor de la configuración.

**APROBADA la preparación local.** No quedan hallazgos bloqueantes/altos nuevos
en este alcance. No es aprobación del despliegue ejecutado ni de producción.

Se revisaron vercel.json, .vercelignore, .env.example, .gitignore,
package.json/lockfile, vite.config, los consumidores VITE, el informe de
preparación, runbook Vercel y checkpoints de contexto/stage/cutover. La
configuración selecciona Vite, npm ci, build y dist, con fallback SPA; no
añade ejecución de migraciones ni backend a Vercel. Las exclusiones CLI no
eliminan dependencias del build frontend inspeccionado.

Node 24.x está sincronizado en package/lock. Tester entregó build exitoso con
Node 24.18.0 y variables sintéticas, validación JSON, comprobación de exclusiones
Git y diff-check. Persiste la advertencia de tamaño de bundle ya registrada,
sin tratarla como regresión de este cambio. Reviewer no repitió build, pruebas
Auth/RLS/MFA ni E2E: sus implementaciones no cambiaron. La recarga /panel y los
flujos reales en infraestructura Vercel siguen pendientes de smoke posterior.

La plantilla contiene sólo URL pública, clave anon vacía y color=false. El
runbook prohíbe secretos privilegiados en Vercel/VITE, limita el backend real
a Production y exige configuración aislada para Preview/Development. El dist
sintético no debe publicarse ni usarse con --prebuilt. Se exige un build real
con variables del entorno verificadas.

Git deploymentEnabled=false conserva la prohibición de publicación automática,
con el límite correctamente explicado: sólo surte efecto donde esa configuración
esté realmente presente; no evita deploy manual. El flujo login/project/link
no ejecuta deploy y no requiere push. Se distingue exclusión CLI de archivos
ya versionados en una futura integración Git.

Se planteó duda sobre project create. Orquestador aportó verificación de la
[documentación oficial CLI project](https://vercel.com/docs/cli/project): create
es válido actualmente y add figura como alias. Cambió el paso a project add
por compatibilidad con versiones anteriores; Reviewer confirmó ese cambio
en el runbook. No queda un defecto de comando abierto. La comprobación web
la realizó Orquestador; Reviewer no ejecutó red ni CLI.

Dominio, proyecto/equipo y variables reales no se dan por existentes. El origen
HTTPS exacto se verifica antes de configurar Auth y ALLOWED_ORIGIN; no se
admiten comodines de preview. Sigue el orden de gates backend, mantenimiento,
respaldo de corte, migraciones Auth y comprobación servidor antes de abrir el
frontend. Color permanece false hasta aceptar Auth y aplicar/verificar su
migración independiente. La reparación de frontend no puede reactivar PIN ni
deshabilitar RLS.

No hubo despliegue, creación/vinculación de proyecto, consultas de secretos o
cambios remotos por esta revisión. La elección de Vercel resuelve el destino,
pero no sustituye recuperación integral Auth/configuración, propiedades y
permisos DATABASE, antiabuso, suspensión verificable de todos los escritores,
RPO/RTO y backup de corte. Esos gates conservan el bloqueo de ejecución remota
indispensable hasta contar con evidencia. Sin push ni Etapa 5.

## Addendum — evidencia adicional de contención

Reviewer revisó la nueva sección de lectura backend y sus checkpoints en
PROJECT_CONTEXT/runbook Vercel. Orquestador entregó consulta MCP read-only de
privilegios del operador postgres, sin ejecutar locks: cobertura SHARE false
en Auth (27 tablas) y Storage (8), true en public (6), realtime (3) y vault (1).
La conclusión queda correctamente limitada: ese candidato de bloqueo integral
no está disponible con el operador actual; no se afirma imposibilidad universal
de freeze ni se propone ampliar permisos en schemas administrados. Aun una
cobertura suficiente de permisos no probaría por sí sola suspensión de todos
los escritores, secuencias, jobs o cambios del plano de control.

La metadata DATABASE adicional no equivale a recuperación ensayada de owner,
ACL/settings; sus valores sensibles no se consultaron. Se conserva ese gate.
Antes de escrituras de corte falta identificar y ensayar una receta soportada
que suspenda los escritores y permita capturar el respaldo. Pausar Vercel o
cerrar la base sin acceso de dump no demuestra ese requisito. RPO 0 sigue
pendiente, sin sustituirlo implícitamente por otro objetivo.

La preparación local Vercel conserva aprobación. Esta evidencia delimita el
bloqueo técnico restante y no levanta gates ni invalida el restore SQL previo.
Reviewer no repitió consultas, pruebas o ensayos ni accedió a secretos.
