// server-only — username/password auth for cloud saves
import { createHash, randomBytes, randomUUID, pbkdf2 as pbkdf2Cb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  MAX_PASSWORD_LEN,
  MAX_USERNAME_LEN,
  MIN_PASSWORD_LEN,
  MIN_USERNAME_LEN,
  normalizeUsername,
  validatePassword,
} from './authValidation';
import { sql } from './db';

const pbkdf2 = promisify(pbkdf2Cb);

export const SESSION_HEADER = 'x-daggah-session';
export const SESSION_DAYS = 30;
export {
  MAX_PASSWORD_LEN,
  MAX_USERNAME_LEN,
  MIN_PASSWORD_LEN,
  MIN_USERNAME_LEN,
  normalizeUsername,
  validatePassword,
};

/** PBKDF2 params (WebCrypto-compatible algorithm; Node crypto implementation). */
const PBKDF2_ITERS = 210_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

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

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function ownerKeyForUser(userId: string): string {
  return `user:${userId}`;
}

function encodeHash(salt: Buffer, derived: Buffer): string {
  return `pbkdf2$${PBKDF2_ITERS}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await pbkdf2(password, salt, PBKDF2_ITERS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  return encodeHash(salt, derived);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iters = Number(parts[1]);
  if (!Number.isFinite(iters) || iters < 10_000 || iters > 2_000_000) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[2]!, 'base64url');
    expected = Buffer.from(parts[3]!, 'base64url');
  } catch {
    return false;
  }
  if (salt.length < 8 || expected.length < 16) return false;
  const actual = await pbkdf2(password, salt, iters, expected.length, PBKDF2_DIGEST);
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
  await sql(
    `update users set password_hash = $2, updated_at = now() where id = $1`,
    [userId, passwordHash],
  );
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql(
    `insert into sessions (token_hash, user_id, expires_at, created_at)
     values ($1, $2, $3, now())`,
    [tokenHash, userId, expiresAt.toISOString()],
  );
  return { token, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await sql(`delete from sessions where token_hash = $1`, [tokenHash]);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await sql(`delete from sessions where user_id = $1`, [userId]);
}

export async function resolveSessionToken(token: string): Promise<SessionUser | null> {
  if (!token || token.length < 16 || token.length > 200) return null;
  const tokenHash = hashToken(token);
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

/** Simple in-memory IP rate limit (best-effort; resets on process restart). */
type Bucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

/** Test helper: clear rate-limit state between cases. */
export function resetRateLimitsForTests(): void {
  rateBuckets.clear();
}

export function clientIp(request: Request): string {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return 'local';
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  // Postgres unique_violation; PGlite may surface similar codes or message text.
  if (code === '23505') return true;
  const msg = String((error as { message?: string }).message ?? error).toLowerCase();
  return msg.includes('unique') || msg.includes('duplicate');
}
