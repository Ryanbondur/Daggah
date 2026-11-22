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
  buildAiMember,
  buildClanLeaderboard,
  canApproveJoins,
  canKickAi,
  canPromoteDemote,
  clanSeasonScore,
  createClan,
  fillAiRoster,
  findAiToReplace,
  findWeakestAiMember,
  kickAiMember,
  pickQueueRoster,
  recruitForRoster,
  rosterReady,
  setMemberRole,
} from './clan';
import {
  CLAN_INVITE_TTL_MS,
  createClanInvite,
  lookupClanInvite,
  publishClanHall,
  requestClanJoin,
  resolveJoinTarget,
} from './clanHall';
import { PVP_TIMEOUT_S, simulatePvp, buildOpponentRoster } from './pvp';
import {
  matchCpBandForQueue,
  MATCH_CP_BANDS,
  PRACTICE_MATCH_WAIT_S,
  QUEUE_BAND_METER_S,
  queueBandMeterProgress,
  softNightscarMatchAvg,
  seedNightscarSoftMmr,
  updateNightscarSoftMmr,
  TEAM_CP_VETERAN_MAX,
} from './clanBrackets';
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
  it('creates a clan for crystal cost and fills AI teammates for other classes', async () => {
    const game = new Game(memoryStorage(), mulberry32(42));
    game.pickClass('Warrior');
    game.save.crystals = CLAN_CREATE_COST;
    expect(await game.createClan('Test Wolves')).toBeNull();
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

  it('rejects unknown join codes until a hall is published', async () => {
    const game = new Game(memoryStorage(), mulberry32(7));
    game.pickClass('Mage');
    expect(await game.joinClan('AB12CD')).toMatch(/No clan/i);
    expect(game.clan).toBeNull();
  });

  it('lets a real player join by code and replaces redundant-class AI first', async () => {
    const shared = memoryStorage();
    const leader = new Game(shared, mulberry32(7));
    leader.pickClass('Warrior');
    leader.save.crystals = CLAN_CREATE_COST;
    expect(await leader.createClan('Open Hall')).toBeNull();
    expect(leader.fillAiClanRoster()).toBeNull();
    const code = leader.clan!.code;
    const beforeAi = leader.clan!.members.filter((m) => m.isAi);
    expect(beforeAi.length).toBeGreaterThan(0);
    const mageAi = beforeAi.find((m) => m.heroClass === 'Mage');
    expect(mageAi).toBeTruthy();

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
    expect(await joiner.joinClan(code)).toBeNull();
    expect(joiner.clan?.code).toBe(code);
    expect(joiner.clan?.members.some((m) => m.isPlayer && m.heroClass === 'Mage')).toBe(true);
    expect(joiner.clan?.members.some((m) => !m.isAi && !m.isPlayer)).toBe(true); // leader is real
    const aisAfter = joiner.clan!.members.filter((m) => m.isAi);
    expect(aisAfter.length).toBe(beforeAi.length - 1);
    // Mage AI seat gone (class-priority); reals untouched.
    expect(aisAfter.some((m) => m.id === mageAi!.id)).toBe(false);
    expect(joiner.clan!.members.filter((m) => !m.isAi).length).toBe(2);

    expect(await joiner.leaveClan()).toBeNull();
    expect(joiner.clan).toBeNull();
  });

  it('caps daily clan tokens', () => {
    expect(applyTokenCap(190, TOKEN_WIN)).toEqual({ awarded: 10, earnedToday: 200 });
    expect(applyTokenCap(TOKEN_DAY_CAP, TOKEN_LOSS).awarded).toBe(0);
  });

  it('keeps recruitClanRoster as an alias for fill AI', async () => {
    const game = new Game(memoryStorage(), mulberry32(19));
    game.pickClass('Rogue');
    game.save.crystals = CLAN_CREATE_COST;
    await game.createClan('Alias');
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

  it('awards win/loss tokens through Game.queueClanPvp', async () => {
    const game = new Game(memoryStorage(), mulberry32(3));
    game.pickClass('Ranger');
    game.save.crystals = CLAN_CREATE_COST;
    game.save.stagesCleared = 15;
    await game.createClan('Quills');
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

  it('findAiToReplace prefers joiner class over lowest CP; never kicks reals', () => {
    const rng = mulberry32(3);
    const clan = createClan(rng, 'Cap', snap('Warrior', 10, 900, 'human_leader'));
    clan.members.push(...fillAiRoster(clan, rng, 10));
    const weak = findWeakestAiMember(clan.members)!;
    expect(weak.isAi).toBe(true);
    const classPick = findAiToReplace(clan.members, 'Rogue')!;
    expect(classPick.heroClass).toBe('Rogue');
    const beforeReals = clan.members.filter((m) => !m.isAi).length;
    const admitted = admitRealMember(clan, snap('Rogue', 11, 950, 'human_joiner'));
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    expect(admitted.replacedAi?.heroClass).toBe('Rogue');
    // Class priority may differ from raw weakest CP.
    if (weak.heroClass !== 'Rogue') expect(admitted.replacedAi?.id).not.toBe(weak.id);
    expect(admitted.clan.members.filter((m) => !m.isAi).length).toBe(beforeReals + 1);
    expect(admitted.clan.members.every((m) => m.isAi || m.id === 'human_leader' || m.id === 'human_joiner')).toBe(
      true,
    );
  });

  it('documents the 30s queue band meter', () => {
    expect(QUEUE_BAND_METER_S).toBe(30);
    expect(queueBandMeterProgress(0)).toBe(0);
    expect(queueBandMeterProgress(15)).toBe(0.5);
    expect(queueBandMeterProgress(30)).toBe(1);
    expect(queueBandMeterProgress(99)).toBe(1);
    expect(matchCpBandForQueue(25).id).toBe('wide');
  });
});

describe('clan invites + roles + soft MMR', () => {
  it('mints one-time invite tokens with expiry and consumes on join', () => {
    const store = memoryStorage();
    const rng = mulberry32(44);
    const leader = new Game(store, rng);
    leader.pickClass('Warrior');
    leader.save.crystals = CLAN_CREATE_COST;
    expect(leader.createClan('Invite Hall')).toBeNull();
    expect(leader.fillAiClanRoster()).toBeNull();
    const minted = leader.createOfficerInvite(60_000);
    expect(typeof minted).not.toBe('string');
    if (typeof minted === 'string') return;
    expect(minted.token.startsWith('I')).toBe(true);
    expect(minted.expiresAt).toBeGreaterThan(Date.now());
    const inv = lookupClanInvite(store, minted.token);
    expect(inv?.usesLeft).toBe(1);
    expect(inv?.clanCode).toBe(leader.clan!.code);

    const joinerStore: Storage = {
      getItem: (k) => (k === 'daggah.save' || k === 'daggah.save.bak' ? null : store.getItem(k)),
      setItem: (k, v) => {
        if (k === 'daggah.save' || k === 'daggah.save.bak') {
          store.setItem(`j2.${k}`, v);
          return;
        }
        store.setItem(k, v);
      },
      removeItem: (k) => {
        if (k === 'daggah.save' || k === 'daggah.save.bak') {
          store.removeItem(`j2.${k}`);
          return;
        }
        store.removeItem(k);
      },
    };
    const joiner = new Game(joinerStore, mulberry32(45));
    joiner.pickClass('Ranger');
    joiner.save.clanHumanId = 'human_invite_joiner';
    expect(joiner.joinClan(minted.token)).toBeNull();
    expect(joiner.clan?.code).toBe(leader.clan!.code);
    expect(lookupClanInvite(store, minted.token)).toBeNull();

    const spent = resolveJoinTarget(store, minted.token);
    expect(spent.kind).toBe('error');
  });

  it('rejects expired invite tokens', () => {
    const store = memoryStorage();
    const rng = mulberry32(46);
    const clan = createClan(rng, 'Expire', snap('Warrior', 8, 400, 'leader_a'));
    publishClanHall(store, clan);
    const now = 1_700_000_000_000;
    const created = createClanInvite(store, clan.code, 'leader_a', rng, {
      ttlMs: 1000,
      now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(lookupClanInvite(store, created.invite.token, now + 500)).toBeTruthy();
    expect(lookupClanInvite(store, created.invite.token, now + CLAN_INVITE_TTL_MS)).toBeNull();
    const resolved = resolveJoinTarget(store, created.invite.token, now + 2000);
    expect(resolved.kind).toBe('error');
    if (resolved.kind === 'error') expect(resolved.error).toMatch(/expired/i);
  });

  it('officers kick AI / approve pending joins; leaders promote and demote', () => {
    expect(canKickAi('officer')).toBe(true);
    expect(canApproveJoins('officer')).toBe(true);
    expect(canPromoteDemote('officer')).toBe(false);
    expect(canPromoteDemote('leader')).toBe(true);

    const store = memoryStorage();
    const game = new Game(store, mulberry32(50));
    game.pickClass('Warrior');
    game.save.crystals = CLAN_CREATE_COST;
    game.createClan('Roles');
    game.fillAiClanRoster();
    const ai = game.clan!.members.find((m) => m.isAi)!;
    expect(game.kickClanAi(ai.id)).toBeNull();
    expect(game.clan!.members.some((m) => m.id === ai.id)).toBe(false);

    // Add a second real (publish so hall sync keeps them) then promote.
    const human = buildAiMember(mulberry32(51), 'Mage', 10, 'member', 'scaled');
    human.isAi = false;
    human.isPlayer = false;
    human.id = 'human_officer_cand';
    human.name = 'Cand';
    game.clan!.members.push(human);
    publishClanHall(store, game.clan!);
    expect(game.setClanMemberRole(human.id, 'officer')).toBeNull();
    expect(game.clan!.members.find((m) => m.id === human.id)?.role).toBe('officer');
    expect(game.setClanMemberRole(human.id, 'member')).toBeNull();
    expect(game.clan!.members.find((m) => m.id === human.id)?.role).toBe('member');

    // Pending join + approve.
    const pendingSnap = snap('Rogue', 9, 500, 'pending_human');
    expect(requestClanJoin(store, game.clan!.code, pendingSnap).ok).toBe(true);
    expect(game.listPendingClanJoins().some((p) => p.humanId === 'pending_human')).toBe(true);
    expect(game.approveClanJoin('pending_human')).toBeNull();
    expect(game.clan!.members.some((m) => m.id === 'pending_human')).toBe(true);
    expect(game.listPendingClanJoins().length).toBe(0);

    // Pure helpers: cannot demote the leader via setMemberRole.
    const demoteLeader = setMemberRole(
      game.clan!,
      game.clan!.members.find((m) => m.role === 'leader')!.id,
      'member',
    );
    expect(demoteLeader.ok).toBe(false);
    // Re-fill AI then kick via pure helper.
    game.fillAiClanRoster();
    const ai2 = game.clan!.members.find((m) => m.isAi);
    expect(ai2).toBeTruthy();
    expect(kickAiMember(game.clan!, ai2!.id).ok).toBe(true);
  });

  it('softens Nightscar match avg so BiS stacks do not mirror raw CP', () => {
    const mid = seedNightscarSoftMmr(TEAM_CP_VETERAN_MAX);
    const bisAvg = 2200;
    const freshAvg = 1450;
    const softBis = softNightscarMatchAvg(bisAvg, mid + 800);
    const softFresh = softNightscarMatchAvg(freshAvg, mid - 400);
    // BiS rivals pull down toward soft peer; gap vs fresh shrinks vs raw CP.
    expect(softBis).toBeLessThan(bisAvg);
    expect(softBis - softFresh).toBeLessThan(bisAvg - freshAvg);
    const up = updateNightscarSoftMmr(mid, true, TEAM_CP_VETERAN_MAX + 400);
    const down = updateNightscarSoftMmr(mid, false, TEAM_CP_VETERAN_MAX + 400);
    expect(up).toBeGreaterThan(mid);
    expect(down).toBeLessThan(mid);
  });

  it('updates soft MMR after a Nightscar bracket match', () => {
    const game = new Game(memoryStorage(), mulberry32(60));
    game.pickClass('Warrior');
    game.save.crystals = CLAN_CREATE_COST;
    game.save.stagesCleared = 50;
    game.save.level = 18;
    // Force high team CP into Nightscar via inflated member CP after fill.
    game.createClan('Scar');
    game.fillAiClanRoster();
    for (const m of game.clan!.members) m.cp = 1600;
    expect(game.save.clanNightscarMmr).toBe(0);
    expect(game.queueClanPvp({ waitS: 0 })).toBeNull();
    expect(game.save.clanNightscarUnlocked).toBe(true);
    expect(game.save.clanNightscarMmr).toBeGreaterThan(0);
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

  it('local season reset keeps clan and reopens class pick', async () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(2));
    game.pickClass('Warrior');
    game.save.crystals = CLAN_CREATE_COST;
    await game.createClan('Persist');
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
