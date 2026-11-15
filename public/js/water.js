/** Rising / falling water with freeze, surge, drain. Level is measured in platform rows. */
import { LEVEL_H, WATER } from './const.js';
import { clamp, now, easeInOutQuad, easeOutCubic } from './util.js';

export class Water {
  constructor() { this.reset(); }

  reset() {
    this.level = WATER.startLevel;
    this.frozenUntil = 0;
    this.surges = [];      // { remaining, rate }
    this.drainTween = null;
    this.rate = 0;
    this.time = 0;
  }

  get y() { return this.level * LEVEL_H; }
  get frozen() { return this.frozenUntil > now(); }
  get frozenRemaining() { return Math.max(0, this.frozenUntil - now()); }

  freeze(ms) { this.frozenUntil = Math.max(this.frozenUntil, now()) + ms; }
  surge(levels, ms) { this.surges.push({ remaining: levels, rate: levels / Math.max(0.2, ms / 1000) }); }
  drain(ms = 1500) { this.surges.length = 0; this.drainTween = { from: this.level, to: WATER.startLevel, start: now(), dur: ms }; }
  setLevel(v) { this.surges.length = 0; this.drainTween = null; this.level = v; }

  update(dt, bestLevel, playerLevel) {
    this.time += dt;
    if (this.drainTween) {
      const p = clamp((now() - this.drainTween.start) / this.drainTween.dur, 0, 1);
      this.level = this.drainTween.from + (this.drainTween.to - this.drainTween.from) * easeOutCubic(p);
      if (p >= 1) this.drainTween = null;
      this.rate = 0;
      return;
    }
    let rate = 0;
    if (!this.frozen) {
      rate = clamp(WATER.baseRate + WATER.ratePerLevel * Math.max(0, bestLevel), WATER.baseRate, WATER.maxRate);
      if (playerLevel - this.level > WATER.catchupGap) rate *= WATER.catchupMul;
    }
    for (const s of this.surges) {
      const step = Math.min(s.remaining, s.rate * dt);
      this.level += step; s.remaining -= step;
    }
    this.surges = this.surges.filter((s) => s.remaining > 1e-4);
    this.level += rate * dt;
    this.rate = rate;
  }

  /** Surface height at world x (visual waves only). */
  surfaceY(x) {
    if (this.frozen) return this.y;
    return this.y + Math.sin(x / 70 + this.time * 2.2) * 7 + Math.sin(x / 23 - this.time * 3.1) * 3;
  }
}
