/**
 * ConfigStore — loads, validates and hot-reloads gifts.config.json.
 *
 * The whole event pipeline is driven by this file: gift name/id lookup,
 * combo window, grace period, default effect for unmapped gifts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const KNOWN_ACTIONS = new Set([
  'move_levels', 'apply_status', 'knockback_drop', 'freeze_water', 'meteor_shower',
  'water_surge', 'jetpack_shield', 'earthquake', 'reverse_controls_drop', 'drain_water',
  'tsunami', 'poseidon_wrath', 'teleport_to_water_edge',
]);

/** Map legacy `type` values used by settings.defaultGiftEffect onto a real action. */
function actionFromType(type) {
  switch (type) {
    case 'water_surge_minor': return 'move_levels';
    default: return KNOWN_ACTIONS.has(type) ? type : 'move_levels';
  }
}

export class ConfigStore extends EventEmitter {
  constructor(filePath) {
    super();
    this.filePath = path.resolve(filePath);
    this.config = null;
    this.giftsById = new Map();
    this.giftsByName = new Map();
    this._watcher = null;
    this._reloadTimer = null;
  }

  load() {
    const raw = fs.readFileSync(this.filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const config = this.normalize(parsed);
    this.config = config;
    this.giftsById.clear();
    this.giftsByName.clear();
    for (const [name, gift] of Object.entries(config.gifts)) {
      this.giftsByName.set(name.toLowerCase(), gift);
      if (gift.giftId != null) this.giftsById.set(String(gift.giftId), gift);
    }
    return config;
  }

  normalize(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error('gifts.config.json: root must be an object');
    const settings = { ...(parsed.settings || {}) };
    settings.comboMergeWindowMs = Number(settings.comboMergeWindowMs ?? 1500);
    settings.gracePeriodThresholdLevels = Number(settings.gracePeriodThresholdLevels ?? 1);
    settings.minCoinsForLethalHit = Number(settings.minCoinsForLethalHit ?? 10);
    const def = settings.defaultGiftEffect || {};
    settings.defaultGiftEffect = {
      ...def,
      giftName: '__default__',
      action: def.action || actionFromType(def.type),
      levelsDelta: Number(def.levelsDelta ?? -1),
      durationMs: Number(def.durationMs ?? 0),
      allowLethal: Boolean(def.allowLethal ?? false),
      coins: Number(def.coins ?? 1),
      role: def.role || 'sabotage',
      vfx: def.vfx || 'splash_small',
      sfx: def.sfx || 'water_drop',
      messageTemplate: def.messageTemplate || '{user} отправил подарок!',
    };

    const gifts = {};
    for (const [name, g] of Object.entries(parsed.gifts || {})) {
      if (!g || typeof g !== 'object') continue;
      if (!KNOWN_ACTIONS.has(g.action)) {
        console.warn(`[config] gift "${name}" has unknown action "${g.action}" — it will use the default effect`);
      }
      gifts[name] = {
        ...g,
        giftName: name,
        giftId: g.giftId != null ? Number(g.giftId) : null,
        coins: Number(g.coins ?? 0),
        allowLethal: Boolean(g.allowLethal ?? false),
        durationMs: g.durationMs != null ? Number(g.durationMs) : 0,
      };
    }
    return { settings, gifts };
  }

  /** Resolve a gift by name (case-insensitive) or id. Falls back to default effect. */
  resolve({ giftName, giftId } = {}) {
    let gift = null;
    if (giftId != null) gift = this.giftsById.get(String(giftId)) || null;
    if (!gift && giftName) gift = this.giftsByName.get(String(giftName).toLowerCase()) || null;
    if (gift && KNOWN_ACTIONS.has(gift.action)) return { gift, mapped: true };
    return { gift: { ...this.config.settings.defaultGiftEffect, giftName: giftName || '__default__', giftId: giftId ?? null }, mapped: false };
  }

  watch() {
    if (this._watcher) return;
    const dir = path.dirname(this.filePath);
    const base = path.basename(this.filePath);
    try {
      this._watcher = fs.watch(dir, { persistent: false }, (_event, filename) => {
        if (filename && filename !== base) return;
        clearTimeout(this._reloadTimer);
        this._reloadTimer = setTimeout(() => this._reload(), 250);
      });
    } catch (err) {
      console.warn('[config] fs.watch unavailable, falling back to polling:', err.message);
      let lastMtime = 0;
      this._watcher = setInterval(() => {
        try {
          const m = fs.statSync(this.filePath).mtimeMs;
          if (m !== lastMtime) { lastMtime = m; this._reload(); }
        } catch { /* ignore */ }
      }, 1000);
    }
  }

  _reload() {
    try {
      const cfg = this.load();
      console.log(`[config] reloaded ${Object.keys(cfg.gifts).length} gifts from ${path.basename(this.filePath)}`);
      this.emit('reload', cfg);
    } catch (err) {
      console.error('[config] reload failed (keeping previous config):', err.message);
      this.emit('error', err);
    }
  }

  close() {
    if (!this._watcher) return;
    if (typeof this._watcher.close === 'function') this._watcher.close(); else clearInterval(this._watcher);
    this._watcher = null;
  }
}
