import { describe, expect, it } from 'vitest';
import { estimateStageRecCp, rarityAtMost, rarityBelow, rollItem, sellValue } from '../data/gear';
import { stageRecCp } from '../data/acts';
import { Game } from './game';
import { mulberry32 } from './rng';
import { SAVE_KEY, type Storage } from './state';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('stage CP tension', () => {
  it('estimates rising recommended CP by stage', () => {
    expect(estimateStageRecCp(1)).toBeGreaterThan(200);
    expect(stageRecCp(2, 1)).toBeGreaterThan(stageRecCp(1, 1));
    expect(stageRecCp(10, 5)).toBeGreaterThan(stageRecCp(5, 3));
  });

  it('reports underpowered when CP is below stage rec', () => {
    const game = new Game(memoryStorage(), mulberry32(1));
    game.pickClass('Warrior');
    const r = game.stagePowerReadout(0);
    expect(r.yourCp).toBe(game.cp);
    expect(r.recCp).toBe(stageRecCp(1, 1));
    expect(typeof r.underpowered).toBe('boolean');
  });
});

describe('bag overflow salvage / sell', () => {
  it('auto-salvages loot at or below rarity threshold', () => {
    const game = new Game(memoryStorage(), mulberry32(2));
    game.pickClass('Warrior');
    game.setAutoSalvageRarityMax('common');
    game.setAutoSalvageWorse(false);
    const common = rollItem(mulberry32(11), { gearLevel: 1, rarity: 'common', slot: 'ring' });
    const rare = rollItem(mulberry32(12), { gearLevel: 1, rarity: 'rare', slot: 'helmet' });
    expect(game.shouldAutoSalvage(common)).toBe(true);
    expect(game.shouldAutoSalvage(rare)).toBe(false);
    game.queueLoot([common, rare], false);
    expect(game.save.pending.some((i) => i.id === rare.id)).toBe(true);
    expect(game.save.pending.some((i) => i.id === common.id)).toBe(false);
    expect(game.save.salvageCount).toBe(1);
  });

  it('salvages and sells bag items below a rarity ceiling', () => {
    const game = new Game(memoryStorage(), mulberry32(3));
    game.pickClass('Mage');
    const a = rollItem(mulberry32(21), { gearLevel: 1, rarity: 'common', slot: 'ring' });
    const b = rollItem(mulberry32(22), { gearLevel: 1, rarity: 'rare', slot: 'helmet' });
    const c = rollItem(mulberry32(23), { gearLevel: 1, rarity: 'epic', slot: 'weapon' });
    game.save.bag.push(a, b, c);
    expect(rarityBelow(a, 'rare')).toBe(true);
    expect(rarityAtMost(b, 'rare')).toBe(true);
    const n = game.salvageBagBelow('rare');
    expect(n).toBe(1);
    expect(game.save.bag.map((i) => i.rarity)).toEqual(['rare', 'epic']);
    const goldBefore = game.save.gold;
    const sold = game.sellBagBelow('epic');
    expect(sold.count).toBe(1);
    expect(sold.gold).toBe(sellValue(b));
    expect(game.save.gold).toBe(goldBefore + sold.gold);
    expect(game.save.bag).toHaveLength(1);
    expect(game.save.bag[0].rarity).toBe('epic');
  });
});

describe('mute persists', () => {
  it('stores muted in settings across reload', () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(4));
    game.pickClass('Ranger');
    expect(game.muted).toBe(false);
    game.setMuted(true);
    expect(JSON.parse(store.getItem(SAVE_KEY)!).settings.muted).toBe(true);
    const again = new Game(store, mulberry32(4));
    expect(again.muted).toBe(true);
  });
});
