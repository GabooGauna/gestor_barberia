// src/utils/coloresSeccion.js

// Lista de clases de Tailwind con tonos pasteles suaves (fondo y texto oscuro legible)
const paletaPastel = [
  {
    bg: "bg-emerald-50 border-emerald-200 text-emerald-900",
    badge: "bg-emerald-100 text-emerald-800",
  },
  {
    bg: "bg-sky-50 border-sky-200 text-sky-900",
    badge: "bg-sky-100 text-sky-800",
  },
  {
    bg: "bg-amber-50 border-amber-200 text-amber-900",
    badge: "bg-amber-100 text-amber-800",
  },
  {
    bg: "bg-purple-50 border-purple-200 text-purple-900",
    badge: "bg-purple-100 text-purple-800",
  },
  {
    bg: "bg-rose-50 border-rose-200 text-rose-900",
    badge: "bg-rose-100 text-rose-800",
  },
  {
    bg: "bg-indigo-50 border-indigo-200 text-indigo-900",
    badge: "bg-indigo-100 text-indigo-800",
  },
  {
    bg: "bg-teal-50 border-teal-200 text-teal-900",
    badge: "bg-teal-100 text-teal-800",
  },
];

// Función determinista: asigna siempre el mismo color pastel basado en el texto de la sección
export function obtenerColorSeccion(seccion = "") {
  if (!seccion) return paletaPastel[0];

  let hash = 0;
  for (let i = 0; i < seccion.length; i++) {
    hash = seccion.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % paletaPastel.length;
  return paletaPastel[index];
}
