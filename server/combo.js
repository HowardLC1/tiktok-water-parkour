/**
 * ComboAggregator — merges rapid gift spam into one combined action.
 *
 * TikTok sends two kinds of gifts:
 *   • streakable (giftType === 1): the same event is re-sent with a growing cumulative
 *     `repeatCount`, and a final event with `repeatEnd: true` closes the streak.
 *   • non-streakable: each send is an independent event (repeatCount is usually 1).
 *
 * Both are merged per (user, gift) inside `windowMs` (settings.comboMergeWindowMs).
 * Streaks that outlive the window are flushed in chunks (only the *delta* since the last
 * flush is emitted) so nothing is ever double counted, and a never-arriving repeatEnd
 * cannot stall the queue.
 */
import { EventEmitter } from 'node:events';

export class ComboAggregator extends EventEmitter {
  constructor({ windowMs = 1500, maxHoldMs = null } = {}) {
    super();
    this.windowMs = windowMs;
    this.maxHoldMs = maxHoldMs ?? windowMs * 4;
    this.pending = new Map();
  }

  setWindow(windowMs) {
    this.windowMs = windowMs;
    this.maxHoldMs = windowMs * 4;
  }

  /**
   * @param {object} g normalized gift: { key, user, gift, repeatCount, repeatEnd, streakable, raw }
   */
  push(g) {
    const key = `${g.user.userId || g.user.uniqueId}:${g.gift.id ?? g.gift.name}`;
    const now = Date.now();
    let entry = this.pending.get(key);
    if (!entry) {
      entry = {
        key, user: g.user, gift: g.gift, raw: g.raw,
        total: 0, flushed: 0, firstAt: now, timer: null,
      };
      this.pending.set(key, entry);
    }
    entry.user = g.user;
    entry.gift = g.gift;

    if (g.streakable) {
      // cumulative count: keep the max we've seen
      entry.total = Math.max(entry.total, Number(g.repeatCount) || 1);
    } else {
      entry.total += Math.max(1, Number(g.repeatCount) || 1);
    }

    this.emit('progress', { key, user: entry.user, gift: entry.gift, count: entry.total });

    if (g.streakable && g.repeatEnd) {
      this._flush(key, 'repeatEnd');
      return;
    }
    this._arm(entry, now);
  }

  _arm(entry, now) {
    clearTimeout(entry.timer);
    const sinceFirst = now - entry.firstAt;
    const wait = Math.max(50, Math.min(this.windowMs, this.maxHoldMs - sinceFirst));
    entry.timer = setTimeout(() => this._flush(entry.key, 'window'), wait);
  }

  _flush(key, reason) {
    const entry = this.pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    const delta = entry.total - entry.flushed;
    if (delta > 0) {
      entry.flushed = entry.total;
      this.emit('combo', { user: entry.user, gift: entry.gift, count: delta, reason, raw: entry.raw });
    }
    if (reason === 'repeatEnd') {
      this.pending.delete(key);
    } else {
      // keep the entry alive briefly so a late repeatEnd (streak total) doesn't double count
      entry.firstAt = Date.now();
      entry.timer = setTimeout(() => this.pending.delete(key), this.maxHoldMs);
    }
  }

  flushAll() {
    for (const key of [...this.pending.keys()]) this._flush(key, 'manual');
  }

  clear() {
    for (const e of this.pending.values()) clearTimeout(e.timer);
    this.pending.clear();
  }
}
