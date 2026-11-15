/** World rendering: sky, walls, platforms, water, player. */
import { W, H, LEVEL_H, PLAT_H, COLORS } from './const.js';
import { clamp, lerp, now, roundRect, mulberry32 } from './util.js';

const rng = mulberry32(1337);
const CLOUDS = Array.from({ length: 14 }, (_, i) => ({ x: rng() * W, y: i * 700 + rng() * 400, w: 180 + rng() * 220, s: 0.25 + rng() * 0.3 }));
const STARS = Array.from({ length: 90 }, () => ({ x: rng() * W, y: rng() * H, r: 1 + rng() * 2.5, tw: rng() * 6 }));

function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; }

export function renderBackground(ctx, g) {
  const alt = clamp(g.player.y / LEVEL_H / 120, 0, 1);  // 0 = bottom, 1 = very high
  const top = alt < 0.5 ? mix(COLORS.sky1, COLORS.sky0, alt * 2) : COLORS.sky0;
  const bottom = alt < 0.5 ? mix(COLORS.sky2, COLORS.sky1, alt * 2) : mix(COLORS.sky1, COLORS.sky0, (alt - 0.5) * 2);
  const grad = ctx.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, top); grad.addColorStop(1, bottom);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

  const t = now() / 1000;
  if (alt > 0.15) {
    ctx.fillStyle = '#fff';
    for (const s of STARS) { ctx.globalAlpha = (alt - 0.15) * (0.5 + 0.5 * Math.sin(t * 2 + s.tw)); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  const camY = g.cam.y;
  for (const c of CLOUDS) {
    const sy = ((c.y - camY * c.s) % (H + 400) + H + 400) % (H + 400) - 200;
    ctx.fillStyle = `rgba(255,255,255,${0.12 + c.s * 0.25})`;
    roundRect(ctx, c.x - c.w / 2, sy, c.w, 60, 30); ctx.fill();
    roundRect(ctx, c.x - c.w / 4, sy - 30, c.w / 2, 60, 30); ctx.fill();
  }

  // side walls with level ticks
  const wallW = 10;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, wallW, H); ctx.fillRect(W - wallW, 0, wallW, H);
  const lo = Math.floor(g.cam.bottom / LEVEL_H), hi = Math.ceil(g.cam.top / LEVEL_H);
  for (let l = Math.max(0, lo); l <= hi; l++) {
    const [, sy] = g.cam.toScreen(0, l * LEVEL_H);
    ctx.fillStyle = l % 10 === 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, sy - 1, l % 10 === 0 ? 40 : 18, 2); ctx.fillRect(W - (l % 10 === 0 ? 40 : 18), sy - 1, 40, 2);
    if (l % 10 === 0 && l > 0) { ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(String(l), 48, sy - 4); }
  }
}

export function renderPlatforms(ctx, g) {
  const lo = Math.floor(g.cam.bottom / LEVEL_H) - 1, hi = Math.ceil(g.cam.top / LEVEL_H) + 1;
  const slippery = g.effects.has('slippery');
  const t = now();
  const phased = g.world.phased; const phaseLeft = g.world.hiddenAltUntil - t;
  for (let l = Math.max(0, lo); l <= hi; l++) {
    const hidden = g.world.isHidden(l);
    const off = g.world.offsetX(l);
    for (const base of g.world.platformsAt(l)) {
      const p = { ...base, x: base.x + off };
      const [sx, sy] = g.cam.toScreen(p.x, p.y);
      if (hidden) {
        const blink = phaseLeft < 1500 ? (Math.floor(t / 120) % 2 ? 0.5 : 0.12) : 0.12;
        ctx.globalAlpha = blink; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
        roundRect(ctx, sx, sy, p.w, p.h, 10); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        continue;
      }
      if (p.kind === 'ground') {
        ctx.fillStyle = '#5d4037'; ctx.fillRect(0, sy, W, H - sy + 10);
        ctx.fillStyle = slippery ? COLORS.ice : COLORS.platform; ctx.fillRect(0, sy, W, 18);
        continue;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(ctx, sx + 6, sy + 8, p.w, p.h, 10); ctx.fill();
      ctx.fillStyle = COLORS.platformSide; roundRect(ctx, sx, sy, p.w, p.h, 10); ctx.fill();
      ctx.fillStyle = slippery ? COLORS.ice : (p.kind === 'extra' ? '#8bc34a' : COLORS.platform);
      roundRect(ctx, sx, sy, p.w, 10, 6); ctx.fill();
      if (slippery) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < p.w; i += 34) ctx.fillRect(sx + i + 6 + Math.sin(t / 300 + i) * 3, sy + 2, 12, 3); }
      if (phased && l % 2 === 0) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; roundRect(ctx, sx, sy, p.w, p.h, 10); ctx.stroke(); }
    }
  }
}

