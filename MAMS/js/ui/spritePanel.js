// Sprite panel: replaces the asset list while an object is selected on the canvas.
import { state } from '../core/state.js?v=8';
import { emit } from '../core/eventManager.js?v=8';
import * as cache from '../assets/assetCache.js?v=8';
import { findObject, moveSelectedToLayer, deleteSelected } from '../editor/objects.js?v=8';
import { clampBackground } from '../editor/transforms.js?v=8';
import { effectiveOrder, layerById } from '../editor/layerModel.js?v=8';
import { openEditor } from '../editor/spriteEditor.js?v=8';
import { $ } from '../utils/helpers.js?v=8';

let layerSig = '';
const setIfIdle = (id, v) => { const i = $(id); if (document.activeElement !== i) i.value = v; };

/** Called after every redraw: shows the panel for the selected object and keeps its fields up to date. */
export function syncSpritePanel() {
  const o = findObject(state.sel), p = state.project, editing = document.body.classList.contains('editing');
  document.body.classList.toggle('has-sel', !!o && !editing);
  if (!o) return;
  const a = p.assets[o.asset], e = a && cache.get(a.id);
  if (!a || !e) return;
  $('#spName').textContent = a.name;
  if ($('#spImg').dataset.id !== a.id) { $('#spImg').src = e.url; $('#spImg').dataset.id = a.id; }
  const op = Math.round((o.opacity ?? 1) * 100);
  if (document.activeElement !== $('#spOpacity')) $('#spOpacity').value = op;
  $('#spOpOut').textContent = op;
  setIfIdle('#spW', o.w); setIfIdle('#spH', o.h); setIfIdle('#spRot', Math.round(o.rot));
  $('#spFlip').classList.toggle('on', !!o.flipX);
  const order = effectiveOrder(p, state.current), sig = order.map((id) => id + layerById(p, id).name).join('|'), sel = $('#spLayer');
  if (sig !== layerSig) { layerSig = sig; sel.replaceChildren(); for (const id of order) sel.append(new Option(layerById(p, id).name, id)); }
  sel.value = o.layer;
}

export function initSpritePanel(redraw) {
  const obj = () => findObject(state.sel);
  $('#spBack').onclick = () => { state.sel = null; emit('stage'); };
  $('#spOpacity').oninput = (e) => { const o = obj(); if (!o) return; o.opacity = +e.target.value / 100; $('#spOpOut').textContent = e.target.value; redraw(); };
  $('#spOpacity').onchange = () => emit('frames');
  $('#spFlip').onclick = () => { const o = obj(); if (o) { o.flipX = !o.flipX; emit('frames'); } };
  $('#spDelete').onclick = deleteSelected;
  $('#spLayer').onchange = (e) => moveSelectedToLayer(e.target.value);
  $('#spEdit').onclick = () => { const o = obj(); if (o) openEditor(o); };
  const resize = (byWidth) => (e) => {
    const o = obj(); if (!o) return;
    const v = Math.max(1, Math.round(+e.target.value || 1)), cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if ($('#spLock').checked) { const k = byWidth ? v / o.w : v / o.h; o.w = Math.max(1, Math.round(o.w * k)); o.h = Math.max(1, Math.round(o.h * k)); }
    else if (byWidth) o.w = v; else o.h = v;
    o.x = Math.round(cx - o.w / 2); o.y = Math.round(cy - o.h / 2);
    clampBackground(state.project, o); emit('frames');
  };
  $('#spW').onchange = resize(true); $('#spH').onchange = resize(false);
  $('#spRot').onchange = (e) => { const o = obj(); if (!o) return; o.rot = (((+e.target.value || 0) % 360) + 360) % 360; emit('frames'); };
}
