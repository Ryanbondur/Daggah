/**
 * Pure 4v4 matchmaking helpers (client + API).
 * Progressive CP bands reuse matchCpBandForQueue (tight → open by wait).
 */
import {
  MATCH_CP_BANDS,
  QUEUE_BAND_METER_S,
  matchBandTitle,
  matchCpBandForQueue,
  type ClanBracketId,
  type MatchCpBand,
} from './clanBrackets';

export { QUEUE_BAND_METER_S, MATCH_CP_BANDS };

export type MatchTicketSnap = {
  userId: string;
  clanCode: string;
  avgCp: number;
  teamCp: number;
  bracket: ClanBracketId;
  atTop: boolean;
  /** Seconds already waited when evaluating compatibility. */
  waitS: number;
};

/** Half-width CP band for a ticket at its current wait (Nightscar starts wider). */
export function bandForTicket(ticket: Pick<MatchTicketSnap, 'waitS' | 'atTop'>): MatchCpBand {
  return matchCpBandForQueue(ticket.waitS, { atTopOfLadder: ticket.atTop });
}

/**
 * Two tickets can form a match when:
 * - different users + different clans
 * - same bracket pool
 * - each team's avg CP falls inside the other's progressive band
 *   (uses the wider wait so both sides have "accepted" the gap)
 */
export function ticketsCompatible(a: MatchTicketSnap, b: MatchTicketSnap): boolean {
  if (a.userId === b.userId) return false;
  if (a.clanCode === b.clanCode) return false;
  if (a.bracket !== b.bracket) return false;
  if (a.avgCp <= 0 || b.avgCp <= 0) return false;

  const wait = Math.max(a.waitS, b.waitS);
  const atTop = a.atTop || b.atTop;
  const band = matchCpBandForQueue(wait, { atTopOfLadder: atTop });
  const lo = 1 - band.pct;
  const hi = 1 + band.pct;
  const aOk = b.avgCp >= a.avgCp * lo && b.avgCp <= a.avgCp * hi;
  const bOk = a.avgCp >= b.avgCp * lo && a.avgCp <= b.avgCp * hi;
  return aOk && bOk;
}

/** Label for the band that sealed the match (wider wait / Nightscar bump). */
export function matchBandLabelForPair(a: MatchTicketSnap, b: MatchTicketSnap): string {
  const wait = Math.max(a.waitS, b.waitS);
  const atTop = a.atTop || b.atTop;
  const band = matchCpBandForQueue(wait, { atTopOfLadder: atTop });
  return `${matchBandTitle(band)} ${band.label}`;
}

/** After this wait with no peer, clients fall back to labeled AI practice. */
export const LIVE_QUEUE_FALLBACK_S = QUEUE_BAND_METER_S;

export function isValidBracket(value: unknown): value is ClanBracketId {
  return value === 'scout' || value === 'veteran' || value === 'nightscar';
}
