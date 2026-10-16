// src/utils/coloresSeccion.js

// Tonos semánticos resueltos por tokens para conservar contraste en ambos temas.
const paletaPastel = ["sage", "steel", "copper", "plum"];

// Función determinista: asigna siempre el mismo color pastel basado en el texto de la sección
export function obtenerColorSeccion(seccion = "") {
  if (!seccion) return { bg: "section-tone-sage", badge: "section-badge-sage" };

  let hash = 0;
  for (let i = 0; i < seccion.length; i++) {
    hash = seccion.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % paletaPastel.length;
  const tone = paletaPastel[index];
  return { bg: `section-tone-${tone}`, badge: `section-badge-${tone}` };
}
