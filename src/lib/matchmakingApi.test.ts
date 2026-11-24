import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as authPost } from '../../api/_lib/authApi';
import { POST as matchPost } from '../../api/_lib/matchApi';
import { SESSION_HEADER, resetRateLimitsForTests } from './auth';
import { dbMode, sql } from './db';
import { resetPgliteForTests } from './dbPglite';
import { HERO_CLASSES } from '../data/types';

async function register(username: string, password = 'good-pass-99') {
  const res = await authPost(
    new Request('http://local/api/daggah-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'register', username, password }),
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { token: string; userId: string; username: string };
}

function roster(cp = 900) {
  return HERO_CLASSES.map((heroClass, i) => ({
    id: `m_${heroClass}`,
    name: heroClass,
    heroClass,
    role: i === 0 ? 'leader' : 'member',
    isPlayer: i === 0,
    isAi: i !== 0,
    level: 12,
    cp,
    loadout: ['slash', 'guard', 'cleave', 'rally'],
    primary: 'slash',
    gear: {},
  }));
}

function enqueueBody(overrides: Record<string, unknown> = {}) {
  return {
    action: 'enqueue',
    clanCode: 'ALPHA1',
    clanName: 'Alpha',
    teamCp: 3600,
    avgCp: 900,
    bracket: 'veteran',
    challengeUp: false,
    atTop: false,
    seasonId: 1,
    roster: roster(900),
    ...overrides,
  };
}

async function postMatch(token: string, body: Record<string, unknown>) {
  return matchPost(
    new Request('http://local/api/daggah-match', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [SESSION_HEADER]: token,
      },
      body: JSON.stringify(body),
    }),
  );
}

describe('4v4 matchmaking API (PGlite)', () => {
  beforeEach(() => {
    resetPgliteForTests();
    resetRateLimitsForTests();
    process.env.CURSOR_APP_ID = 'daggah-test';
  });

  afterEach(() => {
    resetPgliteForTests();
    resetRateLimitsForTests();
    delete process.env.CURSOR_APP_ID;
  });

  it('uses PGlite and creates matchmaking tables', async () => {
    expect(dbMode()).toBe('pglite');
    await sql(`select 1`);
    const tables = await sql<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1)
       order by table_name`,
      [['match_queue', 'match_reports', 'matches']],
    );
    expect(tables.map((t) => t.table_name)).toEqual([
      'match_queue',
      'match_reports',
      'matches',
    ]);
  });

  it('requires auth to enqueue', async () => {
    const res = await matchPost(
      new Request('http://local/api/daggah-match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(enqueueBody()),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('queues a solo ticket then cancels', async () => {
    const a = await register('QueuerA');
    const enq = await postMatch(a.token, enqueueBody({ clanCode: 'QUEUA1', clanName: 'Queuer A' }));
    expect(enq.status).toBe(200);
    const queued = (await enq.json()) as { status: string; ticketId: string };
    expect(queued.status).toBe('queued');
    expect(queued.ticketId).toBeTruthy();

    const cancel = await postMatch(a.token, { action: 'cancel' });
    expect(cancel.status).toBe(200);
    const rows = await sql(`select * from match_queue where user_id = $1`, [a.userId]);
    expect(rows).toHaveLength(0);
  });

  it('forms a live 4v4 when two peers in band enqueue', async () => {
    const a = await register('PeerAlpha');
    const b = await register('PeerBravo');

    const enqA = await postMatch(
      a.token,
      enqueueBody({ clanCode: 'ALPH01', clanName: 'Alpha', avgCp: 900, teamCp: 3600 }),
    );
    expect(enqA.status).toBe(200);
    expect(((await enqA.json()) as { status: string }).status).toBe('queued');

    const enqB = await postMatch(
      b.token,
      enqueueBody({
        clanCode: 'BRAV01',
        clanName: 'Bravo',
        avgCp: 920,
        teamCp: 3680,
        roster: roster(920),
      }),
    );
    expect(enqB.status).toBe(200);
    const matchedB = (await enqB.json()) as {
      status: string;
      match: { matchId: string; seed: number; live: boolean; enemy: { clanName: string } };
    };
    expect(matchedB.status).toBe('matched');
    expect(matchedB.match.live).toBe(true);
    expect(matchedB.match.seed).toBeGreaterThan(0);
    expect(matchedB.match.enemy.clanName).toBe('Alpha');

    const pollA = await postMatch(a.token, { action: 'poll' });
    expect(pollA.status).toBe(200);
    const matchedA = (await pollA.json()) as {
      status: string;
      match: { matchId: string; enemy: { clanName: string } };
    };
    expect(matchedA.status).toBe('matched');
    expect(matchedA.match.matchId).toBe(matchedB.match.matchId);
    expect(matchedA.match.enemy.clanName).toBe('Bravo');

    const report = await postMatch(a.token, {
      action: 'report',
      matchId: matchedA.match.matchId,
      won: true,
      seasonId: 1,
      clanCode: 'ALPH01',
      clanName: 'Alpha',
      wins: 1,
      losses: 0,
      tokens: 20,
      members: 4,
    });
    expect(report.status).toBe(200);

    const board = await sql<{ wins: number; clan_code: string }>(
      `select wins, clan_code from clan_results where season_id = 1 and clan_code = $1`,
      ['ALPH01'],
    );
    expect(board[0]?.wins).toBeGreaterThanOrEqual(1);
  });

  it('does not match far CP at tight wait', async () => {
    const a = await register('TightA');
    const b = await register('TightB');
    await postMatch(
      a.token,
      enqueueBody({ clanCode: 'TITA01', clanName: 'Tight A', avgCp: 800, teamCp: 3200 }),
    );
    const enqB = await postMatch(
      b.token,
      enqueueBody({
        clanCode: 'TITB01',
        clanName: 'Tight B',
        avgCp: 1400,
        teamCp: 5600,
        roster: roster(1400),
      }),
    );
    const body = (await enqB.json()) as { status: string };
    expect(body.status).toBe('queued');
  });
});
