import { describe, expect, it } from 'vitest';
import {
  DROP_SET_IDS,
  RARITIES,
  SETS,
  SET_SLOTS,
  rollItem,
  setAllowedForClass,
} from '../data/gear';
import { CLASS_ARMOR_TYPE, isArmorSlot } from '../data/armor';
import { CLASS_WEAPON_TYPE } from '../data/weapons';
import type { SetId, SlotId } from '../data/types';
import { mulberry32 } from './rng';
import { Game } from './game';
import {
  CRAFTABLE_RARITIES,
  DUST_PER_CRYSTAL_REFINE,
  DUST_SOFT_CAP,
  craftDustCost,
  craftRarityForCape,
  craftRarityForSet,
  craftableSetsForClass,
  legendaryCraftUnlocked,
  ownsSetPiece,
  planCraftMissing,
  refineDustAmount,
  refinePreview,
} from './craft';
import { SAVE_KEY, type Storage } from './state';

function memStore(seed: Record<string, string> = {}): Storage {
  const data = { ...seed };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe('craftDustCost', () => {
  it('is always higher than salvage dust return', () => {
    for (const rarity of CRAFTABLE_RARITIES) {
      for (const gl of [1, 5, 10, 20]) {
        const salvage = RARITIES[rarity].salvage.dust;
        const plain = craftDustCost({ rarity, gearLevel: gl });
        const set = craftDustCost({ rarity, gearLevel: gl, setId: 'ember-raider' });
        expect(plain).toBeGreaterThan(salvage);
        expect(set).toBeGreaterThan(plain);
        expect(set).toBeGreaterThanOrEqual(salvage + 1);
      }
    }
  });

  it('scales Common < Rare < Epic < Legendary and with gear level', () => {
    const gl = 10;
    const c = craftDustCost({ rarity: 'common', gearLevel: gl, setId: 'ember-raider' });
    const r = craftDustCost({ rarity: 'rare', gearLevel: gl, setId: 'ember-raider' });
    const e = craftDustCost({ rarity: 'epic', gearLevel: gl, setId: 'ember-raider' });
    const l = craftDustCost({ rarity: 'legendary', gearLevel: gl, setId: 'ember-raider' });
    expect(c).toBeLessThan(r);
    expect(r).toBeLessThan(e);
    expect(e).toBeLessThan(l);
    expect(craftDustCost({ rarity: 'rare', gearLevel: 20, setId: 'ember-raider' })).toBeGreaterThan(
      craftDustCost({ rarity: 'rare', gearLevel: 1, setId: 'ember-raider' }),
    );
  });

  it('prices Legendary set crafts as a steep late-game sink', () => {
    // salvage 100 × 10 × 1.5 × 2.9 × 2.5 = 10875
    expect(craftDustCost({ rarity: 'legendary', gearLevel: 20, setId: 'nightscar-regalia' })).toBe(
      10875,
    );
  });

  it('prices capes above epic set pieces of the same gear level', () => {
    const epicSet = craftDustCost({ rarity: 'epic', gearLevel: 14, setId: 'ember-raider' });
    const cape = craftDustCost({ rarity: 'epic', gearLevel: 14, cape: true });
    expect(cape).toBeGreaterThan(epicSet);
  });

  it('anchors early rare and late epic set costs', () => {
    // salvage 15 × 5 × 1.5 × 1.0 = 112.5 → 113
    expect(craftDustCost({ rarity: 'rare', gearLevel: 1, setId: 'ember-raider' })).toBe(113);
    // salvage 40 × 6 × 1.5 × (1 + 19*0.1) = 40*6*1.5*2.9 = 1044
    expect(craftDustCost({ rarity: 'epic', gearLevel: 20, setId: 'nightscar-regalia' })).toBe(1044);
  });
});

describe('craft catalog', () => {
  it('filters sets by class and excludes Clanforged', () => {
    const warrior = craftableSetsForClass('Warrior', 10);
    expect(warrior).not.toContain('clanforged');
    expect(warrior).toContain('ember-raider');
    expect(warrior).toContain('cavern-cleaver');
    expect(warrior).not.toContain('ashen-codex'); // Mage Inferno
    expect(warrior).not.toContain('quillstorm'); // Ranger
    expect(warrior).not.toContain('nightfang'); // Rogue

    const mage = craftableSetsForClass('Mage', 4);
    expect(mage).toContain('ashen-codex');
    expect(mage).not.toContain('cavern-cleaver');
    expect(mage.every((id) => SETS[id].act <= 4)).toBe(true);
  });

  it('picks rare then epic by act, never legendary by default', () => {
    expect(craftRarityForSet('ember-raider')).toBe('rare');
    expect(craftRarityForSet('cinderstride')).toBe('epic');
    expect(craftRarityForSet('nightscar-regalia')).toBe('epic');
    for (const id of DROP_SET_IDS) {
      expect(CRAFTABLE_RARITIES).toContain(craftRarityForSet(id));
    }
  });

  it('unlocks Legendary crafts at Act 8', () => {
    expect(legendaryCraftUnlocked(7)).toBe(false);
    expect(legendaryCraftUnlocked(8)).toBe(true);
  });

  it('assigns cape craft rarity by minAct', () => {
    expect(craftRarityForCape('bulwark-mantle')).toBe('epic');
    expect(craftRarityForCape('warlords-drape')).toBe('legendary');
  });

  it('tracks owned equipped vs bag', () => {
    const rng = mulberry32(3);
    const piece = rollItem(rng, {
      gearLevel: 3,
      rarity: 'rare',
      slot: 'helmet',
      setId: 'ember-raider',
      heroClass: 'Warrior',
    });
    expect(ownsSetPiece('ember-raider', 'helmet', { helmet: piece }, [])).toBe('equipped');
    expect(ownsSetPiece('ember-raider', 'helmet', {}, [piece])).toBe('bag');
    expect(ownsSetPiece('ember-raider', 'helmet', {}, [])).toBe('none');
  });

  it('plans craft-missing within dust budget', () => {
    const plan = planCraftMissing({
      heroClass: 'Warrior',
      setId: 'ember-raider',
      gearLevel: 4,
      dust: 300,
      gear: {},
      bag: [],
    });
    expect('error' in plan).toBe(false);
    if ('error' in plan) return;
    expect(plan.slots).toHaveLength(SET_SLOTS.length);
    expect(plan.affordableSlots.length).toBeGreaterThan(0);
    expect(plan.affordableSlots.length).toBeLessThan(plan.slots.length);
    expect(plan.affordableDust).toBeLessThanOrEqual(300);
  });
});

describe('dust soft-cap refine', () => {
  it('reports no excess under the soft cap', () => {
    const p = refinePreview(DUST_SOFT_CAP);
    expect(p.excess).toBe(0);
    expect(p.maxCrystals).toBe(0);
  });

  it('converts excess dust to crystals at the sink rate', () => {
    const excess = DUST_PER_CRYSTAL_REFINE * 3 + 10;
    const dust = DUST_SOFT_CAP + excess;
    const p = refinePreview(dust);
    expect(p.excess).toBe(excess);
    expect(p.maxCrystals).toBe(3);
    const ok = refineDustAmount(dust, 2);
    expect(ok).toEqual({ dustSpent: DUST_PER_CRYSTAL_REFINE * 2, crystals: 2 });
    expect(refineDustAmount(DUST_SOFT_CAP, 1)).toMatchObject({ error: expect.any(String) });
  });
});

describe('Game.craftSetPiece', () => {
  it('spends dust and queues a class-typed set piece', () => {
    const store = memStore();
    const game = new Game(store, mulberry32(99));
    game.pickClass('Ranger');
    game.save.level = 8;
    game.save.stagesCleared = 25; // Act 6 unlocked
    game.save.dust = 500;
    const before = game.save.dust;
    const setId: SetId = 'quillstorm';
    const slot: SlotId = 'weapon';
    const cost = craftDustCost({
      rarity: craftRarityForSet(setId),
      gearLevel: 8,
      setId,
    });
    const err = game.craftSetPiece(setId, slot);
    expect(err).toBeNull();
    expect(game.save.dust).toBe(before - cost);
    const crafted = game.save.pending[0];
    expect(crafted).toBeTruthy();
    expect(crafted.setId).toBe(setId);
    expect(crafted.slot).toBe(slot);
    expect(crafted.weaponType).toBe(CLASS_WEAPON_TYPE.Ranger);
    expect(crafted.rarity).toBe('rare'); // Act 5 → rare craft tier
  });

  it('blocks wrong-class sets and unaffordable crafts', () => {
    const game = new Game(memStore(), mulberry32(5));
    game.pickClass('Warrior');
    game.save.dust = 0;
    expect(game.craftSetPiece('ashen-codex', 'chest')).toMatch(/Wrong class/);
    game.save.dust = 1;
    game.save.stagesCleared = 0;
    const need = game.craftSetPiece('ember-raider', 'ring');
    expect(need).toMatch(/Need \d+ dust/);
  });

  it('routes capes to cape craft and blocks Clanforged', () => {
    const game = new Game(memStore(), mulberry32(6));
    game.pickClass('Warrior');
    game.save.dust = 99999;
    game.save.stagesCleared = 50;
    expect(game.craftSetPiece('ember-raider', 'cape')).toMatch(/cape craft/i);
    expect(game.craftSetPiece('clanforged', 'weapon')).toMatch(/not craftable/);
  });

  it('crafts Legendary set pieces after Act 8', () => {
    const game = new Game(memStore(), mulberry32(11));
    game.pickClass('Warrior');
    game.save.level = 18;
    game.save.stagesCleared = 20; // Act 5 — too early
    game.save.dust = 999999;
    expect(game.craftSetPiece('ember-raider', 'weapon', true)).toMatch(/Act 8/);
    game.save.stagesCleared = 40; // Act 9
    expect(game.legendaryCraftAvailable()).toBe(true);
    expect(game.craftSetPiece('ember-raider', 'weapon', true)).toBeNull();
    expect(game.save.pending[0]?.rarity).toBe('legendary');
  });

  it('one-tap crafts missing pieces within dust', () => {
    const game = new Game(memStore(), mulberry32(21));
    game.pickClass('Warrior');
    game.save.level = 5;
    game.save.stagesCleared = 5;
    const unit = craftDustCost({ rarity: 'rare', gearLevel: 5, setId: 'ember-raider' });
    game.save.dust = unit * 3 + 10;
    const result = game.craftMissingForSet('ember-raider');
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.crafted).toBe(3);
    expect(game.save.pending).toHaveLength(3);
    expect(game.save.dust).toBe(10);
  });

  it('crafts class capes with real capeIds', () => {
    const game = new Game(memStore(), mulberry32(33));
    game.pickClass('Mage');
    game.save.level = 16;
    game.save.stagesCleared = 40; // Act 9
    game.save.dust = 50000;
    const offers = game.craftCapeOffers();
    expect(offers).toHaveLength(3);
    expect(offers.every((o) => o.unlocked)).toBe(true);
    expect(game.craftCape('ashveil-cloak')).toBeNull();
    const item = game.save.pending[0];
    expect(item.capeId).toBe('ashveil-cloak');
    expect(item.slot).toBe('cape');
    expect(game.craftCape('bulwark-mantle')).toMatch(/Wrong class/);
  });

  it('refines excess dust into crystals', () => {
    const game = new Game(memStore(), mulberry32(44));
    game.pickClass('Ranger');
    game.save.dust = DUST_SOFT_CAP + DUST_PER_CRYSTAL_REFINE * 4;
    game.save.crystals = 1;
    const result = game.refineExcessDust();
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.crystals).toBe(4);
    expect(game.save.crystals).toBe(5);
    expect(game.save.dust).toBe(DUST_SOFT_CAP);
    expect(game.refineExcessDust()).toMatch(/soft cap/i);
  });

  it('persists crafted armor types for the hero class', () => {
    const store = memStore();
    const game = new Game(store, mulberry32(12));
    game.pickClass('Mage');
    game.save.level = 10;
    game.save.stagesCleared = 20;
    game.save.dust = 2000;
    expect(game.craftSetPiece('ashen-codex', 'chest')).toBeNull();
    const item = game.save.pending[0];
    expect(item.armorType).toBe(CLASS_ARMOR_TYPE.Mage);
    expect(isArmorSlot(item.slot)).toBe(true);
    // Accept into bag via replace path simulation
    game.save.bag.push(item);
    game.save.pending = [];
    game.persist();
    const raw = JSON.parse(store.getItem(SAVE_KEY)!) as { bag: typeof game.save.bag; dust: number };
    expect(raw.bag.some((it) => it.setId === 'ashen-codex' && it.slot === 'chest')).toBe(true);
    expect(raw.dust).toBe(game.save.dust);
  });

  it('lists only allowed unlocked sets', () => {
    const game = new Game(memStore(), mulberry32(1));
    game.pickClass('Rogue');
    game.save.stagesCleared = 0; // Act 1
    const early = game.craftableSets();
    expect(early.every((id) => setAllowedForClass(id, 'Rogue'))).toBe(true);
    expect(early.every((id) => SETS[id].act <= 1)).toBe(true);
    expect(early).toContain('ember-raider');
    expect(early).not.toContain('gloomveil');

    game.save.stagesCleared = 35; // Act 8
    const late = game.craftableSets();
    expect(late).toContain('gloomveil');
    expect(late).not.toContain('cavern-cleaver');
  });

  it('craftOffersForSet marks owned and affordability', () => {
    const game = new Game(memStore(), mulberry32(8));
    game.pickClass('Warrior');
    game.save.level = 4;
    game.save.stagesCleared = 5;
    game.save.dust = 50;
    const piece = rollItem(mulberry32(2), {
      gearLevel: 4,
      rarity: 'rare',
      slot: 'boots',
      setId: 'ember-raider',
      heroClass: 'Warrior',
    });
    game.save.gear.boots = piece;
    const offers = game.craftOffersForSet('ember-raider');
    expect(Array.isArray(offers)).toBe(true);
    if (!Array.isArray(offers)) return;
    expect(offers).toHaveLength(SET_SLOTS.length);
    const boots = offers.find((o) => o.slot === 'boots');
    expect(boots?.owned).toBe('equipped');
    expect(offers.every((o) => o.dustCost > RARITIES[o.rarity].salvage.dust)).toBe(true);
    // Low dust → many unaffordable
    expect(offers.some((o) => !o.affordable)).toBe(true);
  });
});
