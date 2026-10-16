# Pruebas E2E

## Aislamiento de Supabase

Playwright inicia Vite con `VITE_SUPABASE_URL=http://127.0.0.1:54321` y una
clave sintética. El fixture `supabase-mock.js` intercepta PostgREST y responde
con datos en memoria.

Hay tres barreras contra datos reales:

1. el proceso de Vite recibe variables de entorno de prueba que prevalecen
   sobre `.env.local`;
2. toda URL cuyo host termina en `.supabase.co` se aborta;
3. el fixture falla la prueba si detecta un intento hacia ese host.

Las escrituras se bloquean por defecto en el mock y se registran en
`supabaseMock.mutations`. Un test puede habilitarlas por tabla con
`allowMutationsFor` para simular `POST`, `PATCH` o `DELETE` exclusivamente en
memoria. `delayTable` permite observar estados de carga sin contactar servicios
externos. Ninguna de estas capacidades relaja el bloqueo de hosts remotos.

## Sesión transitoria

`seedLegacySession` existe solo para alcanzar los paneles del prototipo actual.
No valida el PIN ni convierte `localStorage` en contrato de autenticación. Debe
eliminarse cuando la Etapa 4 implemente Supabase Auth.

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

## Cobertura visual de Etapa 3

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
pestaña, centrado móvil, menú de acciones, Escape, retorno de foco y logout.
Los specs `routine-colors-disabled` y `routine-colors-enabled` prueban el
fallback `copper`, la ausencia de referencias a una columna inexistente y los
payloads semánticos de alta/edición/restauración cuando la capacidad está
habilitada.
