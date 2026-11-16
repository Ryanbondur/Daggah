import { describe, expect, it } from 'vitest';
import { CAPE_IDS, CAPES, capePoolFor, dungeonAllowsCapes } from '../data/capes';
import {
  SET_SLOTS,
  SLOTS,
  capeDropChance,
  computeHero,
  computeSetEffects,
  itemAllowedForClass,
  lootCompareHighlight,
  rollCape,
  rollItem,
  starterGear,
  unequipWrongClassGear,
} from '../data/gear';
import type { CapeId, Item } from '../data/types';
import { Game } from './game';
import { mulberry32 } from './rng';
import { SAVE_KEY, SAVE_VERSION, type Storage } from './state';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('class capes', () => {
  it('defines 12 unique capes (3 per class)', () => {
    expect(CAPE_IDS).toHaveLength(12);
    const byClass = { Warrior: 0, Mage: 0, Ranger: 0, Rogue: 0 };
    for (const id of CAPE_IDS) byClass[CAPES[id].heroClass] += 1;
    expect(byClass).toEqual({ Warrior: 3, Mage: 3, Ranger: 3, Rogue: 3 });
  });

  it('exposes cape as the 12th slot but starter gear leaves it empty', () => {
    expect(SLOTS).toContain('cape');
    expect(SLOTS).toHaveLength(12);
    expect(SET_SLOTS).not.toContain('cape');
    const gear = starterGear('Warrior');
    expect(gear.cape).toBeUndefined();
    expect(Object.keys(gear)).toHaveLength(11);
  });

  it('gates cape pools by act and class', () => {
    expect(capePoolFor('Warrior', 6)).toHaveLength(0);
    expect(capePoolFor('Warrior', 7).map((id) => CAPES[id].name)).toContain('Bulwark Mantle');
    expect(capePoolFor('Warrior', 8)).toHaveLength(2);
    expect(capePoolFor('Warrior', 9)).toHaveLength(3);
    expect(capePoolFor('Mage', 10).every((id) => CAPES[id].heroClass === 'Mage')).toBe(true);
    expect(dungeonAllowsCapes(6)).toBe(false);
    expect(dungeonAllowsCapes(7)).toBe(true);
    expect(dungeonAllowsCapes(5, true)).toBe(true);
  });

  it('rolls class-locked capes without setId', () => {
    const item = rollCape(mulberry32(42), {
      gearLevel: 14,
      rarity: 'epic',
      heroClass: 'Ranger',
      actId: 8,
      capeId: 'deadeye-shroud',
    });
    expect(item).not.toBeNull();
    expect(item!.slot).toBe('cape');
    expect(item!.capeId).toBe('deadeye-shroud');
    expect(item!.setId).toBeUndefined();
    expect(item!.name).toBe('Deadeye Shroud');
    expect(itemAllowedForClass(item!, 'Ranger')).toBe(true);
    expect(itemAllowedForClass(item!, 'Warrior')).toBe(false);
  });

  it('never creates capes via rollItem random slot picks', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 40; i++) {
      const it = rollItem(rng, { gearLevel: 12, rarity: 'rare' });
      expect(it.slot).not.toBe('cape');
      expect(it.capeId).toBeUndefined();
    }
  });

  it('applies unique cape effects into combat effect bag (not set counts)', () => {
    const gear = starterGear('Warrior');
    const cape = rollCape(mulberry32(1), {
      gearLevel: 14,
      rarity: 'epic',
      heroClass: 'Warrior',
      actId: 7,
      capeId: 'bulwark-mantle',
    })!;
    gear.cape = cape;
    const fx = computeSetEffects(gear);
    expect(fx.dmgTakenReductionPct).toBe(10);
    expect(fx.absorbPct).toBeGreaterThanOrEqual(15);
    expect(computeHero(14, gear, 'Warrior').effects.dmgTakenReductionPct).toBe(10);
  });

  it('rejects wrong-class cape equip and unequips on load', () => {
    const storage = memoryStorage();
    const game = new Game(storage, mulberry32(3));
    game.pickClass('Warrior');
    expect(game.save.heroClass).toBe('Warrior');
    const mageCape = rollCape(mulberry32(4), {
      gearLevel: 1,
      rarity: 'rare',
      heroClass: 'Mage',
      actId: 7,
      capeId: 'ashveil-cloak',
    })!;
    expect(game.equip(mageCape, false)).toBe(false);
    expect(game.save.gear.cape).toBeUndefined();

    const wrong: Item = { ...mageCape, id: 'legacy_cape' };
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        ...game.save,
        version: SAVE_VERSION,
        classPicked: true,
        heroClass: 'Warrior',
        gear: { ...game.save.gear, cape: wrong },
        bag: [],
      }),
    );
    const reloaded = new Game(storage, mulberry32(5));
    expect(reloaded.save.gear.cape).toBeUndefined();
    expect(reloaded.save.bag.some((i) => i.capeId === 'ashveil-cloak')).toBe(true);
  });

  it('unequipWrongClassGear moves wrong-class cape to bag', () => {
    const gear = starterGear('Warrior');
    const cape = rollCape(mulberry32(6), {
      gearLevel: 12,
      rarity: 'rare',
      heroClass: 'Rogue',
      actId: 7,
      capeId: 'nightstalker-cape',
    })!;
    gear.cape = cape;
    const { gear: next, bag, moved } = unequipWrongClassGear(gear, [], 'Warrior');
    expect(next.cape).toBeUndefined();
    expect(moved).toHaveLength(1);
    expect(bag[0]?.capeId).toBe('nightstalker-cape');
  });

  it('BiS highlight never upgrades wrong-class cape', () => {
    const gear = starterGear('Warrior');
    const cape = rollCape(mulberry32(7), {
      gearLevel: 1,
      rarity: 'legendary',
      heroClass: 'Ranger',
      actId: 9,
      capeId: 'hawkflight-mantle',
    })!;
    const hl = lootCompareHighlight(20, gear, cape, 'Warrior');
    expect(hl.upgrade).toBe(false);
    expect(hl.badge).toBeNull();
  });

  it('cape drop chances are non-zero for dungeon sources only', () => {
    expect(capeDropChance('dungeon-floor')).toBeGreaterThan(0);
    expect(capeDropChance('nightscar-boss')).toBeGreaterThan(capeDropChance('dungeon-floor'));
    expect(capeDropChance('stage-elite')).toBe(0);
  });

  it('each cape effect text is distinct within a class', () => {
    for (const cls of ['Warrior', 'Mage', 'Ranger', 'Rogue'] as const) {
      const texts = CAPE_IDS.filter((id) => CAPES[id].heroClass === cls).map(
        (id) => CAPES[id as CapeId].effectText,
      );
      expect(new Set(texts).size).toBe(3);
    }
  });
});
