import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aiGearFor, normalizeClanMember } from '../game/clan';
import { Game } from '../game/game';
import { mulberry32 } from '../game/rng';
import { buildDailyOffers } from '../game/shop';
import type { Storage } from '../game/state';
import { SAVE_VERSION, loadSaveFromRaw, sanitizeItem } from '../game/state';
import { itemIcon } from '../ui/assets';
import {
  ARMOR_BASE_NAMES,
  ARMOR_MATERIAL,
  ARMOR_SLOTS,
  ARMOR_TYPES,
  CLASS_ARMOR_PACKS,
  CLASS_ARMOR_TYPE,
  STARTER_ARMOR_NAME,
  armorIconPath,
  armorTypeFromName,
  isArmorSlot,
  migrateLegacyArmor,
  resolveArmorType,
} from './armor';
import {
  ALL_SET_IDS,
  RARITY_ORDER,
  SETS,
  SET_SLOTS,
  filterSetsForClass,
  rollItem,
  starterGear,
} from './gear';
import type { ArmorSlotId, ArmorType, HeroClass, IconPack, Item, SetId } from './types';
import { HERO_CLASSES } from './types';

const PUBLIC = resolve(__dirname, '../../public/assets');

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

/** Every icon pack a class can see on armor: plain drops (a) plus each set it may receive. */
function packsFor(heroClass: HeroClass): { setId?: SetId; pack: IconPack }[] {
  const out: { setId?: SetId; pack: IconPack }[] = [{ pack: 'a' }];
  for (const id of filterSetsForClass(ALL_SET_IDS, heroClass)) out.push({ setId: id, pack: SETS[id].icon });
  return out;
}

function expectArmorArt(item: Item, heroClass: HeroClass): void {
  const type = CLASS_ARMOR_TYPE[heroClass];
  const slot = item.slot as ArmorSlotId;
  expect(isArmorSlot(item.slot), item.name).toBe(true);
  expect(item.armorType, item.name).toBe(type);
  expect(resolveArmorType(item)).toBe(type);

  const path = armorIconPath(item);
  if (type === 'plate') {
    expect(path, item.name).toBe(`icons/gear-${item.icon}/${slot}.webp`);
  } else {
    expect(path, item.name).toMatch(new RegExp(`^icons/armor/${type}/[a-k]/${slot}\\.webp$`));
    // Never silently renders Warrior plate.
    expect(path).not.toContain('gear-');
  }
  expect(existsSync(resolve(PUBLIC, path)), `${path} missing for ${item.name}`).toBe(true);
  expect(itemIcon(item)).toContain(path);

  // Name belongs to the same family as the art: a base from this type's list, resolved by longest match.
  const bases = ARMOR_BASE_NAMES[type][slot];
  const starter = STARTER_ARMOR_NAME[heroClass][slot];
  const matches = [...bases, starter].some((b) => item.name.endsWith(b));
  expect(matches, `${item.name} not in ${type} ${slot} names`).toBe(true);
  expect(armorTypeFromName(item.name, slot), item.name).toBe(type);
}

