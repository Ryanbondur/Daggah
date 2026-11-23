/**
 * Client → POST /api/daggah-match for live 4v4 queue.
 * Requires username session. Falls back when DB/network is missing.
 */
import type { ClanBracketId } from './clanBrackets';
import type { ClanMember } from './clan';
import { authHeaders, readAuthSession, type Storage as AuthStorage } from './authSession';
import type { Storage } from './state';

export const MATCH_API_PATH = '/api/daggah-match';

export type LiveMatchPayload = {
  matchId: string;
  seed: number;
  bracket: ClanBracketId;
  bandLabel: string;
  ally: {
    clanCode: string;
    clanName: string;
    teamCp: number;
    roster: ClanMember[];
  };
  enemy: {
    clanCode: string;
    clanName: string;
    teamCp: number;
    roster: ClanMember[];
  };
  live: true;
};

export type MatchQueueResult =
  | { ok: true; status: 'queued'; ticketId: string; waitS: number; fallbackAfterS: number }
  | { ok: true; status: 'matched'; match: LiveMatchPayload }
  | { ok: true; status: 'cancelled' | 'idle'; fallbackAfterS?: number }
  | { ok: true; status: 'reported'; matchId: string }
  | { ok: false; error: string; status: number; fallback: boolean };

function asAuthStorage(storage?: Storage): AuthStorage | undefined {
  return storage as AuthStorage | undefined;
}

export function canUseLiveMatchmaking(storage?: Storage): boolean {
  return !!readAuthSession(asAuthStorage(storage));
}

function headers(storage?: Storage): HeadersInit {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    ...authHeaders(asAuthStorage(storage)),
  };
}

function isFallbackStatus(status: number, error: string): boolean {
  return (
    status === 503 ||
    status === 0 ||
    error === 'database_unavailable' ||
    error === 'schema_missing' ||
    error === 'network'
  );
}

function parseMatch(raw: unknown): LiveMatchPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const matchId = typeof m.matchId === 'string' ? m.matchId : '';
  const seed = Number(m.seed);
  const bracket = m.bracket;
  if (!matchId || !Number.isFinite(seed)) return null;
  if (bracket !== 'scout' && bracket !== 'veteran' && bracket !== 'nightscar') return null;
  const ally = m.ally as Record<string, unknown> | undefined;
  const enemy = m.enemy as Record<string, unknown> | undefined;
  if (!ally || !enemy) return null;
  if (!Array.isArray(ally.roster) || !Array.isArray(enemy.roster)) return null;
  return {
    matchId,
    seed: seed >>> 0,
    bracket,
    bandLabel: typeof m.bandLabel === 'string' ? m.bandLabel : '',
    ally: {
      clanCode: String(ally.clanCode ?? ''),
      clanName: String(ally.clanName ?? 'Ally'),
      teamCp: Math.floor(Number(ally.teamCp) || 0),
      roster: ally.roster as ClanMember[],
    },
    enemy: {
      clanCode: String(enemy.clanCode ?? ''),
      clanName: String(enemy.clanName ?? 'Rival'),
      teamCp: Math.floor(Number(enemy.teamCp) || 0),
      roster: enemy.roster as ClanMember[],
    },
    live: true,
  };
}

async function post(
  storage: Storage | undefined,
  body: Record<string, unknown>,
): Promise<MatchQueueResult> {
  try {
    const res = await fetch(MATCH_API_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: headers(storage),
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
    const error = typeof data.error === 'string' ? data.error : res.statusText || 'error';
    if (!res.ok) {
      return {
        ok: false,
        error: typeof data.hint === 'string' ? data.hint : error,
        status: res.status,
        fallback: isFallbackStatus(res.status, error),
      };
    }
    const status = typeof data.status === 'string' ? data.status : '';
    if (status === 'matched') {
      const match = parseMatch(data.match);
      if (!match) {
        return { ok: false, error: 'invalid_match', status: res.status, fallback: false };
      }
      return { ok: true, status: 'matched', match };
    }
    if (status === 'queued') {
      return {
        ok: true,
        status: 'queued',
        ticketId: typeof data.ticketId === 'string' ? data.ticketId : '',
        waitS: Number(data.waitS) || 0,
        fallbackAfterS: Number(data.fallbackAfterS) || 30,
      };
    }
    if (status === 'cancelled' || status === 'idle') {
      return {
        ok: true,
        status,
        fallbackAfterS: Number(data.fallbackAfterS) || 30,
      };
    }
    if (data.reported === true || status === 'reported') {
      return {
        ok: true,
        status: 'reported',
        matchId: typeof data.matchId === 'string' ? data.matchId : '',
      };
    }
    return { ok: false, error: 'invalid_response', status: res.status, fallback: false };
  } catch {
    return { ok: false, error: 'network', status: 0, fallback: true };
  }
}

export type EnqueueMatchBody = {
  clanCode: string;
  clanName: string;
  teamCp: number;
  avgCp: number;
  bracket: ClanBracketId;
  challengeUp?: boolean;
  atTop?: boolean;
  roster: ClanMember[];
  seasonId: number;
};

export function enqueueLiveMatch(
  storage: Storage | undefined,
  body: EnqueueMatchBody,
): Promise<MatchQueueResult> {
  return post(storage, { action: 'enqueue', ...body });
}

export function pollLiveMatch(storage?: Storage): Promise<MatchQueueResult> {
  return post(storage, { action: 'poll' });
}

export function cancelLiveMatch(storage?: Storage): Promise<MatchQueueResult> {
  return post(storage, { action: 'cancel' });
}

export function reportLiveMatch(
  storage: Storage | undefined,
  body: {
    matchId: string;
    won: boolean;
    seasonId: number;
    clanCode: string;
    clanName: string;
    wins: number;
    losses: number;
    tokens: number;
    members: number;
  },
): Promise<MatchQueueResult> {
  return post(storage, { action: 'report', ...body });
}
