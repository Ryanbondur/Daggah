import {
  authHeaders as sessionAuthHeaders,
  readAuthSession,
  type Storage as AuthStorage,
} from './authSession';
import {
  ACCOUNT_CODE_HEADER,
  clearStoredAccountCode,
  generateAccountCode,
  normalizeAccountCode,
  readStoredAccountCode,
  writeStoredAccountCode,
  type Storage as AccountStorage,
} from './accountCode';
import type { SaveData, Storage } from './state';
import { loadSaveFromRaw, writeSave } from './state';

/**
 * Cloud sync via GET/PUT /api/daggah-save.
 * Auth: username session (primary); Cursor identity (private/team); else account code.
 * localStorage + DAG1 Export/Import remain the always-on fallback.
 */
export const CLOUD_SAVE_PATH = '/api/daggah-save';

export type CloudSyncResult =
  | { status: 'skipped'; reason: string }
  | { status: 'pulled'; save: SaveData; updatedAt?: string }
  | { status: 'pushed' }
  | { status: 'unchanged' }
  | {
      status: 'conflict';
      local: SaveData;
      cloud: SaveData;
      cloudUpdatedAt?: string;
    };

export type CloudLinkStatus = {
  linked: boolean;
  /** Username when logged in; null otherwise. */
  username: string | null;
  accountCode: string | null;
  lastResult: CloudSyncResult | null;
  lastError: string | null;
};

let lastResult: CloudSyncResult | null = null;
let lastError: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: SaveData | null = null;
let pendingStorage: Storage | undefined;

function cloudDisabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('daggah.cloudSync') === '0';
  } catch {
    return false;
  }
}

function asAuthStorage(storage?: Storage): AuthStorage | undefined {
  return storage as AuthStorage | undefined;
}

function authHeaders(storage?: Storage): HeadersInit {
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...sessionAuthHeaders(asAuthStorage(storage)),
  };
  const code = readStoredAccountCode(storage as AccountStorage | undefined);
  if (code) headers[ACCOUNT_CODE_HEADER] = code;
  return headers;
}

function isLinked(storage?: Storage): boolean {
  if (readAuthSession(asAuthStorage(storage))) return true;
  return !!readStoredAccountCode(storage as AccountStorage | undefined);
}

export function getCloudLinkStatus(storage?: Storage): CloudLinkStatus {
  const session = readAuthSession(asAuthStorage(storage));
  return {
    linked: isLinked(storage),
    username: session?.username ?? null,
    accountCode: readStoredAccountCode(storage as AccountStorage | undefined),
    lastResult,
    lastError,
  };
}

/** Create or return the stored account code used for public-app sync. */
export function ensureAccountCode(storage?: Storage): string | null {
  const existing = readStoredAccountCode(storage as AccountStorage | undefined);
  if (existing) return existing;
  if (!storage) return null;
  const code = generateAccountCode();
  return writeStoredAccountCode(storage as AccountStorage, code);
}

export function linkAccountCode(storage: Storage | undefined, raw: string): string | null {
  if (!storage) return null;
  const code = normalizeAccountCode(raw);
  if (!code) return null;
  return writeStoredAccountCode(storage as AccountStorage, code);
}

export function unlinkAccountCode(storage?: Storage): void {
  clearStoredAccountCode(storage as AccountStorage | undefined);
}

export async function pullCloudSave(
  storage?: Storage,
  now = Date.now(),
): Promise<CloudSyncResult> {
  if (cloudDisabled()) return { status: 'skipped', reason: 'cloud sync off' };
  try {
    const res = await fetch(CLOUD_SAVE_PATH, {
      method: 'GET',
      credentials: 'same-origin',
      headers: authHeaders(storage),
    });
    if (res.status === 404) return { status: 'skipped', reason: 'no cloud save' };
    if (res.status === 401 || res.status === 403) {
      return { status: 'skipped', reason: `http ${res.status}` };
    }
    if (!res.ok) return { status: 'skipped', reason: `http ${res.status}` };
    const body = (await res.json()) as { save?: unknown; updatedAt?: string };
    if (!body?.save) return { status: 'skipped', reason: 'empty cloud save' };
    const save = loadSaveFromRaw(JSON.stringify(body.save), now);
    if (!save) return { status: 'skipped', reason: 'invalid cloud save' };
    const result: CloudSyncResult = { status: 'pulled', save, updatedAt: body.updatedAt };
    lastResult = result;
    lastError = null;
    return result;
  } catch {
    lastError = 'unreachable';
    return { status: 'skipped', reason: 'unreachable' };
  }
}

