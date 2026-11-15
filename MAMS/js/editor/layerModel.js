// Layer definitions and order. project.layers = [{ id, name, type, visible }] (shared by all frames).
// Order lists are layer ids from TOP (in front) to BOTTOM (behind).
// A frame only stores `order` when the user changed it there; later frames inherit the nearest earlier one.
export const defaultLayers = () => [{ id: 'scene', name: 'Default layer', visible: true }];
export const defaultOrder = () => ['scene'];
// Every layer is the same kind of container (sprites + a drawing). The default layer is just the first one.

const SPRITE_IDS = ['background', 'character', 'ability'];
/** Upgrades projects saved by earlier versions. */
export function upgradeLayers(p) {
  p.layers ??= defaultLayers(); p.baseOrder ??= defaultOrder();
  // Step 3 projects: the single drawing of each frame becomes "Drawing 1", in front of the default layer
  if (p.frames.some((f) => f.draw) && !p.layers.some((l) => l.id === 'draw_1')) {
    p.layers.push({ id: 'draw_1', name: 'Drawing 1', type: 'draw', visible: true }); p.baseOrder.unshift('draw_1');
  }
  // Step 4 projects: the three sprite layers become the one default layer
  if (p.layers.some((l) => SPRITE_IDS.includes(l.id))) {
    const visible = p.layers.filter((l) => SPRITE_IDS.includes(l.id)).every((l) => l.visible);
    const merge = (order) => { const out = []; for (const id of order) { if (SPRITE_IDS.includes(id)) { if (!out.includes('scene')) out.push('scene'); } else out.push(id); } return out; };
    p.layers = [{ id: 'scene', name: 'Default layer', type: 'scene', visible }, ...p.layers.filter((l) => !SPRITE_IDS.includes(l.id))];
    p.baseOrder = merge(p.baseOrder);
    for (const f of p.frames) if (f.order) f.order = merge(f.order);
  }
}

export const layerById = (p, id) => p.layers.find((l) => l.id === id);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Drops unknown ids; layers missing from the list (newly added) appear on top. */
function sanitize(p, base) {
  const ids = new Set(p.layers.map((l) => l.id)), out = base.filter((id) => ids.has(id));
  for (const l of p.layers) if (!out.includes(l.id)) out.unshift(l.id);
  return out;
}

export function orderSource(p, index) { // index of the frame that defines the order, or -1 for the default
  for (let j = index; j >= 0; j--) if (p.frames[j].order) return j;
  return -1;
}
export function effectiveOrder(p, index) {
  const src = orderSource(p, index);
  return sanitize(p, src >= 0 ? p.frames[src].order : p.baseOrder);
}
export const setOrder = (p, index, order) => { p.frames[index].order = [...order]; };

/** Used before deleting or reordering frames, so every remaining frame keeps the look it had. */
export function snapshotOrders(p) {
  const m = new Map();
  p.frames.forEach((f, i) => m.set(f.id, effectiveOrder(p, i)));
  return m;
}
export function restoreOrders(p, m) {
  let run = sanitize(p, p.baseOrder);
  for (const f of p.frames) {
    const want = m.get(f.id) || run;
    if (same(want, run)) delete f.order; else { f.order = [...want]; run = want; }
  }
}
