/**
 * Postgres-backed 4v4 matchmaking queue + formed matches.
 */
import {
  isValidBracket,
  matchBandLabelForPair,
  ticketsCompatible,
  type MatchTicketSnap,
} from '../../src/game/matchmaking';
import type { ClanBracketId } from '../../src/game/clanBrackets';
import { randomBytes, randomUUID } from './webCrypto';
import { sql } from './db';

export type QueueRow = {
  id: string;
  user_id: string;
  clan_code: string;
  clan_name: string;
  team_cp: number;
  avg_cp: number;
  bracket: string;
  challenge_up: boolean;
  at_top: boolean;
  roster_json: string;
  season_id: number;
  created_at: string | Date;
};

export type MatchRow = {
  id: string;
  seed: number;
  bracket: string;
  band_label: string;
  team_a_user_id: string;
  team_b_user_id: string;
  team_a_clan_code: string;
  team_b_clan_code: string;
  team_a_clan_name: string;
  team_b_clan_name: string;
  team_a_roster: string;
  team_b_roster: string;
  team_a_team_cp: number;
  team_b_team_cp: number;
  status: string;
  created_at: string | Date;
};

export type EnqueueInput = {
  userId: string;
  clanCode: string;
  clanName: string;
  teamCp: number;
  avgCp: number;
  bracket: ClanBracketId;
  challengeUp: boolean;
  atTop: boolean;
  rosterJson: string;
  seasonId: number;
};

export type FormedMatch = {
  id: string;
  seed: number;
  bracket: ClanBracketId;
  bandLabel: string;
  youAreTeamA: boolean;
  allyClanCode: string;
  allyClanName: string;
  allyTeamCp: number;
  allyRosterJson: string;
  enemyClanCode: string;
  enemyClanName: string;
  enemyTeamCp: number;
  enemyRosterJson: string;
  createdAt: string | Date;
};

function asTime(v: string | Date): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

function waitSeconds(createdAt: string | Date, nowMs: number): number {
  return Math.max(0, (nowMs - asTime(createdAt)) / 1000);
}

function seedFromBytes(): number {
  const bytes = randomBytes(4);
  return (
    ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0
  );
}

function rowToSnap(row: QueueRow, nowMs: number): MatchTicketSnap {
  return {
    userId: row.user_id,
    clanCode: row.clan_code,
    avgCp: Number(row.avg_cp) || 0,
    teamCp: Number(row.team_cp) || 0,
    bracket: row.bracket as ClanBracketId,
    atTop: !!row.at_top,
    waitS: waitSeconds(row.created_at, nowMs),
  };
}

export async function removeQueueTicket(userId: string): Promise<void> {
  await sql(`delete from match_queue where user_id = $1`, [userId]);
}

