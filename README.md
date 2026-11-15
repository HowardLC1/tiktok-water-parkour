# 🌊 TikTok Water Parkour

Interactive TikTok LIVE game inspired by *"Don't Touch The Water" / "It Hears The Water"*: a vertical parkour
survival against rising water, where **viewers control the chaos with TikTok gifts**. Every gift is mapped
through `gifts.config.json`.

```
┌──────────────┐  gift / like / chat   ┌─────────────────────┐   WebSocket   ┌──────────────────────┐
│ TikTok LIVE  │ ────────────────────▶ │ Node backend        │ ────────────▶ │ Game (Canvas, 9:16)  │
│              │                       │ • gifts.config.json │               │ • physics + AI bot   │
│              │                       │ • combo merging     │               │ • VFX / Web Audio    │
│              │                       │ • hall of fame      │               │ • stream HUD         │
└──────────────┘                       └─────────────────────┘               └──────────────────────┘
```

## Quick start

```bash
npm install
npm start            # → http://localhost:3000
```

Open <http://localhost:3000> in a browser, press **H** to open the control panel, type the TikTok
username (without `@`) and click **Подключить**. The streamer must be live.

Optional environment variables:

| Variable          | Purpose                                                                 |
|-------------------|-------------------------------------------------------------------------|
| `PORT`            | HTTP/WebSocket port (default `3000`)                                    |
| `TIKTOK_USERNAME` | Auto-connect to this stream on start                                    |
| `EULER_API_KEY`   | Euler Stream API key for `tiktok-live-connector` (raises rate limits)   |
| `GIFTS_CONFIG`    | Path to an alternative config file (default `./gifts.config.json`)      |

URL parameters for the game page:

| Parameter              | Effect                                                          |
|------------------------|-----------------------------------------------------------------|
| `?user=<name>`         | Connect to that stream as soon as the page loads                |
| `?debug=1`             | Open the control panel on load                                  |
| `?mode=manual`         | Start in manual control instead of AI                           |
| `?sim=Rose:15,Galaxy`  | Fire scripted test gifts (`name[:count]`, 1.2 s apart)           |

## OBS Studio

1. **Sources → + → Browser** (Browser Source).
2. URL: `http://localhost:3000/?user=YOUR_TIKTOK_NAME`
3. Width **1080**, Height **1920** (the canvas is 9:16 and scales to any size, so 540×960 also works).
4. Tick **"Control audio via OBS"** if you want the procedural sound effects in your stream mix.
5. Leave *"Shutdown source when not visible"* **off** so the game keeps running between scenes.
6. To control the game from OBS: right-click the source → **Interact**, press **H** for the panel,
   or use WASD / arrows to take manual control at any time.

The page is opaque by default. For a transparent overlay set `#game { background: transparent }`
and `body { background: transparent }` in `public/css/style.css`.

## Controls

| Key / UI                  | Action                                            |
|---------------------------|---------------------------------------------------|
| `H`                       | Toggle the debug / connection panel               |
| `WASD` / arrows / space   | Manual control (automatically switches off the AI)|
| `P`                       | Toggle AI auto-parkour ↔ manual                   |
| `R`                       | Restart round                                     |
| `M`                       | Mute / unmute                                     |

The AI bot takes over again after 8 s without key presses (switchable in the panel).

## `gifts.config.json`

The backend **watches the file** and hot-reloads it; the game page receives the new config instantly
and rebuilds its test buttons. Each entry:

```jsonc
"Galaxy": {
  "giftId": 5509,                 // matched by id first, then by name (case-insensitive)
  "coins": 1000,
  "role": "ultimate_sabotage",    // banner colour
  "action": "tsunami",            // see table below
  "levelsDelta": -15,
  "setWaterDistanceLevels": 1,
  "allowLethal": true,
  "vfx": "tsunami_wave_fullscreen",
  "sfx": "tsunami_roar",
  "messageTemplate": "{user} ОБРУШИЛ ЦУНАМИ (-15 уровней)!"
}
```

