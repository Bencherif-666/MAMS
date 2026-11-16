import * as cache from '../assets/assetCache.js?v=8';
import { canvasToBlob } from '../utils/helpers.js?v=8';
import * as layers from './drawingLayers.js?v=8';
import { effectiveOrder, layerById } from './layerModel.js?v=8';

let ghostCanvas = null; // one reusable offscreen buffer for onion skin tinting

export function drawObject(ctx, bmp, t) {
  ctx.save();
  ctx.translate(t.x + t.w / 2, t.y + t.h / 2);
  ctx.rotate((t.rot * Math.PI) / 180);
  if (t.flipX) ctx.scale(-1, 1);                              // turned to look the other way
  if (t.opacity != null && t.opacity < 1) ctx.globalAlpha *= t.opacity;
  ctx.drawImage(bmp, -t.w / 2, -t.h / 2, t.w, t.h);
  ctx.restore();
}

/**
 * One layer of a frame: its sprites (back to front), then its drawing in front of them.
 * opts.before() runs right before the first non-background content (used to place onion ghosts),
 * opts.skipBackground / opts.skipDrawing leave things out, opts.live is the stroke being painted now.
 */
export function drawLayerContent(ctx, project, frame, layerId, opts = {}) {
  ctx.imageSmoothingEnabled = false;
  for (const o of frame.objects) {
    if (o.layer !== layerId) continue;
    const a = project.assets[o.asset], e = a && cache.get(o.asset);
    if (!e || (opts.skipBackground && a.kind === 'background')) continue;
    if (a.kind !== 'background' && opts.before) opts.before();
    drawObject(ctx, e.bmp, o);
  }
  if (opts.skipDrawing) return;
  const c = layers.getCanvas(frame.id, layerId);
  if (c) { if (opts.before) opts.before(); ctx.drawImage(c, 0, 0); }
  const live = opts.live;
  if (live && live.frameId === frame.id && live.layerId === layerId) { if (opts.before) opts.before(); ctx.save(); ctx.globalAlpha = live.alpha; ctx.drawImage(live.canvas, 0, 0); ctx.restore(); }
}

/** Tinted, translucent copy of another frame's sprites and drawings (never its backgrounds). Screen only. */
function drawGhost(ctx, project, ghost, alpha, withDrawing) {
  const { w, h } = project.stage, order = effectiveOrder(project, ghost.index);
  ghostCanvas ??= document.createElement('canvas');
  if (ghostCanvas.width !== w || ghostCanvas.height !== h) { ghostCanvas.width = w; ghostCanvas.height = h; }
  const g = ghostCanvas.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
  for (let i = order.length - 1; i >= 0; i--) {
    const L = layerById(project, order[i]);
    if (L && L.visible) drawLayerContent(g, project, ghost.frame, L.id, { skipBackground: true, skipDrawing: !withDrawing });
  }
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = ghost.tint; g.fillRect(0, 0, w, h);
  ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(ghostCanvas, 0, 0); ctx.restore();
}

/**
 * Draws the visible layers from the bottom of this frame's layer order to the top.
 * opts.ghosts = [{ frame, index, tint }] (onion skin, placed above backgrounds), opts.alpha, opts.drawings, opts.live.
 * Playback and exports pass no ghosts, so they never contain them.
 */
export function renderFrame(ctx, project, frame, opts = {}) {
  const { w, h } = project.stage;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  const order = effectiveOrder(project, project.frames.indexOf(frame));
  let pending = !!(opts.ghosts && opts.ghosts.length);
  const showGhosts = () => { if (!pending) return; pending = false; for (const g of opts.ghosts) drawGhost(ctx, project, g, opts.alpha ?? 0.35, opts.drawings ?? true); };
  for (let i = order.length - 1; i >= 0; i--) {
    const L = layerById(project, order[i]);
    if (L && L.visible) drawLayerContent(ctx, project, frame, L.id, { live: opts.live, before: showGhosts });
  }
  showGhosts();
}

export function exportFrameBlob(project, frame) {
  const c = document.createElement('canvas');
  c.width = project.stage.w; c.height = project.stage.h;
  renderFrame(c.getContext('2d'), project, frame); // no onion, no handles; hidden layers stay hidden
  return canvasToBlob(c);
}
