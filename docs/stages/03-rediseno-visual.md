# Etapa 03 — Rediseño visual completo

## Estado

**Cerrada el 16 de octubre de 2026.** Tester y Reviewer aprobaron el gate final.
Este cierre no habilita producción ni inicia automáticamente la Etapa 4.

## Objetivo

Crear una experiencia profesional, accesible y consistente con claro/oscuro sin alterar aún seguridad ni negocio.

## Dependencias

Etapa 2 aprobada, Playwright operativo y dirección visual/paletas autorizadas.

## Alcance

- Tokens para color, tipografía, espaciado, radios, sombras y movimiento.
- Temas claro/oscuro persistidos y compatibles con preferencia del sistema.
- Shell, navegación y jerarquía responsive para login, admin y empleado.
- Controles con estados visibles; animaciones sutiles y movimiento reducido.
- Estados vacío/carga/error/confirmación coherentes y accesibilidad por teclado/contraste.

## Fuera de alcance

Supabase Auth, RLS, políticas, cambios de negocio y rediseño funcional de auditoría.

## Criterios de aceptación

- Ambas paletas cubren pantallas sin colores incoherentes.
- Navegación y acciones primarias/destructivas son claras en desktop/móvil.
- Controles accesibles por teclado y `prefers-reduced-motion` respetado.
- No se amplían datos seleccionados ni persistencia insegura.
- Comparaciones visuales y E2E de flujos pasan.

## Validación y gate

Lint, build, Playwright y revisión manual en breakpoints, temas, teclado y contraste. Frontend documenta tokens; Tester adjunta evidencia; Reviewer aprueba UX/accesibilidad. No iniciar Etapa 4.

## Evidencia de cierre

- `npm run lint`: exitoso.
- `npm run build`: exitoso con advertencia no bloqueante del chunk principal de 519,50 kB.
- `npm run test:e2e`: 31/31 pruebas exitosas en Chromium.
- Axe: cero violaciones críticas o serias en los escenarios cubiertos de ambos temas.
- Playwright validó 375, 768 y 1440 px, estados vacíos y poblados, teclado,
  foco, hover, carga, movimiento reducido y la capacidad de color OFF/ON.
- Se inspeccionaron 84 adjuntos visuales. Dos adjuntos matriciales del Login
  poblado en móvil se serializaron incorrectamente por el harness; el gate los
  sustituyó por capturas aisladas y mediciones reproducibles que confirman logo
  136×102 px, proporción 4:3, `scrollY=0` y foco correcto en el PIN.
- El mock usó únicamente `127.0.0.1` y bloqueó cualquier intento hacia
  `*.supabase.co`.

La migración local de `rutinas.color` y su rollback quedaron preparados, pero
no se ejecutaron. La capacidad permanece deshabilitada por defecto hasta que
se pruebe y aplique la migración en un entorno autorizado.
