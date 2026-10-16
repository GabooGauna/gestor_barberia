---
name: frontend-design
description: Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults.
license: Complete terms in LICENSE.txt
---

# Frontend Design

> Adapted for Gestor de Barbería from `anthropics/skills` through the
> `GabooGauna/gestor_petshop` reference at commit
> `cf60b80dd8a6eb7a0faad0315d18020e33679607`. This file has been modified;
> the bundled Apache License 2.0 remains unchanged.

Approach this as the design lead at a design studio known for giving every client a distinct visual identity that is not mistaken for anyone else's. This client has already rejected proposals that felt cliché or templated, and is paying for a distinctive point of view: make deliberate, opinionated choices about palette, typography, and layout that are specific to this brief, and take aesthetic risk if justified.

## Ground your designs in the subject matter

If the brief does not identify what the product or subject matter is, identify it yourself before designing, and confirm with the client. You can come up with one concrete subject, the design's audience, and the design's primary job, as a proposal. If there's any information in your memory about the client's preferences or context about what they're building, use that as a hint. The subject's industry, subject matter, materials, and vernacular are where distinctive visual choices come from — a design for a toy for girls aged 8–11 will be very aesthetically different from a dashboard for financial analysts. Build with the brief's real content and subject matter throughout.

## Design principles

For web designs, the hero is the first thing viewers will see. Open with the most characteristic thing in the subject's world, in the form that is most appropriate: a headline, an image, an animation, a live demo, an interactive moment, or other treatments. Be deliberate with your choice: a big number with a small label, supporting stats, and a gradient accent is the default treatment, so only use it if that's truly the best option.

Typography carries the personality of the page. You don't need a different typeface for display or headline text and body content: use one family or two, and if two, make them clearly distinct.

Choose your typefaces deliberately, not the default families you would reach for on any other project, and set a clear type scale following the default guidance of The Elements of Typographic Style with intentional weights, widths, and spacing. When type is used as a headline or visual element, use the type treatment itself as an active part of the design, not a neutral delivery vehicle for the content.

Default to line lengths of less than 80 characters. Serif typefaces can have slightly longer line lengths; give serif body text slightly more line-height than a sans-serif.

Avoid these default typographic treatments; they are the commonest tells of a generated page:
- Accenting just a single word or phrase in a headline, like putting one word in italic/bold or a different color.
- Using all caps for labels.
- Adding unnecessary typographic labels above content.

Visual structure is information. Structural devices like outlines, borders, numbering, eyebrows, dividers, labels, etc., encode useful information about the content rather than decorate it. Many generic designs use numbered markers (01 / 02 / 03), but that's only appropriate if the content actually is a sequence — like a stepped process or a timeline. Before adding numbered markers, check the content really is a sequence.

Use non-user-triggered motion sparingly and deliberately, only to draw attention. A single orchestrated moment — one page-load sequence or one reveal — lands better than scattered effects; fade-and-slide-up entrances on each section and hover transitions on every card are the generic default and read as AI-generated. Motion that answers a person's action (opening, expanding, confirming) is welcome when it shows what changed.

Consider written content carefully. Often a design brief may not contain real content, and it's up to you to come up with copy and placeholder content. Copy can make a design feel as templated as the design itself. See the below section on writing for more guidance.

## Process: plan, review against the brief, build, critique

