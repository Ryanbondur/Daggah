/** Shared username/password rules (safe for client + server). */

export const MIN_PASSWORD_LEN = 8;
export const MAX_PASSWORD_LEN = 128;
export const MIN_USERNAME_LEN = 3;
export const MAX_USERNAME_LEN = 24;

/** Letters, digits, underscore, hyphen — no spaces / HTML / unicode tricks. */
export function normalizeUsername(raw: string): string | null {
  const trimmed = String(raw ?? '').trim();
  if (trimmed.length < MIN_USERNAME_LEN || trimmed.length > MAX_USERNAME_LEN) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

export function validatePassword(raw: string): string | null {
  if (typeof raw !== 'string') return 'Password required';
  if (!raw.trim()) return 'Password cannot be empty or whitespace-only';
  if (raw.length < MIN_PASSWORD_LEN) return `Password must be at least ${MIN_PASSWORD_LEN} characters`;
  if (raw.length > MAX_PASSWORD_LEN) return `Password must be at most ${MAX_PASSWORD_LEN} characters`;
  return null;
}
