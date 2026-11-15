import type { HeroClass } from '../data/types';
import { HERO_X } from '../game/combat';

/**
 * Enemy / boss sprites are authored facing right (same convention as heroes).
 * In PvE they spawn on the right and approach the hero on the left, so they
 * must be flipped to face the hero. Without this they appear to walk in backwards.
 */
export function enemyFlipX(enemyX: number, heroX = HERO_X): boolean {
  return enemyX >= heroX;
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
