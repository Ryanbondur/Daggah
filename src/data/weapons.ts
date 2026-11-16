import type { HeroClass, IconPack, Item, WeaponType } from './types';

export const CLASS_WEAPON_TYPE: Record<HeroClass, WeaponType> = {
  Warrior: 'melee',
  Mage: 'staff',
  Ranger: 'bow',
  Rogue: 'dagger',
};

export const WEAPON_TYPES: WeaponType[] = ['melee', 'staff', 'bow', 'dagger'];

export function isWeaponType(v: unknown): v is WeaponType {
  return typeof v === 'string' && (WEAPON_TYPES as string[]).includes(v);
}

export type MeleeKind = 'axe' | 'mace' | 'sword' | 'hammer';

/**
 * Warrior weapon art lives in `icons/gear-<pack>/weapon.webp`; this is what each pack's
 * piece actually depicts. Packs d/e/g (Mage / Ranger / Rogue sets) have no Warrior weapon.
 */
export const MELEE_ART: Partial<Record<IconPack, { kind: MeleeKind; names: string[] }>> = {
  a: { kind: 'axe', names: ['Hatchet', 'Axe'] },
  b: { kind: 'mace', names: ['Mace', 'Morningstar'] },
  c: { kind: 'sword', names: ['Sword', 'Broadsword'] },
  f: { kind: 'hammer', names: ['Warhammer', 'Maul'] },
  h: { kind: 'sword', names: ['Crystal Blade', 'Runeblade'] },
  i: { kind: 'axe', names: ['Axe', 'Battleaxe'] },
  j: { kind: 'axe', names: ['Battleaxe', 'Cleaver'] },
  k: { kind: 'axe', names: ['Greataxe', 'Cleaver'] },
};

/** Packs that ship art under `icons/weapons/<type>/<pack>.webp` (see scripts/process-art.py). */
export const CLASS_WEAPON_PACKS: Record<Exclude<WeaponType, 'melee'>, IconPack[]> = {
  staff: ['a', 'c', 'd', 'f', 'h', 'i', 'j', 'k'],
  bow: ['a', 'c', 'e', 'f', 'h', 'i', 'j', 'k'],
  dagger: ['a', 'c', 'g', 'f', 'h', 'i', 'j', 'k'],
};

const CLASS_WEAPON_NAMES: Record<Exclude<WeaponType, 'melee'>, string[]> = {
  staff: ['Staff', 'Quarterstaff', 'War Staff'],
  bow: ['Bow', 'Longbow', 'Recurve Bow'],
  dagger: ['Daggers', 'Dirks', 'Stilettos'],
};

/** Pack whose art is used when a (type, pack) combination has none. */
export const FALLBACK_WEAPON_PACK: IconPack = 'a';

export function weaponPackFor(type: WeaponType, pack: IconPack): IconPack {
  if (type === 'melee') return MELEE_ART[pack] ? pack : FALLBACK_WEAPON_PACK;
  return CLASS_WEAPON_PACKS[type].includes(pack) ? pack : FALLBACK_WEAPON_PACK;
}

/** Base names that match the art shown for this weapon type + icon pack. */
export function weaponBaseNames(type: WeaponType, pack: IconPack): string[] {
  if (type === 'melee') return MELEE_ART[weaponPackFor(type, pack)]!.names;
  return CLASS_WEAPON_NAMES[type];
}

export const STARTER_WEAPON_NAME: Record<HeroClass, string> = {
  Warrior: 'Rusty Axe',
  Mage: 'Splintered Staff',
  Ranger: 'Warped Bow',
  Rogue: 'Notched Daggers',
};

const NAME_KEYWORDS: [WeaponType, RegExp][] = [
  ['dagger', /\b(daggers?|dirks?|stilettos?)\b/i],
  ['staff', /\b(staff|quarterstaff|war staff|wands?)\b/i],
  ['bow', /\b(bows?|longbow|recurve)\b/i],
];

export function weaponTypeFromName(name: string): WeaponType | null {
  for (const [type, re] of NAME_KEYWORDS) if (re.test(name)) return type;
  return null;
}

/** Legacy generic base words, from before weapons were class-specific. */
const LEGACY_GENERIC_BASE = /\b(Axe|Cleaver|Hatchet)$/;
const LEGACY_PACK_TYPE: Partial<Record<IconPack, WeaponType>> = {
  d: 'staff',
  e: 'bow',
  g: 'dagger',
};

/**
 * Weapon type for display. Prefers the stored type, then the item name (legacy starter
 * weapons / saves), else `melee`.
 */
export function resolveWeaponType(item: Pick<Item, 'name' | 'weaponType' | 'icon'>): WeaponType {
  if (isWeaponType(item.weaponType)) return item.weaponType;
  return weaponTypeFromName(item.name) ?? LEGACY_PACK_TYPE[item.icon] ?? 'melee';
}

/**
 * Saves from before class weapons stored generic "Axe/Cleaver/Hatchet" names, so a Rogue's
 * Nightfang weapon read "Axe" over dagger art. Re-type by pack and rename to match.
 */
export function migrateLegacyWeapon(item: Item): Item {
  if (item.slot !== 'weapon' || isWeaponType(item.weaponType)) return item;
  const named = weaponTypeFromName(item.name);
  if (named) return { ...item, weaponType: named };
  const byPack = LEGACY_PACK_TYPE[item.icon];
  if (byPack && LEGACY_GENERIC_BASE.test(item.name)) {
    return {
      ...item,
      weaponType: byPack,
      name: item.name.replace(LEGACY_GENERIC_BASE, weaponBaseNames(byPack, item.icon)[0]),
    };
  }
  const art = MELEE_ART[item.icon];
  if (!byPack && art && art.kind !== 'axe' && LEGACY_GENERIC_BASE.test(item.name)) {
    return {
      ...item,
      weaponType: 'melee',
      name: item.name.replace(LEGACY_GENERIC_BASE, art.names[0]),
    };
  }
  return { ...item, weaponType: byPack ?? 'melee' };
}

/** Icon path (relative to `assets/`) for a weapon item. */
export function weaponIconPath(item: Pick<Item, 'name' | 'weaponType' | 'icon'>): string {
  const type = resolveWeaponType(item);
  const pack = weaponPackFor(type, item.icon);
  return type === 'melee' ? `icons/gear-${pack}/weapon.webp` : `icons/weapons/${type}/${pack}.webp`;
}
