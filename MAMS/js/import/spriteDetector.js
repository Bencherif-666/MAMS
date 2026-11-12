// Sprite detection on an ImageData: background mask -> connected components -> merge -> order.

/** If the sheet's top-left pixel is opaque we treat that colour as the background key. */
export function getBackgroundKey(img, threshold) {
  const d = img.data;
  return d[3] === 255 ? { r: d[0], g: d[1], b: d[2], tol: threshold * 3 } : null;
}

/** 1 = sprite pixel, 0 = background. Uses alpha for transparent sheets, colour distance for opaque ones. */
export function buildMask(img, threshold) {
  const { data } = img;
  const key = getBackgroundKey(img, threshold);
  const mask = new Uint8Array(img.width * img.height);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (key) {
      const dist = Math.abs(data[p] - key.r) + Math.abs(data[p + 1] - key.g) + Math.abs(data[p + 2] - key.b);
      mask[i] = dist > key.tol ? 1 : 0;
    } else mask[i] = data[p + 3] > threshold ? 1 : 0;
  }
  return mask;
}

/** 8-connected flood fill with an explicit stack (no recursion). Returns bounding boxes. */
function findComponents(mask, w, h) {
  const seen = new Uint8Array(w * h), boxes = [], stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    boxes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return boxes;
}

const near = (a, b, g) => a.x - g <= b.x + b.w && b.x - g <= a.x + a.w && a.y - g <= b.y + b.h && b.y - g <= a.y + a.h;
function union(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Merges boxes closer than `gap` px so detached bits (sparks, shadows) join their sprite. */
function mergeBoxes(boxes, gap) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; ) {
        if (near(boxes[i], boxes[j], gap)) { boxes[i] = union(boxes[i], boxes[j]); boxes.splice(j, 1); changed = true; j = i + 1; } else j++;
      }
    }
  }
  return boxes;
}

/** Reading order: group into horizontal bands, then left to right. */
function orderBoxes(boxes) {
  boxes.sort((p, q) => p.y - q.y);
  const rows = [];
  for (const b of boxes) {
    const mid = b.y + b.h / 2;
    const row = rows.find((r) => mid >= r.top && mid <= r.bot);
    if (row) { row.items.push(b); row.top = Math.min(row.top, b.y); row.bot = Math.max(row.bot, b.y + b.h); }
    else rows.push({ top: b.y, bot: b.y + b.h, items: [b] });
  }
  return rows.flatMap((r) => r.items.sort((p, q) => p.x - q.x));
}

export function detectAuto(img, { threshold = 10, gap = 2, minSize = 3 } = {}) {
  const mask = buildMask(img, threshold);
  let boxes = findComponents(mask, img.width, img.height);
  if (gap > 0) boxes = mergeBoxes(boxes, gap);
  return orderBoxes(boxes.filter((b) => b.w >= minSize && b.h >= minSize));
}

/** Splits the sheet into rows x cols cells, then trims each cell to its visible content. */
export function detectGrid(img, rows, cols, threshold = 10) {
  const mask = buildMask(img, threshold), { width: W, height: H } = img;
  const cw = Math.floor(W / cols), ch = Math.floor(H / rows), out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = r * ch; y < (r + 1) * ch; y++) for (let x = c * cw; x < (c + 1) * cw; x++) {
      if (!mask[y * W + x]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 >= 0) out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
}
