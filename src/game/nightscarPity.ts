import type { RarityId } from '../data/types';

/**
 * Soft pity for Nightscar Apex (endgame dungeon).
 *
 * Dry run: a successful clear or sweep whose loot has no Epic/Legendary
 * (high-tier Nightscar Regalia chase pieces). Commons/Rares-only = dry.
 * Success: ≥1 Epic or Legendary in that run → reset counter to 0.
 * Soft ramp: each dry stack shifts drop weight into Epic/Legendary.
 */
export const NIGHTSCAR_PITY_MAX = 8;

/** Epic or Legendary — the stingy chase tiers on Nightscar tables. */
export function isNightscarHighTier(item: { rarity: RarityId }): boolean {
  return item.rarity === 'epic' || item.rarity === 'legendary';
}

export function nightscarRunHadHighTier(loot: readonly { rarity: RarityId }[]): boolean {
  return loot.some(isNightscarHighTier);
}

/** After a successful Apex clear/sweep: reset on high-tier, else +1 (capped). */
export function nextNightscarPity(
  current: number,
  loot: readonly { rarity: RarityId }[],
): number {
  if (nightscarRunHadHighTier(loot)) return 0;
  const cur = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  return Math.min(NIGHTSCAR_PITY_MAX, cur + 1);
}

/**
 * Soft-ramp: per pity stack, move 2 Epic + 1 Legendary weight points from
 * Common then Rare. At 8 stacks, endgame boss leans hard into chase rarities
 * without a hard guarantee.
 */
export function applyNightscarSoftPity(
  weights: Record<RarityId, number>,
  pity: number,
): Record<RarityId, number> {
  const p = Math.max(0, Math.min(NIGHTSCAR_PITY_MAX, Math.floor(pity || 0)));
  const w: Record<RarityId, number> = {
    common: weights.common,
    rare: weights.rare,
    epic: weights.epic,
    legendary: weights.legendary,
  };
  if (p <= 0) return w;

  let epicBoost = 2 * p;
  let legBoost = p;
  let need = epicBoost + legBoost;

  for (const r of ['common', 'rare'] as const) {
    const take = Math.min(w[r], need);
    w[r] -= take;
    need -= take;
    if (need <= 0) break;
  }

  // If lower tiers ran dry, shrink boosts proportionally (2:1 epic:legend).
  if (need > 0) {
    const given = epicBoost + legBoost - need;
    epicBoost = Math.floor((given * 2) / 3);
    legBoost = given - epicBoost;
  }

  w.epic += epicBoost;
  w.legendary += legBoost;
  return w;
}

export function normalizeNightscarPity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(NIGHTSCAR_PITY_MAX, Math.floor(value)));
}
