import { sql } from './db';

export const MAX_SAVE_BYTES = 512_000;

export interface SaveRow {
  owner_key: string;
  payload: string;
  schema_version: number;
  updated_at: string | Date;
}

export async function getSave(ownerKey: string): Promise<SaveRow | null> {
  const rows = await sql<SaveRow>(
    `select owner_key, payload, schema_version, updated_at
     from saves
     where owner_key = $1
     limit 1`,
    [ownerKey],
  );
  return rows[0] ?? null;
}

export async function upsertSave(
  ownerKey: string,
  payload: string,
  schemaVersion: number,
): Promise<SaveRow> {
  const rows = await sql<SaveRow>(
    `insert into saves (owner_key, payload, schema_version, updated_at)
     values ($1, $2, $3, now())
     on conflict (owner_key) do update set
       payload = excluded.payload,
       schema_version = excluded.schema_version,
       updated_at = now()
     returning owner_key, payload, schema_version, updated_at`,
    [ownerKey, payload, schemaVersion],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertSave returned no row');
  return row;
}

/** Parse + size-limit a JSON body into a stringified save payload. */
export function sanitizeSavePayload(raw: unknown):
  | { ok: true; payload: string; schemaVersion: number; savedAt: number }
  | { ok: false; error: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Save body must be a JSON object' };
  }
  const obj = raw as Record<string, unknown>;
  // Accept either { save: {...} } or a bare SaveData object.
  const saveObj =
    obj.save && typeof obj.save === 'object' && !Array.isArray(obj.save)
      ? (obj.save as Record<string, unknown>)
      : obj;

  if (typeof saveObj.version !== 'number' || !Number.isFinite(saveObj.version)) {
    return { ok: false, error: 'Save missing numeric version' };
  }
  if (typeof saveObj.heroClass !== 'string' || saveObj.heroClass.length > 32) {
    return { ok: false, error: 'Save missing heroClass' };
  }

  let payload: string;
  try {
    payload = JSON.stringify(saveObj);
  } catch {
    return { ok: false, error: 'Save could not be serialized' };
  }
  if (payload.length > MAX_SAVE_BYTES) {
    return { ok: false, error: `Save exceeds ${MAX_SAVE_BYTES} bytes` };
  }

  const savedAt =
    typeof saveObj.savedAt === 'number' && Number.isFinite(saveObj.savedAt)
      ? saveObj.savedAt
      : Date.now();

  return {
    ok: true,
    payload,
    schemaVersion: Math.floor(saveObj.version),
    savedAt,
  };
}

export function parseStoredPayload(payload: string): unknown | null {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

export function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}
