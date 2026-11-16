import type { ArmorSlotId, ArmorType, HeroClass, IconPack, Item, SlotId } from './types';

/** Slots that wear class armor. Jewelry (amulet / medal / ring) and capes are class-neutral / class-locked already. */
export const ARMOR_SLOTS: ArmorSlotId[] = ['chest', 'helmet', 'shoulders', 'belt', 'gloves', 'bracers', 'boots'];

export function isArmorSlot(slot: SlotId): slot is ArmorSlotId {
  return (ARMOR_SLOTS as string[]).includes(slot);
}

export const CLASS_ARMOR_TYPE: Record<HeroClass, ArmorType> = {
  Warrior: 'plate',
  Mage: 'cloth',
  Ranger: 'ranger-leather',
  Rogue: 'rogue-leather',
};

export const ARMOR_TYPES: ArmorType[] = ['plate', 'cloth', 'ranger-leather', 'rogue-leather'];

export function isArmorType(v: unknown): v is ArmorType {
  return typeof v === 'string' && (ARMOR_TYPES as string[]).includes(v);
}

/** Broad weight class for display; Ranger and Rogue share leather but have distinct art. */
export const ARMOR_MATERIAL: Record<ArmorType, 'Plate' | 'Cloth' | 'Leather'> = {
  plate: 'Plate',
  cloth: 'Cloth',
  'ranger-leather': 'Leather',
  'rogue-leather': 'Leather',
};

/**
 * Packs that ship class armor under `icons/armor/<type>/<pack>/<slot>.webp`
 * (see `scripts/process-art.py armor`). Pack `b` is Warrior-only (Cavern sets); packs d / e / g
 * are the Mage / Ranger / Rogue class sets. Plate keeps `icons/gear-<pack>/<slot>.webp`.
 */
export const CLASS_ARMOR_PACKS: Record<Exclude<ArmorType, 'plate'>, IconPack[]> = {
  cloth: ['a', 'c', 'd', 'f', 'h', 'i', 'j', 'k'],
  'ranger-leather': ['a', 'c', 'e', 'f', 'h', 'i', 'j', 'k'],
  'rogue-leather': ['a', 'c', 'g', 'f', 'h', 'i', 'j', 'k'],
};

/** Pack whose art is used when a (type, pack) combination has none. */
export const FALLBACK_ARMOR_PACK: IconPack = 'a';

export function armorPackFor(type: ArmorType, pack: IconPack): IconPack {
  if (type === 'plate') return pack;
  return CLASS_ARMOR_PACKS[type].includes(pack) ? pack : FALLBACK_ARMOR_PACK;
}

/** Base names (after the set / rarity prefix) per armor type; each names the art it is drawn with. */
export const ARMOR_BASE_NAMES: Record<ArmorType, Record<ArmorSlotId, string[]>> = {
  plate: {
    chest: ['Breastplate', 'Cuirass', 'Hauberk'],
    belt: ['Belt', 'Girdle'],
    helmet: ['Helm', 'Greathelm'],
    gloves: ['Gloves', 'Gauntlets'],
    bracers: ['Bracers', 'Wristguards'],
    shoulders: ['Pauldrons', 'Spaulders'],
    boots: ['Boots', 'Treads', 'Greaves', 'Legguards'],
  },
  cloth: {
    chest: ['Robe', 'Vestment', 'Raiment'],
    belt: ['Sash', 'Cord'],
    helmet: ['Hood', 'Cowl'],
    gloves: ['Mitts', 'Handwraps'],
    bracers: ['Cuffs', 'Wristwraps'],
    shoulders: ['Epaulets', 'Shoulderwraps'],
    boots: ['Slippers', 'Sandals', 'Shoes'],
  },
  'ranger-leather': {
    chest: ['Leather Jerkin', 'Leather Vest', 'Hide Coat'],
    belt: ['Quiver Belt', 'Hide Belt'],
    helmet: ['Leather Hood', 'Hooded Cap'],
    gloves: ['Leather Gloves', 'Grips'],
    bracers: ['Leather Bracers', 'Vambraces'],
    shoulders: ['Shoulderguards', 'Leather Pauldrons'],
    boots: ['Leather Boots', 'Hide Treads', 'Stalkers'],
  },
  'rogue-leather': {
    chest: ['Harness', 'Strapped Jacket', 'Fitted Vest'],
    belt: ['Bandolier', 'Strapped Belt'],
    helmet: ['Mask', 'Shadow Hood'],
    gloves: ['Handguards', 'Gripwraps'],
    bracers: ['Strapped Bracers', 'Wrist Straps'],
    shoulders: ['Shoulder Straps', 'Shadow Spaulders'],
    boots: ['Soft Boots', 'Silent Treads', 'Footpads'],
  },
};

export function armorBaseNames(type: ArmorType, slot: ArmorSlotId): string[] {
  return ARMOR_BASE_NAMES[type][slot];
}

