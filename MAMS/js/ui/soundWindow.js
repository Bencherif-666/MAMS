// Dedicated Sound Window for Mugen Animation Studio.
// Contains:
//   Section A: Animation Frames (horizontal thumbnails, frame numbers, highlight selected frame, horizontal scroll)
//   Section B: Sound Timeline (horizontal timeline directly below frames, movable vertical playhead, rectangular clips with waveforms & filenames, dragging/repositioning/removing clips, multiple overlapping sounds, continuous placement anywhere between frames)
//   Section C: Sound Library (scrollable list, search field, + Import Sound, preview/play button, small modern edit button, drag-and-drop to timeline)
// Professional dark-blue, white and grey interface with light-blue highlights.

import { state, uid } from '../core/state.js?v=9';
import { on, emit } from '../core/eventManager.js?v=9';
import * as H from '../core/history.js?v=9';
import { renderFrame } from '../editor/canvasEditor.js?v=9';
import {
  getAssetAudioBuffer,
  drawWaveform,
  previewAudio,
  stopPreview,
  playTimelineSounds,
  stopAllPlayback,
} from '../sound/soundEngine.js?v=9';
import { handleSoundImport, editSoundAsset } from './soundTrimmer.js?v=9';
import { $, el, toast, confirmDialog } from '../utils/helpers.js?v=9';

let soundWindowEl = null;
let isOpen = false;
let isMaximized = false;
let pxPerSec = 160; // Pixels per second (scale)
let currentPlayheadMs = 0;
let activePreviewAssetId = null;
let previewHandle = null;
let isDraggingPlayhead = false;
let isDraggingClip = false;
let selectedClipId = null;
let numTracks = 3;

// References to DOM elements
let dom = {};

export function isSoundWindowOpen() {
  return isOpen;
}

export function toggleSoundWindow(player = null) {
  if (isOpen) {
    closeSoundWindow();
  } else {
    openSoundWindow(player);
  }
}

export function openSoundWindow(player = null) {
  if (player) dom.player = player;
  soundWindowEl ??= createSoundWindow();
  soundWindowEl.hidden = false;
  isOpen = true;
  document.body.classList.add('sound-window-open');
  $('#btnSideSound')?.classList.add('on');
  $('#btnSoundStudio')?.classList.add('on');
  $('#btnSoundTimeline')?.classList.add('on');
  seekToCurrentFrame();
  renderAll();
  emit('soundWindowOpen');
}

export function closeSoundWindow() {
  if (!isOpen) return;
  stopPreview();
  if (soundWindowEl) soundWindowEl.hidden = true;
  isOpen = false;
  document.body.classList.remove('sound-window-open');
  $('#btnSideSound')?.classList.remove('on');
  $('#btnSoundStudio')?.classList.remove('on');
  $('#btnSoundTimeline')?.classList.remove('on');
  emit('soundWindowClose');
}

/** Compute total animation duration in milliseconds. */
export function getAnimationDurationMs() {
  const frames = state.project.frames || [];
  return frames.reduce((acc, f) => acc + (f.duration || 83), 0);
}

/** Compute frame start timestamp in milliseconds. */
export function getFrameStartTimeMs(index) {
  const frames = state.project.frames || [];
  let sum = 0;
  for (let i = 0; i < index && i < frames.length; i++) {
    sum += frames[i].duration || 83;
  }
  return sum;
}

/** Find frame index that corresponds to a given millisecond timestamp. */
export function getFrameIndexAtMs(ms) {
  const frames = state.project.frames || [];
  let sum = 0;
  for (let i = 0; i < frames.length; i++) {
    const dur = frames[i].duration || 83;
    if (ms >= sum && ms < sum + dur) return i;
    sum += dur;
  }
  return Math.max(0, frames.length - 1);
}

