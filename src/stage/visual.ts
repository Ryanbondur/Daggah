import type { HeroClass } from '../data/types';
import { ENEMY_APPROACH_SPAWN_X, HERO_X } from '../game/combat';
import { heroSpriteAspect } from '../ui/portrait';

/**
 * Enemy / boss sprites are authored facing **left** (toward the usual hero side).
 * Heroes face right. Act / dungeon / Clan Raid foes spawn east (`ENEMY_APPROACH_SPAWN_X`)
 * and walk west — leave them unflipped so they look toward the party. Only flip when
 * an enemy is left of the face-toward X (needs to look right).
 *
 * History: PR #56 assumed right-facing art and flipped the common east approach
 * (backs toward the hero). #61 inverted `enemyFlipX` for Acts; #68 wired Clan Raid
 * through `enemyFaceTowardX`. This helper is the single flip contract for both.
 */
export function enemyFlipX(enemyX: number, faceTowardX = HERO_X): boolean {
  return enemyX < faceTowardX;
}

/**
 * X enemies should face toward. Solo Act / dungeon stages use the hero; Clan Raid
 * uses the rightmost living ally so the boss (and phase adds) look at the party lanes.
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
 * Act trash/boss walk-in: east of the hero, left-facing art must stay unflipped.
 * Used by tests to lock the spawn / mid-approach / engage flip contract.
 */
export function actApproachShouldFlipX(enemyX: number): boolean {
  return enemyFlipX(enemyX, enemyFaceTowardX({ heroX: HERO_X }));
}

/** Re-export spawn X so stage tests share the combat spawn constant. */
export { ENEMY_APPROACH_SPAWN_X };

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
