/**
 * App/content version for the dismissible “What’s new” sheet.
 * Bump this string on meaningful publishes so returning players see the notes once.
 * Independent of SaveData.version (schema).
 */
export const APP_CONTENT_VERSION = '2026.11.15-raid-buff';

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
    'Adventure tabs — Normal acts + Ascended (Nightscar only).',
    'Clan Raid — harder boss (~3 min clear); fight with 3 clan AI on a 4v4-style stage.',
    'Raid rewards stay Seals / Fragments only (no marks or chests); craft 5 → 1 in Adventure.',
    'Ascended Nightscar — harder Apex (6 Keys + 1 Seal) with better BiS odds.',
  ],
};

/** True when the player has not dismissed notes for this content version. */
export function shouldShowWhatsNew(
  lastSeen: string | null | undefined,
  current = APP_CONTENT_VERSION,
): boolean {
  return (lastSeen ?? '') !== current;
}
