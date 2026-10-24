// Missing positions keep the previous alphabetical routine order, at the end.
export function compareTemplateOrder(a, b) {
  return (a.orden ?? Infinity) - (b.orden ?? Infinity)
    || (a.titulo || a.descripcion || "").localeCompare(b.titulo || b.descripcion || "", "es")
    || a.id.localeCompare(b.id);
}
