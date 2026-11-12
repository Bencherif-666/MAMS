import { blobToDataURL, dataURLToBlob } from '../utils/helpers.js';
import { uid } from './state.js';

/** Metadata as JSON; every asset PNG and every frame drawing as a data URL. Call drawingLayers.flush() first. */
export async function exportProject(project) {
  const assets = [], frames = [];
  for (const a of Object.values(project.assets)) {
    assets.push({ id: a.id, name: a.name, kind: a.kind, w: a.w, h: a.h, png: await blobToDataURL(a.blob) });
  }
  for (const f of project.frames) frames.push({ ...f, draw: f.draw ? await blobToDataURL(f.draw) : null });
  const { id, name, fps, loop, stage } = project;
  return new Blob([JSON.stringify({ format: 'mams-1', id, name, fps, loop, stage, frames, assets })], { type: 'application/json' });
}

export async function importProject(file) {
  const data = JSON.parse(await file.text());
  if (data.format !== 'mams-1') throw new Error('Not a MAMS project file.');
  const assets = {};
  for (const a of data.assets) {
    assets[a.id] = { id: a.id, name: a.name, kind: a.kind, w: a.w, h: a.h, blob: await dataURLToBlob(a.png) };
  }
  const frames = [];
  for (const f of data.frames) frames.push({ ...f, draw: f.draw ? await dataURLToBlob(f.draw) : null });
  return { id: uid('proj'), name: data.name, fps: data.fps, loop: data.loop, stage: data.stage, frames, assets };
}
