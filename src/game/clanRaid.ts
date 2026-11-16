import { CLAN_RAID_DEF, type DungeonDef } from '../data/acts';
import { ASCENDED_SEAL_FRAGMENTS_PER_SEAL } from './ascended';
import type { Rng } from './rng';

/**
 * Clan Raid — weekly stage boss. Rewards ONLY Ascended Seals / Fragments.
 * No raid marks, participation chest, bracket bonus, or milestone track.
 * Live multiplayer shared HP is stubbed: solo AI boss on the Phaser stage.
 */

export const CLAN_RAID_DUNGEON_ID = CLAN_RAID_DEF.id;

/** Attempts per ISO week (UTC). */
export const CLAN_RAID_WEEKLY_ATTEMPTS = 3;

/**
 * Chance the clear drops a full Ascended Seal (else fragments).
 * Tuned with fragment range + 5→1 craft so a typical raider who clears all
 * weekly attempts nets ~2–3 Ascended Seals / week (funds Ascended Nightscar).
 */
export const CLAN_RAID_SEAL_CHANCE = 0.4;

/** Fragment drop when the clear misses a full seal (inclusive range). */
export const CLAN_RAID_FRAGMENT_MIN = 2;
export const CLAN_RAID_FRAGMENT_MAX = 4;

/** Soft floor: Act 10 stages cleared (Nightscar Apex unlocked). */
export const CLAN_RAID_STAGE_FLOOR = 50;

/** Mean fragments when a clear misses a full seal (uniform inclusive). */
export function clanRaidMeanFragments(): number {
  return (CLAN_RAID_FRAGMENT_MIN + CLAN_RAID_FRAGMENT_MAX) / 2;
}

/**
 * Expected Ascended Seals from one clear after fragment craft,
 * treating leftover fragments as fractional seals.
 */
export function expectedSealsPerClanRaidClear(
  fragmentsPerSeal = ASCENDED_SEAL_FRAGMENTS_PER_SEAL,
): number {
  const craft = clanRaidMeanFragments() / fragmentsPerSeal;
  return CLAN_RAID_SEAL_CHANCE + (1 - CLAN_RAID_SEAL_CHANCE) * craft;
}

/** Expected seals/week if the player spends every Clan Raid attempt. */
export function expectedSealsPerClanRaidWeek(
  fragmentsPerSeal = ASCENDED_SEAL_FRAGMENTS_PER_SEAL,
): number {
  return CLAN_RAID_WEEKLY_ATTEMPTS * expectedSealsPerClanRaidClear(fragmentsPerSeal);
}

/** Single-boss “dungeon” stub used for Phaser stage runs. */
export const CLAN_RAID_DUNGEON: DungeonDef = CLAN_RAID_DEF;

/** ISO week key `YYYY-Www` (UTC) for weekly attempt resets. */
export function clanRaidWeekKey(now = Date.now()): string {
  const d = new Date(now);
  // Thursday-based ISO week (UTC).
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function isClanRaidDungeon(d: Pick<DungeonDef, 'id'>): boolean {
  return d.id === CLAN_RAID_DUNGEON_ID;
}

export interface ClanRaidReward {
  ascendedSeals: number;
  ascendedSealFragments: number;
}

/** Roll raid spoils — seal OR fragments, never gear. */
export function rollClanRaidReward(rng: Rng): ClanRaidReward {
  if (rng.next() < CLAN_RAID_SEAL_CHANCE) {
    return { ascendedSeals: 1, ascendedSealFragments: 0 };
  }
  const span = CLAN_RAID_FRAGMENT_MAX - CLAN_RAID_FRAGMENT_MIN;
  const fragments = CLAN_RAID_FRAGMENT_MIN + Math.floor(rng.next() * (span + 1));
  return { ascendedSeals: 0, ascendedSealFragments: fragments };
}

export function formatClanRaidReward(r: ClanRaidReward): string {
  if (r.ascendedSeals > 0) {
    return r.ascendedSeals === 1 ? '1 Ascended Seal' : `${r.ascendedSeals} Ascended Seals`;
  }
  const n = r.ascendedSealFragments;
  return n === 1 ? '1 Ascended Seal Fragment' : `${n} Ascended Seal Fragments`;
}
