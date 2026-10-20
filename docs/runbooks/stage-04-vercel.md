# Etapa 4 — Frontend en Vercel, backend en Supabase

Checkpoint vigente del 20 de octubre: integración GitHub–Vercel existente usada,
sin proyectos duplicados. Publicaciones `c03511e` Auth y `cc8a40d` colores,
ambas status success; Production true verificado en artefacto
`/assets/index-BPXc_bpY.js`, origen Supabase correcto. `/` y `/panel` 200.
Auth/RLS/MFA/Edge y color aceptados por Reviewer, servicio abierto después de
los controles reales y de preservar los colores confirmados por el propietario.
`git.deploymentEnabled=true`; no se necesita CLI ni crear/linkear otro proyecto.
La cronología y secuencia siguientes no autorizan repetir pasos completados.

Decisión del propietario: 18 de octubre de 2026. Vercel es el destino elegido.
Actualización: propietario confirmó las tres variables y dominio
`https://gestor-barberia-five.vercel.app`; GET público devuelve 200/HTML.
No equivale a inspección de valores/alcances ni a validar la versión Auth.
Revisión exacta del artefacto y publicación por GitHub quedan pendientes.
No cambia los gates de recuperación, configuración y mantenimiento del
[cutover Auth](stage-04-auth-cutover.md). El respaldo preparatorio y su restore
aprobados se conservan, sin repetirlos.

## Configuración preparada

`vercel.json`: preset Vite, instalación `npm ci`, build `npm run build`, salida
`dist`, fallback SPA a `index.html` para recargas de `/panel`. Node `24.x` en
package.json y lockfile. Sin backend, credenciales privilegiadas o migraciones
en el proceso de build. Auth, PostgreSQL y `admin-users` continúan en Supabase.

El commit de publicación habilita Git deployments mediante
`git.deploymentEnabled=true` para la integración existente. El backend conserva
el mantenimiento hasta verificar el frontend publicado y los permisos reales.

`.vercelignore` excluye configuración local, env, credenciales, reportes,
scripts operativos y código Supabase de cargas por CLI. `.gitignore` protege
`.vercel/` y archivos env salvo `.env.example`. Esa plantilla no contiene claves.
En integración Git, `.vercelignore` no sustituye `.gitignore` ni elimina archivos
ya versionados. Revisar el artefacto/commit exacto antes de publicarlo.

## Variables

Crear en Vercel → Project Settings → Environment Variables, alcance **Production**:

| Variable | Valor inicial / procedencia |
|---|---|
| `VITE_SUPABASE_URL` | `https://ucmwykzrepmjucssjnum.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Clave pública `anon` del mismo proyecto, desde Supabase Dashboard → Settings → API Keys; no copiar aquí |
| `VITE_ENABLE_RUTINAS_COLOR` | `false` |

No poner credencial PostgreSQL, clave de respaldo, service role, `sb_secret_*`,
PAT o secretos JWT/Edge en Vercel ni en `VITE_*`. El frontend publica sus
variables durante build. No exportar `.env.local` completo ni usar integración
automática que añada secretos innecesarios. Preview/Development requieren un
Supabase aislado: no heredar variables de producción ni abrir previews contra
datos reales. No habilitar previews de ramas ajenas contra el backend real.

Cambios de variables necesitan un build/despliegue nuevo. Mantener colores OFF
en el primer build Auth, incluso si existe una variable local distinta.

## Integración existente

Publicar mediante push autorizado a `main` del repositorio existente.
No crear otro proyecto ni exigir login o link CLI. La integración GitHub–Vercel
ya fue comprobada mediante el status del commit remoto.

Después: configurar preset Vite y Node 24.x en Settings si aún no coinciden;
identificar en Settings → Domains el dominio de producción asignado. No asumir
disponibilidad de `gns-hair-studio.vercel.app`, ni usar un nombre propuesto como
evidencia de dominio. Compartir sólo la URL HTTPS pública y confirmar vinculación.
Si no se asignó un dominio, resolver el dominio de producción antes del corte.

GitHub puede conectarse más adelante a `GabooGauna/gestor_barberia`, únicamente
con un commit revisado que contenga estos cambios; confirmar rama y no activar
deploy automático. La conexión no publica los cambios locales sin push.

## Origen y orden del corte

Una vez verificado el dominio, registrar su origen HTTPS exacto sin ruta/trailing
slash como `ALLOWED_ORIGIN` de `admin-users`. Configurar Auth Site URL y redirects
exactos necesarios para ese origen, sin comodines para todos los previews.
No usar una URL efímera distinta de la que utilizará el usuario. No se requiere
crear rutas Vercel `/api` ni proxys para esconder el endpoint Supabase.

1. Cerrar recuperación integral/propiedades DATABASE, configuración Auth/JWT/
   antiabuso y mecanismo verificable de suspensión de TODOS los escritores.
   Preparar primer administrador y entrega segura de credenciales. Reviewer.
2. Verificar dominio/variables/versión; mantenimiento y respaldo definitivo bajo
   suspensión de escrituras, siguiendo los checkpoints del runbook principal.
3. Aplicar únicamente expand → bootstrap/vinculación conservando UUID →
   conciliación → checkpoint → cutover → suplemento operativo. Nueva Edge con
   JWT/origen/secretos verificados y mantenimiento activo hasta gates cumplidos.
4. Con backend candidato listo, construir/publicar versión Auth con color OFF
   mediante despliegue controlado del árbol revisado. No se da por cumplido este
   paso por existir un build local o una URL Vercel. Verificar `/` y recarga de
   `/panel`, login, empleado/admin, AAL1/AAL2, Edge, RLS y anónimo denegado.
   Completar gate de apertura documentado y revisión de evidencia real.
5. Sólo tras aceptar Auth: aplicar explícitamente
   `20261016000000_add_rutinas_color.sql`; verificar default/constraint y
   conservación de UUID/filas/rutinas. Cambiar Production a
   `VITE_ENABLE_RUTINAS_COLOR=true`, nuevo build/deploy y comprobar edición
   admin y lectura empleado. No ejecutar `supabase db push` general.

Una falla de frontend se contiene/repara conservando el backend seguro. No
promover un despliegue anterior que use PIN ni desactivar RLS para recuperarlo.
Color puede volver a OFF mediante otro build sin eliminar la columna/datos.
No confundir mantenimiento visual de Vercel con contención REST/Auth/Edge.

## Evidencia actual

Integración, dominio, artefacto y bandera Production true verificados.
Login/MFA y UI admin reales aprobados; roles/RLS y lectura/edición denegada
API empleado comprobados. Color admin probado con cambio y restauración;
colores posteriores del propietario confirmados y preservados. Servicio abierto,
in-flight cero. Las suites locales previamente aprobadas no se repitieron.
Límites de respaldo/recuperación y aceptación de riesgo residual se conservan,
sin RPO 0 absoluto ni recuperación integral del proveedor. No Etapa 5.
Evidencia: `../reviews/stage-04-controlled-cutover-checkpoint.md`.

Fuentes oficiales: [Vite/SPA](https://vercel.com/docs/frameworks/frontend/vite),
[variables](https://vercel.com/docs/environment-variables),
[Git deployments](https://vercel.com/docs/project-configuration/git-configuration),
[CLI project](https://vercel.com/docs/cli/project),
[CLI link](https://vercel.com/docs/cli/link),
[exclusiones CLI](https://vercel.com/docs/deployments/vercel-ignore),
[Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
