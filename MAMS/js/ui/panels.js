// Asset panel (characters, abilities, backgrounds). Clicking an asset puts it on the SELECTED layer.
import { state } from '../core/state.js?v=7';
import { on, emit } from '../core/eventManager.js?v=7';
import { listAssets, removeAsset, addBackground } from '../assets/assetLibrary.js?v=7';
import * as cache from '../assets/assetCache.js?v=7';
import { addObject, replaceAsset, findObject } from '../editor/objects.js?v=7';
import { openExtraction } from './extraction.js?v=7';
import { $, el, toast, confirmDialog } from '../utils/helpers.js?v=7';

const KIND = { characters: 'character', abilities: 'ability', backgrounds: 'background' };
const TITLE = { characters: 'Characters', abilities: 'Abilities', backgrounds: 'Backgrounds' };
const EMPTY = {
  characters: 'No characters yet. Press + and choose a PNG sprite sheet.',
  abilities: 'No abilities yet. Press + and choose a PNG sprite sheet, then mark sprites as Ability.',
  backgrounds: 'No backgrounds yet. Press + to import a PNG.',
};

async function handleFiles(files) {
  try {
    if (state.tab === 'backgrounds') { for (const f of files) await addBackground(f); emit('assets'); toast('Background added.'); }
    else await openExtraction(files[0]);
  } catch (e) { toast(e.message, true); }
}

function build() {
  const kind = KIND[state.tab], grid = $('#grid'), sel = findObject(state.sel);
  $('#panelTitle').textContent = TITLE[state.tab];
  $('#btnAdd').title = state.tab === 'backgrounds' ? 'Import background PNG' : 'Import sprite sheet PNG';
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
  grid.replaceChildren();
  const items = listAssets(kind);
  if (!items.length) grid.append(el('div', 'empty', EMPTY[state.tab]));
  for (const a of items) {
    const card = el('div', `card${sel && sel.asset === a.id ? ' used' : ''}`);
    card.title = `${a.name} (${a.w}×${a.h}) — click: add to the selected layer · Alt+click: replace the selected sprite · double-click name: rename`;
    const thumb = el('div', 'thumb'), img = el('img');
    img.src = cache.get(a.id).url; img.alt = a.name; thumb.append(img);
    const name = el('div', 'name', a.name);
    name.ondblclick = (e) => {
      e.stopPropagation();
      const n = prompt('Rename asset', a.name);
      if (n && n.trim()) { a.name = n.trim(); build(); }
    };
    const x = el('button', 'x', '×'); x.title = 'Delete from project';
    x.onclick = (e) => {
      e.stopPropagation();
      if (!confirmDialog(`Delete "${a.name}"? Frames using it will lose it.`)) return;
      removeAsset(a.id); emit('assets'); emit('frames');
    };
    card.onclick = (e) => { const cur = findObject(state.sel); if (e.altKey && cur) replaceAsset(cur, a); else addObject(a); };
    card.append(thumb, name, x);
    grid.append(card);
  }
}

export function initPanels() {
  on('assets', build); on('tab', build); on('frames', build); on('select', build);
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; state.sel = null; emit('tab'); emit('stage'); }));
  $('#btnAdd').onclick = () => { $('#fileInput').multiple = state.tab === 'backgrounds'; $('#fileInput').click(); };
  $('#fileInput').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) handleFiles(f); };
  const panel = $('#panel');
  panel.ondragover = (e) => { e.preventDefault(); $('#grid').classList.add('drop'); };
  panel.ondragleave = () => $('#grid').classList.remove('drop');
  panel.ondrop = (e) => { e.preventDefault(); $('#grid').classList.remove('drop'); if (e.dataTransfer.files.length) handleFiles([...e.dataTransfer.files]); };
  build();
}
