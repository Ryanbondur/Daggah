import type { SaveData } from './state';
import { loadSaveFromRaw, SAVE_VERSION } from './state';

/** Shareable save-code prefix (versioned envelope, not the localStorage key). */
export const SAVE_CODE_PREFIX = 'DAG1';

export type ImportResult =
  | { ok: true; save: SaveData }
  | { ok: false; error: string };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += B64[(triple >> 18) & 63]! + B64[(triple >> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(triple >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? B64[triple & 63]! : '=';
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array | null {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  if (clean.length % 4 === 1) return null;
  const pad = clean.length % 4 === 0 ? 0 : 4 - (clean.length % 4);
  const s = clean + '='.repeat(pad);
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const a = B64.indexOf(s[i]!);
    const b = B64.indexOf(s[i + 1]!);
    if (a < 0 || b < 0) return null;
    const c = s[i + 2] === '=' ? 0 : B64.indexOf(s[i + 2]!);
    const d = s[i + 3] === '=' ? 0 : B64.indexOf(s[i + 3]!);
    if (c < 0 || d < 0) return null;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out.push((n >> 16) & 255);
    if (s[i + 2] !== '=') out.push((n >> 8) & 255);
    if (s[i + 3] !== '=') out.push(n & 255);
  }
  return new Uint8Array(out);
}

function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    return base64ToBytes(b64 + pad);
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