function formatTime(ms) {
  const totalSec = Math.max(0, ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const frac = Math.floor((totalSec % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(frac).padStart(3, '0')}`;
}

/** Build the DOM structure for the Sound Studio window. */
function createSoundWindow() {
  const sec = el('section', 'sound-window');
  sec.id = 'soundWindow';
  sec.hidden = true;

  // Header Bar
  const head = el('div', 'snd-head');

  const titleWrap = el('div', 'snd-title-wrap');
  titleWrap.innerHTML = `
    <svg class="snd-icon" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
    <strong class="snd-title">Sound Studio</strong>
    <span class="snd-badge">Timeline Sync</span>
  `;

  // Transport Controls
  const transport = el('div', 'snd-transport');
  const btnPlay = el('button', 'snd-tbtn snd-btn-play', '▶');
  btnPlay.title = 'Play (Space)';
  const btnPause = el('button', 'snd-tbtn snd-btn-pause', '❚❚');
  btnPause.title = 'Pause';
  const btnStop = el('button', 'snd-tbtn snd-btn-stop', '■');
  btnStop.title = 'Stop';

  const timeDisplay = el('div', 'snd-time-disp', '00:00.000 / 00:00.000');
  const frameDisplay = el('div', 'snd-frame-disp', 'Frame 1 / 1');

  transport.append(btnPlay, btnPause, btnStop, timeDisplay, frameDisplay);

  // Zoom and Scale Controls
  const zoomWrap = el('div', 'snd-zoom-wrap');
  const btnZoomOut = el('button', 'snd-btn-sm', '−');
  btnZoomOut.title = 'Zoom out timeline';
  const zoomLbl = el('span', 'snd-zoom-lbl', '160 px/s');
  const btnZoomIn = el('button', 'snd-btn-sm', '+');
  btnZoomIn.title = 'Zoom in timeline';
  zoomWrap.append(btnZoomOut, zoomLbl, btnZoomIn);

  // Window Controls
  const winActions = el('div', 'snd-win-actions');
  const btnMax = el('button', 'snd-btn-sm snd-btn-max', '⛶');
  btnMax.title = 'Maximize / Restore';
  const btnClose = el('button', 'snd-btn-sm snd-btn-close', '✕');
  btnClose.title = 'Close Sound Studio';
  winActions.append(btnMax, btnClose);

  head.append(titleWrap, transport, zoomWrap, el('span', 'sp'), winActions);

  // Main Workspace
  const body = el('div', 'snd-body');

  // ==========================================
  // SECTION C: SOUND LIBRARY (Left sidebar)
  // ==========================================
  const libPanel = el('aside', 'snd-library-panel');
  libPanel.innerHTML = `
    <div class="snd-lib-head">
      <div class="snd-lib-title-row">
        <h3>Sound Library</h3>
        <button id="sndBtnImport" class="snd-btn-import primary">+ Import Sound</button>
      </div>
      <div class="snd-lib-search-row">
        <input type="search" id="sndSearchInp" placeholder="Search sounds..." spellcheck="false">
      </div>
    </div>
    <div id="sndLibList" class="snd-lib-list"></div>
    <div class="snd-lib-hint">Drag sound onto timeline to place</div>
  `;

  // Hidden audio file input
  const audioFileInput = el('input');
  audioFileInput.type = 'file';
  audioFileInput.accept = 'audio/wav,audio/mp3,audio/ogg,audio/mpeg,audio/*';
  audioFileInput.multiple = true;
  audioFileInput.hidden = true;
  sec.append(audioFileInput);

  // ==========================================
  // RIGHT AREA: SECTION A (Frames) & B (Timeline)
  // ==========================================
  const rightArea = el('div', 'snd-right-area');

  // Track Header Side Column (labels on the left of tracks)
  const trackHeaders = el('div', 'snd-track-headers');
  trackHeaders.innerHTML = `
    <div class="snd-th-spacer-frames">Frames</div>
    <div class="snd-th-spacer-ruler">Time</div>
    <div id="sndThList" class="snd-th-list"></div>
    <div class="snd-th-add-row"><button id="sndBtnAddTrack" class="snd-btn-add-track" title="Add Audio Track">+ Track</button></div>
  `;

  // Scroll Container for frames and timeline together
  const scrollWrap = el('div', 'snd-scroll-wrap');

  // SECTION A: Animation Frames
  const framesSection = el('div', 'snd-frames-section');
  framesSection.id = 'sndFramesStrip';

  // Ruler (Time ticks directly below frames)
  const rulerSection = el('div', 'snd-ruler-section');
  rulerSection.id = 'sndRuler';

  // SECTION B: Sound Timeline Tracks
  const timelineTracks = el('div', 'snd-timeline-tracks');
  timelineTracks.id = 'sndTracks';

  // Movable Vertical Playhead spanning Frames and Timeline
  const playhead = el('div', 'snd-playhead');
  playhead.id = 'sndPlayhead';
  playhead.innerHTML = `
    <div class="snd-playhead-cap"><span id="sndPlayheadTime">0.00s</span></div>
    <div class="snd-playhead-line"></div>
  `;

  // Drag Drop Visual Indicator Guide
  const dropIndicator = el('div', 'snd-drop-indicator');
  dropIndicator.hidden = true;

  scrollWrap.append(framesSection, rulerSection, timelineTracks, playhead, dropIndicator);
  rightArea.append(trackHeaders, scrollWrap);
  body.append(libPanel, rightArea);
  sec.append(head, body);
  document.body.append(sec);

  // Cache dom references
  dom = {
    ...dom,
    window: sec,
    head,
    btnPlay,
    btnPause,
    btnStop,
    timeDisplay,
    frameDisplay,
    btnZoomIn,
    btnZoomOut,
    zoomLbl,
    btnMax,
    btnClose,
    libList: $('#sndLibList', sec),
    searchInp: $('#sndSearchInp', sec),
    btnImport: $('#sndBtnImport', sec),
    audioFileInput,
    framesStrip: framesSection,
    ruler: rulerSection,
    tracks: timelineTracks,
    trackHeadersList: $('#sndThList', sec),
    btnAddTrack: $('#sndBtnAddTrack', sec),
    scrollWrap,
    playhead,
    playheadTime: $('#sndPlayheadTime', playhead),
    dropIndicator,
  };

  wireEvents();
  return sec;
}

/** Wire UI controls and playback hooks */
function wireEvents() {
  // Window Close & Maximize
  dom.btnClose.onclick = closeSoundWindow;
  dom.btnMax.onclick = () => {
    isMaximized = !isMaximized;
    dom.window.classList.toggle('maximized', isMaximized);
    dom.btnMax.textContent = isMaximized ? '❐' : '⛶';
  };

  // Playback Controls
  dom.btnPlay.onclick = () => {
    if (dom.player) {
      dom.player.play();
    } else {
      emit('togglePlay');
    }
  };
  dom.btnPause.onclick = () => {
    if (dom.player) dom.player.pause();
    else emit('pause');
  };
  dom.btnStop.onclick = () => {
    if (dom.player) dom.player.stop();
    seekToMs(0);
  };

  // Zoom Controls
  dom.btnZoomIn.onclick = () => {
    pxPerSec = Math.min(600, pxPerSec * 1.25);
    dom.zoomLbl.textContent = `${Math.round(pxPerSec)} px/s`;
    renderAll();
  };
  dom.btnZoomOut.onclick = () => {
    pxPerSec = Math.max(50, pxPerSec / 1.25);
    dom.zoomLbl.textContent = `${Math.round(pxPerSec)} px/s`;
    renderAll();
  };

  // Add Track Button
  dom.btnAddTrack.onclick = () => {
    numTracks++;
    renderTracks();
  };

  // File Import Button & Input
  dom.btnImport.onclick = () => dom.audioFileInput.click();
  dom.audioFileInput.onchange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      await handleSoundImport(file);
    }
    renderSoundLibrary();
  };

  // Library Search Filter
  dom.searchInp.oninput = () => renderSoundLibrary();

  // Playhead scrub on ruler
  dom.ruler.onmousedown = (e) => {
    e.preventDefault();
    scrubPlayheadFromEvent(e);
    const onMove = (me) => scrubPlayheadFromEvent(me);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Dragging the playhead directly
  dom.playhead.onmousedown = (e) => {
    e.preventDefault();
    isDraggingPlayhead = true;
    const onMove = (me) => scrubPlayheadFromEvent(me);
    const onUp = () => {
      isDraggingPlayhead = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Drag & drop onto timeline from library
  setupTimelineDragAndDrop();

  // Keyboard shortcut to delete selected clip
  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
      e.preventDefault();
      deleteClip(selectedClipId);
    }
  });

  // Global events
  on('soundChange', () => {
    if (isOpen) renderAll();
  });
  on('frames', () => {
    if (isOpen) {
      renderFramesStrip();
      renderRulerAndDimensions();
      updatePlayheadPosition();
    }
  });
  on('stage', () => {
    if (isOpen) {
      highlightActiveFrame();
    }
  });
}

function scrubPlayheadFromEvent(e) {
  const rect = dom.scrollWrap.getBoundingClientRect();
  const x = e.clientX - rect.left + dom.scrollWrap.scrollLeft;
  const pxPerMs = pxPerSec / 1000;
  const targetMs = Math.max(0, x / pxPerMs);
  seekToMs(targetMs);
}

/** Seek timeline and animation engine to millisecond timestamp */
export function seekToMs(ms) {
  const animDur = getAnimationDurationMs();
  currentPlayheadMs = Math.max(0, Math.min(animDur, ms));
  const frameIdx = getFrameIndexAtMs(currentPlayheadMs);

  if (state.current !== frameIdx) {
    state.current = frameIdx;
    emit('stage');
  }

  updatePlayheadPosition();
  updateTimeDisplay();
  highlightActiveFrame();
}

/** Seek to beginning of currently selected frame */
export function seekToCurrentFrame() {
  const ms = getFrameStartTimeMs(state.current);
  seekToMs(ms);
}

/** Updates playhead visual position smoothly */
export function updatePlayheadPosition(ms = currentPlayheadMs) {
  currentPlayheadMs = ms;
  const pxPerMs = pxPerSec / 1000;
  const x = ms * pxPerMs;

  dom.playhead.style.left = `${x}px`;
  dom.playheadTime.textContent = `${(ms / 1000).toFixed(2)}s`;
}

function updateTimeDisplay() {
  const totalMs = getAnimationDurationMs();
  dom.timeDisplay.textContent = `${formatTime(currentPlayheadMs)} / ${formatTime(totalMs)}`;
  dom.frameDisplay.textContent = `Frame ${state.current + 1} / ${(state.project.frames || []).length}`;
}

/** Highlights selected frame in Section A */
function highlightActiveFrame() {
  const frameBoxes = dom.framesStrip.querySelectorAll('.snd-frame-thumb-box');
  frameBoxes.forEach((b) => {
    b.classList.toggle('selected', +b.dataset.idx === state.current);
  });
}

/** Full render of all sections */
export function renderAll() {
  state.project.sounds ??= [];
  state.project.soundAssets ??= {};

  // Determine needed tracks
  let maxTrack = 2;
  for (const s of state.project.sounds) {
    if (s.track != null && s.track > maxTrack) maxTrack = s.track;
  }
  numTracks = Math.max(numTracks, maxTrack + 1);

  renderSoundLibrary();
  renderFramesStrip();
  renderRulerAndDimensions();
  renderTracks();
  updatePlayheadPosition();
  updateTimeDisplay();
  highlightActiveFrame();
}

// ==========================================
// RENDER SECTION C: SOUND LIBRARY
// ==========================================
function renderSoundLibrary() {
  const list = dom.libList;
  list.replaceChildren();

  const query = (dom.searchInp.value || '').trim().toLowerCase();
  const assets = Object.values(state.project.soundAssets || {});

  const filtered = assets.filter((a) => !query || (a.name || '').toLowerCase().includes(query));

  if (!filtered.length) {
    const empty = el('div', 'snd-lib-empty');
    empty.innerHTML = `
      <div class="empty-icon">🎵</div>
      <div>${assets.length ? 'No sounds match your search.' : 'No sounds imported yet.'}</div>
      <div class="empty-sub">Click <strong>+ Import Sound</strong> to add WAV, MP3, or OGG audio.</div>
    `;
    list.append(empty);
    return;
  }

  for (const asset of filtered) {
    const card = el('div', 'snd-lib-card');
    card.draggable = true;
    card.dataset.assetId = asset.id;

    // Miniature waveform canvas
    const waveMini = el('canvas', 'snd-mini-wave');
    waveMini.width = 60;
    waveMini.height = 24;
    drawWaveform(waveMini, asset.waveformData, {
      color: '#38bdf8',
      bgColor: '#101b33',
      barWidth: 1,
      barGap: 1,
    });

    const info = el('div', 'snd-lib-info');
    const nameEl = el('div', 'snd-lib-name', asset.name || 'Untitled Sound');
    nameEl.title = asset.name || '';
    const durEl = el('div', 'snd-lib-meta', `${(asset.duration || 0).toFixed(2)}s`);
    info.append(nameEl, durEl);

    // Actions: Preview Play, Edit Trimmer, Delete
    const actions = el('div', 'snd-lib-actions');

    const btnPlay = el('button', 'snd-icon-btn snd-lib-play', '▶');
    btnPlay.title = 'Preview sound';
    if (activePreviewAssetId === asset.id) {
      btnPlay.textContent = '❚❚';
      btnPlay.classList.add('playing');
    }

    btnPlay.onclick = (e) => {
      e.stopPropagation();
      toggleLibraryPreview(asset, btnPlay);
    };

    const btnEdit = el('button', 'snd-icon-btn snd-lib-edit', '✂');
    btnEdit.title = 'Edit / Trim sound (Safe)';
    btnEdit.onclick = (e) => {
      e.stopPropagation();
      editSoundAsset(asset.id);
    };

    const btnDel = el('button', 'snd-icon-btn snd-lib-del danger-text', '×');
    btnDel.title = 'Delete sound asset';
    btnDel.onclick = (e) => {
      e.stopPropagation();
      deleteSoundAsset(asset.id);
    };

    actions.append(btnPlay, btnEdit, btnDel);
    card.append(waveMini, info, actions);

    // Drag-and-drop source
    card.ondragstart = (e) => {
      e.dataTransfer.setData('text/mams-sound-asset', asset.id);
      e.dataTransfer.effectAllowed = 'copy';
      card.classList.add('dragging');
    };
    card.ondragend = () => {
      card.classList.remove('dragging');
    };

    list.append(card);
  }
}

async function toggleLibraryPreview(asset, btn) {
  if (activePreviewAssetId === asset.id) {
    stopPreview();
    activePreviewAssetId = null;
    btn.textContent = '▶';
    btn.classList.remove('playing');
    return;
  }

  stopPreview();
  activePreviewAssetId = asset.id;
  btn.textContent = '❚❚';
  btn.classList.add('playing');

  previewHandle = await previewAudio(asset, {
    startSec: 0,
    onEnd: () => {
      if (activePreviewAssetId === asset.id) {
        activePreviewAssetId = null;
        btn.textContent = '▶';
        btn.classList.remove('playing');
      }
    },
  });
}

function deleteSoundAsset(assetId) {
  const asset = state.project.soundAssets?.[assetId];
  if (!asset) return;

  const usedCount = (state.project.sounds || []).filter((s) => s.assetId === assetId).length;
  const msg = usedCount > 0
    ? `Sound "${asset.name}" is used in ${usedCount} timeline placement(s). Deleting it will also remove those sound clips. Continue?`
    : `Delete sound "${asset.name}" from library?`;

  if (!confirmDialog(msg)) return;

  // Remove placements
  if (state.project.sounds) {
    state.project.sounds = state.project.sounds.filter((s) => s.assetId !== assetId);
  }
  delete state.project.soundAssets[assetId];

  state.dirty = true;
  H.checkpoint();
  renderAll();
  emit('soundChange');
  toast(`Deleted "${asset.name}".`);
}

// ==========================================
// RENDER SECTION A: ANIMATION FRAMES
// ==========================================
function renderFramesStrip() {
  const strip = dom.framesStrip;
  strip.replaceChildren();

  const frames = state.project.frames || [];
  const pxPerMs = pxPerSec / 1000;
  const { w: stageW, h: stageH } = state.project.stage;

  let currentLeftMs = 0;

  frames.forEach((f, idx) => {
    const durMs = f.duration || 83;
    const widthPx = Math.max(70, durMs * pxPerMs);

    const frameBox = el('div', 'snd-frame-thumb-box');
    frameBox.dataset.idx = idx;
    frameBox.style.width = `${widthPx}px`;

    // Canvas thumbnail
    const canvas = el('canvas', 'snd-frame-canvas');
    canvas.width = 120;
    canvas.height = 68;
    const ctx = canvas.getContext('2d');
    ctx.scale(canvas.width / stageW, canvas.height / stageH);
    renderFrame(ctx, state.project, f);

    // Header info (Frame # and duration)
    const lbl = el('div', 'snd-frame-lbl');
    lbl.textContent = `#${idx + 1} (${durMs}ms)`;

    frameBox.append(canvas, lbl);

    // Clicking selects frame and seeks playhead
    frameBox.onclick = () => {
      const frameStart = getFrameStartTimeMs(idx);
      seekToMs(frameStart);
    };

    strip.append(frameBox);
    currentLeftMs += durMs;
  });
}

