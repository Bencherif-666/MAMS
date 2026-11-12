// Single mutable application state. UI modules read it and announce changes through eventManager.
export const state = {
  project: null, current: 0, tab: 'characters', zoom: 1, tool: 'select',
  sel: null, // selected layer on the canvas: 'character' | 'ability' | 'background' | null
  onion: { on: true, prev: true, next: false, alpha: 0.35 }, // editing aid only, never saved or exported
};

export const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

/**
 * Frame: character/ability/background hold asset ids.
 * xf[kind] = { x, y, w, h, rot } is the per-frame transform (the PNG asset is never modified).
 * bgMode decides the default placement of the background when no xf.background exists.
 */
export function newFrame(duration = 83) {
  return { id: uid('frame'), duration, character: null, ability: null, background: null, xf: {}, bgMode: 'auto', layers: [] };
}

export function newProject(name = 'Untitled') {
  return { id: uid('proj'), version: 2, name, fps: 12, loop: true, stage: { w: 640, h: 360 }, assets: {}, frames: [newFrame()] };
}

export const currentFrame = () => state.project.frames[state.current];
