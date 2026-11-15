/** WebSocket client with auto-reconnect. */
export class Net {
  constructor(url) {
    this.url = url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    this.ws = null; this.handlers = new Map(); this.connected = false; this.retry = 1000;
    this.connect();
  }
  on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); }
  emit(type, msg) { for (const fn of this.handlers.get(type) || []) fn(msg); }
  connect() {
    try { this.ws = new WebSocket(this.url); } catch { return this.scheduleReconnect(); }
    this.ws.onopen = () => { this.connected = true; this.retry = 1000; this.emit('open'); };
    this.ws.onclose = () => { this.connected = false; this.emit('close'); this.scheduleReconnect(); };
    this.ws.onerror = () => {};
    this.ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.emit(m.type, m); this.emit('*', m); };
  }
  scheduleReconnect() { setTimeout(() => this.connect(), this.retry); this.retry = Math.min(this.retry * 1.6, 10000); }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
}