export function renderWater(ctx, g) {
  const w = g.water;
  const [, surfaceSy] = g.cam.toScreen(0, w.y);
  if (surfaceSy > H + 40) return;
  const frozen = w.frozen;
  const grad = ctx.createLinearGradient(0, surfaceSy, 0, Math.min(H, surfaceSy + 1200));
  if (frozen) { grad.addColorStop(0, 'rgba(200,240,255,0.95)'); grad.addColorStop(0.1, 'rgba(120,200,240,0.85)'); grad.addColorStop(1, 'rgba(20,60,140,0.95)'); }
  else { grad.addColorStop(0, 'rgba(79,195,247,0.9)'); grad.addColorStop(0.15, 'rgba(30,144,255,0.85)'); grad.addColorStop(1, 'rgba(10,42,122,0.97)'); }
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.moveTo(0, H + 50);
  for (let x = 0; x <= W; x += 12) { const [, sy] = g.cam.toScreen(x, w.surfaceY(x)); ctx.lineTo(x, sy); }
  ctx.lineTo(W, H + 50); ctx.closePath(); ctx.fill();
  // foam / ice line
  ctx.strokeStyle = frozen ? '#ffffff' : COLORS.foam; ctx.lineWidth = frozen ? 10 : 6; ctx.beginPath();
  for (let x = 0; x <= W; x += 12) { const [, sy] = g.cam.toScreen(x, w.surfaceY(x)); x === 0 ? ctx.moveTo(x, sy) : ctx.lineTo(x, sy); }
  ctx.stroke();
  if (frozen) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const x = 60 + i * 120; ctx.beginPath(); ctx.moveTo(x, surfaceSy + 8); ctx.lineTo(x + 30, surfaceSy + 60); ctx.lineTo(x + 10, surfaceSy + 110); ctx.stroke(); }
    const txt = `❄ ${Math.ceil(w.frozenRemaining / 1000)}с`;
    ctx.font = 'bold 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,30,80,0.8)'; ctx.strokeText(txt, W / 2, surfaceSy + 70); ctx.fillStyle = '#fff'; ctx.fillText(txt, W / 2, surfaceSy + 70);
  } else {
    const t = now() / 1000;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 24; i++) { const x = (i * 97 + t * 25) % W; const y = surfaceSy + 60 + ((i * 173 + t * 60 * (1 + i % 3)) % 900); if (y < H) { ctx.beginPath(); ctx.arc(x, y, 3 + (i % 4), 0, Math.PI * 2); ctx.fill(); } }
  }
}

export function renderPlayer(ctx, g) {
  const p = g.player;
  const [sx, syFeet] = g.cam.toScreen(p.x, p.y);
  const t = now();
  const shield = g.effects.has('shield');
  const reverse = g.effects.has('reverse');
  const moving = Math.abs(p.vx) > 40 && p.onGround;
  const flash = p.stunned || (p.invulnUntil > t && Math.floor(t / 70) % 2 === 0);
  const sqX = 1 + p.squash * 0.6, sqY = 1 - p.squash * 0.6;
  ctx.save();
  ctx.translate(sx + p.w / 2, syFeet);
  if (p.dead) { const age = (t - g.deadAt) / 1000; ctx.translate(0, age * 120); ctx.globalAlpha = clamp(1 - age / 2, 0, 1); ctx.rotate(Math.sin(age * 3) * 0.3); }
  ctx.scale(sqX, sqY);
  if (shield) {
    ctx.fillStyle = `rgba(255,213,79,${0.25 + 0.15 * Math.sin(t / 120)})`; ctx.beginPath(); ctx.arc(0, -p.h / 2, p.h * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -p.h / 2, p.h * 0.85, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#607d8b'; roundRect(ctx, -p.facing * 10 - 34, -p.h + 18, 24, 40, 6); ctx.fill();
  }
  // legs
  const step = moving ? Math.sin(t / 60) * 8 : 0;
  ctx.fillStyle = '#263238';
  ctx.fillRect(-16, -14 + step, 12, 14); ctx.fillRect(4, -14 - step, 12, 14);
  // body
  ctx.fillStyle = flash ? '#ffffff' : (p.dead ? '#90a4ae' : '#ff7043');
  roundRect(ctx, -p.w / 2, -p.h, p.w, p.h - 10, 16); ctx.fill();
  ctx.fillStyle = flash ? '#fff' : '#ffab91'; roundRect(ctx, -p.w / 2 + 8, -p.h + 10, p.w - 16, 26, 10); ctx.fill();
  // eyes
  const ex = p.facing * 9;
  if (p.dead) { ctx.strokeStyle = '#263238'; ctx.lineWidth = 3; for (const dx of [-11, 11]) { ctx.beginPath(); ctx.moveTo(dx - 5 + ex, -p.h + 18); ctx.lineTo(dx + 5 + ex, -p.h + 28); ctx.moveTo(dx + 5 + ex, -p.h + 18); ctx.lineTo(dx - 5 + ex, -p.h + 28); ctx.stroke(); } }
  else {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-10 + ex, -p.h + 23, 8, 0, Math.PI * 2); ctx.arc(10 + ex, -p.h + 23, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#263238'; ctx.beginPath(); ctx.arc(-10 + ex + p.facing * 3, -p.h + 24, 4, 0, Math.PI * 2); ctx.arc(10 + ex + p.facing * 3, -p.h + 24, 4, 0, Math.PI * 2); ctx.fill();
  }
  // hat
  ctx.fillStyle = '#ffd54f'; roundRect(ctx, -p.w / 2 + 4, -p.h - 10, p.w - 8, 16, 6); ctx.fill();
  ctx.restore();
  if (reverse && !p.dead) { ctx.font = '40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🔀', sx + p.w / 2, syFeet - p.h - 40 + Math.sin(t / 150) * 5); }
  if (g.mode === 'ai' && !p.dead) { ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.8; ctx.fillText('🤖', sx + p.w / 2, syFeet - p.h - (reverse ? 85 : 36)); ctx.globalAlpha = 1; }
}
