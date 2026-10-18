# Revisión independiente del checkpoint TLS — Etapa 4

Fecha: 18 de octubre de 2026. Dictamen: **APROBADOS la parada en TLS y el
próximo paso documentado de obtener la CA oficial**. No se certifica conexión
PostgreSQL autenticada, backup, restauración ni despliegue. La autorización
condicional recibida sigue vigente; no hace falta volver a solicitarla.

## Alcance y evidencia revisada

Reviewer independiente del Orquestador. Se revisaron
`stage-04-session-pooler-tls-checkpoint.md` y las actualizaciones de contexto,
`../runbooks/stage-04-secure-db-input.md` y
`../decisions/stage-04-manual-backup-and-color-authorization.md`.
Orquestador entregó diff-check exit 0 y los resultados de importación/diagnóstico
descritos abajo. Reviewer no repitió pruebas, importó secretos ni realizó
conexiones remotas. El pipeline de respaldo candidato queda fuera de esta
revisión: no está aprobado por este dictamen.

## Conclusión

La importación real DPAPI y verificación de ACL bajo el usuario autorizado
demuestran disponibilidad local del almacén y de sus metadatos; no demuestran
contraseña DB correcta, identidad remota autenticada o privilegios. El informe
mantiene esa distinción y no solicita volver a compartir/capturar el secreto.

El intento psql con verify-full y raíces del sistema terminó en exit 2,
categoría de validación de certificado, antes de consultas. El diagnóstico
Windows STARTTLS/SslStream sin contraseña tampoco estableció TLS verificado.
Es correcto detenerse: no se interpreta el fallo como contraseña incorrecta
ni se omiten verificaciones de certificado/hostname para continuar.

Las tres ubicaciones comprobadas sin CA no constituyen una búsqueda global.
No se promete que obtener un archivo elimine todos los posibles errores de
TLS. Los 403 anteriores de Management API y el SQL MCP disponible son rutas
distintas; no se les atribuye este fallo de Session pooler.

## Próximo paso y controles conservados

Es adecuado pedir al titular la CA pública descargada desde la configuración
SSL del proyecto en el Dashboard oficial, guardada fuera del repositorio. No
se pide clave privada, contraseña, URI con secreto o contenido de CLIXML.
El certificado capturado de un servidor todavía no verificado no se adopta
como raíz de confianza; tampoco se instala globalmente ni se cambia SSL
enforcement remoto para resolver un problema de confianza del cliente.

Antes de reintentar se deben comprobar procedencia, formato CA, vigencia,
fingerprint y ausencia de clave privada; montar el archivo sólo lectura y
verificar cadena y hostname con verify-full. El fingerprint registra identidad
e integridad, pero no reemplaza procedencia confiable. Ante otro fallo,
diagnosticar sin downgrade a require/disable ni callbacks permisivos.

No se detectan hallazgos bloqueantes/altos nuevos en la documentación o la
decisión de parada. Sigue pendiente este gate de TLS y después la validación
de autenticación/conexión de lectura. El backup debe contar con revisión del
pipeline antes de datos reales, cifrado y clave recuperable, restauración
aislada e inventario de componentes externos. Configuración Auth, antiabuso,
custodia/primer admin, contención de todos los escritores y RPO/RTO siguen
siendo requisitos independientes.

Handoff al Orquestador: entregar el paso manual de CA ya documentado y conservar
la credencial existente sin exponerla. Reanudar únicamente tras validar el
canal TLS y los siguientes checkpoints. No hubo captura/restauración ni
migraciones o despliegues por este checkpoint. Color permanece sin aplicar y
OFF hasta validar primero Auth/RLS/seguridad; sigue autorizado como operación
posterior independiente. No hay producción habilitada, push o Etapa 5.
