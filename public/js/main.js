import { W, H } from './const.js';
import { Game } from './game.js';
import { Net } from './net.js';
import { DebugPanel } from './debug.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
const net = new Net();
game.net = net;
const debug = new DebugPanel(game, net);
window.game = game; // handy for console testing: game.simulateGift('Galaxy')

// ── responsive 9:16 scaling ──
function resize() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
}
window.addEventListener('resize', resize); resize();

// ── config: from the server (live, hot-reloaded) or the static file (offline) ──
async function loadStaticConfig() {
  try { const cfg = await (await fetch('/gifts.config.json', { cache: 'no-store' })).json(); applyConfig(cfg); }
  catch (e) { console.warn('config fetch failed', e); }
}
function applyConfig(cfg) { game.setConfig(cfg); debug.buildGiftButtons(cfg); }
loadStaticConfig();

// ── websocket events ──
net.on('open', () => { game.netOk = true; debug.setServer(true); });
net.on('close', () => { game.netOk = false; debug.setServer(false); game.conn = null; debug.setStatus({ state: 'disconnected' }); });
net.on('config', (m) => applyConfig(m.config));
net.on('status', (m) => { game.conn = m.status; game.stats.viewers = m.status.viewerCount || game.stats.viewers; debug.setStatus(m.status); });
net.on('hof', (m) => game.setHallOfFame(m.entries));
net.on('gift', (m) => game.applyGiftEvent(m));
net.on('combo_progress', (m) => game.hud.showCombo(`${m.gift.name} ×${m.count}`, m.user));
net.on('like', (m) => {
  game.stats.likes += m.likes || 1;
  game.vfx.ps(Math.min(6, m.likes || 1), () => ({ x: 60 + Math.random() * 300, y: H - 140, vx: (Math.random() - 0.5) * 80, vy: -(200 + Math.random() * 200), life: 1.6, max: 1.6, size: 34, color: '#ff4081', kind: 'text', text: '❤' }));
});
net.on('chat', () => { game.stats.chats += 1; });

// ── auto-connect from URL: /?user=tiktokname ──
const params = new URLSearchParams(location.search);
if (params.get('user')) net.on('open', () => net.send({ type: 'connect', username: params.get('user') }));
if (params.get('debug') === '1') debug.toggle(true);
if (params.get('mode') === 'manual') game.setMode('manual');

// ── scripted test: /?sim=Rose:15,Doughnut,Galaxy  (gift[:count], fired 1.2s apart after load) ──
if (params.get('sim')) {
  const seq = params.get('sim').split(',').map((s) => { const [name, n] = s.split(':'); return { name: name.trim(), count: Number(n) || 1 }; });
  const start = () => seq.forEach((g, i) => setTimeout(() => game.simulateGift(g.name, { user: 'Тестер', count: g.count }), 600 + i * 1200));
  const wait = setInterval(() => { if (Object.keys(game.gifts).length) { clearInterval(wait); start(); } }, 50);
}
console.log('[game] ready');
