/**
 * Maps every `action` from gifts.config.json onto game mechanics.
 * Combo scaling rules (count = merged gift count inside comboMergeWindowMs):
 *   levelsDelta / waterRiseLevels / boostLevels  → multiplied by count
 *   durationMs                                   → multiplied by min(count, 3)
 *   meteor spawn rate                            → divided by min(count, 4)
 */
import { now } from './util.js';

const ROLE_COLORS = {
  sabotage: '#ff3b5c', help: '#3ddc84', modifier: '#4fc3f7', chaos: '#ffab40',
  ultimate_sabotage: '#d500f9', ultimate_reset: '#ffd600',
};
export const roleColor = (role) => ROLE_COLORS[role] || '#ffffff';

export function applyGift(game, ev) {
  const e = ev.effect || {};
  const count = Math.max(1, Math.floor(ev.count || 1));
  const user = ev.user || { nickname: 'Зритель' };
  const s = game.settings;
  const p = game.player;
  const lethal = !!e.allowLethal && (e.coins ?? 0) >= (s.minCoinsForLethalHit ?? 10);
  const dur = (e.durationMs || 0) * Math.min(count, 3);
  const vctx = { x: p.cx, y: p.y, user, durationMs: dur || e.durationMs, waterY: game.water.y };

  game.banner(ev.message || `${user.nickname} отправил подарок`, user, roleColor(e.role), { gift: ev.gift, count });
  game.audio.sfx(e.sfx || 'generic');
  game.vfx.play(e.vfx || 'splash_small', vctx);
  game.stats.gifts += count;
  game.log(`${user.nickname}: ${ev.gift?.name || '?'} ×${count} → ${e.action}`);

  switch (e.action) {
    case 'move_levels':
      game.forcedMove((e.levelsDelta || 0) * count, { lethal });
      break;

    case 'apply_status': {
      const name = e.statusEffect === 'slippery_platforms' ? 'slippery' : (e.statusEffect || 'slippery');
      game.effects.add(name, dur || 10000);
      break;
    }

    case 'knockback_drop':
      game.forcedMove((e.levelsDelta || 0) * count, {
        lethal,
        onLand: () => {
          if (p.dead) return;
          const dir = p.cx < 540 ? 1 : -1;
          p.vx = dir * (e.knockbackForce || 400) * (Math.random() < 0.5 ? 1 : -1);
          p.vy = 260; p.onGround = false; p.platform = null; p.stunUntil = now() + 380;
          game.vfx.addShake(10, 250);
        },
      });
      break;

    case 'freeze_water':
      game.water.freeze(dur || 8000);
      game.effects.add('frozen', dur || 8000);
      break;

    case 'meteor_shower':
      game.hazards.startShower({ spawnRateMs: e.spawnRateMs || 600, durationMs: e.durationMs || 10000, intensity: count, type: e.projectileType || 'doughnut' });
      game.effects.add('meteors', e.durationMs || 10000);
      break;

    case 'water_surge':
      game.water.surge((e.waterRiseLevels || 5) * count, e.durationMs || 3000);
      game.effects.add('surge', e.durationMs || 3000);
      break;

    case 'jetpack_shield':
      game.effects.add('shield', dur || 15000);
      game.forcedMove((e.boostLevels || 6) * count, { mode: 'rise' });
      break;

    case 'earthquake':
      game.forcedMove((e.levelsDelta || 0) * count, { lethal });
      game.world.startQuake(e.platformMoveSpeed || 180, dur || 15000);
      game.effects.add('quake', dur || 15000);
      break;

    case 'reverse_controls_drop':
      game.forcedMove((e.levelsDelta || 0) * count, { lethal });
      if (!game.effects.has('reverse')) game.reverseStart = now();
      game.effects.add('reverse', dur || 15000);
      break;

    case 'drain_water':
      if (e.resetWaterToBottom !== false) game.water.drain(1500);
      game.effects.remove('surge');
      game.forcedMove((e.levelsDelta || 10) * count, { mode: 'rise' });
      break;

    case 'tsunami':
    case 'poseidon_wrath':
      game.forcedMove((e.levelsDelta || 0) * count, {
        lethal,
        onLand: (level) => {
          if (e.setWaterDistanceLevels != null && !p.dead) {
            game.water.setLevel(Math.max(game.water.level, level - e.setWaterDistanceLevels));
          }
        },
      });
      if (e.hideAlternatePlatforms) {
        game.world.hideAlternate(dur || 20000);
        game.effects.add('phased', dur || 20000);
      }
      break;

    case 'teleport_to_water_edge': {
      const dist = e.setWaterDistanceLevels ?? 0.2;
      const target = Math.max(0, Math.ceil(game.water.level + dist));
      game.forcedMoveTo(target, { mode: 'teleport', lethal: true });
      if (e.addToHallOfFame) game.addToHallOfFame(user, ev.gift, count);
      break;
    }

    default:
      game.forcedMove(-1 * count, { lethal: false });
  }
}
