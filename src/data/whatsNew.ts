/**
 * App/content version for the dismissible “What’s new” sheet.
 * Bump this string on meaningful publishes so returning players see the notes once.
 * Independent of SaveData.version (schema).
 */
export const APP_CONTENT_VERSION = '2026.11.24-loadouts';

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
    'Gear Loadouts — save up to 3 kits (PvE / PvP / Farm) and one-tap swap before Acts or 4v4.',
    'Loadouts live on Camp, Adventure, Clan Hall, and Town — Blacksmith-style sheet, no card clutter.',
    'Cape slot — class-locked capes with unique effects (Acts 7–10 / Nightscar).',
    'Clan Raid + Ascended Nightscar — seal-gated endgame with better BiS odds.',
  ],
};

/** True when the player has not dismissed notes for this content version. */
export function shouldShowWhatsNew(
  lastSeen: string | null | undefined,
  current = APP_CONTENT_VERSION,
): boolean {
  return (lastSeen ?? '') !== current;
}
