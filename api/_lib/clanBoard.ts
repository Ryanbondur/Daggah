/**
 * Clan season leaderboard — read/write helpers for season_stats + clan_results.
 * Score formula matches client clanSeasonScore (wins×100 + tokens + members×8 − losses×12).
 */
import { sql } from './db';

export interface ClanBoardRow {
  season_id: number;
  clan_code: string;
  clan_name: string | null;
  wins: number;
  losses: number;
  tokens: number;
  members: number;
  updated_at: string | Date;
}

export interface ClanBoardEntry {
  rank: number;
  name: string;
  code: string;
  score: number;
  wins: number;
  losses: number;
  tokens: number;
  members: number;
  isPlayer: boolean;
}

export interface SeasonReport {
  seasonId: number;
  clanCode: string | null;
  clanName: string | null;
  wins: number;
  losses: number;
  tokens: number;
  members: number;
}

/** Same formula as src/game/clan.ts clanSeasonScore — keep in sync. */
export function clanSeasonScore(wins: number, losses: number, tokens: number, members: number): number {
  return Math.max(0, wins * 100 + tokens + members * 8 - losses * 12);
}

function asInt(n: unknown, fallback = 0): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;
}

function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return code.length >= 4 ? code : null;
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().slice(0, 32);
  return name.length >= 2 ? name : null;
}

/**
 * Pull season/clan fields from a sanitized save object (bare SaveData shape).
 * Returns null when there is no clan to publish.
 */
export function extractSeasonReport(save: Record<string, unknown>): SeasonReport | null {
  const season = save.season;
  let seasonId = 1;
  if (season && typeof season === 'object' && !Array.isArray(season)) {
    const sid = (season as { seasonId?: unknown }).seasonId;
    if (typeof sid === 'number' && Number.isFinite(sid) && sid >= 1) {
      seasonId = Math.floor(sid);
    }
  }

  const clan = save.clan;
  if (!clan || typeof clan !== 'object' || Array.isArray(clan)) {
    return {
      seasonId,
      clanCode: null,
      clanName: null,
      wins: asInt(save.clanWins),
      losses: asInt(save.clanLosses),
      tokens: asInt(save.clanTokens),
      members: 0,
    };
  }

  const c = clan as Record<string, unknown>;
  const members = Array.isArray(c.members) ? c.members.length : 0;
  return {
    seasonId,
    clanCode: cleanCode(c.code),
    clanName: cleanName(c.name),
    wins: asInt(save.clanWins),
    losses: asInt(save.clanLosses),
    tokens: asInt(save.clanTokens),
    members: Math.min(64, Math.max(0, members)),
  };
}

/** Upsert per-owner season_stats and (when in a clan) clan_results rollup. */
export async function upsertSeasonReport(ownerKey: string, report: SeasonReport): Promise<void> {
  await sql(
    `insert into season_stats
       (season_id, owner_key, clan_code, clan_name, wins, losses, tokens, members, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (season_id, owner_key) do update set
       clan_code = excluded.clan_code,
       clan_name = excluded.clan_name,
       wins = excluded.wins,
       losses = excluded.losses,
       tokens = excluded.tokens,
       members = excluded.members,
       updated_at = now()`,
    [
      report.seasonId,
      ownerKey,
      report.clanCode,
      report.clanName,
      report.wins,
      report.losses,
      report.tokens,
      report.members,
    ],
  );

  if (!report.clanCode) return;

  // Prefer the stronger published snapshot so a stale pull cannot wipe a better record.
  await sql(
    `insert into clan_results
       (season_id, clan_code, clan_name, wins, losses, tokens, members, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (season_id, clan_code) do update set
       clan_name = coalesce(nullif(excluded.clan_name, ''), clan_results.clan_name),
       wins = greatest(clan_results.wins, excluded.wins),
       losses = greatest(clan_results.losses, excluded.losses),
       tokens = greatest(clan_results.tokens, excluded.tokens),
       members = greatest(clan_results.members, excluded.members),
       updated_at = now()`,
    [
      report.seasonId,
      report.clanCode,
      report.clanName,
      report.wins,
      report.losses,
      report.tokens,
      report.members,
    ],
  );
}

export async function listClanResults(seasonId: number, limit = 50): Promise<ClanBoardRow[]> {
  const cap = Math.min(100, Math.max(1, Math.floor(limit)));
  return sql<ClanBoardRow>(
    `select season_id, clan_code, clan_name, wins, losses, tokens, members, updated_at
     from clan_results
     where season_id = $1
     order by (wins * 100 + tokens + members * 8 - losses * 12) desc,
              clan_name asc nulls last,
              clan_code asc
     limit $2`,
    [seasonId, cap],
  );
}

export function rankClanRows(
  rows: ClanBoardRow[],
  playerCode: string | null = null,
): ClanBoardEntry[] {
  const entries: ClanBoardEntry[] = rows.map((row) => {
    const wins = asInt(row.wins);
    const losses = asInt(row.losses);
    const tokens = asInt(row.tokens);
    const members = asInt(row.members);
    const code = String(row.clan_code ?? '');
    return {
      rank: 0,
      name: (row.clan_name && String(row.clan_name).trim()) || `Clan ${code.slice(0, 4)}`,
      code,
      score: clanSeasonScore(wins, losses, tokens, members),
      wins,
      losses,
      tokens,
      members,
      isPlayer: playerCode !== null && code === playerCode,
    };
  });
  entries.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}
