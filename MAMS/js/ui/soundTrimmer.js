// Audio Trimming and Import Dialogs for Mugen Animation Studio.
// Implements prompt: "Do you want to edit this sound before importing?"
// Interactive audio-trimming window with waveform, dual start/end handles, preview, and non-destructive editing.

import { state, uid } from '../core/state.js?v=9';
import { emit } from '../core/eventManager.js?v=9';
import * as H from '../core/history.js?v=9';
import {
  decodeAudioBlob,
  extractWaveformData,
  drawWaveform,
  sliceAudioBuffer,
  audioBufferToWavBlob,
  previewAudio,
  stopPreview,
  invalidateAssetAudioBuffer,
} from '../sound/soundEngine.js?v=9';
import { $, el, toast } from '../utils/helpers.js?v=9';

let activeTrimmer = null; // Holds current trim session

/**
 * Handle importing an audio file (WAV, MP3, OGG, etc.)
 * Prompts user: "Do you want to edit this sound before importing?"
 */
export async function handleSoundImport(file) {
  if (!file) return;

  // Validate audio file
  let audioBuffer;
  try {
    audioBuffer = await decodeAudioBlob(file);
  } catch (err) {
    toast(`Failed to read audio file "${file.name}": unsupported format or corrupt file.`, true);
    return;
  }

  const duration = audioBuffer.duration;
  const waveformData = extractWaveformData(audioBuffer, 120);

  // Show the confirmation dialog: "Do you want to edit this sound before importing?"
  const choice = await showImportChoiceDialog(file.name, duration);

  if (choice === 'cancel') {
    return;
  }

  if (choice === 'no') {
    // Import complete original sound without modification
    const assetId = uid('snd_asset');
    state.project.soundAssets ??= {};
    state.project.soundAssets[assetId] = {
      id: assetId,
      name: file.name,
      duration: duration,
      blob: file,
      originalBlob: file,
      waveformData: waveformData,
    };
    state.dirty = true;
    H.checkpoint();
    emit('soundChange');
    toast(`Imported sound "${file.name}" (${duration.toFixed(2)}s).`);
    return;
  }

  if (choice === 'yes') {
    // Open audio-trimming window before importing
    openAudioTrimmer({
      title: `Trim before import: ${file.name}`,
      name: file.name,
      audioBuffer,
      originalBlob: file,
      initialStart: 0,
      initialEnd: duration,
      onConfirm: async (startSec, endSec) => {
        const isFull = startSec <= 0.005 && endSec >= duration - 0.005;
        let finalBlob = file;
        let finalDuration = duration;
        let finalPeaks = waveformData;

        if (!isFull) {
          const slicedBuf = sliceAudioBuffer(audioBuffer, startSec, endSec);
          finalBlob = audioBufferToWavBlob(slicedBuf);
          finalDuration = slicedBuf.duration;
          finalPeaks = extractWaveformData(slicedBuf, 120);
        }

        const assetId = uid('snd_asset');
        state.project.soundAssets ??= {};
        state.project.soundAssets[assetId] = {
          id: assetId,
          name: file.name,
          duration: finalDuration,
          blob: finalBlob,
          originalBlob: file, // Keep original safe!
          waveformData: finalPeaks,
        };
        state.dirty = true;
        H.checkpoint();
        emit('soundChange');
        toast(`Imported trimmed sound "${file.name}" (${finalDuration.toFixed(2)}s).`);
      },
    });
  }
}

/**
 * Open trimming window for an existing imported sound asset in the library.
 * The original audio is kept safe and preserved.
 */
