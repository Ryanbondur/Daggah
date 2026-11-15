import { describe, expect, it } from 'vitest';
import {
  RARITIES,
  computeHero,
  cpDelta,
  lootCompareHighlight,
  rollItem,
  salvageValue,
  starterGear,
} from '../data/gear';
import { DEFAULT_LOADOUT, isUnlocked, passivesForClass } from '../data/skills';
import { HERO_CLASSES } from '../data/types';
import { addXp, availableSpeeds, heroBaseStats, maxEnergy, xpToNext } from '../data/xp';
import { Game } from './game';
import { mulberry32 } from './rng';
import { ACTS, getDungeon } from '../data/acts';
import {
  DUNGEON_CRYSTAL_COST_PER_KEY,
  KEY_CAP,
  KEY_REGEN_MS,
  SAVE_KEY,
  SWEEP_UNLOCK_CLEARS,
  defaultSave,
  dungeonCrystalCost,
  dungeonKeyCost,
  formatDungeonKeyCost,
  formatKeyRegenLabel,
  loadSave,
  msUntilNextKey,
  writeSave,
} from './state';
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
  it('fills all 11 slots with starter gear (single boots)', () => {
    expect(Object.keys(starterGear('Ranger'))).toHaveLength(11);
    expect(starterGear('Ranger').boots?.slot).toBe('boots');
    expect(starterGear('Ranger')).not.toHaveProperty('legs');
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

  it('lootCompareHighlight marks BiS upgrades with CP badge or BiS', () => {
    const gear = starterGear();
    const rng = mulberry32(11);
    const upgrade = rollItem(rng, { gearLevel: 4, rarity: 'rare', slot: 'chest' });
    const hi = lootCompareHighlight(4, gear, upgrade, 'Warrior');
    expect(hi.upgrade).toBe(true);
    expect(hi.levelOk).toBe(true);
    expect(hi.cpDelta).toBeGreaterThan(0);
    expect(hi.badge).toBe(`+${hi.cpDelta}`);

    const empty = { ...gear, ring: undefined };
    const fill = rollItem(rng, { gearLevel: 1, rarity: 'common', slot: 'ring' });
    const emptyHi = lootCompareHighlight(1, empty, fill, 'Warrior');
    expect(emptyHi.upgrade).toBe(true);
    expect(emptyHi.badge).toBe('BiS');

    const locked = rollItem(rng, { gearLevel: 9, rarity: 'epic', slot: 'helmet' });
    const lockedHi = lootCompareHighlight(1, gear, locked, 'Warrior');
    expect(lockedHi.levelOk).toBe(false);
    expect(lockedHi.upgrade).toBe(false);
    expect(lockedHi.badge).toBeNull();
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
    gear.bracers = rollItem(rng, { gearLevel: 15, rarity: 'epic', slot: 'bracers', setId: 'echoplate' });
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
    expect(Object.keys(back.gear)).toHaveLength(11);
    expect(back.gear.boots?.slot).toBe('boots');
    expect(back.gear).not.toHaveProperty('legs');
  });

  it('falls back to a fresh save on corrupt data', () => {
    const store = memoryStorage();
    store.setItem(SAVE_KEY, '{not json');
    expect(loadSave(store).level).toBe(1);
    expect(loadSave(store).classPicked).toBe(false);
  });

  it('migrates dual legs+boots: keeps higher CP equipped, loser to bag', () => {
    const store = memoryStorage();
    const base = defaultSave(1_700_000_000_000);
    base.classPicked = true;
    const weakBoots = {
      id: 'old-boots',
      slot: 'boots' as const,
      rarity: 'common' as const,
      gearLevel: 1,
      name: 'Muddy Boots',
      icon: 'a' as const,
      stats: { atk: 0, def: 1, hp: 10, critRate: 0, critDmg: 0, skillPower: 0, haste: 0, energyRegen: 0 },
    };
    const strongLegs = {
      id: 'old-legs',
      slot: 'legs',
      rarity: 'epic' as const,
      gearLevel: 4,
      name: 'Warlord Greaves',
      icon: 'a' as const,
      stats: { atk: 0, def: 20, hp: 200, critRate: 0, critDmg: 0, skillPower: 0, haste: 2, energyRegen: 0 },
    };
    const legacy = {
      ...base,
      version: 3,
      gear: { ...base.gear, boots: weakBoots, legs: strongLegs },
      bag: [
        {
          id: 'bag-legs',
          slot: 'legs',
          rarity: 'rare' as const,
          gearLevel: 2,
          name: 'Bag Greaves',
          icon: 'a' as const,
          stats: { atk: 0, def: 5, hp: 40, critRate: 0, critDmg: 0, skillPower: 0, haste: 0, energyRegen: 0 },
        },
      ],
    };
    store.setItem(SAVE_KEY, JSON.stringify(legacy));
    const loaded = loadSave(store);
    expect(loaded.version).toBe(4);
    expect(loaded.gear.boots?.id).toBe('old-legs');
    expect(loaded.gear.boots?.slot).toBe('boots');
    expect(loaded.gear).not.toHaveProperty('legs');
    expect(loaded.bag.some((i) => i.id === 'old-boots')).toBe(true);
    expect(loaded.bag.find((i) => i.id === 'bag-legs')?.slot).toBe('boots');
  });

  it('migrates legs-only gear onto the boots slot', () => {
    const store = memoryStorage();
    const base = defaultSave();
    const legsOnly = {
      ...base,
      version: 3,
      classPicked: true,
      gear: {
        ...base.gear,
        boots: undefined,
        legs: {
          id: 'solo-legs',
          slot: 'legs',
          rarity: 'rare' as const,
          gearLevel: 3,
          name: 'Solo Greaves',
          icon: 'a' as const,
          stats: { atk: 0, def: 8, hp: 60, critRate: 0, critDmg: 0, skillPower: 0, haste: 0, energyRegen: 0 },
        },
      },
    };
    store.setItem(SAVE_KEY, JSON.stringify(legsOnly));
    const loaded = loadSave(store);
    expect(loaded.gear.boots?.id).toBe('solo-legs');
    expect(loaded.gear.boots?.slot).toBe('boots');
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

  it('equips boots into the single boots slot', () => {
    const game = new Game(memoryStorage(), mulberry32(5));
    game.pickClass('Warrior');
    expect(Object.keys(game.save.gear)).toHaveLength(11);
    expect(game.save.gear).not.toHaveProperty('legs');
    const item = rollItem(mulberry32(12), { gearLevel: 1, rarity: 'rare', slot: 'boots' });
    expect(game.compareFor(item).current?.slot).toBe('boots');
    expect(game.equip(item, false)).toBe(true);
    expect(game.save.gear.boots?.id).toBe(item.id);
    expect(game.save.bag.some((i) => i.slot === 'boots')).toBe(true);
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

  it('gives every class exactly two passives (one per playstyle)', () => {
    const expected: Record<string, string[]> = {
      Warrior: ['cleave', 'bulwark'],
      Mage: ['firebolt', 'frostbite'],
      Ranger: ['piercing-shot', 'deadeye'],
      Rogue: ['backstab', 'shadow-veil'],
    };
    for (const cls of HERO_CLASSES) {
      const ids = passivesForClass(cls).map((s) => s.id);
      expect(ids).toHaveLength(2);
      expect(ids).toEqual(expected[cls]);
      const styles = new Set(passivesForClass(cls).map((s) => s.playstyle));
      expect(styles.size).toBe(2);
    }
  });

  it('equips and unequips the class passive like an active', () => {
    const game = leveledWarrior(1);
    expect(game.save.loadout).toContain('cleave');
    expect(game.toggleSkill('cleave')).toBeNull();
    expect(game.save.loadout).not.toContain('cleave');
    expect(game.toggleSkill('cleave')).toBeNull();
    expect(game.save.loadout).toContain('cleave');
  });

  it('swaps between the two class passives in one Equip tap and persists', () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(3));
    game.pickClass('Warrior');
    expect(game.save.loadout).toContain('cleave');
    expect(game.toggleSkill('bulwark')).toBeNull();
    expect(game.save.loadout).toContain('bulwark');
    expect(game.save.loadout).not.toContain('cleave');
    expect(game.toggleSkill('cleave')).toBeNull();
    expect(game.save.loadout).toContain('cleave');
    expect(game.save.loadout).not.toContain('bulwark');
    const back = loadSave(store);
    expect(back.loadout).toContain('cleave');
    expect(back.loadout).not.toContain('bulwark');
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

  it('bar-swaps the second playstyle passive onto a full active bar', () => {
    const game = leveledWarrior(15);
    game.save.loadout = ['whirlwind', 'bladestorm', 'war-banner', 'shield-bash'];
    game.save.primary = 'bladestorm';
    expect(game.toggleSkill('bulwark', 3)).toBeNull();
    expect(game.save.loadout).toEqual(['whirlwind', 'bladestorm', 'war-banner', 'bulwark']);
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

describe('dungeon key regen', () => {
  it('msUntilNextKey is 0 at cap and otherwise remaining interval', () => {
    const now = 1_000_000;
    expect(msUntilNextKey(KEY_CAP, now - 60_000, now)).toBe(0);
    expect(msUntilNextKey(3, now, now)).toBe(KEY_REGEN_MS);
    expect(msUntilNextKey(3, now - 10 * 60_000, now)).toBe(KEY_REGEN_MS - 10 * 60_000);
    expect(msUntilNextKey(3, now - KEY_REGEN_MS - 5_000, now)).toBe(0);
  });

  it('formatKeyRegenLabel shows full at cap and Xm countdown otherwise', () => {
    expect(formatKeyRegenLabel(KEY_CAP, 0)).toBe('full');
    expect(formatKeyRegenLabel(7, 30 * 60_000)).toBe('next key in 30m');
    expect(formatKeyRegenLabel(2, 90_000)).toBe('next key in 2m');
    expect(formatKeyRegenLabel(2, 1)).toBe('next key in 1m');
  });

  it('Game.refreshKeys awards keys on the 30m cadence up to cap 8', () => {
    const game = new Game(memoryStorage(), mulberry32(1));
    const t0 = 5_000_000;
    game.save.keys = 5;
    game.save.keysAt = t0;
    game.refreshKeys(t0 + KEY_REGEN_MS * 2 + 1);
    expect(game.save.keys).toBe(7);
    expect(game.nextKeyInMs(t0 + KEY_REGEN_MS * 2 + 1)).toBe(KEY_REGEN_MS - 1);
    game.refreshKeys(t0 + KEY_REGEN_MS * 10);
    expect(game.save.keys).toBe(KEY_CAP);
    expect(game.nextKeyInMs(t0 + KEY_REGEN_MS * 10)).toBe(0);
    expect(formatKeyRegenLabel(game.save.keys, game.nextKeyInMs())).toBe('full');
  });
});

describe('dungeon key cost by act', () => {
  it('scales 1 / 2 / 3 / 4 across early, mid, late, Nightscar Apex', () => {
    expect([1, 2, 3].map(dungeonKeyCost)).toEqual([1, 1, 1]);
    expect([4, 5, 6].map(dungeonKeyCost)).toEqual([2, 2, 2]);
    expect([7, 8, 9].map(dungeonKeyCost)).toEqual([3, 3, 3]);
    expect(dungeonKeyCost(10)).toBe(4);
    expect(ACTS.map((a) => dungeonKeyCost(a.id))).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4]);
  });

  it('crystal buy-in is 50 Crystals per key at that tier', () => {
    expect(dungeonCrystalCost(1)).toBe(DUNGEON_CRYSTAL_COST_PER_KEY);
    expect(dungeonCrystalCost(5)).toBe(100);
    expect(dungeonCrystalCost(8)).toBe(150);
    expect(dungeonCrystalCost(10)).toBe(200);
    expect(formatDungeonKeyCost(1)).toBe('1 Key');
    expect(formatDungeonKeyCost(4)).toBe('4 Keys');
  });

  it('startDungeon and sweepDungeon spend the act-scaled key cost', () => {
    const game = new Game(memoryStorage(), mulberry32(9));
    game.pickClass('Warrior');
    game.devUnlockThroughAct(10);
    game.save.keys = 8;
    game.save.dungeons['cinder-forge'] = { cleared: true, clears: SWEEP_UNLOCK_CLEARS };
    game.save.dungeons['nightscar-apex'] = { cleared: true, clears: SWEEP_UNLOCK_CLEARS };

    expect(game.sweepDungeon('cinder-forge')).toBe(true); // Act 6 → 2 keys
    expect(game.save.keys).toBe(6);
    expect(game.sweepDungeon('nightscar-apex')).toBe(true); // Act 10 → 4 keys
    expect(game.save.keys).toBe(2);
  });

  it('refuses enter and sweep when keys are short even with crystals', () => {
    const game = new Game(memoryStorage(), mulberry32(11));
    game.pickClass('Warrior');
    game.devUnlockThroughAct(10);
    game.save.keys = 0;
    game.save.crystals = 999;
    game.save.dungeons['hollow-crypt'] = { cleared: true, clears: SWEEP_UNLOCK_CLEARS };
    const toasts: string[] = [];
    game.on((e) => {
      if (e.t === 'toast') toasts.push(e.text);
    });

    expect(game.canAffordDungeonKeys(1)).toBe(false);
    expect(game.startDungeon('hollow-crypt')).toBe(false);
    expect(game.sweepDungeon('hollow-crypt')).toBe(false);
    expect(game.save.keys).toBe(0);
    expect(game.save.crystals).toBe(999);
    expect(toasts.some((t) => /Need 1 Key/i.test(t))).toBe(true);
  });

  it('refuses entry when keys do not cover the tier cost', () => {
    const game = new Game(memoryStorage(), mulberry32(13));
    game.pickClass('Warrior');
    game.devUnlockThroughAct(10);
    game.save.keys = 3;
    game.save.crystals = 100;
    game.save.dungeons['nightscar-apex'] = { cleared: true, clears: SWEEP_UNLOCK_CLEARS };
    const toasts: string[] = [];
    game.on((e) => {
      if (e.t === 'toast') toasts.push(e.text);
    });

    expect(game.sweepDungeon('nightscar-apex')).toBe(false);
    expect(game.save.keys).toBe(3);
    expect(toasts.some((t) => /4 Keys/i.test(t))).toBe(true);
  });

  it('unlocks Sweep only after 5 clears of that dungeon', () => {
    const game = new Game(memoryStorage(), mulberry32(17));
    game.pickClass('Warrior');
    game.devUnlockThroughAct(1);
    game.save.keys = 8;
    game.save.dungeons['hollow-crypt'] = { cleared: true, clears: 4 };
    const toasts: string[] = [];
    game.on((e) => {
      if (e.t === 'toast') toasts.push(e.text);
    });

    expect(game.dungeonSweepUnlocked(getDungeon('hollow-crypt'))).toBe(false);
    expect(game.sweepDungeon('hollow-crypt')).toBe(false);
    expect(game.save.keys).toBe(8);
    expect(toasts.some((t) => /5 times/i.test(t))).toBe(true);

    game.save.dungeons['hollow-crypt'] = { cleared: true, clears: SWEEP_UNLOCK_CLEARS };
    expect(game.dungeonSweepUnlocked(getDungeon('hollow-crypt'))).toBe(true);
    expect(game.sweepDungeon('hollow-crypt')).toBe(true);
    expect(game.save.keys).toBe(7);
  });

  it('resetSave and resetSeasonLocal wipe act unlocks and dungeon progress', () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(19));
    game.pickClass('Warrior');
    game.devUnlockThroughAct(6);
    game.save.dungeons['cinder-forge'] = { cleared: true, clears: 9 };
    game.save.currentStage = 20;
    game.save.nodeProgress = 3;
    game.save.crystals = 100;

    game.resetSeasonLocal();
    expect(game.save.stagesCleared).toBe(0);
    expect(game.save.currentStage).toBe(0);
    expect(game.save.nodeProgress).toBe(0);
    expect(game.save.dungeons).toEqual({});
    expect(game.save.classPicked).toBe(false);

    game.pickClass('Mage');
    game.devUnlockThroughAct(3);
    game.save.dungeons['ossuary'] = { cleared: true, clears: 2 };
    game.resetSave();
    expect(game.save.stagesCleared).toBe(0);
    expect(game.save.currentStage).toBe(0);
    expect(game.save.nodeProgress).toBe(0);
    expect(game.save.dungeons).toEqual({});
    expect(game.save.classPicked).toBe(false);
  });
});
