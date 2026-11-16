import { describe, expect, it } from 'vitest';
import {
  ACTS,
  ENEMY_XP_BASE,
  ENEMY_XP_GROWTH,
  projectedDungeonXp,
  projectedStageXp,
} from '../data/acts';
import { dropWeightsFor, rollItem, SLOTS, type DropSource, type Gear } from '../data/gear';
import { DEFAULT_LOADOUT } from '../data/skills';
import type { RarityId } from '../data/types';
import { addXp, MAX_LEVEL, XP_TO_NEXT } from '../data/xp';
import { Game, type RunResult } from './game';
import { mulberry32 } from './rng';
import type { Storage } from './state';

/** Legendary share of a Nightscar / Ascended drop table (pity 0). */
function legShare(source: DropSource): number {
  const w = dropWeightsFor(source, 0);
  const total = w.common + w.rare + w.epic + w.legendary;
  return w.legendary / total;
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

function levelAfterXp(totalXp: number): number {
  const r = addXp(1, 0, totalXp);
  return r.level;
}

/** Cumulative projected XP after clearing acts 1..throughAct (inclusive). */
function cumStageXp(throughAct: number): number {
  let xp = 0;
  for (let act = 1; act <= throughAct; act++) {
    for (let stage = 1; stage <= 5; stage++) xp += projectedStageXp(act, stage);
  }
  return xp;
}

function cumWithDungeonFarms(throughAct: number, farmsPerAct: number): number {
  let xp = cumStageXp(throughAct);
  for (let act = 1; act <= throughAct; act++) xp += projectedDungeonXp(act) * farmsPerAct;
  return xp;
}

describe('XP pacing vs GDD §7.1', () => {
  it('keeps the Lv7 band threshold ref-compatible', () => {
    expect(XP_TO_NEXT[6]).toBe(550);
    expect(XP_TO_NEXT.slice(0, 6).reduce((a, b) => a + b, 0)).toBe(1400);
    expect(MAX_LEVEL).toBe(20);
  });

  it('uses the retuned kill-XP growth (not the old 1.2^tier overshoot)', () => {
    expect(ENEMY_XP_BASE).toBe(1.5);
    expect(ENEMY_XP_GROWTH).toBe(1.055);
    // Act 4 stage-1 trash must be far below the old ~64 XP trash at tier 19.
    expect(projectedStageXp(4, 1)).toBeLessThan(200);
  });

  it('lands ~Lv7 after Act 4 stages (not mid-teens)', () => {
    const lv = levelAfterXp(cumStageXp(4));
    expect(lv).toBeGreaterThanOrEqual(6);
    expect(lv).toBeLessThanOrEqual(8);
  });

  it('reaches mid teens in Acts 7–8 with light dungeon farm', () => {
    const lv7 = levelAfterXp(cumWithDungeonFarms(7, 3));
    const lv8 = levelAfterXp(cumWithDungeonFarms(8, 3));
    expect(lv7).toBeGreaterThanOrEqual(13);
    expect(lv7).toBeLessThanOrEqual(16);
    expect(lv8).toBeGreaterThanOrEqual(14);
    expect(lv8).toBeLessThanOrEqual(18);
  });

  it('reaches Lv20 near Act 10 / Nightscar farm — not mid-campaign', () => {
    expect(levelAfterXp(cumWithDungeonFarms(4, 3))).toBeLessThan(12);
    expect(levelAfterXp(cumWithDungeonFarms(5, 3))).toBeLessThan(14);
    const lv10 = levelAfterXp(cumWithDungeonFarms(10, 3));
    expect(lv10).toBeGreaterThanOrEqual(18);
    expect(lv10).toBe(20);
  });
});

describe('Nightscar clearability without BiS', () => {
  function equipFull(game: Game, level: number, rarity: RarityId, setId: string, seed: number) {
    const rng = mulberry32(seed);
    game.save.level = level;
    game.save.xp = 0;
    const gear: Gear = {};
    for (const slot of SLOTS) {
      gear[slot] = rollItem(rng, {
        slot,
        rarity,
        gearLevel: level,
        setId: setId as 'nightscar-regalia',
      });
    }
    game.save.gear = gear;
    game.save.loadout = [...DEFAULT_LOADOUT.Warrior];
  }

  function clearApex(seed: number, level: number, rarity: RarityId, maxSec = 900) {
    const game = new Game(memoryStorage(), mulberry32(seed));
    game.pickClass('Warrior');
    game.devUnlockThroughAct(10);
    equipFull(game, level, rarity, 'nightscar-regalia', seed + 99);
    game.save.keys = 8;
    const box: { result: RunResult | null } = { result: null };
    game.on((e) => {
      if (e.t === 'result' && e.result.kind === 'dungeon') box.result = e.result;
    });
    expect(game.startDungeon('nightscar-apex')).toBe(true);
    let t = 0;
    const dt = 0.25;
    while (t < maxSec && game.battle) {
      game.tick(dt);
      t += dt;
    }
    return { success: !!box.result?.success, seconds: t, cp: game.cp, timedOut: !!game.battle };
  }

  it('keeps Legendary rarer than Epic on Apex boss (BiS is lucky, not required)', () => {
    const boss = dropWeightsFor('nightscar-boss', 0);
    expect(boss.legendary).toBeLessThan(boss.epic);
    expect(boss.legendary).toBeLessThanOrEqual(10);
    // Floors offer enough Epic weight to assemble a non-BiS clear set.
    expect(dropWeightsFor('nightscar-floor', 0).epic).toBeGreaterThanOrEqual(10);
  });

  it('keeps Ascended Legendary weights above Apex at every tier (DG-88)', () => {
    for (const tier of ['floor', 'mini', 'boss'] as const) {
      const night = dropWeightsFor(`nightscar-${tier}`, 0).legendary;
      const asc = dropWeightsFor(`ascended-${tier}`, 0).legendary;
      expect(asc).toBeGreaterThan(night);
    }
  });

  it('targets ~42% 6pc Legendary Regalia by day 30 for regular raiders (DG-96)', () => {
    // Closed-form base E[Legendary] per clear (pity ignored — dry runs are rare with Epic floors).
    // Apex: 8 floor + 1 mini + 2 boss. Ascended same layout.
    const eApex =
      8 * legShare('nightscar-floor') +
      legShare('nightscar-mini') +
      2 * legShare('nightscar-boss');
    const eAsc =
      8 * legShare('ascended-floor') +
      legShare('ascended-mini') +
      2 * legShare('ascended-boss');
    // Regular raider: 2 Apex/day × 30 + ~6.5 Ascended from Clan Raid seals.
    const eLegs = 2 * 30 * eApex + 6.5 * eAsc;
    // Coupon: 11 slots, need ≥6 unique → ~42% when E[legs] ≈ 7.
    expect(eApex).toBeGreaterThan(0.05);
    expect(eApex).toBeLessThan(0.12);
    expect(eAsc).toBeGreaterThan(eApex * 2);
    expect(eLegs).toBeGreaterThan(6);
    expect(eLegs).toBeLessThan(8.5);
  });

  it('clears Nightscar Apex on a full epic (non-BiS) set at endgame level', () => {
    const runs = [11, 29, 47].map((seed) => clearApex(seed, 19, 'epic'));
    const wins = runs.filter((r) => r.success && !r.timedOut);
    expect(wins.length).toBe(runs.length);
  });

  it('makes Legendary BiS faster than epic on the same Apex clear', () => {
    const epic = clearApex(101, 19, 'epic');
    const legendary = clearApex(101, 19, 'legendary');
    expect(epic.success).toBe(true);
    expect(legendary.success).toBe(true);
    expect(legendary.seconds).toBeLessThan(epic.seconds * 0.85);
    expect(legendary.cp).toBeGreaterThan(epic.cp);
  });

  it('still lists Nightscar Apex as the Act 10 endgame dungeon', () => {
    expect(ACTS[9].dungeon?.id).toBe('nightscar-apex');
    expect(ACTS[9].dungeon?.endgame).toBe(true);
  });
});
