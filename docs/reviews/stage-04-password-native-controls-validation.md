# Validación focal de controles nativos de contraseña — Etapa 4

Fecha: 18 de octubre de 2026. Tester. Resultado: **los controles nativos no
satisfacen la exclusividad administrativa de todos los cambios de contraseña**.
El bloqueante confirmado por el propietario permanece abierto.

## Alcance y fuentes

Ensayo nuevo únicamente de PostgreSQL y GoTrue reales, aislados y sintéticos.
Se conservan sin repetir las 40 assertions de Auth/MFA/cuotas/recuperación y
las 10 de reproducción baseline anteriores. No se ejecutó backup, migración
de negocio, Edge, frontend, despliegue ni operación remota.

La [configuración oficial GoTrue 2.197.0](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/conf/configuration.go)
define, dentro de SecurityConfiguration y con `split_words`, los dos campos
empleados por la sonda:

```text
GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true
GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true
```

Se verificaron ambos valores ON en el entorno del contenedor sin imprimir
otras variables. El [handler oficial UserUpdate](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/user.go)
permite una sesión reciente bajo reautenticación; exigir la contraseña actual
demuestra conocimiento del secreto, no aprobación administrativa. El ensayo
observado abajo confirma el límite sin modificar el contrato ni el proveedor.

## Reproducción y resultado

```powershell
node scripts/stage04-password-native-controls-probe.mjs
node --check scripts/stage04-password-native-controls-probe.mjs
npx eslint scripts/stage04-password-native-controls-probe.mjs
```

Resultado final: **13 assertions nuevas de la sonda, exit 0, 7,272 segundos
hasta checks**, con limpieza posterior confirmada. Sintaxis, ESLint y
`git --git-dir=.git --work-tree=. diff --check`: exit 0; Git sólo advierte
conversión LF/CRLF en archivos del conjunto de trabajo.

Exit 0 significa que la sonda reprodujo los comportamientos esperados;
**la política exclusivamente administrativa FALLA**, no se aprueba por ese
resultado técnico.

| Caso con ambos controles ON | Resultado real |
|---|---|
| Empleado inicia sesión nueva | JWT `authenticated` válido, TTL 300 s y más de 30 s restantes al comienzo. |
| Self-update omitiendo contraseña actual | HTTP 400, `current_password_required`. |
| Self-update con contraseña actual incorrecta | HTTP 400, `current_password_invalid`. |
| Self-update con contraseña actual correcta y sesión fresca | Aceptado, mismo UUID Auth, sin autorización administrativa. |
| Login con contraseña establecida por el propio empleado | Correcto; contraseña anterior rechazada. |
| Reset Admin API sin incluir contraseña actual | Correcto; login nuevo válido y contraseña previa propia rechazada. |
| Identidad después del reset | UUID Auth, UUID auxiliar de empleado y vínculo conservados. |

Las primeras ejecuciones focales detectaron que la assertion esperaba el
nombre equivocado del código de error para contraseña actual incorrecta. Se
observó sólo código/estado seguros y se corrigió a `current_password_invalid`;
la ejecución final indicada arriba validó el conjunto completo. No se registran
contraseñas, tokens, claves, hashes ni identificadores reales.

## Entorno, límites y limpieza

Windows, Node 24.18.0, Docker local Linux. Imágenes PostgreSQL 17 Alpine y
GoTrue 2.197.0 fijadas por los mismos digests conocidos; entorno nuevo con
nombres aleatorios propios, rechazo de argumentos y endpoints Docker remotos.
PostgreSQL no publica puertos; GoTrue publica sólo 127.0.0.1:55427, verificado
con inspect. El SDK usa el endpoint GoTrue directo, sin depender de CORS,
frontend, gateway ni mocks.

La tabla auxiliar mínima de empleado sólo demuestra preservación de UUID y
vínculo; no sustituye el esquema de negocio ni la suite RLS. La sesión fresca
evita interpretar expiración como prohibición. La bandera de reautenticación
se configura ON; no se ensaya aquí un nonce de sesión mayor a 24 horas.

Finalmente se eliminaron contenedores, volúmenes anónimos y red propios; una
limpieza fallida haría fallar la sonda. Las inspecciones posteriores no
encontraron recursos `password-native-*`. No hubo usuarios reales, PIN,
secretos/configuración remotos, push ni despliegues.

## Handoff y gate

Tester entrega esta evidencia al Orquestador, Backend y Reviewer independiente.
No se implementó trigger sobre `auth.users`, SSO ni cambio de arquitectura.
Queda pendiente una capacidad soportada por el proveedor o una alternativa
aprobada expresamente por el propietario, con prueba negativa del endpoint
directo y regresiones proporcionales. Este ensayo demuestra que activar los
dos parámetros nativos por sí solo **no resuelve el bloqueante**.

Las evidencias anteriores permanecen válidas en sus alcances. Staging y
producción no quedan habilitados; no se inicia Etapa 5 y `rutinas.color`
continúa independiente.
