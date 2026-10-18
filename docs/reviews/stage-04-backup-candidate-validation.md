# Etapa 4 — Validación focal del capturador cifrado

Fecha: 18 de octubre de 2026. No sustituye auditorías ni suites aprobadas.
Se valida sólo el pipeline operacional nuevo antes de capturar datos reales.

## Conexión y certificado

El titular confirmó el guardado de la CA siguiendo instrucciones de descarga
desde el Dashboard. Certificado público PEM, sin clave privada, CA=true,
Supabase Root 2021 CA, vigencia 2021-04-28 a 2031-04-26. SHA-256 del archivo:
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
El hash identifica el archivo; no sustituye su procedencia confiable.

La lectura autenticada real mediante Session pooler y CA montada read-only pasó
con `sslmode=verify-full`. PostgreSQL 17.6, rol postgres y transacción read-only.
Conteos observados: empleados 2, rutinas 5, tareas 53, asignaciones 3, auditorías
45, urgencias 4. Esquemas: auth, extensions, graphql, graphql_public, public,
realtime, storage y vault; private ausente. Extensiones instaladas: plpgsql 1.0,
pg_stat_statements 1.11, uuid-ossp 1.1, pgcrypto 1.3, supabase_vault 0.3.1.

`pg_stat_ssl.ssl=false` informa el tramo pooler→PostgreSQL. No contradice la
validación TLS cliente→pooler ni certifica cifrado extremo a extremo. La política
y controles de ese tramo gestionado requieren revisión antes de atribuir
garantías de producción; no bloquea por sí solo la captura preparatoria aprobada.
Ninguna de estas consultas devolvió filas de negocio, PIN, hashes o tokens Auth.

## Correcciones exigidas por Reviewer y comprobaciones nuevas

- Añadido `--log-driver none` a lectores de dump/roles: el stdout de pg_dump
  no debe persistir en logs del daemon antes del cifrado del host.
- Guard local antes de enviar el secreto: rechaza overrides DOCKER_HOST y
  DOCKER_CONTEXT; admite sólo named pipes locales identificadas y fija --host
  en lectura/cleanup. No enviar datos a un daemon remoto.
- Manejo UTF-16 del BSTR preserva unidades mayores a 32767 antes de escribir el
  prompt; no se inspecciona ni se imprime la contraseña real para probarlo.

Backend informó AST en Windows PowerShell 5.1 y PowerShell 7.6.5; puente
ProcessStartInfo↔Node sintético y, por separado, ensayo crypto Node con 128 KiB
y roundtrip AES-256-GCM; nonce nuevo;
alteración de cabecera/nonce/tag/ciphertext, clave incorrecta y truncamiento
rechazados sin emitir plaintext. También mocks de endpoint tcp/ssh/unix
rechazados, npipe aceptado, ambos overrides denegados, y BSTR sintético con
U+E123 y par de sustitutos. Sin importación del almacén real ni consultas DB
por Backend. Evidencia entregada por herramientas/handoff en este chat; no es
una nueva suite persistida de aplicación ni E2E del wrapper completo con datos
reales. No se repiten las validaciones anteriores de Auth/RLS/MFA.

Orquestador/Tester ejecutó después de los fixes: parseo AST del capturador
sin errores; extracción de funciones ConvertTo-ProcessArgument,
Invoke-BinaryProcess y Get-VerifiedLocalDockerEndpoint sin ejecutar el cuerpo;
guard real devuelve `npipe:////./pipe/dockerDesktopLinuxEngine`; override de
proceso DOCKER_HOST=tcp://untrusted.invalid:2375 denegado y restaurado en finally.
Exit 0, sin importar credenciales ni iniciar backup. Ese guard se puede repetir
extrayendo sólo esas funciones mediante Parser.ParseFile, nunca dot-sourcing
el cuerpo del capturador para probar un guard.

## Límites del gate

La revisión independiente en `stage-04-backup-pipeline-review.md` permite sólo
captura preparatoria autorizada tras resolver esos hallazgos. Dump custom de
toda la base en una snapshot; roles separados sin contraseñas de rol, sin
atomicidad conjunta con el dump. No se promete RPO 0 sin freeze. Clave de
cifrado envuelta en DPAPI en archivo separado: custodia portable/independiente
todavía pendiente. Inventariar y verificar propiedades/permisos DATABASE en
restore; no cambiar --create a ciegas. El manifiesto mantiene restore integral,
RTO, RPO 0 y recuperación de toda Supabase sin verificar.

El candidato de restauración aislada se revisa aparte antes de ejecutarlo.
Ninguna aprobación de captura permite escribir en producción ni omitir gates.
