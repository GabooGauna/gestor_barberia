# Etapa 4 — Supabase Auth nativo y riesgo aceptado

Fecha: 18 de octubre de 2026. Decisión explícita del propietario en este chat.
Sustituye el requisito anterior de exclusividad administrativa en TODOS los
endpoints registrado en `stage-04-admin-only-passwords.md`; no altera sus
pruebas ni dictámenes históricos.

## Contrato vigente

- El administrador crea cuentas y asigna/restablece contraseñas mediante el
  flujo administrativo aprobado, con MFA/AAL2, autorización en servidor y cuotas.
- Los empleados no tienen una opción visible de cambio de contraseña.
- Se conserva Supabase Auth nativo. Un empleado autenticado puede cambiar su
  propia contraseña mediante la API directa: el propietario acepta expresamente
  este riesgo residual. Ocultar el control no impide esa llamada.
- No se incorpora otro proveedor, proxy o trigger ni controles adicionales
  exclusivamente para impedir ese cambio. Se conservan RLS, roles de DB,
  mínimo privilegio, MFA administrativo, mantenimiento y controles antiabuso.
- La entrega inicial/reset sigue siendo privada, sin conservar ni registrar
  contraseñas. El reset no garantiza revocación inmediata de access tokens.

Consecuencia aceptada: la contraseña vigente puede dejar de ser la asignada por
el administrador; el autoservicio directo no pasa por la auditoría de negocio
de `admin-users`. La capacidad de cambiar la credencial propia no concede rol
administrativo ni modifica `empleados.id` o los permisos RLS. El acceso seguirá
dependiendo de identidad vinculada, estado activo y, para admin, AAL2.

Las sondas aprobadas de 10 y 13 comprobaciones continúan siendo evidencia
válida del comportamiento nativo. Se retira el gate de demostrar denegación
universal del cambio propio: no se afirma haber implementado esa denegación.
Las alternativas de arquitectura quedan como investigación histórica, sin
implementación pendiente por esta causa. Reviewer revisa esta sustitución.

## Autorización de despliegue y límites

Actualización posterior: `stage-04-manual-backup-and-color-authorization.md`
registra autorización de respaldo manual cifrado y de color como operación
independiente posterior a validar Auth. Sustituye únicamente esas exclusiones
de alcance del registro original siguiente; los demás gates siguen vigentes.

El propietario autoriza preparar y ejecutar Auth, RLS, seguridad, cuentas,
Edge y frontend compatibles en el proyecto real, únicamente si se satisfacen
los prerrequisitos del runbook. No se requiere repetir esa autorización general,
pero tampoco permite omitir backup completo verificable, recuperación viable,
identificación del destino, configuración segura, vínculo e integridad,
credenciales del primer admin y mantenimiento efectivo.

No autoriza `rutinas.color`, push ni Etapa 5. No se improvisan reparaciones
destructivas. Credenciales sólo mediante canales seguros, sin logs ni Git.
No se consultan valores de PIN. El backup legacy completo requiere la custodia
y receta del proveedor prevista en el runbook, sin inspeccionar esos valores.

El acceso remoto, la existencia del backup y las configuraciones no se dan por
verificados por esta decisión. Resultado de la ejecución condicional en
`../reviews/stage-04-deployment-attempt-2026-10-18.md`. La aceptación de este
riesgo no acepta fallas de RLS, MFA, recuperación, antiabuso o integridad ni
convierte objetivos RPO/RTO todavía no medidos en garantías.
