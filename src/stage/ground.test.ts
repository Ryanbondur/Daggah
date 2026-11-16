import { describe, expect, it } from 'vitest';
import { ENEMY_SPRITES } from '../ui/assets';
import { FOOT_PAD } from './footPad';
import { GROUND_LINE, footOriginY, footPad, groundLineY, spriteTopY } from './ground';

describe('shared ground line', () => {
  it('is a fraction of stage height so it scales across screen sizes', () => {
    expect(GROUND_LINE).toBeGreaterThan(0.8);
    expect(GROUND_LINE).toBeLessThan(1);
    expect(groundLineY(100)).toBeCloseTo(GROUND_LINE * 100);
    expect(groundLineY(322) / 322).toBeCloseTo(groundLineY(640) / 640);
  });

  it('has a foot pad for every mob, elite, boss, hero and the camp prop', () => {
    const keys = [
      ...ENEMY_SPRITES,
      'hero-warrior',
      'hero-mage',
      'hero-ranger',
      'hero-rogue',
      'hero-sleep',
      'camp',
    ];
    for (const key of keys) {
      const pad = footPad(key);
      expect(pad, key).toBeGreaterThan(0);
      expect(pad, key).toBeGreaterThanOrEqual(0);
      expect(pad, key).toBeLessThan(0.15);
    }
    for (const key of ENEMY_SPRITES) expect(FOOT_PAD[key], key).toBeDefined();
  });

  it('anchors by the feet: origin Y is 1 minus the foot pad', () => {
    expect(footOriginY('boss-bog-hydra')).toBeCloseTo(1 - FOOT_PAD['boss-bog-hydra']!);
    expect(footOriginY('unknown-texture')).toBe(1);
    expect(footOriginY('hero-sleep')).toBeCloseTo(1 - FOOT_PAD['hero-sleeping']!);
    expect(footOriginY('camp')).toBeCloseTo(1 - FOOT_PAD['camp-tent-fire']!);
  });

  it('puts bar anchors at the visible top of the sprite', () => {
    const feet = groundLineY(300);
    const h = 100;
    expect(spriteTopY(feet, h, 'unknown-texture')).toBeCloseTo(feet - h);
    expect(spriteTopY(feet, h, 'boss-bog-hydra')).toBeGreaterThan(feet - h);
  });
});
