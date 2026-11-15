import { describe, expect, it } from 'vitest';
import { ASCENDED_NIGHTSCAR_DEF, getDungeon } from '../data/acts';
import { baseDropWeights } from '../data/gear';
import { Game } from './game';
import {
  ASCENDED_NIGHTSCAR,
  ASCENDED_NIGHTSCAR_KEY_COST,
  ASCENDED_NIGHTSCAR_SEAL_COST,
  ASCENDED_SEAL_FRAGMENTS_PER_SEAL,
  formatAscendedEntryCost,
  isAscendedDungeon,
  sealsCraftableFrom,
} from './ascended';
import { mulberry32 } from './rng';
import { SWEEP_UNLOCK_CLEARS } from './state';

function endgameGame(): Game {
  const game = new Game(undefined, mulberry32(42));
  game.save.classPicked = true;
  game.save.level = 20;
  game.save.keys = 8;
  game.save.stagesCleared = 50;
  game.save.ascendedSeals = 3;
  game.save.ascendedSealFragments = 0;
  return game;
}

describe('ascended constants', () => {
  it('resolves Ascended Nightscar via getDungeon', () => {
    expect(getDungeon('nightscar-ascended')).toEqual(ASCENDED_NIGHTSCAR_DEF);
    expect(isAscendedDungeon(ASCENDED_NIGHTSCAR)).toBe(true);
    expect(isAscendedDungeon(getDungeon('nightscar-apex'))).toBe(false);
  });

  it('costs more keys than Apex plus a seal', () => {
    expect(ASCENDED_NIGHTSCAR_KEY_COST).toBeGreaterThan(4);
    expect(ASCENDED_NIGHTSCAR_SEAL_COST).toBe(1);
    expect(formatAscendedEntryCost()).toContain('Seal');
  });

  it('ascended boss table has higher legendary weight than nightscar boss', () => {
    const night = baseDropWeights('nightscar-boss').legendary;
    const asc = baseDropWeights('ascended-boss').legendary;
    expect(asc).toBeGreaterThan(night);
  });

  it('crafts seals from fragments at 5:1', () => {
    expect(sealsCraftableFrom(4)).toBe(0);
    expect(sealsCraftableFrom(5)).toBe(1);
    expect(sealsCraftableFrom(12)).toBe(2);
    expect(ASCENDED_SEAL_FRAGMENTS_PER_SEAL).toBe(5);
  });
});

describe('Ascended Nightscar entry', () => {
  it('rejects entry without Nightscar unlock', () => {
    const game = endgameGame();
    game.save.stagesCleared = 40;
    expect(game.startAscendedDungeon()).toBe(false);
    expect(game.save.ascendedSeals).toBe(3);
    expect(game.save.keys).toBe(8);
  });

  it('spends keys + seal and starts a harder run', () => {
    const game = endgameGame();
    expect(game.startAscendedDungeon()).toBe(true);
    expect(game.save.keys).toBe(8 - ASCENDED_NIGHTSCAR_KEY_COST);
    expect(game.save.ascendedSeals).toBe(2);
    expect(game.mode).toBe('dungeon');
    expect(game.battle?.run.title).toBe('Ascended Nightscar');
    const apexTier = game.buildDungeonRun(getDungeon('nightscar-apex')).nodes[0]!.tier;
    const ascTier = game.battle!.run.nodes[0]!.tier;
    expect(ascTier).toBeGreaterThan(apexTier);
  });

  it('blocks entry when seals are missing', () => {
    const game = endgameGame();
    game.save.ascendedSeals = 0;
    expect(game.startAscendedDungeon()).toBe(false);
    expect(game.save.keys).toBe(8);
  });

  it('crafts fragments into seals', () => {
    const game = endgameGame();
    game.save.ascendedSeals = 0;
    game.save.ascendedSealFragments = 11;
    expect(game.craftAllAscendedSeals()).toBeNull();
    expect(game.save.ascendedSeals).toBe(2);
    expect(game.save.ascendedSealFragments).toBe(1);
  });

  it('sweepAscendedDungeon spends premium cost and rolls ascended loot', () => {
    const game = endgameGame();
    game.save.dungeons[ASCENDED_NIGHTSCAR.id] = { cleared: true, clears: SWEEP_UNLOCK_CLEARS };
    game.save.keys = 8;
    game.save.ascendedSeals = 2;
    expect(game.sweepAscendedDungeon()).toBe(true);
    expect(game.save.keys).toBe(8 - ASCENDED_NIGHTSCAR_KEY_COST);
    expect(game.save.ascendedSeals).toBe(1);
    expect(game.save.dungeons[ASCENDED_NIGHTSCAR.id]?.clears).toBe(SWEEP_UNLOCK_CLEARS + 1);
  });
});
