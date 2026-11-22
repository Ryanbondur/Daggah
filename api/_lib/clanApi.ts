/**
 * Cross-device clan hall API.
 * POST /api/daggah-clan  { action: 'create'|'join'|'sync'|'publish'|'leave', ... }
 * GET  /api/daggah-clan?code=ABC123  → public hall snapshot (roster + code)
 *
 * Auth required for create/join/publish/leave/sync. Local/dev falls back to
 * client localStorage when this API returns database_unavailable.
 */
import {
  admitRealMember,
  hallSnapshot,
  humanIdForUser,
  sanitizeClanCode,
  sanitizeClanName,
  sanitizeMemberName,
  type ClanData,
  type ClanPlayerSnapshot,
  type ClanRole,
} from '../../src/game/clanAdmit';
import { HERO_CLASSES, type HeroClass, type SkillId } from '../../src/data/types';
import { extractSessionToken, resolveSessionToken, clientIp } from './auth';
import { isDatabaseUnavailable, isUndefinedTable } from './db';
import { hitRateLimit } from './rateLimit';
import { readJsonBody } from './readBody';
import {
  clearSeat,
  getHallByCode,
  getSeat,
  leaveHallForUser,
  setSeat,
  syncSeatsFromClan,
  upsertHall,
} from './clanHallStore';

const CLAN_BODY_MAX_BYTES = 120_000;
const NO_STORE = { 'cache-control': 'private, no-store' } as const;

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

function limited(retryAfterSec: number): Response {
  return json({ error: 'rate_limited', retryAfterSec }, 429, {
    'retry-after': String(retryAfterSec),
  });
}

function internalError(error: unknown, where: string): Response {
  console.error(`${where} failed`, error instanceof Error ? error.message : 'unknown');
  if (isDatabaseUnavailable(error)) {
    return json(
      {
        error: 'database_unavailable',
        hint: 'Clan hall cloud is temporarily unavailable. Local halls still work on this device.',
      },
      503,
    );
  }
  if (isUndefinedTable(error)) {
    return json(
      {
        error: 'schema_missing',
        hint: 'Clan hall tables are not ready yet. Try again in a moment.',
      },
      503,
    );
  }
  return json(
    {
      error: 'internal',
      hint: 'Clan hall request failed. Try again, or continue with a local hall.',
    },
    500,
  );
}

async function requireUser(request: Request) {
  const token = extractSessionToken(request);
  if (!token) return { error: json({ error: 'unauthorized' }, 401) as Response };
  const user = await resolveSessionToken(token);
  if (!user) return { error: json({ error: 'unauthorized' }, 401) as Response };
  return { token, user };
}

function isHeroClass(value: unknown): value is HeroClass {
  return typeof value === 'string' && (HERO_CLASSES as readonly string[]).includes(value);
}

function parsePlayerSnapshot(
  obj: Record<string, unknown>,
  userId: string,
  username: string,
): ClanPlayerSnapshot | string {
  if (!isHeroClass(obj.heroClass)) return 'Invalid hero class.';
  const level = Number(obj.level);
  const cp = Number(obj.cp);
  if (!Number.isFinite(level) || level < 1 || level > 99) return 'Invalid level.';
  if (!Number.isFinite(cp) || cp < 0 || cp > 1_000_000) return 'Invalid CP.';
  const loadoutRaw = Array.isArray(obj.loadout) ? obj.loadout : [];
  const loadout = loadoutRaw
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.slice(0, 48) as SkillId)
    .slice(0, 4);
  const primary =
    typeof obj.primary === 'string' && obj.primary.trim()
      ? (obj.primary.slice(0, 48) as SkillId)
      : null;
  const rawMemberName =
    typeof obj.memberName === 'string'
      ? obj.memberName
      : typeof obj.displayName === 'string'
        ? obj.displayName
        : '';
  const nameOverride = rawMemberName.trim() ? sanitizeMemberName(rawMemberName) : username;
  return {
    heroClass: obj.heroClass,
    level: Math.floor(level),
    cp: Math.floor(cp),
    loadout,
    primary,
    humanId: humanIdForUser(userId),
    name: sanitizeMemberName(nameOverride || username),
  };
}