describe('class armor icon assets', () => {
  it('every declared armor icon file exists (all slots x packs x non-Warrior types)', () => {
    for (const [type, packs] of Object.entries(CLASS_ARMOR_PACKS)) {
      for (const pack of packs) {
        for (const slot of ARMOR_SLOTS) {
          const p = `icons/armor/${type}/${pack}/${slot}.webp`;
          expect(existsSync(resolve(PUBLIC, p)), p).toBe(true);
        }
      }
    }
    for (const pack of 'abcdefghijk') {
      for (const slot of ARMOR_SLOTS) {
        expect(existsSync(resolve(PUBLIC, `icons/gear-${pack}/${slot}.webp`)), `plate ${pack}/${slot}`).toBe(true);
      }
    }
  });

  it('armor slots exclude weapon, jewelry and capes', () => {
    expect([...ARMOR_SLOTS].sort()).toEqual(['belt', 'boots', 'bracers', 'chest', 'gloves', 'helmet', 'shoulders']);
    for (const s of ['weapon', 'amulet', 'medal', 'ring', 'cape'] as const) expect(isArmorSlot(s)).toBe(false);
  });

  it('every base name resolves to its own armor type', () => {
    for (const type of ARMOR_TYPES) {
      for (const slot of ARMOR_SLOTS) {
        for (const base of ARMOR_BASE_NAMES[type][slot]) {
          expect(armorTypeFromName(base, slot), `${type}:${slot}:${base}`).toBe(type);
          expect(armorTypeFromName(`Gleaming ${base}`, slot)).toBe(type);
        }
      }
    }
    for (const heroClass of HERO_CLASSES) {
      for (const slot of ARMOR_SLOTS) {
        expect(armorTypeFromName(STARTER_ARMOR_NAME[heroClass][slot], slot)).toBe(CLASS_ARMOR_TYPE[heroClass]);
      }
    }
  });

  it('non-plate names never reuse plate-only wording', () => {
    const plateOnly = /Breastplate|Cuirass|Hauberk|Helm|Greathelm|Gauntlets|Wristguards|Pauldrons|Spaulders|Greaves|Legguards|Girdle/;
    for (const type of ARMOR_TYPES.filter((t) => t !== 'plate')) {
      for (const slot of ARMOR_SLOTS) {
        for (const base of ARMOR_BASE_NAMES[type][slot]) {
          // "Leather Pauldrons" is intentional leather armor; it still resolves to leather by longest match.
          if (plateOnly.test(base)) expect(armorTypeFromName(base, slot)).toBe(type);
        }
      }
    }
    for (const base of ARMOR_BASE_NAMES.cloth.chest) expect(base).not.toMatch(plateOnly);
  });
});

