// Entry point: wires modules together. Heavy logic lives in the modules.
import { state, newProject, currentFrame, uid } from './core/state.js?v=9';
import { on, emit } from './core/eventManager.js?v=9';
import { exportProject, importProject } from './core/projectManager.js?v=9';
import * as db from './storage/database.js?v=9';
import * as cache from './assets/assetCache.js?v=9';
import { renderFrame, exportFrameBlob, thumbBlob } from './editor/canvasEditor.js?v=9';
import { AnimationPlayer } from './editor/animationPlayer.js?v=9';
import { BG_MODES, migrateProject } from './editor/transforms.js?v=9';
import { effectiveOrder, layerById } from './editor/layerModel.js?v=9';
import { findObject, deleteSelected, resetSelected, setBgMode, moveSelectedToLayer } from './editor/objects.js?v=9';
import { initSelection, drawOverlay, OVERLAY_MARGIN as M } from './editor/selection.js?v=9';
import { initPanels } from './ui/panels.js?v=9';
import { initTimeline } from './ui/timeline.js?v=9';
import { initMenus, closeMenus } from './ui/menus.js?v=9';
import { buildLibrary, releaseLibraryUrls } from './ui/library.js?v=9';
import { GETMUGEN_ITEMS } from './ui/getMugen.js?v=9';
import { initToolbox, setTool } from './ui/toolbox.js?v=9';
import { initToolOptions } from './ui/toolOptions.js?v=9';
import { initSpritePanel, syncSpritePanel } from './ui/spritePanel.js?v=9';
import { initSpriteEditor } from './editor/spriteEditor.js?v=9';
import { initPopover } from './ui/popover.js?v=9';
import * as layers from './editor/drawingLayers.js?v=9';
import { initDrawing, drawToolPreview, clearDrawing, getLiveStroke } from './editor/drawingTools.js?v=9';
import * as H from './core/history.js?v=9';
import { initLayersPanel, toggleLayersPanel } from './ui/layersPanel.js?v=9';
import { openSoundWindow, toggleSoundWindow, isSoundWindowOpen, updatePlayheadPosition } from './ui/soundWindow.js?v=9';
import { playTimelineSounds, stopAllPlayback, clearAudioCache } from './sound/soundEngine.js?v=9';
import { $, el, toast, downloadBlob, confirmDialog } from './utils/helpers.js?v=9';

const stage = $('#stage'), sctx = stage.getContext('2d');
const overlay = $('#overlay'), octx = overlay.getContext('2d');

const player = new AnimationPlayer({
  getFrames: () => state.project.frames,
  getIndex: () => state.current,
  isLooping: () => state.project.loop,
  onFrame: (i) => { state.current = i; emit('stage'); },
  onStart: (ms) => playTimelineSounds(ms, state.project.loop, player.totalDuration()),
  onTick: (ms) => {
    if (isSoundWindowOpen()) {
      updatePlayheadPosition(ms);
    }
  },
  onLoop: () => playTimelineSounds(0, state.project.loop, player.totalDuration()),
  onStop: () => {
    stopAllPlayback();
    drawStage();
  },
});

let moveSig = '';
function updateEditBar() {
  const p = state.project, o = findObject(state.sel), a = o && p.assets[o.asset], L = o && layerById(p, o.layer);
  $('#onionBtn').classList.toggle('on', state.onion.on);
  $('#onionOn').checked = state.onion.on;
  $('#btnUndo').disabled = !H.canUndo(); $('#btnRedo').disabled = !H.canRedo();
  $('#selInfo').textContent = o && a ? `${a.name} · ${L ? L.name : ''} · ${o.w}×${o.h}px, ${Math.round(o.rot)}°` : 'Nothing selected';
  const isBg = !!a && a.kind === 'background';
  $('#bgMode').disabled = !isBg; if (isBg) $('#bgMode').value = o.mode || 'auto';
  const order = effectiveOrder(p, state.current), sig = order.map((id) => id + layerById(p, id).name).join('|'), mv = $('#moveLayer');
  if (sig !== moveSig) { moveSig = sig; mv.replaceChildren(); for (const id of order) mv.append(new Option(layerById(p, id).name, id)); }
  mv.disabled = !o; if (o) mv.value = o.layer;
  $('#resetXf').disabled = !o; $('#delObj').disabled = !o;
  syncSpritePanel();
}

function drawOverlayLayer() {
  drawOverlay(octx, overlay, state.zoom, player.playing);
  drawToolPreview(octx, state.zoom, player.playing);
}