// ==========================================
// RENDER RULER AND TIMELINE DIMENSIONS
// ==========================================
function renderRulerAndDimensions() {
  const ruler = dom.ruler;
  ruler.replaceChildren();

  const animDurMs = getAnimationDurationMs();
  let maxSoundEndMs = animDurMs;
  for (const s of state.project.sounds || []) {
    const asset = state.project.soundAssets?.[s.assetId];
    if (asset) {
      const end = s.startMs + (asset.duration * 1000);
      if (end > maxSoundEndMs) maxSoundEndMs = end;
    }
  }

  // Ensure plenty of scrollable room beyond the end
  const totalMs = Math.max(animDurMs, maxSoundEndMs, 2000) + 1500;
  const pxPerMs = pxPerSec / 1000;
  const totalWidthPx = Math.max(900, totalMs * pxPerMs);

  dom.framesStrip.style.width = `${totalWidthPx}px`;
  dom.ruler.style.width = `${totalWidthPx}px`;
  dom.tracks.style.width = `${totalWidthPx}px`;

  // Draw Time Markers
  const stepSec = pxPerSec >= 200 ? 0.25 : (pxPerSec >= 100 ? 0.5 : 1.0);
  const totalSeconds = totalMs / 1000;

  for (let sec = 0; sec <= totalSeconds; sec += stepSec) {
    const x = sec * pxPerSec;
    const tick = el('div', 'snd-ruler-tick');
    tick.style.left = `${x}px`;

    const isMajor = Math.abs(sec - Math.round(sec)) < 0.001;
    if (isMajor) {
      tick.classList.add('major');
      const timeLbl = el('span', 'snd-tick-label', `${Math.round(sec)}s`);
      tick.append(timeLbl);
    }
    ruler.append(tick);
  }
}

