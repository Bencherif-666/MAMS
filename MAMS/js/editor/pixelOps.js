// Pure pixel helpers for the sprite editor (work on raw RGBA arrays, so they are easy to test).

/** Every pixel on the straight line between two pixels (Bresenham). */
export function bresenham(x0, y0, x1, y1) {
  const pts = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

/** Square brush of n×n pixels around (x, y). */
export const brushRect = (x, y, n) => ({ x: x - Math.floor(n / 2), y: y - Math.floor(n / 2), w: n, h: n });

/** Rectangles to fill for a line or a rectangle (outline thickness n, or filled). */
export function shapeRects(kind, a, b, n, filled) {
  if (kind === 'line') return bresenham(a.x, a.y, b.x, b.y).map(([x, y]) => brushRect(x, y, n));
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (filled || w <= 2 * n || h <= 2 * n) return [{ x: x0, y: y0, w, h }];
  return [{ x: x0, y: y0, w, h: n }, { x: x0, y: y1 - n + 1, w, h: n }, { x: x0, y: y0 + n, w: n, h: h - 2 * n }, { x: x1 - n + 1, y: y0 + n, w: n, h: h - 2 * n }];
}

/** Paint bucket: replaces the connected area of identical pixels with colour c = [r, g, b, a]. Returns the pixel count. */
export function floodFill(data, w, h, sx, sy, c) {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return 0;
  const i0 = (sy * w + sx) * 4, tr = data[i0], tg = data[i0 + 1], tb = data[i0 + 2], ta = data[i0 + 3];
  if (tr === c[0] && tg === c[1] && tb === c[2] && ta === c[3]) return 0;
  const same = (i) => data[i] === tr && data[i + 1] === tg && data[i + 2] === tb && data[i + 3] === ta;
  const stack = [sx, sy]; let n = 0;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    let xl = x;
    while (xl >= 0 && same((y * w + xl) * 4)) xl--;
    xl++;
    let up = false, down = false;
    for (let xx = xl; xx < w && same((y * w + xx) * 4); xx++) {
      const i = (y * w + xx) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3]; n++;
      if (y > 0) { const s = same(((y - 1) * w + xx) * 4); if (s && !up) { stack.push(xx, y - 1); up = true; } else if (!s) up = false; }
      if (y < h - 1) { const s = same(((y + 1) * w + xx) * 4); if (s && !down) { stack.push(xx, y + 1); down = true; } else if (!s) down = false; }
    }
  }
  return n;
}

export function isEmpty(d) { for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; }

function remap(d, w, h, nw, nh, map) {
  const o = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [nx, ny] = map(x, y), s = (y * w + x) * 4, t = (ny * nw + nx) * 4;
    o[t] = d[s]; o[t + 1] = d[s + 1]; o[t + 2] = d[s + 2]; o[t + 3] = d[s + 3];
  }
  return o;
}
export const flipH = (d, w, h) => remap(d, w, h, w, h, (x, y) => [w - 1 - x, y]);
export const flipV = (d, w, h) => remap(d, w, h, w, h, (x, y) => [x, h - 1 - y]);
/** Exact 90° rotation. The result has swapped width and height. */
export function rotate90(d, w, h, clockwise) {
  return { data: remap(d, w, h, h, w, (x, y) => (clockwise ? [h - 1 - y, x] : [y, w - 1 - x])), w: h, h: w };
}
/** Makes alpha all-or-nothing, so rotated or resized parts keep crisp pixel edges. */
export function binarizeAlpha(d, t = 128) { for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= t ? 255 : 0; }

export const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
