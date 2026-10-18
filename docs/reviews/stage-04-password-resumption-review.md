# Revisión independiente de reanudación — Etapa 4

Fecha: 18 de octubre de 2026. Dictamen: **APROBADOS la investigación y el ensayo
focal como evidencia del incumplimiento**. **NO APROBADO el requisito completo
ni staging/producción**: sigue abierto el bloqueante de contraseñas exclusivamente
administrativas. Se conservan las aprobaciones locales de subcontroles anteriores.

## Alcance y evidencia revisada

Reviewer independiente de Backend, Tester y Orquestador. Se conservaron las
fuentes y reglas del repositorio; se revisaron la matriz
`../decisions/stage-04-password-architecture-options.md`, la reanudación del ADR
`../decisions/stage-04-admin-only-passwords.md`, el contrato Auth, runbooks y
contexto actualizados. Se inspeccionaron el nuevo harness
`scripts/stage04-password-native-controls-probe.mjs` y la evidencia del Tester
`stage-04-password-native-controls-validation.md`.

Se comprobaron además fuentes primarias: [UserUpdate de GoTrue 2.197.0](https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/user.go),
[SSO SAML](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)
y [OIDC externo](https://supabase.com/docs/guides/auth/third-party/custom-oidc).
No se consultó configuración, usuarios, PIN o secretos remotos.

Tester entrega `node scripts/stage04-password-native-controls-probe.mjs`:
13 assertions nuevas, 7,272 s hasta checks, exit 0, limpieza verificada.
Sintaxis, ESLint y diff-check: exit 0; inspecciones posteriores de contenedores
y red propias vacías. Reviewer revisó el artefacto y esa evidencia, sin repetir
la sonda ni atribuirse una ejecución propia. No se repitieron las 40 comprobaciones
Auth/MFA/cuotas/recuperación ni las 10 del incumplimiento baseline.

## Conclusión técnica

Los nombres reales probados fueron
`GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION` y
`GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`, ambos ON. La sesión
empleada era nueva, authenticated y vigente: el rechazo por expiración no se
confundió con autorización. Omitir contraseña actual produjo 400
`current_password_required`; una incorrecta, 400 `current_password_invalid`.
Con la actual correcta, el empleado cambió su contraseña sin administrador y
pudo iniciar sesión con ella; la anterior fue rechazada.

Admin API siguió permitiendo reset sin contraseña actual, conservando UUID Auth,
UUID auxiliar y vínculo. La tabla auxiliar no prueba todo el esquema de negocio
ni RLS. La sonda no ensaya nonce de sesión mayor a 24 horas, MFA, SSO o IdP.
Una sola sesión fresca que permita autoservicio basta para refutar la prohibición
absoluta; no hace falta repetir suites intactas para esa conclusión.

**Exit 0 demuestra que se reprodujo el comportamiento esperado por la sonda;
la política de producto FALLA.** Los dos parámetros nativos endurecen el cambio
propio, pero no aportan exclusividad administrativa. No se implementó un control
de servidor nuevo ni se modificaron archivos de aplicación o migraciones.

## Revisión de alternativas

La matriz distingue correctamente tres situaciones: candidato password actual
incumplido; una capacidad soportada del proveedor todavía sin demostrar; y
alternativas de SSO/IdP o Auth bajo control operativo que necesitan decisión y
ensayo propios. No afirma imposibilidad universal ni que esos caminos estén
implementados, elegidos o autorizados.

SSO necesita IdP real con política administrativa verificable y contención de
todas sus rutas, cuentas password residuales y recuperación. Cambiar manualmente
`is_sso_user` no constituye provisión SSO ni prueba del IdP. La matriz conserva
TOTP/AAL2 de Supabase como gate: MFA en IdP no se presume `aal2` efectivo en
JWT, RLS y Edge. También registra nuevo vínculo Auth SSO, conservación de
`empleados.id` e historial, limitaciones de logout y doble plano de recuperación.

La alternativa privada exige origen no eludible, recursos y operación propios;
un proxy sobre un origen público no sirve. Mover sólo Auth no conserva
automáticamente `auth.users`, FK, sujetos JWT ni `getUser()`/MFA de Edge.
Se mantiene descartado como solución adoptada el trigger sobre auditoría interna,
por falta de contrato estable y riesgo de romper rehash/reencriptación durante
login. No se encontraron nuevos hallazgos bloqueantes/altos introducidos por
estos documentos o la sonda; el incumplimiento confirmado permanece abierto.

## Handoff y gate

Antes de implementar una arquitectura, el propietario debe elegir un camino
con garantía soportada, costo/operadores y contratos explícitos. Después Backend
debe implementar en aislamiento, Tester probar denegación directa de todo
establecimiento/cambio propio y reset administrativo permitido, e integridad,
MFA, recuperación, fallos, versiones y endpoints alternativos; Reviewer vuelve
a revisar. La decisión por sí sola no cierra el bloqueante.

Permanecen también drift/configuración remotos sin certificar, limitación real
de login Auth/ingress, CAPTCHA, respaldo/restauración integral del proveedor,
custodia/entrega privada, RPO 0 y RTO integral. No se autoriza escritura remota,
usuarios reales, despliegue o push. Color sigue independiente y no se inicia
Etapa 5. La revisión histórica del 17 de octubre no se reescribe.