// ==========================================
// RENDER SECTION B: SOUND TIMELINE TRACKS & CLIPS
// ==========================================
function renderTracks() {
  const tracksContainer = dom.tracks;
  tracksContainer.replaceChildren();
  dom.trackHeadersList.replaceChildren();

  const pxPerMs = pxPerSec / 1000;

  // Render track rows
  const trackRowEls = [];
  for (let t = 0; t < numTracks; t++) {
    // Header label
    const th = el('div', 'snd-th-row', `Track ${t + 1}`);
    dom.trackHeadersList.append(th);

    // Track lane
    const lane = el('div', 'snd-track-lane');
    lane.dataset.trackIndex = t;
    tracksContainer.append(lane);
    trackRowEls.push(lane);
  }

  // Render placed sound clips
  const sounds = state.project.sounds || [];
  for (const sound of sounds) {
    const asset = state.project.soundAssets?.[sound.assetId];
    if (!asset) continue;

    const trackIdx = Math.max(0, Math.min(numTracks - 1, sound.track || 0));
    const lane = trackRowEls[trackIdx];

    const durSec = asset.duration || 1;
    const durMs = durSec * 1000;
    const startMs = sound.startMs || 0;

    const leftPx = startMs * pxPerMs;
    const widthPx = Math.max(30, durMs * pxPerMs);

    const clip = el('div', 'snd-clip');
    clip.dataset.soundId = sound.id;
    clip.style.left = `${leftPx}px`;
    clip.style.width = `${widthPx}px`;

    if (sound.id === selectedClipId) {
      clip.classList.add('selected');
    }

    // Clip Waveform Canvas
    const wave = el('canvas', 'snd-clip-wave');
    wave.width = Math.min(600, Math.max(40, Math.round(widthPx)));
    wave.height = 36;
    drawWaveform(wave, asset.waveformData, {
      color: '#7dd3fc',
      bgColor: 'transparent',
      barWidth: 1,
      barGap: 1,
    });

    // Label and Delete Button
    const info = el('div', 'snd-clip-info');
    info.innerHTML = `
      <span class="snd-clip-name" title="${asset.name}">${asset.name}</span>
      <span class="snd-clip-dur">${durSec.toFixed(2)}s</span>
    `;

    const btnDel = el('button', 'snd-clip-del', '×');
    btnDel.title = 'Remove sound clip';
    btnDel.onclick = (e) => {
      e.stopPropagation();
      deleteClip(sound.id);
    };

    clip.append(wave, info, btnDel);

    // Clip Interaction: Selection & Repositioning Drag
    attachClipDrag(clip, sound);

    lane.append(clip);
  }
}

