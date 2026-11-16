/**
 * Soft account / guest-save capacity: env-tunable caps plus safe reclaim of
 * clearly abandoned slots so operators need not ship a code change to raise
 * limits or free room. Active accounts are never deleted.
 */
import { sql } from './db';

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Registered users hard ceiling (default 20_000). Override with DAGGAH_MAX_USERS. */
export function maxUsers(): number {
  return envInt('DAGGAH_MAX_USERS', 20_000, 1, 2_000_000);
}

/** Guest (account-code) save rows hard ceiling. Override with DAGGAH_MAX_ACCOUNT_CODE_SAVES. */
export function maxAccountCodeSaves(): number {
  return envInt('DAGGAH_MAX_ACCOUNT_CODE_SAVES', 5_000, 1, 2_000_000);
}

/** Idle guest-save TTL in days before reclaim. Override with DAGGAH_GUEST_SAVE_TTL_DAYS. */
export function guestSaveTtlDays(): number {
  return envInt('DAGGAH_GUEST_SAVE_TTL_DAYS', 90, 7, 3650);
}

/**
 * Users with no live session and no touch for this many days may be reclaimed
 * when registration is at capacity. Override with DAGGAH_INACTIVE_USER_DAYS.
 */
export function inactiveUserDays(): number {
  return envInt('DAGGAH_INACTIVE_USER_DAYS', 180, 30, 3650);
}

/**
 * Drop abandoned registered users (and their cloud saves) to free slots.
 * Never touches users with a non-expired session or a recent users.updated_at.
 * Returns how many user rows were removed.
 */
export async function reclaimInactiveUsers(need = 1): Promise<number> {
  if (need <= 0) return 0;
  const days = inactiveUserDays();
  const rows = await sql<{ id: string }>(
    `with doomed as (
       select u.id
       from users u
       where u.updated_at < now() - ($1::int * interval '1 day')
         and not exists (
           select 1 from sessions s
           where s.user_id = u.id and s.expires_at > now()
         )
       order by u.updated_at asc
       limit $2
     ),
     drop_saves as (
       delete from saves
       where owner_key in (select 'user:' || id from doomed)
       returning 1
     ),
     drop_users as (
       delete from users where id in (select id from doomed)
       returning id
     )
     select id from drop_users`,
    [days, need],
  );
  return rows.length;
}

/** Prune idle guest (account-code) save rows older than the configured TTL. */
export async function reclaimIdleGuestSaves(): Promise<void> {
  const days = guestSaveTtlDays();
  await sql(
    `delete from saves where owner_key like 'ac:%' and updated_at < now() - ($1::int * interval '1 day')`,
    [days],
  );
}
