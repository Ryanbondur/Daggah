import { describe, expect, it } from 'vitest';
import {
  DROP_SET_IDS,
  filterSetsForClass,
  itemAllowedForClass,
  lootCompareHighlight,
  rollItem,
  setAllowedForClass,
  setLockedHeroClass,
  starterGear,
  unequipWrongClassGear,
} from '../data/gear';
import type { HeroClass, Item, SetId } from '../data/types';
import { Game } from './game';
import { mulberry32 } from './rng';
import { buildDailyOffers } from './shop';
import { SAVE_KEY, SAVE_VERSION, type Storage } from './state';

function memoryStorage(seed: Record<string, string> = {}): Storage {
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

describe('class-locked set helpers', () => {
  it('maps playstyle sets to their class and leaves Any sets unlocked', () => {
    expect(setLockedHeroClass('quillstorm')).toBe('Ranger');
    expect(setLockedHeroClass('deadeye')).toBe('Ranger');
    expect(setLockedHeroClass('cavern-cleaver')).toBe('Warrior');
    expect(setLockedHeroClass('cavern-bulwark')).toBe('Warrior');
    expect(setLockedHeroClass('ashen-codex')).toBe('Mage');
    expect(setLockedHeroClass('rime-circlet')).toBe('Mage');
    expect(setLockedHeroClass('nightfang')).toBe('Rogue');
    expect(setLockedHeroClass('gloomveil')).toBe('Rogue');
    expect(setLockedHeroClass('ember-raider')).toBeNull();
    expect(setLockedHeroClass('cinderstride')).toBeNull();
    expect(setLockedHeroClass('nightscar-regalia')).toBeNull();
    expect(setLockedHeroClass('clanforged')).toBeNull();
  });

  it('filters set pools per class', () => {
    const act5: SetId[] = ['quillstorm', 'deadeye'];
    expect(filterSetsForClass(act5, 'Ranger')).toEqual(act5);
    expect(filterSetsForClass(act5, 'Warrior')).toEqual([]);
    expect(filterSetsForClass(['ember-raider', 'quillstorm'], 'Warrior')).toEqual(['ember-raider']);
    expect(setAllowedForClass('quillstorm', 'Warrior')).toBe(false);
    expect(itemAllowedForClass({ setId: 'quillstorm' }, 'Warrior')).toBe(false);
    expect(itemAllowedForClass({ setId: undefined }, 'Warrior')).toBe(true);
  });

  it('lootCompareHighlight never marks wrong-class sets as BiS', () => {
    const gear = starterGear('Warrior');
    const quill = rollItem(mulberry32(3), {
      gearLevel: 1,
      rarity: 'epic',
      slot: 'weapon',
      setId: 'quillstorm',
    });
    const hi = lootCompareHighlight(10, gear, quill, 'Warrior');
    expect(hi.upgrade).toBe(false);
    expect(hi.badge).toBeNull();
  });
});

describe('class-locked drops + equip', () => {
  it('Warrior dungeon sweeps of Mire Sanctum never yield Ranger sets', () => {
    const game = new Game(memoryStorage(), mulberry32(77));
    game.pickClass('Warrior');
    game.save.level = 12;
    game.devUnlockThroughAct(5);
    game.save.dungeons['mire-sanctum'] = { cleared: true, clears: 5 };
    game.save.keys = 40;

    const rangerSets = new Set<string>(['quillstorm', 'deadeye']);
    let lastLoot: Item[] = [];
    game.on((ev) => {
      if (ev.t === 'result' && ev.result.kind === 'dungeon') lastLoot = ev.result.loot;
    });
    for (let i = 0; i < 12; i++) {
      expect(game.sweepDungeon('mire-sanctum')).toBe(true);
      expect(lastLoot.length).toBeGreaterThan(0);
      for (const it of lastLoot) {
        expect(rangerSets.has(it.setId ?? '')).toBe(false);
        expect(it.setId).toBeUndefined();
        expect(itemAllowedForClass(it, 'Warrior')).toBe(true);
      }
    }
  });

  it('Ranger dungeon sweeps still receive Quillstorm / Deadeye', () => {
    const game = new Game(memoryStorage(), mulberry32(11));
    game.pickClass('Ranger');
    game.save.level = 12;
    game.devUnlockThroughAct(5);
    game.save.dungeons['mire-sanctum'] = { cleared: true, clears: 5 };
    game.save.keys = 40;

    let lastLoot: Item[] = [];
    game.on((ev) => {
      if (ev.t === 'result' && ev.result.kind === 'dungeon') lastLoot = ev.result.loot;
    });
    let sawRangerSet = false;
    for (let i = 0; i < 20; i++) {
      expect(game.sweepDungeon('mire-sanctum')).toBe(true);
      for (const it of lastLoot) {
        if (it.setId === 'quillstorm' || it.setId === 'deadeye') sawRangerSet = true;
      }
      if (sawRangerSet) break;
    }
    expect(sawRangerSet).toBe(true);
  });

  it('rejects equipping wrong-class set gear and keeps bag piece', () => {
    const game = new Game(memoryStorage(), mulberry32(5));
    game.pickClass('Warrior');
    const quill = rollItem(mulberry32(9), {
      gearLevel: 1,
      rarity: 'epic',
      slot: 'weapon',
      setId: 'quillstorm',
    });
    game.save.bag.push(quill);
    expect(game.equip(quill, false)).toBe(false);
    expect(game.save.gear.weapon?.setId).not.toBe('quillstorm');
    expect(game.save.bag.some((i) => i.id === quill.id)).toBe(true);
  });

  it('allows same-class set equip', () => {
    const game = new Game(memoryStorage(), mulberry32(5));
    game.pickClass('Warrior');
    const cleaver = rollItem(mulberry32(9), {
      gearLevel: 1,
      rarity: 'rare',
      slot: 'weapon',
      setId: 'cavern-cleaver',
    });
    expect(game.equip(cleaver, true)).toBe(true);
    expect(game.save.gear.weapon?.setId).toBe('cavern-cleaver');
  });

  it('auto-unequips wrong-class gear on load into bag', () => {
    const quill = rollItem(mulberry32(2), {
      gearLevel: 9,
      rarity: 'epic',
      slot: 'weapon',
      setId: 'quillstorm',
    });
    quill.id = 'legacy-quill';
    const gear = starterGear('Warrior');
    gear.weapon = quill;
    const store = memoryStorage({
      [SAVE_KEY]: JSON.stringify({
        version: SAVE_VERSION,
        heroClass: 'Warrior',
        classPicked: true,
        level: 10,
        xp: 0,
        gear,
        bag: [],
        pending: [],
        crystals: 0,
        dust: 0,
        gold: 0,
        keys: 3,
        keysAt: Date.now(),
        stagesCleared: 25,
        currentStage: 24,
        nodeProgress: 0,
        dungeons: {},
        loadout: ['cleave', 'shield-bash'],
        primary: null,
        seenSkills: ['cleave', 'shield-bash'],
        questIndex: 0,
        salvageCount: 0,
        settings: {
          autoSalvageReplaced: true,
          autoSalvageWorse: false,
          autoSalvageRarityMax: 'common',
          muted: false,
          speed: 1,
        },
        createdAt: Date.now(),
      }),
    });
    const game = new Game(store, mulberry32(1));
    expect(game.save.gear.weapon?.setId).not.toBe('quillstorm');
    expect(game.save.bag.some((i) => i.id === 'legacy-quill')).toBe(true);
    expect(game.equip(quill, false)).toBe(false);
  });

  it('unequipWrongClassGear moves only locked mismatches', () => {
    const gear = starterGear('Mage');
    const bad = rollItem(mulberry32(4), {
      gearLevel: 1,
      rarity: 'rare',
      slot: 'helmet',
      setId: 'nightfang',
    });
    const ok = rollItem(mulberry32(5), {
      gearLevel: 1,
      rarity: 'rare',
      slot: 'chest',
      setId: 'ashen-codex',
    });
    gear.helmet = bad;
    gear.chest = ok;
    const { gear: next, bag, moved } = unequipWrongClassGear(gear, [], 'Mage');
    expect(moved).toHaveLength(1);
    expect(moved[0]!.setId).toBe('nightfang');
    expect(next.helmet).toBeUndefined();
    expect(next.chest?.setId).toBe('ashen-codex');
    expect(bag).toHaveLength(1);
  });

  it('daily shop set offers stay class-legal', () => {
    const classes: HeroClass[] = ['Warrior', 'Mage', 'Ranger', 'Rogue'];
    for (const heroClass of classes) {
      for (let seed = 1; seed < 80; seed++) {
        const offers = buildDailyOffers(seed * 9973 + heroClass.length, {
          level: 15,
          stagesCleared: 50,
          heroClass,
        });
        for (const o of offers) {
          expect(itemAllowedForClass(o.item, heroClass)).toBe(true);
        }
      }
    }
  });

  it('dev loot only rolls sets allowed for the hero class', () => {
    const game = new Game(memoryStorage(), mulberry32(42));
    game.pickClass('Rogue');
    game.save.level = 16;
    game.devRollLoot(40);
    for (const it of game.save.pending) {
      expect(itemAllowedForClass(it, 'Rogue')).toBe(true);
      if (it.setId) {
        expect(filterSetsForClass(DROP_SET_IDS, 'Rogue')).toContain(it.setId);
      }
    }
  });
});
