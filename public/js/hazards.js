/** Meteor shower (falling doughnuts) with warning shadows. */
import { W, H, LEVEL_H } from './const.js';
import { rand, now, clamp, pick } from './util.js';

export class Hazards {
  constructor() { this.shower = null; this.meteors = []; this.warnings = []; }

  get active() { return !!this.shower && this.shower.until > now(); }
  clear() { this.shower = null; this.meteors.length = 0; this.warnings.length = 0; }

  startShower({ spawnRateMs = 600, durationMs = 10000, intensity = 1, type = 'doughnut' }) {
    const t = now();
    const rate = Math.max(180, spawnRateMs / Math.min(intensity, 4));
    if (this.shower && this.shower.until > t) {
      this.shower.until = Math.max(this.shower.until, t + durationMs); this.shower.rate = Math.min(this.shower.rate, rate);
    } else {
      this.shower = { until: t + durationMs, rate, next: t + 300, type };
    }
  }

  update(dt, { cam, player, world, water, shield, vfx, audio, onHit }) {
    const t = now();
    if (this.shower) {
      if (t >= this.shower.until) this.shower = null;
      else if (t >= this.shower.next) {
        this.shower.next = t + this.shower.rate;
        const x = rand(70, W - 70);
        this.warnings.push({ x, spawnAt: t + 800, shadowY: this.shadowFor(x, cam, world, water), type: this.shower.type });
        audio.sfx('warn');
      }
    }
    for (const w of this.warnings) {
      if (t >= w.spawnAt) {
        this.meteors.push({ x: w.x, y: cam.top + 80, vx: rand(-50, 50), vy: -rand(650, 900), r: 34, rot: rand(0, 6), vrot: rand(-4, 4), type: w.type });
        audio.sfx('whistle_fall');
      }
    }
    this.warnings = this.warnings.filter((w) => t < w.spawnAt);

    const keep = [];
    for (const m of this.meteors) {
      m.vy = Math.max(-1500, m.vy - 500 * dt);
      m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.vrot * dt;
      let alive = true;
      if (m.y <= water.y) { vfx.play('splash_small', { x: m.x, y: water.y }); audio.sfx('water_drop'); alive = false; }
      else if (m.y < cam.bottom - 300) alive = false;
      else if (!player.dead && !player.tween && t > (player.invulnUntil || 0)) {
        const cx = clamp(m.x, player.x, player.x + player.w);
        const cy = clamp(m.y, player.y, player.y + player.h);
        if ((cx - m.x) ** 2 + (cy - m.y) ** 2 < m.r * m.r) {
          if (shield) { m.vy = Math.abs(m.vy) * 0.6 + 300; m.vx = (m.x < player.x + player.w / 2 ? -1 : 1) * 400; vfx.addShake(4, 120); audio.sfx('tick'); }
          else { onHit(m); alive = false; }
        }
      }
      if (alive) keep.push(m);
    }
    this.meteors = keep;
  }

  shadowFor(x, cam, world, water) {
    const top = Math.floor(cam.top / LEVEL_H);
    const bottom = Math.max(0, Math.floor(water.level));
    for (let l = top; l >= bottom; l--) {
      for (const p of world.visible(l, l)) if (x > p.x && x < p.x + p.w) return { y: p.y, w: Math.min(p.w, 110) };
    }
    return { y: water.y, w: 110 };
  }

  render(ctx, cam) {
    const t = now();
    for (const w of this.warnings) {
      const k = 1 - (w.spawnAt - t) / 800;
      const pulse = 0.5 + 0.5 * Math.sin(t / 60);
      const [sx, sy] = cam.toScreen(w.x, w.shadowY.y);
      ctx.save(); ctx.globalAlpha = 0.35 + 0.35 * pulse;
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy - 4, (w.shadowY.w / 2) * (0.4 + 0.6 * k), 14 * (0.4 + 0.6 * k), 0, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([14, 14]); ctx.lineDashOffset = -t / 10; ctx.strokeStyle = `rgba(255,80,80,${0.5 + 0.4 * pulse})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(sx, 30); ctx.lineTo(sx, sy - 20); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.8 + 0.2 * pulse; ctx.fillStyle = '#ff3b5c';
      ctx.beginPath(); ctx.moveTo(sx, 20); ctx.lineTo(sx - 36, 85); ctx.lineTo(sx + 36, 85); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', sx, 58);
      ctx.restore();
    }
    for (const m of this.meteors) {
      const [sx, sy] = cam.toScreen(m.x, m.y);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(m.rot);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(6, 8, m.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0a060'; ctx.beginPath(); ctx.arc(0, 0, m.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5fa0'; ctx.beginPath(); ctx.arc(0, -2, m.r - 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f7d9a0'; ctx.beginPath(); ctx.arc(0, 0, m.r * 0.38, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 8; i++) { ctx.fillStyle = ['#fff', '#ffeb3b', '#4fc3f7', '#69f0ae'][i % 4]; ctx.save(); ctx.rotate(i * 0.8); ctx.fillRect(m.r * 0.6, -2, 9, 4); ctx.restore(); }
      ctx.restore();
    }
  }
}
