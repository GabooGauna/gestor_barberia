# Etapa 4 — Preparación Vercel

18 de octubre de 2026. Frontend React/Vite en Vercel, backend en Supabase,
según decisión expresa del propietario. Preparación local, sin publicar.

## Handoff Orquestador / Frontend / Tester

Cambios: `vercel.json`, `.vercelignore`, `.env.example`, `.gitignore`, Node 24.x
en package.json/lockfile y `docs/runbooks/stage-04-vercel.md`. Actualizados
checkpoints de contexto/stage/cutover. Backend funcional y contratos Auth/RLS/
MFA/Edge intactos. No se modifica el flujo visual ni se introduce proveedor.
Destino CLI permite usar el árbol revisado sin push; Git automático desactivado.

Variables públicas identificadas desde el código: URL Supabase, clave anon y
flag color. La plantilla incluye URL esperada y clave vacía; no se leyó/copió
ningún valor real. Production solamente para backend real. Preview/Development
requieren configuración aislada. Flag inicial false; color sólo después de Auth.

Validación afectada, Node v24.18.0 / npm 11.5.2 / Vite 8.3.0:

- JSON de Vercel y package/lockfile parseados y engines coherentes.
- Build con Node ejecutando `node_modules/vite/bin/vite.js build`, entorno
  sobreescrito sólo para ese proceso: URL `https://isolated.invalid`, clave
  pública sintética y color=false: exit 0. No login/requests al backend.
  Bundle 530,09 kB / gzip 151,62 kB; conserva advertencia histórica >500 kB.
  El `dist` generado es sólo de ensayo: no publicarlo ni usar `--prebuilt`;
  el deploy real construirá con las variables verificadas de Vercel.
- `git check-ignore`: .vercel/project.json, .env.production y .env.production.local
  ignorados; .env.example no ignorado. No depende de exponer secretos.
- `git diff --check` con safe.directory por comando: exit 0, sólo avisos de CRLF.
- No se repiten SQL/Auth/MFA/cuotas/E2E aprobados: no cambiaron implementaciones
  de esos flujos. El fallback SPA sigue la receta oficial; aún no se atribuye
  validación de recarga/rutas a infraestructura Vercel real.

Comando reproducible del build afectado, sin valores reales:

```powershell
node --input-type=module -e 'import {spawnSync} from "node:child_process"; const r=spawnSync(process.execPath,["node_modules/vite/bin/vite.js","build"],{stdio:"inherit",env:{...process.env,VITE_SUPABASE_URL:"https://isolated.invalid",VITE_SUPABASE_ANON_KEY:"synthetic-public-anon-key",VITE_ENABLE_RUTINAS_COLOR:"false"}}); process.exit(r.status??1);'
```

## Pendientes / siguiente rol

Reviewer independiente debe revisar configuración, exclusiones, variables,
procedimiento manual y preservación del gate. No se declara producción lista.
El propietario debe autenticar/vincular Vercel; CLI no instalada ni proyecto
local .vercel en este checkpoint. Dominio exacto y presencia de variables todavía
sin verificar. No se requiere conectar GitHub para el camino CLI.
La selección de plan para uso comercial queda al propietario; se agregó la
restricción oficial de Hobby al paso de cuenta, sin contratar recursos.

Los pendientes backend del informe `stage-04-existing-backup-recovery.md` se
mantienen: recuperación integral/propiedades DATABASE, configuración Auth,
contención/RPO0 y backup definitivo. El destino elegido no los resuelve.
Migraciones remotas aplicadas: ninguna. Color no aplicado ni activado.
Sin push, deploy ni Etapa 5.

## Lectura backend adicional: bloqueo concreto de suspensión de escrituras

MCP de proyecto respondió a una consulta `BEGIN TRANSACTION READ ONLY` / ROLLBACK,
sin valores de filas, PIN, settings ni secretos. Se comprobó específicamente el
operador Session pooler `postgres` mediante `has_table_privilege` para los
privilegios MAINTAIN/UPDATE/DELETE/TRUNCATE que permiten SHARE locks en PG17.
Resultado por schema: auth 27 tablas / cobertura de permiso **false**, storage 8 /
**false**, public 6 / true, realtime 3 / true, vault 1 / true. No se ejecutaron
locks ni se cambiaron permisos. No se afirma ausencia de cualquier mecanismo de
freeze: queda descartado dar por disponible ese candidato con el operador actual.

Propiedades DATABASE leídas: owner postgres, UTF8, collate/ctype en_US.UTF-8,
provider ICU, locale en-US, tablespace pg_default, connlimit -1, allowconn true,
una fila/entrada de configuración específica. No se consultó su valor. ACL y
recuperación de propiedades siguen pendientes; el restore previo no las certificó.

Para cumplir RPO0 falta identificar y ensayar un mecanismo soportado por Supabase
que suspenda Auth/Storage y otros escritores manteniendo accesible el respaldo,
o intervención privilegiada soportada del proveedor para ese procedimiento.
No ampliar grants ni intervenir schemas administrados a ciegas. Una pausa que
cierre la base no demuestra disponibilidad para el dump, y bloquear Vercel no
detiene la URL Auth directa. No sustituir el objetivo de RPO0 sin decisión expresa.
Fuentes: [LOCK PG17](https://www.postgresql.org/docs/17/sql-lock.html),
[restricciones de red Supabase](https://supabase.com/docs/guides/platform/network-restrictions),
[pg_restore y propiedades DATABASE](https://www.postgresql.org/docs/17/app-pgrestore.html).

Preparación Vercel aprobada por Reviewer en `stage-04-vercel-review.md`.
Esta lectura remota no cambia el dictamen SQL anterior ni levanta gates.
