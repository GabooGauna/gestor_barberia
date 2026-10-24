---
name: GNS Hair Studio
description: Aplicación operativa sobria, cálida y mate.
colors:
  canvas-light: "#f4f1ec"
  surface-light: "#fffdfa"
  ink-light: "#292724"
  line-light: "#d8d1c8"
  copper-light: "#b77a48"
  action-light: "#875126"
  action-ink-light: "#ffffff"
  canvas-dark: "#0b0d0f"
  surface-dark: "#191d21"
  ink-dark: "#f0f3f6"
  line-dark: "#343b42"
  copper-dark: "#c99460"
  action-ink-dark: "#15100c"
typography:
  display:
    fontFamily: "DM Serif Display, Georgia, serif"
    fontSize: "clamp(2.5rem, 5vw, 4.4rem)"
    fontWeight: 400
    lineHeight: 1.06
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "DM Serif Display, Georgia, serif"
    fontSize: "clamp(1.65rem, 2.5vw, 2.35rem)"
    fontWeight: 400
    letterSpacing: "-0.025em"
  body:
    fontFamily: "DM Sans, Segoe UI, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
rounded:
  sm: "0.375rem"
  md: "0.75rem"
  lg: "1rem"
spacing:
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.action-light}"
    textColor: "{colors.action-ink-light}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.65rem 1rem"
  button-primary-dark:
    backgroundColor: "{colors.copper-dark}"
    textColor: "{colors.action-ink-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.65rem 1rem"
---

# Design System: GNS Hair Studio

## Overview

**Creative North Star: "Estudio operativo GNS"**

Modo Operate: una aplicación para trabajar todos los días. La identidad combina
grafito y cobre con superficies cálidas, composición precisa y acabado mate.
El logo GNS conserva su identidad; la presentación acompaña los contratos de
trabajo existentes. Registro del sistema implementado en `src/index.css`, con
los compromisos de `PRODUCT.md` y la dirección aprobada del 24/10/2026.

**Key Characteristics:**
- Superficies mates y jerarquía por composición.
- Serif de identidad; sans para operar.
- Temas claro y oscuro con tokens semánticos.

## Colors

El cobre señala acciones y selección; el grafito sostiene navegación e identidad.
El tema claro usa un fondo cálido y superficies claras; el oscuro conserva la
paleta grafito. Los tokens con sufijo light/dark representan los valores de las
variables semánticas de cada tema, no dos estilos alternativos por componente.
Éxito, error, advertencias y colores de rutina conservan sus tokens del CSS.

## Typography

DM Serif Display se reserva a títulos principales y login. DM Sans organiza
formularios, navegación, tareas y títulos internos operacionales. Ambas familias
se sirven desde `public/fonts` con `font-display: swap`. El login usa además un
título de formulario de 2.25rem. No extender el serif a filas ni controles.

## Layout

Lateral de 14rem (224px), contenido de hasta 90rem y separación por espacios y
líneas. A 820px la navegación pasa a la cabecera móvil; el login apila a 680px.
Equipo pasa a una columna a 1200px. Auditoría apila sus columnas a 1100px y
compacta a 480px. Mantener mínimos táctiles
de 2.75rem y la adaptación de contenido sin desplazamiento horizontal.

## Elevation & Depth

Superficies ordinarias sin sombra; límites tonales y bordes definen grupos.
Menús elevados y arrastre usan `shadow-2`; controles interactivos pueden usar
las sombras discretas de control. Transiciones breves y movimiento reducido
según las preferencias del sistema. Sin gradientes ni glassmorphism.

## Shapes

Radios pequeños para controles, medianos para agrupaciones y grandes para
paneles. Cabeceras de trabajo y creación pueden usar una línea divisoria sin
envolver el contenido en otra tarjeta.

## Components

Botones primarios de cobre contrastado; secundarios con borde; destructivos con
texto y superficie de peligro. Inputs de superficie sólida y borde visible.
Foco global de 3px con separación de 3px. Navegación seleccionada cambia tinta
y superficie juntas. Tarjetas, etiquetas de sección y tareas conservan su
semántica y colores configurados. Mantener estados de carga, vacío, error,
éxito, deshabilitado y permisos sin depender exclusivamente del color.

## Do's and Don'ts

- **Do** conservar logo GNS, fuentes locales y ambos temas.
- **Do** usar tokens semánticos, foco visible y movimiento reducido.
- **Don't** agregar gradientes, transparencias decorativas o glassmorphism.
- **Don't** convertir la interfaz operativa en una landing promocional.
