// Pixel sprite editor: a full page opened by the EDIT button. It works on a copy of the sprite's pixels;
// nothing changes in the project until you press Done and choose "Save as new" or "Replace the original".
import { state, uid } from '../core/state.js?v=9';
import { emit } from '../core/eventManager.js?v=9';
import * as cache from '../assets/assetCache.js?v=9';
import { addAsset } from '../assets/assetLibrary.js?v=9';
import { replaceAsset } from './objects.js?v=9';
import { resizeTransform } from './selection.js?v=9';
import * as P from './pixelOps.js?v=9';
import { $, el, toast, canvasToBlob, confirmDialog } from '../utils/helpers.js?v=9';

const RAD = Math.PI / 180, HIST_LIMIT = 40;
const prefs = { color: '#000000', size: 1, filled: false, grid: true, keepRatio: true, recent: [] };
const ICON = {
  pencil: '<path d="M4 20l1-5L16 4l4 4L9 19z"/>',
  eraser: '<path d="M4 16l8-9 8 8-5 5H8zM9 21h12"/>',
  eyedropper: '<path d="M14 5l5 5-9 9H6v-4zM13 6l-2-2"/>',
  fill: '<path d="M5 11l7-7 7 7-7 7zM20 15c1 2 1 3 0 4-1 1-3 0-2-2z"/>',
  line: '<path d="M5 19L19 5"/>',
  rect: '<rect x="5" y="6" width="14" height="12"/>',
  select: '<path d="M5 5h4M15 5h4M5 19h4M15 19h4M5 9v6M19 9v6" stroke-dasharray="0"/>',
};
const TOOLS = [
  ['pencil', 'Pencil (B)'], ['eraser', 'Eraser (E)'], ['eyedropper', 'Eyedropper (I). Alt+click works with any tool'],
  ['fill', 'Paint bucket (G)'], ['line', 'Line (L)'], ['rect', 'Rectangle (R)'], ['select', 'Select a part: move, resize, rotate, delete (S)'],
];
const KEYS = { b: 'pencil', e: 'eraser', i: 'eyedropper', g: 'fill', l: 'line', r: 'rect', s: 'select' };
const HANDLES = [['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1], ['e', 1, 0], ['se', 1, 1], ['s', 0, 1], ['sw', -1, 1], ['w', -1, 0]];
const CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
const MAX_DISPLAY = 4096; // largest on-screen size of the sprite, in screen pixels

let ed = null;
export const isEditing = () => !!ed;

const ctxOf = (c) => c.getContext('2d', { willReadFrequently: true });
const snap = () => ed.ctx.getImageData(0, 0, ed.work.width, ed.work.height);

// ---- floating selection geometry (same maths as the sprite handles on the main canvas)
const fCenter = (f) => [f.x + f.w / 2, f.y + f.h / 2];
const fWorld = (f, lx, ly) => { const [cx, cy] = fCenter(f), a = f.rot * RAD; return [cx + lx * Math.cos(a) - ly * Math.sin(a), cy + lx * Math.sin(a) + ly * Math.cos(a)]; };
const fLocal = (f, wx, wy) => { const [cx, cy] = fCenter(f), a = -f.rot * RAD, dx = wx - cx, dy = wy - cy; return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]; };
function hitHandle(f, x, y) {
  const r = 9 / ed.zoom;
  for (const [id, hx, hy] of HANDLES) { const [hxw, hyw] = fWorld(f, hx * f.w / 2, hy * f.h / 2); if (Math.hypot(x - hxw, y - hyw) <= r) return id; }
  const [rx, ry] = fWorld(f, 0, -f.h / 2 - 22 / ed.zoom);
  return Math.hypot(x - rx, y - ry) <= r ? 'rot' : null;
}
const insideFloat = (f, x, y) => { const [lx, ly] = fLocal(f, x, y); return Math.abs(lx) <= f.w / 2 && Math.abs(ly) <= f.h / 2; };

// ---- history (pixel snapshots; a change of canvas size is restored too)
function pushHistory() { ed.hist.push(snap()); if (ed.hist.length > HIST_LIMIT) ed.hist.shift(); ed.redo.length = 0; ed.dirty = true; syncUI(); }
function restore(img) { ed.work.width = img.width; ed.work.height = img.height; ed.ctx.putImageData(img, 0, 0); layout(); }
function undo() { commitFloat(); const prev = ed.hist.pop(); if (!prev) return; ed.redo.push(snap()); restore(prev); syncUI(); }
function redo() { commitFloat(); const next = ed.redo.pop(); if (!next) return; ed.hist.push(snap()); restore(next); syncUI(); }

// ---- layout, zoom, overlay
const maxZoom = () => Math.max(1, Math.min(32, Math.floor(MAX_DISPLAY / Math.max(ed.work.width, ed.work.height))));
function layout() {
  const w = ed.work.width * ed.zoom, h = ed.work.height * ed.zoom;
  ed.work.style.width = `${w}px`; ed.work.style.height = `${h}px`;
  ed.over.width = w; ed.over.height = h; ed.over.style.width = `${w}px`; ed.over.style.height = `${h}px`;
  ed.over.dataset.zoom = ed.zoom;
  $('#edZoomLbl').textContent = `${ed.zoom * 100}%`;
  drawOver();
}
function setZoom(z) { ed.zoom = Math.max(1, Math.min(maxZoom(), Math.round(z))); layout(); }
function fitZoom() {
  const v = $('#edView'); ed.zoom = 1;
  setZoom(Math.floor(Math.min((v.clientWidth - 60) / ed.work.width, (v.clientHeight - 60) / ed.work.height)) || 1);
}

function drawOver() {
  if (!ed) return;
  const g = ed.over.getContext('2d'), z = ed.zoom, W = ed.over.width, H = ed.over.height;
  g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = false;
  if (prefs.grid && z >= 6) { // pixel grid
    g.strokeStyle = 'rgba(128,128,128,.35)'; g.lineWidth = 1; g.beginPath();
    for (let x = 1; x < ed.work.width; x++) { g.moveTo(x * z + 0.5, 0); g.lineTo(x * z + 0.5, H); }
    for (let y = 1; y < ed.work.height; y++) { g.moveTo(0, y * z + 0.5); g.lineTo(W, y * z + 0.5); }
    g.stroke();
  }
  const f = ed.float;
  if (f) {
    const [cx, cy] = fCenter(f);
    g.save(); g.translate(cx * z, cy * z); g.rotate(f.rot * RAD);
    g.drawImage(f.canvas, -f.w * z / 2, -f.h * z / 2, f.w * z, f.h * z);
    g.setLineDash([6, 4]); g.lineWidth = 1.5; g.strokeStyle = '#5b9dff'; g.strokeRect(-f.w * z / 2, -f.h * z / 2, f.w * z, f.h * z); g.setLineDash([]);
    g.beginPath(); g.moveTo(0, -f.h * z / 2); g.lineTo(0, -f.h * z / 2 - 22); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -f.h * z / 2 - 22, 5, 0, Math.PI * 2); g.fill(); g.stroke();
    for (const [, hx, hy] of HANDLES) { g.fillRect(hx * f.w * z / 2 - 4, hy * f.h * z / 2 - 4, 8, 8); g.strokeRect(hx * f.w * z / 2 - 4, hy * f.h * z / 2 - 4, 8, 8); }
    g.restore();
  }
  const d = ed.drag;
  if (d && d.kind === 'shape') { g.fillStyle = prefs.color; for (const r of P.shapeRects(ed.tool, d.a, d.b, prefs.size, prefs.filled)) g.fillRect(r.x * z, r.y * z, r.w * z, r.h * z); }
  if (d && d.kind === 'marquee') {
    const x0 = Math.min(d.a.x, d.b.x), y0 = Math.min(d.a.y, d.b.y), w = Math.abs(d.a.x - d.b.x) + 1, h = Math.abs(d.a.y - d.b.y) + 1;
    g.setLineDash([6, 4]); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.strokeRect(x0 * z, y0 * z, w * z, h * z); g.setLineDash([]);
  }
  if (ed.hover && !d && ['pencil', 'eraser', 'line', 'rect'].includes(ed.tool)) { // brush outline
    const r = P.brushRect(ed.hover.x, ed.hover.y, prefs.size);
    g.lineWidth = 1; g.strokeStyle = '#fff'; g.strokeRect(r.x * z + 0.5, r.y * z + 0.5, r.w * z - 1, r.h * z - 1);
    g.strokeStyle = '#000'; g.strokeRect(r.x * z - 0.5, r.y * z - 0.5, r.w * z + 1, r.h * z + 1);
  }
}

