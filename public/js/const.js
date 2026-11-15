export const W = 1080;
export const H = 1920;
export const LEVEL_H = 100;      // vertical distance between platform rows (1 "level")
export const PLAT_H = 22;

export const PLAYER = { w: 54, h: 74 };

export const PHYS = {
  gravity: 2600,
  jumpV: 1100,          // apex ≈ 232px ≈ 2.3 levels
  accel: 5600,
  maxSpeed: 540,
  dampGround: 14,
  dampAir: 2.2,
  dampSlippery: 0.8,
  accelSlippery: 1900,
  maxSpeedSlippery: 700,
};

export const WATER = {
  baseRate: 0.09,        // levels / second at the start
  ratePerLevel: 0.0045,  // extra rate per best level reached in the round
  maxRate: 0.65,
  catchupGap: 18,        // if the player is this many levels above the water…
  catchupMul: 2.8,       // …the water speeds up (≈1.8 lvl/s, slightly faster than the bot climbs)
  startLevel: -1.2,      // where the water starts each round
};

export const AI_REACH = { 1: 330, 2: 190 };   // horizontal reach (px) per levels jumped (apex ≈ 2.3 levels, so 3 is impossible)

export const COLORS = {
  sky0: '#0b1030', sky1: '#1d2b64', sky2: '#4a79d6', sky3: '#9fd3ff',
  platform: '#3ddc84', platformDark: '#1e8f52', platformSide: '#7a4a2a',
  ice: '#bfeeff', iceDark: '#67c7ea',
  water: '#1e90ff', waterDeep: '#0a2a7a', foam: '#e6f7ff',
  hud: '#ffffff', accent: '#ffcc00', danger: '#ff3b5c', ok: '#3ddc84', info: '#4fc3f7',
};
