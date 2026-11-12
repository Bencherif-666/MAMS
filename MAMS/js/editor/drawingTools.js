// Brush, eraser, ellipse and blur. All of them paint on the current frame's drawing layer only.
import { state, currentFrame } from '../core/state.js';
import { emit, on } from '../core/eventManager.js';
import * as layers from './drawingLayers.js';
import { OVERLAY_MARGIN as M } from './selection.js';
import { toast } from '../utils/helpers.js';

export const settings = { color: '#ff5533', size: 12, opacity: 1, hardness: 80, fill: 'outline' };
export const DRAW_TOOLS = ['brush', 'eraser', 'ellipse', 'blur'];
const FILTER_OK = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
const mk = () => document.createElement('canvas');
const strokeCanvas = mk(), bufA = mk(), bufB = mk(); // reused buffers: no per-stroke allocations
let tip = null, tipKey = '', stroke = null, hover = null;

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

/** Pre-rendered round brush tip (soft edge controlled by hardness). Rebuilt only when settings change. */
function getTip(color) {
  const { size, hardness } = settings, key = `${size}|${hardness}|${color}`;
  if (key === tipKey) return tip;
  const d = Math.ceil(size) + 2, c = mk(), g = c.getContext('2d'), r = size / 2, m = d / 2;
  c.width = c.height = d;
  if (hardness >= 100) { g.fillStyle = color; g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill(); }
  else {
    const grad = g.createRadialGradient(m, m, r * hardness / 100, m, m, r);
    grad.addColorStop(0, rgba(color, 1)); grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad; g.fillRect(0, 0, d, d);
  }
  tipKey = key; tip = c;
  return c;
}

/** Calls fn at even spacing along a segment; stroke.carry keeps spacing continuous between segments. */
function walk(a, b, fn) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  if (!len) return;
  const sp = stroke.tool === 'blur' ? Math.max(2, settings.size * 0.25) : Math.max(1, settings.size * 0.1);
  let d = sp - stroke.carry;
  while (d <= len) { fn({ x: a.x + dx * d / len, y: a.y + dy * d / len }); d += sp; }
  stroke.carry = len - (d - sp);
}

function dab(p) {
  const t = stroke.tool;
  if (t === 'brush') { const img = getTip(settings.color); strokeCanvas.getContext('2d').drawImage(img, p.x - img.width / 2, p.y - img.height / 2); }
  else if (t === 'eraser') {
    const img = getTip('#000000'), g = stroke.dc.getContext('2d');
    g.save(); g.globalCompositeOperation = 'destination-out'; g.globalAlpha = settings.opacity;
    g.drawImage(img, p.x - img.width / 2, p.y - img.height / 2); g.restore();
  } else if (t === 'blur') blurDab(p);
}

/**
 * One blur step: blur a copy of the area under the brush, then blend it back using the brush tip as a soft mask:
 * result = original * (1 - m) + blurred * m. Works on the drawing layer only.
 */
function blurDab(p) {
  const { size, opacity } = settings, px = Math.max(1, size / 8), pad = Math.ceil(px * 3), d = Math.ceil(size) + 2 * pad;
  const x0 = Math.round(p.x - d / 2), y0 = Math.round(p.y - d / 2), img = getTip('#000000'), off = (d - img.width) / 2;
  bufA.width = bufA.height = bufB.width = bufB.height = d; // resizing also clears them
  const a = bufA.getContext('2d'), b = bufB.getContext('2d');
  a.drawImage(stroke.dc, x0, y0, d, d, 0, 0, d, d);
  b.filter = `blur(${px}px)`; b.drawImage(bufA, 0, 0); b.filter = 'none';
  b.globalCompositeOperation = 'destination-in'; b.globalAlpha = opacity; b.drawImage(img, off, off);
  const g = stroke.dc.getContext('2d');
  g.save();
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = opacity; g.drawImage(img, x0 + off, y0 + off);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.drawImage(bufB, x0, y0);
  g.restore();
}

function paintEllipse(g, a, b, circle) {
  let x1 = b.x, y1 = b.y;
  if (circle) { const s = Math.max(Math.abs(x1 - a.x), Math.abs(y1 - a.y)); x1 = a.x + (x1 >= a.x ? s : -s); y1 = a.y + (y1 >= a.y ? s : -s); }
  g.beginPath();
  g.ellipse((a.x + x1) / 2, (a.y + y1) / 2, Math.max(0.5, Math.abs(x1 - a.x) / 2), Math.max(0.5, Math.abs(y1 - a.y) / 2), 0, 0, Math.PI * 2);
  if (settings.fill === 'fill') { g.fillStyle = settings.color; g.fill(); }
  else { g.strokeStyle = settings.color; g.lineWidth = settings.size; g.stroke(); }
}