export async function editSoundAsset(assetId) {
  const asset = state.project.soundAssets?.[assetId];
  if (!asset) return;

  // Always decode from originalBlob if available, so user can expand/re-trim anytime!
  const sourceBlob = asset.originalBlob || asset.blob;
  let audioBuffer;
  try {
    audioBuffer = await decodeAudioBlob(sourceBlob);
  } catch (err) {
    toast(`Could not open audio for editing: ${err.message}`, true);
    return;
  }

  const origDuration = audioBuffer.duration;
  openAudioTrimmer({
    title: `Edit Sound: ${asset.name}`,
    name: asset.name,
    audioBuffer,
    originalBlob: sourceBlob,
    initialStart: 0,
    initialEnd: Math.min(origDuration, asset.duration || origDuration),
    onConfirm: async (startSec, endSec) => {
      const isFull = startSec <= 0.005 && endSec >= origDuration - 0.005;
      let finalBlob = sourceBlob;
      let finalDuration = origDuration;
      let finalPeaks;

      if (!isFull) {
        const slicedBuf = sliceAudioBuffer(audioBuffer, startSec, endSec);
        finalBlob = audioBufferToWavBlob(slicedBuf);
        finalDuration = slicedBuf.duration;
        finalPeaks = extractWaveformData(slicedBuf, 120);
      } else {
        finalPeaks = extractWaveformData(audioBuffer, 120);
      }

      asset.blob = finalBlob;
      asset.duration = finalDuration;
      asset.waveformData = finalPeaks;
      invalidateAssetAudioBuffer(asset.id);

      // Update durations on placed timeline clips that use this asset
      if (state.project.sounds) {
        for (const snd of state.project.sounds) {
          if (snd.assetId === asset.id) {
            snd.duration = finalDuration;
          }
        }
      }

      state.dirty = true;
      H.checkpoint();
      emit('soundChange');
      toast(`Updated sound "${asset.name}" (${finalDuration.toFixed(2)}s).`);
    },
  });
}

/**
 * Show the dialog asking: "Do you want to edit this sound before importing?"
 * Returns Promise<'yes' | 'no' | 'cancel'>
 */
function showImportChoiceDialog(filename, duration) {
  return new Promise((resolve) => {
    let dlg = $('#soundImportChoiceDlg');
    if (!dlg) {
      dlg = el('dialog', 'sound-choice-dlg');
      dlg.id = 'soundImportChoiceDlg';
      document.body.append(dlg);
    }

    dlg.replaceChildren();

    const title = el('h3', 'dlg-title', 'Import Sound');
    const question = el('p', 'dlg-question', 'Do you want to edit this sound before importing?');
    const details = el('div', 'dlg-details', `${filename} (${duration.toFixed(2)} seconds)`);

    const actions = el('div', 'dlg-actions-row');
    const btnYes = el('button', 'btn-trim-yes primary', 'Yes, edit / trim');
    const btnNo = el('button', 'btn-trim-no', 'No, import original');
    const btnCancel = el('button', 'btn-trim-cancel', 'Cancel');

    actions.append(btnYes, btnNo, btnCancel);
    dlg.append(title, question, details, actions);

    const cleanup = () => {
      btnYes.onclick = btnNo.onclick = btnCancel.onclick = null;
      dlg.close();
    };

    btnYes.onclick = () => { cleanup(); resolve('yes'); };
    btnNo.onclick = () => { cleanup(); resolve('no'); };
    btnCancel.onclick = () => { cleanup(); resolve('cancel'); };

    dlg.oncancel = () => { cleanup(); resolve('cancel'); };
    dlg.showModal();
  });
}

/**
 * Open the interactive audio trimming modal window.
 */
