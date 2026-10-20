# Controles de Equipo y nav móvil — 20 de octubre de 2026

## Alcance y handoff

Seguimiento visual acotado de Etapa 5, solicitado por el propietario. Aunque
el mensaje menciona Asignaciones, la captura adjunta muestra Equipo y sus
acciones Cambiar contraseña/Desactivar: se toma esa evidencia visual como
referencia. Backend no aplica; sólo se modifica `src/index.css`.

Frontend alinea los controles al pie para evitar que los botones ocupen la
altura adicional de la etiqueta Rol, y usa el mismo padding vertical que el
selector. Conserva el mínimo táctil de 44 px. En móvil, el logo ocupa la columna
central de una grilla simétrica; al participar del flujo, el padding vertical
existente de la cabecera deja espacio arriba y abajo. El menú desplegado se
ancla debajo de la cabecera para acompañar su altura natural.

Se conserva paleta, tipografía, tamaño del logo, acciones y permisos. Sin
cambios de datos, Auth, Supabase o dependencias. No se declara cerrada Etapa 5.
El cambio previo de `.codex/config.toml` queda fuera del alcance.

Handoff Frontend → Tester: verificar lint/build y E2E existentes con mocks
locales, ambos temas y 375/768/1440 px; inspeccionar capturas de Equipo en
escritorio y nav móvil. Riesgos abiertos al implementar: alineación, centrado,
desbordamiento y posicionamiento del menú. Reviewer independiente después de
Tester, según AGENTS.md.

## Validación

- `npm run lint`: PASS.
- `npm run build`: PASS; persiste el aviso conocido de JS mayor que 500 kB.
- `node node_modules/@playwright/test/cli.js test --workers=2 --reporter=list`:
  PASS, 68/68 en 1,4 minutos. Chromium, mocks sintéticos locales en
  `127.0.0.1:54321`, Vite en 4173/4174; bloqueo de solicitudes Supabase remotas
  mediante el fixture existente. Incluye ambos temas, 375/768/1440 px,
  centrado del logo, menú, foco y Axe sin violaciones críticas/serias.
- El arranque inicial dentro del sandbox falló por loopback `EACCES`; un
  intento vía npm elevado también agotó el tiempo de arranque. El comando
  Node directo elevado completó la suite anterior. No se relajaron pruebas.
- Capturas: reejecución secuencial de los casos `valida todas las pantallas
  en light, (mobile|desktop)` con `--workers=1` y reporter local: PASS, 2/2
  en 15,4 segundos. Una captura previa en paralelo presentó recargas de la
  página durante la navegación; no se atribuyen al CSS ni se omiten del registro.
  La suite completa anterior y la repetición secuencial pasaron sin cambios
  del producto o de las aserciones.
- Inspección con `view_image`: Equipo poblado claro a 1440 px y empleado
  poblado claro a 375 px aprobados. Botones compactos de la misma altura que
  el selector, logo centrado con aire vertical. Capturas conservadas en
  `.tmp-stage4-local/control-sizing-mobile-nav/`, ignoradas por Git.

Tester aprueba la intervención acotada. Handoff a Reviewer tras la inspección
visual: revisar diff CSS, capturas y alcance; sin riesgos funcionales abiertos
detectados por la suite. No hay operaciones remotas de datos o publicación.

## Reviewer y cierre acotado

Reviewer independiente aprueba después de Tester: inspeccionó diff y capturas
de escritorio/móvil. Sin hallazgos bloqueantes, altos, medios o bajos.
Confirma alcance CSS/documentación, mínimo táctil conservado y menú anclado
a la altura real del nav. Acepta evidencia 68/68 y 2/2 conservando el límite
de las recargas observadas durante la captura paralela.

Orquestador verifica `git diff --check` PASS. Seguimiento visual local aprobado;
Etapa 5 general continúa abierta. El propietario autoriza posteriormente commit
y push a GitHub para activar Vercel. Se incluyen sólo el CSS y los tres
documentos de esta intervención. Sin operaciones de Supabase;
`.codex/config.toml` permanece fuera del commit.
