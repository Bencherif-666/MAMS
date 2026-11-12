// Top menu bar. Each item: { label, key?, run, checked? } or '-' for a divider.
import { $, el } from '../utils/helpers.js';

export function initMenus(defs) {
  const bar = $('#menubar');
  let current = null;
  const close = () => { if (current) { current.btn.classList.remove('open'); current.pop.hidden = true; current = null; } };

  function render(m) {
    m.pop.replaceChildren();
    for (const it of m.items) {
      if (it === '-') { m.pop.append(el('hr')); continue; }
      const b = el('button', 'menu-item');
      b.setAttribute('role', 'menuitem');
      b.append(el('span', 'tick', it.checked && it.checked() ? '✓' : ''), el('span', 'lbl', it.label), el('span', 'key', it.key || ''));
      b.onclick = () => { close(); it.run(); };
      m.pop.append(b);
    }
  }
  function show(m) { close(); render(m); m.btn.classList.add('open'); m.pop.hidden = false; current = m; }

  for (const d of defs) {
    const wrap = el('div', 'menu'), btn = el('button', 'menu-btn', d.label), pop = el('div', 'menu-pop');
    pop.hidden = true; pop.setAttribute('role', 'menu');
    const m = { btn, pop, items: d.items };
    btn.onclick = (e) => { e.stopPropagation(); current === m ? close() : show(m); };
    btn.onmouseenter = () => { if (current && current !== m) show(m); }; // slide between menus once one is open
    wrap.append(btn, pop); bar.append(wrap);
  }
  document.addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
