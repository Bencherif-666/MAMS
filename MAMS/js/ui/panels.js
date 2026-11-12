import { state, currentFrame } from '../core/state.js';
import { on, emit } from '../core/eventManager.js';
import { listAssets, removeAsset, addBackground } from '../assets/assetLibrary.js';
import * as cache from '../assets/assetCache.js';
import { openExtraction } from './extraction.js';
import { $, el, toast, confirmDialog } from '../utils/helpers.js';

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
  const kind = KIND[state.tab], grid = $('#grid');
  $('#panelTitle').textContent = TITLE[state.tab];
  $('#btnAdd').title = state.tab === 'backgrounds' ? 'Import background PNG' : 'Import sprite sheet PNG';
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
  grid.replaceChildren();
  const items = listAssets(kind), used = currentFrame()[kind];
  if (!items.length) grid.append(el('div', 'empty', EMPTY[state.tab]));
  for (const a of items) {
    const card = el('div', `card${a.id === used ? ' used' : ''}`);
    card.title = `${a.name} (${a.w}×${a.h}) — click to use in this frame, double-click name to rename`;
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
      if (!confirmDialog(`Delete "${a.name}"? Frames using it will lose this layer.`)) return;
      removeAsset(a.id); emit('assets'); emit('frames');
    };
    card.onclick = () => { const f = currentFrame(); f[kind] = a.id; delete f.xf[kind]; build(); emit('frames'); };
    card.append(thumb, name, x);
    grid.append(card);
  }
}

export function initPanels() {
  on('assets', build); on('tab', build); on('frames', build);
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; emit('tab'); }));
  $('#btnAdd').onclick = () => { $('#fileInput').multiple = state.tab === 'backgrounds'; $('#fileInput').click(); };
  $('#fileInput').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) handleFiles(f); };
  $('#btnNone').onclick = () => {
    const f = currentFrame(), kind = KIND[state.tab];
    f[kind] = null; delete f.xf[kind]; emit('frames');
  };
  const grid = $('#panel');
  grid.ondragover = (e) => { e.preventDefault(); $('#grid').classList.add('drop'); };
  grid.ondragleave = () => $('#grid').classList.remove('drop');
  grid.ondrop = (e) => { e.preventDefault(); $('#grid').classList.remove('drop'); if (e.dataTransfer.files.length) handleFiles([...e.dataTransfer.files]); };
  build();
}