describe('class armor icons', () => {
  it('maps each class to its own armor family', () => {
    expect(CLASS_ARMOR_TYPE).toEqual({
      Warrior: 'plate',
      Mage: 'cloth',
      Ranger: 'ranger-leather',
      Rogue: 'rogue-leather',
    });
    expect(ARMOR_MATERIAL[CLASS_ARMOR_TYPE.Ranger]).toBe('Leather');
    expect(ARMOR_MATERIAL[CLASS_ARMOR_TYPE.Rogue]).toBe('Leather');
    expect(CLASS_ARMOR_TYPE.Ranger).not.toBe(CLASS_ARMOR_TYPE.Rogue);
  });

  for (const heroClass of HERO_CLASSES) {
    describe(heroClass, () => {
      it('starter armor', () => {
        const gear = starterGear(heroClass);
        for (const slot of ARMOR_SLOTS) expectArmorArt(gear[slot]!, heroClass);
        for (const slot of SET_SLOTS.filter((s) => !isArmorSlot(s))) expect(gear[slot]!.armorType).toBeUndefined();
      });

      it('rolled drops: every armor slot x plain + every allowed set x all rarities', () => {
        const rng = mulberry32(4321);
        for (const { setId, pack } of packsFor(heroClass)) {
          for (const slot of ARMOR_SLOTS) {
            for (const rarity of RARITY_ORDER) {
              for (let i = 0; i < 4; i++) {
                const item = rollItem(rng, { gearLevel: 5, rarity, slot, setId, heroClass });
                expect(item.icon).toBe(pack);
                expectArmorArt(item, heroClass);
                if (setId) expect(item.name.startsWith(SETS[setId].name)).toBe(true);
              }
            }
          }
        }
      });

      it('random-slot rolls tag armor and leave jewelry untouched', () => {
        const rng = mulberry32(55);
        for (let i = 0; i < 300; i++) {
          const item = rollItem(rng, { gearLevel: 4, rarity: 'rare', heroClass });
          if (isArmorSlot(item.slot)) expectArmorArt(item, heroClass);
          else expect(item.armorType).toBeUndefined();
        }
      });

      it('Clanforged / Nightscar AI gear and vendor-style rolls', () => {
        const rng = mulberry32(7);
        for (const icon of ['j', 'k'] as const) {
          const setId = icon === 'k' ? 'clanforged' : 'nightscar-regalia';
          for (const slot of ARMOR_SLOTS) {
            expectArmorArt(rollItem(rng, { gearLevel: 19, rarity: 'legendary', slot, setId, icon, heroClass }), heroClass);
          }
        }
        for (const tier of ['scaled', 'endgame'] as const) {
          for (let i = 0; i < 10; i++) {
            const gear = aiGearFor(rng, 20, heroClass, tier);
            for (const slot of ARMOR_SLOTS) expectArmorArt(gear[slot]!, heroClass);
          }
        }
      });

      it('daily shop armor', () => {
        let seen = 0;
        for (let seed = 1; seed <= 60; seed++) {
          const offers = buildDailyOffers(seed, { level: 20, stagesCleared: 50, heroClass });
          for (const o of offers) {
            if (!isArmorSlot(o.item.slot)) continue;
            seen++;
            expectArmorArt(o.item, heroClass);
          }
        }
        expect(seen).toBeGreaterThan(20);
      });

      it('in-game drops (loot queue, equipped, bag, clan armorer)', () => {
        const game = new Game(memoryStorage(), mulberry32(99));
        game.pickClass(heroClass);
        for (const slot of ARMOR_SLOTS) expectArmorArt(game.save.gear[slot]!, heroClass);
        game.devRollLoot(300);
        const armor = game.save.pending.filter((it) => isArmorSlot(it.slot));
        expect(armor.length).toBeGreaterThan(50);
        for (const a of armor) expectArmorArt(a, heroClass);

        game.save.clanTokens = 9999;
        game.save.clanNightscarUnlocked = true;
        game.save.pending = [];
        for (let i = 0; i < 12; i++) game.buyClanVendor(i);
        const bought = game.save.pending.filter((it) => isArmorSlot(it.slot));
        expect(bought.length).toBeGreaterThan(0);
        for (const a of bought) {
          expect(a.icon).toBe('k');
          expectArmorArt(a, heroClass);
        }
      });

      it('survives save sanitizing', () => {
        const gear = starterGear(heroClass);
        for (const slot of ARMOR_SLOTS) expectArmorArt(sanitizeItem(gear[slot]!, heroClass), heroClass);
      });
    });
  }

  it('Rogue and Ranger leather use distinct art files for the same slot and pack', () => {
    for (const slot of ARMOR_SLOTS) {
      const ranger = armorIconPath({ ...starterGear('Ranger')[slot]!, icon: 'a' });
      const rogue = armorIconPath({ ...starterGear('Rogue')[slot]!, icon: 'a' });
      expect(ranger).not.toBe(rogue);
    }
  });

  it('Mage / Ranger / Rogue never render Warrior plate', () => {
    const rng = mulberry32(3);
    for (const heroClass of ['Mage', 'Ranger', 'Rogue'] as const) {
      for (const slot of ARMOR_SLOTS) {
        for (const { pack } of packsFor(heroClass)) {
          const item = rollItem(rng, { gearLevel: 3, rarity: 'epic', slot, icon: pack, heroClass });
          expect(itemIcon(item)).toContain('icons/armor/');
          expect(itemIcon(item)).not.toMatch(/gear-[a-k]\//);
        }
      }
    }
  });

  it('clan armorer rows resolve class art from type alone (no name)', () => {
    for (const heroClass of HERO_CLASSES) {
      for (const slot of ['chest', 'helmet'] as const) {
        const url = itemIcon({ slot, icon: 'k', armorType: CLASS_ARMOR_TYPE[heroClass] });
        const path = url.slice(url.indexOf('icons/'));
        expect(existsSync(resolve(PUBLIC, path)), path).toBe(true);
        if (heroClass !== 'Warrior') expect(path).toContain(`icons/armor/${CLASS_ARMOR_TYPE[heroClass]}/k/${slot}`);
      }
    }
  });

  it('keeps unknown pack / type combinations on a matching fallback icon', () => {
    const odd = { ...starterGear('Mage').chest!, icon: 'b' as const };
    expect(armorIconPath(odd)).toBe('icons/armor/cloth/a/chest.webp');
    expect(existsSync(resolve(PUBLIC, armorIconPath(odd)))).toBe(true);
  });
});

describe('balance is unchanged by armor type', () => {
  it('same seed yields identical stats / rarity / level for every class', () => {
    for (const slot of ARMOR_SLOTS) {
      for (const rarity of RARITY_ORDER) {
        const base = rollItem(mulberry32(11), { gearLevel: 9, rarity, slot, setId: 'gravemarch', heroClass: 'Warrior' });
        for (const heroClass of HERO_CLASSES) {
          const other = rollItem(mulberry32(11), { gearLevel: 9, rarity, slot, setId: 'gravemarch', heroClass });
          expect(other.stats).toEqual(base.stats);
          expect(other.rarity).toBe(base.rarity);
          expect(other.gearLevel).toBe(base.gearLevel);
          expect(other.setId).toBe(base.setId);
        }
      }
    }
  });

  it('starter armor stats match across classes', () => {
    const warrior = starterGear('Warrior');
    for (const heroClass of HERO_CLASSES) {
      const gear = starterGear(heroClass);
      for (const slot of ARMOR_SLOTS) expect(gear[slot]!.stats).toEqual(warrior[slot]!.stats);
    }
  });
});

describe('legacy armor (pre class-armor saves)', () => {
  const legacy = (name: string, slot: ArmorSlotId, icon: IconPack = 'a'): Item => ({
    id: `x_${slot}`,
    slot,
    rarity: 'rare',
    gearLevel: 4,
    name,
    icon,
    stats: { hp: 40, def: 6 },
  });

  it('infers type from the item name; unknown names stay plate', () => {
    expect(resolveArmorType(legacy('Tempered Breastplate', 'chest'))).toBe('plate');
    expect(resolveArmorType(legacy('Gleaming Robe', 'chest'))).toBe('cloth');
    expect(resolveArmorType(legacy('Reinforced Leather Boots', 'boots'))).toBe('ranger-leather');
    expect(resolveArmorType(legacy('Worn Soft Boots', 'boots'))).toBe('rogue-leather');
    expect(resolveArmorType(legacy('Mystery Thing', 'chest'))).toBe('plate');
  });

  it('re-types and renames plate pieces for the holder class, stats untouched', () => {
    const cases: [HeroClass, ArmorSlotId, string, string][] = [
      ['Mage', 'chest', 'Gravemarch Breastplate', 'Gravemarch Robe'],
      ['Mage', 'helmet', 'Gleaming Greathelm', 'Gleaming Cowl'],
      ['Mage', 'boots', 'Rusty Legguards', 'Rusty Shoes'],
      ['Ranger', 'chest', 'Ashen Cuirass', 'Ashen Leather Vest'],
      ['Ranger', 'gloves', 'Worn Gauntlets', 'Worn Grips'],
      ['Rogue', 'shoulders', 'Gravemarch Spaulders', 'Gravemarch Shadow Spaulders'],
      ['Rogue', 'belt', 'Battered Girdle', 'Battered Strapped Belt'],
      ['Rogue', 'bracers', 'Tempered Bracers', 'Tempered Strapped Bracers'],
    ];
    for (const [heroClass, slot, before, after] of cases) {
      const src = legacy(before, slot);
      const out = sanitizeItem(src, heroClass);
      expect(out.name).toBe(after);
      expect(out.armorType).toBe(CLASS_ARMOR_TYPE[heroClass]);
      expect(out.stats).toEqual(src.stats);
      expect(out.rarity).toBe(src.rarity);
      expect(out.gearLevel).toBe(src.gearLevel);
      expectArmorArt(out, heroClass);
    }
  });

  it('renames the old shared starter armor per class', () => {
    for (const heroClass of HERO_CLASSES) {
      for (const slot of ARMOR_SLOTS) {
        const old = legacy(STARTER_ARMOR_NAME.Warrior[slot], slot);
        const out = migrateLegacyArmor(old, heroClass);
        expect(out.name).toBe(STARTER_ARMOR_NAME[heroClass][slot]);
        expectArmorArt(out, heroClass);
      }
    }
  });

  it('keeps Warrior plate names and tags them', () => {
    const out = sanitizeItem(legacy('Tempered Breastplate', 'chest'), 'Warrior');
    expect(out.name).toBe('Tempered Breastplate');
    expect(out.armorType).toBe('plate');
  });

  it('is idempotent and does not touch typed items or non-armor slots', () => {
    const typed = migrateLegacyArmor(legacy('Gleaming Robe', 'chest'), 'Mage');
    expect(migrateLegacyArmor(typed, 'Mage')).toBe(typed);
    const ring: Item = { ...legacy('Useless Ring', 'chest'), slot: 'ring' };
    expect(sanitizeItem(ring, 'Mage').armorType).toBeUndefined();
    const once = sanitizeItem(legacy('Gravemarch Breastplate', 'chest'), 'Mage');
    expect(sanitizeItem(once, 'Mage')).toEqual(once);
  });

  it('migrates a whole legacy save on load (equipped, bag, pending) using the save class', () => {
    for (const heroClass of ['Mage', 'Ranger', 'Rogue'] as const) {
      const oldGear: Record<string, Item> = {};
      for (const slot of SET_SLOTS) {
        const { armorType: _armorType, ...rest } = starterGear('Warrior')[slot]!;
        void _armorType;
        oldGear[slot] = rest as Item;
      }
      const raw = JSON.stringify({
        version: SAVE_VERSION,
        heroClass,
        classPicked: true,
        gear: oldGear,
        bag: [legacy('Gravemarch Breastplate', 'chest', 'c'), legacy('Tempered Treads', 'boots')],
        pending: [legacy('Rusty Helm', 'helmet')],
      });
      const save = loadSaveFromRaw(raw)!;
      expect(save).not.toBeNull();
      for (const slot of ARMOR_SLOTS) expectArmorArt(save.gear[slot]!, heroClass);
      for (const it of [...save.bag, ...save.pending]) expectArmorArt(it, heroClass);
      expect(save.bag[0].name).not.toContain('Breastplate');
      expect(save.bag[0].stats).toEqual({ hp: 40, def: 6 });
    }
  });

  it('migrates legacy clan member gear by the member class', () => {
    const rng = mulberry32(5);
    const gear = aiGearFor(rng, 10, 'Rogue', 'scaled');
    const stripped: Record<string, Item> = {};
    for (const [slot, it] of Object.entries(gear)) {
      const { armorType: _a, ...rest } = it!;
      void _a;
      stripped[slot] = isArmorSlot(slot as never)
        ? ({ ...rest, name: it!.name.replace(/\S+$/, ARMOR_BASE_NAMES.plate[slot as ArmorSlotId][0]) } as Item)
        : (rest as Item);
    }
    const member = normalizeClanMember({
      id: 'm1',
      name: 'Shade',
      heroClass: 'Rogue',
      role: 'member',
      isPlayer: false,
      isAi: true,
      level: 10,
      cp: 100,
      loadout: [],
      primary: null,
      gear: stripped,
    } as never);
    expect(member.name).toBe('Shade');
    const raw = JSON.stringify({
      version: SAVE_VERSION,
      heroClass: 'Rogue',
      classPicked: true,
      clan: { id: 'c1', name: 'Clan', code: 'ABC', members: [{ ...member, gear: stripped }] },
    });
    const save = loadSaveFromRaw(raw)!;
    const migrated = save.clan?.members[0].gear;
    expect(migrated).toBeDefined();
    for (const slot of ARMOR_SLOTS) expectArmorArt(migrated![slot]!, 'Rogue');
  });
});

describe('armor types are exhaustive', () => {
  it('every armor type has names for every armor slot and art packs (non-plate)', () => {
    const types: ArmorType[] = ['plate', 'cloth', 'ranger-leather', 'rogue-leather'];
    expect(ARMOR_TYPES).toEqual(types);
    for (const t of types) {
      for (const slot of ARMOR_SLOTS) expect(ARMOR_BASE_NAMES[t][slot].length).toBeGreaterThan(0);
    }
  });
});
