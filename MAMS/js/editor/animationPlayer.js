// One rAF loop, elapsed-time based. Never more than one loop alive.
// Synchronizes animation frames with audio timeline playback.

export class AnimationPlayer {
  constructor({ getFrames, getIndex, isLooping, onFrame, onTick, onStart, onLoop, onStop }) {
    Object.assign(this, { getFrames, getIndex, isLooping, onFrame, onTick, onStart, onLoop, onStop });
    this.raf = 0; this.last = 0; this.acc = 0;
  }

  get playing() { return this.raf !== 0; }

  /** Total duration of all frames in milliseconds. */
  totalDuration() {
    const frames = this.getFrames();
    return frames.reduce((sum, f) => sum + (f.duration || 83), 0);
  }

  /** Compute start millisecond of frame at given index. */
  frameStartTime(idx) {
    const frames = this.getFrames();
    let sum = 0;
    for (let j = 0; j < idx && j < frames.length; j++) {
      sum += (frames[j].duration || 83);
    }
    return sum;
  }

  /** Current millisecond timestamp within the animation. */
  currentTimeMs() {
    return this.frameStartTime(this.getIndex()) + this.acc;
  }

  play(startMs = null) {
    if (this.raf) return;
    const frames = this.getFrames();
    const n = frames.length;
    if (!n) return;

    if (startMs != null) {
      // Seek to exact millisecond
      let sum = 0, chosenIdx = 0, chosenAcc = 0;
      for (let j = 0; j < n; j++) {
        const dur = frames[j].duration || 83;
        if (startMs >= sum && startMs < sum + dur) {
          chosenIdx = j;
          chosenAcc = startMs - sum;
          break;
        }
        sum += dur;
      }
      this.onFrame(chosenIdx);
      this.acc = chosenAcc;
    } else {
      if (!this.isLooping() && this.getIndex() >= n - 1) {
        this.onFrame(0);
        this.acc = 0;
      }
    }

    const currentMs = this.currentTimeMs();
    this.last = performance.now();
    this.onStart?.(currentMs);
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  pause() {
    const was = this.raf;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (was) this.onStop?.();
  }

  stop() {
    this.pause();
    this.acc = 0;
    this.onFrame(0);
    this.onTick?.(0);
  }

  destroy() {
    this.pause();
  }

  tick(now) {
    const frames = this.getFrames();
    this.acc += now - this.last;
    this.last = now;

    let i = this.getIndex(), moved = false;
    while (frames.length && this.acc >= (frames[i].duration || 83)) {
      this.acc -= (frames[i].duration || 83);
      if (i + 1 >= frames.length) {
        if (!this.isLooping()) {
          this.acc = (frames[i].duration || 83);
          this.onFrame(i);
          this.onTick?.(this.totalDuration());
          this.pause();
          return;
        }
        i = 0;
        this.onLoop?.();
      } else {
        i++;
      }
      moved = true;
    }

    if (moved) this.onFrame(i);

    const currentMs = this.frameStartTime(i) + this.acc;
    this.onTick?.(currentMs);

    this.raf = requestAnimationFrame((t) => this.tick(t));
  }
}
