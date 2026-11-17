// MyLibrary: a dropdown listing every project saved in this browser (IndexedDB), with picture, dates and actions.
import { state } from '../core/state.js?v=9';
import * as db from '../storage/database.js?v=9';
import { el, toast, confirmDialog } from '../utils/helpers.js?v=9';

let urls = [];
export function releaseLibraryUrls() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; }
const fmt = (t) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown');

/** actions = { close, open(id), create(), renamedCurrent(name) } come from the app. */
export async function buildLibrary(pop, actions) {
  releaseLibraryUrls();
  pop.replaceChildren(el('div', 'lib-empty', 'Loading your projects…'));
  let list;
  try { list = await db.listLibrary(); } catch (e) { pop.replaceChildren(el('div', 'lib-empty', `Could not read the library: ${e.message}`)); return; }
  const refresh = () => buildLibrary(pop, actions);
  pop.replaceChildren();

  const head = el('div', 'lib-head'), count = el('span', 'hint', `${list.length} saved project${list.length === 1 ? '' : 's'}`);
  const add = el('button', 'primary', '+ New project'), back = el('button', '', 'Back to workspace');
  add.onclick = () => actions.create(); back.onclick = () => actions.close();
  head.append(el('strong', '', 'MyLibrary'), count, el('span', 'sp'), add, back);
  pop.append(head);
  if (!list.length) { pop.append(el('div', 'lib-empty', 'No saved projects yet. Use File → Save to put your current project here.')); return; }

  const rows = el('div', 'lib-list');
  for (const p of list) {
    const isCurrent = state.project && p.id === state.project.id, row = el('div', `lib-row${isCurrent ? ' current' : ''}`);
    let thumb;
    if (p.thumb) { thumb = el('img', 'lib-thumb'); const u = URL.createObjectURL(p.thumb); urls.push(u); thumb.src = u; thumb.alt = ''; }
    else thumb = el('div', 'lib-thumb none', 'no preview');
    const info = el('div', 'lib-info'), name = el('div', 'lib-name', p.name);
    if (isCurrent) name.append(el('span', 'badge-now', 'open now'));
    info.append(name, el('div', 'lib-meta', `Modified ${fmt(p.updated)}`), el('div', 'lib-meta', `Created ${fmt(p.created)} · ${p.frames} frame${p.frames === 1 ? '' : 's'}`));

    const act = el('div', 'lib-actions');
    const btn = (label, title, fn) => { const b = el('button', '', label); b.title = title; b.onclick = fn; act.append(b); return b; };
    btn('Open', isCurrent ? 'This is the project you are working on' : 'Open this project (the current one is saved first if it changed)', () => (isCurrent ? actions.close() : actions.open(p.id)));
    btn('Rename', 'Rename this project', async () => {
      const n = prompt('Project name', p.name);
      if (!n || !n.trim()) return;
      try { await db.renameProject(p.id, n.trim()); if (isCurrent) actions.renamedCurrent(n.trim()); await refresh(); } catch (e) { toast(e.message, true); }
    });
    btn('Duplicate', 'Make a copy of the saved version', async () => {
      try { await db.duplicateProject(p.id); toast(`"${p.name}" duplicated.`); await refresh(); } catch (e) { toast(e.message, true); }
    });
    const del = btn('Delete', 'Delete this saved project', async () => {
      if (!confirmDialog(`Delete the saved project "${p.name}"? This cannot be undone.`)) return;
      try { await db.deleteProject(p.id); toast(isCurrent ? 'Deleted from the library. The open workspace is now unsaved.' : 'Project deleted.'); await refresh(); } catch (e) { toast(e.message, true); }
    });
    del.classList.add('danger-text');
    row.append(thumb, info, act); rows.append(row);
  }
  pop.append(rows);
}
