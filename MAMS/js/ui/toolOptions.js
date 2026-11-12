// Tool options flyout: a small box beside the toolbox, shown only when a tool button is clicked.
// Values live in `settings`, so they are kept while the box is hidden.
import { state } from '../core/state.js';
import { on } from '../core/eventManager.js';
import { settings, DRAW_TOOLS } from '../editor/drawingTools.js';
import { $ } from '../utils/helpers.js';

const TITLE = { brush: 'Brush', eraser: 'Eraser', ellipse: 'Circle / ellipse', blur: 'Blur' };
const HINT = {
  brush: 'Drag to paint on this frame’s drawing layer.',
  eraser: 'Erases the drawing layer only, never sprites or backgrounds.',
  ellipse: 'Drag to draw. Hold Shift for a perfect circle.',
  blur: 'Drag over your drawing to soften it. Sprites are not affected.',
};
export const hasOptions = (id) => DRAW_TOOLS.includes(id);

function normalizeHex(v) {
  v = v.trim().replace(/^#?/, '#').toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

function refresh() {
  document.querySelectorAll('#flyout .grp').forEach((g) => (g.hidden = !g.dataset.for.split(' ').includes(state.tool)));
  $('#lblOpacity').textContent = state.tool === 'blur' ? 'Strength' : 'Opacity';
  $('#flyTitle').textContent = TITLE[state.tool] || '';
  $('#toolHint').textContent = HINT[state.tool] || '';
}
export const closeFlyout = () => { $('#flyout').hidden = true; };
export function openFlyout(btn) {
  refresh();
  const f = $('#flyout'), r = btn.getBoundingClientRect();
  f.hidden = false;
  f.style.right = `${innerWidth - $('#tools').getBoundingClientRect().left + 6}px`; // beside the toolbox, level with the clicked tool
  f.style.top = `${Math.max(52, Math.min(r.top, innerHeight - f.offsetHeight - 8))}px`;
}
export const toggleFlyout = (btn) => ($('#flyout').hidden ? openFlyout(btn) : closeFlyout());

export function initToolOptions() {
  const slider = (id, out, key, scale = 1) => { $(id).oninput = (e) => { settings[key] = +e.target.value / scale; $(out).textContent = e.target.value; }; };
  slider('#optSize', '#outSize', 'size');
  slider('#optOpacity', '#outOpacity', 'opacity', 100);
  slider('#optHardness', '#outHardness', 'hardness');
  const setColor = (hex) => { settings.color = hex; $('#optColor').value = hex; $('#optHex').value = hex; };
  $('#optColor').oninput = (e) => setColor(e.target.value);
  $('#optHex').onchange = (e) => setColor(normalizeHex(e.target.value) || settings.color);
  $('#optFill').onchange = (e) => (settings.fill = e.target.value);
  // close when clicking anywhere outside the box (the tool buttons handle their own toggling)
  document.addEventListener('pointerdown', (e) => {
    const f = $('#flyout');
    if (!f.hidden && !f.contains(e.target) && !e.target.closest('#tools')) closeFlyout();
  }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFlyout(); });
  on('tool', () => { closeFlyout(); refresh(); }); // switching tool by shortcut hides the box
  refresh();
}
