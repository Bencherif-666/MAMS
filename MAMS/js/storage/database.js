// IndexedDB. Store "projects" holds whole projects (with PNG blobs). Store "meta" (added in database version 2)
// holds a small summary per project for MyLibrary: name, dates, frame count, thumbnail.
// Upgrading from version 1 only ADDS the meta store; existing projects are never touched.
const P = 'projects', M = 'meta';
let dbPromise;
const open = () => (dbPromise ??= new Promise((res, rej) => {
  const r = indexedDB.open('mams', 2);
  r.onupgradeneeded = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains(P)) db.createObjectStore(P, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(M)) db.createObjectStore(M, { keyPath: 'id' });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });
const newId = () => `proj_${Math.random().toString(36).slice(2, 9)}`;
const summary = (p, extra = {}) => ({ id: p.id, name: p.name, created: p.created || p.updated || Date.now(), updated: p.updated || Date.now(), frames: p.frames.length, thumb: null, ...extra });

export async function saveProject(project, thumb = null) {
  const db = await open(), t = db.transaction([P, M], 'readwrite'), now = Date.now();
  const old = await req(t.objectStore(M).get(project.id));
  const rec = { ...project, created: project.created || (old && old.created) || now, updated: now };
  t.objectStore(P).put(rec);
  t.objectStore(M).put(summary(rec, { thumb: thumb || (old && old.thumb) || null }));
  await done(t);
}
export async function getProject(id) {
  const db = await open(), t = db.transaction(P, 'readonly');
  return req(t.objectStore(P).get(id));
}
export async function deleteProject(id) {
  const db = await open(), t = db.transaction([P, M], 'readwrite');
  t.objectStore(P).delete(id); t.objectStore(M).delete(id);
  await done(t);
}

/** Every saved project, newest first. Projects saved before MyLibrary existed get a summary the first time. */
export async function listLibrary() {
  const db = await open(), t = db.transaction([P, M], 'readonly');
  const [metas, ids] = await Promise.all([req(t.objectStore(M).getAll()), req(t.objectStore(P).getAllKeys())]);
  const have = new Set(metas.map((m) => m.id)), idSet = new Set(ids);
  const list = metas.filter((m) => idSet.has(m.id));
  for (const id of ids.filter((x) => !have.has(x))) {
    const p = await getProject(id);
    if (!p) continue;
    const m = summary(p);
    const w = (await open()).transaction(M, 'readwrite'); w.objectStore(M).put(m); await done(w);
    list.push(m);
  }
  const stale = metas.filter((m) => !idSet.has(m.id)); // summaries whose project is gone
  if (stale.length) { const w = db.transaction(M, 'readwrite'); stale.forEach((m) => w.objectStore(M).delete(m.id)); done(w).catch(() => {}); }
  return list.sort((a, b) => b.updated - a.updated);
}
export const listProjects = listLibrary; // used by File > Open project

export async function renameProject(id, name) {
  const db = await open(), t = db.transaction([P, M], 'readwrite'), now = Date.now();
  const p = await req(t.objectStore(P).get(id)), m = await req(t.objectStore(M).get(id));
  if (!p) throw new Error('Project not found.');
  p.name = name; p.updated = now; t.objectStore(P).put(p);
  t.objectStore(M).put({ ...(m || summary(p)), name, updated: now });
  await done(t);
}
export async function duplicateProject(id) {
  const db = await open(), t = db.transaction([P, M], 'readwrite'), now = Date.now();
  const p = await req(t.objectStore(P).get(id)), m = await req(t.objectStore(M).get(id));
  if (!p) throw new Error('Project not found.');
  const copy = { ...p, id: newId(), name: `${p.name} copy`, created: now, updated: now };
  t.objectStore(P).put(copy);
  t.objectStore(M).put(summary(copy, { thumb: (m && m.thumb) || null }));
  await done(t);
  return copy.id;
}
