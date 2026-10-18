# Validación focal Auth real y seguridad operativa — Etapa 4

Fecha: 17 de octubre de 2026. Tester independiente del autor Backend.
No autoriza staging ni producción. Complementa la evidencia aprobada anterior;
no repite el ensayo SQL de backup/restauración ni suites de aplicación intactas.

## Entorno y reproducción

```powershell
node scripts/stage04-auth-security-drill.mjs
node --check scripts/stage04-auth-security-drill.mjs
npx eslint scripts/stage04-auth-security-drill.mjs
```

Windows, Node 24.18.0 y Docker Desktop Linux. El harness rechaza argumentos y
Docker remoto; genera nombres, credenciales y cuentas exclusivamente sintéticos.
PostgreSQL 17 Alpine, GoTrue 2.197.0, PostgREST 16.4 y Edge Runtime 1.77.4,
con imágenes fijadas por digest. Aplica sólo legacy fixture → expand → creación
por Admin API/bootstrap/vinculación → cutover → suplemento security_operations.
`rutinas.color` no forma parte de la cadena.

La base no publica puertos. Auth/REST/Edge y el proxy HTTP del ensayo publican
sólo 127.0.0.1, con inspección de los bindings. El proxy local no implementa el
gateway JWT del proveedor: se ejercita el handler real con `getUser()` y AAL,
no se certifica `verify_jwt` del gateway Supabase administrado. Se usa GoTrue
real con su esquema/migraciones, factores, sesiones y endpoints HTTP; no el
shim SQL del ensayo de respaldos. Los helpers `auth.uid()`/`auth.jwt()` y roles
de Data API se preparan explícitamente para este PostgreSQL descartable.

El primer intento CLI se interrumpió antes de cargar fixtures o crear cuentas:
Docker Desktop ignoró el binding por defecto del network. Se retiraron sus
recursos y se sustituyó por servicios Docker con publicaciones explícitas.
Otros fallos de preparación fueron readiness TCP y search_path de GoTrue;
quedaron corregidos en el harness. No hubo acceso a Supabase remoto ni PIN.

## Verificaciones focales

- Admin AAL1: cero filas de negocio y Edge 403. Empleado AAL1 conserva su
  asignación. Perfil mínimo permanece separado para el enrolamiento.
- GoTrue TOTP real: enrolamiento, challenge inválido denegado y challenge válido
  con AAL2. Admin AAL2 obtiene RLS y operación administrativa Edge 200.
- RPC sensibles: authenticated no puede abrir mantenimiento ni suplantar actor
  mediante la RPC reservada a service_role.
- Burst concurrente: ocho requests HTTP al handler real admiten tres y limitan
  cinco con 429/Retry-After. El estado persiste tras reiniciar Edge.
- Cuota objetivo: tres resets por quince minutos y denegación desde otro actor
  admin sintético. Cuota actor: diez operaciones/minuto y denegación de la once.
  Se ajustan timestamps del fixture para separar ventanas sin esperar quince
  minutos; no se altera el código de cuota. Los dos focos largos usan RPC real,
  mientras burst, persistencia y outage pasan por HTTP Edge.
- Outage del contador: renombrar temporalmente su tabla en la base sintética
  produce Edge 503 y luego se repone. No hay fallback en memoria.
- Mantenimiento: request Edge sin Origin denegado, incluso service_role no
  escribe tablas de negocio. Admisión pendiente permanece visible hasta cierre
  explícito; después llega a cero. Una transacción escritora con trigger y
  `pg_sleep(3)` demuestra que el cierre espera el lock; la duración se captura
  inmediatamente después de la RPC, antes de esperar el proceso escritor.
- Recuperación de único admin: mantenimiento, reset Admin API, borrado de factor,
  intento de signout global, refresh antiguo rechazado, password antiguo
  rechazado, factor viejo no utilizable, nuevo login/enrolamiento/challenge,
  RLS y Edge recuperados conservando UUID Auth/perfil, rutinas y asignaciones.
- Login existente con password erróneo e inexistente devuelven mismo código y
  estado. Signup público denegado. La sonda de 35 logins erróneos contra GoTrue
  directo no obtuvo 429: el límite `sign_in_sign_ups` necesita verificación de la
  capa de entrada/candidato Supabase, no se certifica con GoTrue solo. El ajuste
  inexistente `GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UPS` se retiró del fixture después
  de contrastar la [configuración oficial GoTrue 2.197.0](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/conf/configuration.go).
  No se demuestra tiempo constante ni protección frente a abuso distribuido.
- El SQL de inspección de configuración/drift sólo lectura se ejecuta contra
  este catálogo candidato local y descarta su salida sensible.

## Hallazgo de expiración y contención

En GoTrue 2.197.0 el reset del fixture ya invalidó la sesión anterior antes del
signout explícito: `getUser` y refresh fueron rechazados. Esto no permite
generalizar que todo verificador de JWT revoca inmediatamente. La primera
assertion REST justo después de exp nominal falló: PostgREST tolera una ventana
adicional: observó rechazo REST 31 segundos después de exp nominal. El harness
corregido mantiene mantenimiento cerrado hasta demostrar
HTTP 401 en REST, con límite de espera que aborta sin abrir. Sólo entonces
renueva la sesión recuperada y abre; verifica que el token antiguo siga 401.
El procedimiento operativo debe considerar TTL máximo histórico, tolerancias
de todos los verificadores y relojes; no sólo el TTL de la configuración actual.

## Resultado final y límites

Ejecución final: `node scripts/stage04-auth-security-drill.mjs`, **exit 0,
40 assertions, 117,882 segundos hasta finalizar checks**; limpieza posterior
confirmada. `node --check`, ESLint del harness y `git --git-dir=.git
--work-tree=. diff --check`: exit 0 (sólo avisos LF/CRLF de Git).

Resultado local acotado aprobado por Tester para los controles enumerados;
no equivale a aprobar todos los objetivos ni a levantar gates operativos.
Durante el trabajo el propietario confirmó que **todo cambio de contraseña,
incluso el del propio usuario por API Auth directa, debe ser exclusivamente
administrativo**. El harness anterior valida provisión/reset administrativos,
no demuestra que Auth prohíba self-update. Este requisito queda **bloqueante**
para el objetivo hasta implementar y probar un control efectivo compatible
con el proveedor; ocultar el cambio en frontend no lo satisface.

No se restauró toda la plataforma Supabase, no se mide RTO representativo,
no se accede a un backup real ni se verifica drift remoto. CAPTCHA no fue
activado; requiere integración y decisión aparte. La entrega privada de
contraseñas y la identidad/custodia del operador no son verificables con este
ensayo automatizado. El RPO 0 exige además detener y verificar escritores de
Auth, jobs y operadores privilegiados; los triggers de negocio no los contienen.

El finally elimina contenedores/volúmenes anónimos propios, network y directorio
temporal ignorado. Una limpieza fallida convierte el resultado en fallo. Las
credenciales nunca se escriben al informe ni se imprimen.

Handoff: Tester entrega este suplemento focal y ejecución final al Reviewer.
Los gates de exclusividad administrativa de passwords, proveedor, configuración candidata y
autorización remota permanecen abiertos; no se inicia Etapa 5.
