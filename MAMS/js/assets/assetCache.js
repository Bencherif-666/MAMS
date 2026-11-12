// Decodes every asset once. `bmp` is for canvas drawing, `url` for <img> thumbnails.
const cache = new Map();
export async function load(asset) {
  if (cache.has(asset.id)) return cache.get(asset.id);
  const entry = { bmp: await createImageBitmap(asset.blob), url: URL.createObjectURL(asset.blob) };
  cache.set(asset.id, entry);
  return entry;
}
export const get = (id) => cache.get(id);
export function release(id) {
  const e = cache.get(id);
  if (!e) return;
  e.bmp.close(); URL.revokeObjectURL(e.url); cache.delete(id);
}
export const clear = () => [...cache.keys()].forEach(release);
export const loadAll = (project) => Promise.all(Object.values(project.assets).map(load));
