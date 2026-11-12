import { blobToDataURL, dataURLToBlob } from '../utils/helpers.js';
import { uid } from './state.js';

/** Serialises metadata as JSON and every asset PNG as a data URL. */
export async function exportProject(project) {
  const assets = [];
  for (const a of Object.values(project.assets)) {
    assets.push({ id: a.id, name: a.name, kind: a.kind, w: a.w, h: a.h, png: await blobToDataURL(a.blob) });
  }
  const { id, name, fps, loop, stage, frames } = project;
  return new Blob([JSON.stringify({ format: 'mams-1', id, name, fps, loop, stage, frames, assets })], { type: 'application/json' });
}

export async function importProject(file) {
  const data = JSON.parse(await file.text());
  if (data.format !== 'mams-1') throw new Error('Not a MAMS project file.');
  const assets = {};
  for (const a of data.assets) {
    assets[a.id] = { id: a.id, name: a.name, kind: a.kind, w: a.w, h: a.h, blob: await dataURLToBlob(a.png) };
  }
  return { id: uid('proj'), name: data.name, fps: data.fps, loop: data.loop, stage: data.stage, frames: data.frames, assets };
}
