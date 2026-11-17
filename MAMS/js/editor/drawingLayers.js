// Drawing layers: one stage-size canvas per (frame, layer), created lazily, saved as PNG blobs in frame.draws[layerId].
// Canvases of deleted frames or layers are moved to a "graveyard" so that Undo can bring them back.
import { canvasToBlob } from '../utils/helpers.js?v=9';

const canvases = new Map(), graveyard = new Map(), dirty = new Set(), GRAVE_LIMIT = 80;
let stageSize = { w: 640, h: 360 };
const key = (f, l) => `${f}|${l}`;
const split = (k) => k.split('|');

export const getCanvas = (frameId, layerId) => canvases.get(key(frameId, layerId)) || null;
export function ensure(frameId, layerId) {
  const k = key(frameId, layerId);
  let c = canvases.get(k);
  if (!c) { c = document.createElement('canvas'); c.width = stageSize.w; c.height = stageSize.h; canvases.set(k, c); }
  return c;
}
export const markDirty = (frameId, layerId) => dirty.add(key(frameId, layerId));
export const layerIdsOfFrame = (frameId) => [...canvases.keys()].filter((k) => split(k)[0] === frameId).map((k) => split(k)[1]);

export function clearAll() { canvases.clear(); graveyard.clear(); dirty.clear(); }

async function decodeInto(frameId, layerId, blob) {
  const bmp = await createImageBitmap(blob);
  ensure(frameId, layerId).getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
}
/** Decodes every saved drawing of the project. */
export async function loadAll(project) {
  clearAll(); stageSize = project.stage;
  for (const f of project.frames) for (const [lid, blob] of Object.entries(f.draws || {})) await decodeInto(f.id, lid, blob);
}
/** After Undo/Redo: decode drawings that have a saved blob but no canvas. */
export async function loadMissing(project) {
  for (const f of project.frames) for (const [lid, blob] of Object.entries(f.draws || {})) if (!canvases.has(key(f.id, lid))) await decodeInto(f.id, lid, blob);
}

function bury(k) {
  const c = canvases.get(k);
  if (!c) return;
  canvases.delete(k); dirty.delete(k); graveyard.set(k, c);
  while (graveyard.size > GRAVE_LIMIT) graveyard.delete(graveyard.keys().next().value);
}
export function release(frameId) { [...canvases.keys()].filter((k) => split(k)[0] === frameId).forEach(bury); }
export function releaseLayer(layerId) { [...canvases.keys()].filter((k) => split(k)[1] === layerId).forEach(bury); }

/** Makes the canvases match the project: canvases of removed frames/layers are buried, buried ones that exist again come back. */
export function reconcile(project) {
  const frames = new Set(project.frames.map((f) => f.id)), layerIds = new Set(project.layers.map((l) => l.id));
  for (const k of [...canvases.keys()]) { const [f, l] = split(k); if (!frames.has(f) || !layerIds.has(l)) bury(k); }
  for (const [k, c] of [...graveyard]) { const [f, l] = split(k); if (frames.has(f) && layerIds.has(l)) { graveyard.delete(k); canvases.set(k, c); dirty.add(k); } }
}

export function duplicateFrame(srcId, dstId) {
  for (const lid of layerIdsOfFrame(srcId)) { ensure(dstId, lid).getContext('2d').drawImage(canvases.get(key(srcId, lid)), 0, 0); markDirty(dstId, lid); }
}
export function duplicateLayer(project, srcLayerId, newLayerId) {
  for (const f of project.frames) {
    const s = getCanvas(f.id, srcLayerId);
    if (!s) continue;
    ensure(f.id, newLayerId).getContext('2d').drawImage(s, 0, 0); markDirty(f.id, newLayerId);
  }
}

const isEmpty = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; };

/** Writes changed drawings back into frame.draws. Call before saving or exporting. */
export async function flush(project) {
  const byId = new Map(project.frames.map((f) => [f.id, f]));
  for (const k of dirty) {
    const [fid, lid] = split(k), f = byId.get(fid);
    if (!f) continue;
    const c = canvases.get(k);
    f.draws ??= {};
    if (c && !isEmpty(c)) f.draws[lid] = await canvasToBlob(c); else delete f.draws[lid];
  }
  dirty.clear();
}

export function clear(frameId, layerId) {
  const c = ensure(frameId, layerId);
  c.getContext('2d').clearRect(0, 0, c.width, c.height); markDirty(frameId, layerId);
}

// pixel snapshots for the history
export const snapCanvas = (frameId, layerId) => { const c = ensure(frameId, layerId); return c.getContext('2d').getImageData(0, 0, c.width, c.height); };
export function putCanvas(frameId, layerId, img) { ensure(frameId, layerId).getContext('2d').putImageData(img, 0, 0); markDirty(frameId, layerId); }
