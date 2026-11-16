import { blobToDataURL, dataURLToBlob } from '../utils/helpers.js?v=8';
import { uid } from './state.js?v=8';

/** Metadata as JSON; every asset PNG and every drawing layer PNG as a data URL. Call drawingLayers.flush() first. */
export async function exportProject(project) {
  const assets = [], frames = [];
  for (const a of Object.values(project.assets)) {
    assets.push({ id: a.id, name: a.name, kind: a.kind, w: a.w, h: a.h, folder: a.folder || null, png: await blobToDataURL(a.blob) });
  }
  for (const f of project.frames) {
    const draws = {};
    for (const [lid, blob] of Object.entries(f.draws || {})) draws[lid] = await blobToDataURL(blob);
    frames.push({ ...f, draws });
  }
  const { id, name, fps, loop, stage, layers, baseOrder, folders } = project;
  return new Blob([JSON.stringify({ format: 'mams-1', id, name, fps, loop, stage, layers, baseOrder, folders: folders || [], frames, assets })], { type: 'application/json' });
}

export async function importProject(file) {
  const data = JSON.parse(await file.text());
  if (data.format !== 'mams-1') throw new Error('Not a MAMS project file.');
  const assets = {}, frames = [];
  for (const a of data.assets) {
    assets[a.id] = { id: a.id, name: a.name, kind: a.kind, w: a.w, h: a.h, folder: a.folder || null, blob: await dataURLToBlob(a.png) };
  }
  for (const f of data.frames) {
    const draws = {};
    for (const [lid, url] of Object.entries(f.draws || {})) draws[lid] = await dataURLToBlob(url);
    const frame = { ...f, draws };
    if (typeof f.draw === 'string') frame.draw = await dataURLToBlob(f.draw); // exported by an older version; migrateProject converts it
    frames.push(frame);
  }
  return { id: uid('proj'), name: data.name, fps: data.fps, loop: data.loop, stage: data.stage, layers: data.layers, baseOrder: data.baseOrder, folders: data.folders || [], frames, assets };
}
