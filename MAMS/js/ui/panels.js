// Asset panel with folders. Clicking a sprite puts it on the SELECTED layer. Folders: breadcrumb, drag and drop, right-click menu.
import { state } from '../core/state.js?v=9';
import { on, emit } from '../core/eventManager.js?v=9';
import { removeAsset, addBackground } from '../assets/assetLibrary.js?v=9';
import * as cache from '../assets/assetCache.js?v=9';
import * as F from '../assets/folderManager.js?v=9';
import { addObject, replaceAsset, findObject } from '../editor/objects.js?v=9';
import { openExtraction } from './extraction.js?v=9';
import { $, el, toast, confirmDialog } from '../utils/helpers.js?v=9';

const KIND = { characters: 'character', abilities: 'ability', backgrounds: 'background' };
const TITLE = { characters: 'Characters', abilities: 'Abilities', backgrounds: 'Backgrounds' };
const EMPTY = {
  characters: 'No characters here yet. Press + and choose a PNG sprite sheet.',
  abilities: 'No abilities here yet. Press + and choose a PNG sprite sheet, then mark sprites as Ability.',
  backgrounds: 'No backgrounds here yet. Press + to import a PNG.',
};
const MIME_A = 'application/x-mams-asset', MIME_F = 'application/x-mams-folder';
const FOLDER_SVG = '<svg viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

async function handleFiles(files) {
  try {
    if (state.tab === 'backgrounds') { for (const f of files) await addBackground(f); emit('assets'); toast('Background added.'); }
    else await openExtraction(files[0]);
  } catch (e) { toast(e.message, true); }
}

// ---- right-click menu
let menu = null;
function hideMenu() { if (menu) menu.hidden = true; }
function showMenu(e, items) {
  e.preventDefault(); e.stopPropagation();
  if (!menu) { menu = el('div', 'ctx'); menu.hidden = true; document.body.append(menu); }
  menu.replaceChildren();
  for (const it of items) {
    if (it === '-') { menu.append(el('hr')); continue; }
    const b = el('button', 'menu-item'); b.disabled = !!it.disabled;
    b.append(el('span', 'tick', it.mark || ''), el('span', 'lbl', it.label), el('span', 'key', ''));
    if (it.indent) b.style.paddingLeft = '14px';
    b.onclick = () => { hideMenu(); it.run && it.run(); };
    menu.append(b);
  }
  menu.hidden = false;
  menu.style.left = `${Math.min(e.clientX, innerWidth - 250)}px`; menu.style.top = `${Math.min(e.clientY, innerHeight - menu.offsetHeight - 8)}px`;
}
document.addEventListener('pointerdown', (e) => { if (menu && !menu.hidden && !menu.contains(e.target)) hideMenu(); }, true);
addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(); });
addEventListener('blur', hideMenu);

const moveItems = (kind, current, excludeFolder, run) => [
  { label: 'Move to folder:', disabled: true },
  ...F.folderChoices(kind, excludeFolder).map((c) => ({ label: c.label, indent: true, mark: (current || null) === c.id ? '✓' : '', disabled: (current || null) === c.id, run: () => run(c.id) })),
];

// ---- drag and drop (sprites and folders can be dropped on a folder tile or on a breadcrumb)
function dropTarget(node, folderId) {
  const accepts = (e) => { const t = Array.from(e.dataTransfer.types); return t.includes(MIME_A) || t.includes(MIME_F); };
  node.addEventListener('dragover', (e) => { if (accepts(e)) { e.preventDefault(); node.classList.add('drop-target'); } });
  node.addEventListener('dragleave', () => node.classList.remove('drop-target'));
  node.addEventListener('drop', (e) => {
    if (!accepts(e)) return;
    e.preventDefault(); e.stopPropagation(); node.classList.remove('drop-target');
    const a = e.dataTransfer.getData(MIME_A), f = e.dataTransfer.getData(MIME_F);
    if (a) F.moveAssetTo(a, folderId); else if (f) F.moveFolderTo(f, folderId);
  });
}

function renameAsset(a) { const n = prompt('Rename sprite', a.name); if (n && n.trim()) { a.name = n.trim(); emit('assets'); } }
function deleteAsset(a) { // sprites in the library keep their question
  if (!confirmDialog(`Delete "${a.name}" from the library? It will also be removed from every frame that uses it. (Ctrl+Z can undo it.)`)) return;
  removeAsset(a.id); emit('assets'); emit('frames');
}
function renameFolder(f) { const n = prompt('Rename folder', f.name); if (n && n.trim()) F.renameFolder(f.id, n); }