export async function getQueueTicket(userId: string): Promise<QueueRow | null> {
  const rows = await sql<QueueRow>(
    `select id, user_id, clan_code, clan_name, team_cp, avg_cp, bracket,
            challenge_up, at_top, roster_json, season_id, created_at
     from match_queue where user_id = $1 limit 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function upsertQueueTicket(input: EnqueueInput): Promise<QueueRow> {
  const existing = await getQueueTicket(input.userId);
  const id = existing?.id ?? `mq_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  // Keep original created_at so wait-time band widening continues across polls.
  if (existing) {
    await sql(
      `update match_queue set
         clan_code = $2,
         clan_name = $3,
         team_cp = $4,
         avg_cp = $5,
         bracket = $6,
         challenge_up = $7,
         at_top = $8,
         roster_json = $9,
         season_id = $10
       where user_id = $1`,
      [
        input.userId,
        input.clanCode,
        input.clanName,
        input.teamCp,
        input.avgCp,
        input.bracket,
        input.challengeUp,
        input.atTop,
        input.rosterJson,
        input.seasonId,
      ],
    );
  } else {
    await sql(
      `insert into match_queue
         (id, user_id, clan_code, clan_name, team_cp, avg_cp, bracket,
          challenge_up, at_top, roster_json, season_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())`,
      [
        id,
        input.userId,
        input.clanCode,
        input.clanName,
        input.teamCp,
        input.avgCp,
        input.bracket,
        input.challengeUp,
        input.atTop,
        input.rosterJson,
        input.seasonId,
      ],
    );
  }
  const row = await getQueueTicket(input.userId);
  if (!row) throw new Error('queue_upsert_failed');
  return row;
}

async function insertMatch(
  a: QueueRow,
  b: QueueRow,
  nowMs: number,
): Promise<MatchRow> {
  const snapA = rowToSnap(a, nowMs);
  const snapB = rowToSnap(b, nowMs);
  const id = `m_${randomUUID().replace(/-/g, '').slice(0, 18)}`;
  const seed = seedFromBytes();
  const bandLabel = matchBandLabelForPair(snapA, snapB);
  const bracket = a.bracket;
  await sql(
    `insert into matches
       (id, seed, bracket, band_label,
        team_a_user_id, team_b_user_id,
        team_a_clan_code, team_b_clan_code,
        team_a_clan_name, team_b_clan_name,
        team_a_roster, team_b_roster,
        team_a_team_cp, team_b_team_cp,
        status, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'ready', now())`,
    [
      id,
      seed,
      bracket,
      bandLabel,
      a.user_id,
      b.user_id,
      a.clan_code,
      b.clan_code,
      a.clan_name,
      b.clan_name,
      a.roster_json,
      b.roster_json,
      a.team_cp,
      b.team_cp,
    ],
  );
  await sql(`delete from match_queue where user_id = any($1::text[])`, [
    [a.user_id, b.user_id],
  ]);
  const rows = await sql<MatchRow>(`select * from matches where id = $1`, [id]);
  const row = rows[0];
  if (!row) throw new Error('match_insert_failed');
  return row;
}

/** Try to pair `userId`'s ticket with the oldest compatible peer in-band. */
export async function tryFormMatch(userId: string): Promise<MatchRow | null> {
  const mine = await getQueueTicket(userId);
  if (!mine || !isValidBracket(mine.bracket)) return null;
  const nowMs = Date.now();
  const peers = await sql<QueueRow>(
    `select id, user_id, clan_code, clan_name, team_cp, avg_cp, bracket,
            challenge_up, at_top, roster_json, season_id, created_at
     from match_queue
     where bracket = $1
       and user_id <> $2
       and clan_code <> $3
     order by created_at asc
     limit 40`,
    [mine.bracket, mine.user_id, mine.clan_code],
  );
  const mySnap = rowToSnap(mine, nowMs);
  for (const peer of peers) {
    if (!ticketsCompatible(mySnap, rowToSnap(peer, nowMs))) continue;
    return insertMatch(mine, peer, nowMs);
  }
  return null;
}

export async function findReadyMatchForUser(userId: string): Promise<MatchRow | null> {
  const rows = await sql<MatchRow>(
    `select * from matches
     where status = 'ready'
       and (team_a_user_id = $1 or team_b_user_id = $1)
     order by created_at desc
     limit 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getMatch(matchId: string): Promise<MatchRow | null> {
  const rows = await sql<MatchRow>(`select * from matches where id = $1 limit 1`, [matchId]);
  return rows[0] ?? null;
}

export function matchForUser(row: MatchRow, userId: string): FormedMatch | null {
  const isA = row.team_a_user_id === userId;
  const isB = row.team_b_user_id === userId;
  if (!isA && !isB) return null;
  if (!isValidBracket(row.bracket)) return null;
  return {
    id: row.id,
    seed: Number(row.seed) >>> 0,
    bracket: row.bracket,
    bandLabel: row.band_label,
    youAreTeamA: isA,
    allyClanCode: isA ? row.team_a_clan_code : row.team_b_clan_code,
    allyClanName: isA ? row.team_a_clan_name : row.team_b_clan_name,
    allyTeamCp: isA ? Number(row.team_a_team_cp) : Number(row.team_b_team_cp),
    allyRosterJson: isA ? row.team_a_roster : row.team_b_roster,
    enemyClanCode: isA ? row.team_b_clan_code : row.team_a_clan_code,
    enemyClanName: isA ? row.team_b_clan_name : row.team_a_clan_name,
    enemyTeamCp: isA ? Number(row.team_b_team_cp) : Number(row.team_a_team_cp),
    enemyRosterJson: isA ? row.team_b_roster : row.team_a_roster,
    createdAt: row.created_at,
  };
}

export async function recordMatchReport(input: {
  matchId: string;
  userId: string;
  won: boolean;
  seasonId: number;
  clanCode: string | null;
  clanName: string | null;
  tokens: number;
  members: number;
}): Promise<{ firstReport: boolean }> {
  const existing = await sql<{ user_id: string }>(
    `select user_id from match_reports where match_id = $1 and user_id = $2`,
    [input.matchId, input.userId],
  );
  if (existing[0]) return { firstReport: false };
  await sql(
    `insert into match_reports
       (match_id, user_id, won, season_id, clan_code, clan_name, tokens, members, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, now())
     on conflict (match_id, user_id) do nothing`,
    [
      input.matchId,
      input.userId,
      input.won,
      input.seasonId,
      input.clanCode,
      input.clanName,
      input.tokens,
      input.members,
    ],
  );
  const count = await sql<{ n: number }>(
    `select count(*)::int as n from match_reports where match_id = $1`,
    [input.matchId],
  );
  if ((count[0]?.n ?? 0) >= 2) {
    await sql(`update matches set status = 'reported' where id = $1`, [input.matchId]);
  }
  return { firstReport: true };
}

/** Drop stale queue rows older than `maxAgeMs` (default 2 min). */
export async function pruneStaleQueue(maxAgeMs = 120_000): Promise<number> {
  const rows = await sql<{ id: string }>(
    `delete from match_queue
     where created_at < now() - ($1::int * interval '1 millisecond')
     returning id`,
    [Math.floor(maxAgeMs)],
  );
  return rows.length;
}
