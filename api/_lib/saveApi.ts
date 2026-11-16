/**
 * Cloud save API for the Cursor publish host (web Request handlers).
 * GET/PUT /api/daggah-save
 *
 * Auth: username session (primary), else Cursor identity, else x-daggah-account-code.
 */
import { isDatabaseUnavailable, isUndefinedTable, sql } from './db';
import { resolveOwner } from './owner';
import { hitRateLimit } from './rateLimit';
import { clientIp } from './auth';
import {
  getSave,
  parseStoredPayload,
  sanitizeSavePayload,
  toIso,
  upsertSave,
} from './saves';

/** Hard ceiling on guest (account-code) rows: codes are client-minted, so cap what they can create. */
const MAX_ACCOUNT_CODE_SAVES = 20_000;

function rateLimited(retryAfterSec: number): Response {
  return Response.json(
    { error: 'rate_limited', retryAfterSec },
    {
      status: 429,
      headers: { 'cache-control': 'private, no-store', 'retry-after': String(retryAfterSec) },
    },
  );
}

const NO_STORE = { 'cache-control': 'private, no-store' } as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

function internalError(error: unknown, where: string): Response {
  console.error(`${where} failed`, error instanceof Error ? error.message : 'unknown');
  if (isDatabaseUnavailable(error)) {
    return json(
      {
        error: 'database_unavailable',
        hint: 'Cloud sync is temporarily unavailable. Progress stays on this device.',
      },
      503,
    );
  }
  if (isUndefinedTable(error)) {
    return json(
      {
        error: 'schema_missing',
        hint: 'Cloud save tables are not ready yet. Try again in a moment.',
      },
      503,
    );
  }
  return json(
    {
      error: 'internal',
      hint: 'Cloud sync failed. Progress stays on this device.',
    },
    500,
  );
}

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 600_000) throw new Error('too_large');
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = await resolveOwner(request);
    if (owner instanceof Response) return owner;

    const row = await getSave(owner.ownerKey);
    if (!row) return json({ error: 'not_found' }, 404);

    const save = parseStoredPayload(row.payload);
    if (!save) return json({ error: 'corrupt_cloud_save' }, 500);

    return json({
      save,
      updatedAt: toIso(row.updated_at),
      schemaVersion: row.schema_version,
      ownerKind: owner.kind,
    });
  } catch (error) {
    return internalError(error, 'GET /api/daggah-save');
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const owner = await resolveOwner(request);
    if (owner instanceof Response) return owner;

    const writeHit = await hitRateLimit(`save:put:${owner.ownerKey}`, 60, 10 * 60 * 1000);
    if (!writeHit.ok) return rateLimited(writeHit.retryAfterSec);

    let body: unknown;
    try {
      body = await readBody(request);
    } catch (error) {
      if (error instanceof Error && error.message === 'too_large') {
        return json({ error: 'payload_too_large' }, 413);
      }
      return json({ error: 'invalid_json' }, 400);
    }

    const sanitized = sanitizeSavePayload(body);
    if (!sanitized.ok) return json({ error: sanitized.error }, 400);

    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';
    const existing = await getSave(owner.ownerKey);

    if (!existing && owner.kind === 'account') {
      const globalNew = await hitRateLimit('save:new-account:global', 200, 60 * 60 * 1000);
      if (!globalNew.ok) return rateLimited(globalNew.retryAfterSec);
      const ipNew = await hitRateLimit(`save:new-account:ip:${clientIp(request)}`, 10, 60 * 60 * 1000);
      if (!ipNew.ok) return rateLimited(ipNew.retryAfterSec);
      const rows = await sql<{ n: number | string }>(
        `select count(*) as n from saves where owner_key like 'ac:%'`,
      );
      if (Number(rows[0]?.n ?? 0) >= MAX_ACCOUNT_CODE_SAVES) {
        return json({ error: 'guest_saves_full', hint: 'Guest cloud saves are full. Log in to sync.' }, 503);
      }
    }

    if (existing && !force) {
      const cloudSave = parseStoredPayload(existing.payload) as { savedAt?: number } | null;
      const cloudSavedAt =
        cloudSave && typeof cloudSave.savedAt === 'number' ? cloudSave.savedAt : 0;
      if (cloudSavedAt > sanitized.savedAt) {
        return json(
          {
            conflict: true,
            save: cloudSave,
            updatedAt: toIso(existing.updated_at),
            schemaVersion: existing.schema_version,
            ownerKind: owner.kind,
          },
          409,
        );
      }
    }

    await upsertSave(owner.ownerKey, sanitized.payload, sanitized.schemaVersion);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (error) {
    return internalError(error, 'PUT /api/daggah-save');
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      ...NO_STORE,
      allow: 'GET, PUT, OPTIONS',
    },
  });
}
