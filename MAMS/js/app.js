// Entry point: wires modules together. Heavy logic lives in the modules.
import { state, newProject, currentFrame, uid } from './core/state.js';
import { on, emit } from './core/eventManager.js';
import { exportProject, importProject } from './core/projectManager.js';
import * as db from './storage/database.js';
import * as cache from './assets/assetCache.js';
import { renderFrame, exportFrameBlob } from './editor/canvasEditor.js';
import { AnimationPlayer } from './editor/animationPlayer.js';
import { BG_MODES, getXf, migrateProject } from './editor/transforms.js';
import { initSelection, drawOverlay, deleteSelected, resetSelected, OVERLAY_MARGIN as M } from './editor/selection.js';
import { initPanels } from './ui/panels.js';
import { initTimeline } from './ui/timeline.js';
import { initMenus } from './ui/menus.js';
import { initToolbox, setTool } from './ui/toolbox.js';
import { initToolOptions } from './ui/toolOptions.js';
import { initPopover } from './ui/popover.js';
import * as layers from './editor/drawingLayers.js';
import { initDrawing, drawToolPreview, undoDrawing, redoDrawing, clearDrawing } from './editor/drawingTools.js';
import { $, el, toast, downloadBlob, confirmDialog } from './utils/helpers.js';

const stage = $('#stage'), sctx = stage.getContext('2d');
const overlay = $('#overlay'), octx = overlay.getContext('2d');

const player = new AnimationPlayer({
  getFrames: () => state.project.frames,
  getIndex: () => state.current,
  isLooping: () => state.project.loop,
  onFrame: (i) => { state.current = i; emit('stage'); },
  onStop: () => drawStage(), // bring back onion skin and handles when playback ends
});

function updateEditBar() {
  const f = currentFrame(), sel = state.sel;
  $('#bgMode').value = f.bgMode || 'auto';
  $('#onionBtn').classList.toggle('on', state.onion.on);
  $('#onionOn').checked = state.onion.on;
  $('#btnUndo').disabled = !layers.canUndo(); $('#btnRedo').disabled = !layers.canRedo();
  let info = 'Nothing selected';
  const e = sel && f[sel] && cache.get(f[sel]);
  if (e) { const t = getXf(state.project, f, sel, e.bmp); info = `${sel}: ${t.w}×${t.h}px, ${Math.round(t.rot)}°`; }
  $('#selInfo').textContent = info;
}

function drawOverlayLayer() {
  drawOverlay(octx, overlay, state.zoom, player.playing);
  drawToolPreview(octx, state.zoom, player.playing);
}

/** Onion ghosts and selection handles are drawn only while editing, never during playback. */
function drawStage() {
  const p = state.project, o = state.onion, opts = {};
  if (!player.playing && o.on) {
    opts.ghosts = []; opts.alpha = o.alpha; opts.drawings = o.drawings;
    if (o.prev && state.current > 0) opts.ghosts.push({ frame: p.frames[state.current - 1], tint: '#ff3b3b' });
    if (o.next && state.current < p.frames.length - 1) opts.ghosts.push({ frame: p.frames[state.current + 1], tint: '#35e06b' });
  }
  renderFrame(sctx, p, currentFrame(), opts);
  drawOverlayLayer();
  updateEditBar();
}

function setZoom(z) {
  state.zoom = Math.max(0.1, Math.min(8, z));
  const { w, h } = state.project.stage;
  stage.style.width = `${w * state.zoom}px`; stage.style.height = `${h * state.zoom}px`;
  overlay.style.width = `${(w + 2 * M) * state.zoom}px`; overlay.style.height = `${(h + 2 * M) * state.zoom}px`;
  overlay.style.left = overlay.style.top = `${-M * state.zoom}px`;
  $('#zoomLbl').textContent = `${Math.round(state.zoom * 100)}%`;
  drawStage();
}
function fit() {
  const wrap = $('#stageWrap'), { w, h } = state.project.stage;
  setZoom(Math.min((wrap.clientWidth - 102) / w, (wrap.clientHeight - 102) / h));
}

async function useProject(project) {
  player.pause(); cache.clear(); layers.clearAll();
  migrateProject(project); // upgrades projects saved by older versions
  await cache.loadAll(project);
  await layers.loadAll(project); // per-frame drawings
  Object.assign(state, { project, current: 0, sel: null });
  stage.width = project.stage.w; stage.height = project.stage.h;
  overlay.width = project.stage.w + 2 * M; overlay.height = project.stage.h + 2 * M;
  $('#projName').value = project.name; $('#fps').value = project.fps;
  $('#loop').classList.toggle('on', project.loop);
  emit('assets'); emit('frames'); fit();
}

