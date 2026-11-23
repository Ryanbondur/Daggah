import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as authGet, POST as authPost } from '../../api/_lib/authApi';
import { GET as saveGet, PUT as savePut } from '../../api/_lib/saveApi';
import {
  SESSION_HEADER,
  hashPassword,
  normalizeUsername,
  resetRateLimitsForTests,
  validatePassword,
  verifyPassword,
} from './auth';
import { dbMode, sql } from './db';
import { resetPgliteForTests } from './dbPglite';

function sampleSave(overrides: Record<string, unknown> = {}) {
  return {
    version: 3,
    heroClass: 'Warrior',
    classPicked: true,
    level: 7,
    xp: 12,
    savedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('auth helpers', () => {
  it('normalizes usernames and rejects weak passwords', () => {
    expect(normalizeUsername('Hero_1')).toBe('Hero_1');
    expect(normalizeUsername('ab')).toBeNull();
    expect(normalizeUsername('<script>')).toBeNull();
    expect(normalizeUsername('bad name')).toBeNull();
    expect(validatePassword('')).toMatch(/empty/i);
    expect(validatePassword('   ')).toMatch(/empty/i);
    expect(validatePassword('short')).toMatch(/8/);
    expect(validatePassword('good-pass')).toBeNull();
  });

  it('hashes passwords with PBKDF2 and verifies', async () => {
    const hash = await hashPassword('correct-horse');
    expect(hash.startsWith('pbkdf2$')).toBe(true);
    expect(hash.includes('correct-horse')).toBe(false);
    expect(await verifyPassword('correct-horse', hash)).toBe(true);
    expect(await verifyPassword('wrong-pass!!', hash)).toBe(false);
  });
});

describe('register / login / save roundtrip (PGlite)', () => {
  beforeEach(() => {
    resetPgliteForTests();
    resetRateLimitsForTests();
    process.env.CURSOR_APP_ID = 'daggah-test';
    process.env.CURSOR_APP_IDENTITY_ISSUER = 'https://example.invalid';
  });

  afterEach(() => {
    resetPgliteForTests();
    resetRateLimitsForTests();
    delete process.env.CURSOR_APP_ID;
    delete process.env.CURSOR_APP_IDENTITY_ISSUER;
  });

  it('uses PGlite when DATABASE_URL is unset', () => {
    expect(dbMode()).toBe('pglite');
  });

  it('applies users + sessions migrations', async () => {
    // Touch db so migrations run.
    await sql(`select 1`);
    const tables = await sql<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1)
       order by table_name`,
      [['sessions', 'users']],
    );
    expect(tables.map((t) => t.table_name)).toEqual(['sessions', 'users']);
  });

  it('applies saves, rate_limits, clan board columns, and clan hall tables', async () => {
    await sql(`select 1`);
    const tables = await sql<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1)
       order by table_name`,
      [
        [
          'clan_hall_seats',
          'clan_halls',
          'clan_results',
          'rate_limits',
          'saves',
          'season_stats',
          'sessions',
          'users',
        ],
      ],
    );
    expect(tables.map((t) => t.table_name)).toEqual([
      'clan_hall_seats',
      'clan_halls',
      'clan_results',
      'rate_limits',
      'saves',
      'season_stats',
      'sessions',
      'users',
    ]);

    const seasonCols = await sql<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'season_stats'
         and column_name = any($1)
       order by column_name`,
      [['clan_name', 'members', 'tokens']],
    );
    expect(seasonCols.map((c) => c.column_name)).toEqual(['clan_name', 'members', 'tokens']);

    const clanCols = await sql<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'clan_results'
         and column_name = any($1)
       order by column_name`,
      [['clan_name', 'members', 'tokens']],
    );
    expect(clanCols.map((c) => c.column_name)).toEqual(['clan_name', 'members', 'tokens']);
  });

  it('registers, logs in, and round-trips a cloud save keyed by user', async () => {
    const register = await authPost(
      new Request('http://localhost/api/daggah-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          username: 'Nightscar',
          password: 'stone-gate-9',
        }),
      }),
    );
    expect(register.status).toBe(200);
    const regBody = (await register.json()) as {
      token: string;
      username: string;
      userId: string;
    };
    expect(regBody.username).toBe('Nightscar');
    expect(regBody.token.length).toBeGreaterThan(16);

    const me = await authGet(
      new Request('http://localhost/api/daggah-auth', {
        headers: { [SESSION_HEADER]: regBody.token },
      }),
    );
    expect(me.status).toBe(200);
    expect(((await me.json()) as { username: string }).username).toBe('Nightscar');

    const put = await savePut(
      new Request('http://localhost/api/daggah-save', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: regBody.token,
        },
        body: JSON.stringify(sampleSave({ level: 14, savedAt: 200 })),
      }),
    );
    expect(put.status).toBe(204);

    // Fresh login session can still read the same user-keyed save.
    const login = await authPost(
      new Request('http://localhost/api/daggah-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          username: 'nightscar',
          password: 'stone-gate-9',
        }),
      }),
    );
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as { token: string };

    const get = await saveGet(
      new Request('http://localhost/api/daggah-save', {
        headers: { [SESSION_HEADER]: loginBody.token },
      }),
    );
    expect(get.status).toBe(200);
    const saveBody = (await get.json()) as {
      save: { level: number };
      ownerKind: string;
    };
    expect(saveBody.save.level).toBe(14);
    expect(saveBody.ownerKind).toBe('user');

    const rows = await sql<{ owner_key: string }>(
      `select owner_key from saves where owner_key like 'user:%'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.owner_key).toBe(`user:${regBody.userId}`);
  });

  it('rejects duplicate username, bad login, and weak passwords', async () => {
    const first = await authPost(
      new Request('http://localhost/api/daggah-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          username: 'UniqueHero',
          password: 'stone-gate-9',
        }),
      }),
    );
    expect(first.status).toBe(200);

    const dup = await authPost(
      new Request('http://localhost/api/daggah-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          username: 'uniquehero',
          password: 'stone-gate-9',
        }),
      }),
    );
    expect(dup.status).toBe(409);

    const badLogin = await authPost(
      new Request('http://localhost/api/daggah-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          username: 'UniqueHero',
          password: 'wrong-password',
        }),
      }),
    );
    expect(badLogin.status).toBe(401);

    const weak = await authPost(
      new Request('http://localhost/api/daggah-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          username: 'OtherHero',
          password: '',
        }),
      }),
    );
    expect(weak.status).toBe(400);

    const xssName = await authPost(
      new Request('http://localhost/api/daggah-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          username: '<img src=x onerror=alert(1)>',
          password: 'stone-gate-9',
        }),
      }),
    );
    expect(xssName.status).toBe(400);

    const spaced = await authPost(
      new Request('http://localhost/api/daggah-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          username: 'Mod Bons',
          password: 'stone-gate-9',
        }),
      }),
    );
    expect(spaced.status).toBe(400);
    const spacedBody = (await spaced.json()) as { error?: string };
    expect(spacedBody.error).toBe('invalid_username');
  });

  it('logs out and rejects the old session token', async () => {
    const register = await authPost(
      new Request('http://localhost/api/daggah-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          username: 'LogoutTest',
          password: 'stone-gate-9',
        }),
      }),
    );
    const { token } = (await register.json()) as { token: string };

    const logout = await authPost(
      new Request('http://localhost/api/daggah-auth', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: token,
        },
        body: JSON.stringify({ action: 'logout' }),
      }),
    );
    expect(logout.status).toBe(200);

    const me = await authGet(
      new Request('http://localhost/api/daggah-auth', {
        headers: { [SESSION_HEADER]: token },
      }),
    );
    expect(me.status).toBe(401);

    const save = await saveGet(
      new Request('http://localhost/api/daggah-save', {
        headers: { [SESSION_HEADER]: token },
      }),
    );
    expect(save.status).toBe(401);
  });
});
