import {
  DROP_SET_IDS,
  RARITIES,
  SETS,
  SET_SLOTS,
  SLOT_LABEL,
  filterSetsForClass,
  salvageValue,
  setAllowedForClass,
} from '../data/gear';
import type { Gear } from '../data/gear';
import type { HeroClass, Item, RarityId, SetId, SlotId } from '../data/types';

/**
 * Dust craft sink — spend dust to fill class set pieces.
 * Capes and Clanforged are out of scope (drop / token vendor).
 * Legendary is not craftable so BiS farming still matters.
 */

/** Craftable rarities only — Legendary stays a farm chase. */
export const CRAFTABLE_RARITIES: readonly RarityId[] = ['common', 'rare', 'epic'];

/**
 * Multiplier vs salvage dust return (before set premium + gear-level scale).
 * Farming / salvage must remain profitable relative to buying every gap.
 */
const CRAFT_VS_SALVAGE: Record<RarityId, number> = {
  common: 4,
  rare: 5,
  epic: 6,
  legendary: 8, // unused while legendary is blocked
};

/** Set pieces cost more than plain gear would. */
const SET_CRAFT_PREMIUM = 1.5;

/** +10% dust per gear level above 1. */
const GEAR_LEVEL_CRAFT_STEP = 0.1;

export type CraftOwnStatus = 'none' | 'bag' | 'equipped';

export interface CraftPieceOffer {
  setId: SetId;
  slot: Exclude<SlotId, 'cape'>;
  rarity: RarityId;
  gearLevel: number;
  dustCost: number;
  owned: CraftOwnStatus;
  affordable: boolean;
}

/** Act-scaled default rarity for a set (never Legendary). */
export function craftRarityForSet(setId: SetId): RarityId {
  const act = SETS[setId].act;
  if (act >= 6) return 'epic';
  return 'rare';
}

/** Dust cost to craft a piece. Always strictly above salvage dust return. */
export function craftDustCost(opts: {
  rarity: RarityId;
  gearLevel: number;
  setId?: SetId;
}): number {
  if (!CRAFTABLE_RARITIES.includes(opts.rarity)) {
    throw new Error(`Rarity ${opts.rarity} is not craftable`);
  }
  const salvageDust = RARITIES[opts.rarity].salvage.dust;
  const gl = Math.max(1, opts.gearLevel);
  const glMult = 1 + (gl - 1) * GEAR_LEVEL_CRAFT_STEP;
  let cost = salvageDust * CRAFT_VS_SALVAGE[opts.rarity] * glMult;
  if (opts.setId) cost *= SET_CRAFT_PREMIUM;
  return Math.max(salvageDust + 1, Math.round(cost));
}

/** Sets this class may craft, optionally gated by acts unlocked via stages. */
export function craftableSetsForClass(
  heroClass: HeroClass,
  actUnlocked = 10,
): SetId[] {
  const maxAct = Math.max(1, Math.min(10, actUnlocked));
  return filterSetsForClass(DROP_SET_IDS, heroClass).filter((id) => SETS[id].act <= maxAct);
}

export function ownsSetPiece(
  setId: SetId,
  slot: SlotId,
  gear: Gear,
  bag: readonly Item[],
): CraftOwnStatus {
  const eq = gear[slot];
  if (eq?.setId === setId) return 'equipped';
  if (bag.some((it) => it.setId === setId && it.slot === slot)) return 'bag';
  return 'none';
}

export function missingSlotsForSet(
  setId: SetId,
  gear: Gear,
  bag: readonly Item[],
): Exclude<SlotId, 'cape'>[] {
  return SET_SLOTS.filter((slot) => ownsSetPiece(setId, slot, gear, bag) === 'none');
}

export function buildCraftOffers(opts: {
  heroClass: HeroClass;
  setId: SetId;
  gearLevel: number;
  dust: number;
  gear: Gear;
  bag: readonly Item[];
  /** When true, only slots not owned/equipped. */
  missingOnly?: boolean;
}): CraftPieceOffer[] | { error: string } {
  const { heroClass, setId } = opts;
  if (!(DROP_SET_IDS as readonly SetId[]).includes(setId)) {
    return { error: 'That set is not craftable.' };
  }
  if (!setAllowedForClass(setId, heroClass)) {
    return { error: 'Wrong class for this set.' };
  }
  const rarity = craftRarityForSet(setId);
  const gearLevel = Math.max(1, Math.min(20, opts.gearLevel));
  const slots = opts.missingOnly
    ? missingSlotsForSet(setId, opts.gear, opts.bag)
    : [...SET_SLOTS];
  return slots.map((slot) => {
    const dustCost = craftDustCost({ rarity, gearLevel, setId });
    return {
      setId,
      slot,
      rarity,
      gearLevel,
      dustCost,
      owned: ownsSetPiece(setId, slot, opts.gear, opts.bag),
      affordable: opts.dust >= dustCost,
    };
  });
}

export function craftSlotLabel(slot: SlotId): string {
  return SLOT_LABEL[slot];
}

/** Salvage dust for the rarity a craft would produce (for pricing tests). */
export function salvageDustForCraftRarity(rarity: RarityId): number {
  return salvageValue({ rarity } as Item).dust;
}
