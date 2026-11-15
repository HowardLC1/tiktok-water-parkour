/** On-screen stream HUD: counters, effect timers, event banners, hall of fame, death overlay. */
import { W, H, COLORS } from './const.js';
import { clamp, now, roundRect, fmtSeconds, getImage, easeOutBack } from './util.js';

const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function panel(ctx, x, y, w, h, alpha = 0.55) {
  ctx.fillStyle = `rgba(8,12,32,${alpha})`; roundRect(ctx, x, y, w, h, 22); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke();
}
function text(ctx, s, x, y, { size = 36, color = '#fff', bold = true, align = 'left', stroke = true } = {}) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size / 8); ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function avatar(ctx, user, x, y, r) {
  const img = getImage(user?.avatar);
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  else {
    const name = user?.nickname || user?.uniqueId || '?';
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    ctx.fillStyle = `hsl(${h % 360},70%,45%)`; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    text(ctx, name.slice(0, 1).toUpperCase(), x, y + 2, { size: r * 1.2, stroke: false, align: 'center' });
  }
  ctx.restore();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}
function fit(ctx, s, maxW, size) {
  ctx.font = `bold ${size}px ${FONT}`;
  while (ctx.measureText(s).width > maxW && s.length > 4) s = s.slice(0, -2) + '…';
  return s;
}

export class HUD {
  constructor() { this.banners = []; this.queue = []; this.combo = null; this.hearts = []; }

  banner(msg, user, color, opts = {}) {
    const b = { msg, user, color, start: 0, dur: opts.dur || 3600, gift: opts.gift, count: opts.count || 1 };
    if (this.banners.length < 3) { b.start = now(); this.banners.push(b); } else this.queue.push(b);
  }
  showCombo(txt, user) { this.combo = { txt, user, until: now() + 1600 }; }

  update() {
    const t = now();
    this.banners = this.banners.filter((b) => t - b.start < b.dur);
    while (this.banners.length < 3 && this.queue.length) { const b = this.queue.shift(); b.start = t; this.banners.push(b); }
  }

