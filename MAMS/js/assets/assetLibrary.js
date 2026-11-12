// Characters, abilities and backgrounds are one library filtered by `kind`.
import { state, uid } from '../core/state.js';
import { isPng } from '../utils/helpers.js';
import * as cache from './assetCache.js';

export const listAssets = (kind) => Object.values(state.project.assets).filter((a) => a.kind === kind);

export async function addAsset(asset) {
  await cache.load(asset);
  state.project.assets[asset.id] = asset;
}

export function removeAsset(id) {
  delete state.project.assets[id];
  for (const f of state.project.frames) {
    for (const k of ['character', 'ability', 'background']) if (f[k] === id) { f[k] = null; delete f.xf[k]; }
  }
  cache.release(id);
}

export async function addBackground(file) {
  if (!isPng(file)) throw new Error(`"${file.name}" is not a PNG image.`);
  const blob = file.slice(0, file.size, 'image/png');
  const bmp = await createImageBitmap(blob);
  const asset = { id: uid('bg'), name: file.name.replace(/\.png$/i, ''), kind: 'background', w: bmp.width, h: bmp.height, blob };
  bmp.close();
  await addAsset(asset);
}
