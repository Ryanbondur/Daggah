/**
 * Live clan season leaderboard API.
 * GET /api/daggah-clan-board?seasonId=1[&code=ABCD]
 *
 * Public read (no auth) so guests can view standings. Writes happen via cloud save PUT.
 * Client falls back to local stub rivals when this returns 503 / unreachable.
 */
import { clientIp } from './auth';
import { isDatabaseUnavailable, isUndefinedTable } from './db';
import { listClanResults, rankClanRows } from './clanBoard';
import { hitRateLimit } from './rateLimit';

const NO_STORE = { 'cache-control': 'private, no-store' } as const;

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

function internalError(error: unknown, where: string): Response {
  console.error(`${where} failed`, error instanceof Error ? error.message : 'unknown');
  if (isDatabaseUnavailable(error)) {
    return json(
      {
        error: 'database_unavailable',
        hint: 'Season board is temporarily unavailable. Local standings still work.',
      },
      503,
    );
  }
  if (isUndefinedTable(error)) {
    return json(
      {
        error: 'schema_missing',
        hint: 'Season board tables are not ready yet.',
      },
      503,
    );
  }
  return json({ error: 'internal', hint: 'Season board failed to load.' }, 500);
}

function parseSeasonId(url: URL): number {
  const raw = url.searchParams.get('seasonId') ?? url.searchParams.get('season') ?? '1';
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(9999, Math.floor(n));
}

function parsePlayerCode(url: URL): string | null {
  const raw = url.searchParams.get('code') ?? '';
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return code.length >= 4 ? code : null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const hit = await hitRateLimit(`clan-board:get:${clientIp(request)}`, 60, 10 * 60 * 1000);
    if (!hit.ok) {
      return json(
        { error: 'rate_limited', retryAfterSec: hit.retryAfterSec },
        429,
        { 'retry-after': String(hit.retryAfterSec) },
      );
    }

    const url = new URL(request.url);
    const seasonId = parseSeasonId(url);
    const playerCode = parsePlayerCode(url);
    const limitRaw = Number(url.searchParams.get('limit') ?? '50');
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

    const rows = await listClanResults(seasonId, limit);
    const entries = rankClanRows(rows, playerCode);

    return json({
      seasonId,
      source: 'live',
      count: entries.length,
      entries,
    });
  } catch (error) {
    return internalError(error, 'GET /api/daggah-clan-board');
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      ...NO_STORE,
      allow: 'GET, OPTIONS',
    },
  });
}
