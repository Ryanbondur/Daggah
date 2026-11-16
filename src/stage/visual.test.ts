import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_CLASSES } from '../data/types';
import { HERO_X, RAID_BOSS_LINE } from '../game/combat';
import { campHeroVisual, enemyFaceTowardX, enemyFlipX } from './visual';

describe('enemyFlipX', () => {
  it('does not flip enemies on the hero’s right (left-facing art already looks toward them)', () => {
    expect(enemyFlipX(1.08)).toBe(false);
    expect(enemyFlipX(HERO_X + 0.13)).toBe(false);
    expect(enemyFlipX(HERO_X)).toBe(false);
  });

  it('flips when an enemy is left of the hero so left-facing art looks right toward them', () => {
    expect(enemyFlipX(HERO_X - 0.05)).toBe(true);
  });

  it('keeps Clan Raid boss / adds unflipped while east of the party (face the lanes)', () => {
    const partyX = enemyFaceTowardX({
      raidAllies: [
        { x: 0.1 },
        { x: 0.2 },
        { x: 0.3 },
        { x: 0.4 },
      ],
    });
    expect(partyX).toBe(0.4);
    expect(enemyFlipX(1.15, partyX)).toBe(false);
    expect(enemyFlipX(RAID_BOSS_LINE, partyX)).toBe(false);
    expect(enemyFlipX(1.08, partyX)).toBe(false);
  });
});

describe('enemyFaceTowardX', () => {
  it('falls back to HERO_X outside Clan Raid', () => {
    expect(enemyFaceTowardX({})).toBe(HERO_X);
    expect(enemyFaceTowardX({ raidAllies: [] })).toBe(HERO_X);
  });

  it('ignores dead raid allies when picking the face-toward X', () => {
    expect(
      enemyFaceTowardX({
        raidAllies: [
          { x: 0.1 },
          { x: 0.4, dead: true },
          { x: 0.3 },
        ],
      }),
    ).toBe(0.3);
  });
});

describe('campHeroVisual', () => {
  it('rests every class in its own combat sprite (Warrior no longer uses the off-model sleep art)', () => {
    expect(campHeroVisual('Warrior').key).toBe('hero-warrior');
    expect(campHeroVisual('Mage').key).toBe('hero-mage');
    expect(campHeroVisual('Ranger').key).toBe('hero-ranger');
    expect(campHeroVisual('Rogue').key).toBe('hero-rogue');
  });

  it('maps each class to a distinct texture whose file exists', () => {
    const keys = HERO_CLASSES.map((c) => campHeroVisual(c).key);
    expect(new Set(keys).size).toBe(HERO_CLASSES.length);
    for (const k of keys) {
      expect(existsSync(resolve(__dirname, `../../public/assets/sprites/${k}.webp`))).toBe(true);
    }
    expect(keys).not.toContain('hero-sleep');
  });

  it('keeps the sprite aspect per class (no stretch)', () => {
    expect(campHeroVisual('Mage').aspect).toBeCloseTo(317 / 360, 5);
    expect(campHeroVisual('Warrior').aspect).toBeCloseTo(360 / 342, 5);
  });
});
