// Drawing layers: one stage-size canvas per (frame, layer), created lazily, saved as PNG blobs in frame.draws[layerId].
// Also owns the undo/redo history for drawing operations.
import { canvasToBlob } from '../utils/helpers.js?v=7';

const canvases = new Map(), dirty = new Set(), undoStack = [], redoStack = [], LIMIT = 30;
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

export function clearAll() { canvases.clear(); dirty.clear(); undoStack.length = 0; redoStack.length = 0; }

/** Decodes every saved drawing of the project. */
export async function loadAll(project) {
  clearAll(); stageSize = project.stage;
  for (const f of project.frames) {
    for (const [layerId, blob] of Object.entries(f.draws || {})) {
      const bmp = await createImageBitmap(blob);
      ensure(f.id, layerId).getContext('2d').drawImage(bmp, 0, 0);
      bmp.close();
    }
  }
}

const keysOf = (pick, value) => [...canvases.keys()].filter((k) => split(k)[pick] === value);
function purgeHistory(pick, value) {
  const field = pick === 0 ? 'fid' : 'lid';
  for (const st of [undoStack, redoStack]) for (let i = st.length - 1; i >= 0; i--) if (st[i][field] === value) st.splice(i, 1);
}
export function release(frameId) { keysOf(0, frameId).forEach((k) => { canvases.delete(k); dirty.delete(k); }); purgeHistory(0, frameId); }
export function releaseLayer(layerId) { keysOf(1, layerId).forEach((k) => { canvases.delete(k); dirty.delete(k); }); purgeHistory(1, layerId); }

export function duplicateFrame(srcId, dstId) {
  for (const k of keysOf(0, srcId)) { const lid = split(k)[1]; ensure(dstId, lid).getContext('2d').drawImage(canvases.get(k), 0, 0); markDirty(dstId, lid); }
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
  pushUndo(frameId, layerId);
  const c = ensure(frameId, layerId);
  c.getContext('2d').clearRect(0, 0, c.width, c.height); markDirty(frameId, layerId);
}
export function clearFrame(frameId) { keysOf(0, frameId).forEach((k) => clear(frameId, split(k)[1])); }

// ---- history: a pixel snapshot of one layer before each operation
const snap = (fid, lid) => { const c = ensure(fid, lid); return { fid, lid, img: c.getContext('2d').getImageData(0, 0, c.width, c.height) }; };
export function pushUndo(frameId, layerId) { undoStack.push(snap(frameId, layerId)); if (undoStack.length > LIMIT) undoStack.shift(); redoStack.length = 0; }
function swap(from, to) {
  const e = from.pop();
  if (!e) return null;
  to.push(snap(e.fid, e.lid));
  ensure(e.fid, e.lid).getContext('2d').putImageData(e.img, 0, 0); markDirty(e.fid, e.lid);
  return { frameId: e.fid, layerId: e.lid };
}
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;
export const undoDraw = () => swap(undoStack, redoStack);
export const redoDraw = () => swap(redoStack, undoStack);
