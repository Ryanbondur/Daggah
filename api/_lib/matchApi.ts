/**
 * Live 4v4 matchmaking API.
 * POST /api/daggah-match  { action: 'enqueue'|'poll'|'cancel'|'report', ... }
 *
 * Auth required. Falls back to database_unavailable (503) when Postgres is down —
 * clients keep the labeled AI practice path.
 */
import { HERO_CLASSES, type HeroClass, type SkillId } from '../../src/data/types';
import { isValidBracket, LIVE_QUEUE_FALLBACK_S } from '../../src/game/matchmaking';
import { sanitizeClanCode, sanitizeClanName, sanitizeMemberName } from '../../src/game/clanAdmit';
import { extractSeasonReport, upsertSeasonReport } from './clanBoard';
import { extractSessionToken, resolveSessionToken, clientIp } from './auth';
import { isDatabaseUnavailable, isUndefinedTable } from './db';
import { hitRateLimit } from './rateLimit';
import { readJsonBody } from './readBody';
import {
  findReadyMatchForUser,
  getMatch,
  getQueueTicket,
  matchForUser,
  pruneStaleQueue,
  recordMatchReport,
  removeQueueTicket,
  tryFormMatch,
  upsertQueueTicket,
  type FormedMatch,
} from './matchStore';

const BODY_MAX_BYTES = 180_000;
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
        hint: 'Matchmaking is temporarily unavailable. Queue practice 4v4 (AI) still works.',
      },
      503,
    );
  }
  if (isUndefinedTable(error)) {
    return json(
      {
        error: 'schema_missing',
        hint: 'Matchmaking tables are not ready yet. Try practice 4v4 (AI).',
      },
      503,
    );
  }
  return json(
    {
      error: 'internal',
      hint: 'Matchmaking request failed. Try practice 4v4 (AI).',
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

function parseRoster(raw: unknown): string | { error: string } {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return { error: 'Roster must be exactly 4 fighters (one of each class).' };
  }
  const seen = new Set<string>();
  const members = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { error: 'Invalid roster member.' };
    }
    const m = row as Record<string, unknown>;
    if (!isHeroClass(m.heroClass)) return { error: 'Invalid hero class.' };
    if (seen.has(m.heroClass)) return { error: 'Duplicate class in roster.' };
    seen.add(m.heroClass);
    const id = typeof m.id === 'string' ? m.id.slice(0, 48) : '';
    if (!id) return { error: 'Missing member id.' };
    const level = Math.max(1, Math.min(99, Math.floor(Number(m.level) || 1)));
    const cp = Math.max(0, Math.min(1_000_000, Math.floor(Number(m.cp) || 0)));
    const loadoutRaw = Array.isArray(m.loadout) ? m.loadout : [];
    const loadout = loadoutRaw
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.slice(0, 48) as SkillId)
      .slice(0, 4);
    const primary =
      typeof m.primary === 'string' && m.primary.trim()
        ? (m.primary.slice(0, 48) as SkillId)
        : null;
    members.push({
      id,
      name: sanitizeMemberName(typeof m.name === 'string' ? m.name : 'Unknown'),
      heroClass: m.heroClass,
      role:
        m.role === 'leader' || m.role === 'officer' || m.role === 'member' ? m.role : 'member',
      isPlayer: m.isPlayer === true,
      isAi: m.isPlayer === true ? false : m.isAi !== false,
      level,
      cp,
      loadout,
      primary,
      gear: m.gear && typeof m.gear === 'object' ? m.gear : undefined,
    });
  }
  for (const cls of HERO_CLASSES) {
    if (!seen.has(cls)) return { error: `Missing ${cls} in roster.` };
  }
  // Stable class order for deterministic sims.
  members.sort(
    (a, b) => HERO_CLASSES.indexOf(a.heroClass) - HERO_CLASSES.indexOf(b.heroClass),
  );
  return JSON.stringify(members);
}

function publicMatch(m: FormedMatch) {
  let allyRoster: unknown = [];
  let enemyRoster: unknown = [];
  try {
    allyRoster = JSON.parse(m.allyRosterJson);
  } catch {
    allyRoster = [];
  }
  try {
    enemyRoster = JSON.parse(m.enemyRosterJson);
  } catch {
    enemyRoster = [];
  }
  return {
    matchId: m.id,
    seed: m.seed,
    bracket: m.bracket,
    bandLabel: m.bandLabel,
    ally: {
      clanCode: m.allyClanCode,
      clanName: m.allyClanName,
      teamCp: m.allyTeamCp,
      roster: allyRoster,
    },
    enemy: {
      clanCode: m.enemyClanCode,
      clanName: m.enemyClanName,
      teamCp: m.enemyTeamCp,
      roster: enemyRoster,
    },
    live: true,
  };
}