/** Attach drag-and-reposition interaction to placed timeline clip */
function attachClipDrag(clipEl, sound) {
  clipEl.onmousedown = (e) => {
    if (e.target.classList.contains('snd-clip-del')) return;
    e.preventDefault();
    e.stopPropagation();

    selectedClipId = sound.id;
    document.querySelectorAll('.snd-clip').forEach((c) => c.classList.remove('selected'));
    clipEl.classList.add('selected');

    const pxPerMs = pxPerSec / 1000;
    const startX = e.clientX;
    const startY = e.clientY;
    const origStartMs = sound.startMs || 0;
    const origTrack = sound.track || 0;

    let hasMoved = false;

    const onMouseMove = (moveEv) => {
      hasMoved = true;
      const deltaX = moveEv.clientX - startX;
      const deltaMs = deltaX / pxPerMs;
      // Allow continuous placement anywhere without snapping
      const newStartMs = Math.max(0, origStartMs + deltaMs);

      // Track change by vertical drag
      const laneHeight = 52; // Height of each track lane
      const deltaY = moveEv.clientY - startY;
      const trackShift = Math.round(deltaY / laneHeight);
      const newTrack = Math.max(0, Math.min(numTracks - 1, origTrack + trackShift));

      sound.startMs = newStartMs;
      sound.track = newTrack;

      clipEl.style.left = `${newStartMs * pxPerMs}px`;
      if (newTrack !== origTrack) {
        renderTracks();
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (hasMoved) {
        state.dirty = true;
        H.checkpoint();
        renderTracks();
        emit('soundChange');
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };
}

function deleteClip(soundId) {
  if (!state.project.sounds) return;
  state.project.sounds = state.project.sounds.filter((s) => s.id !== soundId);
  if (selectedClipId === soundId) selectedClipId = null;
  state.dirty = true;
  H.checkpoint();
  renderTracks();
  emit('soundChange');
}

// ==========================================
// DRAG & DROP FROM LIBRARY ONTO TIMELINE
// ==========================================
function setupTimelineDragAndDrop() {
  const tracksEl = dom.tracks;
  const scrollWrap = dom.scrollWrap;
  const indicator = dom.dropIndicator;

  tracksEl.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    const rect = scrollWrap.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollWrap.scrollLeft;
    const pxPerMs = pxPerSec / 1000;
    const dropMs = Math.max(0, x / pxPerMs);

    indicator.hidden = false;
    indicator.style.left = `${x}px`;
    indicator.textContent = `${(dropMs / 1000).toFixed(2)}s`;
  };

  tracksEl.ondragleave = (e) => {
    // Only hide if left container
    if (!tracksEl.contains(e.relatedTarget)) {
      indicator.hidden = true;
    }
  };

  tracksEl.ondrop = (e) => {
    e.preventDefault();
    indicator.hidden = true;

    const assetId = e.dataTransfer.getData('text/mams-sound-asset');
    if (!assetId || !state.project.soundAssets?.[assetId]) return;

    const rect = scrollWrap.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollWrap.scrollLeft;
    const pxPerMs = pxPerSec / 1000;

    // Calculate exact startMs: placed ANYWHERE between frames without snapping!
    const dropMs = Math.max(0, x / pxPerMs);

    // Calculate target track based on mouse Y
    const laneHeight = 52;
    const trackLaneRect = tracksEl.getBoundingClientRect();
    const relativeY = e.clientY - trackLaneRect.top;
    const targetTrack = Math.max(0, Math.min(numTracks - 1, Math.floor(relativeY / laneHeight)));

    const asset = state.project.soundAssets[assetId];
    const newPlacement = {
      id: uid('snd_clip'),
      assetId: asset.id,
      startMs: dropMs,
      track: targetTrack,
      duration: asset.duration,
    };

    state.project.sounds ??= [];
    state.project.sounds.push(newPlacement);
    selectedClipId = newPlacement.id;

    state.dirty = true;
    H.checkpoint();
    renderAll();
    emit('soundChange');
    toast(`Placed "${asset.name}" at ${(dropMs / 1000).toFixed(2)}s.`);
  };
}
