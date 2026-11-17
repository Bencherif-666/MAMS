# Copilot instructions for MAMS

## Repository overview
This repository is a browser-only sprite animation editor. There is no backend, no server-side app, and no framework/toolchain setup. The app boots from `index.html`; all runtime logic is loaded as ES modules from `js/`.

The architecture is intentionally split by concern:
- `js/app.js` is the entry point and wires the app together.
- `js/core/` holds shared app state, the event bus, undo/redo/history, and project import/export utilities.
- `js/editor/` contains the rendering and editing engine: canvas drawing, layer logic, object transforms, selection handles, animation playback, and pixel editing.
- `js/ui/` owns the menus, sidebar panels, timeline, toolbox, sprite details panel, and extraction dialog.
- `js/assets/` stores asset caching and library/folder handling.
- `js/import/` handles sprite detection and sheet cuts.
- `js/storage/` persists projects in IndexedDB.
- `js/utils/` contains shared helpers.

The README is the primary behavior reference for feature workflows and versioned changes. When a feature is unclear, prefer the README and the existing module boundaries over creating a new pattern.

## Local run and validation
There is no `package.json`, no test runner, and no lint configuration in this repository.

To run the app locally:

```bash
cd /home/redeye/Projects/MAMS/MAMS
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

Alternative local server:

```bash
cd /home/redeye/Projects/MAMS/MAMS
npx serve
```

Because this is a static browser app, validation is primarily manual in the browser. If a change affects UI or canvas behavior, exercise the relevant workflow in the browser and confirm the app still renders and saves correctly.

## Key codebase conventions
- Keep the app static-site friendly: plain HTML, CSS, and JavaScript only. Do not introduce a framework, bundler, or server-side runtime unless the repo explicitly grows one.
- Follow the existing module boundaries. Feature work generally belongs in `js/editor` or `js/ui`, with shared state changes routed through `js/core`.
- Prefer the shared state object (`js/core/state.js`) and event bus (`js/core/eventManager.js`) over ad hoc globals. UI modules use `emit()` / `on()` rather than creating their own app-wide side channels.
- The undo/redo system is centralized in `js/core/history.js`. For multi-step edits, use the history helpers (`checkpoint()`, `group()`, `pushDraw()`) to keep changes atomic and reversible.
- The project model is frame-based. A project contains `frames`, and each frame holds sprite objects plus per-layer drawing pixels. In practice, `frame.objects` is metadata for sprites/objects and `frame.draws[layerId]` holds the drawing bitmap for that layer.
- Layer ordering is managed by `js/editor/layerModel.js` and `effectiveOrder()`. Do not treat the layer list as just a display list; drawing order and selection order are intentionally separate concerns.
- Save/open uses IndexedDB (`js/storage/database.js`). Export/import of a whole project is handled as a `.json` file with embedded PNG data URLs (`js/core/projectManager.js`).
- Asset ingestion is centralized in the asset cache and library logic, not duplicated in multiple UI modules.
- The HTML imports use cache-busting query strings such as `?v=9` on script/module URLs; preserve that pattern when editing import URLs.

## Working style for this repo
- Prefer surgical edits inside the relevant module instead of introducing new top-level abstractions.
- When modifying editor behavior, check the README feature list and the surrounding `js/editor` modules before changing assumptions about frame/layer/object data.
- Treat the app as a local-first tool: state changes and saved projects stay in the browser unless explicitly exported.

This file intentionally focuses on the actual repository patterns and the browser-only workflow that exists here.
