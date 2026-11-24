import {
  DROP_SET_IDS,
  SETS,
  SET_SLOTS,
  filterSetsForClass,
  setCounts,
  type Gear,
} from '../data/gear';
import type { HeroClass, Item, RarityId, SetId, SlotId } from '../data/types';
import { ownsSetPiece } from './craft';
import { NIGHTSCAR_PITY_MAX, normalizeNightscarPity } from './nightscarPity';

/** Pieces needed for the top set bonus (and BiS Legendary target). */
export const SET_BONUS_TARGET = 6;

/** Nightscar Regalia — featured endgame chase set. */
export const NIGHTSCAR_SET_ID: SetId = 'nightscar-regalia';

export type PityBand = 'calm' | 'rising' | 'strong';

export interface SetPieceProgress {
  setId: SetId;
  name: string;
  act: number;
  /** Equipped pieces counting toward 2/4/6 bonuses. */
  equipped: number;
  /** Unique slots owned in gear or bag (capes excluded; max 11). */
  ownedSlots: number;
  /** Slot capacity for set pieces (always SET_SLOTS.length). */
  slotCap: number;
  /** Distinct Legendary slots owned (gear or bag) — BiS chase toward 6. */
  legendarySlots: number;
  /** Bonus thresholds met (2 / 4 / 6). */
  bonusTier: 0 | 2 | 4 | 6;
  /** True when this is the Nightscar Regalia chase set. */
  featured: boolean;
  /** Per-slot ownership for compact UI dots. */
  slots: { slot: Exclude<SlotId, 'cape'>; owned: boolean; rarity: RarityId | null }[];
}

export interface PityTrackerView {
  apex: number;
  ascended: number;
  max: number;
  /** Soft band for Apex (no drop % — avoids spoiling RNG). */
  apexBand: PityBand;
  ascendedBand: PityBand;
  /** Short label for Adventure / tracker; empty while in combat. */
  apexLabel: string;
  ascendedLabel: string;
}

export interface SetProgressSnapshot {
  sets: SetPieceProgress[];
  pity: PityTrackerView;
  /** Nightscar row when unlocked / relevant, else null. */
  nightscar: SetPieceProgress | null;
}

/** Soft band from pity stacks — never exposes weight % or odds. */
export function pityBand(pity: number): PityBand {
  const p = normalizeNightscarPity(pity);
  if (p <= 0) return 'calm';
  if (p <= 4) return 'rising';
  return 'strong';
}

export function pityBandLabel(band: PityBand): string {
  switch (band) {
    case 'calm':
      return 'Calm';
    case 'rising':
      return 'Rising';
    case 'strong':
      return 'Strong';
  }
}

/**
 * Adventure / dungeon hint. Hidden mid-fight so live combat never shows
 * fortune stacks or implies upcoming drop odds.
 */
export function pityAdventureHint(
  pity: number,
  opts: { unlocked: boolean; inBattle: boolean },
): string {
  if (!opts.unlocked || opts.inBattle) return '';
  const p = normalizeNightscarPity(pity);
  const band = pityBandLabel(pityBand(p));
  return `Fortune ${band} ${p}/${NIGHTSCAR_PITY_MAX}`;
}

function bestRarityForSlot(
  setId: SetId,
  slot: SlotId,
  gear: Gear,
  bag: readonly Item[],
): RarityId | null {
  const rank: Record<RarityId, number> = { common: 1, rare: 2, epic: 3, legendary: 4 };
  let best: RarityId | null = null;
  const eq = gear[slot];
  if (eq?.setId === setId) best = eq.rarity;
  for (const it of bag) {
    if (it.setId !== setId || it.slot !== slot) continue;
    if (!best || rank[it.rarity] > rank[best]) best = it.rarity;
  }
  return best;
}

/** Unique set slots with a Legendary piece in gear or bag. */
export function legendarySlotsForSet(
  setId: SetId,
  gear: Gear,
  bag: readonly Item[],
): number {
  let n = 0;
  for (const slot of SET_SLOTS) {
    if (bestRarityForSlot(setId, slot, gear, bag) === 'legendary') n += 1;
  }
  return n;
}

