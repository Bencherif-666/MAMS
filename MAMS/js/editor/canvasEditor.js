import * as cache from '../assets/assetCache.js';
import { canvasToBlob } from '../utils/helpers.js';
import { getXf } from './transforms.js';

export const LAYERS = ['character', 'ability']; // drawing order, bottom to top
let ghostCanvas = null; // one reusable offscreen buffer for onion skin tinting

export function drawObject(ctx, bmp, t) {
  ctx.save();
  ctx.translate(t.x + t.w / 2, t.y + t.h / 2);
  ctx.rotate((t.rot * Math.PI) / 180);
  ctx.drawImage(bmp, -t.w / 2, -t.h / 2, t.w, t.h);
  ctx.restore();
}

function drawLayers(ctx, project, frame) {
  for (const kind of LAYERS) {
    const e = frame[kind] && cache.get(frame[kind]);
    if (e) drawObject(ctx, e.bmp, getXf(project, frame, kind, e.bmp));
  }
}

/** Tinted, translucent copy of another frame's sprites. Drawn on screen only. */
function drawGhost(ctx, project, frame, tint, alpha) {
  const { w, h } = project.stage;
  ghostCanvas ??= document.createElement('canvas');
  if (ghostCanvas.width !== w || ghostCanvas.height !== h) { ghostCanvas.width = w; ghostCanvas.height = h; }
  const g = ghostCanvas.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = false;
  drawLayers(g, project, frame);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = tint; g.fillRect(0, 0, w, h);
  ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(ghostCanvas, 0, 0); ctx.restore();
}

/**
 * background -> onion ghosts (optional) -> character -> ability.
 * opts.ghosts = [{ frame, tint }], opts.alpha. Exports and playback pass no opts, so they never contain ghosts.
 */
export function renderFrame(ctx, project, frame, opts = {}) {
  const { w, h } = project.stage;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  const bg = frame.background && cache.get(frame.background);
  if (bg) drawObject(ctx, bg.bmp, getXf(project, frame, 'background', bg.bmp));
  for (const g of opts.ghosts || []) drawGhost(ctx, project, g.frame, g.tint, opts.alpha ?? 0.35);
  drawLayers(ctx, project, frame);
}

export function exportFrameBlob(project, frame) {
  const c = document.createElement('canvas');
  c.width = project.stage.w; c.height = project.stage.h;
  renderFrame(c.getContext('2d'), project, frame); // no onion, no selection handles
  return canvasToBlob(c);
}
