/**
 * TikTokBridge — thin wrapper around tiktok-live-connector that normalizes
 * gift / like / chat payloads into a stable shape used by the rest of the app.
 *
 * tiktok-live-connector v2 emits raw protobuf-shaped messages (user.displayId,
 * gift.name, repeatEnd as number…); the legacy build emits giftDetails / profilePicture.
 * The normalizers below accept both so an upgrade of the library does not break the game.
 */
import { EventEmitter } from 'node:events';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

function pickUrl(img) {
  if (!img) return null;
  if (Array.isArray(img.urls) && img.urls.length) return img.urls[0];
  if (Array.isArray(img.urlList) && img.urlList.length) return img.urlList[0];
  if (Array.isArray(img.url_list) && img.url_list.length) return img.url_list[0];
  return null;
}

export function normalizeUser(u = {}) {
  const uniqueId = u.uniqueId || u.displayId || u.display_id || u.unique_id || '';
  return {
    userId: String(u.userId || u.id || u.user_id || uniqueId || ''),
    uniqueId: uniqueId || String(u.userId || u.id || 'viewer'),
    nickname: u.nickname || uniqueId || 'Зритель',
    avatar: pickUrl(u.profilePicture) || pickUrl(u.avatarThumb) || pickUrl(u.avatarMedium) || null,
  };
}

export function normalizeGift(data = {}) {
  const details = data.giftDetails || data.gift || data.extendedGiftInfo || {};
  const giftId = data.giftId ?? details.id ?? details.giftId ?? null;
  const name = details.giftName || details.name || data.giftName || null;
  const type = details.giftType ?? details.type ?? null;
  const image = pickUrl(details.giftImage) || pickUrl(details.image) || pickUrl(details.icon) || null;
  return {
    user: normalizeUser(data.user),
    gift: {
      id: giftId != null ? Number(giftId) : null,
      name,
      type,
      diamonds: Number(details.diamondCount ?? details.diamond_count ?? 0),
      image,
    },
    repeatCount: Number(data.repeatCount ?? data.repeat_count ?? 1) || 1,
    repeatEnd: Boolean(Number(data.repeatEnd ?? data.repeat_end ?? 0)),
    streakable: Number(type) === 1,
    raw: { giftId, name, type },
  };
}

export class TikTokBridge extends EventEmitter {
  constructor({ signApiKey } = {}) {
    super();
    this.signApiKey = signApiKey || undefined;
    this.connection = null;
    this.username = null;
    this.state = 'disconnected'; // disconnected | connecting | connected | error
    this.lastError = null;
    this.roomId = null;
    this.viewerCount = 0;
    this.stats = { gifts: 0, likes: 0, chats: 0 };
  }

  status() {
    return {
      state: this.state, username: this.username, roomId: this.roomId,
      error: this.lastError, viewerCount: this.viewerCount, stats: this.stats,
    };
  }

  _setState(state, error = null) {
    this.state = state;
    this.lastError = error;
    this.emit('status', this.status());
  }

  async connect(username) {
    if (!username) throw new Error('username is required');
    await this.disconnect();
    this.username = username.replace(/^@/, '').trim();
    this._setState('connecting');

    const conn = new TikTokLiveConnection(this.username, {
      signApiKey: this.signApiKey,
      enableExtendedGiftInfo: true,
      processInitialData: false,
      fetchRoomInfoOnConnect: true,
    });
    this.connection = conn;

    conn.on(WebcastEvent.GIFT, (data) => {
      try {
        const g = normalizeGift(data);
        this.stats.gifts += 1;
        this.emit('gift', g);
      } catch (err) { console.error('[tiktok] bad gift payload', err); }
    });
    conn.on(WebcastEvent.LIKE, (data) => {
      const likes = Number(data.likeCount ?? data.count ?? 1) || 1;
      const total = Number(data.totalLikeCount ?? data.total ?? 0) || 0;
      this.stats.likes += likes;
      this.emit('like', { user: normalizeUser(data.user), likes, total });
    });
    conn.on(WebcastEvent.CHAT, (data) => {
      this.stats.chats += 1;
      this.emit('chat', { user: normalizeUser(data.user), text: data.comment || data.content || '' });
    });
    conn.on(WebcastEvent.ROOM_USER, (data) => {
      const n = Number(data.viewerCount ?? data.total ?? 0);
      if (n) { this.viewerCount = n; this.emit('status', this.status()); }
    });
    conn.on(WebcastEvent.STREAM_END, () => {
      this._setState('disconnected', 'stream ended');
    });
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.connection === conn) this._setState('disconnected', this.lastError);
    });
    conn.on(ControlEvent.ERROR, (err) => {
      const msg = err?.info || err?.exception?.message || String(err);
      console.warn('[tiktok] error:', msg);
    });

    try {
      const state = await conn.connect();
      this.roomId = state?.roomId || conn.roomId || null;
      this._setState('connected');
      console.log(`[tiktok] connected to @${this.username} (room ${this.roomId})`);
      return this.status();
    } catch (err) {
      const msg = err?.message || String(err);
      console.error('[tiktok] connect failed:', msg);
      this.connection = null;
      this._setState('error', msg);
      throw err;
    }
  }

  async disconnect() {
    const conn = this.connection;
    this.connection = null;
    if (conn) {
      try { await conn.disconnect(); } catch { /* ignore */ }
    }
    this.roomId = null;
    if (this.state !== 'disconnected') this._setState('disconnected');
  }
}
