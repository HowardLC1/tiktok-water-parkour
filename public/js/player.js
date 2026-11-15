/** Player body: platformer physics with one-way platforms, forced level tweens, stun / invulnerability. */
import { W, LEVEL_H, PLAYER, PHYS } from './const.js';
import { clamp, lerp, now, easeInCubic, easeOutCubic, easeInOutQuad } from './util.js';

export class Player {
  constructor() { this.w = PLAYER.w; this.h = PLAYER.h; this.reset(W / 2 - PLAYER.w / 2, 0); }

  reset(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.onGround = true; this.platform = null; this.facing = 1;
    this.dead = false; this.tween = null;
    this.stunUntil = 0; this.invulnUntil = 0;
    this.coyote = 0; this.jumpBuffer = 0; this.jumpHeld = false;
    this.animT = 0; this.squash = 0; this.bestLevel = 0;
  }

  get cx() { return this.x + this.w / 2; }
  get level() { return this.onGround ? Math.round(this.y / LEVEL_H) : Math.floor(this.y / LEVEL_H + 1e-6); }
  get stunned() { return this.stunUntil > now(); }

  startTween({ toX, toY, duration, mode = 'fall', platform = null, onDone = null }) {
    this.tween = { fromX: this.x, fromY: this.y, toX, toY, start: now(), dur: Math.max(16, duration), mode, platform, onDone };
    this.onGround = false; this.platform = null; this.vx = 0; this.vy = 0;
  }

  update(dt, input, world, mods, events = {}) {
    this.animT += dt;
    this.squash *= Math.exp(-9 * dt);

    if (this.tween) {
      const tw = this.tween;
      const p = clamp((now() - tw.start) / tw.dur, 0, 1);
      const e = tw.mode === 'fall' ? easeInCubic(p) : tw.mode === 'rise' ? easeOutCubic(p) : easeInOutQuad(p);
      this.x = lerp(tw.fromX, tw.toX, e); this.y = lerp(tw.fromY, tw.toY, e);
      if (p >= 1) {
        this.tween = null; this.onGround = true; this.platform = tw.platform; this.vx = 0; this.vy = 0;
        this.squash = tw.mode === 'fall' ? 0.45 : 0.2; this.jumpBuffer = 0;
        tw.onDone?.();
      }
      return;
    }

    const slippery = !!mods.slippery;
    const accel = slippery ? PHYS.accelSlippery : PHYS.accel;
    const maxSpeed = slippery ? PHYS.maxSpeedSlippery : PHYS.maxSpeed;
    const stunned = this.stunned;

    let dir = 0;
    if (!stunned) { if (input.left) dir -= 1; if (input.right) dir += 1; }
    if (dir) { this.vx += dir * accel * dt; this.facing = dir; }
    else {
      const damp = this.onGround ? (slippery ? PHYS.dampSlippery : PHYS.dampGround) : PHYS.dampAir;
      this.vx *= Math.exp(-damp * dt);
      if (Math.abs(this.vx) < 3) this.vx = 0;
    }
    this.vx = clamp(this.vx, -maxSpeed, maxSpeed);

    if (input.jump && !this.jumpHeld) this.jumpBuffer = 0.12;
    this.jumpHeld = !!input.jump;
    this.jumpBuffer -= dt; this.coyote -= dt;
    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0) && !stunned) {
      this.vy = PHYS.jumpV; this.onGround = false; this.platform = null; this.coyote = 0; this.jumpBuffer = 0; this.squash = -0.3;
      events.jump?.();
    }

    if (this.onGround && this.platform) this.x += world.offsetDelta(this.platform.level);

    const prevY = this.y;
    if (!this.onGround) this.vy = Math.max(this.vy - PHYS.gravity * dt, -2300);
    this.x += this.vx * dt; this.y += this.vy * dt;

    if (this.x < 0) { this.x = 0; this.vx = slippery ? -this.vx * 0.5 : 0; }
    if (this.x + this.w > W) { this.x = W - this.w; this.vx = slippery ? -this.vx * 0.5 : 0; }

    if (this.vy <= 0) {
      const lo = Math.floor(Math.min(prevY, this.y) / LEVEL_H) - 1;
      const hi = Math.ceil(Math.max(prevY, this.y) / LEVEL_H) + 1;
      let landed = null;
      for (const p of world.visible(lo, hi)) {
        if (prevY >= p.y - 2 && this.y <= p.y && this.x + this.w > p.x + 6 && this.x < p.x + p.w - 6) {
          if (!landed || p.y > landed.y) landed = p;
        }
      }
      if (landed) {
        const wasAir = !this.onGround;
        this.y = landed.y; this.vy = 0; this.onGround = true; this.platform = landed;
        if (wasAir) { this.squash = 0.35; events.land?.(landed); }
      }
    }

    if (this.onGround) {
      let support = null;
      const l = this.level;
      for (const p of world.visible(l - 1, l + 1)) {
        if (Math.abs(p.y - this.y) < 3 && this.x + this.w > p.x + 6 && this.x < p.x + p.w - 6) { support = p; break; }
      }
      if (!support) { this.onGround = false; this.platform = null; this.coyote = 0.09; }
      else this.platform = support;
    }
    if (this.y < -600) this.y = -600;
    if (this.onGround) this.bestLevel = Math.max(this.bestLevel, this.level);
  }
}
