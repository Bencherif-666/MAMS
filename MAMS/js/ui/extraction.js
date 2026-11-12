// Extraction dialog: detect, adjust, classify and add sprites to the library.
import { state, uid } from '../core/state.js';
import { emit } from '../core/eventManager.js';
import { addAsset } from '../assets/assetLibrary.js';
import { detectAuto, detectGrid, getBackgroundKey } from '../import/spriteDetector.js';
import { cutSprite } from '../import/spriteCutter.js';
import { $, el, isPng, toast } from '../utils/helpers.js';

export async function openExtraction(file) {
  if (!isPng(file)) { toast('Unsupported file. Only PNG images can be imported.', true); return; }
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { toast('That PNG could not be read.', true); return; }

  const dlg = $('#exDlg'), cv = $('#exCanvas'), ctx = cv.getContext('2d');
  const base = file.name.replace(/\.png$/i, '').replace(/\W+/g, '_');
  const scale = bmp.width > 720 ? 720 / bmp.width : Math.min(4, Math.floor(720 / bmp.width));
  cv.width = bmp.width; cv.height = bmp.height; cv.style.width = `${bmp.width * scale}px`;

  let sprites = [], counter = 0, imgData = null, draft = null;
  const mk = (rect) => ({ rect, name: `${base}_${String(++counter).padStart(2, '0')}`, kind: 'character', keep: true });

  function getImageData() { // read pixels once, reuse for every re-run
    if (!imgData) {
      const t = document.createElement('canvas'); t.width = bmp.width; t.height = bmp.height;
      const c = t.getContext('2d', { willReadFrequently: true }); c.drawImage(bmp, 0, 0);
      imgData = c.getImageData(0, 0, t.width, t.height);
    }
    return imgData;
  }

  function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bmp, 0, 0); ctx.lineWidth = Math.max(1, 1 / scale);
    for (const s of sprites) { ctx.strokeStyle = s.keep ? '#5b9dff' : '#e5596b'; ctx.strokeRect(s.rect.x, s.rect.y, s.rect.w, s.rect.h); }
    if (draft) { ctx.strokeStyle = '#fff'; ctx.strokeRect(draft.x, draft.y, draft.w, draft.h); }
  }

  function renderList() {
    const list = $('#exList'); list.replaceChildren();
    $('#exCount').textContent = `${sprites.length} sprites (${sprites.filter((s) => s.keep).length} kept)`;
    sprites.forEach((s, i) => {
      const row = el('div', 'row'), chk = el('input'); chk.type = 'checkbox'; chk.checked = s.keep; chk.title = 'Keep this sprite';
      chk.onchange = () => { s.keep = chk.checked; draw(); renderList(); };
      const th = el('canvas'); th.width = s.rect.w; th.height = s.rect.h;
      th.getContext('2d').drawImage(bmp, s.rect.x, s.rect.y, s.rect.w, s.rect.h, 0, 0, s.rect.w, s.rect.h);
      const name = el('input'); name.type = 'text'; name.value = s.name; name.oninput = () => (s.name = name.value);
      const sel = el('select'); sel.innerHTML = '<option value="character">Character</option><option value="ability">Ability</option>';
      sel.value = s.kind; sel.onchange = () => (s.kind = sel.value);
      const del = el('button', '', '×'); del.title = 'Delete this sprite';
      del.onclick = () => { sprites.splice(i, 1); draw(); renderList(); };
      row.append(chk, th, name, sel, del); list.append(row);
    });
  }

  async function run() {
    $('#exStatus').textContent = 'Analyzing…';
    await new Promise((r) => setTimeout(r, 30)); // let the loading text paint
    const mode = $('#exMode').value, thr = +$('#exThr').value;
    counter = 0;
    try {
      if (mode === 'auto') sprites = detectAuto(getImageData(), { threshold: thr, gap: +$('#exGap').value }).map(mk);
      else if (mode === 'grid') sprites = detectGrid(getImageData(), Math.max(1, +$('#exRows').value), Math.max(1, +$('#exCols').value), thr).map(mk);
      else sprites = [];
    } catch (e) { toast(`Detection failed: ${e.message}`, true); }
    $('#exStatus').textContent = ''; draw(); renderList();
  }

  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / r.width * cv.width), y: Math.floor((e.clientY - r.top) / r.height * cv.height) }; };
  let start = null;
  cv.onpointerdown = (e) => { start = pt(e); cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = (e) => {
    if (!start || $('#exMode').value !== 'manual') return;
    const p = pt(e); draft = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }; draw();
  };
  cv.onpointerup = (e) => {
    if (!start) return;
    const p = pt(e), manual = $('#exMode').value === 'manual';
    if (manual && draft && draft.w >= 2 && draft.h >= 2) sprites.push(mk(draft));
    else if (!manual || (!draft)) { // click: toggle the smallest box under the cursor
      const hit = sprites.filter((s) => p.x >= s.rect.x && p.y >= s.rect.y && p.x < s.rect.x + s.rect.w && p.y < s.rect.y + s.rect.h)
        .sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)[0];
      if (hit) hit.keep = !hit.keep;
    }
    start = null; draft = null; draw(); renderList();
  };

  const setAll = (fn) => { sprites.forEach(fn); draw(); renderList(); };
  $('#exRun').onclick = run;
  $('#exAll').onclick = () => setAll((s) => (s.keep = true));
  $('#exNoneBtn').onclick = () => setAll((s) => (s.keep = false));
  $('#exAllChar').onclick = () => setAll((s) => { if (s.keep) s.kind = 'character'; });
  $('#exAllAbil').onclick = () => setAll((s) => { if (s.keep) s.kind = 'ability'; });
  $('#exCancel').onclick = () => dlg.close();
  dlg.onclose = () => bmp.close();
  $('#exConfirm').onclick = async () => {
    const chosen = sprites.filter((s) => s.keep);
    if (!chosen.length) { toast('Nothing selected. Keep at least one sprite.', true); return; }
    $('#exConfirm').disabled = true; $('#exStatus').textContent = 'Saving sprites…';
    try {
      const key = $('#exMode').value === 'manual' ? getBackgroundKey(getImageData(), +$('#exThr').value) : getBackgroundKey(getImageData(), +$('#exThr').value);
      for (const s of chosen) {
        const blob = await cutSprite(bmp, s.rect, key);
        await addAsset({ id: uid(s.kind), name: s.name || 'Sprite', kind: s.kind, w: s.rect.w, h: s.rect.h, blob, src: s.rect });
      }
      state.tab = chosen.some((s) => s.kind === 'character') ? 'characters' : 'abilities';
      emit('assets'); emit('tab'); toast(`${chosen.length} sprites added.`);
      dlg.close();
    } catch (e) { toast(`Could not add sprites: ${e.message}`, true); }
    $('#exConfirm').disabled = false; $('#exStatus').textContent = '';
  };

  $('#exMode').value = 'auto';
  dlg.showModal();
  run();
}