on('stage', drawStage);
on('frames', drawStage);
on('tool', drawStage);
on('pause', () => player.pause());

// ---- commands: one implementation each, shared by the menus, toolbars and shortcuts
const frameName = (i) => `${state.project.name}_frame_${String(i + 1).padStart(3, '0')}.png`;
const toggleSide = (cls) => { document.body.classList.toggle(cls); requestAnimationFrame(fit); };
const toggleOnion = () => { state.onion.on = !state.onion.on; drawStage(); };
const commands = {
  newProject: async () => { if (confirmDialog('Start a new project? Unsaved changes will be lost.')) await useProject(newProject()); },
  save: async () => { try { await layers.flush(state.project); await db.saveProject(state.project); toast('Project saved.'); } catch (e) { toast(`Save failed: ${e.message}`, true); } },
  saveAs: async () => {
    const name = prompt('Save a copy as…', `${state.project.name} copy`);
    if (!name || !name.trim()) return;
    state.project.id = uid('proj'); state.project.name = name.trim(); // new id: the original save is never overwritten
    $('#projName').value = state.project.name;
    await commands.save();
  },
  open: async () => {
    const list = $('#projList'); list.replaceChildren();
    const projects = await db.listProjects();
    if (!projects.length) list.append(el('div', 'hint', 'No saved projects yet. Use File → Save first.'));
    for (const p of projects) {
      const row = el('div', 'ex-ctl'), open = el('button', '', `${p.name} (${p.frames} frames)`), del = el('button', '', 'Delete');
      open.onclick = async () => { await useProject(await db.getProject(p.id)); $('#projDlg').close(); };
      del.onclick = async () => { if (confirmDialog(`Delete saved project "${p.name}"?`)) { await db.deleteProject(p.id); row.remove(); } };
      row.append(open, del); list.append(row);
    }
    $('#projDlg').showModal();
  },
  exportJson: async () => { await layers.flush(state.project); downloadBlob(await exportProject(state.project), `${state.project.name}.mams.json`); },
  importJson: () => $('#jsonInput').click(),
  pngFrame: async () => downloadBlob(await exportFrameBlob(state.project, currentFrame()), frameName(state.current)),
  pngSequence: async () => {
    const { frames } = state.project;
    for (let i = 0; i < frames.length; i++) {
      downloadBlob(await exportFrameBlob(state.project, frames[i]), frameName(i));
      await new Promise((r) => setTimeout(r, 150));
    }
    toast(`${frames.length} frames exported.`);
  },
  toggleLoop: () => { state.project.loop = !state.project.loop; $('#loop').classList.toggle('on', state.project.loop); },
  togglePlay: () => (player.playing ? player.pause() : player.play()),
  setFps: () => {
    const v = prompt('Frames per second (1–60)', state.project.fps);
    if (v) { $('#fps').value = v; $('#fps').dispatchEvent(new Event('change')); }
  },
  clearFrame: () => {
    if (!confirmDialog('Clear everything in this frame?')) return;
    layers.clear(currentFrame().id); Object.assign(currentFrame(), { character: null, ability: null, background: null, xf: {} }); state.sel = null; emit('frames');
  },
};

// ---- toolbar bindings
$('#play').onclick = () => player.play();
$('#pause').onclick = () => player.pause();
$('#stop').onclick = () => player.stop();
$('#loop').onclick = commands.toggleLoop;
$('#fps').onchange = (e) => {
  const fps = Math.max(1, Math.min(60, +e.target.value || 12));
  state.project.fps = fps; e.target.value = fps;
  state.project.frames.forEach((f) => (f.duration = Math.round(1000 / fps)));
  emit('frames');
};
$('#zoomIn').onclick = () => setZoom(state.zoom * 1.25);
$('#zoomOut').onclick = () => setZoom(state.zoom / 1.25);
$('#fit').onclick = fit;
$('#clearFrame').onclick = commands.clearFrame;
$('#projName').onchange = (e) => (state.project.name = e.target.value.trim() || 'Untitled');
$('#projClose').onclick = () => $('#projDlg').close();
$('#jsonInput').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { await useProject(await importProject(f)); toast('Project imported.'); } catch (err) { toast(`Import failed: ${err.message}`, true); }
};

