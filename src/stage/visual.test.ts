import { describe, expect, it } from 'vitest';
import { HERO_X } from '../game/combat';
import { campHeroVisual, enemyFlipX } from './visual';

describe('enemyFlipX', () => {
  it('does not flip enemies on the hero’s right (left-facing art already looks toward them)', () => {
    expect(enemyFlipX(1.08)).toBe(false);
    expect(enemyFlipX(HERO_X + 0.13)).toBe(false);
    expect(enemyFlipX(HERO_X)).toBe(false);
  });

  it('flips when an enemy is left of the hero so left-facing art looks right toward them', () => {
    expect(enemyFlipX(HERO_X - 0.05)).toBe(true);
  });
});

describe('campHeroVisual', () => {
  it('uses Warrior seated sleep art at camp', () => {
    expect(campHeroVisual('Warrior').key).toBe('hero-sleep');
  });

  it('binds camp idle to the selected class instead of Warrior sleep default', () => {
    expect(campHeroVisual('Mage').key).toBe('hero-mage');
    expect(campHeroVisual('Ranger').key).toBe('hero-ranger');
    expect(campHeroVisual('Rogue').key).toBe('hero-rogue');
  });
});
