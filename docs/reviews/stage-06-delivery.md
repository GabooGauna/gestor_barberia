# Etapa 6 — Entrega de GNS Hair Studio

Fecha: 20 de octubre de 2026. Alcance autorizado por el propietario: optimización
medible, regresión, limpieza puntual de pruebas/César, commit/push y Vercel.
La apertura se registra en el stage 06; no incorpora funciones pendientes del
roadmap general de Etapa 5. No se modifican Auth/RLS ni se generan migraciones.

## Frontend → Tester

Implementación: carga diferida de Panel, rama por rol y Auditoría; una consulta
menos de `empleados` al abrir Plantillas (Equipo carga al entrar y tras mutar).
Logo WebP de 720×540 y favicon independiente; PNG maestro conservado.
Se verificó igualdad RGBA del WebP lossless frente al derivado y proporciones.
Se eliminaron seis archivos del template sin referencias con `rg`: App.css,
hero.png, react.svg, vite.svg, icons.svg y favicon.svg. CSS GNS intacto.

| Métrica de build | Antes | Después |
|---|---:|---:|
| JS inicial minificado | 538,10 kB | 488,29 kB |
| JS inicial gzip | 154,63 kB | 142,05 kB |
| JS total minificado | 538,10 kB | 541,08 kB |
| JS total gzip | 154,63 kB | 158,45 kB |
| Logo servido | 964,66 kB | 176,13 kB |
| Favicon | reutilizaba logo | 6,11 kB |

Se reduce la descarga inicial; el total de JS crece ligeramente por los chunks.
Sin advertencia >500 kB. Dependencias sin cambios, cero paquetes añadidos.

## Backend → Orquestador

Inspección confirmó exactamente un César, empleado con Auth vinculado. Todas
las filas operativas halladas pertenecen a él: 46 `auditoria_diaria`, 47
`private.task_completion_events`, cuatro `tareas_urgentes` y tres eventos
`private.auth_admin_audit` (alta/reset de César). Asignaciones diarias, legado y
admissions de actor César vacíos. Otras tres entradas de auditoría administrativa se conservan.
El guard detectó además una admission finalizada cuyo target es SHA256 del UUID
de César: se incluyó en el respaldo definitivo y se eliminó por su ID exacto.
Las otras dos admissions finalizadas se conservaron mediante huella propia.
FK restrict y cascadas Auth inspeccionadas; sólo triggers existentes de seguridad.

Respaldo puntual cifrado DPAPI, ACL privada, fuera de Git/OneDrive:
`C:\Users\gauna\AppData\Local\GestorBarberia\backups\stage06-cesar-cleanup-v3.clixml`.
SHA256 `12C05B3B6958FB292B8559F684E18832867635BAA660B97BB5BB15AA7BF7B8CF`.
Readback exacto PASS antes de borrar. v1/v2 también se conservan. Incluye filas
completas afectadas y metadatos mínimos de identidad Auth; no copia contraseña,
tokens, sesiones ni secretos MFA. Recuperación de identidad mediante reprovisión,
no restitución de la credencial eliminada. DPAPI requiere este Windows/usuario.

Protecciones: proyecto/identidad fijos; allowlist de IDs respaldados; locks y
límites de tiempo; comparación de snapshot y conteos; aborto ante drift,
administrador objetivo u operaciones administrativas en curso. Huellas combinadas calculadas
en PostgreSQL verifican rutinas/tareas/colores, demás perfiles, credenciales y
factores conservados, políticas, grants, funciones y configuración operativa.
Los valores secretos nunca salen de PostgreSQL. MFA excluye sólo timestamps de
uso que cambian con el login, manteniendo identidad/estado/material del factor.

Se abortó sin borrados ante diferencia de representación de timestamps en el
transporte JSON PowerShell. Se corrigió comparando filas tipadas PostgreSQL:
igualdad de ID/contenido/instante, sin relajar el control de datos. El ensayo
sintético reproduce el formato normalizado y verifica el aborto ante drift.

Un segundo control abortó por la visibilidad de `role_table_grants` según rol:
API readonly usa `supabase_read_only_user` (0 grants visibles), ejecución usa
`postgres` (137). Se conservó el backup original y se añadió suplemento DPAPI
`stage06-grants-context-v3.clixml`, ligado a su SHA256, con el digest de grants
del contexto de ejecución. El backup readonly se comprueba completo antes y
después; la transacción comprueba los 137 grants antes y después. No se cambió
ningún permiso. Los abortos fueron conciliados sin pérdidas ni borrados parciales.