function openAudioTrimmer({
  title,
  name,
  audioBuffer,
  originalBlob,
  initialStart = 0,
  initialEnd = 0,
  onConfirm,
}) {
  stopPreview();

  let dlg = $('#soundTrimDlg');
  if (!dlg) {
    dlg = el('dialog', 'sound-trim-dlg');
    dlg.id = 'soundTrimDlg';
    document.body.append(dlg);
  }

  dlg.replaceChildren();

  const totalDuration = audioBuffer.duration;
  let startSec = Math.max(0, Math.min(totalDuration, initialStart));
  let endSec = initialEnd > startSec ? Math.min(totalDuration, initialEnd) : totalDuration;
  if (endSec <= startSec) endSec = totalDuration;

  let previewController = null;
  const waveformPeaks = extractWaveformData(audioBuffer, 240);

  // Dialog Header
  const header = el('div', 'trim-head');
  const hTitle = el('h3', 'trim-title', title);
  const btnClose = el('button', 'trim-close-btn', '✕');
  header.append(hTitle, btnClose);

  // Waveform View Container
  const waveWrap = el('div', 'trim-wave-wrap');
  const waveCanvas = el('canvas', 'trim-wave-canvas');
  waveCanvas.width = 720;
  waveCanvas.height = 140;

  // Shaded region overlays & handles
  const maskLeft = el('div', 'trim-mask trim-mask-left');
  const maskRight = el('div', 'trim-mask trim-mask-right');
  const activeRegion = el('div', 'trim-active-region');

  const handleStart = el('div', 'trim-handle trim-handle-start');
  handleStart.innerHTML = '<div class="handle-pill">◀ Start</div><div class="handle-line"></div>';

  const handleEnd = el('div', 'trim-handle trim-handle-end');
  handleEnd.innerHTML = '<div class="handle-pill">End ▶</div><div class="handle-line"></div>';

  const trimPlayhead = el('div', 'trim-playhead');
  trimPlayhead.hidden = true;

  waveWrap.append(waveCanvas, maskLeft, maskRight, activeRegion, handleStart, handleEnd, trimPlayhead);

  // Time Readout and manual inputs
  const timeBar = el('div', 'trim-time-bar');
  const startLbl = el('label', 'trim-lbl', 'Start: ');
  const startInp = el('input', 'trim-inp');
  startInp.type = 'number';
  startInp.step = '0.01';
  startInp.min = '0';
  startInp.max = totalDuration.toFixed(2);
  startInp.value = startSec.toFixed(2);
  startLbl.append(startInp, el('span', '', ' s'));

  const endLbl = el('label', 'trim-lbl', 'End: ');
  const endInp = el('input', 'trim-inp');
  endInp.type = 'number';
  endInp.step = '0.01';
  endInp.min = '0';
  endInp.max = totalDuration.toFixed(2);
  endInp.value = endSec.toFixed(2);
  endLbl.append(endInp, el('span', '', ' s'));

  const durInfo = el('span', 'trim-dur-info');
  const updateDurInfo = () => {
    durInfo.textContent = `Selected: ${(endSec - startSec).toFixed(2)}s / Total: ${totalDuration.toFixed(2)}s`;
  };
  updateDurInfo();

  timeBar.append(startLbl, endLbl, durInfo);

  // Preview Buttons & Controls
  const ctlBar = el('div', 'trim-ctl-bar');
  const btnPrevSel = el('button', 'trim-btn preview-btn', '▶ Preview selection');
  const btnPrevFull = el('button', 'trim-btn', '▶ Play full original');
  const btnStopPrev = el('button', 'trim-btn', '❚❚ Stop');
  btnStopPrev.disabled = true;

  const btnReset = el('button', 'trim-btn', 'Reset to full');

  ctlBar.append(btnPrevSel, btnPrevFull, btnStopPrev, el('span', 'sp'), btnReset);

  // Dialog Footer Actions
  const footBar = el('div', 'trim-foot-bar');
  const btnCancel = el('button', 'trim-btn-cancel', 'Cancel');
  const btnConfirm = el('button', 'trim-btn-confirm primary', 'Confirm & Apply');
  footBar.append(btnCancel, btnConfirm);

  dlg.append(header, waveWrap, timeBar, ctlBar, footBar);

  // Render Waveform
  drawWaveform(waveCanvas, waveformPeaks, {
    color: '#38bdf8',
    bgColor: '#0c1427',
    barWidth: 2,
    barGap: 1,
  });

  // Position updates for handles and masks
  function updateVisuals() {
    const wrapWidth = waveWrap.clientWidth || 720;
    const leftPx = (startSec / totalDuration) * wrapWidth;
    const rightPx = (endSec / totalDuration) * wrapWidth;

    maskLeft.style.width = `${Math.max(0, leftPx)}px`;
    maskRight.style.left = `${Math.min(wrapWidth, rightPx)}px`;
    maskRight.style.width = `${Math.max(0, wrapWidth - rightPx)}px`;

    activeRegion.style.left = `${leftPx}px`;
    activeRegion.style.width = `${Math.max(0, rightPx - leftPx)}px`;

    handleStart.style.left = `${leftPx}px`;
    handleEnd.style.left = `${rightPx}px`;

    startInp.value = startSec.toFixed(2);
    endInp.value = endSec.toFixed(2);
    updateDurInfo();
  }

  // Handle Dragging
  function attachHandleDrag(handleEl, isStart) {
    handleEl.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wrapRect = waveWrap.getBoundingClientRect();

      const onMouseMove = (moveEv) => {
        const wrapW = wrapRect.width || 720;
        const x = Math.max(0, Math.min(wrapW, moveEv.clientX - wrapRect.left));
        const timeAtX = (x / wrapW) * totalDuration;

        if (isStart) {
          startSec = Math.max(0, Math.min(endSec - 0.05, timeAtX));
        } else {
          endSec = Math.min(totalDuration, Math.max(startSec + 0.05, timeAtX));
        }
        updateVisuals();
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };
  }

  attachHandleDrag(handleStart, true);
  attachHandleDrag(handleEnd, false);

  // Dragging the active region in between handles moves both together
  activeRegion.onmousedown = (e) => {
    e.preventDefault();
    const wrapRect = waveWrap.getBoundingClientRect();
    const startX = e.clientX;
    const origStart = startSec;
    const origEnd = endSec;
    const span = origEnd - origStart;

    const onMouseMove = (moveEv) => {
      const wrapW = wrapRect.width || 720;
      const deltaX = moveEv.clientX - startX;
      const deltaTime = (deltaX / wrapW) * totalDuration;

      let newStart = origStart + deltaTime;
      let newEnd = origEnd + deltaTime;

      if (newStart < 0) {
        newStart = 0;
        newEnd = span;
      }
      if (newEnd > totalDuration) {
        newEnd = totalDuration;
        newStart = totalDuration - span;
      }

      startSec = newStart;
      endSec = newEnd;
      updateVisuals();
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Manual input changes
  startInp.onchange = () => {
    const val = parseFloat(startInp.value) || 0;
    startSec = Math.max(0, Math.min(endSec - 0.05, val));
    updateVisuals();
  };

  endInp.onchange = () => {
    const val = parseFloat(endInp.value) || totalDuration;
    endSec = Math.min(totalDuration, Math.max(startSec + 0.05, val));
    updateVisuals();
  };

  // Reset button
  btnReset.onclick = () => {
    startSec = 0;
    endSec = totalDuration;
    updateVisuals();
  };

  // Preview Handling
  let playheadRaf = 0;
  function stopPreviewAndPlayhead() {
    if (previewController) {
      previewController.stop();
      previewController = null;
    }
    cancelAnimationFrame(playheadRaf);
    trimPlayhead.hidden = true;
    btnStopPrev.disabled = true;
    btnPrevSel.disabled = false;
    btnPrevFull.disabled = false;
  }

  function startPreviewAnimation(fromSec, durSec) {
    const startTime = performance.now();
    const wrapW = waveWrap.clientWidth || 720;
    trimPlayhead.hidden = false;

    function tick() {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed > durSec) {
        trimPlayhead.hidden = true;
        return;
      }
      const currentSec = fromSec + elapsed;
      const x = (currentSec / totalDuration) * wrapW;
      trimPlayhead.style.left = `${x}px`;
      playheadRaf = requestAnimationFrame(tick);
    }
    playheadRaf = requestAnimationFrame(tick);
  }

  btnPrevSel.onclick = async () => {
    stopPreviewAndPlayhead();
    btnPrevSel.disabled = true;
    btnStopPrev.disabled = false;
    const dur = endSec - startSec;
    startPreviewAnimation(startSec, dur);
    previewController = await previewAudio(audioBuffer, {
      startSec,
      durationSec: dur,
      onEnd: stopPreviewAndPlayhead,
    });
  };

  btnPrevFull.onclick = async () => {
    stopPreviewAndPlayhead();
    btnPrevFull.disabled = true;
    btnStopPrev.disabled = false;
    startPreviewAnimation(0, totalDuration);
    previewController = await previewAudio(audioBuffer, {
      startSec: 0,
      durationSec: totalDuration,
      onEnd: stopPreviewAndPlayhead,
    });
  };

  btnStopPrev.onclick = stopPreviewAndPlayhead;

  // Close / Cancel / Confirm
  const closeTrimmer = () => {
    stopPreviewAndPlayhead();
    dlg.close();
  };

  btnClose.onclick = closeTrimmer;
  btnCancel.onclick = closeTrimmer;
  dlg.oncancel = closeTrimmer;

  btnConfirm.onclick = async () => {
    stopPreviewAndPlayhead();
    dlg.close();
    if (onConfirm) {
      await onConfirm(startSec, endSec);
    }
  };

  dlg.showModal();
  // Ensure visual widths are updated after layout
  requestAnimationFrame(updateVisuals);
}
