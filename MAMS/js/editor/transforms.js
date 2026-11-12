// Per-frame object transforms. Assets stay untouched; frames store { x, y, w, h, rot } per layer.
export const BG_MODES = { auto: 'Auto', stretch: 'Stretch to canvas', original: 'Original size', cover: 'Cover' };

const box = (w, h, x, y) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), rot: 0 });

/** Placement used when a frame has no stored transform for this layer. */
export function defaultXf(project, frame, kind, bmp) {
  const { w: sw, h: sh } = project.stage, bw = bmp.width, bh = bmp.height;
  if (kind !== 'background') return box(bw, bh, (sw - bw) / 2, sh - bh - 10); // bottom centre
  switch (frame.bgMode || 'auto') {
    case 'stretch': return box(sw, sh, 0, 0);
    case 'original': return box(bw, bh, 0, 0);
    case 'cover': { const s = Math.max(sw / bw, sh / bh); return box(bw * s, bh * s, (sw - bw * s) / 2, sh - bh * s); }
    default: { // auto
      if (bw <= sw && bh <= sh) return box(sw, sh, 0, 0);                       // smaller: stretch to the canvas
      if (bh < sh) { const s = sh / bh; return box(bw * s, sh, (sw - bw * s) / 2, 0); } // wide but short: fit height
      const s = Math.max(1, sw / bw);                                            // tall: real size, bottom aligned
      return box(bw * s, bh * s, (sw - bw * s) / 2, sh - bh * s);
    }
  }
}

export const getXf = (project, frame, kind, bmp) => (frame.xf && frame.xf[kind]) || defaultXf(project, frame, kind, bmp);

/** Returns the stored transform, creating it from the default the first time it is edited. */
export function ensureXf(project, frame, kind, bmp) {
  frame.xf ??= {};
  return (frame.xf[kind] ??= { ...defaultXf(project, frame, kind, bmp) });
}

/** Auto/Cover backgrounds taller than the canvas may slide, but never reveal an empty strip above or below. */
export function clampBackground(project, frame, t) {
  const mode = frame.bgMode || 'auto', sh = project.stage.h;
  if ((mode === 'auto' || mode === 'cover') && t.rot === 0 && t.h >= sh) t.y = Math.min(0, Math.max(sh - t.h, t.y));
}

/** Upgrades older projects in place: position-only frames become full transforms. */
export function migrateProject(p) {
  for (const f of p.frames) {
    if (!f.xf) { f.xf = {}; f.bgMode = 'stretch'; } // old projects always stretched backgrounds: keep that look
    f.bgMode ??= 'auto';
    if (f.pos) {
      for (const [k, [x, y]] of Object.entries(f.pos)) {
        const a = p.assets[f[k]];
        if (a && k !== 'background') f.xf[k] = { x, y, w: a.w, h: a.h, rot: 0 };
      }
      delete f.pos;
    }
  }
  return p;
}
