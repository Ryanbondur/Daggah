import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../game/rng';
import { rollItem } from '../data/gear';
import { cmpBtnLabel, salvageRewardLabel } from './modals';

describe('compare prompt button labels', () => {
  it('splits title and sub line into separate spans', () => {
    expect(cmpBtnLabel('Replace', 'anyway')).toBe(
      '<span class="bt">Replace</span><span class="bs">anyway</span>',
    );
  });

  it('puts the salvage reward on one compact line', () => {
    const item = rollItem(mulberry32(3), { gearLevel: 5, rarity: 'rare', slot: 'weapon' });
    const label = salvageRewardLabel(item);
    expect(label).toMatch(/^<span class="chip">\+\d+ dust<\/span>( <span class="chip">\+\d+✦<\/span>)?$/);
    expect(label).not.toContain('Salvage');
  });
});
