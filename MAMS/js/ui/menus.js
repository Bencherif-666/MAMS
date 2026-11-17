// Top menu bar. A menu is { label, items } or { label, panel(popEl), onClose } (a custom dropdown such as MyLibrary).
// Items: { label, key?, run, checked? } | { label, href, tag? } (external link, new tab) | { heading } | { note } | '-'.
import { $, el } from '../utils/helpers.js?v=9';

let closeNow = () => {};
export const closeMenus = () => closeNow();
const EXT = '<svg viewBox="0 0 24 24" class="ext" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

export function initMenus(defs) {
  const bar = $('#menubar');
  let current = null;
  const close = () => {
    if (!current) return;
    current.btn.classList.remove('open'); current.pop.hidden = true;
    if (current.def.onClose) current.def.onClose();
    current = null;
  };
  closeNow = close;

  function render(m) {
    m.pop.replaceChildren();
    for (const it of m.def.items) {
      if (it === '-') { m.pop.append(el('hr')); continue; }
      if (it.heading) { m.pop.append(el('div', 'menu-head', it.heading)); continue; }
      if (it.note) { m.pop.append(el('div', 'menu-note', it.note)); continue; }
      if (it.href) { // external website: opens in a new tab
        const a = el('a', 'menu-item'), key = el('span', 'key ext-key');
        a.href = it.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = it.href; a.setAttribute('role', 'menuitem');
        key.innerHTML = `${it.tag || ''}${EXT}`;
        a.append(el('span', 'tick', ''), el('span', 'lbl', it.label), key);
        a.addEventListener('click', () => close());
        m.pop.append(a); continue;
      }
      const b = el('button', 'menu-item');
      b.setAttribute('role', 'menuitem');
      b.append(el('span', 'tick', it.checked && it.checked() ? '✓' : ''), el('span', 'lbl', it.label), el('span', 'key', it.key || ''));
      b.onclick = () => { close(); it.run(); };
      m.pop.append(b);
    }
  }
  function show(m) {
    close();
    m.btn.classList.add('open'); m.pop.hidden = false; current = m;
    if (m.def.panel) m.def.panel(m.pop); else render(m);
  }

  for (const def of defs) {
    const wrap = el('div', 'menu'), btn = el('button', 'menu-btn', def.label), pop = el('div', `menu-pop${def.panel ? ' lib' : ''}`);
    pop.hidden = true; pop.setAttribute('role', 'menu');
    const m = { btn, pop, def };
    if (def.panel) pop.addEventListener('click', (e) => e.stopPropagation()); // clicks inside a panel do not close it
    btn.onclick = (e) => { e.stopPropagation(); current === m ? close() : show(m); };
    btn.onmouseenter = () => { if (current && current !== m) show(m); }; // slide between menus once one is open
    wrap.append(btn, pop); bar.append(wrap);
  }
  document.addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
