import { describe, expect, it } from 'vitest';
import { ENEMY_APPROACH_SPAWN_X, HERO_X, RAID_BOSS_LINE } from '../game/combat';
import {
  actApproachShouldFlipX,
  campHeroVisual,
  enemyFaceTowardX,
  enemyFlipX,
} from './visual';

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

describe('Act approach facing (trash + boss walk-in)', () => {
  it('keeps a trash pack unflipped from spawn through mid-approach and engage', () => {
    // Spawn stagger matches Battle.spawnNode / ENEMY_APPROACH_SPAWN_X + i * 0.07
    const packXs = [0, 1, 2, 3, 4].map((i) => ENEMY_APPROACH_SPAWN_X + i * 0.07);
    for (const x of packXs) {
      expect(actApproachShouldFlipX(x)).toBe(false);
    }
    // Mid-walk (still east of hero)
    expect(actApproachShouldFlipX(0.75)).toBe(false);
    expect(actApproachShouldFlipX(0.55)).toBe(false);
    // Engage line (HERO_X + 0.13)
    expect(actApproachShouldFlipX(HERO_X + 0.13)).toBe(false);
  });

  it('keeps Act bosses unflipped while approaching from the east', () => {
    expect(actApproachShouldFlipX(ENEMY_APPROACH_SPAWN_X)).toBe(false);
    expect(actApproachShouldFlipX(1.15)).toBe(false);
    expect(actApproachShouldFlipX(0.86)).toBe(false);
    expect(actApproachShouldFlipX(HERO_X + 0.13)).toBe(false);
  });

  it('would flip only if an Act foe somehow crossed left of the hero', () => {
    expect(actApproachShouldFlipX(HERO_X - 0.02)).toBe(true);
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
  it('uses Warrior seated sleep art at camp', () => {
    expect(campHeroVisual('Warrior').key).toBe('hero-sleep');
  });

  it('binds camp idle to the selected class instead of Warrior sleep default', () => {
    expect(campHeroVisual('Mage').key).toBe('hero-mage');
    expect(campHeroVisual('Ranger').key).toBe('hero-ranger');
    expect(campHeroVisual('Rogue').key).toBe('hero-rogue');
  });
});
