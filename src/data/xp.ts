import type { Stats } from './types';
import { emptyStats } from './types';

/** XP needed to go from level N to N+1 (index = N - 1). GDD §7.1. */
export const XP_TO_NEXT = [
  100, 140, 180, 240, 320, 420, 550, 650, 750, 900, 1050, 1200, 1400, 1600, 1800, 2100, 2400, 2800,
  3200,
];

export const MAX_LEVEL = 20;

export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return XP_TO_NEXT[level - 1];
}

export interface XpResult {
  level: number;
  xp: number;
  levelsGained: number;
}

export function addXp(level: number, xp: number, gain: number): XpResult {
  let lv = level;
  let cur = xp + gain;
  let gained = 0;
  while (lv < MAX_LEVEL && cur >= xpToNext(lv)) {
    cur -= xpToNext(lv);
    lv += 1;
    gained += 1;
  }
  if (lv >= MAX_LEVEL) cur = 0;
  return { level: lv, xp: cur, levelsGained: gained };
}

/** Warrior base stats at Lv1 and growth per level. GDD §7.2. */
const WARRIOR_BASE = { atk: 20, def: 15, hp: 220 };
const WARRIOR_GROWTH = { atk: 4, def: 3, hp: 45 };

export function heroBaseStats(level: number): Stats {
  const s = emptyStats();
  const n = level - 1;
  s.atk = WARRIOR_BASE.atk + WARRIOR_GROWTH.atk * n;
  s.def = WARRIOR_BASE.def + WARRIOR_GROWTH.def * n;
  s.hp = WARRIOR_BASE.hp + WARRIOR_GROWTH.hp * n;
  s.critRate = 5;
  s.critDmg = 0;
  s.energyRegen = 0;
  return s;
}

export function maxEnergy(level: number): number {
  return 500 + level * 10;
}

/** Battle speed unlocks. GDD §4.7. */
export function availableSpeeds(level: number): number[] {
  const speeds = [1];
  if (level >= 5) speeds.push(1.5);
  if (level >= 10) speeds.push(2);
  return speeds;
}
