import { canvasToBlob } from '../utils/helpers.js';

/** Copies one rectangle into its own PNG blob; keys out an opaque background colour if given. */
export async function cutSprite(bitmap, r, key = null) {
  const c = document.createElement('canvas');
  c.width = r.w; c.height = r.h;
  const ctx = c.getContext('2d', { willReadFrequently: !!key });
  ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  if (key) {
    const img = ctx.getImageData(0, 0, r.w, r.h), d = img.data;
    for (let p = 0; p < d.length; p += 4) {
      if (Math.abs(d[p] - key.r) + Math.abs(d[p + 1] - key.g) + Math.abs(d[p + 2] - key.b) <= key.tol) d[p + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
  }
  return canvasToBlob(c);
}
