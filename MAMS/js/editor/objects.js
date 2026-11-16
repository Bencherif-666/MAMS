// Objects (sprites) of the current frame: adding to the selected layer, replacing, moving between layers, resetting, deleting.
import { state, uid, currentFrame } from '../core/state.js?v=7';
import { emit } from '../core/eventManager.js?v=7';
import { placeDefault } from './transforms.js?v=7';
import { layerById } from './layerModel.js?v=7';
import { toast } from '../utils/helpers.js?v=7';

export const findObject = (id) => (id ? currentFrame().objects.find((o) => o.id === id) || null : null);

/** Click on an asset: a new object on the SELECTED layer, in front of that layer's other sprites. */
export function addObject(asset) {
  const p = state.project, L = layerById(p, state.activeLayer);
  if (!L) { toast('Select a layer in the Layers panel first.', true); return; }
  if (!L.visible) { toast(`"${L.name}" is hidden. Show it with its eye icon first.`, true); return; }
  const obj = { id: uid('obj'), layer: L.id, asset: asset.id, mode: asset.kind === 'background' ? 'auto' : null, ...placeDefault(p, asset, 'auto') };
  currentFrame().objects.push(obj);
  state.sel = obj.id; emit('frames'); emit('select');
}

/** Alt+click on an asset: swap the sprite of the selected object, keeping its centre and scale. */
export function replaceAsset(obj, asset) {
  const old = state.project.assets[obj.asset], k = old ? obj.w / old.w : 1, cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
  obj.asset = asset.id; obj.w = Math.max(4, Math.round(asset.w * k)); obj.h = Math.max(4, Math.round(asset.h * k));
  obj.x = Math.round(cx - obj.w / 2); obj.y = Math.round(cy - obj.h / 2);
  emit('frames');
}

export function deleteSelected() {
  const f = currentFrame(), i = f.objects.findIndex((o) => o.id === state.sel);
  if (i < 0) { toast('Select an object on the canvas first.', true); return; }
  f.objects.splice(i, 1); state.sel = null; emit('frames'); emit('select');
}
export function resetSelected() {
  const o = findObject(state.sel), a = o && state.project.assets[o.asset];
  if (!a) { toast('Select an object on the canvas first.', true); return; }
  Object.assign(o, placeDefault(state.project, a, o.mode || 'auto')); emit('frames');
}
export function setBgMode(obj, mode) {
  const a = state.project.assets[obj.asset];
  if (!a || a.kind !== 'background') return;
  obj.mode = mode; Object.assign(obj, placeDefault(state.project, a, mode)); emit('frames');
}
/** "Move to layer": the object goes in front of the target layer's sprites, and that layer becomes the selected one. */
export function moveSelectedToLayer(layerId) {
  const f = currentFrame(), o = findObject(state.sel);
  if (!o || !layerById(state.project, layerId) || o.layer === layerId) return;
  f.objects.splice(f.objects.indexOf(o), 1); o.layer = layerId; f.objects.push(o);
  state.activeLayer = layerId; emit('frames'); emit('select');
}