export async function pushCloudSave(
  save: SaveData,
  storage?: Storage,
  opts: { force?: boolean } = {},
): Promise<CloudSyncResult> {
  if (cloudDisabled()) return { status: 'skipped', reason: 'cloud sync off' };
  const linked = isLinked(storage);
  // Without session/account code, still attempt identity-based sync (private/team).
  try {
    const url = opts.force ? `${CLOUD_SAVE_PATH}?force=1` : CLOUD_SAVE_PATH;
    const res = await fetch(url, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        ...authHeaders(storage),
        'content-type': 'application/json',
      },
      body: JSON.stringify(save),
    });
    if (res.status === 204 || res.status === 200) {
      const result: CloudSyncResult = { status: 'pushed' };
      lastResult = result;
      lastError = null;
      return result;
    }
    if (res.status === 409) {
      const body = (await res.json()) as { save?: unknown; updatedAt?: string };
      const cloud = body?.save ? loadSaveFromRaw(JSON.stringify(body.save)) : null;
      if (cloud) {
        const result: CloudSyncResult = {
          status: 'conflict',
          local: save,
          cloud,
          cloudUpdatedAt: body.updatedAt,
        };
        lastResult = result;
        return result;
      }
    }
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      if (!linked && (res.status === 401 || res.status === 403)) {
        return { status: 'skipped', reason: 'not linked' };
      }
      return { status: 'skipped', reason: `http ${res.status}` };
    }
    lastError = `http ${res.status}`;
    return { status: 'skipped', reason: `http ${res.status}` };
  } catch {
    lastError = 'unreachable';
    return { status: 'skipped', reason: 'unreachable' };
  }
}

/**
 * Prefer the newer of local vs cloud by `savedAt`.
 * Returns conflict when timestamps differ and caller may want to ask.
 */
export async function syncCloudSave(
  storage: Storage | undefined,
  local: SaveData,
  now = Date.now(),
  opts: { askOnConflict?: boolean } = {},
): Promise<{ save: SaveData; result: CloudSyncResult }> {
  const linked = isLinked(storage);
  // Always try pull when linked; also try when unlinked (identity may be present).
  const pulled = await pullCloudSave(storage, now);
  if (pulled.status !== 'pulled') {
    if (pulled.status === 'skipped' && pulled.reason === 'no cloud save') {
      const push = await pushCloudSave(local, storage);
      return { save: local, result: push.status === 'pushed' ? push : pulled };
    }
    if (!linked && pulled.status === 'skipped') {
      return { save: local, result: pulled };
    }
    const push = await pushCloudSave(local, storage);
    return { save: local, result: push.status === 'pushed' ? push : pulled };
  }

  const cloud = pulled.save;
  const localAt = local.savedAt ?? 0;
  const cloudAt = cloud.savedAt ?? 0;

  if (opts.askOnConflict && localAt !== cloudAt && localAt > 0 && cloudAt > 0) {
    const result: CloudSyncResult = {
      status: 'conflict',
      local,
      cloud,
      cloudUpdatedAt: pulled.updatedAt,
    };
    lastResult = result;
    return { save: local, result };
  }

  const preferCloud = cloudAt > localAt;
  if (preferCloud) {
    writeSave(storage, cloud, now);
    lastResult = pulled;
    return { save: cloud, result: pulled };
  }
  const push = await pushCloudSave(local, storage);
  return {
    save: local,
    result: push.status === 'pushed' ? push : { status: 'unchanged' },
  };
}

/** Debounced auto-push after meaningful progress (requires session, account code, or identity). */
export function scheduleCloudPush(storage: Storage | undefined, save: SaveData, delayMs = 2500): void {
  if (cloudDisabled()) return;
  pendingSave = save;
  pendingStorage = storage;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const next = pendingSave;
    const store = pendingStorage;
    pendingSave = null;
    if (!next) return;
    void pushCloudSave(next, store).then((result) => {
      if (result.status === 'conflict') {
        // Auto path: newer already compared server-side; force only if local is newer.
        const cloudAt = result.cloud.savedAt ?? 0;
        const localAt = next.savedAt ?? 0;
        if (localAt >= cloudAt) {
          void pushCloudSave(next, store, { force: true });
        }
      }
    });
  }, delayMs);
}

export function applyCloudSave(
  storage: Storage | undefined,
  save: SaveData,
  now = Date.now(),
): SaveData {
  writeSave(storage, save, now);
  return save;
}
