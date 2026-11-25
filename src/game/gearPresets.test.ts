import { describe, expect, it } from 'vitest';
import { starterGear } from '../data/gear';
import type { Item } from '../data/types';
import { Game } from './game';
import {
  GEAR_PRESET_COUNT,
  applyGearPreset,
  captureGearPreset,
  gearMatchesPreset,
  sanitizeGearPresets,
} from './gearPresets';
import { mulberry32 } from './rng';
import { BAG_CAP, SAVE_KEY, defaultSave, loadSave, type Storage } from './state';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

function piece(partial: Partial<Item> & Pick<Item, 'id' | 'slot'>): Item {
  return {
    rarity: 'rare',
    gearLevel: 1,
    name: partial.name ?? partial.id,
    icon: 'a',
    stats: { atk: 5 },
    ...partial,
  };
}

describe('gearPresets pure helpers', () => {
  it('captures equipped ids and matches gear', () => {
    const gear = starterGear('Warrior');
    const preset = captureGearPreset(gear, 0, 'Tank', 100);
    expect(preset.index).toBe(0);
    expect(preset.name).toBe('Tank');
    expect(preset.slots.weapon).toBe(gear.weapon!.id);
    expect(gearMatchesPreset(gear, preset)).toBe(true);
    expect(gearMatchesPreset({ ...gear, weapon: undefined }, preset)).toBe(false);
  });

  it('swaps bag ↔ equipped without salvaging', () => {
    const a = piece({ id: 'w-a', slot: 'weapon', name: 'Axe A', setId: 'echoplate' });
    const b = piece({ id: 'w-b', slot: 'weapon', name: 'Axe B', setId: 'echoplate' });
    const gear = { weapon: a };
    const bag = [b];
    const preset = captureGearPreset({ weapon: b }, 1, 'Alt');
    const result = applyGearPreset(gear, bag, preset, 'Warrior', 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.gear.weapon?.id).toBe('w-b');
    expect(result.bag.map((i) => i.id)).toEqual(['w-a']);
    expect(result.missing).toEqual([]);
  });

  it('blocks wrong-class pieces and reports missing ids', () => {
    const quill = piece({
      id: 'bow-q',
      slot: 'weapon',
      name: 'Quill',
      setId: 'quillstorm',
      weaponType: 'bow',
    });
    const gear = starterGear('Warrior');
    const bag = [quill];
    const preset = captureGearPreset({ weapon: quill }, 0, 'Ranger kit');
    const result = applyGearPreset(gear, bag, preset, 'Warrior', 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocked).toContain('weapon');
    expect(result.gear.weapon?.id).toBe(gear.weapon!.id);
  });

  it('refuses when bag would overflow', () => {
    const gear = starterGear('Mage');
    const bag: Item[] = [];
    for (let i = 0; i < BAG_CAP; i++) {
      bag.push(piece({ id: `junk-${i}`, slot: 'ring', name: `Junk ${i}` }));
    }
    // Preset empties all slots → every equipped piece must fit in bag.
    const preset = captureGearPreset({}, 0, 'Naked');
    const result = applyGearPreset(gear, bag, preset, 'Mage', 10);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Bag full/);
  });

  it('sanitizes sparse save arrays', () => {
    const raw = [
      { index: 0, name: '<b>PvE</b>', slots: { weapon: 'w1' }, savedAt: 1 },
      { index: 9, name: 'skip', slots: { chest: 'c1' } },
      null,
      { index: 2, name: 'Farm', slots: {}, savedAt: 2 },
    ];
    const out = sanitizeGearPresets(raw);
    expect(out).toHaveLength(GEAR_PRESET_COUNT);
    expect(out[0]?.name).toBe('PvE');
    expect(out[0]?.slots.weapon).toBe('w1');
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
  });
});

describe('Game gear loadout API', () => {
  it('saves, applies, and persists across reload', () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(42));
    game.pickClass('Rogue');

    const kitA = { ...game.save.gear };
    expect(game.saveGearPreset(0, 'Nightfang')).toBeNull();
    expect(game.gearPresets[0]?.name).toBe('Nightfang');

    // Put an alternate weapon in bag and equip it, then save slot 1.
    const alt = piece({
      id: 'dagger-alt',
      slot: 'weapon',
      name: 'Alt Dagger',
      setId: 'nightfang',
      weaponType: 'dagger',
      gearLevel: 1,
    });
    game.save.bag.push(alt);
    expect(game.equip(alt, false)).toBe(true);
    expect(game.saveGearPreset(1, 'PvP')).toBeNull();

    // Swap back to Nightfang kit.
    expect(game.applyGearPreset(0)).toBeNull();
    expect(game.save.gear.weapon?.id).toBe(kitA.weapon!.id);
    expect(game.save.bag.some((i) => i.id === 'dagger-alt')).toBe(true);
    expect(game.activeGearPresetIndex()).toBe(0);

    const again = new Game(store, mulberry32(42));
    expect(again.gearPresets[0]?.name).toBe('Nightfang');
    expect(again.gearPresets[1]?.name).toBe('PvP');
    expect(again.save.gear.weapon?.id).toBe(kitA.weapon!.id);
  });

  it('migrates legacy saves without gearPresets', () => {
    const store = memoryStorage();
    const legacy = defaultSave();
    legacy.classPicked = true;
    legacy.heroClass = 'Mage';
    delete (legacy as { gearPresets?: unknown }).gearPresets;
    store.setItem(SAVE_KEY, JSON.stringify({ ...legacy, version: 4 }));
    const loaded = loadSave(store);
    expect(loaded.gearPresets).toEqual([null, null, null]);
  });
});
