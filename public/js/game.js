/** Game orchestrator: state, loop, camera, forced level moves, death/restart, gift application. */
import { W, H, LEVEL_H } from './const.js';
import { clamp, now, rand } from './util.js';
import { World } from './world.js';
import { Water } from './water.js';
import { Player } from './player.js';
import { ParkourAI } from './ai.js';
import { Hazards } from './hazards.js';
import { Effects } from './effects.js';
import { VFX } from './vfx.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { applyGift } from './actions.js';
import { renderBackground, renderPlatforms, renderWater, renderPlayer } from './render.js';

const FIXED_DT = 1 / 120;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    canvas.width = W; canvas.height = H;

    this.world = new World();
    this.water = new Water();
    this.player = new Player();
    this.ai = new ParkourAI();
    this.hazards = new Hazards();
    this.effects = new Effects();
    this.vfx = new VFX();
    this.hud = new HUD();
    this.input = new Input();
    this.audio = audio;

    this.config = null; this.settings = { comboMergeWindowMs: 1500, gracePeriodThresholdLevels: 1, minCoinsForLethalHit: 10 };
    this.gifts = {};
    this.mode = 'ai'; this.autoReturnMs = 8000; this.autoReturn = true;
    this.round = 0; this.sessionBest = 0; this.deathLevel = 0; this.deadAt = 0; this.restartDelay = 3200;
    this.allTimeBest = Number(localStorage.getItem('wp_best') || 0);
    this.stats = { likes: 0, chats: 0, gifts: 0, viewers: 0 };
    this.hof = JSON.parse(localStorage.getItem('wp_hof') || '[]');
    this.conn = null; this.netOk = false; this.net = null;
    this.reverseStart = 0;
    this.logs = []; this.onLog = null;
    this.cam = { y: 0, top: 0, bottom: 0, toScreen: (x, y) => [x + this._shake.x, H * 0.62 - (y - this.cam.y) + this._shake.y] };
    this._shake = { x: 0, y: 0 };
    this.acc = 0; this.last = now(); this.paused = false;

    this.input.on('manual', () => this.setMode('manual'));
    this.input.on('key', (code) => {
      if (code === 'KeyP') this.setMode(this.mode === 'ai' ? 'manual' : 'ai');
      if (code === 'KeyR') this.restart();
      if (code === 'KeyM') { this.audio.enabled = !this.audio.enabled; }
    });
    const unlock = () => this.audio.init();
    window.addEventListener('keydown', unlock); window.addEventListener('pointerdown', unlock);

    this.restart(true);
    requestAnimationFrame(() => this.frame());
  }

  // ── config ──────────────────────────────────────────────
  setConfig(cfg) {
    this.config = cfg; this.settings = { ...this.settings, ...(cfg.settings || {}) }; this.gifts = cfg.gifts || {};
    this.log(`config: ${Object.keys(this.gifts).length} подарков загружено`);
  }
  log(msg) { this.logs.push(`${new Date().toLocaleTimeString()} ${msg}`); if (this.logs.length > 40) this.logs.shift(); this.onLog?.(msg); }

  // ── modes ───────────────────────────────────────────────
  setMode(mode) { if (this.mode === mode) return; this.mode = mode; this.ai.reset(); this.onModeChange?.(mode); }

  // ── gifts ───────────────────────────────────────────────
  applyGiftEvent(ev) { if (this.player.dead) { this.hud.banner(ev.message, ev.user, '#90a4ae', { count: ev.count }); return; } applyGift(this, ev); }

  /** Offline test: build an event from gifts.config.json the same way the backend does. */
  simulateGift(name, { user = 'Тестер', count = 1 } = {}) {
    const g = this.gifts[name];
    const effect = g || { ...(this.settings.defaultGiftEffect || {}), action: this.settings.defaultGiftEffect?.action || 'move_levels', levelsDelta: this.settings.defaultGiftEffect?.levelsDelta ?? -1 };
    const u = { userId: `local:${user}`, uniqueId: user, nickname: user, avatar: null };
    let message = String(effect.messageTemplate || '{user} отправил подарок').replaceAll('{user}', u.nickname);
    if (count > 1) message += ` ×${count}`;
    const ev = { type: 'gift', source: 'local', user: u, gift: { id: effect.giftId ?? null, name, coins: effect.coins ?? 0 }, count, mapped: !!g, effect, message };
    this.applyGiftEvent(ev);
    return ev;
  }

  banner(msg, user, color, opts) { this.hud.banner(msg, user, color, opts); }

  addToHallOfFame(user, gift, count) {
    let e = this.hof.find((x) => x.uniqueId === user.uniqueId);
    if (!e) { e = { uniqueId: user.uniqueId, nickname: user.nickname, avatar: user.avatar, count: 0, coins: 0 }; this.hof.push(e); }
    e.count += 1; e.coins += (gift?.coins || 0) * count; e.nickname = user.nickname || e.nickname; if (user.avatar) e.avatar = user.avatar;
    this.hof.sort((a, b) => b.coins - a.coins || b.count - a.count);
    localStorage.setItem('wp_hof', JSON.stringify(this.hof.slice(0, 50)));
    this.net?.send({ type: 'hof_add', user: { uniqueId: user.uniqueId, nickname: user.nickname, avatar: user.avatar, giftName: gift?.name, coins: (gift?.coins || 0) * count } });
  }
  setHallOfFame(entries) { if (Array.isArray(entries)) { this.hof = entries; localStorage.setItem('wp_hof', JSON.stringify(entries.slice(0, 50))); } }

  // ── forced level moves ──────────────────────────────────
  currentLevel() { const p = this.player; return p.tween ? Math.round(p.tween.toY / LEVEL_H) : p.level; }

  forcedMove(delta, opts = {}) {
    if (this.player.dead) return;
    this.forcedMoveTo(this.currentLevel() + Math.round(delta), opts);
  }

  forcedMoveTo(target, opts = {}) {
    const p = this.player; if (p.dead) return;
    const cur = this.currentLevel();
    const down = target < cur;
    if (down && !opts.lethal) {
      const minSafe = Math.ceil(this.water.level + (this.settings.gracePeriodThresholdLevels ?? 1));
      target = Math.max(target, Math.min(cur, minSafe));
    }
    target = Math.max(0, target);
    if (target === cur && opts.mode !== 'teleport') { p.squash = down ? 0.3 : -0.3; return; }
    const plat = this.world.landingAt(target, p.cx, true);
    const toX = clamp(p.cx + (down ? rand(-25, 25) : 0), plat.x + 22, plat.x + plat.w - 22) - p.w / 2;
    const levels = Math.abs(plat.level - cur);
    const mode = opts.mode || (down ? 'fall' : 'rise');
    const duration = mode === 'teleport' ? 140 : clamp(180 + levels * 32, 220, 900);
    if (mode === 'teleport') this.vfx.play('splash_small', { x: p.cx, y: p.y });
    p.startTween({
      toX, toY: plat.y, duration, mode, platform: plat.base || plat,
      onDone: () => {
        const live = this.world.visible(plat.level, plat.level).find((q) => q.id === plat.id);
        if (live) p.x = clamp(p.x, live.x + 6, live.x + live.w - p.w - 6);
        p.platform = live || null; if (!live) p.onGround = false;
        this.vfx.addShake(mode === 'fall' ? 8 : 3, 200); this.audio.sfx('land');
        this.vfx.pw(14, () => ({ x: p.cx + rand(-30, 30), y: p.y, vx: rand(-250, 250), vy: rand(50, 300), g: -1500, life: 0.5, max: 0.5, size: rand(3, 7), color: '#d7ccc8' }));
        opts.onLand?.(plat.level);
      },
    });
  }

  // ── death / restart ─────────────────────────────────────
  die() {
    const p = this.player; if (p.dead) return;
    p.dead = true; p.tween = null; this.deadAt = now(); this.deathLevel = Math.max(0, p.level);
    this.audio.sfx('splash'); this.audio.sfx('death');
    this.vfx.play('splash_small', { x: p.cx, y: this.water.y });
    this.vfx.pw(40, () => ({ x: p.cx + rand(-40, 40), y: this.water.y, vx: rand(-400, 400), vy: rand(300, 1100), g: -1800, life: rand(0.6, 1.2), max: 1.2, size: rand(4, 12), color: '#81d4fa' }));
    this.vfx.addShake(14, 400);
    this.hazards.clear();
    this.sessionBest = Math.max(this.sessionBest, p.bestLevel);
    if (p.bestLevel > this.allTimeBest) { this.allTimeBest = p.bestLevel; localStorage.setItem('wp_best', String(this.allTimeBest)); }
    this.log(`утонул на этаже ${this.deathLevel}`);
    setTimeout(() => { if (this.player.dead) this.restart(); }, this.restartDelay);
  }

  restart(first = false) {
    this.world.reset((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    this.water.reset();
    this.player.reset(W / 2 - this.player.w / 2, 0);
    this.effects.clear(); this.hazards.clear(); this.vfx.clear(); this.ai.reset();
    this.hud.banners.length = 0; this.hud.queue.length = 0;
    this.round += 1; this.cam.y = 0; this.reverseStart = 0;
    if (!first) { this.hud.banner(`🏁 Раунд ${this.round} — поехали!`, { nickname: 'GO' }, '#4fc3f7', { dur: 2500 }); this.audio.sfx('coin_up'); }
  }

  // ── loop ────────────────────────────────────────────────
  frame() {
    const t = now(); let dt = (t - this.last) / 1000; this.last = t;
    dt = Math.min(dt, 0.05);
    this.acc += dt;
    while (this.acc >= FIXED_DT) { this.step(FIXED_DT); this.acc -= FIXED_DT; }
    this.updateVisual(dt);
    this.render();
    requestAnimationFrame(() => this.frame());
  }

  step(dt) {
    const p = this.player;
    this.effects.update();
    if (this.mode === 'manual' && this.autoReturn && now() - this.input.lastInputAt > this.autoReturnMs) this.setMode('ai');

    const lo = Math.floor(this.cam.bottom / LEVEL_H) - 2, hi = Math.ceil(this.cam.top / LEVEL_H) + 2;
    this.world.update(dt, lo, hi);
    this.water.update(dt, p.bestLevel, p.level);

    const reverse = this.effects.has('reverse');
    let input;
    if (this.mode === 'ai') input = this.ai.decide({ player: p, world: this.world, water: this.water, hazards: this.hazards, reverseElapsed: reverse ? now() - this.reverseStart : null });
    else input = this.input.state;
    if (reverse) input = { left: input.right, right: input.left, jump: input.jump };
    if (p.dead) input = { left: false, right: false, jump: false };

    if (!p.dead) p.update(dt, input, this.world, { slippery: this.effects.has('slippery') }, {
      jump: () => this.audio.sfx('jump'),
      land: () => { this.audio.sfx('land'); this.vfx.pw(5, () => ({ x: p.cx + rand(-20, 20), y: p.y, vx: rand(-120, 120), vy: rand(30, 120), g: -800, life: 0.3, max: 0.3, size: 4, color: '#d7ccc8' })); },
    });

    const shield = this.effects.has('shield');
    this.hazards.update(dt, {
      cam: this.cam, player: p, world: this.world, water: this.water, shield, vfx: this.vfx, audio: this.audio,
      onHit: (m) => {
        p.vy = -650; p.vx = (p.cx < m.x ? -1 : 1) * 380; p.onGround = false; p.platform = null;
        p.stunUntil = now() + 350; p.invulnUntil = now() + 700;
        this.vfx.addShake(12, 300); this.audio.sfx('hit');
        this.vfx.pw(16, () => ({ x: m.x, y: m.y, vx: rand(-400, 400), vy: rand(-200, 500), g: -1500, life: 0.6, max: 0.6, size: rand(4, 9), color: '#ff5fa0' }));
      },
    });

    if (!p.dead && !p.tween && !shield && p.y < this.water.y - 8) this.die();
    if (shield && p.y < this.water.y + 10 && !p.dead) { p.vy = Math.max(p.vy, 500); }   // shield: bounce off water
    if (p.onGround && p.bestLevel > this.sessionBest) {
      this.sessionBest = p.bestLevel;
      if (this.sessionBest > this.allTimeBest) { this.allTimeBest = this.sessionBest; localStorage.setItem('wp_best', String(this.allTimeBest)); }
    }
  }

  updateVisual(dt) {
    const p = this.player;
    const target = p.dead ? this.cam.y : Math.max(p.y, this.water.y - 500, -150);
    this.cam.y += (target - this.cam.y) * (1 - Math.exp(-7 * dt));
    this.cam.top = this.cam.y + H * 0.62; this.cam.bottom = this.cam.y - H * 0.38;
    this.vfx.update(dt);
    this.hud.update();
    this._shake = this.vfx.shakeOffset();
    if (this.effects.has('shield') && !p.dead) {
      this.vfx.pw(2, () => ({ x: p.cx - p.facing * 18 + rand(-6, 6), y: p.y + 10, vx: rand(-60, 60) - p.vx * 0.2, vy: rand(-400, -150), g: 300, life: rand(0.25, 0.45), max: 0.45, size: rand(5, 11), color: ['#ff9800', '#ffeb3b', '#ff5722'][Math.floor(rand(0, 3))], shrink: true }));
    }
    if (this.world.quaking && Math.random() < 0.3) this.vfx.addShake(4, 80);
  }

  render() {
    const ctx = this.ctx;
    renderBackground(ctx, this);
    renderPlatforms(ctx, this);
    this.hazards.render(ctx, this.cam);
    renderPlayer(ctx, this);
    this.vfx.renderWorld(ctx, this.cam);
    renderWater(ctx, this);
    this.vfx.renderScreen(ctx, this);
    this.hud.render(ctx, this);
  }
}