function parseClanPayload(raw: unknown): ClanData | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Invalid clan payload.';
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.slice(0, 48) : '';
  const name = sanitizeClanName(typeof obj.name === 'string' ? obj.name : '');
  const code = sanitizeClanCode(typeof obj.code === 'string' ? obj.code : '');
  if (!id || !code) return 'Invalid clan id/code.';
  if (!Array.isArray(obj.members)) return 'Invalid members.';
  if (obj.members.length > 40) return 'Too many members.';
  const members = obj.members.map((m) => {
    if (!m || typeof m !== 'object') return null;
    const row = m as Record<string, unknown>;
    if (!isHeroClass(row.heroClass)) return null;
    const role = (['leader', 'officer', 'member'] as const).includes(row.role as ClanRole)
      ? (row.role as ClanRole)
      : 'member';
    const loadoutRaw = Array.isArray(row.loadout) ? row.loadout : [];
    return {
      id: typeof row.id === 'string' ? row.id.slice(0, 48) : '',
      name: sanitizeMemberName(typeof row.name === 'string' ? row.name : 'Unknown'),
      heroClass: row.heroClass,
      role,
      isPlayer: false,
      isAi: row.isAi !== false && row.isPlayer !== true,
      level: Math.max(1, Math.min(99, Math.floor(Number(row.level) || 1))),
      cp: Math.max(0, Math.min(1_000_000, Math.floor(Number(row.cp) || 0))),
      loadout: loadoutRaw
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.slice(0, 48) as SkillId)
        .slice(0, 4),
      primary:
        typeof row.primary === 'string' && row.primary.trim()
          ? (row.primary.slice(0, 48) as SkillId)
          : null,
      gear: row.gear && typeof row.gear === 'object' ? row.gear : undefined,
    };
  });
  if (members.some((m) => !m || !m.id)) return 'Invalid member row.';
  return hallSnapshot({
    id,
    name,
    code,
    members: members as ClanData['members'],
  });
}

function hallResponse(clan: ClanData, extra: Record<string, unknown> = {}) {
  return json({ clan: hallSnapshot(clan), ...extra });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      ...NO_STORE,
      allow: 'GET, POST, OPTIONS',
    },
  });
}

