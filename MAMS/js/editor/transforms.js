// Placement of objects and upgrade of projects saved by older versions.
import { upgradeLayers } from './layerModel.js?v=8';
import { uid } from '../core/state.js?v=8';

export const BG_MODES = { auto: 'Auto', stretch: 'Stretch to canvas', original: 'Original size', cover: 'Cover' };
const box = (w, h, x, y) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), rot: 0 });

/** Starting position and size of an asset on the canvas. Sprites: bottom centre. Backgrounds: by mode. */
export function placeDefault(project, asset, mode = 'auto') {
  const { w: sw, h: sh } = project.stage, bw = asset.w, bh = asset.h;
  if (asset.kind !== 'background') return box(bw, bh, (sw - bw) / 2, sh - bh - 10);
  switch (mode) {
    case 'stretch': return box(sw, sh, 0, 0);
    case 'original': return box(bw, bh, 0, 0);
    case 'cover': { const s = Math.max(sw / bw, sh / bh); return box(bw * s, bh * s, (sw - bw * s) / 2, sh - bh * s); }
    default: { // auto
      if (bw <= sw && bh <= sh) return box(sw, sh, 0, 0);                              // smaller: stretch to the canvas
      if (bh < sh) { const s = sh / bh; return box(bw * s, sh, (sw - bw * s) / 2, 0); } // wide but short: fit height
      const s = Math.max(1, sw / bw);                                                   // tall: real size, bottom aligned
      return box(bw * s, bh * s, (sw - bw * s) / 2, sh - bh * s);
    }
  }
}

/** Auto/Cover backgrounds taller than the canvas may slide, but never reveal an empty strip above or below. */
export function clampBackground(project, obj) {
  const sh = project.stage.h;
  if ((obj.mode === 'auto' || obj.mode === 'cover') && obj.rot === 0 && obj.h >= sh) obj.y = Math.min(0, Math.max(sh - obj.h, obj.y));
}

/** Upgrades older projects in place. Old background/character/ability become objects of the Default layer. */
export function migrateProject(p) {
  upgradeLayers(p);
  p.folders ??= [];
  const sceneId = (p.layers.find((l) => l.id === 'scene') || p.layers[0]).id;
  for (const f of p.frames) {
    f.draws ??= {};
    if (f.draw) f.draws.draw_1 = f.draw; // single drawing of Step 3 becomes "Drawing 1"
    delete f.draw;
    if (f.objects) continue;             // already in the current format
    if (!f.xf) { f.xf = {}; f.bgMode = 'stretch'; } // very old projects always stretched backgrounds
    f.bgMode ??= 'auto';
    if (f.pos) { for (const [k, [x, y]] of Object.entries(f.pos)) { const a = p.assets[f[k]]; if (a && k !== 'background') f.xf[k] = { x, y, w: a.w, h: a.h, rot: 0 }; } delete f.pos; }
    f.objects = [];
    for (const kind of ['background', 'character', 'ability']) { // old drawing order, bottom to top
      const a = f[kind] && p.assets[f[kind]];
      if (!a) continue;
      f.objects.push({ id: uid('obj'), layer: sceneId, asset: a.id, mode: kind === 'background' ? f.bgMode : null, ...(f.xf[kind] || placeDefault(p, a, f.bgMode)) });
    }
    delete f.background; delete f.character; delete f.ability; delete f.xf; delete f.bgMode;
  }
  p.version = 4;
  return p;
}
