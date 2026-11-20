// Web Audio API engine for Mugen Animation Studio.
// Handles audio decoding, waveform extraction, precise timeline synchronization,
// trimming, and WAV encoding with zero external dependencies.

import { state } from '../core/state.js?v=9';

let audioCtx = null;
const bufferCache = new Map(); // assetId -> AudioBuffer
let activeSources = [];
let currentPreview = null;

export function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export async function decodeAudioBlob(blob) {
  const ctx = getAudioContext();
  if (!ctx) throw new Error('Web Audio API is not supported in this browser.');
  const arrayBuffer = await blob.arrayBuffer();
  // decodeAudioData detaches the arrayBuffer, so we pass a slice/copy if needed
  return await ctx.decodeAudioData(arrayBuffer);
}

export async function getAssetAudioBuffer(asset) {
  if (!asset || !asset.blob) return null;
  if (bufferCache.has(asset.id)) {
    return bufferCache.get(asset.id);
  }
  try {
    const buffer = await decodeAudioBlob(asset.blob);
    bufferCache.set(asset.id, buffer);
    return buffer;
  } catch (err) {
    console.error(`Failed to decode audio for asset ${asset.name || asset.id}:`, err);
    return null;
  }
}

export function invalidateAssetAudioBuffer(assetId) {
  bufferCache.delete(assetId);
}

export function clearAudioCache() {
  bufferCache.clear();
  stopAllPlayback();
}

/** Stop all currently scheduled timeline sound sources. */
export function stopAllPlayback() {
  for (const src of activeSources) {
    try {
      src.stop();
      src.disconnect();
    } catch (_) {}
  }
  activeSources = [];
}

/** Stop any ongoing library or trim preview. */
export function stopPreview() {
  if (currentPreview) {
    const prev = currentPreview;
    currentPreview = null;
    if (typeof prev.stop === 'function') {
      try {
        prev.stop();
      } catch (_) {}
    } else {
      try {
        if (prev.source) {
          prev.source.onended = null;
          prev.source.stop();
          prev.source.disconnect();
        }
      } catch (_) {}
      if (prev.onEnd) {
        try {
          prev.onEnd();
        } catch (_) {}
      }
    }
  }
}

/**
 * Schedule and play placed sounds synchronized with animation playback.
 * @param {number} startMs - Time in milliseconds where animation playback begins.
 * @param {boolean} loop - Whether animation is looping.
 * @param {number} totalDurationMs - Total duration of the animation in milliseconds.
 */
export async function playTimelineSounds(startMs = 0, loop = false, totalDurationMs = 0) {
  stopAllPlayback();
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }

  const sounds = state.project.sounds || [];
  if (!sounds.length) return;

  const nowCtx = ctx.currentTime;

  for (const placement of sounds) {
    const asset = state.project.soundAssets?.[placement.assetId];
    if (!asset) continue;

    const buffer = await getAssetAudioBuffer(asset);
    if (!buffer) continue;

    const clipDurationSec = buffer.duration;
    const clipDurationMs = clipDurationSec * 1000;
    const clipStartMs = placement.startMs;
    const clipEndMs = clipStartMs + clipDurationMs;

    // Only consider sounds that have not finished before startMs
    if (clipEndMs <= startMs) continue;

    // If clip starts at or after startMs
    if (clipStartMs >= startMs) {
      const delaySec = (clipStartMs - startMs) / 1000;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(nowCtx + delaySec, 0);
      activeSources.push(source);
    } else {
      // Clip started before startMs and is currently in-progress
      const offsetSec = (startMs - clipStartMs) / 1000;
      if (offsetSec < clipDurationSec) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(nowCtx, offsetSec);
        activeSources.push(source);
      }
    }
  }
}

/**
 * Preview an audio asset or buffer with optional start and duration.
 * Calls onEnd callback when finished.
 */
