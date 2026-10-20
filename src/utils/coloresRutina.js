export const DEFAULT_ROUTINE_COLOR = "copper";

export const ROUTINE_COLOR_OPTIONS = [
  { id: "copper", label: "Cobre" },
  { id: "sage", label: "Verde" },
  { id: "steel", label: "Azul" },
  { id: "plum", label: "Violeta" },
];

const ROUTINE_COLOR_IDS = new Set(ROUTINE_COLOR_OPTIONS.map(({ id }) => id));

export const ROUTINE_COLORS_ENABLED =
  String(import.meta.env.VITE_ENABLE_RUTINAS_COLOR ?? "")
    .trim()
    .toLowerCase() === "true";

export function normalizeRoutineColor(color) {
  return ROUTINE_COLOR_IDS.has(color) ? color : DEFAULT_ROUTINE_COLOR;
}

export function routineColorClass(color) {
  return `routine-accent routine-accent--${normalizeRoutineColor(color)}`;
}