  render(ctx, g) {
    const t = now();
    const p = g.player;
    const floor = Math.max(0, p.level);
    const waterDist = p.y / 100 - g.water.level;

    // ── top-left: floor & records ──
    panel(ctx, 24, 24, 420, 150);
    text(ctx, `ЭТАЖ ${floor}`, 48, 74, { size: 56, color: COLORS.accent });
    text(ctx, `Рекорд сессии: ${g.sessionBest}   Лучший: ${g.allTimeBest}`, 48, 136, { size: 24, bold: false, color: '#dfe6ff' });

    // ── top-right: water distance, mode, connection ──
    panel(ctx, W - 444, 24, 420, 150);
    const dColor = waterDist > 5 ? COLORS.ok : waterDist > 2 ? COLORS.accent : COLORS.danger;
    const frozen = g.water.frozen;
    text(ctx, frozen ? '❄️ ВОДА ЗАМОРОЖЕНА' : `🌊 Вода: ${Math.max(0, waterDist).toFixed(1)} ур.`, W - 420, 74, { size: frozen ? 34 : 40, color: frozen ? COLORS.info : dColor });
    const st = g.conn?.state || 'offline';
    const dot = st === 'connected' ? COLORS.ok : st === 'connecting' ? COLORS.accent : COLORS.danger;
    ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(W - 404, 136, 11, 0, Math.PI * 2); ctx.fill();
    const connLabel = st === 'connected' ? `@${g.conn.username}` : st === 'connecting' ? 'подключение…' : g.netOk ? 'не в эфире' : 'нет сервера';
    text(ctx, connLabel, W - 384, 136, { size: 24, bold: false, color: '#dfe6ff' });
    const modeTxt = g.mode === 'ai' ? '🤖 АВТО' : '🎮 РУЧНОЙ';
    text(ctx, modeTxt, W - 44, 136, { size: 26, color: g.mode === 'ai' ? COLORS.info : COLORS.accent, align: 'right' });

    // ── active effects ──
    const effects = g.effects.list();
    let ey = 200;
    for (const e of effects) {
      const rem = e.until - t; const prog = 1 - clamp((t - e.start) / (e.until - e.start), 0, 1);
      panel(ctx, 24, ey, 420, 62, 0.5);
      ctx.fillStyle = e.color; ctx.globalAlpha = 0.35; roundRect(ctx, 28, ey + 4, 412 * prog, 54, 18); ctx.fill(); ctx.globalAlpha = 1;
      text(ctx, `${e.icon} ${e.label}`, 44, ey + 31, { size: 26 });
      text(ctx, fmtSeconds(rem), 428, ey + 31, { size: 28, color: e.color, align: 'right' });
      ey += 70;
    }

    // ── hall of fame ──
    this.renderHallOfFame(ctx, g, W - 444, 200);

    // ── banners ──
    let by = Math.max(400, 200 + effects.length * 70 + 24);
    for (const b of this.banners) {
      const age = t - b.start; const life = age / b.dur;
      const sIn = age < 350 ? easeOutBack(age / 350) : 1;
      const alpha = life > 0.85 ? (1 - life) / 0.15 : 1;
      const bw = 900, bh = 132, bx = (W - bw) / 2;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(W / 2, by + bh / 2); ctx.scale(sIn, sIn); ctx.translate(-W / 2, -(by + bh / 2));
      panel(ctx, bx, by, bw, bh, 0.72);
      ctx.fillStyle = b.color; roundRect(ctx, bx, by, 18, bh, 9); ctx.fill();
      avatar(ctx, b.user, bx + 82, by + bh / 2, 46);
      const maxW = bw - 180;
      ctx.font = `bold 36px ${FONT}`;
      const words = b.msg.split(' '); const lines = []; let cur = '';
      for (const w of words) { const tryS = cur ? cur + ' ' + w : w; if (ctx.measureText(tryS).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryS; }
      if (cur) lines.push(cur);
      const shown = lines.slice(0, 2); if (lines.length > 2) shown[1] = fit(ctx, shown[1] + '…', maxW, 36);
      shown.forEach((ln, i) => text(ctx, ln, bx + 150, by + bh / 2 + (shown.length === 1 ? 0 : i * 40 - 20), { size: 36, color: i === 0 ? '#fff' : '#e6e9ff' }));
      if (b.count > 1) text(ctx, `×${b.count}`, bx + bw - 24, by + 34, { size: 40, color: b.color, align: 'right' });
      ctx.restore();
      by += bh + 16;
    }

    // ── combo ticker ──
    if (this.combo && this.combo.until > t) {
      const pulse = 1 + 0.08 * Math.sin(t / 60);
      ctx.save(); ctx.translate(W / 2, H - 300); ctx.scale(pulse, pulse);
      text(ctx, this.combo.txt, 0, 0, { size: 64, color: COLORS.accent, align: 'center' });
      ctx.restore();
    }

    // ── engagement ──
    panel(ctx, 24, H - 120, 520, 72, 0.45);
    const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    text(ctx, `❤ ${fmt(g.stats.likes)}   💬 ${fmt(g.stats.chats)}   🎁 ${fmt(g.stats.gifts)}   👁 ${fmt(g.stats.viewers)}`, 48, H - 84, { size: 28, bold: false });

    // ── death overlay ──
    if (p.dead) {
      const age = t - g.deadAt; const a = clamp(age / 300, 0, 1);
      ctx.fillStyle = `rgba(5,10,40,${0.55 * a})`; ctx.fillRect(0, 0, W, H);
      const s = age < 400 ? easeOutBack(age / 400) : 1;
      ctx.save(); ctx.translate(W / 2, H * 0.45); ctx.scale(s, s);
      text(ctx, '💀 УТОНУЛ!', 0, -60, { size: 110, color: COLORS.danger, align: 'center' });
      text(ctx, `Этаж ${g.deathLevel}   ·   Раунд ${g.round}`, 0, 40, { size: 44, align: 'center' });
      const left = Math.max(0, Math.ceil((g.restartDelay - age) / 1000));
      text(ctx, `Новый раунд через ${left}…`, 0, 120, { size: 36, bold: false, color: '#dfe6ff', align: 'center' });
      ctx.restore();
    }

    // ── audio hint ──
    if (!g.audio.ready && g.audio.enabled) text(ctx, '🔇 нажми любую клавишу или кликни — включить звук', W / 2, H - 40, { size: 24, bold: false, color: '#dfe6ff', align: 'center' });
  }

  renderHallOfFame(ctx, g, x, y) {
    const list = (g.hof || []).slice(0, 5);
    const h = 70 + Math.max(1, list.length) * 56;
    panel(ctx, x, y, 420, h, 0.5);
    text(ctx, '🏆 ЗАЛ СЛАВЫ', x + 210, y + 36, { size: 30, color: COLORS.accent, align: 'center' });
    if (!list.length) { text(ctx, 'пока пусто…', x + 210, y + 92, { size: 24, bold: false, color: '#b0b8d8', align: 'center' }); return; }
    list.forEach((e, i) => {
      const ly = y + 70 + i * 56 + 24;
      avatar(ctx, e, x + 40, ly, 20);
      const name = fit(ctx, `${i + 1}. ${e.nickname || e.uniqueId}`, 250, 26);
      text(ctx, name, x + 72, ly, { size: 26 });
      text(ctx, `×${e.count}`, x + 400, ly, { size: 24, color: '#ffe082', align: 'right' });
    });
  }
}
