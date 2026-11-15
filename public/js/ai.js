/**
 * Parkour bot: picks the best reachable platform above, walks to a launch point,
 * jumps, steers in the air, dodges falling doughnuts, and adapts to inverted controls.
 */
import { W, LEVEL_H, PHYS, AI_REACH } from './const.js';
import { clamp, now, rand } from './util.js';

export class ParkourAI {
  constructor() { this.reset(); }
  reset() { this.target = null; this.retargetAt = 0; this.wanderDir = 0; this.wanderUntil = 0; this.thinkUntil = 0; this.wasGrounded = true; }

  decide({ player, world, water, hazards, reverseElapsed }) {
    const out = { left: false, right: false, jump: false };
    if (player.dead || player.tween || player.stunned) return out;

    const t = now();
    const px = player.cx;
    const lvl = player.level;

    // ── hazard avoidance ────────────────────────────────────
    let dodge = 0;
    for (const m of hazards.meteors) {
      const dy = m.y - player.y;
      if (dy > -30 && dy < 560 && Math.abs(m.x - px) < 120) dodge += (px < m.x ? -1 : 1) * (1.2 - Math.abs(m.x - px) / 120);
    }
    for (const w of hazards.warnings) {
      if (Math.abs(w.x - px) < 75 && Math.abs(w.shadowY.y - player.y) < 40) dodge += (px < w.x ? -1 : 1) * 0.7;
    }

    // landing → always re-plan from where we actually stand (a missed jump leaves a stale target)
    const justLanded = player.onGround && !this.wasGrounded;
    this.wasGrounded = player.onGround;
    if (justLanded) { this.target = null; this.thinkUntil = t + rand(120, 520); }
    const hurry = water.level > lvl - 3;

    // ── target selection (only re-plan while standing; mid-air re-plans misjudge the level) ──
    if (!this.target || !this.valid(player, world) || (player.onGround && t > this.retargetAt)) {
      this.target = this.pickTarget(player, world, water);
      this.retargetAt = t + 320;
    }
    let tg = this.target;

    // falling past a target that is still above us → forget it and pick somewhere to land
    if (tg && !player.onGround && player.vy < -150 && tg.y > player.y + 20) {
      const land = this.pickLanding(player, world, water);
      if (land) { this.target = land; tg = land; }
    }

    let dir = 0, jump = false;
    const plat = player.platform;
    const edgeL = plat ? plat.x + 14 : 0, edgeR = plat ? plat.x + plat.w - 14 : W;

    if (dodge !== 0 && player.onGround) {
      dir = Math.sign(dodge);
      if ((dir < 0 && px - 40 < edgeL) || (dir > 0 && px + 40 > edgeR)) dir = 0;
    } else if (tg) {
      const spanL = tg.x + 22, spanR = tg.x + tg.w - 22;
      const nearest = clamp(px, spanL, spanR);
      const up = tg.level - lvl;
      const reach = (AI_REACH[up] ?? (up <= 0 ? 320 : 40)) * 0.9;
      if (player.onGround) {
        const standX = clamp(nearest, edgeL, edgeR);
        const gapNow = Math.abs(nearest - px);
        const atLaunch = Math.abs(standX - px) <= 10;
        if (gapNow <= reach && (up > 0 || gapNow > 0)) {
          jump = true;
          dir = Math.abs(nearest - px) > 6 ? Math.sign(nearest - px) : 0;
        } else if (!atLaunch) {
          dir = Math.sign(standX - px);
        } else {
          // nothing reachable from here: go for it from the closest edge rather than wait for the water
          jump = true; dir = Math.abs(nearest - px) > 6 ? Math.sign(nearest - px) : 0;
        }
        if (water.level > lvl - 1.2 && up > 0) jump = true;  // water is here — go now
      } else {
        // airborne: steer, but RELEASE jump so the next press re-triggers on landing
        const inside = px >= spanL && px <= spanR;
        if (!inside) dir = Math.sign(nearest - px);
        else if (Math.abs(player.vx) > 140) dir = -Math.sign(player.vx);
        jump = false;
      }
    } else {
      if (t > this.wanderUntil) { this.wanderDir = Math.round(rand(-1, 1)); this.wanderUntil = t + rand(300, 900); }
      dir = this.wanderDir;
      if ((dir < 0 && px - 40 < edgeL) || (dir > 0 && px + 40 > edgeR)) dir = 0;
    }

    if (jump && player.onGround && !hurry && t < this.thinkUntil && dodge === 0) { jump = false; dir = 0; }
    // never walk off the edge of the current platform unless this frame is a jump
    if (player.onGround && !jump && dir !== 0) { const nx = px + dir * 6; if (nx < edgeL || nx > edgeR) dir = 0; }

    // slippery compensation: brake when sliding past the launch spot
    if (player.onGround && dir === 0 && Math.abs(player.vx) > 80 && !jump) dir = -Math.sign(player.vx);

    // reverse-controls adaptation: after ~1.5s of confusion the bot pre-inverts its intent
    if (reverseElapsed != null && reverseElapsed > 1500) dir = -dir;

    out.left = dir < 0; out.right = dir > 0; out.jump = jump;
    return out;
  }