// ---- floating selection: lift, transform, commit
function lift(x0, y0, x1, y1) {
  const x = Math.max(0, Math.min(x0, x1)), y = Math.max(0, Math.min(y0, y1));
  const w = Math.min(ed.work.width - 1, Math.max(x0, x1)) - x + 1, h = Math.min(ed.work.height - 1, Math.max(y0, y1)) - y + 1;
  if (w < 1 || h < 1) return;
  const img = ed.ctx.getImageData(x, y, w, h);
  if (P.isEmpty(img.data)) { toast('That area is empty (transparent).'); return; }
  pushHistory();
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(img, 0, 0);
  ed.ctx.clearRect(x, y, w, h);
  ed.float = { canvas: c, x, y, w, h, rot: 0, w0: w, h0: h };
  syncUI();
}
function commitFloat() {
  const f = ed && ed.float;
  if (!f) return;
  const tmp = document.createElement('canvas'); tmp.width = ed.work.width; tmp.height = ed.work.height;
  const g = tmp.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false;
  const [cx, cy] = fCenter(f);
  g.translate(cx, cy); g.rotate(f.rot * RAD); g.drawImage(f.canvas, -f.w / 2, -f.h / 2, f.w, f.h);
  if (f.rot !== 0 || f.w !== f.w0 || f.h !== f.h0) { g.setTransform(1, 0, 0, 1, 0, 0); const id = g.getImageData(0, 0, tmp.width, tmp.height); P.binarizeAlpha(id.data); g.putImageData(id, 0, 0); } // crisp pixels
  ed.ctx.drawImage(tmp, 0, 0);
  ed.float = null; syncUI(); drawOver();
}
function cancelFloat() { // Esc: put the part back where it was
  if (!ed.float) return;
  ed.float = null; const prev = ed.hist.pop(); if (prev) restore(prev); syncUI();
}
function deleteFloat() { if (ed.float) { ed.float = null; syncUI(); drawOver(); } } // the hole stays: the part is removed

