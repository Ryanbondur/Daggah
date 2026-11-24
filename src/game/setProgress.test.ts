import { describe, expect, it } from 'vitest';
import { rollItem, SET_SLOTS, type Gear } from '../data/gear';
import { NIGHTSCAR_PITY_MAX } from './nightscarPity';
import { mulberry32 } from './rng';
import {
  SET_BONUS_TARGET,
  NIGHTSCAR_SET_ID,
  bonusTierForCount,
  buildSetPieceProgress,
  buildSetProgressSnapshot,
  legendarySlotsForSet,
  pityAdventureHint,
  pityBand,
  setsForTracker,
} from './setProgress';

describe('set progress + pity tracker helpers', () => {
  it('maps pity stacks to soft bands without odds', () => {
    expect(pityBand(0)).toBe('calm');
    expect(pityBand(1)).toBe('rising');
    expect(pityBand(4)).toBe('rising');
    expect(pityBand(5)).toBe('strong');
    expect(pityBand(NIGHTSCAR_PITY_MAX)).toBe('strong');
  });

  it('hides fortune hints mid-fight', () => {
    expect(
      pityAdventureHint(3, { unlocked: true, inBattle: false }),
    ).toBe(`Fortune Rising 3/${NIGHTSCAR_PITY_MAX}`);
    expect(pityAdventureHint(3, { unlocked: true, inBattle: true })).toBe('');
    expect(pityAdventureHint(3, { unlocked: false, inBattle: false })).toBe('');
  });

  it('counts equipped bonus progress and legendary BiS slots', () => {
    const rng = mulberry32(7);
    const gear: Gear = {};
    const bag = [];
    for (let i = 0; i < 4; i++) {
      const slot = SET_SLOTS[i]!;
      gear[slot] = rollItem(rng, {
        slot,
        rarity: i < 2 ? 'legendary' : 'epic',
        gearLevel: 19,
        setId: NIGHTSCAR_SET_ID,
      });
    }
    bag.push(
      rollItem(rng, {
        slot: SET_SLOTS[5]!,
        rarity: 'legendary',
        gearLevel: 19,
        setId: NIGHTSCAR_SET_ID,
      }),
    );

    const prog = buildSetPieceProgress(NIGHTSCAR_SET_ID, gear, bag);
    expect(prog.equipped).toBe(4);
    expect(prog.bonusTier).toBe(4);
    expect(prog.ownedSlots).toBe(5);
    expect(prog.legendarySlots).toBe(3);
    expect(prog.featured).toBe(true);
    expect(legendarySlotsForSet(NIGHTSCAR_SET_ID, gear, bag)).toBe(3);
    expect(bonusTierForCount(6)).toBe(SET_BONUS_TARGET);
  });

  it('lists Nightscar first when unlocked and builds snapshot', () => {
    const ids = setsForTracker({
      heroClass: 'Warrior',
      actUnlocked: 10,
      gear: {},
      bag: [],
    });
    expect(ids[0]).toBe(NIGHTSCAR_SET_ID);

    const snap = buildSetProgressSnapshot({
      heroClass: 'Warrior',
      actUnlocked: 10,
      gear: {},
      bag: [],
      nightscarPity: 6,
      ascendedPity: 0,
      inBattle: false,
      apexUnlocked: true,
      ascendedUnlocked: true,
    });
    expect(snap.nightscar?.name).toBe('Nightscar Regalia');
    expect(snap.pity.apexBand).toBe('strong');
    expect(snap.pity.apexLabel).toContain('Fortune Strong');
    expect(snap.pity.ascendedLabel).toContain('Fortune Calm');

    const fighting = buildSetProgressSnapshot({
      heroClass: 'Warrior',
      actUnlocked: 10,
      gear: {},
      bag: [],
      nightscarPity: 6,
      ascendedPity: 2,
      inBattle: true,
      apexUnlocked: true,
      ascendedUnlocked: true,
    });
    expect(fighting.pity.apexLabel).toBe('');
    expect(fighting.pity.ascendedLabel).toBe('');
  });
});