El perfil/relaciones se eliminan en una transacción; después se usa hard delete
de la [Admin API oficial](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)
para la identidad exacta, sin SQL directo sobre `auth.users`. Si falla el segundo
paso, Verify permite reconciliar y Apply continuar sólo la identidad pendiente.
No hay DELETE general, cambios de esquema, permisos ni mantenimiento.

## Tester → Reviewer

- `npm ci`: PASS, 224 paquetes, cero vulnerabilidades. Requirió ejecución fuera
  de AppContainer por fallo de instalación del entorno restringido.
- `npm run lint` y `npm run build`: PASS.
- `node --test tests/unit/*.test.mjs tests/backend/*.test.mjs`: 16/16 PASS.
- `node scripts/stage06-cleanup-drill.mjs`: 6/6 PASS, PostgreSQL sintético Docker
  sin red/puertos, SQL exacto, eliminación selectiva y preservación, equivalencia
  de timestamps, replay/drift/admin/in-flight rechazados y claves hash por UUID
  y usuario; contenedor eliminado.
- Se adaptó el contrato de imagen a WebP. Pruebas de medianoche avanzan como
  máximo 1 s para resolver Suspense antes de verificar el cruce (margen 9 s).
  La prueba de colores espera el catálogo visible antes de inspeccionar requests.
- Regresión focalizada pendiente del checkpoint: 6/6 PASS sin reintentos. El
  reset que había fallado una vez pasó nuevamente; no se alteró autenticación.
- `CI=1 npm run test:e2e -- --workers=2 --retries=0`: 75/77 PASS en la corrida;
  dos casos móviles fallaron (navegación/contexto destruido y retorno a Plantillas)
  y pasaron inmediatamente
  con `--workers=1 --retries=0 --grep 'valida todas las pantallas en (light|dark), mobile'`
  (2/2), manteniendo archivos sin editar durante la comprobación. Los 77 casos
  quedan verificados entre ambas corridas. No se afirma una corrida única 77/77.
  No se modificó producto/Auth. La causa no quedó demostrada: se registra
  inestabilidad no reproducida en serial, sin atribuirla a entorno o producto.

Las pruebas UI interceptan exclusivamente datos sintéticos y abortan requests
a Supabase real. No se repitieron los drills Auth/RLS históricos aprobados.
El propietario confirmó que pudo iniciar sesión; ambos administradores activos
con identidad y contraseña presentes. Estado MFA observado: uno verificado,
segundo sin factor; se conserva intacto, sin enrolarlo ni resetearlo.

## Limpieza remota — resultado

`pwsh -NoProfile -File scripts/stage06-cleanup.ps1 -Action Apply`: COMMIT de
negocio reconocido; hard delete de Auth reconocido; readback PASS. Eliminados:
46 cumplimientos, 47 eventos asociados, cuatro urgencias, tres eventos admin
de César, una admission de César, un perfil y su identidad Auth. Asignaciones
diarias/legado ya tenían cero filas y permanecen así.

Resultado: cinco rutinas/53 tareas, cero audits/urgencias/eventos/fechas con
actividad de calendario; cero relaciones Auth de César y cero huérfanos.
Todas las huellas preservadas coinciden. Ambos admins activos/no baneados,
identidades y contraseñas presentes, factores MFA conservados (1/0). Lectura
con RLS y claims AAL2 de cada administrador devuelve cinco rutinas/53 tareas
y cero registros operativos, sin errores de permisos. Son probes SQL de
autorización, no nuevos logins con contraseñas o factores reales.

## Orquestador → Publicación

La publicación autorizada utiliza `main` del repositorio existente y su
integración GitHub–Vercel, sin crear otro proyecto ni modificar variables remotas.
Se comprueban status del SHA publicado, rutas públicas y assets optimizados; la
evidencia exacta de publicación se entrega al propietario en el cierre del chat.
Los cambios locales del usuario en `.codex/config.toml` y `.env.example` quedan
fuera del commit. Las rutas `/` y `/panel` respondieron 200 tras la limpieza.
