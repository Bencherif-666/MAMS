// Right-hand toolbox. Select is live now; drawing tools are enabled by later phases.
import { state } from '../core/state.js';
import { $, el } from '../utils/helpers.js';

const ICON = {
  select: '<path d="M5 3l14 8-6 2-3 6z"/>',
  brush: '<path d="M3 21c3 0 5-1 5-4l9-9-2-2-9 9c-3 0-3 3-3 6zM15 4l2-2 5 5-2 2z"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="6"/>',
  eraser: '<path d="M4 16l8-9 8 8-5 5H8zM9 21h12"/>',
  liquify: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
};
const TOOLS = [
  { id: 'select', label: 'Select and move', enabled: true },
  { id: 'brush', label: 'Brush — arrives in Phase 3', enabled: false },
  { id: 'ellipse', label: 'Circle / ellipse — arrives in Phase 3', enabled: false },
  { id: 'eraser', label: 'Eraser — arrives in Phase 3', enabled: false },
  { id: 'liquify', label: 'Liquify — arrives in Phase 4', enabled: false },
];

export function initToolbox() {
  const box = $('#tools');
  for (const t of TOOLS) {
    const b = el('button'); b.title = t.label; b.disabled = !t.enabled; b.dataset.tool = t.id;
    b.innerHTML = `<svg viewBox="0 0 24 24">${ICON[t.id]}</svg>`;
    b.onclick = () => { state.tool = t.id; refresh(); };
    box.append(b);
  }
  function refresh() { box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tool === state.tool)); }
  refresh();
}
