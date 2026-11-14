import { describe, expect, it } from 'vitest';
import { RARITIES, computeHero, cpDelta, rollItem, salvageValue, starterGear } from '../data/gear';
import { DEFAULT_LOADOUT, isUnlocked } from '../data/skills';
import { addXp, availableSpeeds, heroBaseStats, maxEnergy, xpToNext } from '../data/xp';
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
    expect(DEFAULT_LOADOUT.Warrior.every((id) => isUnlocked(id, 1))).toBe(true);
    expect(isUnlocked('bladestorm', 6)).toBe(false);
    expect(isUnlocked('bladestorm', 7)).toBe(true);
    expect(isUnlocked('meteor', 8)).toBe(true);
    expect(isUnlocked('kill-shot', 15)).toBe(true);
  });

  it('gives distinct base stats per class', () => {
    const w = heroBaseStats(1, 'Warrior');
    const m = heroBaseStats(1, 'Mage');
    expect(m.atk).toBeGreaterThan(w.atk);
    expect(m.hp).toBeLessThan(w.hp);
  });
});

describe('gear', () => {
  it('fills all 12 slots with starter gear', () => {
    expect(Object.keys(starterGear('Ranger'))).toHaveLength(12);
    expect(starterGear('Mage').weapon?.name).toContain('Staff');
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
    expect(cpDelta(4, gear, item, 'Warrior')).toBeGreaterThan(0);
  });

  it('applies set bonuses at 2 pieces including Gravemarch', () => {
    const gear = starterGear();
    const rng = mulberry32(3);
    const base = computeHero(1, gear, 'Warrior').cp;
    gear.weapon = rollItem(rng, { gearLevel: 1, rarity: 'common', slot: 'weapon', setId: 'ember-raider' });
    gear.chest = rollItem(rng, { gearLevel: 1, rarity: 'common', slot: 'chest', setId: 'ember-raider' });
    expect(computeHero(1, gear, 'Warrior').cp).toBeGreaterThan(base);
    gear.belt = rollItem(rng, { gearLevel: 5, rarity: 'rare', slot: 'belt', setId: 'gravemarch' });
    gear.helmet = rollItem(rng, { gearLevel: 5, rarity: 'rare', slot: 'helmet', setId: 'gravemarch' });
    expect(computeHero(5, gear, 'Warrior').effects.defPct).toBeGreaterThanOrEqual(6);
  });

  it('applies Act 5-6 set bonuses (Quillstorm, Deadeye, Cinderstride)', () => {
    const gear = starterGear('Ranger');
    const rng = mulberry32(21);
    gear.weapon = rollItem(rng, { gearLevel: 9, rarity: 'rare', slot: 'weapon', setId: 'quillstorm' });
    gear.chest = rollItem(rng, { gearLevel: 9, rarity: 'rare', slot: 'chest', setId: 'quillstorm' });
    expect(computeHero(9, gear, 'Ranger').effects.aoePct).toBeGreaterThanOrEqual(8);
    gear.belt = rollItem(rng, { gearLevel: 9, rarity: 'rare', slot: 'belt', setId: 'deadeye' });
    gear.helmet = rollItem(rng, { gearLevel: 9, rarity: 'rare', slot: 'helmet', setId: 'deadeye' });
    expect(computeHero(9, gear, 'Ranger').effects.critRatePct).toBeGreaterThanOrEqual(6);
    gear.gloves = rollItem(rng, { gearLevel: 11, rarity: 'epic', slot: 'gloves', setId: 'cinderstride' });
    gear.boots = rollItem(rng, { gearLevel: 11, rarity: 'epic', slot: 'boots', setId: 'cinderstride' });
    const fx = computeHero(11, gear, 'Ranger').effects;
    expect(fx.hastePct).toBeGreaterThanOrEqual(6);
  });

  it('applies Act 7-8 set bonuses (Nightfang, Gloomveil, Echoplate)', () => {
    const gear = starterGear('Rogue');
    const rng = mulberry32(33);
    const shadowdance = ['shadowstep', 'smoke-bomb', 'flurry', 'cloak-of-shadows'] as const;
    gear.weapon = rollItem(rng, { gearLevel: 13, rarity: 'rare', slot: 'weapon', setId: 'nightfang' });
    gear.chest = rollItem(rng, { gearLevel: 13, rarity: 'rare', slot: 'chest', setId: 'nightfang' });
    expect(computeHero(13, gear, 'Rogue').effects.critDmgPct).toBeGreaterThanOrEqual(10);
    gear.belt = rollItem(rng, { gearLevel: 13, rarity: 'rare', slot: 'belt', setId: 'gloomveil' });
    gear.helmet = rollItem(rng, { gearLevel: 13, rarity: 'rare', slot: 'helmet', setId: 'gloomveil' });
    gear.gloves = rollItem(rng, { gearLevel: 13, rarity: 'epic', slot: 'gloves', setId: 'gloomveil' });
    gear.boots = rollItem(rng, { gearLevel: 13, rarity: 'epic', slot: 'boots', setId: 'gloomveil' });
    const gloom = computeHero(13, gear, 'Rogue', [...shadowdance]).effects;
    expect(gloom.hastePct).toBeGreaterThanOrEqual(8);
    expect(gloom.shadowstepCharges).toBeGreaterThanOrEqual(1);
    gear.shoulders = rollItem(rng, { gearLevel: 15, rarity: 'epic', slot: 'shoulders', setId: 'echoplate' });
    gear.legs = rollItem(rng, { gearLevel: 15, rarity: 'epic', slot: 'legs', setId: 'echoplate' });
    const echo = computeHero(15, gear, 'Rogue').effects;
    expect(echo.atkPct).toBeGreaterThanOrEqual(7);
  });

  it('gates playstyle set 4/6 bonuses on committed loadout', () => {
    const gear = starterGear('Warrior');
    const rng = mulberry32(9);
    for (const slot of ['weapon', 'chest', 'belt', 'helmet'] as const) {
      gear[slot] = rollItem(rng, { gearLevel: 7, rarity: 'rare', slot, setId: 'cavern-cleaver' });
    }
    const mixed = computeHero(7, gear, 'Warrior', ['cleave', 'shield-bash']).effects;
    expect(mixed.aoePct).toBeGreaterThanOrEqual(8);
    expect(mixed.skillCdMinus.whirlwind ?? 0).toBe(0);
    expect(mixed.atkPct).toBe(0);
    const blade = computeHero(7, gear, 'Warrior', ['cleave', 'whirlwind', 'bladestorm', 'war-banner']).effects;
    expect(blade.aoePct).toBeGreaterThanOrEqual(12);
    expect(blade.atkPct).toBeGreaterThanOrEqual(18);
    expect(blade.skillCdMinus.whirlwind).toBe(3);
    // Same Cleaver pieces: committed Bladestorm bar beats mixed bar on CP.
    const matchedCp = computeHero(7, gear, 'Warrior', ['cleave', 'whirlwind', 'bladestorm', 'war-banner']).cp;
    const mixedCp = computeHero(7, gear, 'Warrior', ['cleave', 'shield-bash']).cp;
    expect(matchedCp).toBeGreaterThan(mixedCp);
  });

  it('applies Act 9-10 set bonuses (Voidwoven, Nightscar Regalia)', () => {
    const gear = starterGear('Warrior');
    const rng = mulberry32(44);
    gear.weapon = rollItem(rng, { gearLevel: 17, rarity: 'epic', slot: 'weapon', setId: 'voidwoven' });
    gear.chest = rollItem(rng, { gearLevel: 17, rarity: 'epic', slot: 'chest', setId: 'voidwoven' });
    const void2 = computeHero(17, gear, 'Warrior').effects;
    expect(void2.atkPct).toBeGreaterThanOrEqual(9);
    expect(void2.defPct).toBeGreaterThanOrEqual(9);
    expect(void2.hpPct).toBeGreaterThanOrEqual(9);
    gear.belt = rollItem(rng, { gearLevel: 17, rarity: 'epic', slot: 'belt', setId: 'voidwoven' });
    gear.helmet = rollItem(rng, { gearLevel: 17, rarity: 'epic', slot: 'helmet', setId: 'voidwoven' });
    expect(computeHero(17, gear, 'Warrior').effects.critDmgPct).toBeGreaterThanOrEqual(10);
    gear.gloves = rollItem(rng, { gearLevel: 17, rarity: 'legendary', slot: 'gloves', setId: 'voidwoven' });
    gear.boots = rollItem(rng, { gearLevel: 17, rarity: 'legendary', slot: 'boots', setId: 'voidwoven' });
    expect(computeHero(17, gear, 'Warrior').effects.ultimateCostPct).toBeGreaterThanOrEqual(10);
    const night: typeof gear = {};
    night.weapon = rollItem(rng, { gearLevel: 19, rarity: 'epic', slot: 'weapon', setId: 'nightscar-regalia' });
    night.chest = rollItem(rng, { gearLevel: 19, rarity: 'epic', slot: 'chest', setId: 'nightscar-regalia' });
    night.belt = rollItem(rng, { gearLevel: 19, rarity: 'epic', slot: 'belt', setId: 'nightscar-regalia' });
    night.helmet = rollItem(rng, { gearLevel: 19, rarity: 'epic', slot: 'helmet', setId: 'nightscar-regalia' });
    night.gloves = rollItem(rng, { gearLevel: 19, rarity: 'legendary', slot: 'gloves', setId: 'nightscar-regalia' });
    night.boots = rollItem(rng, { gearLevel: 19, rarity: 'legendary', slot: 'boots', setId: 'nightscar-regalia' });
    const fx = computeHero(19, night, 'Warrior').effects;
    expect(fx.atkPct).toBeGreaterThanOrEqual(10);
    expect(fx.skillPowerPct).toBeGreaterThanOrEqual(12);
    expect(fx.ultimateDmgPct).toBeGreaterThanOrEqual(20);
  });
});