/** Public lookup by invite code (no auth) — roster snapshot for join UI. */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const code = sanitizeClanCode(url.searchParams.get('code') ?? '');
    if (!code) return json({ error: 'missing_code' }, 400);
    const hit = await hitRateLimit(`clan:get:${clientIp(request)}`, 60, 10 * 60 * 1000);
    if (!hit.ok) return limited(hit.retryAfterSec);
    const hall = await getHallByCode(code);
    if (!hall) return json({ error: 'not_found' }, 404);
    return hallResponse(hall.clan, { updatedAt: hall.updatedAt });
  } catch (error) {
    return internalError(error, 'GET /api/daggah-clan');
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await readJsonBody(request, CLAN_BODY_MAX_BYTES);
    } catch (error) {
      if (error instanceof Error && error.message === 'too_large') {
        return json({ error: 'payload_too_large' }, 413);
      }
      return json({ error: 'invalid_json' }, 400);
    }

    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'invalid_body' }, 400);
    }
    const obj = body as Record<string, unknown>;
    const action = typeof obj.action === 'string' ? obj.action : '';

    const auth = await requireUser(request);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth as { user: { id: string; username: string } };
    const humanId = humanIdForUser(user.id);

    const ipHit = await hitRateLimit(`clan:post:${user.id}`, 40, 10 * 60 * 1000);
    if (!ipHit.ok) return limited(ipHit.retryAfterSec);

    if (action === 'create') {
      const existing = await getSeat(user.id);
      if (existing) {
        const cur = await getHallByCode(existing.clanCode);
        if (cur) return hallResponse(cur.clan, { alreadyMember: true });
        await clearSeat(user.id);
      }
      const name = sanitizeClanName(typeof obj.name === 'string' ? obj.name : '');
      const player = parsePlayerSnapshot(obj, user.id, user.username);
      if (typeof player === 'string') return json({ error: 'invalid_player', hint: player }, 400);
      const clanId =
        typeof obj.clanId === 'string' && obj.clanId.trim()
          ? obj.clanId.slice(0, 48)
          : `clan_${user.id.slice(0, 8)}`;
      let code =
        typeof obj.code === 'string' && sanitizeClanCode(obj.code)
          ? sanitizeClanCode(obj.code)
          : '';
      if (!code) {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        for (let attempt = 0; attempt < 8 && !code; attempt++) {
          let s = '';
          for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
          const clash = await getHallByCode(s);
          if (!clash) code = s;
        }
      }
      if (!code) return json({ error: 'code_exhausted' }, 503);
      const clash = await getHallByCode(code);
      if (clash) return json({ error: 'code_taken' }, 409);
      const clan: ClanData = hallSnapshot({
        id: clanId,
        name,
        code,
        members: [
          {
            id: humanId,
            name: player.name,
            heroClass: player.heroClass,
            role: 'leader',
            isPlayer: false,
            isAi: false,
            level: player.level,
            cp: player.cp,
            loadout: player.loadout,
            primary: player.primary,
          },
        ],
      });
      const saved = await upsertHall(clan);
      await setSeat(user.id, saved.code, humanId);
      return hallResponse(saved, { created: true });
    }

    if (action === 'join') {
      const existing = await getSeat(user.id);
      if (existing) {
        const cur = await getHallByCode(existing.clanCode);
        if (cur) return hallResponse(cur.clan, { alreadyMember: true });
        await clearSeat(user.id);
      }
      const code = sanitizeClanCode(typeof obj.code === 'string' ? obj.code : '');
      if (!code) return json({ error: 'missing_code' }, 400);
      const hall = await getHallByCode(code);
      if (!hall) return json({ error: 'not_found', hint: 'No clan with that code.' }, 404);
      const player = parsePlayerSnapshot(obj, user.id, user.username);
      if (typeof player === 'string') return json({ error: 'invalid_player', hint: player }, 400);
      const result = admitRealMember(hall.clan, player);
      if (!result.ok) return json({ error: 'clan_full', hint: result.error }, 409);
      const saved = await upsertHall(result.clan);
      await setSeat(user.id, saved.code, humanId);
      await syncSeatsFromClan(saved);
      return hallResponse(saved, {
        joined: true,
        replacedAi: result.replacedAi
          ? { id: result.replacedAi.id, name: result.replacedAi.name, cp: result.replacedAi.cp }
          : null,
      });
    }

    if (action === 'sync') {
      const seat = await getSeat(user.id);
      const code =
        sanitizeClanCode(typeof obj.code === 'string' ? obj.code : '') || seat?.clanCode || '';
      if (!code) return json({ error: 'not_in_clan' }, 404);
      const hall = await getHallByCode(code);
      if (!hall) {
        if (seat) await clearSeat(user.id);
        return json({ error: 'not_found' }, 404);
      }
      const inRoster = hall.clan.members.some((m) => m.id === humanId);
      if (!inRoster && seat?.clanCode !== code) {
        return json({ error: 'forbidden' }, 403);
      }
      // Refresh this user's snapshot when provided.
      if (obj.heroClass !== undefined) {
        const player = parsePlayerSnapshot(obj, user.id, user.username);
        if (typeof player !== 'string') {
          const admitted = admitRealMember(hall.clan, player);
          if (admitted.ok) {
            const saved = await upsertHall(admitted.clan);
            await setSeat(user.id, saved.code, humanId);
            await syncSeatsFromClan(saved);
            return hallResponse(saved);
          }
        }
      }
      return hallResponse(hall.clan);
    }

    if (action === 'publish') {
      const seat = await getSeat(user.id);
      if (!seat) return json({ error: 'not_in_clan' }, 404);
      const parsed = parseClanPayload(obj.clan);
      if (typeof parsed === 'string') return json({ error: 'invalid_clan', hint: parsed }, 400);
      if (sanitizeClanCode(parsed.code) !== seat.clanCode) {
        return json({ error: 'code_mismatch' }, 403);
      }
      if (!parsed.members.some((m) => m.id === humanId && m.isAi === false)) {
        return json({ error: 'missing_self' }, 403);
      }
      // Preserve every other real member from the stored hall (merge-friendly).
      const current = await getHallByCode(seat.clanCode);
      if (!current) return json({ error: 'not_found' }, 404);
      const otherReals = current.clan.members.filter(
        (m) => m.isAi === false && m.id !== humanId,
      );
      const publishedIds = new Set(parsed.members.map((m) => m.id));
      for (const real of otherReals) {
        if (!publishedIds.has(real.id)) {
          // Publisher dropped another real — reject (must use leave).
          return json({ error: 'cannot_drop_reals' }, 409);
        }
      }
      const saved = await upsertHall(parsed);
      await setSeat(user.id, saved.code, humanId);
      await syncSeatsFromClan(saved);
      return hallResponse(saved, { published: true });
    }

    if (action === 'leave') {
      const left = await leaveHallForUser(user.id);
      return json({ left: true, clan: left ? hallSnapshot(left) : null });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    return internalError(error, 'POST /api/daggah-clan');
  }
}