/** Flip / rotate the floating part, or the whole sprite when nothing is selected. */
function transformPixels(kind) {
  const f = ed.float, src = f ? f.canvas : ed.work, w = src.width, h = src.height;
  if (!f) { commitFloat(); pushHistory(); }
  const img = (f ? f.canvas.getContext('2d') : ed.ctx).getImageData(0, 0, w, h);
  let data = img.data, nw = w, nh = h;
  if (kind === 'flipH') data = P.flipH(data, w, h);
  else if (kind === 'flipV') data = P.flipV(data, w, h);
  else { const r = P.rotate90(data, w, h, kind === 'rotR'); data = r.data; nw = r.w; nh = r.h; }
  const out = new ImageData(data, nw, nh);
  if (f) {
    f.canvas.width = nw; f.canvas.height = nh; f.canvas.getContext('2d').putImageData(out, 0, 0);
    if (nw !== w) { const [cx, cy] = fCenter(f); [f.w, f.h] = [f.h, f.w]; [f.w0, f.h0] = [f.h0, f.w0]; f.x = Math.round(cx - f.w / 2); f.y = Math.round(cy - f.h / 2); }
    syncUI(); drawOver();
  } else { ed.work.width = nw; ed.work.height = nh; ed.ctx.putImageData(out, 0, 0); layout(); syncUI(); }
}