describe('save', () => {
  it('round-trips through storage', () => {
    const store = memoryStorage();
    const save = defaultSave();
    save.classPicked = true;
    save.heroClass = 'Mage';
    save.level = 6;
    save.crystals = 42;
    writeSave(store, save);
    const back = loadSave(store);
    expect(back.level).toBe(6);
    expect(back.crystals).toBe(42);
    expect(back.heroClass).toBe('Mage');
    expect(Object.keys(back.gear)).toHaveLength(12);
  });

  it('falls back to a fresh save on corrupt data', () => {
    const store = memoryStorage();
    store.setItem(SAVE_KEY, '{not json');
    expect(loadSave(store).level).toBe(1);
    expect(loadSave(store).classPicked).toBe(false);
  });
});

describe('game gear flow', () => {
  it('replace swaps gear and auto-salvages the old piece', () => {
    const game = new Game(memoryStorage(), mulberry32(5));
    game.pickClass('Warrior');
    const item = rollItem(mulberry32(9), { gearLevel: 1, rarity: 'rare', slot: 'helmet' });
    const info = game.compareFor(item);
    expect(info.current?.slot).toBe('helmet');
    expect(game.equip(item, true)).toBe(true);
    expect(game.save.gear.helmet?.id).toBe(item.id);
    expect(game.save.salvageCount).toBe(1);
  });

  it('refuses gear above hero level', () => {
    const game = new Game(memoryStorage(), mulberry32(5));
    game.pickClass('Rogue');
    const item = rollItem(mulberry32(9), { gearLevel: 5, rarity: 'rare', slot: 'helmet' });
    expect(game.equip(item, false)).toBe(false);
  });

  it('salvage grants resources', () => {
    const game = new Game(memoryStorage(), mulberry32(5));
    game.pickClass('Ranger');
    const item = rollItem(mulberry32(9), { gearLevel: 1, rarity: 'epic', slot: 'ring' });
    game.salvage(item);
    expect(game.save.dust).toBeGreaterThan(0);
  });

  it('locks class after pick and allows new-save re-pick', () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(1));
    expect(game.save.classPicked).toBe(false);
    expect(game.pickClass('Mage')).toBe(true);
    expect(game.pickClass('Warrior')).toBe(false);
    expect(game.save.heroClass).toBe('Mage');
    expect(game.save.loadout).toEqual(DEFAULT_LOADOUT.Mage);
    game.resetSave();
    expect(game.save.classPicked).toBe(false);
    expect(game.pickClass('Ranger')).toBe(true);
  });
});

