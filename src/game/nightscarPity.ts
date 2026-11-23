import type { RarityId } from '../data/types';

/**
 * Soft pity / bad-luck protection for Nightscar Apex & Ascended Nightscar.
 *
 * ## Dry-run definition
 * - Counts: successful clear or sweep only (failed runs ignored).
 * - Dry: loot has no Epic or Legendary (Commons/Rares only).
 * - Success: ≥1 Epic or Legendary → counter resets to 0.
 *
 * ## Soft-ramp formula (per pity stack, cap {@link NIGHTSCAR_PITY_MAX})
 * Move weight from Common, then Rare, into chase tiers:
 * - **+2 Epic** weight points
 * - **+1 Legendary** weight points
 * Mass conserved. If Common+Rare cannot fund the full shift, shrink
 * Epic:Legendary boosts proportionally (≈2:1). Never a hard pity
 * guarantee — Legendary stays a seasonal chase.
 *
 * ## Dust / craft economy fit
 * Soft pity eases dry farm streaks without replacing Blacksmith sinks:
 * - Epic gets **2×** the weight shift of Legendary → Epic Nightscar fills
 *   (clearability) stay farmable; dust craft remains the deterministic
 *   gap-filler for missing slots.
 * - Legendary craft is a steep late sink (salvage×10 × set×1.5 × GL × 2.5);
 *   pity does **not** hard-drop Legendaries and does **not** reset on craft.
 * - Target feel: ~42% of regular raiders finish 6pc Legendary Nightscar by
 *   day 30 via farm + soft pity; craft is optional expensive insurance.
 *
 * UI shows soft “Fortune” bands out of combat only — never mid-fight odds.
 */
export const NIGHTSCAR_PITY_MAX = 8;

/** Epic weight points moved per dry stack. */
export const PITY_EPIC_WEIGHT_PER_STACK = 2;

/** Legendary weight points moved per dry stack. */
export const PITY_LEGENDARY_WEIGHT_PER_STACK = 1;

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
 * Soft-ramp: per pity stack, move {@link PITY_EPIC_WEIGHT_PER_STACK} Epic +
 * {@link PITY_LEGENDARY_WEIGHT_PER_STACK} Legendary weight points from
 * Common then Rare. At max stacks, endgame tables lean into chase rarities
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

  let epicBoost = PITY_EPIC_WEIGHT_PER_STACK * p;
  let legBoost = PITY_LEGENDARY_WEIGHT_PER_STACK * p;
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
