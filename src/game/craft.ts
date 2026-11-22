import { CAPES, CAPE_IDS, capeDef } from '../data/capes';
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
import type { CapeId, HeroClass, Item, RarityId, SetId, SlotId } from '../data/types';

/**
 * Dust craft sinks — set pieces, Legendary upgrade, class capes, and soft-cap refine.
 * Clanforged stays clan-token vendor only.
 */

/** Base craftable rarities for act-default set pieces. */
export const CRAFTABLE_RARITIES: readonly RarityId[] = ['common', 'rare', 'epic'];

/**
 * Multiplier vs salvage dust return (before set premium + gear-level scale).
 * Farming / salvage must remain profitable relative to buying every gap.
 */
const CRAFT_VS_SALVAGE: Record<RarityId, number> = {
  common: 4,
  rare: 5,
  epic: 6,
  legendary: 10,
};

/** Set pieces cost more than plain gear would. */
const SET_CRAFT_PREMIUM = 1.5;

/** Extra premium on Legendary set crafts (late-game dust sink). */
const LEGENDARY_CRAFT_PREMIUM = 2.5;

/** Capes cost more than set pieces of the same rarity. */
const CAPE_CRAFT_PREMIUM = 2.2;

/** +10% dust per gear level above 1. */
const GEAR_LEVEL_CRAFT_STEP = 0.1;

/** Soft dust cap — excess can be refined to crystals at the Blacksmith. */
export const DUST_SOFT_CAP = 4000;

/** Dust spent per crystal when refining over-cap excess (poor rate = sink). */
export const DUST_PER_CRYSTAL_REFINE = 50;

/** Act unlock required before Legendary set crafts appear. */
export const LEGENDARY_CRAFT_MIN_ACT = 8;

export type CraftOwnStatus = 'none' | 'bag' | 'equipped';

export type CraftCategory = 'sets' | 'capes' | 'refine';

export interface CraftPieceOffer {
  setId: SetId;
  slot: Exclude<SlotId, 'cape'>;
  rarity: RarityId;
  gearLevel: number;
  dustCost: number;
  owned: CraftOwnStatus;
  affordable: boolean;
}

export interface CraftCapeOffer {
  capeId: CapeId;
  name: string;
  minAct: number;
  effectText: string;
  rarity: RarityId;
  gearLevel: number;
  dustCost: number;
  owned: CraftOwnStatus;
  affordable: boolean;
  unlocked: boolean;
}

export interface CraftMissingPlan {
  setId: SetId;
  rarity: RarityId;
  gearLevel: number;
  slots: Exclude<SlotId, 'cape'>[];
  totalDust: number;
  affordableSlots: Exclude<SlotId, 'cape'>[];
  affordableDust: number;
}

export interface RefinePreview {
  softCap: number;
  dust: number;
  excess: number;
  maxCrystals: number;
  dustPerCrystal: number;
}

/** Act-scaled default rarity for a set (never Legendary — use legendary flag). */
export function craftRarityForSet(setId: SetId): RarityId {
  const act = SETS[setId].act;
  if (act >= 6) return 'epic';
  return 'rare';
}

export function legendaryCraftUnlocked(actUnlocked: number): boolean {
  return actUnlocked >= LEGENDARY_CRAFT_MIN_ACT;
}

/** Dust cost to craft a piece. Always strictly above salvage dust return. */
export function craftDustCost(opts: {
  rarity: RarityId;
  gearLevel: number;
  setId?: SetId;
  cape?: boolean;
}): number {
  const salvageDust = RARITIES[opts.rarity].salvage.dust;
  const gl = Math.max(1, opts.gearLevel);
  const glMult = 1 + (gl - 1) * GEAR_LEVEL_CRAFT_STEP;
  let cost = salvageDust * CRAFT_VS_SALVAGE[opts.rarity] * glMult;
  if (opts.setId) cost *= SET_CRAFT_PREMIUM;
  if (opts.rarity === 'legendary' && opts.setId) cost *= LEGENDARY_CRAFT_PREMIUM;
  if (opts.cape) cost *= CAPE_CRAFT_PREMIUM;
  return Math.max(salvageDust + 1, Math.round(cost));
}

