import { ASCENDED_NIGHTSCAR_DEF, type DungeonDef } from '../data/acts';

/**
 * Ascended Nightscar + Ascended Seal economy.
 *
 * Seals drop from Clan Raid (full seal or fragments). Fragments craft into seals.
 * Ascended Nightscar spends seals + extra keys vs normal Apex.
 */

/** Fragments required to craft one Ascended Seal (inventory craft). */
export const ASCENDED_SEAL_FRAGMENTS_PER_SEAL = 5;

/** Key cost for Ascended Nightscar Enter/Sweep (normal Apex = 4). */
export const ASCENDED_NIGHTSCAR_KEY_COST = 6;

/** Ascended Seals consumed per Ascended Nightscar Enter/Sweep. */
export const ASCENDED_NIGHTSCAR_SEAL_COST = 1;

/** Extra enemy tier on Ascended floors (harder, still clearable without BiS). */
export const ASCENDED_TIER_BUMP = 2.5;

export const ASCENDED_DUNGEON_ID = ASCENDED_NIGHTSCAR_DEF.id;

/** Harder Apex variant — same sets/GL band, ascended drop tables + cost. */
export const ASCENDED_NIGHTSCAR: DungeonDef = ASCENDED_NIGHTSCAR_DEF;

export function isAscendedDungeon(d: Pick<DungeonDef, 'id' | 'ascended'>): boolean {
  return !!d.ascended || d.id === ASCENDED_DUNGEON_ID;
}

export function formatAscendedEntryCost(
  keys = ASCENDED_NIGHTSCAR_KEY_COST,
  seals = ASCENDED_NIGHTSCAR_SEAL_COST,
): string {
  const keyLabel = keys === 1 ? '1 Key' : `${keys} Keys`;
  const sealLabel = seals === 1 ? '1 Seal' : `${seals} Seals`;
  return `${keyLabel} + ${sealLabel}`;
}

/** Clamp seal/fragment counts from save blobs. */
export function normalizeNonNegInt(value: unknown, cap = 9999): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(cap, Math.floor(value)));
}

/** How many seals can be crafted from current fragments. */
export function sealsCraftableFrom(fragments: number): number {
  return Math.floor(Math.max(0, fragments) / ASCENDED_SEAL_FRAGMENTS_PER_SEAL);
}