describe('skill loadout passives', () => {
  function leveledWarrior(level: number): Game {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(3));
    game.pickClass('Warrior');
    game.save.level = level;
    // Unlock enough Ironclad + Bladestorm skills for a full bar.
    return game;
  }

  it('equips and unequips the class passive like an active', () => {
    const game = leveledWarrior(1);
    expect(game.save.loadout).toContain('cleave');
    expect(game.toggleSkill('cleave')).toBeNull();
    expect(game.save.loadout).not.toContain('cleave');
    expect(game.toggleSkill('cleave')).toBeNull();
    expect(game.save.loadout).toContain('cleave');
  });

  it('swaps a passive onto a full bar via replaceIndex and persists', () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(3));
    game.pickClass('Warrior');
    game.save.level = 15;
    // Fill bar with four Ironclad actives (no passive).
    game.save.loadout = ['shield-bash', 'iron-skin', 'rally', 'executioners-guard'];
    game.save.primary = 'executioners-guard';
    expect(game.toggleSkill('cleave')).toMatch(/full/i);
    expect(game.toggleSkill('cleave', 0)).toBeNull();
    expect(game.save.loadout).toEqual(['cleave', 'iron-skin', 'rally', 'executioners-guard']);
    expect(game.save.primary).toBe('executioners-guard');
    // Round-trip save keeps the swapped passive.
    const back = loadSave(store);
    expect(back.loadout).toEqual(['cleave', 'iron-skin', 'rally', 'executioners-guard']);
  });

  it('clears primary when the replaced slot held Primary', () => {
    const game = leveledWarrior(15);
    game.save.loadout = ['shield-bash', 'iron-skin', 'rally', 'executioners-guard'];
    game.save.primary = 'shield-bash';
    expect(game.toggleSkill('cleave', 0)).toBeNull();
    expect(game.save.primary).toBeNull();
  });

  it('refuses mid-combat swaps', () => {
    const game = leveledWarrior(1);
    game.startBattle();
    expect(game.toggleSkill('cleave')).toMatch(/camp/i);
  });
});
