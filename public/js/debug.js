/** Collapsible debug & connection panel (toggle with H). */
import { roleColor } from './actions.js';

export class DebugPanel {
  constructor(game, net) {
    this.game = game; this.net = net;
    this.el = document.getElementById('debug');
    this.q = (s) => this.el.querySelector(s);
    this.visible = false;
    this.bind();
    game.input.on('key', (code) => { if (code === 'KeyH') this.toggle(); });
    game.onLog = () => this.renderLog();
    game.onModeChange = (m) => { this.q('#modeToggle').checked = m === 'ai'; };
    this.renderLog();
  }

  toggle(force) { this.visible = force ?? !this.visible; this.el.classList.toggle('open', this.visible); }

  bind() {
    const g = this.game, net = this.net;
    this.q('#btnConnect').onclick = () => {
      const username = this.q('#username').value.trim();
      if (!username) return;
      localStorage.setItem('wp_username', username);
      net.send({ type: 'connect', username });
      this.setStatus({ state: 'connecting', username });
    };
    this.q('#btnDisconnect').onclick = () => net.send({ type: 'disconnect' });
    this.q('#username').value = localStorage.getItem('wp_username') || '';
    this.q('#modeToggle').onchange = (e) => g.setMode(e.target.checked ? 'ai' : 'manual');
    this.q('#autoReturn').onchange = (e) => { g.autoReturn = e.target.checked; };
    this.q('#btnRestart').onclick = () => g.restart();
    this.q('#volume').oninput = (e) => g.audio.setVolume(Number(e.target.value));
    this.q('#soundToggle').onchange = (e) => { g.audio.enabled = e.target.checked; if (e.target.checked) g.audio.init(); };
    this.q('#btnClose').onclick = () => this.toggle(false);
    this.q('#btnDefault').onclick = () => g.simulateGift('__unmapped__', { user: this.testUser(), count: this.testCount() });
  }

  testUser() { return this.q('#testUser').value.trim() || 'Тестер'; }
  testCount() { return Math.max(1, Number(this.q('#testCount').value) || 1); }

  buildGiftButtons(config) {
    const box = this.q('#giftButtons'); box.innerHTML = '';
    const gifts = Object.entries(config.gifts || {}).sort((a, b) => (a[1].coins || 0) - (b[1].coins || 0));
    for (const [name, g] of gifts) {
      const b = document.createElement('button');
      b.className = 'gift';
      b.style.borderColor = roleColor(g.role);
      b.innerHTML = `<b>${name}</b><small>${g.coins}💰 · ${g.action}</small>`;
      b.title = g.messageTemplate || '';
      b.onclick = () => this.game.simulateGift(name, { user: this.testUser(), count: this.testCount() });
      box.appendChild(b);
    }
  }

  setStatus(s) {
    const el = this.q('#connStatus');
    const map = { connected: ['● подключено', 'ok'], connecting: ['◌ подключение…', 'warn'], error: ['● ошибка', 'err'], disconnected: ['○ отключено', 'muted'] };
    const [label, cls] = map[s.state] || map.disconnected;
    el.textContent = `${label}${s.username ? ' @' + s.username : ''}${s.error ? ' — ' + s.error : ''}${s.viewerCount ? ' · 👁 ' + s.viewerCount : ''}`;
    el.className = 'status ' + cls;
  }
  setServer(ok) { const el = this.q('#serverStatus'); el.textContent = ok ? '● сервер' : '○ нет сервера'; el.className = 'status ' + (ok ? 'ok' : 'err'); }

  renderLog() {
    const el = this.q('#log'); if (!el) return;
    el.textContent = this.game.logs.slice(-12).join('\n'); el.scrollTop = el.scrollHeight;
  }
}