export async function previewAudio(assetOrBuffer, { startSec = 0, durationSec = null, onEnd = null } = {}) {
  stopPreview();
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }

  let buffer = null;
  if (assetOrBuffer instanceof AudioBuffer) {
    buffer = assetOrBuffer;
  } else {
    buffer = await getAssetAudioBuffer(assetOrBuffer);
  }
  if (!buffer || buffer.duration <= 0) return null;

  const actualStart = Math.max(0, Math.min(buffer.duration - 0.001, startSec));
  const remaining = Math.max(0, buffer.duration - actualStart);
  const playDur = durationSec != null ? Math.min(durationSec, remaining) : remaining;
  if (playDur <= 0.001) return null;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  let isEnded = false;
  const finish = (triggerOnEnd = true) => {
    if (isEnded) return;
    isEnded = true;

    try {
      source.onended = null;
      source.stop();
      source.disconnect();
    } catch (_) {}

    if (currentPreview === controller) {
      currentPreview = null;
    }

    if (triggerOnEnd && onEnd) {
      try {
        onEnd();
      } catch (err) {
        console.error('Error in preview onEnd callback:', err);
      }
    }
  };

  const controller = {
    source,
    stop: () => finish(true),
  };
  currentPreview = controller;

  source.onended = () => finish(true);

  if (durationSec != null) {
    source.start(0, actualStart, playDur);
  } else {
    source.start(0, actualStart);
  }

  return controller;
}

/**
 * Extract normalized waveform peak values from an AudioBuffer.
 * Returns an array of peaks between 0.0 and 1.0.
 */
export function extractWaveformData(buffer, numPeaks = 100) {
  if (!buffer || buffer.length === 0) return [];
  const channelData = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channelData.length / numPeaks));
  const peaks = [];

  for (let i = 0; i < numPeaks; i++) {
    const start = i * step;
    const end = Math.min(start + step, channelData.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const val = Math.abs(channelData[j]);
      if (val > max) max = val;
    }
    peaks.push(Math.min(1.0, max));
  }
  return peaks;
}

/**
 * Draw a waveform on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} peaks - Array of normalized peaks (0 to 1).
 * @param {object} options
 */
export function drawWaveform(canvas, peaks, {
  color = '#38bdf8',
  bgColor = 'transparent',
  mirror = true,
  barWidth = 2,
  barGap = 1,
} = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  if (bgColor && bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
  }

  if (!peaks || !peaks.length) {
    // Draw flat center line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    return;
  }

  const midY = h / 2;
  const totalBars = Math.floor(w / (barWidth + barGap));
  const step = peaks.length / totalBars;

  ctx.fillStyle = color;

  for (let i = 0; i < totalBars; i++) {
    const peakIndex = Math.min(peaks.length - 1, Math.floor(i * step));
    const peak = peaks[peakIndex] || 0.05;
    const barHeight = Math.max(2, peak * (h * 0.9));
    const x = i * (barWidth + barGap);

    if (mirror) {
      const topY = midY - barHeight / 2;
      ctx.fillRect(x, topY, barWidth, barHeight);
    } else {
      ctx.fillRect(x, h - barHeight, barWidth, barHeight);
    }
  }
}

/**
 * Slice an AudioBuffer between startSec and endSec.
 * Returns a new AudioBuffer.
 */
export function sliceAudioBuffer(buffer, startSec, endSec) {
  const ctx = getAudioContext();
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(buffer.length, Math.ceil(endSec * sampleRate));
  const sliceLength = Math.max(1, endSample - startSample);

  const slicedBuffer = ctx.createBuffer(numChannels, sliceLength, sampleRate);
  for (let c = 0; c < numChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = slicedBuffer.getChannelData(c);
    dst.set(src.subarray(startSample, endSample));
  }
  return slicedBuffer;
}

/**
 * Encode an AudioBuffer into standard 16-bit PCM WAV Blob.
 */
export function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const length = buffer.length;
  const dataByteLength = length * blockAlign;
  const headerByteLength = 44;
  const totalLength = headerByteLength + dataByteLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataByteLength, true);

  const channels = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
