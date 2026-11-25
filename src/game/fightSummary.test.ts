import { describe, expect, it } from 'vitest';
import type { RaidAlly } from './combat';
import {
  buildActDpsBoard,
  freshActFightAccum,
  summaryFromAct,
  summaryFromPvp,
} from './fightSummary';
import type { PvpResult } from './pvp';

function ally(partial: Partial<RaidAlly> & Pick<RaidAlly, 'id' | 'name' | 'heroClass'>): RaidAlly {
  return {
    isPlayer: false,
    isAi: true,
    x: 0.2,
    hp: 100,
    maxHp: 100,
    atk: 10,
    defense: 5,
    haste: 0,
    swingT: 0,
    swingAnim: 0,
    hitFlash: 0,
    dead: false,
    deathT: 0,
    damageDealt: 0,
    ...partial,
  };
}

describe('fightSummary', () => {
  it('ranks solo Act damage into a one-row DPS board', () => {
    const board = buildActDpsBoard({
      name: 'You',
      heroClass: 'Warrior',
      heroDamage: 1200,
      duration: 40,
    });
    expect(board).toHaveLength(1);
    expect(board[0]!.damage).toBe(1200);
    expect(board[0]!.dps).toBe(30);
    expect(board[0]!.rank).toBe(1);
    expect(board[0]!.isPlayer).toBe(true);
  });

  it('includes Clan Raid allies on the DPS board', () => {
    const board = buildActDpsBoard({
      name: 'You',
      heroClass: 'Mage',
      heroDamage: 800,
      duration: 20,
      allies: [
        ally({ id: 'a1', name: 'Tank', heroClass: 'Warrior', damageDealt: 500, isPlayer: false }),
        ally({ id: 'me', name: 'You', heroClass: 'Mage', damageDealt: 800, isPlayer: true }),
      ],
    });
    expect(board).toHaveLength(2);
    expect(board[0]!.name).toBe('You');
    expect(board[1]!.name).toBe('Tank');
    expect(board[1]!.dps).toBe(25);
  });

  it('builds an Act summary with KO order and loot', () => {
    const accum = freshActFightAccum();
    accum.damageHero = 400;
    accum.heroDeaths = 1;
    accum.kills.push({ name: 'Ember Imp', side: 'foe', role: 'trash', time: 3 });
    accum.kills.push({ name: 'Hollow King', side: 'foe', role: 'boss', time: 28 });
    const summary = summaryFromAct({
      kind: 'stage',
      title: 'Act 1-1',
      success: true,
      duration: 30,
      accum,
      heroName: 'You',
      heroClass: 'Warrior',
      loot: [],
    });
    expect(summary.duration).toBe(30);
    expect(summary.deaths).toBe(1);
    expect(summary.koOrder.map((k) => k.name)).toEqual(['Ember Imp', 'Hollow King']);
    expect(summary.dpsBoard[0]!.damage).toBe(400);
  });

  it('maps PvP kills into shared last-fight KO strip', () => {
    const result = {
      won: true,
      allyKills: 4,
      enemyKills: 1,
      duration: 55,
      timedOut: false,
      log: [
        {
          t: 'kill' as const,
          text: 'A fell',
          time: 12,
          target: 'Rival Mage',
          targetTeam: 'enemy' as const,
        },
        {
          t: 'kill' as const,
          text: 'B fell',
          time: 40,
          target: 'Ally Rogue',
          targetTeam: 'ally' as const,
        },
      ],
      playback: [],
      fighters: [],
      allyHpLeft: 1,
      enemyHpLeft: 0,
      allyTeam: [{ name: 'You', heroClass: 'Warrior' as const, hp: 10, maxHp: 10, isAi: false }],
      enemyTeam: [],
      practiceAi: true,
      bracket: 'scout' as const,
      challengeUp: false,
      teamCp: 1000,
      dpsBoard: [
        {
          id: '1',
          name: 'You',
          heroClass: 'Warrior' as const,
          team: 'ally' as const,
          isPlayer: true,
          isAi: false,
          damage: 900,
          dps: 16.4,
          rank: 1,
        },
      ],
      mvp: null,
      matchBandLabel: '±8%',
    } satisfies PvpResult;
    const summary = summaryFromPvp(result, 12);
    expect(summary.kind).toBe('pvp');
    expect(summary.tokens).toBe(12);
    expect(summary.koOrder).toHaveLength(2);
    expect(summary.koOrder[0]!.side).toBe('foe');
    expect(summary.dpsBoard[0]!.damage).toBe(900);
  });
});