/** Onion ghosts and selection handles are drawn only while editing, never during playback. */
function drawStage() {
  const p = state.project, o = state.onion, opts = { live: getLiveStroke() };
  if (!player.playing && o.on) {
    opts.ghosts = []; opts.alpha = o.alpha; opts.drawings = o.drawings;
    if (o.prev && state.current > 0) opts.ghosts.push({ frame: p.frames[state.current - 1], index: state.current - 1, tint: '#ff3b3b' });
    if (o.next && state.current < p.frames.length - 1) opts.ghosts.push({ frame: p.frames[state.current + 1], index: state.current + 1, tint: '#35e06b' });
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
  player.pause(); cache.clear(); layers.clearAll(); clearAudioCache();
  migrateProject(project); // upgrades projects saved by older versions
  await cache.loadAll(project);
  await layers.loadAll(project); // per-frame drawings
  Object.assign(state, { project, current: 0, sel: null, activeLayer: effectiveOrder(project, 0)[0] });
  H.reset(); state.dirty = false; // a new project starts with an empty history
  stage.width = project.stage.w; stage.height = project.stage.h;
  overlay.width = project.stage.w + 2 * M; overlay.height = project.stage.h + 2 * M;
  $('#projName').value = project.name; $('#fps').value = project.fps;
  $('#loop').classList.toggle('on', project.loop);
  emit('assets'); emit('frames'); emit('soundChange'); fit();
}

on('stage', drawStage);
on('frames', drawStage);
on('tool', drawStage);
on('layout', () => requestAnimationFrame(fit));
on('pause', () => player.pause());

// ---- commands: one implementation each, shared by the menus, toolbars and shortcuts
const frameName = (i) => `${state.project.name}_frame_${String(i + 1).padStart(3, '0')}.png`;
const toggleSide = (cls) => { document.body.classList.toggle(cls); requestAnimationFrame(fit); };
const toggleOnion = () => { state.onion.on = !state.onion.on; drawStage(); };
/** Saves the project with a preview picture of its first frame. */
async function saveNow(auto) {
  try {
    await layers.flush(state.project);
    state.project.created ??= Date.now();
    const thumb = await thumbBlob(state.project, state.project.frames[0]).catch(() => null);
    await db.saveProject(state.project, thumb);
    state.dirty = false; toast(auto ? `"${state.project.name}" was saved automatically.` : 'Project saved.');
    return true;
  } catch (e) { toast(`Save failed: ${e.message}`, true); return false; }
}
const autosaveIfDirty = async () => { if (state.dirty) await saveNow(true); };
async function openProjectById(id) {
  if (state.project && id === state.project.id) return;
  await autosaveIfDirty(); // changes of the current project are never lost
  const p = await db.getProject(id);
  if (!p) { toast('That project could not be found.', true); return; }
  await useProject(p); toast(`Opened "${p.name}".`);
}

const commands = {
  newProject: async () => { await autosaveIfDirty(); await useProject(newProject()); },
  save: () => saveNow(false),
  saveAs: async () => {
    const name = prompt('Save a copy as…', `${state.project.name} copy`);
    if (!name || !name.trim()) return;
    state.project.id = uid('proj'); state.project.name = name.trim(); state.project.created = Date.now(); // new id: the original save is never overwritten
    $('#projName').value = state.project.name;
    await commands.save();
  },
  open: async () => {
    const list = $('#projList'); list.replaceChildren();
    const projects = await db.listProjects();
    if (!projects.length) list.append(el('div', 'hint', 'No saved projects yet. Use File → Save first.'));
    for (const p of projects) {
      const row = el('div', 'ex-ctl'), open = el('button', '', `${p.name} (${p.frames} frames)`), del = el('button', '', 'Delete');
      open.onclick = async () => { $('#projDlg').close(); await openProjectById(p.id); };
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
  toggleLoop: () => { state.project.loop = !state.project.loop; $('#loop').classList.toggle('on', state.project.loop); H.checkpoint(); },
  togglePlay: () => (player.playing ? player.pause() : player.play()),
  setFps: () => {
    const v = prompt('Frames per second (1–60)', state.project.fps);
    if (v) { $('#fps').value = v; $('#fps').dispatchEvent(new Event('change')); }
  },
  clearFrame: () => { // sprites and all drawings of this frame, undone together in one step
    const f = currentFrame();
    H.group(() => {
      for (const lid of layers.layerIdsOfFrame(f.id)) { H.pushDraw(f.id, lid); layers.clear(f.id, lid); }
      f.objects = []; state.sel = null; emit('frames'); emit('select');
    });
    toast('Frame cleared. Press Ctrl+Z to undo.');
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
$('#btnSoundStudio').onclick = () => openSoundWindow(player);
$('#btnSoundTimeline').onclick = () => openSoundWindow(player);
$('#btnSideSound').onclick = () => toggleSoundWindow(player);
$('#projName').onchange = (e) => { state.project.name = e.target.value.trim() || 'Untitled'; H.checkpoint(); };
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
$('#btnUndo').onclick = H.undo;
$('#btnRedo').onclick = H.redo;
on('hist', () => { $('#btnUndo').disabled = !H.canUndo(); $('#btnRedo').disabled = !H.canRedo(); });
$('#onionPrev').onchange = (e) => { state.onion.prev = e.target.checked; drawStage(); };
$('#onionNext').onchange = (e) => { state.onion.next = e.target.checked; drawStage(); };
$('#onionDraw').onchange = (e) => { state.onion.drawings = e.target.checked; drawStage(); };
$('#onionAlpha').oninput = (e) => { state.onion.alpha = +e.target.value / 100; drawStage(); };
$('#bgMode').onchange = (e) => { const o = findObject(state.sel); if (o) setBgMode(o, e.target.value); };
$('#moveLayer').onchange = (e) => moveSelectedToLayer(e.target.value);
$('#delObj').onclick = deleteSelected;
$('#resetXf').onclick = resetSelected;

// ---- menus
const libraryActions = {
  close: closeMenus,
  open: async (id) => { closeMenus(); await openProjectById(id); },
  create: async () => { closeMenus(); await commands.newProject(); },
  renamedCurrent: (name) => { state.project.name = name; $('#projName').value = name; H.checkpoint(); },
};
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
    { label: 'Undo', key: 'Ctrl+Z', run: H.undo },
    { label: 'Redo', key: 'Ctrl+Y', run: H.redo },
    { label: 'Clear active layer drawing', run: clearDrawing },
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
    { label: 'Layers panel', key: 'L', checked: () => document.body.classList.contains('layers-open'), run: toggleLayersPanel },
    { label: 'Onion Skin', key: 'O', checked: () => state.onion.on, run: toggleOnion },
    { label: 'Asset sidebar', checked: () => !document.body.classList.contains('no-left'), run: () => toggleSide('no-left') },
    { label: 'Toolbox', checked: () => !document.body.classList.contains('no-right'), run: () => toggleSide('no-right') },
    '-',
    { label: 'Sound Studio', key: 'Shift+S', checked: isSoundWindowOpen, run: () => toggleSoundWindow(player) },
  ] },
  { label: 'Animation', items: [
    { label: 'Play / Pause', key: 'Space', run: commands.togglePlay },
    { label: 'Stop', run: click('#stop') },
    { label: 'Loop', checked: () => state.project.loop, run: commands.toggleLoop },
    { label: 'Set FPS…', run: commands.setFps },
    '-',
    { label: 'Sound Studio…', key: 'S', run: () => openSoundWindow(player) },
    '-',
    { label: 'Add frame', run: click('#addFrame') },
    { label: 'Previous frame', key: '←', run: click('#prev') },
    { label: 'Next frame', key: '→', run: click('#next') },
  ] },
  { label: 'GetMugen', items: GETMUGEN_ITEMS },
  { label: 'MyLibrary', panel: (pop) => buildLibrary(pop, libraryActions), onClose: releaseLibraryUrls },
]);

// ---- keyboard shortcuts
const TOOL_KEYS = { v: 'select', b: 'brush', e: 'eraser', c: 'ellipse', u: 'blur' };
addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); commands.save(); return; }
  if (mod && k === 'o') { e.preventDefault(); commands.open(); return; }
  if (document.body.classList.contains('editing')) return; // the sprite editor has its own keys
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || $('dialog[open]')) return;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? H.redo() : H.undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); H.redo(); return; }
  if (mod && k === 'd') { e.preventDefault(); $('#dupFrame').click(); return; }
  if (mod) return;
  if (e.code === 'Space') { e.preventDefault(); commands.togglePlay(); }
  if (e.key === 'ArrowRight') $('#next').click();
  if (e.key === 'ArrowLeft') $('#prev').click();
  if (e.key === 'Delete') deleteSelected();
  if (e.key === 'Escape') { state.sel = null; emit('select'); drawStage(); }
  if (k === 'o') toggleOnion();
  if (k === 'l') toggleLayersPanel();
  if (k === 's') { e.preventDefault(); toggleSoundWindow(player); return; }
  if (TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
});

initSelection({ overlay, getZoom: () => state.zoom, redraw: drawStage, commit: () => emit('frames'), canEdit: () => !player.playing });
initDrawing({ overlay, redraw: drawStage, redrawOverlay: drawOverlayLayer, commit: () => emit('frames'), canEdit: () => !player.playing });

addEventListener('beforeunload', () => player.destroy());
addEventListener('resize', () => { if (state.zoom) fit(); });

state.project = newProject();
initPanels(); initTimeline(); initToolbox(); initToolOptions(); initLayersPanel(); initSpritePanel(drawStage); initSpriteEditor(); H.initHistory();
useProject(state.project);
