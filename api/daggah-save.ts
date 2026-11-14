/**
 * Cloud save API for the Cursor publish host (web Request handlers).
 * GET/PUT /api/daggah-save
 *
 * Auth: verified Cursor identity when present; else x-daggah-account-code.
 */
import { resolveOwner } from '../src/lib/owner';
import {
  getSave,
  parseStoredPayload,
  sanitizeSavePayload,
  toIso,
  upsertSave,
} from '../src/lib/saves';

const NO_STORE = { 'cache-control': 'private, no-store' } as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
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
    console.error('GET /api/daggah-save failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'internal' }, 500);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const owner = await resolveOwner(request);
    if (owner instanceof Response) return owner;

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
    console.error('PUT /api/daggah-save failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'internal' }, 500);
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
