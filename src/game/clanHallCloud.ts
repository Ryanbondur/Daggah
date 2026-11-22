/**
 * Cross-device clan hall client → POST/GET /api/daggah-clan.
 * Requires username session. Falls back to localStorage when DB is missing.
 */
import { authHeaders, readAuthSession, type Storage as AuthStorage } from './authSession';
import type { ClanData, ClanPlayerSnapshot } from './clan';
import type { Storage } from './state';

export const CLAN_HALL_API_PATH = '/api/daggah-clan';

export type ClanHallCloudResult =
  | { ok: true; clan: ClanData; meta?: Record<string, unknown> }
  | { ok: false; error: string; status: number; fallback: boolean };

function asAuthStorage(storage?: Storage): AuthStorage | undefined {
  return storage as AuthStorage | undefined;
}

export function canUseClanHallCloud(storage?: Storage): boolean {
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
  return status === 503 || error === 'database_unavailable' || error === 'schema_missing';
}

async function postAction(
  storage: Storage | undefined,
  body: Record<string, unknown>,
): Promise<ClanHallCloudResult> {
  try {
    const res = await fetch(CLAN_HALL_API_PATH, {
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
      const hint = typeof data.hint === 'string' ? data.hint : error;
      return {
        ok: false,
        error: hint,
        status: res.status,
        fallback: isFallbackStatus(res.status, error),
      };
    }
    if (data.left === true) {
      const leftClan = data.clan;
      return {
        ok: true,
        clan:
          leftClan && typeof leftClan === 'object'
            ? (leftClan as ClanData)
            : { id: '', name: '', code: '', members: [] },
        meta: data,
      };
    }
    const clan = data.clan as ClanData | undefined;
    if (!clan || typeof clan !== 'object') {
      return { ok: false, error: 'invalid_response', status: res.status, fallback: false };
    }
    return { ok: true, clan, meta: data };
  } catch {
    return { ok: false, error: 'network', status: 0, fallback: true };
  }
}

export async function cloudLookupHall(code: string): Promise<ClanHallCloudResult> {
  try {
    const res = await fetch(`${CLAN_HALL_API_PATH}?code=${encodeURIComponent(code)}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
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
    const clan = data.clan as ClanData | undefined;
    if (!clan) return { ok: false, error: 'invalid_response', status: res.status, fallback: false };
    return { ok: true, clan, meta: data };
  } catch {
    return { ok: false, error: 'network', status: 0, fallback: true };
  }
}

function playerBody(player: ClanPlayerSnapshot): Record<string, unknown> {
  return {
    heroClass: player.heroClass,
    level: player.level,
    cp: player.cp,
    loadout: player.loadout,
    primary: player.primary,
    memberName: player.name,
  };
}

export async function cloudCreateHall(
  storage: Storage | undefined,
  name: string,
  player: ClanPlayerSnapshot,
  opts?: { clanId?: string; code?: string },
): Promise<ClanHallCloudResult> {
  return postAction(storage, {
    action: 'create',
    name,
    clanId: opts?.clanId,
    code: opts?.code,
    ...playerBody(player),
  });
}

export async function cloudJoinHall(
  storage: Storage | undefined,
  code: string,
  player: ClanPlayerSnapshot,
): Promise<ClanHallCloudResult> {
  return postAction(storage, {
    action: 'join',
    code,
    ...playerBody(player),
  });
}

export async function cloudSyncHall(
  storage: Storage | undefined,
  code: string | undefined,
  player?: ClanPlayerSnapshot,
): Promise<ClanHallCloudResult> {
  return postAction(storage, {
    action: 'sync',
    code,
    ...(player ? playerBody(player) : {}),
  });
}

export async function cloudPublishHall(
  storage: Storage | undefined,
  clan: ClanData,
): Promise<ClanHallCloudResult> {
  return postAction(storage, {
    action: 'publish',
    clan,
  });
}

export async function cloudLeaveHall(storage: Storage | undefined): Promise<ClanHallCloudResult> {
  const result = await postAction(storage, { action: 'leave' });
  if (result.ok) return result;
  // leave may return clan:null — treat 200-shaped success without clan as ok empty.
  if (result.status === 200) return { ok: true, clan: { id: '', name: '', code: '', members: [] } };
  return result;
}
