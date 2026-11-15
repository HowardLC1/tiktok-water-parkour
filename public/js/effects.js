/** Timed status effects (buffs / debuffs) with HUD metadata. */
import { now } from './util.js';

const META = {
  slippery: { label: 'Скользко', icon: '🧊', color: '#81d4fa' },
  reverse: { label: 'Инверсия', icon: '🔀', color: '#ce93d8' },
  shield: { label: 'Щит + ранец', icon: '🚀', color: '#ffd54f' },
  frozen: { label: 'Вода заморожена', icon: '❄️', color: '#b3e5fc' },
  quake: { label: 'Землетрясение', icon: '🌋', color: '#ffab91' },
  phased: { label: 'Платформы исчезают', icon: '👻', color: '#b0bec5' },
  meteors: { label: 'Дождь из пончиков', icon: '🍩', color: '#ffcc80' },
  surge: { label: 'Прилив', icon: '🌊', color: '#ff5252' },
};

export class Effects {
  constructor() { this.map = new Map(); }

  add(name, ms, data = {}) {
    const t = now();
    const cur = this.map.get(name);
    const until = Math.max(cur?.until || 0, t + ms);
    this.map.set(name, { name, start: cur?.start ?? t, until, data: { ...(cur?.data || {}), ...data }, ...META[name] });
  }
  has(name) { const e = this.map.get(name); return !!e && e.until > now(); }
  remaining(name) { const e = this.map.get(name); return e ? Math.max(0, e.until - now()) : 0; }
  progress(name) { const e = this.map.get(name); if (!e) return 1; return Math.min(1, (now() - e.start) / (e.until - e.start)); }
  remove(name) { this.map.delete(name); }
  clear() { this.map.clear(); }
  update() { const t = now(); for (const [k, e] of this.map) if (e.until <= t) this.map.delete(k); }
  list() { const t = now(); return [...this.map.values()].filter((e) => e.until > t).sort((a, b) => a.until - b.until); }
}
