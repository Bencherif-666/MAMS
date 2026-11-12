// Selecting, moving, resizing and rotating layers on the canvas. Handles live on a separate overlay canvas.
import { state, currentFrame } from '../core/state.js';
import { emit } from '../core/eventManager.js';
import * as cache from '../assets/assetCache.js';
import { getXf, ensureXf, clampBackground } from './transforms.js';
import { toast } from '../utils/helpers.js';

export const OVERLAY_MARGIN = 40; // stage pixels of space around the canvas so edge handles stay reachable
const M = OVERLAY_MARGIN, RAD = Math.PI / 180, MIN = 4, ROT_OFFSET = 26;
const ORDER = ['ability', 'character', 'background']; // hit-test order, top first
const HANDLES = [['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1], ['e', 1, 0], ['se', 1, 1], ['s', 0, 1], ['sw', -1, 1], ['w', -1, 0]];
const CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const center = (t) => [t.x + t.w / 2, t.y + t.h / 2];
const toWorld = (t, lx, ly) => { const [cx, cy] = center(t), [rx, ry] = rot(lx, ly, t.rot * RAD); return [cx + rx, cy + ry]; };
const toLocal = (t, wx, wy) => { const [cx, cy] = center(t); return rot(wx - cx, wy - cy, -t.rot * RAD); };

function objOf(kind) {
  const f = currentFrame(), e = f[kind] && cache.get(f[kind]);
  return e ? { kind, bmp: e.bmp, t: getXf(state.project, f, kind, e.bmp) } : null;
}

/** Pure resize maths: the handle opposite the dragged one stays fixed, rotation respected. */
export function resizeTransform(start, id, px, py, lockRatio) {
  const [, hx, hy] = HANDLES.find((h) => h[0] === id);
  const [ax, ay] = toWorld(start, -hx * start.w / 2, -hy * start.h / 2);
  const [vx, vy] = rot(px - ax, py - ay, -start.rot * RAD);
  let w = hx ? Math.max(MIN, hx * vx) : start.w, h = hy ? Math.max(MIN, hy * vy) : start.h;
  if (lockRatio) {
    const k = hx && hy ? Math.max(w / start.w, h / start.h) : hx ? w / start.w : h / start.h;
    w = Math.max(MIN, start.w * k); h = Math.max(MIN, start.h * k);
  }
  const [dx, dy] = rot(hx * w / 2, hy * h / 2, start.rot * RAD);
  return { w: Math.round(w), h: Math.round(h), x: Math.round(ax + dx - w / 2), y: Math.round(ay + dy - h / 2) };
}

const hitHandle = (t, px, py, zoom) => {
  const r = 11 / zoom;
  for (const [id, hx, hy] of HANDLES) {
    const [x, y] = toWorld(t, hx * t.w / 2, hy * t.h / 2);
    if (Math.hypot(px - x, py - y) <= r) return id;
  }
  const [rx, ry] = toWorld(t, 0, -t.h / 2 - ROT_OFFSET / zoom);
  return Math.hypot(px - rx, py - ry) <= r ? 'rot' : null;
};
function hitBody(px, py) {
  for (const kind of ORDER) {
    const o = objOf(kind); if (!o) continue;
    const [lx, ly] = toLocal(o.t, px, py);
    if (Math.abs(lx) <= o.t.w / 2 && Math.abs(ly) <= o.t.h / 2) return o;
  }
  return null;
}

export function drawOverlay(ctx, overlay, zoom, hidden) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  const o = !hidden && state.sel && objOf(state.sel);
  if (!o) return;
  const { t } = o, s = 1 / zoom, hs = 8 * s, [cx, cy] = center(t);
  ctx.save(); ctx.translate(M + cx, M + cy); ctx.rotate(t.rot * RAD);
  ctx.lineWidth = 1.5 * s; ctx.strokeStyle = '#5b9dff'; ctx.fillStyle = '#fff';
  ctx.strokeRect(-t.w / 2, -t.h / 2, t.w, t.h);
  ctx.beginPath(); ctx.moveTo(0, -t.h / 2); ctx.lineTo(0, -t.h / 2 - ROT_OFFSET * s); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -t.h / 2 - ROT_OFFSET * s, 5 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (const [, hx, hy] of HANDLES) { ctx.fillRect(hx * t.w / 2 - hs / 2, hy * t.h / 2 - hs / 2, hs, hs); ctx.strokeRect(hx * t.w / 2 - hs / 2, hy * t.h / 2 - hs / 2, hs, hs); }
  ctx.restore();
}

export function deleteSelected() {
  const f = currentFrame(), k = state.sel;
  if (!k || !f[k]) { toast('Select an object on the canvas first.', true); return; }
  f[k] = null; delete f.xf[k]; state.sel = null; emit('frames');
}
export function resetSelected() {
  const f = currentFrame(), k = state.sel;
  if (!k || !f[k]) { toast('Select an object on the canvas first.', true); return; }
  delete f.xf[k]; emit('frames'); // back to the default size/position (backgrounds: back to their mode)
}

export function initSelection({ overlay, getZoom, redraw, commit, canEdit }) {
  let drag = null;
  const pt = (e) => { const r = overlay.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * overlay.width - M, (e.clientY - r.top) / r.height * overlay.height - M]; };

  overlay.onpointerdown = (e) => {
    if (state.tool !== 'select' || !canEdit()) return;
    const [px, py] = pt(e), f = currentFrame(), cur = state.sel && objOf(state.sel);
    const h = cur && hitHandle(cur.t, px, py, getZoom());
    let target = null, mode = 'move';
    if (h) { target = cur; mode = h === 'rot' ? 'rot' : 'resize'; }
    else { target = hitBody(px, py); state.sel = target ? target.kind : null; }
    if (target) {
      const t = ensureXf(state.project, f, target.kind, target.bmp);
      drag = { mode, handle: h, kind: target.kind, start: { ...t }, px, py };
      overlay.setPointerCapture(e.pointerId);
    }
    redraw();
  };

  overlay.onpointermove = (e) => {
    const [px, py] = pt(e);
    if (!drag) {
      if (state.tool !== 'select' || !canEdit()) { overlay.style.cursor = 'default'; return; }
      const cur = state.sel && objOf(state.sel), h = cur && hitHandle(cur.t, px, py, getZoom());
      overlay.style.cursor = h ? (h === 'rot' ? 'grab' : CURSOR[h]) : hitBody(px, py) ? 'move' : 'default';
      return;
    }
    const f = currentFrame(), t = f.xf[drag.kind], s = drag.start;
    if (drag.mode === 'move') { t.x = Math.round(s.x + px - drag.px); t.y = Math.round(s.y + py - drag.py); }
    else if (drag.mode === 'rot') {
      const [cx, cy] = center(s);
      let a = Math.atan2(py - cy, px - cx) / RAD + 90;
      if (e.shiftKey) a = Math.round(a / 15) * 15; // Shift snaps to 15 degrees
      t.rot = Math.round((((a % 360) + 360) % 360) * 10) / 10;
    } else Object.assign(t, resizeTransform(s, drag.handle, px, py, !e.shiftKey)); // Shift = free stretch
    if (drag.kind === 'background') clampBackground(state.project, f, t);
    redraw();
  };

  overlay.onpointerup = () => { if (drag) { drag = null; commit(); } };
}
