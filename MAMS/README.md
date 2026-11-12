# MUGEN ANIMATION MAKER STUDIO (MAMS)

Offline 2D sprite-animation editor: vanilla JS (ES modules), Canvas 2D, IndexedDB. No backend, no libraries. PNGs never leave your computer.

## Launch
ES modules need http, not file://. From the MAMS folder:

    python -m http.server 8000      (or: npx serve)

Open http://localhost:8000 in Chrome, Edge or Firefox.

## Folder layout
    index.html
    css/main.css
    js/app.js                      wiring: toolbar, canvas, project actions
    js/core/       state, eventManager (event bus), projectManager (JSON export/import)
    js/import/     spriteDetector (mask, connected components, grid), spriteCutter
    js/assets/     assetCache (decode once), assetLibrary (characters/abilities/backgrounds)
    js/editor/     canvasEditor (layer rendering, hit test), animationPlayer (single rAF loop)
    js/storage/    database (IndexedDB)
    js/ui/         panels, extraction dialog, timeline
    js/utils/      helpers

## How detection works
1. The sheet is read once with getImageData.
2. A mask marks sprite pixels: alpha > threshold on transparent sheets; if the top-left pixel is opaque, that colour is the background key and pixels near it are background (and are made transparent in the cut sprites).
3. 8-connected flood fill (explicit stack) finds regions and their bounding boxes.
4. Boxes closer than "Merge gap" are merged, tiny boxes dropped, results ordered in reading order.
Grid mode splits rows x cols and trims each cell. Manual mode: drag rectangles on the sheet.

## Workflow
1. Characters or Abilities → **+** → pick a PNG sheet. The extraction dialog opens.
2. Choose a method, adjust threshold/gap, press Detect. Click boxes to keep/skip, rename, delete, and set each sprite to Character or Ability.
3. **Add to library**. Sprites appear in the sidebar. Backgrounds: **+** on the Backgrounds tab (or drag PNGs onto the panel).
4. Select a frame, click an asset to put it on that frame. Drag a sprite on the canvas to move it. "None" removes the layer from the frame.
5. Timeline: add, duplicate, delete, drag to reorder, set duration. FPS sets every frame's duration. Space = play/pause, arrows = navigate.

## Save and export
- Save/Open: IndexedDB (assets stored as PNG blobs).
- Export/Import project: one .json file (metadata + PNGs as data URLs).
- PNG frame / PNG sequence: the sequence downloads numbered files one by one (your browser may ask to allow multiple downloads).

## Known limitations
- Detection and extraction run on the main thread (no Web Worker); a very large sheet can pause the UI briefly while "Analyzing…" shows.
- Characters and Abilities are classified in one dialog, not two separate pages.
- No undo/redo, no GIF export, no zip export; `layers: []` is reserved for future use.
- Frame positions are set by dragging; the stage is fixed at 640×360.

## Step 2 additions
- **Onion Skin** (editbar, View menu, key O): red ghost of the previous frame, optional green ghost of the next one, adjustable opacity. Drawn only on the editing canvas: never in playback, PNG export or saved data.
- **Select tool**: click an object to select it. Drag to move, drag the square handles to resize (proportions kept; hold Shift to stretch freely), drag the round handle to rotate (Shift snaps to 15°). Delete removes the object from the frame, Esc deselects, "Reset transform" restores the default.
- **Per-frame transforms** `xf[layer] = {x, y, w, h, rot}` are stored in each frame; the original PNG is never changed.
- **Background placement** (per frame): Auto, Stretch to canvas, Original size, Cover. Auto: smaller than the canvas is stretched; bigger keeps its size and can slide sideways, and up/down only as far as it still covers the canvas (bottom aligned at start).
- Old projects are upgraded automatically when opened (their backgrounds keep the old stretched look).
Limitations: selection uses the object's rectangle (not pixel-exact); Onion Skin shows characters and abilities (drawing layers arrive in Step 3).
