import { describe, expect, it } from 'vitest';
import { ACTS } from '../data/acts';
import { rollItem } from '../data/gear';
import type { SlotId } from '../data/types';
import { Game } from './game';
import {
  OFFLINE_CAP_MS,
  OFFLINE_MIN_MS,
  applyOfflineProgress,
  formatOfflineToast,
  hasMeaningfulGains,
} from './offline';
import { mulberry32 } from './rng';
import type { Storage } from './state';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const SLOTS: SlotId[] = [
  'weapon',
  'chest',
  'belt',
  'helmet',
  'gloves',
  'bracers',
  'shoulders',
  'legs',
  'boots',
  'amulet',
  'medal',
  'ring',
];

/** Overgear a fresh Warrior so early stages clear quickly in headless sim. */
function gearedWarrior(seed = 99): Game {
  const rng = mulberry32(seed);
  const game = new Game(memoryStorage(), rng);
  game.pickClass('Warrior');
  game.save.level = 10;
  game.save.settings.speed = 2;
  for (const slot of SLOTS) {
    game.save.gear[slot] = rollItem(rng, {
      gearLevel: 8,
      rarity: 'legendary',
      slot,
      setId: 'ember-raider',
    });
  }
  return game;
}

describe('offline / AFK catch-up', () => {
  it('ignores tiny visibility blips under the minimum', () => {
    const game = gearedWarrior();
    game.startBattle();
    const gold = game.save.gold;
    const summary = applyOfflineProgress(game, OFFLINE_MIN_MS - 1);
    expect(summary).toBeNull();
    expect(game.save.gold).toBe(gold);
  });

  it('caps catch-up wall time and advances campaign stages', () => {
    const game = gearedWarrior(7);
    game.startBattle();
    const beforeCleared = game.save.stagesCleared;
    const beforeGold = game.save.gold;
    const keysBefore = game.save.keys;

    const huge = OFFLINE_CAP_MS + 3 * 60 * 60 * 1000;
    const summary = applyOfflineProgress(game, huge);
    expect(summary).not.toBeNull();
    expect(summary!.capped).toBe(true);
    expect(summary!.appliedMs).toBe(OFFLINE_CAP_MS);
    expect(summary!.startedIn).toBe('stage');
    // Meaningful campaign progress within the cap.
    expect(summary!.stagesCleared).toBeGreaterThan(0);
    expect(game.save.stagesCleared).toBe(beforeCleared + summary!.stagesCleared);
    expect(game.save.gold).toBeGreaterThanOrEqual(beforeGold + summary!.gold);
    // Campaign AFK must not spend dungeon keys.
    expect(game.save.keys).toBe(keysBefore);
    expect(hasMeaningfulGains(summary!)).toBe(true);
    expect(formatOfflineToast(summary!)).toMatch(/AFK/);
    expect(formatOfflineToast(summary!)).toMatch(/capped/);
  });

  it('sim tick grants XP/gold without relying on rAF', () => {
    const game = gearedWarrior(11);
    game.startBattle();
    const summary = applyOfflineProgress(game, 90_000);
    expect(summary).not.toBeNull();
    expect(summary!.appliedMs).toBe(90_000);
    expect(summary!.capped).toBe(false);
    expect(summary!.xp + summary!.gold + summary!.stagesCleared).toBeGreaterThan(0);
  });

  it('finishes an in-progress dungeon once and does not auto-spend more keys', () => {
    const game = gearedWarrior(13);
    game.devUnlockThroughAct(1);
    const dungeon = ACTS[0].dungeon!;
    const keysBefore = game.save.keys;
    expect(game.startDungeon(dungeon.id)).toBe(true);
    expect(game.save.keys).toBe(keysBefore - 1);
    const keysAfterEntry = game.save.keys;

    // Plenty of sim time: should clear the paid run, then stop (no re-entry).
    const summary = applyOfflineProgress(game, 30 * 60 * 1000);
    expect(summary).not.toBeNull();
    expect(summary!.startedIn).toBe('dungeon');
    expect(summary!.dungeonEnded).toBe(true);
    expect(game.mode).toBe('camp');
    expect(game.battle).toBeNull();
    expect(game.save.keys).toBe(keysAfterEntry);
    expect(game.dungeonCleared(dungeon)).toBe(true);
  });

  it('Game.applyOffline mirrors the helper and toasts a summary', () => {
    const game = gearedWarrior(17);
    game.startBattle();
    const toasts: string[] = [];
    game.on((e) => {
      if (e.t === 'toast') toasts.push(e.text);
    });
    const summary = game.applyOffline(120_000);
    expect(summary).not.toBeNull();
    if (summary && hasMeaningfulGains(summary)) {
      expect(toasts.some((t) => t.startsWith('AFK'))).toBe(true);
    }
  });

  it('does nothing when idle at camp', () => {
    const game = gearedWarrior(19);
    expect(game.mode).toBe('camp');
    expect(applyOfflineProgress(game, 60_000)).toBeNull();
  });
});
