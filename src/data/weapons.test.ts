import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aiGearFor } from '../game/clan';
import { Game } from '../game/game';
import { mulberry32 } from '../game/rng';
import { buildDailyOffers } from '../game/shop';
import type { Storage } from '../game/state';
import { sanitizeItem } from '../game/state';
import { itemIcon } from '../ui/assets';
import {
  ALL_SET_IDS,
  RARITY_ORDER,
  SETS,
  filterSetsForClass,
  rollItem,
  starterGear,
} from './gear';
import type { HeroClass, IconPack, Item, SetId, WeaponType } from './types';
import { HERO_CLASSES } from './types';
import {
  CLASS_WEAPON_PACKS,
  CLASS_WEAPON_TYPE,
  MELEE_ART,
  migrateLegacyWeapon,
  resolveWeaponType,
  weaponBaseNames,
  weaponIconPath,
  weaponTypeFromName,
} from './weapons';

const PUBLIC = resolve(__dirname, '../../public/assets');
const KIND_WORD = {
  axe: /axe|hatchet|cleaver/i,
  mace: /mace|morningstar/i,
  sword: /sword|blade/i,
  hammer: /hammer|maul/i,
} as const;

function memoryStorage(): Storage {
  const data: Record<string, string> = {};
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

/** Every icon pack a class can see on a weapon: plain drops (a) plus each set it may receive. */
function packsFor(heroClass: HeroClass): { setId?: SetId; pack: IconPack }[] {
  const out: { setId?: SetId; pack: IconPack }[] = [{ pack: 'a' }];
  for (const id of filterSetsForClass(ALL_SET_IDS, heroClass)) out.push({ setId: id, pack: SETS[id].icon });
  return out;
}

function expectWeaponArt(item: Item, heroClass: HeroClass): void {
  const type = CLASS_WEAPON_TYPE[heroClass];
  expect(item.weaponType, item.name).toBe(type);
  expect(resolveWeaponType(item)).toBe(type);
  const path = weaponIconPath(item);
  if (type === 'melee') expect(path, item.name).toMatch(/^icons\/gear-[a-k]\/weapon\.webp$/);
  else expect(path, item.name).toMatch(new RegExp(`^icons/weapons/${type}/[a-k]\\.webp$`));
  expect(existsSync(resolve(PUBLIC, path)), `${path} missing`).toBe(true);
  expect(itemIcon(item)).toContain(path);

  if (type === 'melee') {
    expect(weaponTypeFromName(item.name), item.name).toBeNull();
    const art = MELEE_ART[path.match(/gear-([a-k])/)![1] as IconPack]!;
    expect(item.name, `${item.name} vs ${art.kind} art`).toMatch(KIND_WORD[art.kind]);
  } else {
    expect(weaponTypeFromName(item.name), item.name).toBe(type);
  }
}

describe('weapon icon art assets', () => {
  it('every declared weapon icon file exists', () => {
    for (const pack of Object.keys(MELEE_ART)) {
      expect(existsSync(resolve(PUBLIC, `icons/gear-${pack}/weapon.webp`)), `melee ${pack}`).toBe(true);
    }
    for (const [type, packs] of Object.entries(CLASS_WEAPON_PACKS)) {
      for (const pack of packs) {
        expect(existsSync(resolve(PUBLIC, `icons/weapons/${type}/${pack}.webp`)), `${type}/${pack}`).toBe(true);
      }
    }
  });

  it('base names always name the weapon the icon shows', () => {
    const types: WeaponType[] = ['melee', 'staff', 'bow', 'dagger'];
    const packs = 'abcdefghijk'.split('') as IconPack[];
    for (const type of types) {
      for (const pack of packs) {
        for (const name of weaponBaseNames(type, pack)) {
          if (type === 'melee') {
            const art = MELEE_ART[MELEE_ART[pack] ? pack : 'a']!;
            expect(name).toMatch(KIND_WORD[art.kind]);
            expect(weaponTypeFromName(name)).toBeNull();
          } else {
            expect(weaponTypeFromName(name), `${type}:${name}`).toBe(type);
          }
        }
      }
    }
  });
});

describe('class weapon icons', () => {
  it('maps each class to its own weapon family', () => {
    expect(CLASS_WEAPON_TYPE).toEqual({ Warrior: 'melee', Mage: 'staff', Ranger: 'bow', Rogue: 'dagger' });
  });

  for (const heroClass of HERO_CLASSES) {
    describe(heroClass, () => {
      it('starter weapon', () => {
        expectWeaponArt(starterGear(heroClass).weapon!, heroClass);
      });

      it('rolled drops (plain + every allowed set, all rarities)', () => {
        const rng = mulberry32(1234);
        for (const { setId, pack } of packsFor(heroClass)) {
          for (const rarity of RARITY_ORDER) {
            for (let i = 0; i < 6; i++) {
              const item = rollItem(rng, { gearLevel: 5, rarity, slot: 'weapon', setId, heroClass });
              expect(item.icon).toBe(pack);
              expectWeaponArt(item, heroClass);
            }
          }
        }
      });

      it('Clanforged / Nightscar AI gear and vendor-style rolls', () => {
        const rng = mulberry32(7);
        for (const icon of ['j', 'k'] as const) {
          const setId = icon === 'k' ? 'clanforged' : 'nightscar-regalia';
          expectWeaponArt(rollItem(rng, { gearLevel: 19, rarity: 'legendary', slot: 'weapon', setId, icon, heroClass }), heroClass);
        }
        for (const tier of ['scaled', 'endgame'] as const) {
          for (let i = 0; i < 10; i++) expectWeaponArt(aiGearFor(rng, 20, heroClass, tier).weapon!, heroClass);
        }
      });

      it('daily shop weapons', () => {
        let seen = 0;
        for (let seed = 1; seed <= 60; seed++) {
          const offers = buildDailyOffers(seed, { level: 20, stagesCleared: 50, heroClass });
          for (const o of offers) {
            if (o.item.slot !== 'weapon') continue;
            seen++;
            expectWeaponArt(o.item, heroClass);
          }
        }
        expect(seen).toBeGreaterThan(5);
      });

      it('in-game drops (loot queue, equipped, bag)', () => {
        const game = new Game(memoryStorage(), mulberry32(99));
        game.pickClass(heroClass);
        expectWeaponArt(game.save.gear.weapon!, heroClass);
        game.devRollLoot(200);
        const weapons = game.save.pending.filter((it) => it.slot === 'weapon');
        expect(weapons.length).toBeGreaterThan(5);
        for (const w of weapons) expectWeaponArt(w, heroClass);
      });
    });
  }

  it('Rogue daggers never render the Warrior hatchet', () => {
    const dagger = starterGear('Rogue').weapon!;
    expect(dagger.name).toBe('Notched Daggers');
    expect(itemIcon(dagger)).toContain('icons/weapons/dagger/a.webp');
    expect(itemIcon(dagger)).not.toContain('gear-a/weapon');
  });

  it('survives save sanitizing', () => {
    for (const heroClass of HERO_CLASSES) {
      const w = starterGear(heroClass).weapon!;
      expectWeaponArt(sanitizeItem(w), heroClass);
    }
  });
});

describe('legacy weapons (pre class-weapon saves)', () => {
  const legacy = (name: string, icon: IconPack): Item => ({
    id: 'x',
    slot: 'weapon',
    rarity: 'rare',
    gearLevel: 3,
    name,
    icon,
    stats: { atk: 5 },
  });

  it('infers type from the item name', () => {
    expect(resolveWeaponType(legacy('Notched Daggers', 'a'))).toBe('dagger');
    expect(resolveWeaponType(legacy('Splintered Staff', 'a'))).toBe('staff');
    expect(resolveWeaponType(legacy('Warped Bow', 'a'))).toBe('bow');
    expect(resolveWeaponType(legacy('Rusty Axe', 'a'))).toBe('melee');
  });

  it('re-types and renames generic Axe on class-set art', () => {
    const rogue = migrateLegacyWeapon(legacy('Nightfang Axe', 'g'));
    expect(rogue.weaponType).toBe('dagger');
    expect(rogue.name).toBe('Nightfang Daggers');
    expect(weaponIconPath(rogue)).toBe('icons/weapons/dagger/g.webp');
    expect(migrateLegacyWeapon(legacy('Ashen Codex Cleaver', 'd')).name).toBe('Ashen Codex Staff');
    expect(migrateLegacyWeapon(legacy('Quillstorm Hatchet', 'e')).name).toBe('Quillstorm Bow');
  });

  it('renames generic Axe on non-axe Warrior art', () => {
    expect(migrateLegacyWeapon(legacy('Cavern Cleaver Axe', 'b')).name).toBe('Cavern Cleaver Mace');
    expect(migrateLegacyWeapon(legacy('Gravemarch Hatchet', 'c')).name).toBe('Gravemarch Sword');
    expect(migrateLegacyWeapon(legacy('Rusty Axe', 'a')).name).toBe('Rusty Axe');
  });

  it('keeps unknown pack/type combinations on a matching fallback icon', () => {
    const odd = { ...legacy('Odd Staff', 'b'), weaponType: 'staff' as const };
    expect(weaponIconPath(odd)).toBe('icons/weapons/staff/a.webp');
  });
});
