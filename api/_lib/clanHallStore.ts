/**
 * Postgres-backed clan hall persistence (invite code → shared roster JSON).
 */
import {
  hallSnapshot,
  humanIdForUser,
  removeHumanFromClan,
  sanitizeClanCode,
  sanitizeClanName,
  type ClanData,
} from '../../src/game/clanAdmit';
import { sql } from './db';

export type ClanHallRow = {
  code: string;
  clan_id: string;
  name: string;
  payload: string;
  updated_at: string | Date;
  created_at: string | Date;
};

export function parseHallPayload(raw: string): ClanData | null {
  try {
    const parsed = JSON.parse(raw) as ClanData;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.id !== 'string' || typeof parsed.code !== 'string') return null;
    if (!Array.isArray(parsed.members)) return null;
    return hallSnapshot(parsed);
  } catch {
    return null;
  }
}

export async function getHallByCode(code: string): Promise<{ clan: ClanData; updatedAt: string | Date } | null> {
  const clean = sanitizeClanCode(code);
  if (!clean) return null;
  const rows = await sql<ClanHallRow>(
    `select code, clan_id, name, payload, updated_at, created_at
     from clan_halls where code = $1 limit 1`,
    [clean],
  );
  const row = rows[0];
  if (!row) return null;
  const clan = parseHallPayload(row.payload);
  if (!clan) return null;
  return { clan, updatedAt: row.updated_at };
}

export async function getSeat(userId: string): Promise<{ clanCode: string; memberId: string } | null> {
  const rows = await sql<{ clan_code: string; member_id: string }>(
    `select clan_code, member_id from clan_hall_seats where user_id = $1 limit 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return { clanCode: row.clan_code, memberId: row.member_id };
}

export async function upsertHall(clan: ClanData): Promise<ClanData> {
  const snap = hallSnapshot(clan);
  const code = sanitizeClanCode(snap.code);
  const name = sanitizeClanName(snap.name);
  if (!code || !snap.id) throw new Error('invalid_hall');
  const payload = JSON.stringify(snap);
  await sql(
    `insert into clan_halls (code, clan_id, name, payload, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (code) do update set
       clan_id = excluded.clan_id,
       name = excluded.name,
       payload = excluded.payload,
       updated_at = now()`,
    [code, snap.id, name, payload],
  );
  return snap;
}

export async function deleteHall(code: string): Promise<void> {
  const clean = sanitizeClanCode(code);
  if (!clean) return;
  await sql(`delete from clan_halls where code = $1`, [clean]);
}

export async function setSeat(userId: string, clanCode: string, memberId: string): Promise<void> {
  const code = sanitizeClanCode(clanCode);
  await sql(
    `insert into clan_hall_seats (user_id, clan_code, member_id, updated_at)
     values ($1, $2, $3, now())
     on conflict (user_id) do update set
       clan_code = excluded.clan_code,
       member_id = excluded.member_id,
       updated_at = now()`,
    [userId, code, memberId],
  );
}

export async function clearSeat(userId: string): Promise<void> {
  await sql(`delete from clan_hall_seats where user_id = $1`, [userId]);
}

/** Refresh seats for every real (non-AI) member in the hall payload. */
export async function syncSeatsFromClan(clan: ClanData): Promise<void> {
  const code = sanitizeClanCode(clan.code);
  const reals = clan.members.filter((m) => m.isAi === false);
  // Drop seats that no longer match this hall's real members.
  const ids = reals.map((m) => m.id);
  if (!ids.length) {
    await sql(`delete from clan_hall_seats where clan_code = $1`, [code]);
    return;
  }
  await sql(
    `delete from clan_hall_seats
     where clan_code = $1 and not (member_id = any($2::text[]))`,
    [code, ids],
  );
  for (const m of reals) {
    // member id is human_<userId> for auth members.
    if (!m.id.startsWith('human_')) continue;
    const userId = m.id.slice('human_'.length);
    if (!userId) continue;
    await setSeat(userId, code, m.id);
  }
}

export async function leaveHallForUser(userId: string): Promise<ClanData | null> {
  const seat = await getSeat(userId);
  if (!seat) return null;
  const hall = await getHallByCode(seat.clanCode);
  if (!hall) {
    await clearSeat(userId);
    return null;
  }
  const humanId = humanIdForUser(userId);
  const next = removeHumanFromClan(hall.clan, humanId);
  await clearSeat(userId);
  if (!next) {
    await deleteHall(seat.clanCode);
    return null;
  }
  const saved = await upsertHall(next);
  await syncSeatsFromClan(saved);
  return saved;
}
