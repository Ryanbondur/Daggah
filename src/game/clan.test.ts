import { describe, expect, it } from 'vitest';
import { computeHero, rollItem, setCounts } from '../data/gear';
import { DEFAULT_LOADOUT } from '../data/skills';
import { Game } from './game';
import {
  CLAN_CREATE_COST,
  CLAN_MAX_SIZE,
  TOKEN_DAY_CAP,
  TOKEN_LOSS,
  TOKEN_WIN,
  admitRealMember,
  applyTokenCap,
  buildClanLeaderboard,
  clanSeasonScore,
  createClan,
  fillAiRoster,
  findWeakestAiMember,
  pickQueueRoster,
  recruitForRoster,
  rosterReady,
} from './clan';
import { PVP_TIMEOUT_S, simulatePvp, buildOpponentRoster } from './pvp';
import { matchCpBandForQueue, MATCH_CP_BANDS, PRACTICE_MATCH_WAIT_S } from './clanBrackets';
import { mulberry32 } from './rng';
import type { Storage } from './state';
import { SAVE_KEY, defaultSave, loadSave, writeSave } from './state';

function snap(
  heroClass: 'Warrior' | 'Mage' | 'Ranger' | 'Rogue',
  level: number,
  cp: number,
  humanId = 'human_test',
) {
  return {
    heroClass,
    level,
    cp,
    loadout: [...DEFAULT_LOADOUT[heroClass]],
    primary: null as null,
    humanId,
    name: 'You',
  };
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('clan shell', () => {
  it('creates a clan for crystal cost and fills AI teammates for other classes', () => {
    const game = new Game(memoryStorage(), mulberry32(42));
    game.pickClass('Warrior');
    game.save.crystals = CLAN_CREATE_COST;
    expect(game.createClan('Test Wolves')).toBeNull();
    expect(game.save.crystals).toBe(0);
    expect(game.clan?.name).toBe('Test Wolves');
    expect(game.clanRosterReady()).toBe(false);
    expect(game.fillAiClanRoster()).toBeNull();
    expect(game.clanRosterReady()).toBe(true);
    const roster = pickQueueRoster(game.clan!.members, 'Warrior');
    expect(roster?.map((m) => m.heroClass).sort()).toEqual(['Mage', 'Ranger', 'Rogue', 'Warrior'].sort());
    expect(roster?.find((m) => m.isPlayer)?.isAi).toBe(false);
    expect(roster?.filter((m) => !m.isPlayer).every((m) => m.isAi)).toBe(true);
  });

  it('rejects unknown join codes until a hall is published', () => {
    const game = new Game(memoryStorage(), mulberry32(7));
    game.pickClass('Mage');
    expect(game.joinClan('AB12CD')).toMatch(/No clan/i);
    expect(game.clan).toBeNull();
  });

  it('lets a real player join by code and replaces the weakest AI (lowest CP)', () => {
    const shared = memoryStorage();
    const leader = new Game(shared, mulberry32(7));
    leader.pickClass('Warrior');
    leader.save.crystals = CLAN_CREATE_COST;
    expect(leader.createClan('Open Hall')).toBeNull();
    expect(leader.fillAiClanRoster()).toBeNull();
    const code = leader.clan!.code;
    const beforeAi = leader.clan!.members.filter((m) => m.isAi);
    expect(beforeAi.length).toBeGreaterThan(0);
    const weakestCp = Math.min(...beforeAi.map((m) => m.cp));

    // Second save shares hall registry storage but keeps its own progress key —
    // use a shim that namespaces the save blob while sharing clan halls.
    const joinerStore: Storage = {
      getItem: (k) => (k === 'daggah.save' || k === 'daggah.save.bak' ? null : shared.getItem(k)),
      setItem: (k, v) => {
        if (k === 'daggah.save' || k === 'daggah.save.bak') {
          shared.setItem(`joiner.${k}`, v);
          return;
        }
        shared.setItem(k, v);
      },
      removeItem: (k) => {
        if (k === 'daggah.save' || k === 'daggah.save.bak') {
          shared.removeItem(`joiner.${k}`);
          return;
        }
        shared.removeItem(k);
      },
    };
    const joiner = new Game(joinerStore, mulberry32(8));
    joiner.pickClass('Mage');
    joiner.save.clanHumanId = 'human_joiner_test';
    expect(joiner.joinClan(code)).toBeNull();
    expect(joiner.clan?.code).toBe(code);
    expect(joiner.clan?.members.some((m) => m.isPlayer && m.heroClass === 'Mage')).toBe(true);
    expect(joiner.clan?.members.some((m) => !m.isAi && !m.isPlayer)).toBe(true); // leader is real
    const aisAfter = joiner.clan!.members.filter((m) => m.isAi);
    expect(aisAfter.length).toBe(beforeAi.length - 1);
    expect(aisAfter.every((m) => m.cp >= weakestCp)).toBe(true);
    // Weakest AI seat gone; reals untouched.
    expect(joiner.clan!.members.filter((m) => !m.isAi).length).toBe(2);

    expect(joiner.leaveClan()).toBeNull();
    expect(joiner.clan).toBeNull();
  });

  it('caps daily clan tokens', () => {
    expect(applyTokenCap(190, TOKEN_WIN)).toEqual({ awarded: 10, earnedToday: 200 });
    expect(applyTokenCap(TOKEN_DAY_CAP, TOKEN_LOSS).awarded).toBe(0);
  });

  it('keeps recruitClanRoster as an alias for fill AI', () => {
    const game = new Game(memoryStorage(), mulberry32(19));
    game.pickClass('Rogue');
    game.save.crystals = CLAN_CREATE_COST;
    game.createClan('Alias');
    expect(game.recruitClanRoster()).toBeNull();
    expect(game.clanRosterReady()).toBe(true);
  });
});

describe('4v4 auto-battle', () => {
  it('simulates a decisive match using gear and loadouts', () => {
    const rng = mulberry32(99);
    const player = createClan(rng, 'A', snap('Warrior', 12, 800));
    player.members.push(...fillAiRoster(player, rng, 12));
    expect(rosterReady(player.members)).toBe(true);
    const roster = pickQueueRoster(player.members, 'Warrior')!;
    const band = matchCpBandForQueue(PRACTICE_MATCH_WAIT_S);
    const enemies = buildOpponentRoster(rng, roster, 800, { bandPct: band.pct });
    expect(enemies).toHaveLength(4);
    expect(enemies.every((m) => m.isAi)).toBe(true);
    expect(enemies.every((m) => m.gear)).toBe(true);
    const playerGear = enemies[0]!.gear!;
    const result = simulatePvp(roster, enemies, playerGear, 12, rng);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.duration).toBeLessThanOrEqual(PVP_TIMEOUT_S);
    expect(result.allyTeam).toHaveLength(4);
    expect(result.enemyTeam).toHaveLength(4);
    expect(result.practiceAi).toBe(true);
    expect(result.enemyTeam.every((f) => f.isAi)).toBe(true);
    expect(typeof result.won).toBe('boolean');
    expect(result.dpsBoard.length).toBe(8);
    expect(result.mvp).toBeTruthy();
    expect(result.mvp!.team).toBe('ally');
    expect(result.dpsBoard[0]!.damage).toBeGreaterThanOrEqual(result.dpsBoard[1]!.damage);
  });

  it('awards win/loss tokens through Game.queueClanPvp', () => {
    const game = new Game(memoryStorage(), mulberry32(3));
    game.pickClass('Ranger');
    game.save.crystals = CLAN_CREATE_COST;
    game.save.stagesCleared = 15;
    game.createClan('Quills');
    game.recruitClanRoster();
    let saw = false;
    game.on((e) => {
      if (e.t === 'pvp') saw = true;
    });
    expect(game.queueClanPvp()).toBeNull();
    expect(game.mode).toBe('pvp');
    expect(game.pvpPlayback).toBeTruthy();
    expect(game.pvpPlayback!.result.fighters).toHaveLength(8);
    expect(game.pvpPlayback!.result.playback.length).toBeGreaterThan(0);
    // Tokens award immediately; breakdown modal waits for stage playback.
    expect(game.save.clanTokens).toBeGreaterThanOrEqual(4); // Scout loss floor (bracket-scaled)
    expect(game.save.clanWins + game.save.clanLosses).toBe(1);
    game.finishPvpPlayback();
    expect(saw).toBe(true);
    expect(game.mode).toBe('camp');
  });

  it('queuePractice4v4 creates Practice Hall, fills AI, and queues', () => {
    const game = new Game(memoryStorage(), mulberry32(21));
    game.pickClass('Mage');
    game.save.stagesCleared = 15;
    expect(game.clan).toBeNull();
    let saw = false;
    game.on((e) => {
      if (e.t === 'pvp') saw = true;
    });
    expect(game.queuePractice4v4()).toBeNull();
    expect(game.clan?.name).toBe('Practice Hall');
    expect(game.clanRosterReady()).toBe(true);
    expect(game.mode).toBe('pvp');
    expect(game.save.clanWins + game.save.clanLosses).toBe(1);
    // Tick playback to completion (sim clock advances via rate).
    for (let i = 0; i < 400 && !saw; i++) game.tick(0.05);
    expect(saw).toBe(true);
    expect(game.mode).toBe('camp');
  });

  it('stage playback emits pvpFx then the existing breakdown event', () => {
    const game = new Game(memoryStorage(), mulberry32(42));
    game.pickClass('Warrior');
    game.save.stagesCleared = 15;
    expect(game.queuePractice4v4()).toBeNull();
    expect(game.pvpPlayback!.introT).toBeGreaterThan(0);
    let fx = 0;
    let pvp = 0;
    game.on((e) => {
      if (e.t === 'pvpFx') fx += 1;
      if (e.t === 'pvp') pvp += 1;
    });
    for (let i = 0; i < 800 && pvp === 0; i++) game.tick(0.05);
    expect(fx).toBeGreaterThan(0);
    expect(pvp).toBe(1);
    expect(game.pvpPlayback).toBeNull();
  });

  it('recruitForRoster alias still fills one of each class', () => {
    const rng = mulberry32(5);
    const clan = createClan(rng, 'Legacy', snap('Warrior', 8, 400));
    const added = recruitForRoster(clan, rng, 8);
    expect(added.length).toBe(3);
    expect(added.every((m) => m.isAi)).toBe(true);
  });

  it('documents progressive CP match bands and practice uses the tight band', () => {
    expect(MATCH_CP_BANDS.map((b) => b.pct)).toEqual([0.08, 0.15, 0.25, 0.4]);
    expect(matchCpBandForQueue(0).id).toBe('tight');
    expect(matchCpBandForQueue(10).id).toBe('standard');
    expect(matchCpBandForQueue(20).id).toBe('wide');
    expect(matchCpBandForQueue(30).id).toBe('open');
    expect(matchCpBandForQueue(0, { atTopOfLadder: true }).id).toBe('standard');
    expect(CLAN_MAX_SIZE).toBe(25);
  });

  it('findWeakestAiMember picks lowest CP and admitRealMember never kicks reals', () => {
    const rng = mulberry32(3);
    const clan = createClan(rng, 'Cap', snap('Warrior', 10, 900, 'human_leader'));
    clan.members.push(...fillAiRoster(clan, rng, 10));
    const weak = findWeakestAiMember(clan.members)!;
    expect(weak.isAi).toBe(true);
    const beforeReals = clan.members.filter((m) => !m.isAi).length;
    const admitted = admitRealMember(clan, snap('Rogue', 11, 950, 'human_joiner'));
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    expect(admitted.replacedAi?.id).toBe(weak.id);
    expect(admitted.clan.members.filter((m) => !m.isAi).length).toBe(beforeReals + 1);
    expect(admitted.clan.members.every((m) => m.isAi || m.id === 'human_leader' || m.id === 'human_joiner')).toBe(
      true,
    );
  });
});

