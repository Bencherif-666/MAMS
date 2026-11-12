// IndexedDB wrapper. Whole projects (including PNG Blobs) are stored as structured clones.
const STORE = 'projects';
let dbPromise;
const open = () => (dbPromise ??= new Promise((res, rej) => {
  const r = indexedDB.open('mams', 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
async function run(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), rq = fn(t.objectStore(STORE));
    t.oncomplete = () => res(rq.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
export const saveProject = (p) => run('readwrite', (s) => s.put({ ...p, updated: Date.now() }));
export const getProject = (id) => run('readonly', (s) => s.get(id));
export const deleteProject = (id) => run('readwrite', (s) => s.delete(id));
export const listProjects = async () =>
  (await run('readonly', (s) => s.getAll())).map(({ id, name, updated, frames }) => ({ id, name, updated, frames: frames.length }));
