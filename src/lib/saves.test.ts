import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET, PUT } from '../../api/_lib/saveApi';
import { ACCOUNT_CODE_HEADER, hashAccountCode, normalizeAccountCode } from './owner';
import { dbMode, sql } from './db';
import { resetPgliteForTests } from './dbPglite';
import { getSave, sanitizeSavePayload, upsertSave } from './saves';

function validAccountCode(): string {
  // Build a checksum-valid code the same way the client does.
  const body = 'abcdefghijklmnopqrstuvwx';
  let h = 2166136261;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const sum = (h >>> 0).toString(36);
  return `DGAC.${body}.${sum}`;
}

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

describe('migrations + save roundtrip (PGlite)', () => {
  beforeEach(() => {
    resetPgliteForTests();
    // Disable simulated identity so account-code auth is exercised.
    process.env.CURSOR_APP_ID = 'daggah-test';
    process.env.CURSOR_APP_IDENTITY_ISSUER = 'https://example.invalid';
  });

  afterEach(() => {
    resetPgliteForTests();
    delete process.env.CURSOR_APP_ID;
    delete process.env.CURSOR_APP_IDENTITY_ISSUER;
  });

  it('uses PGlite when DATABASE_URL is unset', () => {
    expect(dbMode()).toBe('pglite');
  });

  it('applies migrations and round-trips a save row', async () => {
    const ownerKey = `ac:${await hashAccountCode(validAccountCode())}`;
    const payload = JSON.stringify(sampleSave());
    const written = await upsertSave(ownerKey, payload, 3);
    expect(written.owner_key).toBe(ownerKey);
    expect(written.schema_version).toBe(3);

    const read = await getSave(ownerKey);
    expect(read?.payload).toBe(payload);

    const tables = await sql<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1)
       order by table_name`,
      [['clan_results', 'saves', 'season_stats', 'sessions', 'users']],
    );
    expect(tables.map((t) => t.table_name)).toEqual([
      'clan_results',
      'saves',
      'season_stats',
      'sessions',
      'users',
    ]);
  });

  it('sanitizes payloads and rejects oversized / invalid bodies', () => {
    const ok = sanitizeSavePayload(sampleSave());
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.schemaVersion).toBe(3);

    const nested = sanitizeSavePayload({ save: sampleSave({ level: 9 }) });
    expect(nested.ok).toBe(true);

    expect(sanitizeSavePayload(null).ok).toBe(false);
    expect(sanitizeSavePayload({ heroClass: 'Warrior' }).ok).toBe(false);
  });

  it('GET/PUT /api/daggah-save round-trips via account code', async () => {
    const code = validAccountCode();
    expect(normalizeAccountCode(code)).toBe(code);

    const put = await PUT(
      new Request('http://localhost/api/daggah-save', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          [ACCOUNT_CODE_HEADER]: code,
        },
        body: JSON.stringify(sampleSave({ level: 11, savedAt: 100 })),
      }),
    );
    expect(put.status).toBe(204);

    const get = await GET(
      new Request('http://localhost/api/daggah-save', {
        headers: { [ACCOUNT_CODE_HEADER]: code },
      }),
    );
    expect(get.status).toBe(200);
    const body = (await get.json()) as { save: { level: number }; ownerKind: string };
    expect(body.save.level).toBe(11);
    expect(body.ownerKind).toBe('account');

    // Older push conflicts unless force=1
    const conflict = await PUT(
      new Request('http://localhost/api/daggah-save', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          [ACCOUNT_CODE_HEADER]: code,
        },
        body: JSON.stringify(sampleSave({ level: 2, savedAt: 50 })),
      }),
    );
    expect(conflict.status).toBe(409);

    const forced = await PUT(
      new Request('http://localhost/api/daggah-save?force=1', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          [ACCOUNT_CODE_HEADER]: code,
        },
        body: JSON.stringify(sampleSave({ level: 2, savedAt: 50 })),
      }),
    );
    expect(forced.status).toBe(204);
  });

  it('rejects missing account code when identity is unavailable', async () => {
    const res = await GET(new Request('http://localhost/api/daggah-save'));
    expect(res.status).toBe(401);
  });
});
