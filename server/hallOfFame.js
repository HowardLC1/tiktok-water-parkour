/** Persistent Hall of Fame (JSON on disk). */
import fs from 'node:fs';
import path from 'node:path';

export class HallOfFame {
  constructor(filePath, { max = 50 } = {}) {
    this.filePath = path.resolve(filePath);
    this.max = max;
    this.entries = [];
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (Array.isArray(data)) this.entries = data;
    } catch { this.entries = []; }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
    } catch (err) {
      console.error('[hof] failed to save:', err.message);
    }
  }

  add({ uniqueId, nickname, avatar, giftName, coins = 0 }) {
    const id = uniqueId || nickname;
    if (!id) return this.entries;
    let e = this.entries.find((x) => x.uniqueId === id);
    if (!e) {
      e = { uniqueId: id, nickname: nickname || id, avatar: avatar || null, count: 0, coins: 0, gifts: [], firstAt: Date.now() };
      this.entries.push(e);
    }
    e.nickname = nickname || e.nickname;
    if (avatar) e.avatar = avatar;
    e.count += 1;
    e.coins += Number(coins) || 0;
    e.lastAt = Date.now();
    if (giftName) e.gifts = [...new Set([...(e.gifts || []), giftName])].slice(-10);
    this.entries.sort((a, b) => b.coins - a.coins || b.count - a.count || a.firstAt - b.firstAt);
    this.entries = this.entries.slice(0, this.max);
    this.save();
    return this.entries;
  }

  list() { return this.entries; }
}
