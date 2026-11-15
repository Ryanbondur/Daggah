import { describe, expect, it } from 'vitest';
import { HERO_X } from '../game/combat';
import { campHeroVisual, enemyFlipX } from './visual';

describe('enemyFlipX', () => {
  it('flips enemies on the hero’s right so right-facing art looks left toward the hero', () => {
    expect(enemyFlipX(1.08)).toBe(true);
    expect(enemyFlipX(HERO_X + 0.13)).toBe(true);
    expect(enemyFlipX(HERO_X)).toBe(true);
  });

  it('does not flip when an enemy is left of the hero (faces right, toward them)', () => {
    expect(enemyFlipX(HERO_X - 0.05)).toBe(false);
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
