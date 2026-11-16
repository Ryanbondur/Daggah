// server-only — Postgres-backed fixed-window rate limits (shared across serverless instances).
import { sql } from './db';

export type RateResult = { ok: true } | { ok: false; retryAfterSec: number };

function retryAfter(resetAt: string | Date): number {
  const t = resetAt instanceof Date ? resetAt.getTime() : new Date(resetAt).getTime();
  return Math.max(1, Math.ceil((t - Date.now()) / 1000));
}

function maybePrune(): void {
  if (Math.random() < 0.02) {
    void sql(`delete from rate_limits where reset_at < now() - interval '1 hour'`).catch(
      () => undefined,
    );
  }
}

/** Count one hit against `key`; blocks once more than `limit` hits land inside the window. */
export async function hitRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateResult> {
  maybePrune();
  const rows = await sql<{ count: number; reset_at: string | Date }>(
    `insert into rate_limits (key, count, reset_at)
     values ($1, 1, now() + ($2::int * interval '1 millisecond'))
     on conflict (key) do update set
       count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
       reset_at = case when rate_limits.reset_at <= now()
         then now() + ($2::int * interval '1 millisecond') else rate_limits.reset_at end
     returning count, reset_at`,
    [key, Math.floor(windowMs)],
  );
  const row = rows[0];
  if (!row) return { ok: true };
  return Number(row.count) > limit ? { ok: false, retryAfterSec: retryAfter(row.reset_at) } : { ok: true };
}

/** Read-only check: is `key` already over `limit` in its live window? */
export async function peekRateLimit(key: string, limit: number): Promise<RateResult> {
  const rows = await sql<{ count: number; reset_at: string | Date }>(
    `select count, reset_at from rate_limits where key = $1 and reset_at > now()`,
    [key],
  );
  const row = rows[0];
  if (row && Number(row.count) >= limit) return { ok: false, retryAfterSec: retryAfter(row.reset_at) };
  return { ok: true };
}

export async function clearRateLimit(key: string): Promise<void> {
  await sql(`delete from rate_limits where key = $1`, [key]);
}

export function resetRateLimitsDbForTests(): Promise<unknown> {
  return sql(`delete from rate_limits`);
}
