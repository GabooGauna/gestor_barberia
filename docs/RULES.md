# Reglas de trabajo y seguridad

## Alcance y fuentes

- Trabajar una etapa a la vez y respetar su stage y workflow.
- Basar decisiones en código, esquema y evidencia; distinguir hechos, inferencias y pendientes.
- Mantener contexto actual en `PROJECT_CONTEXT`, producto en `PRD`, reglas aquí y alcance en cada stage.
- No modificar lógica funcional durante una etapa exclusivamente documental.

## Supabase y datos

- El remoto es de solo lectura hasta autorización expresa diferente.
- No ejecutar migraciones, DDL, escrituras de prueba ni borrados sobre datos reales.
- Futuras migraciones deben ser versionadas, revisadas, probadas en local/staging y acompañadas por recuperación cuando sea viable.
- RLS debe cubrir toda tabla expuesta; probar permitido y denegado por política.
- Aplicar mínimo privilegio a `anon`, `authenticated` y roles adicionales.
- Nunca usar `service_role` en frontend o variables `VITE_*`.
- Evitar `select("*")`; pedir columnas mínimas.
- No leer, copiar, mostrar ni registrar PIN, contraseñas, tokens o claves reales.
- No persistir secretos ni perfiles completos en storage del navegador.
- Revisar cascadas y retención antes de toda operación destructiva.

## Autenticación y autorización

- La identidad debe venir de una sesión verificable de Supabase Auth.
- El rol de UI nunca reemplaza autorización en RLS/backend.
- Route guards mejoran UX, pero no son el control definitivo.
- No usar PIN de cuatro dígitos como autenticación productiva.
- Documentar alta, baja, recuperación, expiración, revocación y cambio de rol antes de implementar Auth.

## Código

- Controlar carga, error, vacío, éxito y permiso denegado.
- No ignorar errores de mutación; confirmar después de respuesta válida o aplicar rollback explícito.
- Tratar fecha/zona horaria como negocio; evitar derivar día local desde UTC accidental.
- Usar semántica, teclado, foco visible y etiquetas accesibles.
- Respetar movimiento reducido y contraste en ambos temas.
- No sumar dependencias sin necesidad y justificación.

## Pruebas

- Antes del cierre ejecutar `npm run lint` y `npm run build`.
- Desde Etapa 2, ejecutar Playwright al finalizar implementaciones funcionales.
- E2E usa datos locales/aislados, no datos remotos reales.
- Seguridad requiere pruebas negativas: usuario ajeno, rol insuficiente, sesión ausente/expirada y request manipulado.
- Registrar comando, entorno, resultado y omisiones.
- Fallas fuera de alcance se documentan, no se corrigen automáticamente.

## Git y operaciones

- Preservar cambios del usuario y revisar `git status` antes/después.
- No hacer push, merge, release ni deploy sin autorización.
- No cambiar configuración global de Git por ownership; usar opciones por comando o pedir decisión.
- No incluir `.env.local`, claves ni datos sensibles.
- No cerrar etapa sin Tester y Reviewer según `AGENTS.md`.

## Condición no negociable

La aplicación no puede considerarse apta para producción hasta corregir y verificar autenticación, autorización y exposición de datos: Supabase Auth, RLS/políticas probadas, privilegios reducidos, secretos fuera del cliente y seguridad frente a manipulación del navegador.
