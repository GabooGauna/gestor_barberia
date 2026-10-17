# Pruebas E2E

## Aislamiento de Supabase

Playwright inicia Vite con `VITE_SUPABASE_URL=http://127.0.0.1:54321` y una
clave sintética. El fixture `supabase-mock.js` intercepta Auth, PostgREST, RPC
y la Edge Function `admin-users`; responde con usuarios, JWT expirables y
datos exclusivamente sintéticos en memoria.

Hay tres barreras contra datos reales:

1. el proceso de Vite recibe variables de entorno de prueba que prevalecen
   sobre `.env.local`;
2. toda URL cuyo host termina en `.supabase.co` se aborta;
3. el fixture falla la prueba si detecta un intento hacia ese host.

Las escrituras de tabla se bloquean por defecto y se registran en
`supabaseMock.mutations`. Auth, RPC y operaciones administrativas tienen
trazas separadas en `authRequests`, `rpcCalls` y `adminActions`. Un test puede
habilitar escrituras de tabla con
`allowMutationsFor` para simular `POST`, `PATCH` o `DELETE` exclusivamente en
memoria. `delayTable` permite observar estados de carga sin contactar servicios
externos. Ninguna de estas capacidades relaja el bloqueo de hosts remotos.

## Sesiones de prueba

`seedAuthSession` registra un perfil sintético vinculado a un `auth.users`
sintético y persiste el formato de sesión de Supabase. Puede emitir un access
token vencido para probar el rechazo del refresh. `loginThroughUi` recorre el
login real de la SPA. No existe ningún helper para `usuarioBarberia` y las
pruebas negativas verifican que manipular esa clave no otorga identidad ni rol.

Este mock valida contratos de interfaz, estados y requests; no prueba la
seguridad efectiva de RLS ni de la service role. El gate de seguridad se apoya
además en las pruebas SQL y Auth/Edge ejecutadas contra el Supabase local
aislado, documentadas en `docs/reviews/stage-04-validation.md` y auditadas en
`docs/reviews/stage-04-final-review.md`.

## Comandos

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
npm run test:e2e:report
```

Chromium es el único proyecto configurado en esta etapa. Capturas, video y
trazas se conservan ante fallas en `test-results/`; el reporte HTML se escribe
en `playwright-report/`. Ambos directorios están ignorados por Git.

La suite levanta dos builds locales aislados:

- `chromium` en `127.0.0.1:4173`, con `VITE_ENABLE_RUTINAS_COLOR=false`;
- `chromium-routine-colors` en `127.0.0.1:4174`, con la capacidad en `true`.

El segundo proyecto solo ejecuta `routine-colors-enabled.spec.js`. Esto prueba
el contrato futuro sin asumir que la migración exista en Supabase remoto.

## Cobertura funcional y visual de Etapa 4

`login.spec.js` cubre login correcto/incorrecto, username inválido, sesión
expirada, acceso directo sin sesión y manipulación del rol legacy.
`account-management.spec.js` cubre alta, validación y reset de contraseña,
activación/desactivación, cambio de rol, preservación del perfil y ausencia de
controles administrativos para empleados.
El diálogo de reset tiene una prueba adicional de contención de foco,
Tab/Shift+Tab, Escape, devolución de foco, descarte de contraseña y Axe con
ambos temas en 375, 768 y 1440 px.

`visual-accessibility.spec.js` valida el selector visual
claro/oscuro/sistema, su persistencia, la aplicación previa a la primera
pintura, la resolución de la preferencia del sistema y el respeto de
`prefers-reduced-motion`. También recorre Login, panel empleado y las cinco
vistas administrativas en 375, 768 y 1440 px para ambos temas, con datos vacíos
y poblados. Comprueba navegación, foco de teclado, estados hover/active/
disabled/loading, ausencia de desbordamiento horizontal y violaciones Axe
críticas o serias; Auditoría se verifica poblada y expandida.

Cada combinación de tema, breakpoint y pantalla adjunta una captura de página
completa al resultado de Playwright (84 capturas en total). Los selectores se
apoyan en roles, nombres accesibles, `aria-current` y atributos de tema; no
dependen de clases CSS ni de detalles de Tailwind.

`branding-menu.spec.js` cubre logo, texto alternativo, proporciones, título de
pestaña, centrado móvil, menú de acciones, Escape, retorno de foco y logout de
Supabase Auth.
Los specs `routine-colors-disabled` y `routine-colors-enabled` prueban el
fallback `copper`, la ausencia de referencias a una columna inexistente y los
payloads semánticos de alta/edición/restauración cuando la capacidad está
habilitada.
