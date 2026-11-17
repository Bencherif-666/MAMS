import { state, newFrame, uid, currentFrame } from '../core/state.js?v=9';
import { on, emit } from '../core/eventManager.js?v=9';
import { renderFrame } from '../editor/canvasEditor.js?v=9';
import * as layers from '../editor/drawingLayers.js?v=9';
import { snapshotOrders, restoreOrders } from '../editor/layerModel.js?v=9';
import { $, el, toast, confirmDialog } from '../utils/helpers.js?v=9';

const frames = () => state.project.frames;
const defaultDuration = () => Math.round(1000 / state.project.fps);

function select(i) {
  emit('pause');
  state.current = Math.max(0, Math.min(frames().length - 1, i));
  emit('stage');
}

function insert(frame, at) { frames().splice(at, 0, frame); state.current = at; emit('frames'); }

function build() {
  const strip = $('#strip'); strip.replaceChildren();
  let dragFrom = -1;
  frames().forEach((f, i) => {
    const box = el('div', 'fthumb'); box.draggable = true; box.dataset.i = i;
    const c = el('canvas'); c.width = 192; c.height = 108;
    const ctx = c.getContext('2d'), { w, h } = state.project.stage;
    ctx.scale(c.width / w, c.height / h); renderFrame(ctx, state.project, f);
    box.append(c, el('div', '', `${i + 1} · ${f.duration} ms`));
    box.onclick = () => select(i);
    box.ondragstart = (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; };
    box.ondragover = (e) => { e.preventDefault(); box.classList.add('over'); };
    box.ondragleave = () => box.classList.remove('over');
    box.ondrop = (e) => {
      e.preventDefault();
      if (dragFrom < 0 || dragFrom === i) return;
      const selectedId = currentFrame().id, snap = snapshotOrders(state.project), [m] = frames().splice(dragFrom, 1);
      frames().splice(i, 0, m); restoreOrders(state.project, snap);
      state.current = frames().findIndex((x) => x.id === selectedId);
      emit('frames');
    };
    strip.append(box);
  });
  mark();
}

function mark() {
  document.querySelectorAll('.fthumb').forEach((b) => b.classList.toggle('sel', +b.dataset.i === state.current));
  const sel = document.querySelector('.fthumb.sel'); if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $('#dur').value = currentFrame().duration;
}

export function initTimeline() {
  on('frames', build); on('stage', mark);
  $('#addFrame').onclick = () => insert(newFrame(defaultDuration()), state.current + 1);
  $('#dupFrame').onclick = () => { const src = currentFrame(), c = structuredClone(src); c.id = uid('frame'); c.draws = {}; layers.duplicateFrame(src.id, c.id); insert(c, state.current + 1); };
  $('#delFrame').onclick = () => {
    if (frames().length === 1) { toast('A project needs at least one frame. Use Clear frame instead.', true); return; }
    const snap = snapshotOrders(state.project); layers.release(frames().splice(state.current, 1)[0].id); restoreOrders(state.project, snap); state.current = Math.min(state.current, frames().length - 1); emit('frames'); toast('Frame deleted. Press Ctrl+Z to undo.');
  };
  $('#prev').onclick = () => select(state.current - 1);
  $('#next').onclick = () => select(state.current + 1);
  $('#dur').onchange = (e) => { currentFrame().duration = Math.max(10, Math.min(10000, +e.target.value || 83)); emit('frames'); };
  build();
}
