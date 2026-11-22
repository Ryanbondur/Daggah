/**
 * Client fetch for live clan season leaderboard (DG-120).
 * Falls back to local stub rivals when the API is unreachable.
 */
import type { ClanLeaderboardEntry } from './clan';
import { buildClanLeaderboard, clanSeasonScore } from './clan';

export const CLAN_BOARD_PATH = '/api/daggah-clan-board';

export type ClanBoardSource = 'live' | 'local' | 'loading';

export type ClanBoardFetchResult =
  | { ok: true; source: 'live'; seasonId: number; entries: ClanLeaderboardEntry[] }
  | { ok: false; reason: string };

type LiveEntry = {
  rank?: number;
  name?: string;
  code?: string;
  score?: number;
  wins?: number;
  losses?: number;
  tokens?: number;
  members?: number;
  isPlayer?: boolean;
};

function asEntry(raw: LiveEntry, playerCode: string | null): ClanLeaderboardEntry | null {
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const wins = typeof raw.wins === 'number' ? Math.max(0, Math.floor(raw.wins)) : 0;
  const losses = typeof raw.losses === 'number' ? Math.max(0, Math.floor(raw.losses)) : 0;
  const tokens = typeof raw.tokens === 'number' ? Math.max(0, Math.floor(raw.tokens)) : 0;
  const members = typeof raw.members === 'number' ? Math.max(0, Math.floor(raw.members)) : 0;
  const code = typeof raw.code === 'string' ? raw.code.trim().toUpperCase() : '';
  const score =
    typeof raw.score === 'number' && Number.isFinite(raw.score)
      ? Math.max(0, Math.floor(raw.score))
      : clanSeasonScore(wins, losses, tokens, members);
  return {
    rank: 0,
    name: raw.name.trim().slice(0, 32),
    score,
    wins,
    members,
    isPlayer: Boolean(raw.isPlayer) || (playerCode !== null && code === playerCode),
    code: code || undefined,
    losses,
    tokens,
  };
}

/**
 * Ensure the local player's clan appears on a live board even before their
 * cloud push lands, then re-rank.
 */
export function mergePlayerOntoBoard(
  entries: ClanLeaderboardEntry[],
  player: { name: string; code?: string; wins: number; losses: number; tokens: number; members: number } | null,
): ClanLeaderboardEntry[] {
  const next = entries.map((e) => ({ ...e, isPlayer: false }));
  if (!player) {
    next.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return next.map((e, i) => ({ ...e, rank: i + 1 }));
  }
  const code = player.code?.trim().toUpperCase() || '';
  const score = clanSeasonScore(player.wins, player.losses, player.tokens, player.members);
  const existingIdx = next.findIndex(
    (e) => (code && e.code === code) || (!code && e.name === player.name),
  );
  const mine: ClanLeaderboardEntry = {
    rank: 0,
    name: player.name,
    score,
    wins: player.wins,
    members: player.members,
    isPlayer: true,
    code: code || undefined,
    losses: player.losses,
    tokens: player.tokens,
  };
  if (existingIdx >= 0) {
    const prev = next[existingIdx]!;
    next[existingIdx] = {
      ...mine,
      // Prefer the stronger of live vs local so a lagging sync does not demote.
      score: Math.max(prev.score, mine.score),
      wins: Math.max(prev.wins, mine.wins),
      members: Math.max(prev.members, mine.members),
      tokens: Math.max(prev.tokens ?? 0, mine.tokens ?? 0),
      losses: Math.max(prev.losses ?? 0, mine.losses ?? 0),
    };
  } else {
    next.push(mine);
  }
  next.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return next.map((e, i) => ({ ...e, isPlayer: e.isPlayer === true, rank: i + 1 }));
}

/** Local stub board (deterministic rivals) — used when API is down or empty. */
export function localClanBoard(
  seasonId: number,
  player: { name: string; wins: number; losses: number; tokens: number; members: number } | null,
): ClanLeaderboardEntry[] {
  return buildClanLeaderboard(seasonId, player);
}

export async function fetchLiveClanBoard(
  seasonId: number,
  playerCode: string | null = null,
): Promise<ClanBoardFetchResult> {
  try {
    const url = new URL(CLAN_BOARD_PATH, typeof location !== 'undefined' ? location.origin : 'http://localhost');
    url.searchParams.set('seasonId', String(seasonId));
    if (playerCode) url.searchParams.set('code', playerCode);
    const res = await fetch(`${url.pathname}${url.search}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, reason: `http ${res.status}` };
    const body = (await res.json()) as {
      seasonId?: number;
      source?: string;
      entries?: LiveEntry[];
    };
    if (!Array.isArray(body.entries)) return { ok: false, reason: 'bad payload' };
    const entries = body.entries
      .map((e) => asEntry(e, playerCode))
      .filter((e): e is ClanLeaderboardEntry => e !== null);
    return {
      ok: true,
      source: 'live',
      seasonId: typeof body.seasonId === 'number' ? body.seasonId : seasonId,
      entries,
    };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}
