// Minimal event bus. Events: assets, tab, frames (structure changed), stage (redraw), pause.
const handlers = {};
export const on = (event, fn) => (handlers[event] ??= []).push(fn);
export const emit = (event, data) => (handlers[event] || []).forEach((fn) => fn(data));