describe('clan leaderboard', () => {
  it('ranks player clan among local rivals by season score', () => {
    expect(clanSeasonScore(5, 1, 100, 4)).toBe(5 * 100 + 100 + 4 * 8 - 12);
    const board = buildClanLeaderboard(1, {
      name: 'Test Wolves',
      wins: 99,
      losses: 0,
      tokens: 500,
      members: 8,
    });
    expect(board[0]?.isPlayer).toBe(true);
    expect(board[0]?.name).toBe('Test Wolves');
    expect(board[0]?.rank).toBe(1);
    expect(board.every((e, i) => e.rank === i + 1)).toBe(true);
    expect(board.length).toBeGreaterThan(5);
  });

  it('omits player row when not in a clan', () => {
    const board = buildClanLeaderboard(2, null);
    expect(board.every((e) => !e.isPlayer)).toBe(true);
  });
});

describe('clan armorer + season', () => {
  it('sells Clanforged gear for tokens', () => {
    const game = new Game(memoryStorage(), mulberry32(11));
    game.pickClass('Rogue');
    game.save.clanTokens = 80;
    game.save.level = 18;
    game.save.clanNightscarUnlocked = true;
    expect(game.buyClanVendor(4)).toBeNull(); // legendary weapon (Nightscar unlock)
    expect(game.save.clanTokens).toBe(0);
    expect(game.save.pending[0]?.setId).toBe('clanforged');
    expect(game.save.pending[0]?.icon).toBe('k');
    const counts = setCounts({ weapon: game.save.pending[0]! });
    expect(counts.clanforged).toBe(1);
  });

  it('applies Clanforged set bonuses', () => {
    const rng = mulberry32(5);
    const gear = {
      weapon: rollItem(rng, { gearLevel: 18, rarity: 'epic', slot: 'weapon', setId: 'clanforged' }),
      chest: rollItem(rng, { gearLevel: 18, rarity: 'epic', slot: 'chest', setId: 'clanforged' }),
      helmet: rollItem(rng, { gearLevel: 18, rarity: 'epic', slot: 'helmet', setId: 'clanforged' }),
      belt: rollItem(rng, { gearLevel: 18, rarity: 'epic', slot: 'belt', setId: 'clanforged' }),
    };
    const fx = computeHero(18, gear, 'Warrior').effects;
    expect(fx.pvpCpPct).toBe(8);
    expect(fx.tokenGainPct).toBe(10);
  });

  it('local season reset keeps clan and reopens class pick', () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(2));
    game.pickClass('Warrior');
    game.save.crystals = CLAN_CREATE_COST;
    game.createClan('Persist');
    game.save.level = 10;
    game.devUnlockThroughAct(4);
    game.save.dungeons['rime-vault'] = { cleared: true, clears: 3 };
    game.resetSeasonLocal();
    expect(game.save.classPicked).toBe(false);
    expect(game.save.level).toBe(1);
    expect(game.save.stagesCleared).toBe(0);
    expect(game.save.currentStage).toBe(0);
    expect(game.save.dungeons).toEqual({});
    expect(game.clan?.name).toBe('Persist');
    expect(game.save.season.seasonId).toBe(2);
  });

  it('migrates v2 saves to current schema with clan defaults', () => {
    const store = memoryStorage();
    const v2 = { ...defaultSave(), version: 2, classPicked: true, heroClass: 'Mage' as const, level: 5 };
    store.setItem('daggah.save.v2', JSON.stringify(v2));
    const loaded = loadSave(store);
    expect(loaded.version).toBe(4);
    expect(loaded.heroClass).toBe('Mage');
    expect(loaded.clanTokens).toBe(0);
    expect(loaded.season.seasonId).toBe(1);
    writeSave(store, loaded);
    expect(store.getItem(SAVE_KEY)).toBeTruthy();
  });
});
