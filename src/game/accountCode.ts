/** Player-generated secret for public-app cloud sync (no Cursor identity). */
export const ACCOUNT_CODE_PREFIX = 'DGAC';
export const ACCOUNT_CODE_STORAGE_KEY = 'daggah.accountCode';
export const ACCOUNT_CODE_HEADER = 'x-daggah-account-code';

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function checksum32(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function randomBody(byteLen = 24): string {
  const bytes = new Uint8Array(byteLen);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLen; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += B64URL[bytes[i]! % 64]!;
  return out;
}

export function generateAccountCode(): string {
  const body = randomBody(24);
  return `${ACCOUNT_CODE_PREFIX}.${body}.${checksum32(body)}`;
}

export function normalizeAccountCode(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, '');
  if (!trimmed) return null;
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== ACCOUNT_CODE_PREFIX) return null;
  const [, body, sum] = parts;
  if (!body || !sum || body.length < 16 || body.length > 128) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(body)) return null;
  if (checksum32(body) !== sum) return null;
  return `${ACCOUNT_CODE_PREFIX}.${body}.${sum}`;
}

export function readStoredAccountCode(storage?: Storage | null): string | null {
  if (!storage) return null;
  try {
    return normalizeAccountCode(storage.getItem(ACCOUNT_CODE_STORAGE_KEY) ?? '');
  } catch {
    return null;
  }
}

export function writeStoredAccountCode(storage: Storage | undefined, code: string): string | null {
  const normalized = normalizeAccountCode(code);
  if (!normalized || !storage) return null;
  try {
    storage.setItem(ACCOUNT_CODE_STORAGE_KEY, normalized);
    return normalized;
  } catch {
    return null;
  }
}

export function clearStoredAccountCode(storage: Storage | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(ACCOUNT_CODE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export type Storage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
