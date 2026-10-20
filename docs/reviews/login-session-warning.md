# Login: advertencia de sesión vencida

Fecha: 20 de octubre de 2026. Seguimiento acotado de Etapa 6 solicitado por el
propietario, con prueba puntual, lint, build, commit y push autorizados.

## Orquestador / Backend → Frontend

El listener de `AuthContext` trataba cualquier evento sin sesión como caducidad,
incluido `INITIAL_SESSION` nulo en una visita anónima. No hay discrepancia del
contrato de Auth ni se necesita modificar backend, RLS, MFA, credenciales,
permisos o configuración. Se corrige exclusivamente la clasificación del aviso.

`SIGNED_OUT` involuntario conserva el mensaje existente. El cierre voluntario
conserva su supresión y un `INITIAL_SESSION` no consume esa marca. No se agrega
storage ni se inspeccionan tokens reales. `Login.jsx` fue revisado: muestra
`errorMessage || sessionIssue` y no inventa una caducidad; no requiere cambios.

Archivos: `src/context/AuthContext.jsx`, `tests/e2e/login.spec.js`,
`tests/e2e/branding-menu.spec.js` y documentación de este seguimiento.

## Tester → Reviewer

- Reproducción previa: nuevo caso de primera visita falla al encontrar una
  alerta cuando debía haber cero.
- Validación final: 12/12 E2E PASS, Chromium, un worker, sin reintentos.
  Cubre primera visita, recarga anónima, acceso directo sin sesión, login
  correcto/incorrecto, username inválido, refresh vencido con mensaje exacto,
  rol legacy manipulado, Axe y logout en móvil/escritorio, además de recarga
  tras logout iniciado por la UI.
- La primera ampliación de los tests de menú falló sólo al recargar porque
  `seedAuthSession` usa un init script que vuelve a insertar la sesión. Se
  trasladó esa comprobación a un login por UI, sin modificar el fixture.
- `npm run lint`: PASS. `npm run build`: PASS, sin warning de tamaño;
  JS inicial 488,33 kB minificado / 142,06 kB gzip.

Comando E2E ejecutado:

```powershell
npm run test:e2e -- --config=playwright.login-local.config.js --project=chromium --workers=1 --retries=0 tests/e2e/login.spec.js tests/e2e/branding-menu.spec.js
```

El arranque en 4173 agotó el timeout; la comprobación HTTP no respondió allí.
Se ejecutó fuera del sandbox de red con una configuración temporal que importa
`playwright.config.js`, reemplaza 4173/4174 por 4273/4274 en comandos, URLs y
baseURL de proyectos, y fija `reuseExistingServer: false`. No cambia las demás
opciones ni se conserva ese archivo en Git. Para reproducir en puertos libres
estándar, omitir `--config=playwright.login-local.config.js` del comando anterior.
Supabase simulado en 127.0.0.1:54321, clave sintética y bloqueo de hosts remotos
del fixture conservados. Ninguna prueba usó cuentas o datos reales.

No se repite la suite completa ni los drills Auth/RLS históricos: el alcance
solicitado es esta regresión puntual. No se declara cierre de otra etapa.
Próximo rol: Reviewer independiente; luego Orquestador para commit/push de
estos archivos, excluyendo `.codex/config.toml` y `.env.example` del propietario.

## Reviewer independiente → Orquestador

Dictamen: **APROBADO** para este seguimiento puntual. Sin hallazgos
bloqueantes, altos, medios o bajos introducidos por el cambio revisado.

Se leyeron las fuentes de verdad en su orden y se revisaron el diff de los
cinco archivos del seguimiento, `Login.jsx`, el guard de ruta y el contrato del
SDK instalado. `INITIAL_SESSION` nulo ya no genera una falsa caducidad ni
consume la marca de cierre voluntario. El SDK conserva `SIGNED_OUT` al
descartar una sesión persistida inválida; el caso de refresh rechazado exige
el mensaje exacto. La primera visita y la recarga sin sesión, el acceso directo
anónimo y los cierres voluntarios tienen comprobaciones negativas de alertas.

La clasificación visual es el único comportamiento de producción modificado:
autenticación, carga del perfil, MFA, guards, permisos y operaciones de Supabase
permanecen intactos. Se acepta la evidencia del Tester (12/12 E2E, lint y build
PASS) sin repetir pruebas ni operaciones remotas. La limitación de cobertura y
el cambio temporal de puertos están explícitos y no se presentan como una
regresión completa de toda la aplicación.

Próxima acción: Orquestador verifica el diff final, crea el commit y hace el
push expresamente solicitado, conservando fuera los cambios del propietario.
Este dictamen no declara el cierre de otra etapa ni verifica un despliegue.
