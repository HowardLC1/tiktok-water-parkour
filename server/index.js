/**
 * Backend entry point: Express static server + WebSocket hub + TikTok LIVE bridge.
 *
 * Pipeline:  TikTok gift ──▶ normalize ──▶ ComboAggregator ──▶ resolve via gifts.config.json
 *            ──▶ broadcast { type: 'gift', effect, count, user, message } to every game client.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { ConfigStore } from './config.js';
import { ComboAggregator } from './combo.js';
import { TikTokBridge } from './tiktok.js';
import { HallOfFame } from './hallOfFame.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const CONFIG_PATH = process.env.GIFTS_CONFIG || path.join(ROOT, 'gifts.config.json');

// ───────────────────────── config ─────────────────────────
const store = new ConfigStore(CONFIG_PATH);
store.load();
store.watch();
console.log(`[config] loaded ${Object.keys(store.config.gifts).length} gifts from ${CONFIG_PATH}`);

const combos = new ComboAggregator({ windowMs: store.config.settings.comboMergeWindowMs });
const hof = new HallOfFame(path.join(ROOT, 'data', 'hall_of_fame.json'));
const tiktok = new TikTokBridge({ signApiKey: process.env.EULER_API_KEY });

store.on('reload', (cfg) => {
  combos.setWindow(cfg.settings.comboMergeWindowMs);
  broadcast({ type: 'config', config: cfg });
});

// ───────────────────────── event building ─────────────────────────
let eventSeq = 0;
function renderTemplate(tpl, user, count) {
  const name = user.nickname || user.uniqueId || 'Зритель';
  let msg = String(tpl || '{user}').replaceAll('{user}', name);
  if (count > 1) msg += ` ×${count}`;
  return msg;
}

function buildGiftEvent({ user, gift, count, source = 'tiktok' }) {
  const { gift: effect, mapped } = store.resolve({ giftName: gift.name, giftId: gift.id });
  return {
    type: 'gift',
    id: ++eventSeq,
    ts: Date.now(),
    source,
    user,
    gift: { id: gift.id ?? effect.giftId ?? null, name: gift.name || effect.giftName, image: gift.image || null, coins: effect.coins ?? gift.diamonds ?? 0 },
    count,
    mapped,
    effect,
    settings: store.config.settings,
    message: renderTemplate(effect.messageTemplate, user, count),
  };
}

combos.on('progress', ({ user, gift, count }) => {
  if (count > 1) broadcast({ type: 'combo_progress', user, gift: { id: gift.id, name: gift.name }, count });
});
combos.on('combo', ({ user, gift, count }) => {
  const ev = buildGiftEvent({ user, gift, count });
  if (ev.effect.addToHallOfFame) {
    hof.add({ uniqueId: user.uniqueId, nickname: user.nickname, avatar: user.avatar, giftName: ev.gift.name, coins: ev.gift.coins * count });
    broadcast({ type: 'hof', entries: hof.list() });
  }
  console.log(`[gift] ${user.uniqueId} → ${ev.gift.name} ×${count} → ${ev.effect.action}${ev.mapped ? '' : ' (default)'}`);
  broadcast(ev);
});

tiktok.on('gift', (g) => combos.push(g));
tiktok.on('like', (l) => broadcast({ type: 'like', ...l }));
tiktok.on('chat', (c) => broadcast({ type: 'chat', ...c }));
tiktok.on('status', (s) => broadcast({ type: 'status', status: s }));

// ───────────────────────── http ─────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public'), { etag: false, maxAge: 0 }));
app.get('/gifts.config.json', (_req, res) => res.sendFile(CONFIG_PATH));
app.get('/api/config', (_req, res) => res.json(store.config));
app.get('/api/status', (_req, res) => res.json(tiktok.status()));
app.get('/api/hall-of-fame', (_req, res) => res.json(hof.list()));
app.post('/api/connect', async (req, res) => {
  try { res.json(await tiktok.connect(req.body?.username)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.post('/api/disconnect', async (_req, res) => { await tiktok.disconnect(); res.json(tiktok.status()); });
/** Simulate a gift through the full backend pipeline (combo + config resolution). */
app.post('/api/simulate', (req, res) => {
  const { giftName, giftId, count = 1, user = 'tester', streak = false } = req.body || {};
  const g = {
    user: { userId: `sim:${user}`, uniqueId: user, nickname: user, avatar: null },
    gift: { id: giftId ?? store.giftsByName.get(String(giftName || '').toLowerCase())?.giftId ?? null, name: giftName || null, type: streak ? 1 : 0, diamonds: 0, image: null },
    repeatCount: Number(count) || 1, repeatEnd: Boolean(streak), streakable: Boolean(streak), raw: {},
  };
  combos.push(g);
  res.json({ ok: true, queued: g });
});

// ───────────────────────── websocket ─────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(data);
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'config', config: store.config }));
  ws.send(JSON.stringify({ type: 'status', status: tiktok.status() }));
  ws.send(JSON.stringify({ type: 'hof', entries: hof.list() }));

  ws.on('message', async (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    switch (msg.type) {
      case 'connect':
        try { await tiktok.connect(msg.username); } catch { /* status already broadcast */ }
        break;
      case 'disconnect':
        await tiktok.disconnect();
        break;
      case 'hof_add': {
        hof.add(msg.user || {});
        broadcast({ type: 'hof', entries: hof.list() });
        break;
      }
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        break;
      default:
        break;
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🌊  TikTok Water Parkour`);
  console.log(`    Game / OBS source : http://localhost:${PORT}/`);
  console.log(`    WebSocket         : ws://localhost:${PORT}/ws`);
  console.log(`    Press H in the game to open the debug panel.\n`);
  if (process.env.TIKTOK_USERNAME) tiktok.connect(process.env.TIKTOK_USERNAME).catch(() => {});
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log('\n[server] shutting down');
    combos.flushAll();
    await tiktok.disconnect();
    store.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
