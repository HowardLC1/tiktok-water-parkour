/** Procedural tower of platforms; deterministic per (seed, level). */
import { W, LEVEL_H, PLAT_H } from './const.js';
import { clamp, mulberry32, hashInt, now } from './util.js';

export class World {
  constructor(seed = Date.now() & 0xffffff) {
    this.reset(seed);
  }

  reset(seed) {
    this.seed = seed >>> 0;
    this.levels = new Map();
    this.mainX = new Map();
    this.quake = null;            // { amp, period, start, until, prevOffsets: Map }
    this.hiddenAltUntil = 0;
    this._offsetPrev = new Map();
    this._offsetNow = new Map();
    this.levels.set(0, [{ id: 'g0', level: 0, x: 0, y: 0, w: W, h: PLAT_H + 40, kind: 'ground' }]);
    this.mainX.set(0, W / 2);
  }

  platformsAt(level) {
    if (level < 0) return [];
    let list = this.levels.get(level);
    if (list) return list;
    if (!this.mainX.has(level - 1)) this.platformsAt(level - 1);
    const rng = mulberry32(hashInt(this.seed, level));
    const prev = this.mainX.get(level - 1) ?? W / 2;
    const dxMax = level < 4 ? 220 : 340;
    let cx = clamp(prev + (rng() * 2 - 1) * dxMax, 110, W - 110);
    const w = 150 + rng() * 110;
    const x = clamp(cx - w / 2, 10, W - w - 10);
    cx = x + w / 2;
    list = [{ id: `m${level}`, level, x, y: level * LEVEL_H, w, h: PLAT_H, kind: 'main', hue: rng() }];
    if (rng() < 0.55) {
      const side = cx < W / 2 ? 1 : -1;
      const w2 = 120 + rng() * 100;
      const cx2 = cx + side * (w / 2 + w2 / 2 + 80 + rng() * 260);
      const x2 = cx2 - w2 / 2;
      if (x2 > 10 && x2 + w2 < W - 10) list.push({ id: `e${level}`, level, x: x2, y: level * LEVEL_H, w: w2, h: PLAT_H, kind: 'extra', hue: rng() });
    }
    this.levels.set(level, list);
    this.mainX.set(level, cx);
    return list;
  }

  isHidden(level) { return level > 0 && level % 2 === 1 && this.hiddenAltUntil > now(); }
  get phased() { return this.hiddenAltUntil > now(); }

  hideAlternate(ms) { this.hiddenAltUntil = Math.max(this.hiddenAltUntil, now() + ms); }

  startQuake(speed, ms) {
    const amp = 90;
    this.quake = { amp, period: (4 * amp) / Math.max(30, speed), start: now(), until: now() + ms };
  }
  get quaking() { return !!this.quake && this.quake.until > now(); }

  offsetX(level) {
    if (!this.quaking || level === 0) return 0;
    const q = this.quake; const t = (now() - q.start) / 1000;
    const fade = Math.min(1, (q.until - now()) / 600, t / 0.6);
    return q.amp * fade * Math.sin((2 * Math.PI * t) / q.period + level * 0.9);
  }
  /** Horizontal movement of a level's platforms since the previous frame (carries the player). */
  offsetDelta(level) { return (this._offsetNow.get(level) || 0) - (this._offsetPrev.get(level) || 0); }

  update(_dt, minLevel, maxLevel) {
    this._offsetPrev = this._offsetNow; this._offsetNow = new Map();
    if (this.quaking) for (let l = Math.max(0, minLevel); l <= maxLevel; l++) this._offsetNow.set(l, this.offsetX(l));
    if (this.quake && !this.quaking) this.quake = null;
  }

  /** Visible platforms in a level range, with effective (quake-shifted) x. */
  visible(minLevel, maxLevel) {
    const out = [];
    for (let l = Math.max(0, Math.floor(minLevel)); l <= Math.ceil(maxLevel); l++) {
      if (this.isHidden(l)) continue;
      const off = this._offsetNow.get(l) ?? this.offsetX(l);
      for (const p of this.platformsAt(l)) out.push(off ? { ...p, x: p.x + off, base: p } : p);
    }
    return out;
  }

  /** Nearest visible platform at exactly `level` to x (or the closest visible level nearby). */
  landingAt(level, x, preferUp = true) {
    level = Math.max(0, Math.round(level));
    const order = preferUp ? [0, 1, -1, 2, -2, 3] : [0, -1, 1, -2, 2, 3];
    for (const d of order) {
      const l = level + d; if (l < 0 || this.isHidden(l)) continue;
      const plats = this.visible(l, l); if (!plats.length) continue;
      let best = null, bd = Infinity;
      for (const p of plats) { const c = p.x + p.w / 2; const dd = Math.abs(c - x); if (dd < bd) { bd = dd; best = p; } }
      return best;
    }
    return this.visible(0, 0)[0];
  }
}
