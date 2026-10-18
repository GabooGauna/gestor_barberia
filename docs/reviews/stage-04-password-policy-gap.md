# Bloqueante: contraseña exclusivamente administrativa — Etapa 4

Fecha: 17 de octubre de 2026. Tester. El propietario confirmó que **todo cambio
de contraseña, incluido el propio mediante API Auth directa, debe ser
administrativo**. La implementación actual no satisface ese requisito.

## Reproducción focal

```powershell
node scripts/stage04-password-policy-probe.mjs
node --check scripts/stage04-password-policy-probe.mjs
npx eslint scripts/stage04-password-policy-probe.mjs
```

Docker local, PostgreSQL 17 Alpine y GoTrue 2.197.0 reales, imágenes fijadas por
digest. Cuenta y contraseñas sintéticas; signup OFF, sesión nueva con JWT
`authenticated` y TTL 300 segundos. No se reutiliza una sesión expirada para
interpretar un 401 como protección. La base no publica puertos y Auth publica
únicamente 127.0.0.1:55426, con verificación. Se usa endpoint GoTrue directo,
sin frontend, CORS, Edge ni gateway intermediario.

Una tabla auxiliar mínima clasifica la identidad sintética como empleado y
permite comparar UUID/vínculo. No reemplaza el esquema de negocio ni prueba
RLS; el ensayo focal no reaplica migraciones ni repite MFA/cuotas/backup.

Resultado reproducido: **10 assertions de la sonda, exit 0, 6,392 segundos
hasta checks, limpieza posterior confirmada**. Exit 0 significa que se logró
reproducir el defecto esperado, **no que la política esté aprobada**.

1. Admin API crea la cuenta sintética y el empleado inicia sesión válida.
2. `auth.updateUser({ password })` desde ese cliente authenticated es aceptado
   sin autorización administrativa.
3. Login con la nueva contraseña propia funciona y la anterior es rechazada.
4. Admin API restablece otra contraseña: login administrativo válido, anterior
   propia inválida; UUID Auth, UUID de empleado auxiliar y vínculo se conservan.

El primer intento tuvo un prefijo `/auth/v1` inaplicable al puerto GoTrue
directo; se corrigió el fetch de la sonda para quitar ese prefijo. La ejecución
final indicada arriba terminó correctamente. Contenedores, volúmenes anónimos
y red propios fueron eliminados; no se escriben credenciales en disco/logs.
No se crearon usuarios reales ni se accedió a PIN o Supabase remoto.

## Impacto y diagnóstico delimitado

**BLOQUEANTE del objetivo confirmado.** El login, MFA, RLS y los controles de
`admin-users` pueden estar correctamente protegidos mientras el endpoint Auth
directo permite modificar la contraseña propia. Ocultar una acción en UI,
CORS, signup OFF, conocer la contraseña actual o exigir reautenticación no
demuestra exclusividad administrativa. Las 40 assertions del ensayo anterior
siguen siendo evidencia válida para sus controles; no cubrían este requisito.

El código oficial de GoTrue procesa el campo password de UserUpdate y exige
AAL2 si la cuenta tiene MFA; después actualiza la contraseña y escribe el
evento de auditoría. Esto coincide con la observación local. [GoTrue 2.197.0:
UserUpdate](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/user.go).

No se implementa un trigger sobre `auth.users` como solución. Vincular cada
cambio de `encrypted_password` a un evento administrativo interno requiere
soporte/compatibilidad del proveedor y probar todos los consumidores. Además,
GoTrue puede reescribir ese campo durante un login para renovar su cifrado,
sin tratarlo como cambio de contraseña: rechazarlo indiscriminadamente puede
romper accesos legítimos. Este es un diagnóstico de código, no un ensayo de
rotación cifrada ni una prueba de un trigger candidato. [GoTrue 2.197.0:
reencryption durante login](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/token.go).

## Resolución requerida

Backend y Orquestador deben identificar una capacidad soportada por Supabase
que bloquee cambios propios en el endpoint directo y permita el reset mediante
Admin API, o presentar al propietario una alternativa de arquitectura/contrato
para decisión explícita. No se da por autorizada ninguna modificación de
proveedor, contrato, esquema Auth protegido o configuración remota.

Antes de cerrar el bloqueante: demostrar self-update denegado para empleado
con sesión fresca, rutas de recuperación/token alternativas contenidas, reset
administrativo permitido, identidad/historial preservados y login/rotación de
cifrado compatibles; después revisión independiente. Mientras tanto **no se
autoriza staging ni producción con declaración de cumplimiento de esta
política**. Los demás gates operativos y del proveedor permanecen abiertos.

Handoff: Tester entrega reproducción exacta a Backend, Orquestador y Reviewer;
el requisito queda incumplido y el objetivo completo bloqueado. No se inicia
Etapa 5.
