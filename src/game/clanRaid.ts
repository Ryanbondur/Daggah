import { CLAN_RAID_DEF, type DungeonDef } from '../data/acts';
import { computeHero } from '../data/gear';
import { DEFAULT_LOADOUT, defaultPrimary } from '../data/skills';
import type { HeroClass } from '../data/types';
import { HERO_CLASSES } from '../data/types';
import type { ClanData } from './clan';
import { buildAiMember, fillAiRoster, pickQueueRoster } from './clan';
import type { RaidAlly } from './combat';
import { ASCENDED_SEAL_FRAGMENTS_PER_SEAL } from './ascended';
import type { Rng } from './rng';

/**
 * Clan Raid — weekly stage boss. Rewards ONLY Ascended Seals / Fragments.
 * No raid marks, participation chest, bracket bonus, or milestone track.
 * Live multiplayer shared HP is stubbed: Phaser party of 4 (you + 3 AI) vs boss.
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

/**
 * Extra enemy tier on Clan Raid (on top of Act 10 mid-band).
 * Paired with HP/ATK muls so a full epic set takes ~3 minutes; BiS ~1:50.
 */
export const CLAN_RAID_TIER_BUMP = 3.6;

/** Boss node tier offset inside the raid run. */
export const CLAN_RAID_BOSS_TIER_EXTRA = 1.4;

/**
 * Flat HP multiplier after enemyScale × def.hpMul.
 * Tuned for party-of-4 DPS (player + 3 AI fillers).
 */
export const CLAN_RAID_BOSS_HP_MUL = 13;

/** Boss ATK multiplier — threatening over a long fight, not one-shot. */
export const CLAN_RAID_BOSS_ATK_MUL = 2.15;

/** AI allies auto-attack damage vs the player’s swing baseline. */
export const CLAN_RAID_ALLY_SWING_MUL = 0.78;

/** Human-readable clear targets (for tests / GDD). */
export const CLAN_RAID_TARGET_CLEAR_S = { withoutBis: 180, withBis: 110 } as const;

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

/**
 * Ensure clan has a 4v4-ready roster, then build raid allies (player + 3 AI classes)
 * using the same class-lane layout as Clan 4v4.
 */
export function buildClanRaidAllies(
  clan: ClanData,
  playerClass: HeroClass,
  playerLevel: number,
  playerStats: { atk: number; def: number; hp: number; haste: number },
  rng: Rng,
): RaidAlly[] {
  const added = fillAiRoster(clan, rng, playerLevel, 'scaled');
  if (added.length) clan.members.push(...added);

  let roster = pickQueueRoster(clan.members, playerClass);
  if (!roster) {
    // Fallback: synthesize missing classes so raid always fields 4.
    for (const cls of HERO_CLASSES) {
      if (!clan.members.some((m) => m.heroClass === cls && (cls === playerClass ? m.isPlayer : !m.isPlayer))) {
        if (cls === playerClass) continue;
        clan.members.push(buildAiMember(rng, cls, playerLevel, 'member', 'scaled'));
      }
    }
    roster = pickQueueRoster(clan.members, playerClass);
  }
  if (!roster) {
    // Last resort: player + 3 synthetic AI of other classes.
    roster = [
      clan.members.find((m) => m.isPlayer)!,
      ...HERO_CLASSES.filter((c) => c !== playerClass).map((c) =>
        buildAiMember(rng, c, playerLevel, 'member', 'scaled'),
      ),
    ];
  }

  return roster.map((m) => {
    const lane = HERO_CLASSES.indexOf(m.heroClass);
    const x = 0.1 + lane * 0.1;
    if (m.isPlayer) {
      return {
        id: m.id,
        name: m.name,
        heroClass: m.heroClass,
        isPlayer: true,
        isAi: false,
        x,
        hp: playerStats.hp,
        maxHp: playerStats.hp,
        atk: playerStats.atk,
        defense: playerStats.def,
        haste: playerStats.haste,
        swingT: 0.35,
        swingAnim: 0,
        hitFlash: 0,
        dead: false,
        deathT: 0,
      } satisfies RaidAlly;
    }
    const loadout = (m.loadout.length ? m.loadout : DEFAULT_LOADOUT[m.heroClass]).slice(0, 4);
    const gear = m.gear ?? buildAiMember(rng, m.heroClass, m.level, 'member', 'scaled').gear!;
    const totals = computeHero(m.level, gear, m.heroClass, loadout);
    void defaultPrimary(loadout);
    return {
      id: m.id,
      name: m.name,
      heroClass: m.heroClass,
      isPlayer: false,
      isAi: true,
      x,
      hp: totals.stats.hp,
      maxHp: totals.stats.hp,
      atk: totals.stats.atk,
      defense: totals.stats.def,
      haste: totals.stats.haste,
      swingT: 0.4 + lane * 0.08,
      swingAnim: 0,
      hitFlash: 0,
      dead: false,
      deathT: 0,
    } satisfies RaidAlly;
  });
}
