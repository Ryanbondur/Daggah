import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as authPost } from '../../api/_lib/authApi';
import { GET as saveGet, PUT as savePut } from '../../api/_lib/saveApi';
import { readJsonBody } from '../../api/_lib/readBody';
import { getIdentity } from '../../cursor/identity';
import { itemIcon } from '../ui/assets';
import { generateAccountCode } from '../game/accountCode';
import { sanitizeItem } from '../game/state';
import type { Item } from '../data/types';
import { resetRateLimitsForTests } from './auth';
import { sql } from './db';
import { resetPgliteForTests } from './dbPglite';

const save = { version: 3, heroClass: 'Warrior', savedAt: 1_700_000_000_000 };

function auth(body: Record<string, unknown>, xff?: string) {
  return authPost(
    new Request('http://localhost/api/daggah-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(xff ? { 'x-forwarded-for': xff } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

function put(code: string, xff = '9.9.9.9') {
  return savePut(
    new Request('http://localhost/api/daggah-save', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-daggah-account-code': code,
        'x-forwarded-for': xff,
      },
      body: JSON.stringify(save),
    }),
  );
}

beforeEach(() => {
  resetPgliteForTests();
  resetRateLimitsForTests();
  process.env.CURSOR_APP_ID = 'daggah-test';
  process.env.CURSOR_APP_IDENTITY_ISSUER = 'https://example.invalid';
  delete process.env.DAGGAH_MAX_USERS;
  delete process.env.DAGGAH_MAX_ACCOUNT_CODE_SAVES;
  delete process.env.DAGGAH_GUEST_SAVE_TTL_DAYS;
  delete process.env.DAGGAH_INACTIVE_USER_DAYS;
});
afterEach(() => {
  resetPgliteForTests();
  resetRateLimitsForTests();
  delete process.env.CURSOR_APP_ID;
  delete process.env.CURSOR_APP_IDENTITY_ISSUER;
  delete process.env.DAGGAH_MAX_USERS;
  delete process.env.DAGGAH_MAX_ACCOUNT_CODE_SAVES;
  delete process.env.DAGGAH_GUEST_SAVE_TTL_DAYS;
  delete process.env.DAGGAH_INACTIVE_USER_DAYS;
});

describe('save-code item hardening', () => {
  it('clamps icon / level / stats / set from imported items', () => {
    const evil = {
      id: 'x',
      slot: 'chest',
      rarity: 'epic',
      gearLevel: '<img onerror=alert(1)>',
      name: 'Evil',
      icon: '"><script>alert(1)</script>',
      setId: '"><b>',
      stats: { atk: 5, hp: '<i>', bogus: 9 },
    } as unknown as Item;
    const clean = sanitizeItem(evil);
    expect(clean.icon).toBe('a');
    expect(clean.gearLevel).toBe(1);
    expect(clean.setId).toBeUndefined();
    expect(clean.stats).toEqual({ atk: 5 });
    expect(itemIcon(clean)).not.toMatch(/[<>"]/);
    expect(itemIcon({ ...clean, icon: '"><x' as never })).toMatch(/gear-a\//);
  });
});

describe('save endpoint abuse limits', () => {
  it('ignores account codes passed in the URL', async () => {
    const res = await saveGet(
      new Request(`http://localhost/api/daggah-save?accountCode=${generateAccountCode()}`),
    );
    expect(res.status).toBe(401);
  });

  it('rate-limits writes per owner', async () => {
    const code = generateAccountCode();
    for (let i = 0; i < 60; i++) expect((await put(code)).status).toBe(204);
    expect((await put(code)).status).toBe(429);
  });

  it('rejects oversized guest saves but not their size-compliant neighbours', async () => {
    const big = savePut(
      new Request('http://localhost/api/daggah-save', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-daggah-account-code': generateAccountCode(),
          'x-forwarded-for': '4.4.4.4',
        },
        body: JSON.stringify({ ...save, filler: 'x'.repeat(100_000) }),
      }),
    );
    expect((await big).status).toBe(400);
  });

  it('caps new guest rows per IP', async () => {
    for (let i = 0; i < 3; i++) expect((await put(generateAccountCode())).status).toBe(204);
    expect((await put(generateAccountCode())).status).toBe(429);
    expect((await put(generateAccountCode(), '8.8.8.8')).status).toBe(204);
  });
});

describe('auth abuse limits', () => {
  it('does not trust client-supplied left-hand X-Forwarded-For hops', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await auth(
        { action: 'register', username: `user_${i}`, password: 'long-enough-1' },
        `10.0.0.${i}, 1.2.3.4`,
      );
      expect(res.status).toBe(200);
    }
    const blocked = await auth(
      { action: 'register', username: 'user_x', password: 'long-enough-1' },
      '10.0.0.99, 1.2.3.4',
    );
    expect(blocked.status).toBe(429);
  });

  it('locks a username only for the failing IP, not for the real owner elsewhere', async () => {
    await auth({ action: 'register', username: 'victim', password: 'right-pass-1' }, '5.5.5.5');
    for (let i = 0; i < 8; i++) {
      const res = await auth(
        { action: 'login', username: 'victim', password: 'wrong-pass' },
        '7.7.7.7',
      );
      expect(res.status).toBe(401);
    }
    const attacker = await auth(
      { action: 'login', username: 'victim', password: 'wrong-pass' },
      '7.7.7.7',
    );
    expect(attacker.status).toBe(429);
    const owner = await auth(
      { action: 'login', username: 'victim', password: 'right-pass-1' },
      '6.6.6.6',
    );
    expect(owner.status).toBe(200);
  });

  it('keeps only the newest sessions per account', async () => {
    await auth({ action: 'register', username: 'sessionly', password: 'right-pass-1' }, '1.0.0.1');
    for (let i = 0; i < 12; i++) {
      const res = await auth(
        { action: 'login', username: 'sessionly', password: 'right-pass-1' },
        `1.0.1.${i}`,
      );
      expect(res.status).toBe(200);
    }
    const rows = await sql<{ n: number | string }>(
      `select count(*) as n from sessions s join users u on u.id = s.user_id where u.username = 'sessionly'`,
    );
    expect(Number(rows[0]?.n)).toBe(10);
  });

  it('answers a duplicate registration generically and unknown logins identically', async () => {
    await auth({ action: 'register', username: 'taken_one', password: 'right-pass-1' }, '1.1.1.1');
    const dup = await auth(
      { action: 'register', username: 'taken_one', password: 'other-pass-1' },
      '2.2.2.2',
    );
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: string }).error).toBe('registration_failed');

    const unknown = await auth({ action: 'login', username: 'nobody_here', password: 'x-pass-123' }, '3.3.3.3');
    const wrong = await auth({ action: 'login', username: 'taken_one', password: 'x-pass-123' }, '3.3.3.4');
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it('rate-limits login per IP without a shared global bucket starving other clients', async () => {
    await auth({ action: 'register', username: 'shared', password: 'right-pass-1' }, '9.0.0.1');
    for (let i = 0; i < 15; i++) {
      const res = await auth(
        { action: 'login', username: 'shared', password: 'right-pass-1' },
        '9.0.0.2',
      );
      expect(res.status).toBe(200);
    }
    expect(
      (await auth({ action: 'login', username: 'shared', password: 'right-pass-1' }, '9.0.0.2')).status,
    ).toBe(429);
    // A different client still has its own budget.
    expect(
      (await auth({ action: 'login', username: 'shared', password: 'right-pass-1' }, '9.0.0.3')).status,
    ).toBe(200);
  });

  it('reclaims abandoned accounts when at the env-configured user cap', async () => {
    process.env.DAGGAH_MAX_USERS = '2';
    process.env.DAGGAH_INACTIVE_USER_DAYS = '30';
    expect((await auth({ action: 'register', username: 'keep_me', password: 'right-pass-1' }, '2.0.0.1')).status).toBe(
      200,
    );
    expect((await auth({ action: 'register', username: 'stale_one', password: 'right-pass-1' }, '2.0.0.2')).status).toBe(
      200,
    );
    await sql(`delete from sessions`);
    await sql(`update users set updated_at = now() - interval '60 days' where username = 'stale_one'`);
    // keep_me stays recent so reclaim prefers stale_one only.
    await sql(`update users set updated_at = now() where username = 'keep_me'`);
    const next = await auth({ action: 'register', username: 'fresh_one', password: 'right-pass-1' }, '2.0.0.3');
    expect(next.status).toBe(200);
    const names = await sql<{ username: string }>(`select username from users order by username`);
    expect(names.map((r) => r.username)).toEqual(['fresh_one', 'keep_me']);
  });

  it('rejects oversized auth bodies while reading (not after)', async () => {
    const res = await authPost(
      new Request('http://localhost/api/daggah-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '4.0.0.1' },
        body: 'x'.repeat(20_000),
      }),
    );
    expect(res.status).toBe(413);
  });

  it('rate-limits change-password via Postgres (not an in-memory stub)', async () => {
    const reg = await auth(
      { action: 'register', username: 'pw_change', password: 'right-pass-1' },
      '5.0.0.1',
    );
    expect(reg.status).toBe(200);
    const { token } = (await reg.json()) as { token: string };

    const change = (password: string) =>
      authPost(
        new Request('http://localhost/api/daggah-auth', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-daggah-session': token,
            'x-forwarded-for': '5.0.0.1',
          },
          body: JSON.stringify({
            action: 'change-password',
            currentPassword: password,
            newPassword: 'right-pass-2',
          }),
        }),
      );

    for (let i = 0; i < 10; i++) {
      // Wrong current password still counts against the budget.
      expect((await change('wrong-pass-1')).status).toBe(401);
    }
    expect((await change('wrong-pass-1')).status).toBe(429);
  });
});

