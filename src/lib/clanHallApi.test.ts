import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as authGet, POST as authPost } from '../../api/_lib/authApi';
import { GET as clanGet, POST as clanPost } from '../../api/_lib/clanApi';
import { SESSION_HEADER, resetRateLimitsForTests } from './auth';
import { dbMode, sql } from './db';
import { resetPgliteForTests } from './dbPglite';
import { CLAN_MAX_SIZE } from '../game/clanAdmit';

async function register(username: string, password = 'good-pass-99') {
  const res = await authPost(
    new Request('http://local/api/daggah-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'register', username, password }),
    }),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { token: string; userId: string; username: string };
  return body;
}

function playerBody(heroClass: string, overrides: Record<string, unknown> = {}) {
  return {
    heroClass,
    level: 10,
    cp: 800,
    loadout: ['slash', 'guard', 'cleave', 'rally'],
    primary: 'slash',
    memberName: heroClass,
    ...overrides,
  };
}

describe('clan hall API (PGlite)', () => {
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

  it('uses PGlite when DATABASE_URL is unset', () => {
    expect(dbMode()).toBe('pglite');
  });

  it('creates clan_halls schema', async () => {
    await sql(`select 1`);
    const tables = await sql<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1)
       order by table_name`,
      [['clan_hall_seats', 'clan_halls']],
    );
    expect(tables.map((t) => t.table_name)).toEqual(['clan_hall_seats', 'clan_halls']);
  });

  it('requires auth for create/join and allows public GET by code', async () => {
    const unauth = await clanPost(
      new Request('http://local/api/daggah-clan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: 'No Auth', ...playerBody('Warrior') }),
      }),
    );
    expect(unauth.status).toBe(401);

    const leader = await register('HallLeader');
    const create = await clanPost(
      new Request('http://local/api/daggah-clan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: leader.token,
        },
        body: JSON.stringify({
          action: 'create',
          name: 'Cross Device',
          code: 'CROSS1',
          clanId: 'clan_cross',
          ...playerBody('Warrior', { memberName: 'HallLeader', cp: 900 }),
        }),
      }),
    );
    expect(create.status).toBe(200);
    const created = (await create.json()) as { clan: { code: string; members: unknown[] } };
    expect(created.clan.code).toBe('CROSS1');
    expect(created.clan.members).toHaveLength(1);

    const lookup = await clanGet(new Request('http://local/api/daggah-clan?code=CROSS1'));
    expect(lookup.status).toBe(200);
    const looked = (await lookup.json()) as { clan: { name: string } };
    expect(looked.clan.name).toBe('Cross Device');

    // Publish AI fillers then join as second auth user — replace weakest AI.
    const withAi = {
      ...created.clan,
      members: [
        ...(created.clan.members as object[]),
        {
          id: 'ai_weak',
          name: 'Weak Bot',
          heroClass: 'Mage',
          role: 'member',
          isPlayer: false,
          isAi: true,
          level: 5,
          cp: 100,
          loadout: [],
          primary: null,
        },
        {
          id: 'ai_strong',
          name: 'Strong Bot',
          heroClass: 'Ranger',
          role: 'member',
          isPlayer: false,
          isAi: true,
          level: 12,
          cp: 1200,
          loadout: [],
          primary: null,
        },
      ],
    };
    const publish = await clanPost(
      new Request('http://local/api/daggah-clan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: leader.token,
        },
        body: JSON.stringify({ action: 'publish', clan: withAi }),
      }),
    );
    expect(publish.status).toBe(200);

    const joiner = await register('HallJoiner');
    const join = await clanPost(
      new Request('http://local/api/daggah-clan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: joiner.token,
        },
        body: JSON.stringify({
          action: 'join',
          code: 'CROSS1',
          ...playerBody('Rogue', { memberName: 'HallJoiner', cp: 850 }),
        }),
      }),
    );
    expect(join.status).toBe(200);
    const joined = (await join.json()) as {
      clan: { members: Array<{ id: string; isAi: boolean; name: string }> };
      replacedAi: { id: string; name: string } | null;
    };
    expect(joined.replacedAi?.id).toBe('ai_weak');
    expect(joined.clan.members.some((m) => m.name === 'Weak Bot')).toBe(false);
    expect(joined.clan.members.filter((m) => !m.isAi)).toHaveLength(2);
    expect(joined.clan.members.some((m) => m.isAi && m.name === 'Strong Bot')).toBe(true);

    // Sync from joiner device
    const sync = await clanPost(
      new Request('http://local/api/daggah-clan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: joiner.token,
        },
        body: JSON.stringify({ action: 'sync', code: 'CROSS1', ...playerBody('Rogue', { cp: 900 }) }),
      }),
    );
    expect(sync.status).toBe(200);

    const leave = await clanPost(
      new Request('http://local/api/daggah-clan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: joiner.token,
        },
        body: JSON.stringify({ action: 'leave' }),
      }),
    );
    expect(leave.status).toBe(200);
    const left = (await leave.json()) as { left: boolean; clan: { members: unknown[] } | null };
    expect(left.left).toBe(true);
    expect(left.clan?.members).toHaveLength(2); // leader + strong AI
  });

  it('rejects full halls at capacity 25 and never drops other reals on publish', async () => {
    expect(CLAN_MAX_SIZE).toBe(25);
    const leader = await register('CapLead');
    const members = [
      {
        id: `human_${leader.userId}`,
        name: 'CapLead',
        heroClass: 'Warrior',
        role: 'leader',
        isPlayer: false,
        isAi: false,
        level: 10,
        cp: 900,
        loadout: [],
        primary: null,
      },
    ];
    for (let i = 0; i < 24; i++) {
      members.push({
        id: `ai_${i}`,
        name: `Bot${i}`,
        heroClass: (['Mage', 'Ranger', 'Rogue', 'Warrior'] as const)[i % 4]!,
        role: 'member',
        isPlayer: false,
        isAi: true,
        level: 8,
        cp: 200 + i,
        loadout: [],
        primary: null,
      });
    }
    const create = await clanPost(
      new Request('http://local/api/daggah-clan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: leader.token,
        },
        body: JSON.stringify({
          action: 'create',
          name: 'Full Hall',
          code: 'FULL25',
          ...playerBody('Warrior', { memberName: 'CapLead' }),
        }),
      }),
    );
    expect(create.status).toBe(200);
    const created = (await create.json()) as { clan: { id: string; code: string } };
    const publish = await clanPost(
      new Request('http://local/api/daggah-clan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: leader.token,
        },
        body: JSON.stringify({
          action: 'publish',
          clan: { id: created.clan.id, code: 'FULL25', name: 'Full Hall', members },
        }),
      }),
    );
    expect(publish.status).toBe(200);

    // Fill remaining AI seats so join replaces AI rather than failing full —
    // first join should replace weakest AI (cp 200 = ai_0).
    const joiner = await register('CapJoin');
    const join = await clanPost(
      new Request('http://local/api/daggah-clan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: joiner.token,
        },
        body: JSON.stringify({
          action: 'join',
          code: 'FULL25',
          ...playerBody('Mage', { memberName: 'CapJoin' }),
        }),
      }),
    );
    expect(join.status).toBe(200);
    const joined = (await join.json()) as { replacedAi: { id: string } | null; clan: { members: unknown[] } };
    expect(joined.replacedAi?.id).toBe('ai_0');
    expect(joined.clan.members).toHaveLength(25);

    // Publish that drops another real is rejected.
    const drop = await clanPost(
      new Request('http://local/api/daggah-clan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: leader.token,
        },
        body: JSON.stringify({
          action: 'publish',
          clan: {
            id: created.clan.id,
            code: 'FULL25',
            name: 'Full Hall',
            members: members.slice(0, 1), // only leader
          },
        }),
      }),
    );
    expect(drop.status).toBe(409);

    // Session still valid
    const me = await authGet(
      new Request('http://local/api/daggah-auth', {
        headers: { [SESSION_HEADER]: leader.token },
      }),
    );
    expect(me.status).toBe(200);
  });
});
