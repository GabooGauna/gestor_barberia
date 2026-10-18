# Revisión independiente del capturador cifrado — Etapa 4

Fecha: 18 de octubre de 2026. Dictamen: **APROBADA únicamente la captura
preparatoria real autorizada**, con la versión corregida de
`scripts/stage04-encrypted-backup.ps1` y `scripts/stage04-backup-crypto.mjs`.
No aprueba restauración, migraciones, apertura de servicio ni recuperación
integral de Supabase. No declara que el backup real ya exista.

## Alcance y evidencia

Reviewer independiente de Backend y Orquestador. Se revisaron ambos scripts
completos, las funciones del capturador de credenciales que reutilizan, el
alcance de backup opaco autorizado y `stage-04-backup-candidate-validation.md`.
No se importó la credencial, ejecutaron conexiones o capturas por Reviewer,
ni se repitieron pruebas anteriores.

Backend entregó AST Windows PowerShell 5.1/7.6.5, puente binario sintético
ProcessStartInfo↔Node y pruebas AES-GCM con nonce distinto, alteraciones, clave
incorrecta y truncamiento sin plaintext de salida. El foco Node incluye
128 KiB sintéticos; no se infiere ese tamaño para todos los focos del puente.
También entregó guard de endpoints/overrides y conversión UTF-16 sintética.
Orquestador/Tester entregó AST posterior a correcciones y guard real sobre
named pipe local; DOCKER_HOST remoto rechazado y restaurado, exit 0. No son
una ejecución integral con datos reales ni otra suite Auth/RLS/E2E.

## Hallazgos altos resueltos antes de datos reales

1. El candidato inicial permitía logging del daemon sobre stdout del dump:
   podía persistir datos sin cifrar antes de AES. Todos los lectores incluyen
   ahora `--log-driver none`. No se había ejecutado ningún dump real con la
   versión observada.
2. Faltaba impedir un daemon Docker remoto. Ahora se rechazan DOCKER_HOST y
   DOCKER_CONTEXT, se admite sólo named pipe local explícita y se fija `--host`
   en lectura y cleanup. La comprobación ocurre antes de enviar el secreto
   a procesos Docker; el cambio posterior de contexto no redirige esos comandos.

Se revisó el código final y la evidencia focal posterior. No quedan hallazgos
bloqueantes/altos nuevos abiertos para esta captura preparatoria.

## Controles examinados

Credencial/ACL/proyecto/puerto y host validados; contraseña sólo por stdin,
sin URI secreta, argumentos o entorno de contenedor. BSTR y arrays temporales
se limpian; diagnósticos crudos no se imprimen. El cliente usa imagen fijada
por digest, CA montada sólo lectura y verify-full, sin fallback. Contenedores
lectores sin capacidades, sin privilegios nuevos, filesystem sólo lectura y
temporales tmpfs; el daemon local es parte de la confianza del custodio.

El dump custom único obtiene snapshot de objetos/datos de toda la base, sin
exclusiones o eliminación de ACL/owners como fallback. Roles se exportan aparte
sin contraseñas de rol: no comparten snapshot con el dump. Fallos de permisos
detienen la captura; no se reduce silenciosamente la cobertura.

Los bytes sensibles se procesan en memoria, no en archivos intermedios del
pipeline. Node consume stdin completo antes de emitir el resultado; el wrapper
drena stderr en paralelo y después stdout, con límites de salida/tiempo. No se
identificó un ciclo de espera entre esos streams en el protocolo revisado.
AES-256-GCM usa clave aleatoria y nonce por artefacto; cabecera autenticada.
La rama decrypt no emite plaintext antes de autenticar, pero su uso en una
restauración sigue requiriendo revisión separada.

Se almacenan ciphertext, manifiesto y clave envuelta DPAPI en paths separados
fuera del repositorio/OneDrive, con ACL del titular/SYSTEM y negativa a
sobrescribir. La aplicación no crea dumps en claro; no se promete eliminar
copias que puedan mantener mecanismos privilegiados del sistema operativo.
Un fallo deja artefactos cifrados incompletos, no un manifiesto exitoso;
cleanup sólo apunta al lector descartable con nombre propio de este intento.

## Límites obligatorios y handoff

Orquestador informó TLS cliente→Session pooler y lectura autenticada/read-only
correctos con CA oficial. El `ssl=false` observado en el backend describe el
tramo pooler→PostgreSQL: no invalida ese TLS de cliente ni demuestra cifrado
extremo a extremo. La captura preparatoria se admite por la ruta gestionada
autorizada; las garantías del tramo interno no quedan certificadas para producción.

El manifiesto mantiene freeze, RPO 0, retención aplicada, restore, recuperación
integral y RTO sin verificar. La clave DPAPI exige usuario/equipo: falta custodia
independiente/portable. Roles, propiedades/ACL/settings DATABASE y mapping de
objetos protegidos deben verificarse en recuperación. No se considera defecto
la ausencia de --create al capturar custom: esa decisión corresponde al restore.

Después de capturar, verificar archivos/manifest e integridad/autenticación y
revisar el candidato de restauración antes de usar datos reales aislados.
Quedan componentes externos, claves/configuración Auth, Storage, Edge, custodia,
contención integral y validaciones del corte. Ni captura exitosa ni este dictamen
convierten esos gates en satisfechos. No hay permiso de escritura de despliegue
por esta aprobación focal; el alcance condicional del propietario sigue vigente.
Color sólo después de Auth validada, en operación aparte; sin push ni Etapa 5.
