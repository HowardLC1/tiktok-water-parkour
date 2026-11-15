/** Keyboard state. WASD / arrows / space. Emits `manual` when the streamer touches movement keys. */
export class Input {
  constructor() {
    this.keys = new Set();
    this.lastInputAt = 0;
    this.listeners = { manual: [], key: [] };
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }
  on(type, fn) { this.listeners[type].push(fn); }
  isTyping(e) { const el = e.target; return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable); }
  onKey(e, down) {
    if (this.isTyping(e)) return;
    const k = e.code;
    const move = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space'].includes(k);
    if (move) e.preventDefault();
    if (down) {
      if (!this.keys.has(k)) for (const fn of this.listeners.key) fn(k, e);
      this.keys.add(k);
      if (move) { this.lastInputAt = performance.now(); for (const fn of this.listeners.manual) fn(); }
    } else this.keys.delete(k);
  }
  get state() {
    const k = this.keys;
    return {
      left: k.has('KeyA') || k.has('ArrowLeft'),
      right: k.has('KeyD') || k.has('ArrowRight'),
      jump: k.has('KeyW') || k.has('ArrowUp') || k.has('Space'),
    };
  }
}