/** Capes craft as Epic (Act 7–8) or Legendary (Act 9+) for a heavier sink. */
export function craftRarityForCape(capeId: CapeId): RarityId {
  return capeDef(capeId).minAct >= 9 ? 'legendary' : 'epic';
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

export function ownsCape(
  capeId: CapeId,
  gear: Gear,
  bag: readonly Item[],
): CraftOwnStatus {
  const eq = gear.cape;
  if (eq?.capeId === capeId) return 'equipped';
  if (bag.some((it) => it.capeId === capeId)) return 'bag';
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
  /** Craft Legendary versions (late-game sink). */
  legendary?: boolean;
}): CraftPieceOffer[] | { error: string } {
  const { heroClass, setId } = opts;
  if (!(DROP_SET_IDS as readonly SetId[]).includes(setId)) {
    return { error: 'That set is not craftable.' };
  }
  if (!setAllowedForClass(setId, heroClass)) {
    return { error: 'Wrong class for this set.' };
  }
  const rarity: RarityId = opts.legendary ? 'legendary' : craftRarityForSet(setId);
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

/** Plan one-tap craft of every missing set piece (as many as dust allows). */
export function planCraftMissing(opts: {
  heroClass: HeroClass;
  setId: SetId;
  gearLevel: number;
  dust: number;
  gear: Gear;
  bag: readonly Item[];
  legendary?: boolean;
}): CraftMissingPlan | { error: string } {
  const offers = buildCraftOffers({ ...opts, missingOnly: true });
  if ('error' in offers) return offers;
  const rarity: RarityId = opts.legendary ? 'legendary' : craftRarityForSet(opts.setId);
  const gearLevel = Math.max(1, Math.min(20, opts.gearLevel));
  const slots = offers.map((o) => o.slot);
  const totalDust = offers.reduce((sum, o) => sum + o.dustCost, 0);
  const affordableSlots: Exclude<SlotId, 'cape'>[] = [];
  let remaining = opts.dust;
  let affordableDust = 0;
  for (const o of offers) {
    if (remaining < o.dustCost) break;
    affordableSlots.push(o.slot);
    remaining -= o.dustCost;
    affordableDust += o.dustCost;
  }
  return {
    setId: opts.setId,
    rarity,
    gearLevel,
    slots,
    totalDust,
    affordableSlots,
    affordableDust,
  };
}

/** Class cape craft offers (3 per class), gated by cape minAct. */
export function buildCapeCraftOffers(opts: {
  heroClass: HeroClass;
  actUnlocked: number;
  gearLevel: number;
  dust: number;
  gear: Gear;
  bag: readonly Item[];
}): CraftCapeOffer[] {
  const gearLevel = Math.max(1, Math.min(20, opts.gearLevel));
  const act = Math.max(1, Math.min(10, opts.actUnlocked));
  return CAPE_IDS.filter((id) => CAPES[id].heroClass === opts.heroClass).map((capeId) => {
    const def = CAPES[capeId];
    const rarity = craftRarityForCape(capeId);
    const dustCost = craftDustCost({ rarity, gearLevel, cape: true });
    const unlocked = def.minAct <= act;
    return {
      capeId,
      name: def.name,
      minAct: def.minAct,
      effectText: def.effectText,
      rarity,
      gearLevel,
      dustCost,
      owned: ownsCape(capeId, opts.gear, opts.bag),
      affordable: unlocked && opts.dust >= dustCost,
      unlocked,
    };
  });
}

export function refinePreview(dust: number): RefinePreview {
  const excess = Math.max(0, dust - DUST_SOFT_CAP);
  return {
    softCap: DUST_SOFT_CAP,
    dust,
    excess,
    maxCrystals: Math.floor(excess / DUST_PER_CRYSTAL_REFINE),
    dustPerCrystal: DUST_PER_CRYSTAL_REFINE,
  };
}

/** Dust spent and crystals gained for refining `crystals` worth of excess. */
export function refineDustAmount(
  dust: number,
  crystalsWanted: number,
): { dustSpent: number; crystals: number } | { error: string } {
  const preview = refinePreview(dust);
  if (preview.excess <= 0) return { error: 'Dust is under the soft cap — nothing to refine.' };
  if (preview.maxCrystals <= 0) {
    return { error: `Need ${DUST_PER_CRYSTAL_REFINE} excess dust per crystal.` };
  }
  const crystals = Math.max(0, Math.min(preview.maxCrystals, Math.floor(crystalsWanted)));
  if (crystals <= 0) return { error: 'Pick how many crystals to refine.' };
  return { dustSpent: crystals * DUST_PER_CRYSTAL_REFINE, crystals };
}

export function craftSlotLabel(slot: SlotId): string {
  return SLOT_LABEL[slot];
}

/** Salvage dust for the rarity a craft would produce (for pricing tests). */
export function salvageDustForCraftRarity(rarity: RarityId): number {
  return salvageValue({ rarity } as Item).dust;
}
