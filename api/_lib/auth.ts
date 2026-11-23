// server-only — username/password auth for cloud saves (Web Crypto; no node:crypto).
import {
  MAX_PASSWORD_LEN,
  MAX_USERNAME_LEN,
  MIN_PASSWORD_LEN,
  MIN_USERNAME_LEN,
  normalizeUsername,
  validatePassword,
} from './authValidation';
import { sql } from './db';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  pbkdf2Sha256,
  randomBytes,
  randomUUID,
  sha256Hex,
  timingSafeEqual,
} from './webCrypto';

export const SESSION_HEADER = 'x-daggah-session';
export const SESSION_DAYS = 30;
/** Newest sessions kept per account; older ones are revoked on each new login. */
export const MAX_SESSIONS_PER_USER = 10;
export {
  MAX_PASSWORD_LEN,
  MAX_USERNAME_LEN,
  MIN_PASSWORD_LEN,
  MIN_USERNAME_LEN,
  normalizeUsername,
  validatePassword,
};

/** PBKDF2 params (WebCrypto-compatible). */
const PBKDF2_ITERS = 210_000;
const PBKDF2_KEYLEN = 32;

export type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  created_at: string | Date;
  updated_at: string | Date;
};

export type SessionUser = {
  id: string;
  username: string;
};

export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export function ownerKeyForUser(userId: string): string {
  return `user:${userId}`;
}

function encodeHash(salt: Uint8Array, derived: Uint8Array): string {
  return `pbkdf2$${PBKDF2_ITERS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(derived)}`;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await pbkdf2Sha256(password, salt, PBKDF2_ITERS, PBKDF2_KEYLEN);
  return encodeHash(salt, derived);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iters = Number(parts[1]);
  if (!Number.isFinite(iters) || iters < 10_000 || iters > 2_000_000) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = base64UrlToBytes(parts[2]!);
    expected = base64UrlToBytes(parts[3]!);
  } catch {
    return false;
  }
  if (salt.length < 8 || expected.length < 16) return false;
  const actual = await pbkdf2Sha256(password, salt, iters, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function createUser(username: string, password: string): Promise<UserRow> {
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  const rows = await sql<UserRow>(
    `insert into users (id, username, password_hash, created_at, updated_at)
     values ($1, $2, $3, now(), now())
     returning id, username, password_hash, created_at, updated_at`,
    [id, username, passwordHash],
  );
  const row = rows[0];
  if (!row) throw new Error('createUser returned no row');
  return row;
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const rows = await sql<UserRow>(
    `select id, username, password_hash, created_at, updated_at
     from users
     where lower(username) = lower($1)
     limit 1`,
    [username],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const rows = await sql<UserRow>(
    `select id, username, password_hash, created_at, updated_at
     from users
     where id = $1
     limit 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updatePassword(userId: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await sql(`update users set password_hash = $2, updated_at = now() where id = $1`, [
    userId,
    passwordHash,
  ]);
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = bytesToBase64Url(randomBytes(32));
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql(
    `insert into sessions (token_hash, user_id, expires_at, created_at)
     values ($1, $2, $3, now())`,
    [tokenHash, userId, expiresAt.toISOString()],
  );
  // Keep updated_at fresh so capacity reclaim never deletes recently-active accounts.
  await sql(`update users set updated_at = now() where id = $1`, [userId]);
  await sql(
    `delete from sessions
     where user_id = $1
       and (expires_at <= now()
         or token_hash not in (
           select token_hash from sessions where user_id = $1
           order by created_at desc, token_hash limit $2
         ))`,
    [userId, MAX_SESSIONS_PER_USER],
  );
  if (Math.random() < 0.02) {
    void sql(`delete from sessions where expires_at <= now()`).catch(() => undefined);
  }
  return { token, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  const tokenHash = await hashToken(token);
  await sql(`delete from sessions where token_hash = $1`, [tokenHash]);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await sql(`delete from sessions where user_id = $1`, [userId]);
}

export async function resolveSessionToken(token: string): Promise<SessionUser | null> {
  if (!token || token.length < 16 || token.length > 200) return null;
  const tokenHash = await hashToken(token);
  const rows = await sql<{ user_id: string; username: string; expires_at: string | Date }>(
    `select s.user_id, u.username, s.expires_at
     from sessions s
     join users u on u.id = s.user_id
     where s.token_hash = $1
     limit 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  const expires = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
  if (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
    await sql(`delete from sessions where token_hash = $1`, [tokenHash]);
    return null;
  }
  return { id: row.user_id, username: row.username };
}

export function extractSessionToken(request: Request): string | null {
  const header = request.headers.get(SESSION_HEADER)?.trim() ?? '';
  if (header) return header;
  const auth = request.headers.get('authorization')?.trim() ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m?.[1]) return m[1].trim();
  return null;
}

/**
 * Test helper name kept for callers. Auth/save/clan budgets live in Postgres
 * `rate_limits` (see rateLimit.ts); PGlite test resets wipe that table via
 * resetPgliteForTests. This no-op remains so older test imports stay valid.
 */
export function resetRateLimitsForTests(): void {
  /* Postgres rate_limits cleared by resetPgliteForTests / resetRateLimitsDbForTests */
}

/**
 * Best-effort client IP. Uses the right-most X-Forwarded-For hop (the one appended by the
 * host's own proxy); left-hand values are client-controlled and never trusted. Auth limits
 * key primarily on this IP (and username for failed-login lockouts).
 */
export function clientIp(request: Request): string {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) {
    const hops = xf.split(',').map((h) => h.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last.slice(0, 64);
  }
  return 'local';
}

let dummyHash: Promise<string> | undefined;
/** Burn the same PBKDF2 work for unknown usernames so login timing does not leak existence. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('daggah-dummy-password');
  await verifyPassword(password, await dummyHash);
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '23505') return true;
  const msg = String((error as { message?: string }).message ?? error).toLowerCase();
  return msg.includes('unique') || msg.includes('duplicate');
}
