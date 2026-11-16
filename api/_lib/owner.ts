import { getIdentity } from '../../cursor/identity';
import {
  SESSION_HEADER,
  extractSessionToken,
  ownerKeyForUser,
  resolveSessionToken,
} from './auth';
import { sha256Hex } from './webCrypto';

export const ACCOUNT_CODE_PREFIX = 'DGAC';
export const ACCOUNT_CODE_HEADER = 'x-daggah-account-code';
export { SESSION_HEADER };

/** Hosted / production must never accept the local simulated identity fallback. */
function rejectSimulatedIdentity(): boolean {
  if (typeof process === 'undefined') return true;
  const trim = (v: string | undefined) => (typeof v === 'string' ? v.trim() : '');
  return (
    trim(process.env.CURSOR_APP_ID) !== '' ||
    trim(process.env.VERCEL) !== '' ||
    trim(process.env.NODE_ENV) === 'production'
  );
}

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

export async function hashAccountCode(code: string): Promise<string> {
  return sha256Hex(code);
}

export type OwnerRef =
  | { kind: 'user'; ownerKey: string; userId: string; username: string }
  | { kind: 'identity'; ownerKey: string; sub: string }
  | { kind: 'account'; ownerKey: string; code: string };

/**
 * Prefer username session (primary), then verified Cursor identity, then account-code.
 * Account codes remain an optional alternate for guests who never register.
 */
export async function resolveOwner(request: Request): Promise<OwnerRef | Response> {
  const sessionToken = extractSessionToken(request);
  if (sessionToken) {
    const user = await resolveSessionToken(sessionToken);
    if (user) {
      return {
        kind: 'user',
        ownerKey: ownerKeyForUser(user.id),
        userId: user.id,
        username: user.username,
      };
    }
    // Invalid/expired session: fall through so identity / account code still work.
  }

  const identity = await getIdentity(request);
  const acceptIdentity =
    identity.verified && !(identity.simulated && rejectSimulatedIdentity());
  if (acceptIdentity && identity.verified) {
    return {
      kind: 'identity',
      ownerKey: `id:${identity.sub}`,
      sub: identity.sub,
    };
  }

  const header = request.headers.get(ACCOUNT_CODE_HEADER) ?? '';
  const code = normalizeAccountCode(header);
  if (!code) {
    const reason =
      identity.verified && identity.simulated
        ? 'missing_header'
        : identity.verified
          ? 'missing_credentials'
          : identity.reason || 'missing_credentials';
    return Response.json(
      {
        error: 'unauthorized',
        reason,
        hint: 'Log in, sign in (private/team app), or send x-daggah-account-code',
      },
      { status: 401, headers: { 'cache-control': 'private, no-store' } },
    );
  }
  return {
    kind: 'account',
    ownerKey: `ac:${await hashAccountCode(code)}`,
    code,
  };
}
