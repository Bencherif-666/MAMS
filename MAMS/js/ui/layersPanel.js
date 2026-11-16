// Layers panel: a floating box beside the toolbox, opened by the vertical "Layers" button.
// Rectangles run from top (in front) to bottom (behind). Click = select the layer, drag = reorder,
// eye = hide, double-click the name = rename.
import { state, currentFrame } from '../core/state.js?v=8';
import { emit, on } from '../core/eventManager.js?v=8';
import { drawLayerContent } from '../editor/canvasEditor.js?v=8';
import { effectiveOrder, orderSource, layerById, setOrder } from '../editor/layerModel.js?v=8';
import { addLayer, duplicateLayer, deleteLayer } from '../editor/layerActions.js?v=8';
import { $, el } from '../utils/helpers.js?v=8';

const ICON = {
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/>',
  dup: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  del: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/>',
};
const icon = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const isOpen = () => document.body.classList.contains('layers-open');

export function toggleLayersPanel() {
  const open = document.body.classList.toggle('layers-open');
  const b = $('#btnLayers'); if (b) b.classList.toggle('on', open);
  if (open) build();
}

function drawThumb(cv, L) {
  const g = cv.getContext('2d'), p = state.project;
  g.clearRect(0, 0, cv.width, cv.height);
  g.save(); g.scale(cv.width / p.stage.w, cv.height / p.stage.h); drawLayerContent(g, p, currentFrame(), L.id); g.restore();
}

function moveLayer(dragId, targetId, after) {
  const p = state.project, o = effectiveOrder(p, state.current).filter((x) => x !== dragId);
  o.splice(o.indexOf(targetId) + (after ? 1 : 0), 0, dragId);
  setOrder(p, state.current, o); // applies from this frame onward, until a later frame changes it again
  emit('frames');
}

function build() {
  if (!isOpen() || !state.project) return;
  const p = state.project, list = $('#layList');
  list.replaceChildren();
  for (const id of effectiveOrder(p, state.current)) {
    const L = layerById(p, id);
    const card = el('div', `layer${state.activeLayer === id ? ' active' : ''}${L.visible ? '' : ' off'}`);
    card.draggable = true; card.dataset.id = id; card.title = 'Click to select this layer. Drag to reorder.';

    const eye = el('button', 'lbtn'); eye.innerHTML = icon(L.visible ? ICON.eye : ICON.eyeOff);
    eye.title = L.visible ? 'Hide layer' : 'Show layer';
    eye.onclick = (e) => {
      e.stopPropagation(); L.visible = !L.visible;
      if (!L.visible && currentFrame().objects.some((o) => o.id === state.sel && o.layer === id)) state.sel = null;
      emit('frames');
    };
    const th = el('canvas', 'lthumb'); th.width = 44; th.height = 25; drawThumb(th, L);
    const name = el('div', 'lname'); name.append(el('span', 'ltitle', L.name));
    name.ondblclick = (e) => { e.stopPropagation(); const n = prompt('Layer name', L.name); if (n && n.trim()) { L.name = n.trim().slice(0, 40); emit('frames'); } };
    const dup = el('button', 'lbtn'); dup.innerHTML = icon(ICON.dup); dup.title = 'Duplicate layer';
    dup.onclick = (e) => { e.stopPropagation(); duplicateLayer(L); };
    const del = el('button', 'lbtn'); del.innerHTML = icon(ICON.del); del.disabled = p.layers.length <= 1;
    del.title = p.layers.length <= 1 ? 'A project needs at least one layer' : 'Delete layer';
    del.onclick = (e) => { e.stopPropagation(); deleteLayer(L); };
    card.append(eye, th, name, dup, del);

    card.onclick = () => { state.activeLayer = id; emit('select'); build(); };
    card.ondragstart = (e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; };
    card.ondragover = (e) => {
      e.preventDefault();
      const r = card.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      card.classList.toggle('drop-after', after); card.classList.toggle('drop-before', !after);
    };
    card.ondragleave = () => card.classList.remove('drop-before', 'drop-after');
    card.ondrop = (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/plain'), r = card.getBoundingClientRect();
      card.classList.remove('drop-before', 'drop-after');
      if (from && from !== id) moveLayer(from, id, e.clientY > r.top + r.height / 2);
    };
    list.append(card);
  }
  const src = orderSource(p, state.current);
  $('#layNote').textContent = src < 0 ? 'Top = in front. Drag to reorder.'
    : src === state.current ? 'Order set at this frame; it continues forward.' : `Order from frame ${src + 1}.`;
}

export function initLayersPanel() {
  $('#layAdd').onclick = addLayer;
  on('frames', build); on('stage', build); on('assets', build); on('select', build);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) toggleLayersPanel(); });
}
