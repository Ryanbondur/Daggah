/**
 * Username/password auth API for cloud saves.
 * POST /api/daggah-auth  body: { action: 'register'|'login'|'logout'|'change-password', ... }
 * GET  /api/daggah-auth  → current session (me)
 */
import {
  SESSION_HEADER,
  clientIp,
  createSession,
  createUser,
  extractSessionToken,
  findUserByUsername,
  isUniqueViolation,
  normalizeUsername,
  rateLimit,
  revokeAllSessions,
  revokeSession,
  resolveSessionToken,
  updatePassword,
  validatePassword,
  verifyAgainstDummy,
  verifyPassword,
} from './auth';
import { isDatabaseUnavailable, isUndefinedTable, sql } from './db';
import { clearRateLimit, hitRateLimit, peekRateLimit } from './rateLimit';

const MAX_USERS = 20_000;
/** Failed logins tolerated per username+IP, and per username across all IPs (distributed guessing). */
const LOGIN_FAILS_PER_IP = 8;
const LOGIN_FAILS_PER_USER = 100;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function limited(result: { ok: false; retryAfterSec: number }): Response {
  return json({ error: 'rate_limited', retryAfterSec: result.retryAfterSec }, 429, {
    'retry-after': String(result.retryAfterSec),
  });
}

const NO_STORE = { 'cache-control': 'private, no-store' } as const;

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

function internalError(error: unknown, where: string): Response {
  console.error(`${where} failed`, error instanceof Error ? error.message : 'unknown');
  if (isDatabaseUnavailable(error)) {
    return json(
      {
        error: 'database_unavailable',
        hint: 'Cloud login is temporarily unavailable. Play as guest — progress stays on this device.',
      },
      503,
    );
  }
  if (isUndefinedTable(error)) {
    return json(
      {
        error: 'schema_missing',
        hint: 'Account tables are not ready yet. Try again in a moment, or continue as guest.',
      },
      503,
    );
  }
  return json(
    {
      error: 'internal',
      hint: 'Something went wrong on the server. Try again, or continue as guest.',
    },
    500,
  );
}

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 16_000) throw new Error('too_large');
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