function build() {
  const kind = KIND[state.tab], grid = $('#grid'), sel = findObject(state.sel), here = F.currentFolder(kind);
  $('#panelTitle').textContent = TITLE[state.tab];
  $('#btnAdd').title = state.tab === 'backgrounds' ? 'Import background PNG into this folder' : 'Import sprite sheet PNG into this folder';
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));

  // breadcrumb: Characters › Goku › Running
  const crumbs = $('#crumbs'), path = F.pathOf(here);
  crumbs.replaceChildren();
  const crumb = (label, id, isLast) => {
    const c = el(isLast ? 'span' : 'button', `crumb${isLast ? ' last' : ''}`, label);
    if (!isLast) { c.onclick = () => { state.folder[kind] = id; build(); }; dropTarget(c, id); }
    return c;
  };
  crumbs.append(crumb(TITLE[state.tab], null, path.length === 0));
  path.forEach((f, i) => crumbs.append(el('span', 'sep', '›'), crumb(f.name, f.id, i === path.length - 1)));

  grid.replaceChildren();
  const subs = F.childFolders(kind, here), items = F.assetsIn(kind, here);
  if (!subs.length && !items.length) grid.append(el('div', 'empty', `${EMPTY[state.tab]} You can also drag sprites into this folder or create sub-folders with + Folder.`));

  for (const f of subs) {
    const tile = el('div', 'card folder'), th = el('div', 'thumb'), count = F.assetsIn(kind, f.id).length + F.childFolders(kind, f.id).length;
    th.innerHTML = FOLDER_SVG; th.append(el('span', 'badge', String(count)));
    const name = el('div', 'name', f.name);
    name.ondblclick = (e) => { e.stopPropagation(); renameFolder(f); };
    const x = el('button', 'x', '×'); x.title = 'Delete folder';
    x.onclick = (e) => { e.stopPropagation(); F.deleteFolder(f.id); };
    tile.title = `${f.name} — click to open · double-click the name to rename · drag sprites onto it · right-click for more`;
    tile.onclick = () => { state.folder[kind] = f.id; build(); };
    tile.draggable = true;
    tile.ondragstart = (e) => { e.dataTransfer.setData(MIME_F, f.id); e.dataTransfer.effectAllowed = 'move'; };
    tile.oncontextmenu = (e) => showMenu(e, [
      { label: 'Open', run: () => { state.folder[kind] = f.id; build(); } },
      { label: 'Rename…', run: () => renameFolder(f) },
      { label: 'Delete folder…', run: () => F.deleteFolder(f.id) },
      '-', ...moveItems(kind, f.parent, f.id, (id) => F.moveFolderTo(f.id, id)),
    ]);
    dropTarget(tile, f.id);
    tile.append(th, name, x); grid.append(tile);
  }

  for (const a of items) {
    const card = el('div', `card${sel && sel.asset === a.id ? ' used' : ''}`), thumb = el('div', 'thumb'), img = el('img');
    card.title = `${a.name} (${a.w}×${a.h}) — click: add to the selected layer · Alt+click: replace the selected sprite · double-click name: rename · right-click: move to folder`;
    img.src = cache.get(a.id).url; img.alt = a.name; thumb.append(img);
    const name = el('div', 'name', a.name);
    name.ondblclick = (e) => { e.stopPropagation(); renameAsset(a); };
    const x = el('button', 'x', '×'); x.title = 'Delete from library';
    x.onclick = (e) => { e.stopPropagation(); deleteAsset(a); };
    card.onclick = (e) => { const cur = findObject(state.sel); if (e.altKey && cur) replaceAsset(cur, a); else addObject(a); };
    card.draggable = true;
    card.ondragstart = (e) => { e.dataTransfer.setData(MIME_A, a.id); e.dataTransfer.effectAllowed = 'move'; };
    card.oncontextmenu = (e) => showMenu(e, [
      { label: 'Add to the selected layer', run: () => addObject(a) },
      { label: 'Rename…', run: () => renameAsset(a) },
      { label: 'Delete from library…', run: () => deleteAsset(a) },
      '-', ...moveItems(kind, a.folder, null, (id) => F.moveAssetTo(a.id, id)),
    ]);
    card.append(thumb, name, x); grid.append(card);
  }
}

export function initPanels() {
  on('assets', build); on('tab', build); on('frames', build); on('select', build);
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; state.sel = null; emit('tab'); emit('stage'); }));
  $('#btnAdd').onclick = () => { $('#fileInput').multiple = state.tab === 'backgrounds'; $('#fileInput').click(); };
  $('#btnNewFolder').onclick = () => {
    const n = prompt('Folder name', 'New folder');
    if (n && n.trim()) F.createFolder(KIND[state.tab], F.currentFolder(KIND[state.tab]), n);
  };
  $('#fileInput').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) handleFiles(f); };
  const panel = $('#panel'), isFiles = (e) => Array.from(e.dataTransfer.types).includes('Files');
  panel.ondragover = (e) => { if (isFiles(e)) { e.preventDefault(); $('#grid').classList.add('drop'); } };
  panel.ondragleave = () => $('#grid').classList.remove('drop');
  panel.ondrop = (e) => { if (!isFiles(e)) return; e.preventDefault(); $('#grid').classList.remove('drop'); if (e.dataTransfer.files.length) handleFiles([...e.dataTransfer.files]); };
  $('#grid').addEventListener('contextmenu', (e) => { if (e.target === $('#grid')) showMenu(e, [{ label: 'New folder here…', run: () => $('#btnNewFolder').click() }]); });
  build();
}
