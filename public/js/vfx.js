/**
 * Particles, camera shake and full-screen overlays.
 * World-space particles use world coordinates (y grows upward) and are projected through `cam`.
 */
import { W, H } from './const.js';
import { rand, clamp, now, pick, lerp, easeOutBack, easeOutCubic } from './util.js';

export class VFX {
  constructor() {
    this.world = [];
    this.screen = [];
    this.shakes = [];               // { amp, until, start }
    this.overlays = new Map();      // name → { start, until, data }
  }

  // ── primitives ──────────────────────────────────────────
  addShake(amp, ms) { const t = now(); this.shakes.push({ amp, start: t, until: t + ms }); }
  shakeOffset() {
    const t = now(); let amp = 0;
    this.shakes = this.shakes.filter((s) => s.until > t);
    for (const s of this.shakes) amp = Math.max(amp, s.amp * (1 - (t - s.start) / (s.until - s.start)));
    if (amp <= 0) return { x: 0, y: 0 };
    return { x: rand(-amp, amp), y: rand(-amp, amp) };
  }

  overlay(name, ms, data = {}) { const t = now(); this.overlays.set(name, { start: t, until: t + ms, data }); }
  endOverlay(name) { this.overlays.delete(name); }
  hasOverlay(name) { const o = this.overlays.get(name); return !!o && o.until > now(); }
  overlayProgress(name) { const o = this.overlays.get(name); if (!o) return 1; return clamp((now() - o.start) / (o.until - o.start), 0, 1); }

  spawn(list, n, make) { for (let i = 0; i < n; i++) list.push(make(i)); }
  pw(n, make) { this.spawn(this.world, n, make); }   // world particle
  ps(n, make) { this.spawn(this.screen, n, make); }  // screen particle

  clear() { this.world.length = 0; this.screen.length = 0; this.shakes.length = 0; this.overlays.clear(); }

