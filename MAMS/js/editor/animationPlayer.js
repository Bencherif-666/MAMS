// One rAF loop, elapsed-time based. Never more than one loop alive.
export class AnimationPlayer {
  constructor({ getFrames, getIndex, isLooping, onFrame }) {
    Object.assign(this, { getFrames, getIndex, isLooping, onFrame });
    this.raf = 0; this.last = 0; this.acc = 0;
  }
  get playing() { return this.raf !== 0; }
  play() {
    if (this.raf) return;
    const n = this.getFrames().length;
    if (!this.isLooping() && this.getIndex() >= n - 1) this.onFrame(0);
    this.last = performance.now(); this.acc = 0;
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }
  pause() { const was = this.raf; cancelAnimationFrame(this.raf); this.raf = 0; if (was) this.onStop?.(); }
  stop() { this.pause(); this.onFrame(0); }
  destroy() { this.pause(); }
  tick(now) {
    const frames = this.getFrames();
    this.acc += now - this.last; this.last = now;
    let i = this.getIndex(), moved = false;
    while (frames.length && this.acc >= frames[i].duration) {
      this.acc -= frames[i].duration;
      if (i + 1 >= frames.length) {
        if (!this.isLooping()) { this.onFrame(i); this.pause(); return; }
        i = 0;
      } else i++;
      moved = true;
    }
    if (moved) this.onFrame(i);
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }
}
