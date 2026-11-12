// Right-hand toolbox. Choosing a tool announces it with the 'tool' event.
import { state } from '../core/state.js';
import { emit } from '../core/eventManager.js';
import { openFlyout, toggleFlyout, hasOptions } from './toolOptions.js';
import { $, el } from '../utils/helpers.js';

const ICON = {
  select: '<path d="M5 3l14 8-6 2-3 6z"/>',
  brush: '<path d="M3 21c3 0 5-1 5-4l9-9-2-2-9 9c-3 0-3 3-3 6zM15 4l2-2 5 5-2 2z"/>',
  eraser: '<path d="M4 16l8-9 8 8-5 5H8zM9 21h12"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="6"/>',
  blur: '<circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="2.5"/>',
  liquify: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
};
const TOOLS = [
  { id: 'select', label: 'Select and move (V)', enabled: true },
  { id: 'brush', label: 'Brush (B)', enabled: true },
  { id: 'eraser', label: 'Eraser (E)', enabled: true },
  { id: 'ellipse', label: 'Circle / ellipse (C)', enabled: true },
  { id: 'blur', label: 'Blur (U)', enabled: true },
  { id: 'liquify', label: 'Liquify — arrives in Step 4', enabled: false },
];

export function setTool(id) {
  const t = TOOLS.find((x) => x.id === id);
  if (!t || !t.enabled) return;
  state.tool = id; refresh(); emit('tool');
}
function refresh() { $('#tools').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tool === state.tool)); }

export function initToolbox() {
  for (const t of TOOLS) {
    const b = el('button'); b.title = t.label; b.disabled = !t.enabled; b.dataset.tool = t.id;
    b.innerHTML = `<svg viewBox="0 0 24 24">${ICON[t.id]}</svg>`;
    b.onclick = () => {
      if (state.tool !== t.id) { setTool(t.id); if (hasOptions(t.id)) openFlyout(b); } // new tool: select it and show its options
      else if (hasOptions(t.id)) toggleFlyout(b);                                         // same tool: hide/show the options box
    };
    $('#tools').append(b);
  }
  refresh();
}
