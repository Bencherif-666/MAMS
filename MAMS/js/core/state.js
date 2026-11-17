// Single mutable application state. UI modules read it and announce changes through eventManager.
import { defaultLayers, defaultOrder } from '../editor/layerModel.js?v=9';

export const state = {
  project: null, current: 0, tab: 'characters', zoom: 1, tool: 'select',
  dirty: false,         // the project changed since it was last saved or opened
  sel: null,            // id of the selected object (sprite) in the current frame
  activeLayer: 'scene', // selected layer: new sprites, brush, eraser, ellipse and blur all go to it
  folder: { character: null, ability: null, background: null }, // open asset folder of each category (null = top level)
  onion: { on: true, prev: true, next: false, alpha: 0.35, drawings: true }, // editing aid only, never saved or exported
};

export const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

/**
 * Frame: objects = [{ id, layer, asset, x, y, w, h, rot, mode? }] in drawing order (last = in front).
 * draws[layerId] = PNG blob of that layer's drawing. order (optional) = layer order set at this frame.
 */
export function newFrame(duration = 83) {
  return { id: uid('frame'), duration, objects: [], draws: {} };
}

export function newProject(name = 'Untitled') {
  return {
    id: uid('proj'), version: 5, created: Date.now(), name, fps: 12, loop: true, stage: { w: 640, h: 360 }, assets: {}, folders: [],
    layers: defaultLayers(), baseOrder: defaultOrder(), frames: [newFrame()],
  };
}

export const currentFrame = () => state.project.frames[state.current];
