/**
 * Clan 4v4 CP brackets (DG-47) + progressive matchmaking bands.
 *
 * Hard team-CP buckets (sum of four fighters) — clearer than soft ±% bands alone
 * for Scout / Veteran / Nightscar UI. Rival CP seeding uses MATCH_CP_BANDS
 * (tight → open by queue wait; Nightscar starts one step wider).
 *
 * Scale reference (≈4× mid-act stageRecCp):
 *   Act 3 ≈ 2350 · Act 5 ≈ 3600 · Act 7 ≈ 4850 · Act 9 ≈ 6100 · Act 10 ≈ 6740
 */

export type ClanBracketId = 'scout' | 'veteran' | 'nightscar';

export const CLAN_BRACKET_ORDER: ClanBracketId[] = ['scout', 'veteran', 'nightscar'];

export const CLAN_BRACKET_LABEL: Record<ClanBracketId, string> = {
  scout: 'Scout',
  veteran: 'Veteran',
  nightscar: 'Nightscar',
};

/** Team CP (sum) below this → Scout. */
export const TEAM_CP_SCOUT_MAX = 3800;
/** Team CP (sum) below this → Veteran; else Nightscar. */
export const TEAM_CP_VETERAN_MAX = 5600;

/**
 * Soft floor to queue 4v4: finish Act 3 (15 stages) or reach mid-Act-3 CP.
 * Below floor → clear UI message, no match.
 */
export const CLAN_QUEUE_FLOOR_STAGES = 15;
export const CLAN_QUEUE_FLOOR_CP = 550;

/** Same reward shape per tier, scaled from base Win 20 / Loss 5. */
export const BRACKET_TOKEN_WIN: Record<ClanBracketId, number> = {
  scout: 15,
  veteran: 20,
  nightscar: 25,
};

export const BRACKET_TOKEN_LOSS: Record<ClanBracketId, number> = {
  scout: 4,
  veteran: 5,
  nightscar: 6,
};

/** Per-fighter avg CP targets when challenge-up seeds rivals into the next bucket. */
export const BRACKET_TARGET_AVG_CP: Record<ClanBracketId, number> = {
  scout: 700,
  veteran: 1175,
  nightscar: 1600,
};

/**
 * Progressive per-fighter CP match bands (fraction of party avg CP).
 * Live MP widens by wait; local AI practice uses the band for waitS=0 (tight ±8%).
 * Nightscar (top ladder) starts one step wider so peers still fill.
 *
 * | Wait (s) | Band   | ±% of avg CP |
 * |----------|--------|--------------|
 * | 0–9      | tight  | 8%           |
 * | 10–19    | standard | 15%        |
 * | 20–29    | wide   | 25%          |
 * | 30+      | open   | 40%          |
 */
export interface MatchCpBand {
  waitS: number;
  pct: number;
  id: 'tight' | 'standard' | 'wide' | 'open';
  label: string;
}

export const MATCH_CP_BANDS: readonly MatchCpBand[] = [
  { waitS: 0, pct: 0.08, id: 'tight', label: '±8% CP' },
  { waitS: 10, pct: 0.15, id: 'standard', label: '±15% CP' },
  { waitS: 20, pct: 0.25, id: 'wide', label: '±25% CP' },
  { waitS: 30, pct: 0.4, id: 'open', label: '±40% CP' },
] as const;

/** Local AI practice fills immediately at the tight band (similar CP). */
export const PRACTICE_MATCH_WAIT_S = 0;

export function matchBandIndexForWait(waitS: number): number {
  let idx = 0;
  for (let i = 0; i < MATCH_CP_BANDS.length; i++) {
    if (waitS >= MATCH_CP_BANDS[i]!.waitS) idx = i;
  }
  return idx;
}

/**
 * Resolve CP band for a queue. `atTopOfLadder` (Nightscar natural bracket) starts
 * one step wider so top-ladder peers still match without a long wait.
 */
export function matchCpBandForQueue(
  waitS: number,
  opts?: { atTopOfLadder?: boolean },
): MatchCpBand {
  let idx = matchBandIndexForWait(waitS);
  if (opts?.atTopOfLadder) idx = Math.min(MATCH_CP_BANDS.length - 1, idx + 1);
  return MATCH_CP_BANDS[idx]!;
}

export function teamCpSum(roster: { cp: number }[]): number {
  return roster.reduce((s, m) => s + (m.cp || 0), 0);
}

export function assignBracket(teamCp: number): ClanBracketId {
  if (teamCp < TEAM_CP_SCOUT_MAX) return 'scout';
  if (teamCp < TEAM_CP_VETERAN_MAX) return 'veteran';
  return 'nightscar';
}

export function nextBracket(id: ClanBracketId): ClanBracketId | null {
  if (id === 'scout') return 'veteran';
  if (id === 'veteran') return 'nightscar';
  return null;
}

export function bracketTokenReward(bracket: ClanBracketId, won: boolean): number {
  return won ? BRACKET_TOKEN_WIN[bracket] : BRACKET_TOKEN_LOSS[bracket];
}

export function meetsClanQueueFloor(stagesCleared: number, playerCp: number): boolean {
  return stagesCleared >= CLAN_QUEUE_FLOOR_STAGES || playerCp >= CLAN_QUEUE_FLOOR_CP;
}

export function clanQueueFloorMessage(): string {
  return `Finish Act 3 (or reach ${CLAN_QUEUE_FLOOR_CP} CP) before queuing 4v4.`;
}

export function challengeUpAvailable(dayKeyUsed: string, todayKey: string): boolean {
  return !dayKeyUsed || dayKeyUsed !== todayKey;
}

export function bracketRangeLabel(id: ClanBracketId): string {
  if (id === 'scout') return `Team CP < ${TEAM_CP_SCOUT_MAX}`;
  if (id === 'veteran') return `Team CP ${TEAM_CP_SCOUT_MAX}–${TEAM_CP_VETERAN_MAX - 1}`;
  return `Team CP ≥ ${TEAM_CP_VETERAN_MAX}`;
}
