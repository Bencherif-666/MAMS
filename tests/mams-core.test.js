import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bresenham,
  brushRect,
  shapeRects,
  floodFill,
  isEmpty,
  flipH,
  flipV,
  rotate90,
  binarizeAlpha,
  hexToRgb,
  rgbToHex,
} from '../MAMS/js/editor/pixelOps.js';

import {
  getBackgroundKey,
  buildMask,
  detectAuto,
  detectGrid,
} from '../MAMS/js/import/spriteDetector.js';

import {
  defaultLayers,
  defaultOrder,
  upgradeLayers,
  effectiveOrder,
  setOrder,
  snapshotOrders,
  restoreOrders,
} from '../MAMS/js/editor/layerModel.js';

function makeImage(width, height, painter) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      painter({ x, y, idx, data });
    }
  }
  return { width, height, data };
}

test('bresenham and basic pixel operations behave predictably', () => {
  assert.deepEqual(bresenham(0, 0, 3, 2), [[0, 0], [1, 1], [2, 1], [3, 2]]);
  assert.deepEqual(brushRect(4, 4, 3), { x: 3, y: 3, w: 3, h: 3 });

  const line = shapeRects('line', { x: 0, y: 0 }, { x: 2, y: 0 }, 1, false);
  assert.deepEqual(line.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })), [
    { x: 0, y: 0, w: 1, h: 1 },
    { x: 1, y: 0, w: 1, h: 1 },
    { x: 2, y: 0, w: 1, h: 1 },
  ]);

  const rect = shapeRects('rect', { x: 0, y: 0 }, { x: 2, y: 2 }, 1, false);
  assert.deepEqual(rect, [
    { x: 0, y: 0, w: 3, h: 1 },
    { x: 0, y: 2, w: 3, h: 1 },
    { x: 0, y: 1, w: 1, h: 1 },
    { x: 2, y: 1, w: 1, h: 1 },
  ]);

  const data = new Uint8ClampedArray(9 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0;
  }
  data[4] = 255; data[5] = 0; data[6] = 0; data[7] = 255;
  data[8] = 255; data[9] = 0; data[10] = 0; data[11] = 255;
  data[16] = 255; data[17] = 0; data[18] = 0; data[19] = 255;
  data[20] = 255; data[21] = 0; data[22] = 0; data[23] = 255;

  assert.equal(floodFill(data, 3, 3, 1, 0, [0, 255, 0, 255]), 4);
  assert.equal(isEmpty(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0])), true);
  assert.equal(isEmpty(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0])), false);
});

test('pixel transforms and color conversion preserve expected values', () => {
  const rgba = new Uint8ClampedArray([
    10, 20, 30, 255,
    40, 50, 60, 255,
    70, 80, 90, 255,
    100, 110, 120, 255,
  ]);

  const flippedH = flipH(rgba, 2, 2);
  assert.deepEqual(Array.from(flippedH), [
    40, 50, 60, 255,
    10, 20, 30, 255,
    100, 110, 120, 255,
    70, 80, 90, 255,
  ]);

  const flippedV = flipV(rgba, 2, 2);
  assert.deepEqual(Array.from(flippedV), [
    70, 80, 90, 255,
    100, 110, 120, 255,
    10, 20, 30, 255,
    40, 50, 60, 255,
  ]);

  const rotated = rotate90(rgba, 2, 2, true);
  assert.equal(rotated.w, 2);
  assert.equal(rotated.h, 2);
  assert.deepEqual(Array.from(rotated.data), [
    70, 80, 90, 255,
    10, 20, 30, 255,
    100, 110, 120, 255,
    40, 50, 60, 255,
  ]);

  const alpha = new Uint8ClampedArray([100, 90, 80, 10, 200, 210, 220, 190, 50, 60, 70, 128]);
  binarizeAlpha(alpha, 128);
  assert.deepEqual(Array.from(alpha), [100, 90, 80, 0, 200, 210, 220, 255, 50, 60, 70, 255]);

  assert.deepEqual(hexToRgb('#ff5500'), [255, 85, 0]);
  assert.equal(rgbToHex(255, 85, 0), '#ff5500');
});

test('sprite detection produces correct masks and boxes for transparent and opaque sprites', () => {
  const transparent = makeImage(4, 2, ({ x, y, idx, data }) => {
    if (x < 2 && y === 0) {
      data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 0;
      return;
    }
    data[idx] = 255; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255;
  });

  assert.deepEqual(Array.from(buildMask(transparent, 10)), [0, 0, 1, 1, 1, 1, 1, 1]);

  const opaque = makeImage(5, 3, ({ x, y, idx, data }) => {
    if (x === 0 && y === 0) {
      data[idx] = 10; data[idx + 1] = 20; data[idx + 2] = 30; data[idx + 3] = 255;
      return;
    }
    data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = 255; data[idx + 3] = 255;
  });
  assert.deepEqual(getBackgroundKey(opaque, 10), { r: 10, g: 20, b: 30, tol: 30 });

  const sprite = makeImage(5, 3, ({ x, y, idx, data }) => {
    data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 0;
    if (x >= 1 && x <= 2 && y >= 1 && y <= 2) {
      data[idx] = 255; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255;
    }
  });
  assert.deepEqual(detectAuto(sprite, { threshold: 10, gap: 0, minSize: 1 }), [{ x: 1, y: 1, w: 2, h: 2 }]);

  const gridImg = makeImage(4, 4, ({ x, y, idx, data }) => {
    if ((x === 0 && y === 0) || (x % 2 !== 0 || y % 2 !== 0)) {
      data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 0;
      return;
    }
    data[idx] = 255; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255;
  });
  const gridBoxes = detectGrid(gridImg, 2, 2, 10);
  assert.deepEqual(gridBoxes, [
    { x: 2, y: 0, w: 1, h: 1 },
    { x: 0, y: 2, w: 1, h: 1 },
    { x: 2, y: 2, w: 1, h: 1 },
  ]);
});

test('layer order migration and restore logic keeps ordered frames stable', () => {
  const project = {
    layers: [
      { id: 'background', name: 'Background', visible: true },
      { id: 'character', name: 'Character', visible: true },
      { id: 'ability', name: 'Ability', visible: true },
    ],
    baseOrder: ['background', 'character', 'ability'],
    frames: [{ id: 'f1', order: ['background', 'ability', 'character'] }, { id: 'f2' }],
  };

  upgradeLayers(project);
  assert.deepEqual(project.layers.map((layer) => layer.id), ['scene']);
  assert.deepEqual(project.baseOrder, ['scene']);
  assert.deepEqual(project.frames[0].order, ['scene']);

  const frameProject = {
    layers: [{ id: 'scene', name: 'Default', visible: true }, { id: 'draw_1', name: 'Drawing 1', visible: true }],
    baseOrder: ['draw_1', 'scene'],
    frames: [{ id: 'f1', order: ['scene', 'draw_1'] }, { id: 'f2', order: ['draw_1', 'scene'] }],
  };

  assert.deepEqual(effectiveOrder(frameProject, 1), ['draw_1', 'scene']);
  setOrder(frameProject, 1, ['scene', 'draw_1']);
  const snapshot = snapshotOrders(frameProject);
  frameProject.frames[0].order = ['draw_1', 'scene'];
  restoreOrders(frameProject, snapshot);

  assert.deepEqual(frameProject.frames[0].order, ['scene', 'draw_1']);
  assert.equal(frameProject.frames[1].order, undefined);

  assert.deepEqual(defaultLayers(), [{ id: 'scene', name: 'Default layer', visible: true }]);
  assert.deepEqual(defaultOrder(), ['scene']);
});
