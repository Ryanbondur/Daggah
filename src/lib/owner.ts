import { createHash } from 'node:crypto';
import { getIdentity } from '../../cursor/identity';

export const ACCOUNT_CODE_PREFIX = 'DGAC';
export const ACCOUNT_CODE_HEADER = 'x-daggah-account-code';

function checksum32(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
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

export function hashAccountCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export type OwnerRef =
  | { kind: 'identity'; ownerKey: string; sub: string }
  | { kind: 'account'; ownerKey: string; code: string };

/**
 * Prefer a verified Cursor viewer; otherwise an account-code header/query.
 * Public apps have no identity header for browsers.
 */
export async function resolveOwner(request: Request): Promise<OwnerRef | Response> {
  const identity = await getIdentity(request);
  if (identity.verified) {
    return {
      kind: 'identity',
      ownerKey: `id:${identity.sub}`,
      sub: identity.sub,
    };
  }

  const header = request.headers.get(ACCOUNT_CODE_HEADER) ?? '';
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('accountCode') ?? '';
  const code = normalizeAccountCode(header || fromQuery);
  if (!code) {
    return Response.json(
      {
        error: 'unauthorized',
        reason: identity.reason || 'missing_account_code',
        hint: 'Sign in (private/team app) or send x-daggah-account-code',
      },
      { status: 401, headers: { 'cache-control': 'private, no-store' } },
    );
  }
  return {
    kind: 'account',
    ownerKey: `ac:${hashAccountCode(code)}`,
    code,
  };
}
