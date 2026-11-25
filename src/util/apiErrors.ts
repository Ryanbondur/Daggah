/**
 * Friendly copy for hall / match / leaderboard / clan API failures.
 * Prefer this over raw codes like `rate_limited` or `http 429` in toasts.
 */

export type ApiErrorSurface = 'clan' | 'match' | 'leaderboard' | 'generic';

export type ApiErrorInput = {
  /** Machine code (`rate_limited`) or free-form reason (`http 429`, `unreachable`). */
  error?: string;
  /** HTTP status when known (0 = network / unreachable). */
  status?: number;
  /** Alias used by board client (`reason`). */
  reason?: string;
  surface?: ApiErrorSurface;
};

function normalizeCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

/** True when the failure is a 429 / rate_limited response. */
export function isRateLimitFailure(input: string | ApiErrorInput): boolean {
  if (typeof input === 'string') {
    const c = normalizeCode(input);
    return c === 'rate_limited' || c === 'http_429' || c === '429' || c.includes('rate_limit');
  }
  if (input.status === 429) return true;
  const code = input.error ?? input.reason ?? '';
  return isRateLimitFailure(code);
}

/** True when the failure is network / unreachable (status 0 or known codes). */
export function isNetworkFailure(input: string | ApiErrorInput): boolean {
  if (typeof input === 'string') {
    const c = normalizeCode(input);
    return c === 'network' || c === 'unreachable' || c === 'failed_to_fetch' || c === 'http_0';
  }
  if (input.status === 0) return true;
  const code = input.error ?? input.reason ?? '';
  return isNetworkFailure(code);
}

function surfaceNoun(surface: ApiErrorSurface): string {
  switch (surface) {
    case 'clan':
      return 'Clan hall';
    case 'match':
      return 'Matchmaking';
    case 'leaderboard':
      return 'Leaderboard';
    default:
      return 'Cloud';
  }
}

/**
 * Map API error codes / HTTP statuses to a short user-facing sentence.
 * Auth login keeps its own copy in modals; this covers clan/match/board.
 */
export function friendlyApiError(input: string | ApiErrorInput): string {
  const opts: ApiErrorInput = typeof input === 'string' ? { error: input } : input;
  const surface = opts.surface ?? 'generic';
  const raw = (opts.error ?? opts.reason ?? '').trim();
  const code = normalizeCode(raw);
  const status = opts.status;

  if (isRateLimitFailure({ error: raw, status }) || status === 429) {
    return `${surfaceNoun(surface)} is rate-limited — wait a minute and try again`;
  }
  if (isNetworkFailure({ error: raw, status }) || status === 0) {
    return `${surfaceNoun(surface)} unreachable — check your connection`;
  }
  if (
    code === 'database_unavailable' ||
    code === 'schema_missing' ||
    status === 503
  ) {
    return `${surfaceNoun(surface)} cloud is temporarily offline`;
  }
  if (status !== undefined && status >= 500) {
    return `${surfaceNoun(surface)} server error — try again shortly`;
  }
  if (code.startsWith('http_5') || /^http_?5\d\d$/.test(code)) {
    return `${surfaceNoun(surface)} server error — try again shortly`;
  }
  // Already human (spaces / em dash) — pass through.
  if (raw.includes(' ') || raw.includes('—')) return raw;
  if (!raw) return `${surfaceNoun(surface)} request failed`;
  return raw.replace(/_/g, ' ');
}

/** Whether this failure should interrupt the user (toast / inline), vs quiet local fallback. */
export function shouldAnnounceApiFailure(input: string | ApiErrorInput): boolean {
  return isRateLimitFailure(input) || isNetworkFailure(input);
}

const lastAnnounceAt = new Map<string, number>();

/**
 * Returns true once per `key` inside `cooldownMs` (default 30s).
 * Use so background sync/publish rate-limits do not toast-spam.
 */
export function claimApiErrorAnnounce(key: string, cooldownMs = 30_000): boolean {
  const now = Date.now();
  const prev = lastAnnounceAt.get(key) ?? 0;
  if (now - prev < cooldownMs) return false;
  lastAnnounceAt.set(key, now);
  return true;
}

/** Test helper — clears announce cooldowns. */
export function resetApiErrorAnnounceForTests(): void {
  lastAnnounceAt.clear();
}
