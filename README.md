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

## Step 3 additions
- **Drawing tools** (right toolbox, keys V/B/E/C/U): Brush, Eraser, Circle/ellipse (Shift = circle), Blur. Options bar: size, opacity (strength for Blur), hardness (soft edge), color picker + HEX field, outline/filled shapes.
- **Drawing layer per frame**: separate from sprites and backgrounds, stored in `frame.draw` as a PNG blob (IndexedDB and project .json). Included in playback, PNG export and (optionally) Onion Skin. The eraser and blur only touch this layer.
- **Undo/Redo** (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, Edit menu): drawing operations, last 30 steps. Duplicating a frame copies its drawing; deleting a frame frees it.
Limitations: no pen-pressure; blur needs a browser with canvas filters (Chrome, Edge, Brave, Firefox); every frame with a drawing keeps one canvas in memory (about 1 MB at 640×360).

## Layout cleanup (after Step 3)
- The two big option bars are gone: the canvas now has the whole centre of the window.
- **Undo / Redo** arrows sit in the top bar, centred. "Clear drawing" is in the Edit menu.
- **Tool options** (color, size, opacity, hardness, shape) open in a small box beside the toolbox when you click a tool. Click the same tool again to hide it (values are kept). It also closes when you click outside it.
- **ONION** (timeline bar): popup with on/off, previous, next, include drawings and opacity. **TRANSFORM** (timeline bar): selected-object info, background placement, reset.

## Layers (Step 4)
- **Layers** button (vertical, under the toolbox; key L) opens a panel that docks beside the toolbox. Rectangles run from top (in front) to bottom (behind). Drag a rectangle to change the order.
- Layers: Background, Character, Ability and any number of **drawing layers** (+ Layer). Each has an eye (hide/show, also in playback and export) and a name (double-click). Drawing layers can be duplicated and deleted (at least one stays).
- The **active drawing layer** (highlighted) is where Brush, Eraser, Ellipse and Blur paint. Clicking a sprite layer selects that object on the canvas.
- **Order carries forward**: a reorder at frame N applies to frame N and the frames after it, until a later frame changes it again. Deleting or moving frames keeps every remaining frame's look.
- Older projects are upgraded automatically (their single drawing becomes "Drawing 1").

## Layers panel, version 5
- The **Layers** button (vertical, in the right toolbox, key L) shows or hides a floating panel. The canvas keeps its full size.
- The panel has **+ New layer** (the new layer goes in front, on top) and the layers below it, top = in front. A new project has only the **Default layer** (background, character, ability).
- Drawing never goes on the default layer: the first stroke creates its own layer. Drag layers up or down to change what covers what.

## If the app looks broken after an update
Delete the whole old `MAMS` folder first, copy the new one in (keep the hidden `.htaccess` file), then press Ctrl+Shift+R. The title bar shows the version ("MAMS v5"); if it is missing, the browser is still using old files. In the browser's developer tools (F12 > Network) you can tick "Disable cache" while testing.

## Layers are containers (version 6)
- A layer holds **sprites** (characters, abilities, backgrounds, as many as you like) and a **drawing**. The drawing is in front of that layer's sprites.
- The **selected layer** (highlighted) receives: assets you click in the asset panel, and brush / eraser / ellipse / blur strokes. Clicking an object on the canvas selects its layer. Clicking a layer's rectangle selects it.
- The **Default layer** is an ordinary layer: hide, rename, reorder, delete it. A project always keeps at least one layer.
- **Transform** popup: move the selected sprite to another layer, change a background's placement, reset, delete. **Alt+click** an asset replaces the selected sprite (same place and scale).
- Old projects open with their background, character and ability together in the Default layer.

## Sprite panel and pixel editor (version 7)
- **Sprite panel**: click a sprite on the canvas and the asset list is replaced by that sprite's settings: opacity, width / height / rotation, keep proportions, quick Flip ⇄ (this frame only), layer, Delete, and the big **EDIT** button. "← Assets" (or Esc, or an asset tab) brings the asset list back.
- **EDIT** opens a full-page pixel editor on a copy of the sprite: pencil, eraser, eyedropper (Alt+click), paint bucket, line, rectangle (outline or filled), color picker + HEX + recent colors, select a part (move, resize, rotate, delete), Flip ⇄ / ⇅ and Rotate 90° (selected part, or the whole sprite), undo/redo, zoom with pixel grid, canvas size. Everything is in whole pixels.
- **Done** asks each time: **Save as new sprite** (original kept, this sprite switches to the new one) or **Replace the original** (changes every frame that uses it).

## Undo for everything and asset folders (version 8)
- **Undo / Redo** (Ctrl+Z, Ctrl+Y, the arrows in the top bar, Edit menu) now covers sprites (add, move, resize, rotate, opacity, flip, delete, replace), layers (add, delete, duplicate, rename, hide, reorder), frames (add, duplicate, delete, reorder, duration, FPS), assets, folders, the editor's "Replace original", brush strokes and "Clear frame". One timeline, last 100 steps. Undo jumps to the frame where the change happened.
- Because of Undo, deleting a layer, a frame or an empty folder no longer asks "Are you sure?". Deleting a sprite from the library still asks.
- **Folders** inside Characters, Abilities and Backgrounds: **+ Folder**, a clickable path (Characters › Goku › Running), click a folder to open it, rename by double-clicking its name. Move sprites (and folders) by dragging them onto a folder or onto a part of the path, or with the right-click menu "Move to folder". New imports land in the open folder.
- Deleting a folder with sprites shows a warning window that lists them (and in how many frames each is used). Moving sprites between folders never changes your frames.

## GetMugen and MyLibrary (version 9)
- **GetMugen** (top menu): links to real external sites for free MUGEN sprites and stages (Mugen Free For All, Mugen Fighters Guild, The Spriters Resource, The MUGEN Archive). They are websites, not direct downloads; each opens in a new tab and is marked with an arrow icon.
- **MyLibrary** (top menu): every project saved in this browser, newest first, with a preview of its first frame, modified and created dates and frame count. Buttons: Open, Rename, Duplicate, Delete; plus **+ New project** and **Back to workspace**. Opening or creating a project while the current one has unsaved changes saves the current one automatically first. A project is saved with File > Save (Ctrl+S); the preview is made at that moment.
- Database version 2 adds a small "meta" store; projects saved by older versions keep working (they show "no preview" until saved again).