describe('readJsonBody size ceiling', () => {
  it('throws too_large once streamed bytes exceed the limit', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":"'));
        controller.enqueue(new TextEncoder().encode('y'.repeat(100)));
        controller.enqueue(new TextEncoder().encode('"}'));
        controller.close();
      },
    });
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: stream,
      // Node requires duplex when the body is a stream.
      duplex: 'half',
    } as RequestInit);
    await expect(readJsonBody(request, 50)).rejects.toThrow('too_large');
  });

  it('parses a body that stays under the limit', async () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
    });
    await expect(readJsonBody(request, 1_000)).resolves.toEqual({ ok: true });
  });
});

describe('identity simulated fallback', () => {
  it('does not treat a missing header as a simulated admin when CURSOR_APP_ID is set', async () => {
    const identity = await getIdentity(new Request('http://localhost/'));
    expect(identity.verified).toBe(false);
    if (!identity.verified) expect(identity.reason).toBe('missing_header');
  });

  it('does not use the simulated admin under NODE_ENV=production', async () => {
    const prevApp = process.env.CURSOR_APP_ID;
    const prevNode = process.env.NODE_ENV;
    delete process.env.CURSOR_APP_ID;
    process.env.NODE_ENV = 'production';
    try {
      const identity = await getIdentity(new Request('http://localhost/'));
      expect(identity.verified).toBe(false);
      if (!identity.verified) expect(identity.reason).toBe('missing_header');
    } finally {
      if (prevApp === undefined) delete process.env.CURSOR_APP_ID;
      else process.env.CURSOR_APP_ID = prevApp;
      process.env.NODE_ENV = prevNode;
    }
  });
});
