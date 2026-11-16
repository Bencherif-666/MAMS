// Asset folders. project.folders = [{ id, name, kind, parent }]; each asset has `folder` (null = top level of its category).
// Folders are only for organising: moving a sprite never touches the frames that use it.
import { state, uid } from '../core/state.js?v=8';
import { emit } from '../core/eventManager.js?v=8';
import * as cache from './assetCache.js?v=8';
import { removeAsset } from './assetLibrary.js?v=8';
import { $, el, toast } from '../utils/helpers.js?v=8';

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
const same = (a, b) => (a || null) === (b || null);
const folders = () => state.project.folders || (state.project.folders = []);

export const childFolders = (kind, parent) => folders().filter((f) => f.kind === kind && same(f.parent, parent)).sort(byName);
export const assetsIn = (kind, folder) => Object.values(state.project.assets).filter((a) => a.kind === kind && same(a.folder, folder)).sort(byName);
export const findFolder = (id) => folders().find((f) => f.id === id) || null;

/** Open folder of a category (falls back to the top level if it no longer exists). */
export function currentFolder(kind) {
  const id = state.folder[kind];
  if (id && !findFolder(id)) state.folder[kind] = null;
  return state.folder[kind];
}
export function pathOf(folderId) {
  const out = []; let f = findFolder(folderId);
  while (f) { out.unshift(f); f = findFolder(f.parent); }
  return out;
}
export function descendantIds(id) {
  const out = []; const walk = (pid) => { for (const f of folders()) if (f.parent === pid) { out.push(f.id); walk(f.id); } };
  walk(id); return out;
}
const pathLabel = (id) => pathOf(id).map((f) => f.name).join(' / ');

/** Flat list for "Move to" menus: top level first, then every folder with its full path. */
export function folderChoices(kind, excludeFolderId = null) {
  const skip = excludeFolderId ? new Set([excludeFolderId, ...descendantIds(excludeFolderId)]) : new Set();
  const list = folders().filter((f) => f.kind === kind && !skip.has(f.id)).map((f) => ({ id: f.id, label: pathLabel(f.id) })).sort((a, b) => a.label.localeCompare(b.label));
  return [{ id: null, label: 'Top level' }, ...list];
}

function uniqueName(kind, parent, wanted) {
  const taken = new Set(childFolders(kind, parent).map((f) => f.name.toLowerCase()));
  let name = wanted, n = 2;
  while (taken.has(name.toLowerCase())) name = `${wanted} ${n++}`;
  return name;
}
export function createFolder(kind, parent, name) {
  const f = { id: uid('folder'), name: uniqueName(kind, parent, (name || 'New folder').trim().slice(0, 40) || 'New folder'), kind, parent: parent || null };
  folders().push(f); emit('assets');
  return f;
}
export function renameFolder(id, name) {
  const f = findFolder(id);
  if (!f || !name.trim()) return;
  f.name = uniqueName(f.kind, f.parent, name.trim().slice(0, 40)); emit('assets');
}
export function moveAssetTo(assetId, folderId) {
  const a = state.project.assets[assetId], target = folderId ? findFolder(folderId) : null;
  if (!a || (folderId && (!target || target.kind !== a.kind)) || same(a.folder, folderId)) return;
  a.folder = folderId || null; emit('assets');
  toast(`"${a.name}" moved to ${folderId ? `"${pathLabel(folderId)}"` : 'the top level'}.`);
}
export function moveFolderTo(id, parentId) {
  const f = findFolder(id), target = parentId ? findFolder(parentId) : null;
  if (!f || same(f.parent, parentId)) return;
  if (parentId && (!target || target.kind !== f.kind || parentId === id || descendantIds(id).includes(parentId))) { toast('A folder cannot be moved into itself.', true); return; }
  f.parent = parentId || null; emit('assets');
}

const usage = (assetId) => state.project.frames.filter((fr) => fr.objects.some((o) => o.asset === assetId)).length;
function removeFolders(ids) {
  const p = state.project, first = findFolder(ids[0]);
  p.folders = p.folders.filter((f) => !ids.includes(f.id));
  for (const k of Object.keys(state.folder)) if (ids.includes(state.folder[k])) state.folder[k] = first ? first.parent : null;
  emit('assets'); emit('frames');
}

/** Empty folder: deleted at once (Undo brings it back). Folder with sprites: a warning window lists them first. */
export function deleteFolder(id) {
  const f = findFolder(id);
  if (!f) return;
  const ids = [id, ...descendantIds(id)], assets = Object.values(state.project.assets).filter((a) => ids.includes(a.folder)).sort(byName);
  if (!assets.length) { removeFolders(ids); toast('Folder deleted. Press Ctrl+Z to undo.'); return; }
  const dlg = $('#folderDlg'), list = $('#fdList');
  $('#fdTitle').textContent = `Delete folder "${f.name}"?`;
  $('#fdText').textContent = `This folder contains ${assets.length} sprite${assets.length > 1 ? 's' : ''}${ids.length > 1 ? ` (and ${ids.length - 1} sub-folder${ids.length > 2 ? 's' : ''})` : ''}. They will be deleted too, and removed from the frames that use them:`;
  list.replaceChildren();
  for (const a of assets) {
    const row = el('div', 'fd-row'), img = el('img'), n = usage(a.id), c = cache.get(a.id);
    if (c) img.src = c.url;
    const info = el('div', 'fd-info'); info.append(el('div', 'fd-name', a.name), el('div', 'hint', pathLabel(a.folder)));
    row.append(img, info, el('div', n ? 'fd-used' : 'hint', n ? `used in ${n} frame${n > 1 ? 's' : ''}` : 'not used'));
    list.append(row);
  }
  $('#fdCancel').onclick = () => dlg.close();
  $('#fdDelete').onclick = () => { dlg.close(); for (const a of assets) removeAsset(a.id); removeFolders(ids); toast('Folder and sprites deleted. Press Ctrl+Z to undo.'); };
  dlg.showModal();
}