async function requireUser(request: Request) {
  const token = extractSessionToken(request);
  if (!token) return { error: json({ error: 'unauthorized' }, 401) as Response };
  const user = await resolveSessionToken(token);
  if (!user) return { error: json({ error: 'unauthorized' }, 401) as Response };
  return { token, user };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireUser(request);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string; username: string } };
    return json({ username: user.username, userId: user.id });
  } catch (error) {
    return internalError(error, 'GET /api/daggah-auth');
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await readBody(request);
    } catch (error) {
      if (error instanceof Error && error.message === 'too_large') {
        return json({ error: 'payload_too_large' }, 413);
      }
      return json({ error: 'invalid_json' }, 400);
    }

    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'invalid_body' }, 400);
    }
    const obj = body as Record<string, unknown>;
    const action = typeof obj.action === 'string' ? obj.action : '';

    const ip = clientIp(request);

    if (action === 'register' || action === 'login') {
      const username = normalizeUsername(typeof obj.username === 'string' ? obj.username : '');
      if (!username) {
        return json(
          {
            error: 'invalid_username',
            hint: '3–24 chars: letters, digits, _ or - (no spaces)',
          },
          400,
        );
      }
      const password = typeof obj.password === 'string' ? obj.password : '';
      const pwErr = validatePassword(password);
      if (pwErr) return json({ error: 'weak_password', hint: pwErr }, 400);

      // Only well-formed requests reach the expensive paths (hashing / inserts); limit those.
      // Global bucket first: bounds total work/rows regardless of spoofed IPs or usernames.
      const globalHit =
        action === 'register'
          ? await hitRateLimit('auth:register:global', 40, 60 * 60 * 1000)
          : await hitRateLimit('auth:login:global', 1000, LOGIN_WINDOW_MS);
      if (!globalHit.ok) return limited(globalHit);
      const ipHit =
        action === 'register'
          ? await hitRateLimit(`auth:register:ip:${ip}`, 3, 60 * 60 * 1000)
          : await hitRateLimit(`auth:login:ip:${ip}`, 15, LOGIN_WINDOW_MS);
      if (!ipHit.ok) return limited(ipHit);

      if (action === 'register') {
        const countRows = await sql<{ n: number | string }>(`select count(*) as n from users`);
        if (Number(countRows[0]?.n ?? 0) >= MAX_USERS) {
          return json({ error: 'registration_closed', hint: 'New accounts are paused. Play as guest.' }, 503);
        }
        try {
          const user = await createUser(username, password);
          const session = await createSession(user.id);
          return json({
            ok: true,
            username: user.username,
            userId: user.id,
            token: session.token,
            expiresAt: session.expiresAt.toISOString(),
          });
        } catch (error) {
          if (isUniqueViolation(error)) {
            return json(
              { error: 'registration_failed', hint: "Couldn't create that account. Try a different username." },
              409,
            );
          }
          throw error;
        }
      }

      // login — a victim is only locked out from the attacker's own IP (username+IP key);
      // the much higher username-wide cap only stops distributed guessing.
      const nameKey = username.toLowerCase();
      const pairKey = `auth:login:fail:${nameKey}:${ip}`;
      const userKey = `auth:login:fail:${nameKey}`;
      const pairBlocked = await peekRateLimit(pairKey, LOGIN_FAILS_PER_IP);
      if (!pairBlocked.ok) return limited(pairBlocked);
      const userBlocked = await peekRateLimit(userKey, LOGIN_FAILS_PER_USER);
      if (!userBlocked.ok) return limited(userBlocked);
      const user = await findUserByUsername(username);
      const ok = user ? await verifyPassword(password, user.password_hash) : false;
      if (!user) await verifyAgainstDummy(password);
      if (!user || !ok) {
        await hitRateLimit(pairKey, LOGIN_FAILS_PER_IP, LOGIN_WINDOW_MS);
        await hitRateLimit(userKey, LOGIN_FAILS_PER_USER, LOGIN_WINDOW_MS);
        return json({ error: 'invalid_credentials' }, 401);
      }
      await clearRateLimit(pairKey);
      const session = await createSession(user.id);
      return json({
        ok: true,
        username: user.username,
        userId: user.id,
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
      });
    }

    if (action === 'logout') {
      const token = extractSessionToken(request);
      if (token) await revokeSession(token);
      return json({ ok: true });
    }

    if (action === 'change-password') {
      const auth = await requireUser(request);
      if ('error' in auth && auth.error) return auth.error;
      const { token, user } = auth as {
        token: string;
        user: { id: string; username: string };
      };

      const limited = rateLimit(`auth:change-password:${user.id}`, 10, 15 * 60 * 1000);
      if (!limited.ok) {
        return json(
          { error: 'rate_limited', retryAfterSec: limited.retryAfterSec },
          429,
          { 'retry-after': String(limited.retryAfterSec) },
        );
      }

      const currentPassword = typeof obj.currentPassword === 'string' ? obj.currentPassword : '';
      const nextPassword = typeof obj.newPassword === 'string' ? obj.newPassword : '';
      const pwErr = validatePassword(nextPassword);
      if (pwErr) return json({ error: 'weak_password', hint: pwErr }, 400);

      const row = await findUserByUsername(user.username);
      if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
        return json({ error: 'invalid_credentials' }, 401);
      }

      await updatePassword(user.id, nextPassword);
      // Rotate sessions: drop all, issue a fresh token for this device.
      await revokeAllSessions(user.id);
      const session = await createSession(user.id);
      // Also revoke the old token hash if somehow still present (already wiped).
      void token;
      return json({
        ok: true,
        username: user.username,
        userId: user.id,
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
      });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    return internalError(error, 'POST /api/daggah-auth');
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      ...NO_STORE,
      allow: 'GET, POST, OPTIONS',
      // Advertise custom session header for clients that care.
      'access-control-allow-headers': `content-type, authorization, ${SESSION_HEADER}`,
    },
  });
}
