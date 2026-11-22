import type { HeroClass, Stats } from './types';
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

/** Base stats at Lv1 and growth per level. GDD §7.2. */
const CLASS_STATS: Record<HeroClass, { base: { atk: number; def: number; hp: number }; growth: { atk: number; def: number; hp: number } }> =
  {
    Warrior: { base: { atk: 20, def: 15, hp: 220 }, growth: { atk: 4, def: 3, hp: 45 } },
    Mage: { base: { atk: 24, def: 8, hp: 160 }, growth: { atk: 5, def: 1, hp: 28 } },
    Ranger: { base: { atk: 22, def: 10, hp: 180 }, growth: { atk: 4.5, def: 2, hp: 32 } },
    // Rogue: slight ATK lean vs Ranger; clear-CP parity tuned in combat skill mults (cpGating).
    Rogue: { base: { atk: 24, def: 9, hp: 170 }, growth: { atk: 5.2, def: 1.5, hp: 30 } },
  };

export function heroBaseStats(level: number, heroClass: HeroClass = 'Warrior'): Stats {
  const s = emptyStats();
  const n = level - 1;
  const { base, growth } = CLASS_STATS[heroClass];
  s.atk = Math.round(base.atk + growth.atk * n);
  s.def = Math.round(base.def + growth.def * n);
  s.hp = Math.round(base.hp + growth.hp * n);
  s.critRate = heroClass === 'Rogue' ? 10 : heroClass === 'Ranger' ? 7 : 5;
  s.critDmg = heroClass === 'Rogue' ? 18 : 0;
  s.skillPower = heroClass === 'Mage' ? 5 : 0;
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

export const CLASS_BLURB: Record<HeroClass, string> = {
  Warrior: 'Stout melee bruiser. Axes and iron will.',
  Mage: 'Arcane caster. AoE burst and control.',
  Ranger: 'Ranged hunter. Sustained DPS and kiting.',
  Rogue: 'Shadow striker. Single-target burst and execute.',
};