// ---- drawing
function setColor(hex) {
  prefs.color = hex; $('#edColor').value = hex; $('#edHex').value = hex;
}
function remember() {
  prefs.recent = [prefs.color, ...prefs.recent.filter((c) => c !== prefs.color)].slice(0, 14); renderRecent();
}
function renderRecent() {
  const box = $('#edRecent'); box.replaceChildren();
  for (const c of prefs.recent) { const b = el('button', 'swatch'); b.style.background = c; b.title = c; b.onclick = () => setColor(c); box.append(b); }
}
function paintLine(a, b, erase) {
  ed.ctx.fillStyle = prefs.color;
  for (const [x, y] of P.bresenham(a.x, a.y, b.x, b.y)) { const r = P.brushRect(x, y, prefs.size); if (erase) ed.ctx.clearRect(r.x, r.y, r.w, r.h); else ed.ctx.fillRect(r.x, r.y, r.w, r.h); }
}
function pick(p) {
  if (p.x < 0 || p.y < 0 || p.x >= ed.work.width || p.y >= ed.work.height) return;
  const d = ed.ctx.getImageData(p.x, p.y, 1, 1).data;
  if (!d[3]) { toast('That pixel is transparent.'); return; }
  setColor(P.rgbToHex(d[0], d[1], d[2]));
}
function bucket(p) {
  if (p.x < 0 || p.y < 0 || p.x >= ed.work.width || p.y >= ed.work.height) return;
  const img = snap(), [r, g, b] = P.hexToRgb(prefs.color);
  if (!P.floodFill(img.data, img.width, img.height, p.x, p.y, [r, g, b, 255])) return;
  pushHistory(); ed.ctx.putImageData(img, 0, 0); remember();
}

// ---- pointer handling (everything is in whole pixels)
const ptf = (e) => { const r = ed.over.getBoundingClientRect(); return { x: (e.clientX - r.left) / ed.zoom, y: (e.clientY - r.top) / ed.zoom }; };
const pti = (e) => { const p = ptf(e); return { x: Math.floor(p.x), y: Math.floor(p.y) }; };

function onDown(e) {
  if (!ed || e.button !== 0) return;
  const p = pti(e), pf = ptf(e), tool = e.altKey && ed.tool !== 'select' ? 'eyedropper' : ed.tool;
  ed.over.setPointerCapture(e.pointerId);
  if (tool === 'pencil' || tool === 'eraser') { commitFloat(); pushHistory(); if (tool === 'pencil') remember(); ed.drag = { kind: 'paint', last: p, erase: tool === 'eraser' }; paintLine(p, p, ed.drag.erase); }
  else if (tool === 'eyedropper') pick(p);
  else if (tool === 'fill') { commitFloat(); bucket(p); }
  else if (tool === 'line' || tool === 'rect') { commitFloat(); ed.drag = { kind: 'shape', a: p, b: p }; }
  else if (tool === 'select') {
    const f = ed.float;
    if (f) {
      const h = hitHandle(f, pf.x, pf.y);
      if (h) { ed.drag = { kind: h === 'rot' ? 'frot' : 'fresize', h, start: { x: f.x, y: f.y, w: f.w, h: f.h, rot: f.rot } }; drawOver(); return; }
      if (insideFloat(f, pf.x, pf.y)) { ed.drag = { kind: 'fmove', sx: f.x, sy: f.y, px: pf.x, py: pf.y }; return; }
      commitFloat();
    }
    ed.drag = { kind: 'marquee', a: p, b: p };
  }
  drawOver();
}

