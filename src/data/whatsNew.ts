/**
 * App/content version for the dismissible “What’s new” sheet.
 * Bump this string on meaningful publishes so returning players see the notes once.
 * Independent of SaveData.version (schema).
 */
export const APP_CONTENT_VERSION = '2026.11.15-ascended';

export interface WhatsNewEntry {
  version: string;
  title: string;
  bullets: string[];
}

/** Current release notes shown until dismissed (stored as lastSeenContentVersion). */
export const WHATS_NEW: WhatsNewEntry = {
  version: APP_CONTENT_VERSION,
  title: "What's new",
  bullets: [
    'Ascended Nightscar — harder Apex (6 Keys + 1 Seal) with better BiS odds.',
    'Clan Raid — weekly boss drops Ascended Seals or Fragments only.',
    'Craft Fragments → Seals in Adventure (5 → 1). Seal count on the currency strip.',
  ],
};

/** True when the player has not dismissed notes for this content version. */
export function shouldShowWhatsNew(
  lastSeen: string | null | undefined,
  current = APP_CONTENT_VERSION,
): boolean {
  return (lastSeen ?? '') !== current;
}
