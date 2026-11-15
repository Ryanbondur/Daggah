/**
 * Client-side username session for cloud saves.
 * Token stored in localStorage (same-origin); sent as x-daggah-session / Bearer.
 */
import { sanitizePlainText } from '../util/text';

export const AUTH_API_PATH = '/api/daggah-auth';
export const SESSION_TOKEN_KEY = 'daggah.sessionToken';
export const SESSION_USERNAME_KEY = 'daggah.sessionUsername';
export const SESSION_USER_ID_KEY = 'daggah.sessionUserId';
export const GUEST_SKIP_KEY = 'daggah.guestPlay';
export const SESSION_HEADER = 'x-daggah-session';

export type Storage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type AuthSession = {
  token: string;
  username: string;
  userId: string;
};

export type AuthApiResult =
  | { ok: true; session: AuthSession }
  | { ok: false; error: string; status: number };

function read(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    /* ignore quota */
  }
}

function remove(storage: Storage | undefined, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readAuthSession(storage?: Storage): AuthSession | null {
  const token = read(storage, SESSION_TOKEN_KEY)?.trim() ?? '';
  const username = sanitizePlainText(read(storage, SESSION_USERNAME_KEY) ?? '', 24);
  const userId = read(storage, SESSION_USER_ID_KEY)?.trim() ?? '';
  if (!token || token.length < 16 || !username || !userId) return null;
  return { token, username, userId };
}

export function writeAuthSession(storage: Storage | undefined, session: AuthSession): void {
  if (!storage) return;
  write(storage, SESSION_TOKEN_KEY, session.token);
  write(storage, SESSION_USERNAME_KEY, sanitizePlainText(session.username, 24));
  write(storage, SESSION_USER_ID_KEY, session.userId);
  // Registered players are no longer "guest-only".
  remove(storage, GUEST_SKIP_KEY);
}

export function clearAuthSession(storage?: Storage): void {
  remove(storage, SESSION_TOKEN_KEY);
  remove(storage, SESSION_USERNAME_KEY);
  remove(storage, SESSION_USER_ID_KEY);
}

export function isGuestPlay(storage?: Storage): boolean {
  return read(storage, GUEST_SKIP_KEY) === '1';
}

export function markGuestPlay(storage?: Storage): void {
  write(storage, GUEST_SKIP_KEY, '1');
}

export function clearGuestPlay(storage?: Storage): void {
  remove(storage, GUEST_SKIP_KEY);
}

export function authHeaders(storage?: Storage): Record<string, string> {
  const session = readAuthSession(storage);
  if (!session) return {};
  return {
    [SESSION_HEADER]: session.token,
    authorization: `Bearer ${session.token}`,
  };
}

async function postAuth(
  storage: Storage | undefined,
  body: Record<string, unknown>,
): Promise<AuthApiResult> {
  try {
    const res = await fetch(AUTH_API_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...authHeaders(storage),
      },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
    if (!res.ok) {
      const err =
        typeof data.error === 'string'
          ? data.error
          : typeof data.hint === 'string'
            ? data.hint
            : `http ${res.status}`;
      return { ok: false, error: err, status: res.status };
    }
    const token = typeof data.token === 'string' ? data.token : '';
    const username = typeof data.username === 'string' ? sanitizePlainText(data.username, 24) : '';
    const userId = typeof data.userId === 'string' ? data.userId : '';
    if (!token || !username || !userId) {
      return { ok: false, error: 'invalid_response', status: res.status };
    }
    const session = { token, username, userId };
    writeAuthSession(storage, session);
    return { ok: true, session };
  } catch {
    return { ok: false, error: 'unreachable', status: 0 };
  }
}

export async function registerAccount(
  storage: Storage | undefined,
  username: string,
  password: string,
): Promise<AuthApiResult> {
  return postAuth(storage, { action: 'register', username, password });
}

export async function loginAccount(
  storage: Storage | undefined,
  username: string,
  password: string,
): Promise<AuthApiResult> {
  return postAuth(storage, { action: 'login', username, password });
}

export async function logoutAccount(storage?: Storage): Promise<void> {
  const session = readAuthSession(storage);
  try {
    if (session) {
      await fetch(AUTH_API_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...authHeaders(storage),
        },
        body: JSON.stringify({ action: 'logout' }),
      });
    }
  } catch {
    /* local clear still happens */
  }
  clearAuthSession(storage);
}

export async function changePassword(
  storage: Storage | undefined,
  currentPassword: string,
  newPassword: string,
): Promise<AuthApiResult> {
  return postAuth(storage, {
    action: 'change-password',
    currentPassword,
    newPassword,
  });
}

export async function fetchMe(storage?: Storage): Promise<AuthSession | null> {
  const local = readAuthSession(storage);
  if (!local) return null;
  try {
    const res = await fetch(AUTH_API_PATH, {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...authHeaders(storage),
      },
    });
    if (res.status === 401 || res.status === 403) {
      clearAuthSession(storage);
      return null;
    }
    if (!res.ok) return local;
    const data = (await res.json()) as { username?: string; userId?: string };
    if (typeof data.username === 'string' && typeof data.userId === 'string') {
      const session = {
        token: local.token,
        username: sanitizePlainText(data.username, 24),
        userId: data.userId,
      };
      writeAuthSession(storage, session);
      return session;
    }
    return local;
  } catch {
    return local;
  }
}

/** True when the login gate should appear (not logged in, guest not chosen). */
export function shouldShowLoginGate(storage?: Storage): boolean {
  if (readAuthSession(storage)) return false;
  if (isGuestPlay(storage)) return false;
  return true;
}
