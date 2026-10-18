# Reanudación de seguridad operativa — 18 de octubre de 2026

## Resultado y alcance

Se retomó el bloqueo de contraseñas sin repetir validaciones aprobadas ni
implementar otra arquitectura. No existe una garantía administrativa demostrada
en el candidato managed/password actual; **la exclusividad sigue incumplida**.
La aprobación anterior de cuotas Edge, MFA, mantenimiento y recuperación local
se conserva. No se autoriza staging, producción, push ni Etapa 5.

Se leyeron AGENTS y fuentes obligatorias, runbooks, ADR, contratos, informes y
dictámenes. Orquestador mantuvo la discrepancia abierta; Backend investigó
opciones soportadas, Tester ejecutó sólo un foco nuevo y Reviewer independiente
aprobó la investigación y evidencia, manteniendo el requisito completo bloqueado.
No hubo implementación Frontend ni cambio
de migraciones/Edge/RLS en esta reanudación.

## Evidencia conservada y prueba nueva

| Evidencia | Estado |
|---|---|
| Lint/build, 11 unitarios y 45 E2E del candidato operativo | Conservados, no repetidos. |
| 40 assertions Auth real: TOTP/AAL2, cuotas, mantenimiento, drenaje, recuperación/revocación e identidad | Conservadas, no repetidas; scopes en stage-04-auth-security-validation.md. |
| 10 assertions del hueco de self-update baseline | Conservadas, no repetidas; no significan cumplimiento de política. |
| Nuevo foco GoTrue con contraseña actual y reautenticación ON | 13 assertions, 7,272 s, exit 0 como reproducción; POLICY FAIL para exclusividad. |
| Limpieza del nuevo foco y sintaxis | Confirmadas por Tester; contenedores/red/volúmenes propios eliminados. |

La prueba nueva usa Auth real y una sesión de empleado fresca. Omitir la
contraseña actual o enviarla mal falla; enviarla correctamente permite el
cambio propio y login con la nueva. El reset Admin API posterior funciona sin
contraseña actual y conserva UUID/vínculo. No se ensayó nonce con sesión >24h
ni SSO/IdP. Ver `stage-04-password-native-controls-validation.md`.

## Conclusión de servidor y alternativas

Los ajustes de endurecimiento nativos probados NO son una política de
autorización administrativa. No se verificó otro ajuste managed soportado que
la garantice. No se extrapola esa ausencia a todos los proveedores o versiones.
RLS/CORS/UI no controlan el endpoint Auth directo. El guard de auditoría interna
no se adopta por compatibilidad y riesgo de bloquear reencriptación durante login.

`../decisions/stage-04-password-architecture-options.md` presenta antes de
implementar: capacidad soportada del proveedor actual si puede demostrarse,
SAML/IdP con prohibición efectiva de cambio propio, o stack Auth controlado con
política servidor y origen no eludible. Incluye login/email técnico, UUID/FK,
JWT/AAL2, emergencia, respaldo y operación. No se selecciona ni despliega opción.

## Seguridad operativa: qué permanece pendiente

- Recuperación y revocación locales ya aprobadas: mantener cierre hasta rechazo
  efectivo de tokens anteriores. REST toleró 31 s adicionales en aquel entorno;
  no usar ese número como constante del proveedor. Aplicar TTL histórico, skew
  y verificación Auth/REST/Edge de la configuración candidata.
- Auth login rate limiting sigue sin probarse en ingress/gateway del proveedor;
  no equivale a cuotas Edge aprobadas. CAPTCHA requiere decisión/integración.
- Backup/restore completo del proveedor y del esquema suplementario, factores,
  claves, Storage/configuración e infraestructura; congelación de TODOS los
  escritores para RPO0 y RTO integral objetivo 4h siguen pendientes.
- MCP Supabase no está disponible en el inventario de esta sesión; no se
  certifican drift, JWT gateway, secretos/orígenes ni configuración remotos.
  La inspección preparada permanece exclusivamente read-only.
- Custodios y canal privado deben quedar identificados y aprobados para el
  ambiente. Una decisión de arquitectura no es permiso de escritura remota.

## Handoff

Tester entregó el foco nativo y Backend la matriz; el dictamen final de esta
reanudación está en `stage-04-password-resumption-review.md`. El siguiente paso
del propietario es decidir un mecanismo/arquitectura concreto después de revisar
las alternativas. Luego implementación local, pruebas negativas directas y
Reviewer del control elegido. El bloqueante no se cierra por documentarlo.
