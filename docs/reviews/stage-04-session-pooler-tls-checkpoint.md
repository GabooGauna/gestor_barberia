# Etapa 4 — Credencial importada y checkpoint TLS

Fecha: 18 de octubre de 2026. Estado: **detenido antes de autenticar y de extraer
datos**. La credencial fue guardada por el propietario e importada correctamente;
falta un certificado CA de origen confiable para reintentar validación TLS.
La autorización condicional de despliegue y color posterior a Auth sigue vigente.

## Hechos comprobados

1. Ejecución bajo el usuario Windows autorizado fuera de AppContainer: importación
   DPAPI correcta, ACL del archivo/directorio verificadas y SecureString presente,
   sin mostrar contraseña. Metadatos: proyecto `ucmwykzrepmjucssjnum`, usuario
   contractual, host `aws-0-sa-east-1.pooler.supabase.com`, puerto 5432, base
   `postgres`, `SslMode=verify-full`. La importación no prueba la contraseña DB.
2. Docker 29.8.2 disponible; imagen local
   `postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`
   identificada. No se descargaron binarios arbitrarios ni se ejecutaron dumps.
3. Intento psql de lectura con esa imagen, filesystem read-only, usuario postgres,
   sin capacidades y sin privilegios nuevos; conexión `verify-full`,
   `sslrootcert=system`, timeout 15 s. La contraseña se pasó al prompt por stdin
   mediante ProcessStartInfo, sin TTY, secretos en argumentos ni variables del
   contenedor. stdout/stderr se capturaron sin imprimir diagnósticos crudos.
   Resultado: psql exit 2, categoría `tls_certificate_validation`; ninguna consulta
   de negocio pudo ejecutarse. El resultado NO demuestra contraseña incorrecta.
4. Diagnóstico separado sin contraseña: TCP + PostgreSQL SSLRequest + SslStream
   con validación normal de Windows y hostname exacto. La autenticación TLS
   tampoco se validó (MethodInvocationException). No se omitió verificación
   mediante callback ni se enviaron credenciales o consultas en ese diagnóstico.
5. Certificado CA no encontrado en las tres ubicaciones explícitas comprobadas:
   Downloads/prod-ca-2021.crt, Downloads/prod-supabase.cer y
   LocalAppData/GestorBarberia/certs/prod-ca-2021.crt. No se afirma que no exista
   en otra ubicación ni que disponer del archivo garantice por sí solo el éxito.

No se confunde este bloqueo de TLS de Session pooler con los 403 históricos de
Management API o la disponibilidad de SQL MCP. No se repitieron auditorías ni
pruebas locales aprobadas. No se usaron valores PIN ni filas de Auth.

## Próxima intervención manual exacta

El titular debe abrir el Dashboard de **GNS Hair Studio**, proyecto
`ucmwykzrepmjucssjnum`, ir a **Database → Settings → SSL Configuration** y
descargar el **Server root certificate / CA certificate**. La etiqueta/ubicación
visual puede variar; buscar SSL Configuration dentro de Database Settings.

Guardar el certificado público, normalmente `prod-ca-2021.crt`, como:

```text
C:\Users\gauna\AppData\Local\GestorBarberia\certs\prod-ca-2021.crt
```

La carpeta `certs` ya fue preparada localmente por el agente fuera de AppContainer,
con las mismas ACL nominales usuario+SYSTEM verificadas. No contiene todavía el
certificado; no se instalaron CAs globales ni se alteró la credencial guardada.

No instalarlo globalmente en Windows, no exportar claves privadas, no mover la
credencial CLIXML ni volver a introducir la contraseña. No sustituir la CA por
un certificado capturado de la conexión no verificada, por una copia de terceros
o por contenido encontrado sin origen acreditado. No modificar SSL enforcement
remoto (puede provocar reinicio y no resuelve este trust del cliente).

Después comunicar sólo «Certificado guardado» y, si cambia, su ruta y procedencia.
El certificado CA es público; nunca se pide una clave privada o contraseña en chat.
El agente deberá comprobar formato, CA, vigencia, fingerprint, ausencia de clave
privada y procedencia, montarlo de sólo lectura en el cliente y repetir
`verify-full` con hostname. Un fallo posterior se diagnostica sin degradar TLS.

Fuentes primarias consultadas:
[Supabase: conectar con psql](https://supabase.com/docs/guides/database/psql),
[Supabase: SSL enforcement y modos de verificación](https://supabase.com/docs/guides/platform/ssl-enforcement).
Ambas indican descargar la CA desde el Dashboard y configurar el cliente para
usarla con `verify-full`; no se asume confianza del sistema suficiente.

## Trabajo conservado y gates posteriores

Backend prepara como candidato, sin ejecución real, el pipeline cifrado de
respaldo. No equivale a un respaldo existente ni autoriza saltar revisión antes
de manejar datos reales. Seguirá pendiente: snapshot DB y roles/permisos cifrados
fuera del repo, clave recuperable bajo custodia, integridad y restore aislado,
inventario de componentes externos de Supabase, configuración Auth/Edge, primer
admin/custodios/canal, mantenimiento y suspensión de escritores para RPO 0.
Un dump preliminar sin freeze no certifica RPO 0 de corte.

Backup real: **no creado**. Restauración: **no ejecutada**. Migraciones aplicadas:
**ninguna**. Sin cambios de configuración, cuentas, Edge, frontend o mantenimiento
remotos. Color **no aplicado**, flag **sin activar**; condicionado a verificar
primero Auth/RLS/seguridad. No push, `db push` indiscriminado ni Etapa 5.

Revisión independiente de la parada: `stage-04-session-pooler-tls-review.md`.