function onMove(e) {
  if (!ed) return;
  const p = pti(e), pf = ptf(e); ed.hover = p;
  $('#edStatus').textContent = `x ${p.x}, y ${p.y}  ·  sprite ${ed.work.width}×${ed.work.height} px`;
  const d = ed.drag;
  if (!d) {
    if (ed.tool === 'select' && ed.float) { const h = hitHandle(ed.float, pf.x, pf.y); ed.over.style.cursor = h ? (h === 'rot' ? 'grab' : CURSOR[h]) : insideFloat(ed.float, pf.x, pf.y) ? 'move' : 'crosshair'; }
    drawOver(); return;
  }
  if (d.kind === 'paint') { paintLine(d.last, p, d.erase); d.last = p; }
  else if (d.kind === 'shape') d.b = p;
  else if (d.kind === 'marquee') d.b = p;
  else if (d.kind === 'fmove') { ed.float.x = Math.round(d.sx + pf.x - d.px); ed.float.y = Math.round(d.sy + pf.y - d.py); syncUI(); }
  else if (d.kind === 'fresize') { Object.assign(ed.float, P_resize(d, pf, e)); syncUI(); }
  else if (d.kind === 'frot') {
    const [cx, cy] = fCenter(ed.float); let a = Math.atan2(pf.y - cy, pf.x - cx) / RAD + 90;
    if (e.shiftKey) a = Math.round(a / 15) * 15;
    ed.float.rot = Math.round((((a % 360) + 360) % 360) * 10) / 10; syncUI();
  }
  drawOver();
}
const P_resize = (d, pf, e) => resizeTransform(d.start, d.h, pf.x, pf.y, prefs.keepRatio !== e.shiftKey);

function onUp() {
  const d = ed && ed.drag;
  if (!d) return;
  ed.drag = null;
  if (d.kind === 'shape') {
    pushHistory(); remember(); ed.ctx.fillStyle = prefs.color;
    for (const r of P.shapeRects(ed.tool, d.a, d.b, prefs.size, prefs.filled)) ed.ctx.fillRect(r.x, r.y, r.w, r.h);
  } else if (d.kind === 'marquee') lift(d.a.x, d.a.y, d.b.x, d.b.y);
  drawOver();
}

