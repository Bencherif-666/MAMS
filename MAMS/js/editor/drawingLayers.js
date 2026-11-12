// Per-frame drawing layer. One stage-size canvas per frame (created lazily), saved as a PNG blob in frame.draw.
// Also owns the undo/redo history for drawing operations.
import { canvasToBlob } from '../utils/helpers.js';

const canvases = new Map(), dirty = new Set(), undoStack = [], redoStack = [], LIMIT = 30;
let stageSize = { w: 640, h: 360 };

export const getCanvas = (frameId) => canvases.get(frameId) || null;

export function ensure(frameId) {
  let c = canvases.get(frameId);
  if (!c) { c = document.createElement('canvas'); c.width = stageSize.w; c.height = stageSize.h; canvases.set(frameId, c); }
  return c;
}
export const markDirty = (frameId) => dirty.add(frameId);

export function clearAll() { canvases.clear(); dirty.clear(); undoStack.length = 0; redoStack.length = 0; }

/** Decodes the saved drawing of every frame that has one. */
export async function loadAll(project) {
  clearAll(); stageSize = project.stage;
  for (const f of project.frames) {
    if (!f.draw) continue;
    const bmp = await createImageBitmap(f.draw);
    ensure(f.id).getContext('2d').drawImage(bmp, 0, 0);
    bmp.close();
  }
}

export function release(frameId) {
  canvases.delete(frameId); dirty.delete(frameId);
  for (const st of [undoStack, redoStack]) for (let i = st.length - 1; i >= 0; i--) if (st[i].id === frameId) st.splice(i, 1);
}

export function duplicate(srcId, dstId) {
  const s = canvases.get(srcId);
  if (!s) return;
  ensure(dstId).getContext('2d').drawImage(s, 0, 0);
  dirty.add(dstId);
}

const isEmpty = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; };

/** Writes changed drawings back into frame.draw (PNG blobs). Call before saving or exporting. */
export async function flush(project) {
  for (const f of project.frames) {
    if (!dirty.has(f.id)) continue;
    const c = canvases.get(f.id);
    f.draw = c && !isEmpty(c) ? await canvasToBlob(c) : null;
  }
  dirty.clear();
}

export function clear(frameId) {
  pushUndo(frameId);
  const c = ensure(frameId);
  c.getContext('2d').clearRect(0, 0, c.width, c.height); dirty.add(frameId);
}

// ---- history: a pixel snapshot of the frame's drawing before each operation
const snap = (id) => { const c = ensure(id); return { id, img: c.getContext('2d').getImageData(0, 0, c.width, c.height) }; };
export function pushUndo(frameId) { undoStack.push(snap(frameId)); if (undoStack.length > LIMIT) undoStack.shift(); redoStack.length = 0; }
function swap(from, to) {
  const e = from.pop();
  if (!e) return null;
  to.push(snap(e.id));
  ensure(e.id).getContext('2d').putImageData(e.img, 0, 0); dirty.add(e.id);
  return e.id; // frame that changed
}
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;
export const undoDraw = () => swap(undoStack, redoStack);
export const redoDraw = () => swap(redoStack, undoStack);
