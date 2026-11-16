import type { HeroClass } from '../data/types';
import { HERO_X } from '../game/combat';
import { heroSpriteAspect } from '../ui/portrait';

/**
 * Enemy / boss sprites are authored facing **left** (toward the usual hero side).
 * Heroes face right. PvE / Clan Raid spawn foes on the right walking left — leave
 * them unflipped so they look toward the party. Only flip when an enemy is left
 * of the face-toward X (needs to look right). PR #56 assumed right-facing art
 * and flipped the common case, which made mobs approach backwards.
 */
export function enemyFlipX(enemyX: number, faceTowardX = HERO_X): boolean {
  return enemyX < faceTowardX;
}

/**
 * X enemies should face toward. Solo stages use the hero; Clan Raid uses the
 * rightmost living ally so the boss (and phase adds) look at the party lanes.
 */
export function enemyFaceTowardX(opts: {
  heroX?: number;
  raidAllies?: ReadonlyArray<{ x: number; dead?: boolean }>;
}): number {
  const heroX = opts.heroX ?? HERO_X;
  const living = (opts.raidAllies ?? []).filter((a) => !a.dead);
  if (!living.length) return heroX;
  return Math.max(heroX, ...living.map((a) => a.x));
}

/**
 * Camp idle texture for the resting hero. Every class rests in its own combat
 * sprite so the camp model always matches the hero (the old Warrior-only
 * `hero-sleep` art was a different character: no horns, grey helm).
 */
export function campHeroVisual(heroClass: HeroClass): {
  key: string;
  /** width / height for setDisplaySize */
  aspect: number;
} {
  return { key: `hero-${heroClass.toLowerCase()}`, aspect: heroSpriteAspect(heroClass) };
}