// ---- interface state
function setTool(id) {
  if (!ed) return;
  commitFloat(); ed.tool = id; ed.drag = null;
  document.querySelectorAll('#edTools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === id));
  ed.over.style.cursor = id === 'eyedropper' ? 'copy' : 'crosshair';
  syncUI(); drawOver();
}
function syncUI() {
  if (!ed) return;
  $('#edUndo').disabled = !ed.hist.length; $('#edRedo').disabled = !ed.redo.length;
  $('#edSelGrp').hidden = !ed.float;
  $('#edSizeGrp').hidden = !['pencil', 'eraser', 'line', 'rect'].includes(ed.tool);
  $('#edFillGrp').hidden = ed.tool !== 'rect';
  $('#edGrid').classList.toggle('on', prefs.grid);
  const f = ed.float;
  if (f) for (const [id, v] of [['edW', f.w], ['edH', f.h], ['edRot', Math.round(f.rot)]]) { const i = $('#' + id); if (document.activeElement !== i) i.value = v; }
}

// ---- opening, saving, closing
export function openEditor(obj) {
  const asset = state.project.assets[obj.asset], e = asset && cache.get(asset.id);
  if (!asset || !e) { toast('This sprite could not be loaded.', true); return; }
  const work = $('#edWork'); work.width = asset.w; work.height = asset.h;
  const ctx = ctxOf(work); ctx.clearRect(0, 0, work.width, work.height); ctx.imageSmoothingEnabled = false; ctx.drawImage(e.bmp, 0, 0);
  ed = { obj, asset, work, ctx, over: $('#edOver'), zoom: 1, tool: 'pencil', hist: [], redo: [], float: null, drag: null, hover: null, dirty: false };
  document.body.classList.add('editing'); $('#editor').hidden = false;
  $('#edTitle').textContent = `Editing: ${asset.name}`;
  setColor(prefs.color); renderRecent(); $('#edSize').value = prefs.size; $('#edSizeOut').textContent = prefs.size; $('#edFilled').checked = prefs.filled; $('#edRatio').checked = prefs.keepRatio;
  fitZoom(); setTool('pencil');
}

function closeEditor() {
  if ($('#saveDlg').open) $('#saveDlg').close();
  document.body.classList.remove('editing'); $('#editor').hidden = true;
  ed = null; emit('assets'); emit('stage');
}
function cancelEditing() {
  if (!ed) return;
  if (ed.dirty && !confirmDialog('Discard your changes to this sprite?')) return;
  closeEditor();
}
function finish() {
  commitFloat();
  $('#saveName').value = `${ed.asset.name} edited`;
  $('#saveDlg').showModal();
}
async function saveNew() { // a new sprite in the library; this object switches to it, the original stays untouched
  const blob = await canvasToBlob(ed.work), name = $('#saveName').value.trim() || `${ed.asset.name} edited`;
  const a = { id: uid(ed.asset.kind), name, kind: ed.asset.kind, w: ed.work.width, h: ed.work.height, blob, folder: ed.asset.folder || null };
  await addAsset(a); replaceAsset(ed.obj, a);
  toast(`Saved as "${name}".`); closeEditor();
}
async function saveReplace() { // the original changes everywhere it is used
  const blob = await canvasToBlob(ed.work), a = ed.asset, ow = a.w, oh = a.h, nw = ed.work.width, nh = ed.work.height;
  a.blob = blob; a.w = nw; a.h = nh; a.rev = (a.rev || 0) + 1; await cache.reload(a); // rev lets Undo notice the change
  if (nw !== ow || nh !== oh) for (const f of state.project.frames) for (const o of f.objects) {
    if (o.asset !== a.id) continue; // keep the centre, scale with the new size
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2; o.w = Math.max(1, Math.round(o.w * nw / ow)); o.h = Math.max(1, Math.round(o.h * nh / oh));
    o.x = Math.round(cx - o.w / 2); o.y = Math.round(cy - o.h / 2);
  }
  toast(`"${a.name}" was replaced. Ctrl+Z undoes it.`); closeEditor(); emit('frames');
}
function changeCanvasSize() {
  commitFloat();
  const v = prompt('New canvas size in pixels (width x height). The sprite stays centred.', `${ed.work.width}x${ed.work.height}`), m = v && /(\d+)\s*[x,×]\s*(\d+)/i.exec(v);
  if (!m) return;
  const nw = Math.max(1, Math.min(1024, +m[1])), nh = Math.max(1, Math.min(1024, +m[2]));
  if (nw === ed.work.width && nh === ed.work.height) return;
  pushHistory();
  const old = document.createElement('canvas'); old.width = ed.work.width; old.height = ed.work.height; old.getContext('2d').drawImage(ed.work, 0, 0);
  const ox = Math.floor((nw - old.width) / 2), oy = Math.floor((nh - old.height) / 2);
  ed.work.width = nw; ed.work.height = nh; ed.ctx.drawImage(old, ox, oy); fitZoom(); syncUI();
}

// ---- one-time wiring
export function initSpriteEditor() {
  const tools = $('#edTools');
  for (const [id, label] of TOOLS) {
    const b = el('button'); b.dataset.tool = id; b.title = label; b.innerHTML = `<svg viewBox="0 0 24 24">${ICON[id]}</svg>`;
    b.onclick = () => setTool(id); tools.append(b);
  }
  const over = $('#edOver');
  over.addEventListener('pointerdown', onDown); over.addEventListener('pointermove', onMove);
  over.addEventListener('pointerup', onUp); over.addEventListener('pointercancel', onUp);
  over.addEventListener('pointerleave', () => { if (ed) { ed.hover = null; drawOver(); } });
  $('#edView').addEventListener('wheel', (e) => { if (ed && e.ctrlKey) { e.preventDefault(); setZoom(ed.zoom + (e.deltaY < 0 ? 1 : -1)); } }, { passive: false });

  $('#edUndo').onclick = undo; $('#edRedo').onclick = redo;
  $('#edFlipH').onclick = () => transformPixels('flipH'); $('#edFlipV').onclick = () => transformPixels('flipV');
  $('#edRotL').onclick = () => transformPixels('rotL'); $('#edRotR').onclick = () => transformPixels('rotR');
  $('#edZoomIn').onclick = () => setZoom(ed.zoom + 1); $('#edZoomOut').onclick = () => setZoom(ed.zoom - 1); $('#edFit').onclick = fitZoom;
  $('#edGrid').onclick = () => { prefs.grid = !prefs.grid; syncUI(); drawOver(); };
  $('#edCanvasSize').onclick = changeCanvasSize;
  $('#edCancel').onclick = cancelEditing; $('#edDone').onclick = finish;
  $('#saveNew').onclick = saveNew; $('#saveReplace').onclick = saveReplace; $('#saveBack').onclick = () => $('#saveDlg').close();

  $('#edColor').oninput = (e) => setColor(e.target.value);
  $('#edHex').onchange = (e) => { let v = e.target.value.trim().replace(/^#?/, '#').toLowerCase(); if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`; setColor(/^#[0-9a-f]{6}$/.test(v) ? v : prefs.color); };
  $('#edSize').oninput = (e) => { prefs.size = +e.target.value; $('#edSizeOut').textContent = e.target.value; drawOver(); };
  $('#edFilled').onchange = (e) => (prefs.filled = e.target.checked);
  $('#edRatio').onchange = (e) => (prefs.keepRatio = e.target.checked);
  $('#edApply').onclick = commitFloat; $('#edDelSel').onclick = deleteFloat;
  const num = (id, fn) => { $(id).onchange = (e) => { if (!ed || !ed.float) return; fn(ed.float, Math.round(+e.target.value)); syncUI(); drawOver(); }; };
  num('#edW', (f, v) => { v = Math.max(1, v); const [cx, cy] = fCenter(f), k = v / f.w; f.w = v; if (prefs.keepRatio) f.h = Math.max(1, Math.round(f.h * k)); f.x = Math.round(cx - f.w / 2); f.y = Math.round(cy - f.h / 2); });
  num('#edH', (f, v) => { v = Math.max(1, v); const [cx, cy] = fCenter(f), k = v / f.h; f.h = v; if (prefs.keepRatio) f.w = Math.max(1, Math.round(f.w * k)); f.x = Math.round(cx - f.w / 2); f.y = Math.round(cy - f.h / 2); });
  num('#edRot', (f, v) => { f.rot = ((v % 360) + 360) % 360; });

  addEventListener('keydown', (e) => {
    if (!ed || $('#saveDlg').open) return;
    if (e.target.matches && e.target.matches('input[type=text],input[type=number]')) { if (e.key === 'Enter') e.target.blur(); return; }
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && k === 'y') { e.preventDefault(); redo(); }
    else if (mod && k === 'a') { e.preventDefault(); setTool('select'); lift(0, 0, ed.work.width - 1, ed.work.height - 1); drawOver(); }
    else if (mod) return;
    else if (e.key === 'Enter') commitFloat();
    else if (e.key === 'Escape') cancelFloat();
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteFloat(); }
    else if (e.key === '+' || e.key === '=') setZoom(ed.zoom + 1);
    else if (e.key === '-') setZoom(ed.zoom - 1);
    else if (k === 'h') prefs.grid = !prefs.grid, syncUI(), drawOver();
    else if (KEYS[k]) setTool(KEYS[k]);
  });
}
