import type { SaveData } from './state';
import { loadSaveFromRaw, SAVE_VERSION } from './state';

/** Shareable save-code prefix (versioned envelope, not the localStorage key). */
export const SAVE_CODE_PREFIX = 'DAG1';

export type ImportResult =
  | { ok: true; save: SaveData }
  | { ok: false; error: string };

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const raw =
      typeof atob === 'function'
        ? atob(b64 + pad)
        : Buffer.from(b64 + pad, 'base64').toString('binary');
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Tiny non-crypto checksum so typos fail closed. */
export function checksum32(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Encode a save as a shareable single-line code:
 * `DAG1.<base64url(json)>.<checksum>`
 */
export function exportSaveCode(save: SaveData): string {
  const payload = JSON.stringify({ ...save, version: SAVE_VERSION });
  const bytes = new TextEncoder().encode(payload);
  const body = toBase64Url(bytes);
  return `${SAVE_CODE_PREFIX}.${body}.${checksum32(body)}`;
}

/** Parse + validate a save code into normalized SaveData. */
export function importSaveCode(code: string, now = Date.now()): ImportResult {
  const trimmed = code.trim().replace(/\s+/g, '');
  if (!trimmed) return { ok: false, error: 'Paste a save code first.' };
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== SAVE_CODE_PREFIX) {
    return { ok: false, error: 'Unrecognized save code (expected DAG1.….).' };
  }
  const [, body, sum] = parts;
  if (!body || !sum || checksum32(body) !== sum) {
    return { ok: false, error: 'Save code checksum failed — check for missing characters.' };
  }
  const bytes = fromBase64Url(body);
  if (!bytes) return { ok: false, error: 'Save code could not be decoded.' };
  let json: string;
  try {
    json = new TextDecoder().decode(bytes);
  } catch {
    return { ok: false, error: 'Save code could not be decoded.' };
  }
  const save = loadSaveFromRaw(json, now);
  if (!save) return { ok: false, error: 'Save code contents are invalid.' };
  return { ok: true, save };
}
