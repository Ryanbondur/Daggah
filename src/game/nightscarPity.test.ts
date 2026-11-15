import { describe, expect, it } from 'vitest';
import { dropWeightsFor, rollRarity } from '../data/gear';
import { Game } from './game';
import {
  NIGHTSCAR_PITY_MAX,
  applyNightscarSoftPity,
  isNightscarHighTier,
  nextNightscarPity,
  nightscarRunHadHighTier,
  normalizeNightscarPity,
} from './nightscarPity';
import { mulberry32 } from './rng';
import { SAVE_KEY, loadSave, type Storage } from './state';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('Nightscar soft pity helpers', () => {
  it('treats epic/legendary as high-tier success', () => {
    expect(isNightscarHighTier({ rarity: 'common' })).toBe(false);
    expect(isNightscarHighTier({ rarity: 'rare' })).toBe(false);
    expect(isNightscarHighTier({ rarity: 'epic' })).toBe(true);
    expect(isNightscarHighTier({ rarity: 'legendary' })).toBe(true);
    expect(nightscarRunHadHighTier([{ rarity: 'rare' }, { rarity: 'common' }])).toBe(false);
    expect(nightscarRunHadHighTier([{ rarity: 'rare' }, { rarity: 'epic' }])).toBe(true);
  });

  it('ramps pity on dry runs and resets on high-tier', () => {
    expect(nextNightscarPity(0, [{ rarity: 'common' }])).toBe(1);
    expect(nextNightscarPity(3, [{ rarity: 'rare' }, { rarity: 'common' }])).toBe(4);
    expect(nextNightscarPity(7, [{ rarity: 'rare' }])).toBe(8);
    expect(nextNightscarPity(8, [{ rarity: 'common' }])).toBe(NIGHTSCAR_PITY_MAX);
    expect(nextNightscarPity(5, [{ rarity: 'epic' }])).toBe(0);
    expect(nextNightscarPity(8, [{ rarity: 'legendary' }])).toBe(0);
  });

  it('soft-ramps Nightscar weights toward epic/legendary', () => {
    const base = dropWeightsFor('nightscar-boss', 0);
    const mid = applyNightscarSoftPity(base, 4);
    const max = applyNightscarSoftPity(base, NIGHTSCAR_PITY_MAX);

    expect(mid.epic + mid.legendary).toBeGreaterThan(base.epic + base.legendary);
    expect(max.epic + max.legendary).toBeGreaterThan(mid.epic + mid.legendary);
    expect(max.common + max.rare).toBeLessThan(base.common + base.rare);
    // Mass conserved.
    const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum(mid)).toBe(sum(base));
    expect(sum(max)).toBe(sum(base));
  });

  it('ignores pity on non-Nightscar tables', () => {
    expect(dropWeightsFor('dungeon-boss', 8)).toEqual(dropWeightsFor('dungeon-boss', 0));
  });

  it('rolls more chase rarities at full pity (seeded)', () => {
    const samples = 4000;
    const countHigh = (pity: number) => {
      const rng = mulberry32(42);
      let n = 0;
      for (let i = 0; i < samples; i++) {
        const r = rollRarity(rng, 'nightscar-boss', pity);
        if (r === 'epic' || r === 'legendary') n += 1;
      }
      return n;
    };
    expect(countHigh(NIGHTSCAR_PITY_MAX)).toBeGreaterThan(countHigh(0));
  });

  it('normalizes out-of-range pity values', () => {
    expect(normalizeNightscarPity(undefined)).toBe(0);
    expect(normalizeNightscarPity(-3)).toBe(0);
    expect(normalizeNightscarPity(3.9)).toBe(3);
    expect(normalizeNightscarPity(99)).toBe(NIGHTSCAR_PITY_MAX);
  });
});

describe('Nightscar pity on Game clear/sweep + save', () => {
  function prepApex(seed: number, pity: number) {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(seed));
    game.pickClass('Warrior');
    game.save.stagesCleared = 50;
    game.save.keys = 8;
    game.save.dungeons['nightscar-apex'] = { cleared: true, clears: 5 };
    game.save.nightscarPity = pity;
    return { store, game };
  }

  it('persists nightscarPity across reload', () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(1));
    game.pickClass('Warrior');
    game.save.nightscarPity = 3;
    game.persist();
    expect(JSON.parse(store.getItem(SAVE_KEY)!).nightscarPity).toBe(3);
    expect(loadSave(store).nightscarPity).toBe(3);
    expect(new Game(store, mulberry32(2)).save.nightscarPity).toBe(3);
  });

  it('sweepDungeon increments pity on dry Apex loot', () => {
    let found = false;
    for (let seed = 0; seed < 200 && !found; seed++) {
      const { store, game } = prepApex(seed, 2);
      let dry = false;
      game.on((ev) => {
        if (ev.t === 'result' && ev.result.kind === 'dungeon') {
          dry = !nightscarRunHadHighTier(ev.result.loot);
        }
      });
      expect(game.sweepDungeon('nightscar-apex')).toBe(true);
      if (!dry) continue;
      expect(game.save.nightscarPity).toBe(3);
      game.persist();
      expect(loadSave(store).nightscarPity).toBe(3);
      found = true;
    }
    expect(found).toBe(true);
  });

  it('sweepDungeon resets pity when Apex loot has epic/legendary', () => {
    let found = false;
    for (let seed = 0; seed < 200 && !found; seed++) {
      const { store, game } = prepApex(seed, 5);
      let hadHigh = false;
      game.on((ev) => {
        if (ev.t === 'result' && ev.result.kind === 'dungeon') {
          hadHigh = nightscarRunHadHighTier(ev.result.loot);
        }
      });
      expect(game.sweepDungeon('nightscar-apex')).toBe(true);
      if (!hadHigh) continue;
      expect(game.save.nightscarPity).toBe(0);
      game.persist();
      expect(loadSave(store).nightscarPity).toBe(0);
      found = true;
    }
    expect(found).toBe(true);
  });

  it('does not touch pity for non-endgame dungeons', () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(3));
    game.pickClass('Warrior');
    game.save.stagesCleared = 50;
    game.save.keys = 8;
    game.save.dungeons['hollow-crypt'] = { cleared: true, clears: 5 };
    game.save.nightscarPity = 6;

    expect(game.sweepDungeon('hollow-crypt')).toBe(true);
    expect(game.save.nightscarPity).toBe(6);
  });
});