  update(dt) {
    const step = (p) => {
      p.life -= dt; if (p.life <= 0) return false;
      p.vy += (p.g || 0) * dt; p.vx *= (1 - (p.drag || 0) * dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot = (p.rot || 0) + (p.vrot || 0) * dt;
      return true;
    };
    this.world = this.world.filter(step);
    this.screen = this.screen.filter(step);
    const t = now();
    for (const [k, o] of this.overlays) if (o.until <= t) this.overlays.delete(k);
  }

  // ── rendering ──────────────────────────────────────────
  drawParticle(ctx, p, sx, sy) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = p.fade === false ? 1 : a;
    ctx.fillStyle = p.color;
    switch (p.kind) {
      case 'rect':
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.size / 2, -p.size2 / 2, p.size, p.size2);
        if (p.text) { ctx.fillStyle = p.textColor || '#fff'; ctx.font = `bold ${p.size2 * 0.8}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.text, 0, 0); }
        ctx.restore(); break;
      case 'ring':
        ctx.strokeStyle = p.color; ctx.lineWidth = p.lw || 4; ctx.beginPath();
        ctx.arc(sx, sy, p.size * (1 + (1 - a) * (p.grow || 2)), 0, Math.PI * 2); ctx.stroke(); break;
      case 'text':
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot || 0);
        ctx.font = `${p.bold ? 'bold ' : ''}${p.size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (p.stroke) { ctx.lineWidth = 6; ctx.strokeStyle = p.stroke; ctx.strokeText(p.text, 0, 0); }
        ctx.fillText(p.text, 0, 0); ctx.restore(); break;
      case 'line':
        ctx.strokeStyle = p.color; ctx.lineWidth = p.lw || 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + p.vx * 0.03, sy - p.vy * 0.03 * (p.screen ? -1 : 1)); ctx.stroke(); break;
      default:
        ctx.beginPath(); ctx.arc(sx, sy, p.size * (p.shrink ? a : 1), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  renderWorld(ctx, cam) {
    for (const p of this.world) { const [sx, sy] = cam.toScreen(p.x, p.y); if (sy < -100 || sy > H + 100) continue; this.drawParticle(ctx, p, sx, sy); }
  }

  renderScreen(ctx, state) {
    const t = now();
    for (const [name, o] of this.overlays) {
      const p = clamp((t - o.start) / (o.until - o.start), 0, 1);
      const fn = OVERLAYS[name]; if (fn) fn(ctx, p, o, t, state);
    }
    for (const p of this.screen) this.drawParticle(ctx, p, p.x, p.y);
  }

  // ── catalogue (names come straight from gifts.config.json "vfx") ──
  play(name, o = {}) {
    const fn = CATALOG[name] || CATALOG.splash_small;
    fn.call(this, o);
  }
}

const BLUES = ['#4fc3f7', '#81d4fa', '#e1f5fe', '#29b6f6', '#ffffff'];
const GOLDS = ['#ffd54f', '#ffca28', '#fff176', '#ffffff', '#ffb300'];

const CATALOG = {
  splash_small({ x, y }) {
    this.pw(22, () => ({ x: x + rand(-20, 20), y, vx: rand(-260, 260), vy: rand(200, 650), g: -1800, life: rand(0.4, 0.8), max: 0.8, size: rand(3, 8), color: pick(BLUES) }));
  },
  heal_sparkle({ x, y }) {
    this.pw(30, () => ({ x: x + rand(-40, 40), y: y + rand(0, 70), vx: rand(-40, 40), vy: rand(80, 260), life: rand(0.5, 1.1), max: 1.1, size: rand(3, 7), color: pick(['#3ddc84', '#b9f6ca', '#ffffff', '#ffd54f']), shrink: true }));
    this.pw(1, () => ({ x, y: y + 30, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 20, color: '#b9f6ca', kind: 'ring', lw: 5, grow: 3 }));
  },
  ice_overlay({ durationMs = 10000 }) {
    this.overlay('frost', Math.min(durationMs, 2500), { intensity: 0.6 });
    this.ps(40, () => ({ x: rand(0, W), y: rand(-200, H), vx: rand(-30, 30), vy: rand(60, 160), life: rand(1.5, 3), max: 3, size: rand(3, 7), color: '#e1f5fe' }));
  },
  camera_shake_medium({ x, y }) {
    this.addShake(16, 450);
    this.pw(1, () => ({ x, y: y + 35, vx: 0, vy: 0, life: 0.35, max: 0.35, size: 24, color: '#ffffff', kind: 'ring', lw: 6, grow: 3 }));
  },
  boxing_glove_hit({ x, y }) {
    this.addShake(24, 550);
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.pw(1, () => ({ x: x - dir * 300, y: y + 40, vx: dir * 1400, vy: 0, life: 0.5, max: 0.5, size: 90, color: '#fff', kind: 'text', text: '🥊', fade: false }));
    this.pw(10, () => ({ x, y: y + 40, vx: rand(-500, 500), vy: rand(-200, 600), g: -1500, life: rand(0.4, 0.7), max: 0.7, size: rand(24, 40), color: pick(GOLDS), kind: 'text', text: '✦' }));
    this.pw(1, () => ({ x, y: y + 40, vx: 0, vy: 0, life: 0.4, max: 0.4, size: 30, color: '#ffcc00', kind: 'ring', lw: 8, grow: 4 }));
  },
  frost_border({ durationMs = 8000 }) {
    this.overlay('frost', durationMs, { intensity: 1 });
    this.ps(60, () => ({ x: rand(0, W), y: rand(-300, H), vx: rand(-20, 20), vy: rand(40, 120), life: rand(2, 5), max: 5, size: rand(2, 6), color: '#ffffff' }));
  },
  warning_shadows() {
    this.overlay('danger_flash', 700, { color: '255,200,0' });
  },
  red_alert_pulse({ durationMs = 3000 }) {
    this.overlay('red_alert', durationMs);
    this.addShake(6, durationMs);
  },
  jetpack_fire({ x, y }) {
    this.pw(40, () => ({ x: x + rand(-20, 20), y, vx: rand(-120, 120), vy: rand(-500, -100), g: 200, life: rand(0.3, 0.7), max: 0.7, size: rand(6, 14), color: pick(['#ff9800', '#ff5722', '#ffeb3b', '#ffffff']), shrink: true }));
    this.pw(1, () => ({ x, y: y + 35, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 40, color: '#4fc3f7', kind: 'ring', lw: 6, grow: 3 }));
  },
  earthquake_rumble({ durationMs = 15000 }) {
    this.addShake(10, Math.min(durationMs, 1500));
    this.overlay('rumble', durationMs, {});
  },
  money_rain() {
    this.ps(70, () => ({ x: rand(0, W), y: rand(-600, -20), vx: rand(-40, 40), vy: rand(250, 500), rot: rand(0, 6), vrot: rand(-3, 3), life: rand(3, 4.5), max: 4.5, size: 70, size2: 34, color: '#2e7d32', kind: 'rect', text: '$', textColor: '#c8e6c9' }));
  },
  golden_rays({ x, y }) {
    this.overlay('rays', 2600);
    this.pw(50, () => ({ x: x + rand(-60, 60), y: y + rand(0, 80), vx: rand(-80, 80), vy: rand(100, 400), life: rand(0.8, 1.6), max: 1.6, size: rand(3, 8), color: pick(GOLDS), shrink: true }));
  },
  tsunami_wave_fullscreen() {
    this.overlay('tsunami', 1700);
    this.addShake(20, 1700);
    this.ps(80, () => ({ x: rand(0, W), y: rand(H * 0.2, H), vx: rand(-200, 200), vy: rand(-900, -200), g: 1500, life: rand(1, 1.8), max: 1.8, size: rand(4, 12), color: pick(BLUES) }));
  },
  whale_splash_storm({ waterY = 0 }) {
    this.overlay('storm', 4000);
    this.overlay('whale', 2600);
    this.addShake(18, 1200);
    for (let c = 0; c < 6; c++) {
      const cx = 90 + c * 180;
      this.pw(25, () => ({ x: cx + rand(-30, 30), y: waterY, vx: rand(-120, 120), vy: rand(600, 1400), g: -1800, life: rand(0.9, 1.6), max: 1.6, size: rand(4, 12), color: pick(BLUES) }));
    }
  },
  fullscreen_flash_hall_of_fame({ user }) {
    this.overlay('flash', 700);
    this.overlay('legend', 3800, { name: user?.nickname || user?.uniqueId || '???' });
    this.addShake(26, 700);
    this.ps(140, () => ({ x: W / 2 + rand(-80, 80), y: H * 0.45, vx: rand(-900, 900), vy: rand(-1200, -200), g: 1400, rot: rand(0, 6), vrot: rand(-8, 8), life: rand(2, 3.5), max: 3.5, size: rand(10, 20), size2: rand(6, 12), color: pick([...GOLDS, '#ff4081', '#7c4dff', '#18ffff']), kind: 'rect' }));
  },
};

function vignette(ctx, rgb, alpha, inner = 0.45) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * inner, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${alpha})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

const OVERLAYS = {
  frost(ctx, p, o) {
    const edge = p < 0.1 ? p / 0.1 : p > 0.85 ? (1 - p) / 0.15 : 1;
    const k = edge * (o.data.intensity ?? 1);
    vignette(ctx, '200,240,255', 0.85 * k, 0.3);
    ctx.strokeStyle = `rgba(230,250,255,${0.9 * k})`; ctx.lineWidth = 14; ctx.strokeRect(7, 7, W - 14, H - 14);
  },
  red_alert(ctx, p, o, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t / 90);
    vignette(ctx, '255,30,60', 0.35 + 0.35 * pulse, 0.35);
  },
  danger_flash(ctx, p, o) {
    ctx.fillStyle = `rgba(${o.data.color || '255,200,0'},${0.35 * (1 - p)})`; ctx.fillRect(0, 0, W, H);
  },
  rumble(ctx, p, o, t) {
    vignette(ctx, '120,70,20', 0.25 + 0.1 * Math.sin(t / 60), 0.5);
  },
  flash(ctx, p) { ctx.fillStyle = `rgba(255,255,255,${1 - p})`; ctx.fillRect(0, 0, W, H); },
  rays(ctx, p, o, t) {
    const a = p < 0.2 ? p / 0.2 : p > 0.7 ? (1 - p) / 0.3 : 1;
    ctx.save(); ctx.translate(W / 2, -200); ctx.rotate(t / 4000); ctx.globalAlpha = 0.35 * a;
    for (let i = 0; i < 14; i++) {
      ctx.rotate(Math.PI * 2 / 14); ctx.fillStyle = i % 2 ? '#ffe082' : '#fff8e1';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-90, 2600); ctx.lineTo(90, 2600); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },
  tsunami(ctx, p, o, t) {
    const yTop = lerp(H + 200, -500, easeOutCubic(p));
    const alpha = p > 0.75 ? (1 - p) / 0.25 : 1;
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(0, H + 50);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, yTop + Math.sin(x / 90 + t / 120) * 50 + Math.sin(x / 37 - t / 200) * 20);
    ctx.lineTo(W, H + 50); ctx.closePath();
    const g = ctx.createLinearGradient(0, yTop, 0, yTop + 900); g.addColorStop(0, 'rgba(230,250,255,0.95)'); g.addColorStop(0.08, 'rgba(41,182,246,0.9)'); g.addColorStop(1, 'rgba(10,42,122,0.75)');
    ctx.fillStyle = g; ctx.fill();
    ctx.font = 'bold 150px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('🌊', W / 2, yTop + 420);
    ctx.globalAlpha = 1;
  },
  storm(ctx, p, o, t) {
    const a = p < 0.15 ? p / 0.15 : p > 0.75 ? (1 - p) / 0.25 : 1;
    ctx.fillStyle = `rgba(5,10,40,${0.45 * a})`; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(200,230,255,${0.5 * a})`; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 90; i++) { const x = ((i * 137 + t * 0.9) % (W + 200)) - 100; const y = ((i * 251 + t * 2.2) % (H + 200)) - 100; ctx.moveTo(x, y); ctx.lineTo(x - 18, y + 60); }
    ctx.stroke();
    if (Math.floor(t / 80) % 23 === 0) { ctx.fillStyle = `rgba(255,255,255,${0.5 * a})`; ctx.fillRect(0, 0, W, H); }
  },
  whale(ctx, p) {
    const x = lerp(-300, W + 300, p); const y = H * 0.35 + Math.sin(p * Math.PI * 2) * 80;
    ctx.font = '260px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🐋', x, y);
  },
  legend(ctx, p, o) {
    const s = p < 0.25 ? easeOutBack(p / 0.25) : 1;
    const a = p > 0.8 ? (1 - p) / 0.2 : 1;
    ctx.save(); ctx.translate(W / 2, H * 0.42); ctx.scale(s, s); ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 120px sans-serif'; ctx.lineWidth = 14; ctx.strokeStyle = '#4a2a00'; ctx.fillStyle = '#ffd54f';
    ctx.strokeText('ЛЕГЕНДА', 0, -70); ctx.fillText('ЛЕГЕНДА', 0, -70);
    ctx.font = 'bold 80px sans-serif'; ctx.strokeStyle = '#001'; ctx.fillStyle = '#fff';
    const name = o.data.name.length > 16 ? o.data.name.slice(0, 15) + '…' : o.data.name;
    ctx.strokeText(name, 0, 50); ctx.fillText(name, 0, 50);
    ctx.font = '60px sans-serif'; ctx.fillText('👑 В ЗАЛ СЛАВЫ 👑', 0, 150);
    ctx.restore();
  },
};