function waitFromTicket(createdAt: string | Date): number {
  const t = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  return Math.max(0, (Date.now() - t) / 1000);
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      ...NO_STORE,
      allow: 'POST, OPTIONS',
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await readJsonBody(request, BODY_MAX_BYTES);
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

    const rate = await hitRateLimit(`match:post:${user.id}`, 90, 10 * 60 * 1000);
    if (!rate.ok) return limited(rate.retryAfterSec);
    // Soft prune occasionally so abandoned tickets don't clog the pool.
    if (Math.random() < 0.08) {
      void pruneStaleQueue().catch(() => undefined);
    }

    if (action === 'cancel') {
      await removeQueueTicket(user.id);
      return json({ ok: true, status: 'cancelled' });
    }

    if (action === 'poll' || action === 'enqueue') {
      // Already matched?
      const ready = await findReadyMatchForUser(user.id);
      if (ready) {
        const view = matchForUser(ready, user.id);
        if (view) {
          await removeQueueTicket(user.id);
          return json({ ok: true, status: 'matched', match: publicMatch(view) });
        }
      }

      if (action === 'enqueue') {
        const clanCode = sanitizeClanCode(typeof obj.clanCode === 'string' ? obj.clanCode : '');
        const clanName = sanitizeClanName(typeof obj.clanName === 'string' ? obj.clanName : '');
        if (!clanCode) return json({ error: 'missing_clan' }, 400);
        const teamCp = Math.max(0, Math.min(4_000_000, Math.floor(Number(obj.teamCp) || 0)));
        const avgCp = Math.max(1, Math.min(1_000_000, Math.floor(Number(obj.avgCp) || teamCp / 4)));
        if (!isValidBracket(obj.bracket)) return json({ error: 'invalid_bracket' }, 400);
        const rosterParsed = parseRoster(obj.roster);
        if (typeof rosterParsed !== 'string') {
          return json({ error: 'invalid_roster', hint: rosterParsed.error }, 400);
        }
        const seasonId = Math.max(1, Math.floor(Number(obj.seasonId) || 1));
        await upsertQueueTicket({
          userId: user.id,
          clanCode,
          clanName,
          teamCp,
          avgCp,
          bracket: obj.bracket,
          challengeUp: obj.challengeUp === true,
          atTop: obj.atTop === true || obj.bracket === 'nightscar',
          rosterJson: rosterParsed,
          seasonId,
        });
      }

      const formed = await tryFormMatch(user.id);
      if (formed) {
        const view = matchForUser(formed, user.id);
        if (view) return json({ ok: true, status: 'matched', match: publicMatch(view) });
      }

      const ticket = await getQueueTicket(user.id);
      if (!ticket) {
        if (action === 'poll') {
          return json({ ok: true, status: 'idle', fallbackAfterS: LIVE_QUEUE_FALLBACK_S });
        }
        return json({ error: 'not_queued' }, 404);
      }
      const waitS = waitFromTicket(ticket.created_at);
      return json({
        ok: true,
        status: 'queued',
        ticketId: ticket.id,
        waitS: Math.round(waitS * 10) / 10,
        bracket: ticket.bracket,
        fallbackAfterS: LIVE_QUEUE_FALLBACK_S,
        peersNeeded: true,
      });
    }

    if (action === 'report') {
      const matchId = typeof obj.matchId === 'string' ? obj.matchId.slice(0, 48) : '';
      if (!matchId) return json({ error: 'missing_match' }, 400);
      const match = await getMatch(matchId);
      if (!match) return json({ error: 'not_found' }, 404);
      if (match.team_a_user_id !== user.id && match.team_b_user_id !== user.id) {
        return json({ error: 'forbidden' }, 403);
      }
      const won = obj.won === true;
      const seasonId = Math.max(1, Math.floor(Number(obj.seasonId) || 1));
      const clanCode = sanitizeClanCode(typeof obj.clanCode === 'string' ? obj.clanCode : '');
      const clanName = sanitizeClanName(typeof obj.clanName === 'string' ? obj.clanName : '');
      const tokens = Math.max(0, Math.min(1_000_000, Math.floor(Number(obj.tokens) || 0)));
      const members = Math.max(0, Math.min(64, Math.floor(Number(obj.members) || 0)));
      const wins = Math.max(0, Math.min(1_000_000, Math.floor(Number(obj.wins) || 0)));
      const losses = Math.max(0, Math.min(1_000_000, Math.floor(Number(obj.losses) || 0)));

      const { firstReport } = await recordMatchReport({
        matchId,
        userId: user.id,
        won,
        seasonId,
        clanCode: clanCode || null,
        clanName: clanName || null,
        tokens,
        members,
      });

      // Publish season board snapshot (GREATEST merge — same as cloud save / DG-120).
      if (clanCode) {
        const report = extractSeasonReport({
          season: { seasonId },
          clan: { code: clanCode, name: clanName, members: Array(members).fill(null) },
          clanWins: wins,
          clanLosses: losses,
          clanTokens: tokens,
        });
        if (report) {
          await upsertSeasonReport(user.id, report).catch((err) => {
            console.error('match report season upsert failed', err instanceof Error ? err.message : err);
          });
        }
      }

      return json({ ok: true, reported: firstReport, matchId });
    }

    // Touch rate limit key with IP for anonymous probes.
    void clientIp(request);
    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    return internalError(error, 'POST /api/daggah-match');
  }
}
