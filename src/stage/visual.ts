import type { HeroClass } from '../data/types';
import { HERO_X } from '../game/combat';

/**
 * Enemy / boss sprites are authored facing **left** (toward the usual hero side).
 * Heroes face right. PvE spawns enemies on the right walking left — leave them
 * unflipped so they look toward the hero. Only flip when an enemy is left of the
 * hero (needs to look right). PR #56 assumed right-facing art and flipped the
 * common case, which made mobs approach backwards.
 */
export function enemyFlipX(enemyX: number, heroX = HERO_X): boolean {
  return enemyX < heroX;
}

/**
 * Camp idle texture for the resting hero.
 * `hero-sleep` is Warrior-only seated art; other classes use their combat sprite
 * so Mage/Ranger/Rogue do not appear as a Warrior at camp.
 */
export function campHeroVisual(heroClass: HeroClass): {
  key: string;
  /** width / height for setDisplaySize */
  aspect: number;
} {
  if (heroClass === 'Warrior') {
    return { key: 'hero-sleep', aspect: 203 / 360 };
  }
  return { key: `hero-${heroClass.toLowerCase()}`, aspect: 360 / 343 };
}