  valid(player, world) {
    const tg = this.target; if (!tg) return false;
    if (world.isHidden(tg.level)) return false;
    if (player.onGround && tg.level <= player.level && tg.level !== player.level) return false;
    if (player.onGround && tg.level === player.level && player.platform && player.platform.id === tg.id) return false;
    return true;
  }

  pickTarget(player, world, water) {
    const px = player.cx;
    const lvl = player.level;
    const plat = player.platform;
    const edgeL = plat ? plat.x + 14 : px, edgeR = plat ? plat.x + plat.w - 14 : px;
    let best = null, bestScore = -Infinity, fallback = null, fallbackGap = Infinity;
    for (const up of [1, 2, 0, -1]) {
      const l = lvl + up; if (l < 0) continue;
      for (const p of world.visible(l, l)) {
        if (up === 0 && plat && p.id === plat.id) continue;
        if (up <= 0 && p.y <= water.y + 40) continue;
        const spanL = p.x + 22, spanR = p.x + p.w - 22;
        const nearest = clamp(px, spanL, spanR);
        const standX = clamp(nearest, edgeL, edgeR);
        const gap = Math.abs(nearest - standX);
        const reach = AI_REACH[up] ?? (up <= 0 ? 320 : 40);
        if (up > 0 && gap <= fallbackGap && up === 1) { fallback = { p, gap }; fallbackGap = gap; }
        if (gap > reach) continue;
        let score = up === 1 ? 10 : up === 2 ? 9 : up === 0 ? 2 : 0.5;
        score -= gap / 200 + Math.abs(standX - px) / 600;
        score += p.w / 1000;
        if (up > 0 && !this.hasOnward(p, world)) score -= 6;   // dead end: nothing reachable from there
        if (score > bestScore) { bestScore = score; best = p; }
      }
    }
    if (!best && fallback) best = fallback.p;
    return best ? { ...best } : null;
  }

  /** Can the bot continue upward from platform p? (one- or two-level jump to anything visible) */
  hasOnward(p, world) {
    const eL = p.x + 14, eR = p.x + p.w - 14;
    for (const up of [1, 2]) {
      for (const q of world.visible(p.level + up, p.level + up)) {
        const gap = Math.max(0, q.x + 22 - eR, eL - (q.x + q.w - 22));
        if (gap <= AI_REACH[up]) return true;
      }
    }
    return false;
  }

  /** While falling: the highest platform below that can still be reached by air-steering. */
  pickLanding(player, world, water) {
    const px = player.cx;
    const top = Math.floor(player.y / LEVEL_H);
    const s0 = Math.max(0, -player.vy);
    for (let l = top; l >= Math.max(0, top - 5); l--) {
      if (l * LEVEL_H <= water.y + 30) break;
      const drop = player.y - l * LEVEL_H; if (drop < 0) continue;
      const tFall = (-s0 + Math.sqrt(s0 * s0 + 2 * PHYS.gravity * drop)) / PHYS.gravity;
      const reachX = Math.min(PHYS.maxSpeed * tFall, 420) * 0.85;
      let best = null, bs = Infinity;
      for (const p of world.visible(l, l)) {
        const nearest = clamp(px, p.x + 22, p.x + p.w - 22);
        const gap = Math.abs(nearest - px);
        if (gap <= reachX && gap < bs) { bs = gap; best = p; }
      }
      if (best) return { ...best };
    }
    return null;
  }
}
