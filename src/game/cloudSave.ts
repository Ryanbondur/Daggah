import type { SaveData, Storage } from './state';
import { loadSaveFromRaw, writeSave } from './state';

/**
 * Optional cloud sync for private/team Cursor apps that expose a save API.
 * Public hosts (e.g. https://daggah.apps.grok.bot) have no identity header for
 * browsers — this client no-ops on 404/401/network errors and relies on
 * localStorage + Export/Import instead.
 *
 * Expected endpoint (when wired server-side with apps-identity + DB):
 *   GET  /api/daggah-save  → { save: SaveData } | 404
 *   PUT  /api/daggah-save  body SaveData → 204
 */
export const CLOUD_SAVE_PATH = '/api/daggah-save';

export type CloudSyncResult =
  | { status: 'skipped'; reason: string }
  | { status: 'pulled'; save: SaveData }
  | { status: 'pushed' }
  | { status: 'unchanged' };

function cloudDisabled(): boolean {
  try {
    // Explicit opt-out; public hosts simply 404 the endpoint and we skip.
    return typeof localStorage !== 'undefined' && localStorage.getItem('daggah.cloudSync') === '0';
  } catch {
    return false;
  }
}

export async function pullCloudSave(now = Date.now()): Promise<CloudSyncResult> {
  if (cloudDisabled()) return { status: 'skipped', reason: 'cloud sync off' };
  try {
    const res = await fetch(CLOUD_SAVE_PATH, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      return { status: 'skipped', reason: `http ${res.status}` };
    }
    if (!res.ok) return { status: 'skipped', reason: `http ${res.status}` };
    const body = (await res.json()) as { save?: unknown };
    if (!body?.save) return { status: 'skipped', reason: 'empty cloud save' };
    const save = loadSaveFromRaw(JSON.stringify(body.save), now);
    if (!save) return { status: 'skipped', reason: 'invalid cloud save' };
    return { status: 'pulled', save };
  } catch {
    return { status: 'skipped', reason: 'unreachable' };
  }
}

export async function pushCloudSave(save: SaveData): Promise<CloudSyncResult> {
  if (cloudDisabled()) return { status: 'skipped', reason: 'cloud sync off' };
  try {
    const res = await fetch(CLOUD_SAVE_PATH, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(save),
    });
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      return { status: 'skipped', reason: `http ${res.status}` };
    }
    if (!res.ok) return { status: 'skipped', reason: `http ${res.status}` };
    return { status: 'pushed' };
  } catch {
    return { status: 'skipped', reason: 'unreachable' };
  }
}

/** Prefer the newer of local vs cloud by `savedAt`, then write the winner locally. */
export async function syncCloudSave(
  storage: Storage | undefined,
  local: SaveData,
  now = Date.now(),
): Promise<{ save: SaveData; result: CloudSyncResult }> {
  const pulled = await pullCloudSave(now);
  if (pulled.status !== 'pulled') {
    const push = await pushCloudSave(local);
    return { save: local, result: push.status === 'pushed' ? push : pulled };
  }
  const cloud = pulled.save;
  const preferCloud = (cloud.savedAt ?? 0) > (local.savedAt ?? 0);
  if (preferCloud) {
    writeSave(storage, cloud, now);
    return { save: cloud, result: pulled };
  }
  const push = await pushCloudSave(local);
  return { save: local, result: push.status === 'pushed' ? push : { status: 'unchanged' } };
}
