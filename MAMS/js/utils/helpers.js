export const $ = (sel, root = document) => root.querySelector(sel);
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
export const isPng = (f) => !!f && (f.type === 'image/png' || /\.png$/i.test(f.name));
export const canvasToBlob = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
export const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
export const dataURLToBlob = (u) => fetch(u).then((r) => r.blob());
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
let toastTimer;
export function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = `show${isError ? ' err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 3200);
}
export const confirmDialog = (msg) => window.confirm(msg);
