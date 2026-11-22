import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { CLAN_CREATE_COST, TOKEN_DAY_CAP, dayKey } from './clan';
import {
  BRACKET_TOKEN_LOSS,
  BRACKET_TOKEN_WIN,
  CLAN_QUEUE_FLOOR_CP,
  CLAN_QUEUE_FLOOR_STAGES,
  TEAM_CP_SCOUT_MAX,
  TEAM_CP_VETERAN_MAX,
  assignBracket,
  bracketTokenReward,
  challengeUpAvailable,
  meetsClanQueueFloor,
  nextBracket,
  teamCpSum,
} from './clanBrackets';
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

async function readyClanGame(seed = 11): Promise<Game> {
  const game = new Game(memoryStorage(), mulberry32(seed));
  game.pickClass('Warrior');
  game.save.crystals = CLAN_CREATE_COST;
  game.save.stagesCleared = CLAN_QUEUE_FLOOR_STAGES;
  game.save.level = 8;
  await game.createClan('Bracket Wolves');
  game.fillAiClanRoster();
  return game;
}

describe('clan CP brackets', () => {
  it('assigns Scout / Veteran / Nightscar from team CP sum', () => {
    expect(assignBracket(0)).toBe('scout');
    expect(assignBracket(TEAM_CP_SCOUT_MAX - 1)).toBe('scout');
    expect(assignBracket(TEAM_CP_SCOUT_MAX)).toBe('veteran');
    expect(assignBracket(TEAM_CP_VETERAN_MAX - 1)).toBe('veteran');
    expect(assignBracket(TEAM_CP_VETERAN_MAX)).toBe('nightscar');
    expect(teamCpSum([{ cp: 900 }, { cp: 900 }, { cp: 900 }, { cp: 900 }])).toBe(3600);
    expect(nextBracket('scout')).toBe('veteran');
    expect(nextBracket('veteran')).toBe('nightscar');
    expect(nextBracket('nightscar')).toBeNull();
  });

  it('scales the same win/loss token shape per tier', () => {
    expect(bracketTokenReward('scout', true)).toBe(BRACKET_TOKEN_WIN.scout);
    expect(bracketTokenReward('scout', false)).toBe(BRACKET_TOKEN_LOSS.scout);
    expect(bracketTokenReward('veteran', true)).toBe(20);
    expect(bracketTokenReward('nightscar', true)).toBe(25);
    expect(BRACKET_TOKEN_WIN.scout).toBeLessThan(BRACKET_TOKEN_WIN.veteran);
    expect(BRACKET_TOKEN_WIN.veteran).toBeLessThan(BRACKET_TOKEN_WIN.nightscar);
  });

  it('soft-floors 4v4 until Act 3 clear or mid CP', async () => {
    expect(meetsClanQueueFloor(0, 100)).toBe(false);
    expect(meetsClanQueueFloor(CLAN_QUEUE_FLOOR_STAGES, 100)).toBe(true);
    expect(meetsClanQueueFloor(0, CLAN_QUEUE_FLOOR_CP)).toBe(true);

    const game = new Game(memoryStorage(), mulberry32(3));
    game.pickClass('Ranger');
    game.save.crystals = CLAN_CREATE_COST;
    game.save.stagesCleared = 0;
    await game.createClan('Too Early');
    game.fillAiClanRoster();
    const err = game.queueClanPvp();
    expect(err).toMatch(/Act 3|550 CP/i);
    expect(game.save.clanWins + game.save.clanLosses).toBe(0);

    game.save.stagesCleared = CLAN_QUEUE_FLOOR_STAGES;
    expect(game.queueClanPvp()).toBeNull();
    expect(game.save.clanWins + game.save.clanLosses).toBe(1);
  });

  it('allows one challenge-up per calendar day and scales rewards to match tier', async () => {
    const game = await readyClanGame(42);
    // Keep natural bracket below Nightscar so challenge-up is available.
    for (const m of game.save.clan!.members) {
      if (!m.isPlayer) m.cp = 400;
    }
    const status = game.clanBracketStatus();
    expect(status.bracket).not.toBe('nightscar');
    expect(status.challengeUpLeft).toBe(1);
    expect(status.canChallengeUp).toBe(true);
    const expected = status.nextBracket!;

    let bracket = '';
    let challengeUp = false;
    game.on((e) => {
      if (e.t === 'pvp') {
        bracket = e.result.bracket;
        challengeUp = e.result.challengeUp;
      }
    });
    expect(game.queueClanPvp({ challengeUp: true })).toBeNull();
    game.finishPvpPlayback();
    expect(challengeUp).toBe(true);
    expect(bracket).toBe(expected);
    expect(game.save.clanChallengeUpDayKey).toBe(dayKey());
    expect(game.clanBracketStatus().challengeUpLeft).toBe(0);
    expect(game.queueClanPvp({ challengeUp: true })).toMatch(/already used/i);

    expect(game.save.clanTokens).toBeGreaterThanOrEqual(BRACKET_TOKEN_LOSS[expected]);
    expect(challengeUpAvailable(game.save.clanChallengeUpDayKey, dayKey())).toBe(false);
    expect(challengeUpAvailable(game.save.clanChallengeUpDayKey, '2099-01-01')).toBe(true);
  });

  it('gates Nightscar-exclusive armorer legendaries until a Nightscar match', async () => {
    const game = await readyClanGame(7);
    game.save.clanTokens = 80;
    game.save.level = 18;
    expect(game.buyClanVendor(4)).toMatch(/Nightscar/i);

    for (const m of game.save.clan!.members) {
      if (!m.isPlayer) m.cp = 2200;
    }
    expect(game.clanBracketStatus().bracket).toBe('nightscar');
    expect(game.queueClanPvp()).toBeNull();
    game.finishPvpPlayback();
    expect(game.save.clanNightscarUnlocked).toBe(true);
    expect(game.buyClanVendor(4)).toBeNull();
    expect(game.save.clanTokens).toBeLessThan(80);
  });

  it('keeps day cap while awarding bracket-scaled tokens', async () => {
    const game = await readyClanGame(9);
    game.save.clanTokensEarnedToday = TOKEN_DAY_CAP - 3;
    for (const m of game.save.clan!.members) m.cp = 500;
    expect(game.queueClanPvp()).toBeNull();
    game.finishPvpPlayback();
    expect(game.save.clanTokensEarnedToday).toBe(TOKEN_DAY_CAP);
  });
});