For calibration, AI-generated design right now clusters around some traits:
1. a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta or warm-clay accent (often near #D97757 — Anthropic's own Claude-interaction accent, so on a user's brief it reads as a tell);
2. a near-black background with a single bright acid-green or vermilion accent;
3. a broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns;
4. the SaaS-card kit: content chopped into identical rounded cards, one border-radius on everything regardless of hierarchy, the same soft grey shadow (rgba(0,0,0,.1)) under each, and gradient washes as decoration;
5. template chrome that appears whatever the subject: a tracked-out ALL-CAPS eyebrow label above every heading; meta strings joined with middle dots ('A · B · C'); labels built as 'WORD — fragment' with a spaced em dash; tinted near-black (#0B0B0B, #111) standing in for black; a monospace face for small data labels; a '→' appended to link and button text.

All traits are legitimate for some briefs, but they are defaults rather than choices, and they appear regardless of subject. Where the brief pins down a visual direction, follow it exactly — the brief's own words always win, including when it asks for one of these looks. Where it leaves an axis free, don't spend that freedom on one of these defaults. As with a hired human designer, there's often a careful balance between doing what you're good at and taking each project as a chance to experiment and learn.

Work in two passes. First, brainstorm a short design plan based on the client's design brief: create a compact token system with color, type, layout, and principles.
- Color: describe the core base palette as 4–6 named hex values.
- Type: the typefaces and their roles.
- Layout: a layout concept, using one-sentence prose descriptions and ASCII wireframes to ideate and compare. Include alignment guidance; should the content be left aligned, center aligned, justified?
- Principles: the high-level guidance for what makes this page unique.

Then review that plan against the brief before building: if any part of it reads like the generic default you would produce for any similar page (work through a similar prompt to see if you arrive somewhere similar) rather than a choice made for this specific brief — revise that part, say what you changed and why. Only after you've confirmed the relative uniqueness of your design plan should you start to write the code, following the revised plan.

When writing the code, be careful of structuring your CSS selector specificities. It's easy to generate CSS classes that cancel each other out (especially with a type-based selector like .section and an element-based selector like .cta). This can happen often with padding/margin between sections.

## Restraint and self-critique

Spend your boldness in one place. Let one element be the memorable thing, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief. Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected, visually accessible, harmonious color palettes. Critique your own work as you build, taking screenshots to review if your environment supports it — a picture is worth 1000 tokens. Consider Chanel's advice: before leaving the house, take a look in the mirror and remove one accessory. Human creatives have memory and always try to do something new, so if you have a space to quickly jot down notes about what you've tried, it can help you in future passes.

## More on writing in design

Words appear in a design for one reason: to make it easier to understand and use. They are design content, not decoration. Bring the same intentionality and minimalism to copywriting that you would bring to spacing and color. Before writing anything, ask what the design needs to say, and how it can best be said to help the person navigate the experience.

Write from the end user's perspective. Name things by what users will understand in simple language, not by how the system is built. A user manages notifications, not webhook config. Describe what something is or does in plain terms rather than selling it. Being specific and legible to new users is always better than being clever.

Use active voice as default. A CTA says exactly what happens when it is used: "Save changes," not "Submit." An action keeps the same name through the whole flow, so the button that says "Publish" produces a toast that says "Published." The vocabulary of an interface is the signposting for someone navigating the product. Cohesion and consistency are how people learn their way around.

Treat failure and emptiness as moments for direction, not mood. Explain what went wrong and how to fix it, in the interface's voice rather than a person's. Errors don't apologize, and they are never vague about what happened. An empty screen is an invitation to act.

Keep the tone conversational: plain verbs, sentence case, no filler, with tone matched to the brand and the audience. Let each written element do exactly one job.

# Dirección visual — Gestor de Barbería

Esta sección prepara la Etapa 3; no autoriza implementar el rediseño durante
la Etapa 2. La interfaz debe sentirse como una herramienta operativa de una
barbería contemporánea: precisa, sobria, cálida y resistente al uso diario.
Evitar clichés literales de barber pole, tijeras decorativas repetidas, texturas
vintage artificiales o una estética de dashboard SaaS genérico.

## Paletas obligatorias

Definir tokens semánticos antes de escribir componentes. Los siguientes colores
son anclas, no clases dispersas en JSX:

| Token conceptual | Modo oscuro | Modo claro |
|---|---:|---:|
| Fondo de aplicación | `#111820` | `#F3F5F7` |
| Panel o superficie principal | `#202B36` | `#FFFFFF` |
| Navegación | `#111820` | `#253340` |
| Acento cobre | `#C99460` | `#B77A48` |
| Texto principal | `#F0F3F6` | `#24313D` |

Durante la Etapa 3 se deben derivar tokens de borde, texto secundario, foco,
hover, éxito, advertencia y peligro y comprobar contraste WCAG. El cobre comunica
selección y acción principal; no debe usarse como texto pequeño si el contraste
resulta insuficiente.

## Estructura y navegación

- Priorizar un shell de trabajo con navegación persistente en escritorio y un
  patrón compacto y accesible en móvil.
- Hacer evidente la ubicación actual, el rol activo y la salida de sesión sin
  confiar solo en color.
- Conservar densidad operativa: tareas y estados deben poder recorrerse rápido,
  sin encerrar cada fragmento en una tarjeta idéntica.
- Las vistas de empleado deben privilegiar la tarea siguiente y el progreso del
  día; las de administrador, la jerarquía entre configuración, asignación,
  urgencias y auditoría.

## Botones y estados

- La acción primaria usa una superficie cobre sólida con contraste comprobado,
  tamaño táctil mínimo de 44 por 44 px y foco visible independiente del hover.
- Acciones secundarias usan borde/superficie neutral; las destructivas mantienen
  un lenguaje rojo inequívoco y requieren confirmación proporcional al impacto.
- `disabled`, `loading`, `pressed`, `success` y `error` deben ser distinguibles
  por algo más que opacidad o color.
- El texto describe el resultado: “Guardar rutina”, “Asignar tareas” o
  “Eliminar empleado”, evitando etiquetas vagas como “Aceptar”.

## Tipografía, contenido y componentes

- Elegir en Etapa 3 una familia legible para uso operativo y, si aporta identidad,
  una segunda voz limitada a títulos; documentar carga, fallbacks y pesos.
- Mantener sentence case y jerarquía clara. Evitar mayúsculas sostenidas en
  etiquetas extensas.
- Diseñar estados completos para login, navegación, rutinas, tareas, personal,
  urgencias y auditoría: carga, vacío, error, éxito y permiso denegado.
- Emplear controles semánticos reales. Tarjetas marcables, tabs y filas de acción
  deben funcionar con teclado y lector de pantalla.

## Responsive y movimiento

- Diseñar mobile-first sin ocultar acciones esenciales ni convertir tablas en
  desplazamientos horizontales incontrolables.
- Usar microinteracciones moderadas para confirmar causa y efecto: selección de
  una tarea, apertura de detalle, guardado o cambio de tema.
- Evitar animaciones ambientales constantes y cascadas de entradas por tarjeta.
- Limitar transiciones habituales a aproximadamente 120–220 ms y respetar
  `prefers-reduced-motion` sin perder información.

## Gate visual para Etapa 3

Antes de aprobar una pantalla se revisan ambos temas, móvil y escritorio, foco
por teclado, contraste, movimiento reducido, estados de datos y visibilidad de
acciones. Se deben capturar vistas renderizadas y compararlas con esta dirección,
pero no se sacrifica corrección funcional ni seguridad por impacto visual.