/** Live preview on the overlay (editing aid, not part of the frame): current stroke + brush-size circle. */
export function drawToolPreview(ctx, zoom, hidden) {
  if (hidden || !DRAW_TOOLS.includes(state.tool)) return;
  ctx.save(); ctx.translate(M, M);
  if (stroke) {
    ctx.globalAlpha = settings.opacity;
    if (stroke.tool === 'brush') ctx.drawImage(strokeCanvas, 0, 0);
    else if (stroke.tool === 'ellipse') paintEllipse(ctx, stroke.start, stroke.cur, stroke.shift);
    ctx.globalAlpha = 1;
  }
  if (hover && state.tool !== 'ellipse') {
    const r = settings.size / 2, s = 1 / zoom;
    ctx.lineWidth = s; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(hover.x, hover.y, r + s, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(hover.x, hover.y, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function afterHistory(id, what) {
  if (!id) { toast(`Nothing to ${what}.`); return; }
  const i = state.project.frames.findIndex((f) => f.id === id);
  if (i >= 0) state.current = i;
  emit('frames');
}
export const undoDrawing = () => afterHistory(layers.undoDraw(), 'undo');
export const redoDrawing = () => afterHistory(layers.redoDraw(), 'redo');
export function clearDrawing() { layers.clear(currentFrame().id); emit('frames'); }

export function initDrawing({ overlay, redraw, redrawOverlay, commit, canEdit }) {
  const pt = (e) => { const r = overlay.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * overlay.width - M, y: (e.clientY - r.top) / r.height * overlay.height - M }; };
  const active = () => DRAW_TOOLS.includes(state.tool) && canEdit();
  const refresh = () => (stroke && (stroke.tool === 'eraser' || stroke.tool === 'blur') ? redraw() : redrawOverlay());

  overlay.addEventListener('pointerdown', (e) => {
    if (!active() || e.button !== 0) return;
    if (state.tool === 'blur' && !FILTER_OK) { toast('Blur needs Chrome, Edge, Brave or Firefox.', true); return; }
    const f = currentFrame(), p = pt(e), { w, h } = state.project.stage;
    layers.pushUndo(f.id);
    stroke = { tool: state.tool, frameId: f.id, dc: layers.ensure(f.id), last: p, smooth: p, raw: p, start: p, cur: p, carry: 0, shift: e.shiftKey };
    if (strokeCanvas.width !== w || strokeCanvas.height !== h) { strokeCanvas.width = w; strokeCanvas.height = h; }
    else strokeCanvas.getContext('2d').clearRect(0, 0, w, h);
    overlay.setPointerCapture(e.pointerId);
    if (stroke.tool !== 'ellipse') dab(p); // a single click leaves a dot
    refresh();
  });

  overlay.addEventListener('pointermove', (e) => {
    hover = pt(e);
    if (!stroke) { if (DRAW_TOOLS.includes(state.tool)) redrawOverlay(); return; }
    stroke.shift = e.shiftKey;
    const list = e.getCoalescedEvents?.();
    for (const ce of list && list.length ? list : [e]) {
      const p = pt(ce);
      if (stroke.tool === 'ellipse') { stroke.cur = p; continue; }
      stroke.raw = p;
      stroke.smooth = { x: stroke.smooth.x + (p.x - stroke.smooth.x) * 0.55, y: stroke.smooth.y + (p.y - stroke.smooth.y) * 0.55 }; // smoothing
      walk(stroke.last, stroke.smooth, dab);
      stroke.last = stroke.smooth;
    }
    refresh();
  });

  const finish = () => {
    if (!stroke) return;
    const s = stroke, g = s.dc.getContext('2d');
    if (s.tool !== 'ellipse') walk(s.last, s.raw, dab); // reach the exact end point
    if (s.tool === 'brush') { g.save(); g.globalAlpha = settings.opacity; g.drawImage(strokeCanvas, 0, 0); g.restore(); strokeCanvas.getContext('2d').clearRect(0, 0, strokeCanvas.width, strokeCanvas.height); }
    else if (s.tool === 'ellipse') { g.save(); g.globalAlpha = settings.opacity; paintEllipse(g, s.start, s.cur, s.shift); g.restore(); }
    layers.markDirty(s.frameId);
    stroke = null; commit();
  };
  overlay.addEventListener('pointerup', finish);
  overlay.addEventListener('pointercancel', finish);
  overlay.addEventListener('pointerleave', () => { hover = null; if (!stroke) redrawOverlay(); });
  on('tool', () => { overlay.style.cursor = DRAW_TOOLS.includes(state.tool) ? 'crosshair' : 'default'; });
}
