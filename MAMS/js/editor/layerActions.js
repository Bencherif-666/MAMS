// Adding, duplicating and deleting layers. Layers are containers: they hold sprites and a drawing.
import { state, uid, currentFrame } from '../core/state.js?v=8';
import { emit } from '../core/eventManager.js?v=8';
import * as layers from './drawingLayers.js?v=8';
import { effectiveOrder, setOrder } from './layerModel.js?v=8';
import { toast } from '../utils/helpers.js?v=8';

function place(id, aboveId) { // aboveId null = very top. The order is saved at the current frame (and continues forward).
  const p = state.project, o = effectiveOrder(p, state.current).filter((x) => x !== id);
  o.splice(aboveId ? Math.max(0, o.indexOf(aboveId)) : 0, 0, id);
  setOrder(p, state.current, o);
}

/** New empty layer, directly in front of all others. It becomes the selected layer. */
export function addLayer() {
  const p = state.project, nums = p.layers.map((l) => +(/^Layer (\d+)$/.exec(l.name) || [])[1] || 0);
  const L = { id: uid('layer'), name: `Layer ${Math.max(0, ...nums) + 1}`, visible: true };
  p.layers.push(L); place(L.id, null);
  state.activeLayer = L.id; emit('frames'); emit('select');
  return L;
}

/** Copies the layer with its sprites and drawings in every frame. */
export function duplicateLayer(L) {
  const p = state.project, copy = { id: uid('layer'), name: `${L.name} copy`, visible: true }, tag = uid('c').slice(2);
  p.layers.push(copy);
  layers.duplicateLayer(p, L.id, copy.id);
  for (const f of p.frames) {
    const extra = f.objects.filter((o) => o.layer === L.id).map((o) => ({ ...o, id: `${o.id}~${tag}`, layer: copy.id }));
    f.objects.push(...extra);
  }
  place(copy.id, L.id);
  state.activeLayer = copy.id; emit('frames'); emit('select');
}

/** A project always keeps at least one layer. */
export function deleteLayer(L) {
  const p = state.project;
  if (p.layers.length <= 1) { toast('A project needs at least one layer.', true); return; }
  p.layers = p.layers.filter((l) => l.id !== L.id);
  p.baseOrder = p.baseOrder.filter((x) => x !== L.id);
  for (const f of p.frames) {
    if (f.order) f.order = f.order.filter((x) => x !== L.id);
    f.objects = f.objects.filter((o) => o.layer !== L.id);
    if (f.draws) delete f.draws[L.id];
  }
  layers.releaseLayer(L.id);
  if (state.activeLayer === L.id) state.activeLayer = effectiveOrder(p, state.current)[0];
  if (!currentFrame().objects.some((o) => o.id === state.sel)) state.sel = null;
  emit('frames'); emit('select');
  toast(`Layer "${L.name}" deleted. Press Ctrl+Z to undo.`);
}