// ---- edit bar: onion skin, background placement, reset
for (const [value, label] of Object.entries(BG_MODES)) $('#bgMode').append(new Option(label, value));
initPopover($('#onionBtn'), $('#onionPop'));
initPopover($('#xfBtn'), $('#xfPop'));
$('#onionOn').onchange = (e) => { state.onion.on = e.target.checked; drawStage(); };
$('#btnUndo').onclick = undoDrawing;
$('#btnRedo').onclick = redoDrawing;
$('#onionPrev').onchange = (e) => { state.onion.prev = e.target.checked; drawStage(); };
$('#onionNext').onchange = (e) => { state.onion.next = e.target.checked; drawStage(); };
$('#onionDraw').onchange = (e) => { state.onion.drawings = e.target.checked; drawStage(); };
$('#onionAlpha').oninput = (e) => { state.onion.alpha = +e.target.value / 100; drawStage(); };
$('#bgMode').onchange = (e) => { const f = currentFrame(); f.bgMode = e.target.value; delete f.xf.background; emit('frames'); };
$('#resetXf').onclick = resetSelected;

// ---- menus
const click = (id) => () => $(id).click();
initMenus([
  { label: 'File', items: [
    { label: 'New project', run: commands.newProject },
    { label: 'Open project…', key: 'Ctrl+O', run: commands.open },
    { label: 'Save', key: 'Ctrl+S', run: commands.save },
    { label: 'Save as…', run: commands.saveAs },
    '-',
    { label: 'Export project (.json)', run: commands.exportJson },
    { label: 'Import project (.json)', run: commands.importJson },
    '-',
    { label: 'Export current frame (PNG)', run: commands.pngFrame },
    { label: 'Export all frames (PNG sequence)', run: commands.pngSequence },
  ] },
  { label: 'Edit', items: [
    { label: 'Undo drawing', key: 'Ctrl+Z', run: undoDrawing },
    { label: 'Redo drawing', key: 'Ctrl+Y', run: redoDrawing },
    { label: 'Clear drawing', run: clearDrawing },
    '-',
    { label: 'Delete selected object', key: 'Del', run: deleteSelected },
    { label: 'Reset transform', run: resetSelected },
    '-',
    { label: 'Duplicate frame', key: 'Ctrl+D', run: click('#dupFrame') },
    { label: 'Delete frame', run: click('#delFrame') },
    { label: 'Clear frame', run: commands.clearFrame },
  ] },
  { label: 'View', items: [
    { label: 'Zoom in', run: click('#zoomIn') },
    { label: 'Zoom out', run: click('#zoomOut') },
    { label: 'Fit canvas', run: fit },
    '-',
    { label: 'Onion Skin', key: 'O', checked: () => state.onion.on, run: toggleOnion },
    { label: 'Asset sidebar', checked: () => !document.body.classList.contains('no-left'), run: () => toggleSide('no-left') },
    { label: 'Toolbox', checked: () => !document.body.classList.contains('no-right'), run: () => toggleSide('no-right') },
  ] },
  { label: 'Animation', items: [
    { label: 'Play / Pause', key: 'Space', run: commands.togglePlay },
    { label: 'Stop', run: click('#stop') },
    { label: 'Loop', checked: () => state.project.loop, run: commands.toggleLoop },
    { label: 'Set FPS…', run: commands.setFps },
    '-',
    { label: 'Add frame', run: click('#addFrame') },
    { label: 'Previous frame', key: '←', run: click('#prev') },
    { label: 'Next frame', key: '→', run: click('#next') },
  ] },
]);

// ---- keyboard shortcuts
const TOOL_KEYS = { v: 'select', b: 'brush', e: 'eraser', c: 'ellipse', u: 'blur' };
addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); commands.save(); return; }
  if (mod && k === 'o') { e.preventDefault(); commands.open(); return; }
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || $('dialog[open]')) return;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redoDrawing() : undoDrawing(); return; }
  if (mod && k === 'y') { e.preventDefault(); redoDrawing(); return; }
  if (mod && k === 'd') { e.preventDefault(); $('#dupFrame').click(); return; }
  if (mod) return;
  if (e.code === 'Space') { e.preventDefault(); commands.togglePlay(); }
  if (e.key === 'ArrowRight') $('#next').click();
  if (e.key === 'ArrowLeft') $('#prev').click();
  if (e.key === 'Delete') deleteSelected();
  if (e.key === 'Escape') { state.sel = null; drawStage(); }
  if (k === 'o') toggleOnion();
  if (TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
});

initSelection({ overlay, getZoom: () => state.zoom, redraw: drawStage, commit: () => emit('frames'), canEdit: () => !player.playing });
initDrawing({ overlay, redraw: drawStage, redrawOverlay: drawOverlayLayer, commit: () => emit('frames'), canEdit: () => !player.playing });

addEventListener('beforeunload', () => player.destroy());
addEventListener('resize', () => { if (state.zoom) fit(); });

state.project = newProject();
initPanels(); initTimeline(); initToolbox(); initToolOptions();
useProject(state.project);
