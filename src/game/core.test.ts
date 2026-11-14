import { describe, expect, it } from 'vitest';
import { RARITIES, computeHero, cpDelta, rollItem, salvageValue, starterGear } from '../data/gear';
import { DEFAULT_LOADOUT, isUnlocked } from '../data/skills';
import { addXp, availableSpeeds, maxEnergy, xpToNext } from '../data/xp';
import { Game } from './game';
import { mulberry32 } from './rng';
import { SAVE_KEY, defaultSave, loadSave, writeSave } from './state';
import type { Storage } from './state';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('xp and progression', () => {
  it('levels up across thresholds and carries the remainder', () => {
    const need = xpToNext(1);
    const r = addXp(1, 0, need + 5);
    expect(r.level).toBe(2);
    expect(r.xp).toBe(5);
  });

  it('unlocks speeds and energy by level', () => {
    expect(availableSpeeds(1)).toEqual([1]);
    expect(availableSpeeds(5)).toContain(1.5);
    expect(availableSpeeds(10)).toContain(2);
    expect(maxEnergy(1)).toBe(510);
  });

  it('gates skills by level', () => {
    expect(DEFAULT_LOADOUT.every((id) => isUnlocked(id, 1))).toBe(true);
    expect(isUnlocked('bladestorm', 6)).toBe(false);
    expect(isUnlocked('bladestorm', 7)).toBe(true);
  });
});

describe('gear', () => {
  it('fills all 12 slots with starter gear', () => {
    expect(Object.keys(starterGear())).toHaveLength(12);
  });

  it('rolls higher stats at higher rarity', () => {
    const rng = mulberry32(7);
    const common = rollItem(rng, { gearLevel: 3, rarity: 'common', slot: 'weapon' });
    const epic = rollItem(rng, { gearLevel: 3, rarity: 'epic', slot: 'weapon' });
    expect(epic.stats.atk ?? 0).toBeGreaterThan(common.stats.atk ?? 0);
    expect(RARITIES.epic.salvage.dust).toBeGreaterThan(RARITIES.common.salvage.dust);
    expect(salvageValue(epic)).toEqual(RARITIES.epic.salvage);
  });

  it('reports a positive CP delta for a clear upgrade', () => {
    const gear = starterGear();
    const rng = mulberry32(11);
    const item = rollItem(rng, { gearLevel: 4, rarity: 'rare', slot: 'chest' });
    expect(cpDelta(4, gear, item)).toBeGreaterThan(0);
  });

  it('applies set bonuses at 2 pieces', () => {
    const gear = starterGear();
    const rng = mulberry32(3);
    const base = computeHero(1, gear).cp;
    gear.weapon = rollItem(rng, { gearLevel: 1, rarity: 'common', slot: 'weapon', setId: 'ember-raider' });
    gear.chest = rollItem(rng, { gearLevel: 1, rarity: 'common', slot: 'chest', setId: 'ember-raider' });
    expect(computeHero(1, gear).cp).toBeGreaterThan(base);
  });
});

describe('save', () => {
  it('round-trips through storage', () => {
    const store = memoryStorage();
    const save = defaultSave();
    save.level = 6;
    save.crystals = 42;
    writeSave(store, save);
    const back = loadSave(store);
    expect(back.level).toBe(6);
    expect(back.crystals).toBe(42);
    expect(Object.keys(back.gear)).toHaveLength(12);
  });

  it('falls back to a fresh save on corrupt data', () => {
    const store = memoryStorage();
    store.setItem(SAVE_KEY, '{not json');
    expect(loadSave(store).level).toBe(1);
  });
});

describe('game gear flow', () => {
  it('replace swaps gear and auto-salvages the old piece', () => {
    const game = new Game(memoryStorage(), mulberry32(5));
    const item = rollItem(mulberry32(9), { gearLevel: 1, rarity: 'rare', slot: 'helmet' });
    const info = game.compareFor(item);
    expect(info.current?.slot).toBe('helmet');
    expect(game.equip(item, true)).toBe(true);
    expect(game.save.gear.helmet?.id).toBe(item.id);
    expect(game.save.salvageCount).toBe(1);
  });

  it('refuses gear above hero level', () => {
    const game = new Game(memoryStorage(), mulberry32(5));
    const item = rollItem(mulberry32(9), { gearLevel: 5, rarity: 'rare', slot: 'helmet' });
    expect(game.equip(item, false)).toBe(false);
  });

  it('salvage grants resources', () => {
    const game = new Game(memoryStorage(), mulberry32(5));
    const item = rollItem(mulberry32(9), { gearLevel: 1, rarity: 'epic', slot: 'ring' });
    game.salvage(item);
    expect(game.save.dust).toBeGreaterThan(0);
  });
});
