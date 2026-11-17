// One Undo/Redo timeline for everything.
// - Project changes (sprites, layers, frames, assets, folders, settings) are detected automatically: whenever the
//   app announces 'frames' or 'assets', the project is compared with the previous checkpoint and, if it changed,
//   the previous state is pushed on the undo stack.
// - Drawing strokes are recorded as pixel snapshots of one layer (pushDraw), in the same timeline.
import { state } from './state.js?v=9';
import { emit, on } from './eventManager.js?v=9';
import * as cache from '../assets/assetCache.js?v=9';
import * as layers from '../editor/drawingLayers.js?v=9';
import { toast } from '../utils/helpers.js?v=9';

const LIMIT = 100, SIZE_CAP = 60e6;
let undoStack = [], redoStack = [], last = null, restoring = false, queue = Promise.resolve(), groupSeq = 0, curGroup = null;

const viewNow = () => ({ current: state.current, activeLayer: state.activeLayer, sel: state.sel });

/** Everything that defines the project except pixels: compared as text, so any change is noticed. */
function snapshot() {
  const p = state.project;
  const core = JSON.stringify({
    name: p.name, fps: p.fps, loop: p.loop, layers: p.layers, baseOrder: p.baseOrder, folders: p.folders || [],
    frames: p.frames.map(({ draws, ...f }) => f), assets: Object.values(p.assets).map(({ blob, ...a }) => a),
  });
  return {
    core, view: viewNow(),
    assets: Object.fromEntries(Object.entries(p.assets).map(([id, a]) => [id, { ...a }])), // blobs are shared, not copied
    draws: Object.fromEntries(p.frames.map((f) => [f.id, { ...f.draws }])),
  };
}

const sizeOf = (e) => (e.kind === 'draw' ? e.img.data.length : e.snap.core.length * 2);
function trim() {
  while (undoStack.length > LIMIT) undoStack.shift();
  let total = undoStack.reduce((s, e) => s + sizeOf(e), 0);
  while (total > SIZE_CAP && undoStack.length > 1) total -= sizeOf(undoStack.shift());
}
function push(entry) { state.dirty = true; undoStack.push(entry); redoStack.length = 0; trim(); emit('hist'); }

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

/** Starts a fresh history for a newly opened project. */
export function reset() { undoStack = []; redoStack = []; last = snapshot(); emit('hist'); }
export function noteView() { if (last && !restoring) last.view = viewNow(); }

/** Compares the project with the last checkpoint; a difference becomes one undo step. */
export function checkpoint() {
  if (restoring || !state.project || !last) return;
  const now = snapshot();
  if (now.core === last.core) { last.view = now.view; return; }
  push({ kind: 'model', snap: last, gid: curGroup });
  last = now;
}

/** Call BEFORE a brush / eraser / blur / shape stroke or a clear: remembers the layer's pixels. */
export function pushDraw(frameId, layerId) {
  checkpoint();
  push({ kind: 'draw', fid: frameId, lid: layerId, img: layers.snapCanvas(frameId, layerId), gid: curGroup });
}
/** Everything recorded while fn runs is undone as ONE step. */
export function group(fn) { curGroup = ++groupSeq; try { fn(); } finally { curGroup = null; } }

async function restoreModel(snap) {
  const p = state.project, core = JSON.parse(snap.core);
  Object.assign(p, { name: core.name, fps: core.fps, loop: core.loop, layers: core.layers, baseOrder: core.baseOrder, folders: core.folders });
  p.assets = Object.fromEntries(Object.entries(snap.assets).map(([id, a]) => [id, { ...a }]));
  p.frames = core.frames.map((f) => ({ ...f, draws: { ...(snap.draws[f.id] || {}) } }));
  layers.reconcile(p);
  for (const id of cache.ids()) if (!p.assets[id]) cache.release(id);   // sprites that no longer exist
  for (const a of Object.values(p.assets)) { const e = cache.get(a.id); if (!e) await cache.load(a); else if (e.blob !== a.blob) await cache.reload(a); }
  await layers.loadMissing(p);
  const v = snap.view;
  state.current = Math.max(0, Math.min(p.frames.length - 1, v.current));
  state.activeLayer = p.layers.some((l) => l.id === v.activeLayer) ? v.activeLayer : p.layers[0].id;
  state.sel = p.frames[state.current].objects.some((o) => o.id === v.sel) ? v.sel : null;
  for (const k of Object.keys(state.folder)) if (state.folder[k] && !p.folders.some((f) => f.id === state.folder[k])) state.folder[k] = null;
}

/** Applies one entry and returns the entry that undoes it again. */
async function apply(e) {
  if (e.kind === 'draw') {
    const opposite = { kind: 'draw', fid: e.fid, lid: e.lid, img: layers.snapCanvas(e.fid, e.lid), gid: e.gid };
    layers.putCanvas(e.fid, e.lid, e.img);
    const i = state.project.frames.findIndex((f) => f.id === e.fid);
    if (i >= 0) state.current = i;
    if (state.project.layers.some((l) => l.id === e.lid)) state.activeLayer = e.lid;
    return opposite;
  }
  const opposite = { kind: 'model', snap: snapshot(), gid: e.gid };
  await restoreModel(e.snap);
  return opposite;
}

async function step(from, to, what) {
  checkpoint();
  const first = from.pop();
  if (!first) { toast(`Nothing to ${what}.`); return; }
  const batch = [first];
  while (first.gid && from.length && from[from.length - 1].gid === first.gid) batch.push(from.pop());
  restoring = true;
  try { for (const e of batch) to.push(await apply(e)); } finally { restoring = false; }
  last = snapshot(); state.dirty = true;
  emit('assets'); emit('frames'); emit('select'); emit('hist');
}
const enqueue = (fn) => (queue = queue.then(fn).catch((err) => { restoring = false; toast(`Undo failed: ${err.message}`, true); }));
export const undo = () => enqueue(() => step(undoStack, redoStack, 'undo'));
export const redo = () => enqueue(() => step(redoStack, undoStack, 'redo'));

export function initHistory() {
  on('frames', checkpoint); on('assets', checkpoint);
  on('stage', noteView); on('select', noteView);
}
