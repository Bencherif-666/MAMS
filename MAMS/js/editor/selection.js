// Selecting, moving, resizing and rotating the objects (sprites) of the current frame.
// Handles live on a separate overlay canvas, so they never become part of a frame.
import { state, currentFrame } from '../core/state.js?v=9';
import { emit } from '../core/eventManager.js?v=9';
import { clampBackground } from './transforms.js?v=9';
import { effectiveOrder, layerById } from './layerModel.js?v=9';
import { findObject } from './objects.js?v=9';

export const OVERLAY_MARGIN = 40; // stage pixels of space around the canvas so edge handles stay reachable
const M = OVERLAY_MARGIN, RAD = Math.PI / 180, MIN = 4, ROT_OFFSET = 26;
const HANDLES = [['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1], ['e', 1, 0], ['se', 1, 1], ['s', 0, 1], ['sw', -1, 1], ['w', -1, 0]];
const CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const center = (t) => [t.x + t.w / 2, t.y + t.h / 2];
const toWorld = (t, lx, ly) => { const [cx, cy] = center(t), [rx, ry] = rot(lx, ly, t.rot * RAD); return [cx + rx, cy + ry]; };
const toLocal = (t, wx, wy) => { const [cx, cy] = center(t); return rot(wx - cx, wy - cy, -t.rot * RAD); };
const visibleSel = () => { const o = findObject(state.sel), L = o && layerById(state.project, o.layer); return o && L && L.visible ? o : null; };

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

/** Topmost object under the point: layers from the top of the order, sprites from the front of each layer. Hidden layers are skipped. */
function hitBody(px, py) {
  const p = state.project, f = currentFrame();
  for (const id of effectiveOrder(p, state.current)) {
    const L = layerById(p, id);
    if (!L || !L.visible) continue;
    for (let i = f.objects.length - 1; i >= 0; i--) {
      const o = f.objects[i];
      if (o.layer !== id || !p.assets[o.asset]) continue;
      const [lx, ly] = toLocal(o, px, py);
      if (Math.abs(lx) <= o.w / 2 && Math.abs(ly) <= o.h / 2) return o;
    }
  }
  return null;
}

export function drawOverlay(ctx, overlay, zoom, hidden) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  const t = !hidden && state.tool === 'select' && visibleSel();
  if (!t) return;
  const s = 1 / zoom, hs = 8 * s, [cx, cy] = center(t);
  ctx.save(); ctx.translate(M + cx, M + cy); ctx.rotate(t.rot * RAD);
  ctx.lineWidth = 1.5 * s; ctx.strokeStyle = '#5b9dff'; ctx.fillStyle = '#fff';
  ctx.strokeRect(-t.w / 2, -t.h / 2, t.w, t.h);
  ctx.beginPath(); ctx.moveTo(0, -t.h / 2); ctx.lineTo(0, -t.h / 2 - ROT_OFFSET * s); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -t.h / 2 - ROT_OFFSET * s, 5 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (const [, hx, hy] of HANDLES) { ctx.fillRect(hx * t.w / 2 - hs / 2, hy * t.h / 2 - hs / 2, hs, hs); ctx.strokeRect(hx * t.w / 2 - hs / 2, hy * t.h / 2 - hs / 2, hs, hs); }
  ctx.restore();
}

export function initSelection({ overlay, getZoom, redraw, commit, canEdit }) {
  let drag = null;
  const pt = (e) => { const r = overlay.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * overlay.width - M, (e.clientY - r.top) / r.height * overlay.height - M]; };

  overlay.onpointerdown = (e) => {
    if (state.tool !== 'select' || !canEdit()) return;
    const [px, py] = pt(e), cur = visibleSel(), h = cur && hitHandle(cur, px, py, getZoom());
    let target = null, mode = 'move';
    if (h) { target = cur; mode = h === 'rot' ? 'rot' : 'resize'; }
    else {
      target = hitBody(px, py);
      state.sel = target ? target.id : null;
      if (target) state.activeLayer = target.layer; // clicking an object selects its layer
      emit('select');
    }
    if (target) {
      drag = { mode, handle: h, id: target.id, start: { x: target.x, y: target.y, w: target.w, h: target.h, rot: target.rot }, px, py };
      overlay.setPointerCapture(e.pointerId);
    }
    redraw();
  };

  overlay.onpointermove = (e) => {
    const [px, py] = pt(e);
    if (!drag) {
      if (state.tool !== 'select' || !canEdit()) return;
      const cur = visibleSel(), h = cur && hitHandle(cur, px, py, getZoom());
      overlay.style.cursor = h ? (h === 'rot' ? 'grab' : CURSOR[h]) : hitBody(px, py) ? 'move' : 'default';
      return;
    }
    const o = findObject(drag.id), s = drag.start;
    if (!o) { drag = null; return; }
    if (drag.mode === 'move') { o.x = Math.round(s.x + px - drag.px); o.y = Math.round(s.y + py - drag.py); }
    else if (drag.mode === 'rot') {
      const [cx, cy] = center(s);
      let a = Math.atan2(py - cy, px - cx) / RAD + 90;
      if (e.shiftKey) a = Math.round(a / 15) * 15; // Shift snaps to 15 degrees
      o.rot = Math.round((((a % 360) + 360) % 360) * 10) / 10;
    } else Object.assign(o, resizeTransform(s, drag.handle, px, py, !e.shiftKey)); // Shift = free stretch
    clampBackground(state.project, o);
    redraw();
  };

  overlay.onpointerup = () => { if (drag) { drag = null; commit(); } };
}