export const STARTER_ARMOR_NAME: Record<HeroClass, Record<ArmorSlotId, string>> = {
  Warrior: {
    chest: 'Worn Jerkin',
    belt: 'Frayed Belt',
    helmet: 'Dented Helm',
    gloves: 'Torn Gloves',
    bracers: 'Cracked Bracers',
    shoulders: 'Patched Pauldrons',
    boots: 'Muddy Boots',
  },
  Mage: {
    chest: 'Threadbare Robe',
    belt: 'Frayed Sash',
    helmet: 'Patched Hood',
    gloves: 'Torn Mitts',
    bracers: 'Ragged Cuffs',
    shoulders: 'Frayed Epaulets',
    boots: 'Worn Slippers',
  },
  Ranger: {
    chest: 'Worn Hide Coat',
    belt: 'Frayed Quiver Belt',
    helmet: 'Weathered Leather Hood',
    gloves: 'Torn Leather Gloves',
    bracers: 'Cracked Leather Bracers',
    shoulders: 'Patched Shoulderguards',
    boots: 'Muddy Leather Boots',
  },
  Rogue: {
    chest: 'Scuffed Harness',
    belt: 'Frayed Bandolier',
    helmet: 'Tattered Mask',
    gloves: 'Torn Handguards',
    bracers: 'Cracked Wrist Straps',
    shoulders: 'Patched Shoulder Straps',
    boots: 'Muddy Soft Boots',
  },
};

/**
 * Armor type a name belongs to, by its longest matching base name. Plain "Gloves" / "Belt" are
 * plate; "Leather Gloves" is Ranger leather. Starter names (e.g. "Worn Jerkin") count too.
 * Returns null for names that match no armor base (e.g. unknown legacy names).
 */
export function armorTypeFromName(name: string, slot: ArmorSlotId): ArmorType | null {
  let best: { type: ArmorType; len: number } | null = null;
  for (const type of ARMOR_TYPES) {
    const starter = STARTER_ARMOR_NAME[HERO_FOR_TYPE[type]][slot];
    const candidates = [...ARMOR_BASE_NAMES[type][slot], starter];
    for (const base of candidates) {
      if (name.endsWith(base) && (!best || base.length > best.len)) best = { type, len: base.length };
    }
  }
  return best?.type ?? null;
}

const HERO_FOR_TYPE: Record<ArmorType, HeroClass> = {
  plate: 'Warrior',
  cloth: 'Mage',
  'ranger-leather': 'Ranger',
  'rogue-leather': 'Rogue',
};

/** Armor type for display: stored type, else inferred from the name, else legacy `plate`. */
export function resolveArmorType(item: Pick<Item, 'name' | 'slot' | 'armorType'>): ArmorType {
  if (isArmorType(item.armorType)) return item.armorType;
  if (isArmorSlot(item.slot)) return armorTypeFromName(item.name, item.slot) ?? 'plate';
  return 'plate';
}

/**
 * Saves from before class armor stored plate names for every class, so a Mage wore
 * "Breastplate". Re-type to the holder's class and swap the plate base for that class's
 * equivalent (same slot, same list position, so a name's variety survives). Stats are untouched.
 */
export function migrateLegacyArmor(item: Item, heroClass: HeroClass | null): Item {
  if (!isArmorSlot(item.slot) || isArmorType(item.armorType)) return item;
  const target = heroClass ? CLASS_ARMOR_TYPE[heroClass] : (armorTypeFromName(item.name, item.slot) ?? 'plate');
  const named = armorTypeFromName(item.name, item.slot);
  if (target === 'plate') return { ...item, armorType: 'plate' };
  if (named === target) return { ...item, armorType: target };
  const plateBases = ARMOR_BASE_NAMES.plate[item.slot];
  const starter = STARTER_ARMOR_NAME.Warrior[item.slot];
  const targetBases = ARMOR_BASE_NAMES[target][item.slot];
  const base = [...plateBases, starter]
    .sort((a, b) => b.length - a.length)
    .find((b) => item.name.endsWith(b));
  if (!base) return { ...item, armorType: target };
  const idx = base === starter ? 0 : plateBases.indexOf(base);
  const replacement =
    base === starter ? STARTER_ARMOR_NAME[heroClass!][item.slot] : targetBases[Math.min(idx, targetBases.length - 1)];
  const prefix = item.name.slice(0, item.name.length - base.length);
  return {
    ...item,
    armorType: target,
    name: base === starter ? replacement : `${prefix}${replacement}`,
  };
}

/** Icon path (relative to `assets/`) for an armor-slot item. */
export function armorIconPath(item: Pick<Item, 'name' | 'slot' | 'armorType' | 'icon'>): string {
  const type = resolveArmorType(item);
  const pack = armorPackFor(type, item.icon);
  return type === 'plate'
    ? `icons/gear-${pack}/${item.slot}.webp`
    : `icons/armor/${type}/${pack}/${item.slot}.webp`;
}