| `action`                  | Parameters used                                                      |
|---------------------------|----------------------------------------------------------------------|
| `move_levels`             | `levelsDelta`, `allowLethal`                                         |
| `apply_status`            | `statusEffect` (`slippery_platforms`), `durationMs`                  |
| `knockback_drop`          | `levelsDelta`, `knockbackForce`, `allowLethal`                       |
| `freeze_water`            | `durationMs`                                                         |
| `meteor_shower`           | `projectileType`, `spawnRateMs`, `durationMs`                        |
| `water_surge`             | `waterRiseLevels`, `durationMs`                                      |
| `jetpack_shield`          | `boostLevels`, `durationMs`                                          |
| `earthquake`              | `levelsDelta`, `platformMoveSpeed`, `durationMs`, `allowLethal`      |
| `reverse_controls_drop`   | `levelsDelta`, `durationMs`, `allowLethal`                           |
| `drain_water`             | `levelsDelta`, `resetWaterToBottom`                                  |
| `tsunami`, `poseidon_wrath` | `levelsDelta`, `setWaterDistanceLevels`, `hideAlternatePlatforms`, `durationMs` |
| `teleport_to_water_edge`  | `setWaterDistanceLevels`, `addToHallOfFame`                          |

Rules from `settings`:

* **`comboMergeWindowMs`** — gifts from the same viewer are merged inside this window (and TikTok streaks
  are merged until `repeatEnd`), so `x15 Rose` becomes one `-15 levels` action. `levelsDelta`,
  `waterRiseLevels` and `boostLevels` scale with the count; durations scale up to ×3.
* **`gracePeriodThresholdLevels`** — a non-lethal drop (`allowLethal: false`, or `coins` below
  `minCoinsForLethalHit`) never puts the player lower than this many levels above the water.
* **`defaultGiftEffect`** — applied to any gift that is not in the file.

Hall of Fame entries are persisted in `data/hall_of_fame.json` (and mirrored in the browser's
`localStorage` for offline play).

## Testing without going live

* Press **H** → every gift from the config has a test button (the “Неизвестный подарок” button tests
  the default effect). Change the *count* field to simulate a combo.
* Backend pipeline (combo merging + config resolution) can be exercised with:
  ```bash
  curl -X POST localhost:3000/api/simulate -H 'content-type: application/json' \
       -d '{"giftName":"Rose","count":15,"user":"tester"}'
  ```
* REST: `GET /api/status`, `GET /api/config`, `GET /api/hall-of-fame`, `POST /api/connect {username}`,
  `POST /api/disconnect`.

## Project layout

```
gifts.config.json        gift → mechanic mapping (hot-reloaded)
server/
  index.js               Express static server, WebSocket hub, REST, wiring
  config.js              ConfigStore: load / validate / watch gifts.config.json
  combo.js               ComboAggregator: merges gift spam & TikTok streaks
  tiktok.js              TikTokBridge: tiktok-live-connector + payload normalisation
  hallOfFame.js          persistent Hall of Fame
public/
  index.html, css/       page shell + control panel
  js/main.js             bootstrap, WebSocket wiring, URL parameters
  js/game.js             orchestrator: loop, camera, forced level moves, death/restart
  js/actions.js          every `action` from the config → gameplay
  js/player.js           platformer physics (one-way platforms, coyote time, tweens)
  js/ai.js               parkour bot (target selection, launch points, dodging)
  js/world.js            procedural tower, earthquakes, phased platforms
  js/water.js            rising / frozen / surging / draining water
  js/hazards.js          doughnut meteor shower with warning shadows
  js/effects.js          timed buffs / debuffs for the HUD
  js/vfx.js              particles, camera shake, full-screen overlays
  js/audio.js            Web Audio procedural sound effects
  js/hud.js, render.js   stream HUD and world rendering
  js/debug.js, input.js, net.js
```
