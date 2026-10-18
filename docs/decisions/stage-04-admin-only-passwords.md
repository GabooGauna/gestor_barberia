# Etapa 4 — Exclusividad administrativa de contraseñas

Estado vigente al 18 de octubre de 2026: **requisito sustituido por decisión
explícita del propietario**. Se conserva Auth nativo y se acepta el cambio propio
por API directa; ver `stage-04-native-auth-risk-acceptance.md`. El bloqueo por
exclusividad se retira por cambio de contrato, no por un control implementado.
Los apartados siguientes conservan el diagnóstico y gates históricos, que ya
no exigen implementar exclusividad. Los demás gates operativos siguen vigentes.

Fecha histórica: 17 de octubre de 2026. Estado entonces: **requisito confirmado; BLOQUEANTE abierto**.
El propietario respondió: «Todo cambio exclusivamente administrativo».
No se trata de permitir cambio propio con alta/recuperación administradas.

## Discrepancia y decisión del Orquestador

El contrato de producto exige exclusividad; el candidato actual no la impone
en el endpoint Auth directo. La UI sólo ofrece altas/reset administrativos,
pero el usuario autenticado puede invocar `updateUser({password})` por su cuenta.
Se conserva el control de MFA/cuotas/mantenimiento revisado, pero NO se declara
el objetivo completo satisfecho ni se autoriza staging/producción.

Se detiene la implementación de exclusividad sobre una suposición. No se
modifican silenciosamente auth.users, roles de GoTrue, cifrado o auditoría.
Backend investigó mecanismos y Tester completó reproducción focal Auth real;
la evidencia está en `../reviews/stage-04-password-policy-gap.md`.

## Reanudación — 18 de octubre de 2026

Se conservan sin repetición las 40 comprobaciones Auth/MFA/operación y las
10 de reproducción del incumplimiento. La investigación continúa con un foco
nuevo: exigir simultáneamente contraseña actual y reautenticación en GoTrue,
sin confundir esos ajustes con exclusividad administrativa. Resultado y límites
en `../reviews/stage-04-password-native-controls-validation.md`.

Las alternativas para decisión ANTES de implementar se desarrollan en
`stage-04-password-architecture-options.md`. No se adopta SSO, IdP, proxy,
Auth privado ni un trigger sobre auditoría interna por esta reanudación.
La arquitectura actual sigue sin una garantía de exclusividad demostrada;
no se afirma que todo proveedor o toda arquitectura sea incapaz de ofrecerla.

## Lo comprobado en fuentes primarias

- [API updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser)
  contempla cambio de contraseña del usuario autenticado. MFA/reautenticación
  condicionan esa operación, no la reservan a un administrador del negocio.
- [Hooks documentados](https://supabase.com/docs/guides/auth/auth-hooks) no
  ofrecen un BeforeUserUpdated/BeforePasswordChanged que se pueda asumir aquí.
  Password Verification Attempt regula verificación en login, no ese cambio.
- [Restricciones de red](https://supabase.com/docs/guides/platform/network-restrictions)
  de base/pooler no bloquean Auth HTTPS. Un proxy sobre dominio propio no prueba
  exclusividad si la URL original del proyecto sigue admitiendo la operación.
- En GoTrue2.197.0, [UserUpdate](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/user.go)
  modifica password y escribe auditoría posteriormente dentro de la transacción;
  [Admin API](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/admin.go)
  usa otra evidencia administrativa en esa transacción. El rol SQL de GoTrue
  no identifica por sí solo cuál endpoint originó la mutación.

## Alternativa investigada que no se adopta

Un guard diferido sobre cambio de encrypted_password podría exigir evidencia
administrativa de la MISMA transacción: marcador privado xid8+UUID objetivo
generado sólo por auditoría administrativa con origen verificado. No guardar
contraseña/hash/email/token. Un marcador anterior, otro actor, replay o evento
de usuario no debe habilitar el cambio. Audit OFF tendría que denegar también
Admin API (fail-closed); nunca permitir ante falta de evidencia.

No se incluye ese experimento en las migraciones candidatas: depende de
auditoría interna que no es un hook contractual estable. Existe riesgo concreto
de disponibilidad: [token.go](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/token.go)
puede reencriptar el hash durante login fuera de la transacción administrativa.
El guard podría impedir ese login al activar/rotar cifrado. Supabase advierte
sobre estabilidad de objetos internos en
[gestión de usuarios](https://supabase.com/docs/guides/auth/managing-user-data).
No se soluciona habilitando excepciones de login sin una prueba de autoridad.

Cualquier experimento futuro exige versión fijada, revisión previa y pruebas
de Admin API/Edge reset, alta, cambio propio AAL1/AAL2, rollback íntegro, audit OFF,
replay/concurrencia, cambio de metadata, rehash/reencriptación y rotación de claves.
Pasar un experimento local no confirma compatibilidad del proveedor administrado.

## Caminos para resolver el bloqueo

1. **Control soportado del proveedor:** obtener evidencia verificable de una
   política de servidor que deniegue TODO cambio propio en la URL Auth original,
   manteniendo Admin API/Edge administrativos. Identificar capacidad/versión,
   configuración exacta y garantías; no asumir un ajuste disponible sin prueba.
   Con esa información Backend implementa candidato local compatible y pasa
   pruebas negativas directas más Reviewer. El MCP actual no está disponible
   y no se contacta soporte ni se configura el proyecto automáticamente.
2. **Arquitectura Auth bajo control completo:** si el proveedor actual no ofrece
   esa garantía, decidir una arquitectura donde Auth no tenga origen público
   eludible y el punto servidor de actualización aplique la política. Por ejemplo,
   stack Auth privado con entrada controlada y red que impida llegar al origen.
   Requiere decisión explícita de alcance/hosting, análisis operativo, recursos,
   migración de identidades/UUID/FK, confianza JWT/Data API, MFA, backup y soporte.
   No basta agregar un proxy al frontend ni mover sólo Auth sin revisar la FK
   auth.users y la emisión/verificación de JWT del sistema existente.

No se elige automáticamente una nueva arquitectura ni se relaja la decisión
confirmada del propietario. Estos caminos son propuestas revisables, no
instrucciones de aplicar cambios reales.

## Gate obligatorio antes de staging

- Demostrar por HTTP directo que empleado y administrador autenticados NO
  cambian ni agregan su propia contraseña, con AAL1/AAL2 y recovery token.
- Verificar que el intento denegado no alteró credencial/sesiones/historial,
  ni emitió eventos que puedan reutilizarse para eludir el control.
- Alta/reset por administrador autorizado AAL2 siguen funcionando mediante
  Edge; service_role queda exclusivamente en runtime y recuperación privilegiada.
- Contemplar todos los endpoints que puedan establecer contraseña, acceso
  al origen, variantes de requests y fallos de dependencias, sin fail-open.
- Ensayar emergencia del único admin y rehash/cifrado/rotación sin bypass.
- Compatibilidad del proveedor y contrato aprobados, Tester y Reviewer verdes.

Hasta entonces se aprueban únicamente los subcontroles locales ya verificados;
el requisito y el despliegue permanecen bloqueados. No hay permiso remoto nuevo.