export function bonusTierForCount(equipped: number): 0 | 2 | 4 | 6 {
  if (equipped >= 6) return 6;
  if (equipped >= 4) return 4;
  if (equipped >= 2) return 2;
  return 0;
}

export function buildSetPieceProgress(
  setId: SetId,
  gear: Gear,
  bag: readonly Item[],
): SetPieceProgress {
  const def = SETS[setId];
  const equipped = setCounts(gear)[setId] ?? 0;
  const slots = SET_SLOTS.map((slot) => {
    const owned = ownsSetPiece(setId, slot, gear, bag) !== 'none';
    return {
      slot,
      owned,
      rarity: owned ? bestRarityForSlot(setId, slot, gear, bag) : null,
    };
  });
  const ownedSlots = slots.filter((s) => s.owned).length;
  return {
    setId,
    name: def.name,
    act: def.act,
    equipped,
    ownedSlots,
    slotCap: SET_SLOTS.length,
    legendarySlots: legendarySlotsForSet(setId, gear, bag),
    bonusTier: bonusTierForCount(equipped),
    featured: setId === NIGHTSCAR_SET_ID,
    slots,
  };
}

/**
 * Sets to show on the tracker: class-allowed drop sets the player has unlocked
 * by act, plus any set they already own a piece of (even if act-gated display).
 * Nightscar is always first when present.
 */
export function setsForTracker(opts: {
  heroClass: HeroClass;
  actUnlocked: number;
  gear: Gear;
  bag: readonly Item[];
}): SetId[] {
  const maxAct = Math.max(1, Math.min(10, opts.actUnlocked));
  const owned = new Set<SetId>();
  for (const slot of SET_SLOTS) {
    const id = opts.gear[slot]?.setId;
    if (id) owned.add(id);
  }
  for (const it of opts.bag) {
    if (it.setId) owned.add(it.setId);
  }
  const unlocked = filterSetsForClass(DROP_SET_IDS, opts.heroClass).filter(
    (id) => SETS[id].act <= maxAct || owned.has(id),
  );
  // Prefer owned or Nightscar; keep act order otherwise.
  unlocked.sort((a, b) => {
    if (a === NIGHTSCAR_SET_ID) return -1;
    if (b === NIGHTSCAR_SET_ID) return 1;
    const ao = owned.has(a) ? 0 : 1;
    const bo = owned.has(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return SETS[a].act - SETS[b].act || a.localeCompare(b);
  });
  return unlocked;
}

export function buildPityTrackerView(opts: {
  nightscarPity: number;
  ascendedPity: number;
  inBattle: boolean;
  apexUnlocked: boolean;
  ascendedUnlocked: boolean;
}): PityTrackerView {
  const apex = normalizeNightscarPity(opts.nightscarPity);
  const ascended = normalizeNightscarPity(opts.ascendedPity);
  const apexBand = pityBand(apex);
  const ascendedBand = pityBand(ascended);
  return {
    apex,
    ascended,
    max: NIGHTSCAR_PITY_MAX,
    apexBand,
    ascendedBand,
    apexLabel: pityAdventureHint(apex, {
      unlocked: opts.apexUnlocked,
      inBattle: opts.inBattle,
    }),
    ascendedLabel: pityAdventureHint(ascended, {
      unlocked: opts.ascendedUnlocked,
      inBattle: opts.inBattle,
    }),
  };
}

export function buildSetProgressSnapshot(opts: {
  heroClass: HeroClass;
  actUnlocked: number;
  gear: Gear;
  bag: readonly Item[];
  nightscarPity: number;
  ascendedPity: number;
  inBattle: boolean;
  apexUnlocked: boolean;
  ascendedUnlocked: boolean;
}): SetProgressSnapshot {
  const ids = setsForTracker(opts);
  const sets = ids.map((id) => buildSetPieceProgress(id, opts.gear, opts.bag));
  const nightscar = sets.find((s) => s.setId === NIGHTSCAR_SET_ID) ?? null;
  return {
    sets,
    nightscar,
    pity: buildPityTrackerView(opts),
  };
}
