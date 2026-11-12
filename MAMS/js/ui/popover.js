// Small popups opened by a button. Closes on outside click or Esc; only one is open at a time.
const pops = [];
export function closeAllPopovers() { pops.forEach((p) => p.close()); }

export function initPopover(btn, pop) {
  const entry = { btn, pop, close() { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); } };
  pops.push(entry);
  btn.setAttribute('aria-expanded', 'false');
  btn.onclick = (e) => {
    e.stopPropagation();
    const wasOpen = !pop.hidden;
    closeAllPopovers();
    if (!wasOpen) { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
  };
}
document.addEventListener('pointerdown', (e) => pops.forEach((p) => { if (!p.pop.hidden && !p.pop.contains(e.target) && !p.btn.contains(e.target)) p.close(); }), true);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllPopovers(); });
