/** Clamp a shape opacity to a finite value between zero and one. */
export function clampOpacity(value) {
  if (value === undefined || value === null) return 1;
  const opacity = Number(value);
  if (!Number.isFinite(opacity)) return 1;
  return Math.max(0, Math.min(1, opacity));
}

/** Reorder a shape in a bottom-to-top array. */
export function reorderShape(shapes, id, action) {
  if (!Array.isArray(shapes)) return false;
  const index = shapes.findIndex((shape) => shape?.id === id);
  if (index < 0) return false;

  let destination;
  if (action === 'forward') destination = Math.min(index + 1, shapes.length - 1);
  else if (action === 'backward') destination = Math.max(index - 1, 0);
  else if (action === 'front') destination = shapes.length - 1;
  else if (action === 'back') destination = 0;
  else return false;
  if (destination === index) return false;

  const [shape] = shapes.splice(index, 1);
  shapes.splice(destination, 0, shape);
  return true;
}
