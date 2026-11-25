import { CAPES } from '../data/capes';
import type { Gear } from '../data/gear';
import { cpFromStats, SETS, SLOTS, starterGear } from '../data/gear';
import { isArmorSlot, isArmorType, migrateLegacyArmor } from '../data/armor';
import { isWeaponType, migrateLegacyWeapon } from '../data/weapons';
import { DEFAULT_LOADOUT } from '../data/skills';
import { defaultTutorial, TUTORIAL_STEPS, type TutorialState } from '../data/tutorial';
import { APP_CONTENT_VERSION } from '../data/whatsNew';
import type { CapeId, HeroClass, IconPack, Item, RarityId, SetId, SkillId, SlotId, Stats } from '../data/types';
import { emptyStats, HERO_CLASSES, STAT_KEYS } from '../data/types';
import { sanitizeDomId, sanitizePlainText } from '../util/text';
import type { ClanData, SeasonData } from './clan';
import {
  defaultSeason,
  normalizeClanMember,
  sanitizeClanCode,
  sanitizeClanName,
} from './clan';
import { normalizeNonNegInt } from './ascended';
import { clanRaidWeekKey } from './clanRaid';
import { normalizeNightscarPity } from './nightscarPity';
import type { GearPreset } from './gearPresets';
import { sanitizeGearPresets } from './gearPresets';
import type { DailyShopSave } from './shop';
import { defaultDailyShop, normalizeDailyShop } from './shop';

/**
 * Stable localStorage key (not versioned).
 * Version bumps used to orphan progress on republish when migration missed a key;
 * schema version lives inside the JSON (`SaveData.version`) instead.
 */
export const SAVE_KEY = 'daggah.save';
/** Older keys still read + migrated on load. */
export const LEGACY_SAVE_KEYS = ['daggah.save.v3', 'daggah.save.v2', 'daggah.save.v1'] as const;
export const SAVE_BACKUP_KEY = 'daggah.save.bak';
/** v4: collapsed legacy `legs` + `boots` into a single Boots slot. */
export const SAVE_VERSION = 4;
/** Pre-v4 footwear slot that maps onto `boots`. */
export const LEGACY_LEGS_SLOT = 'legs';
export const BAG_CAP = 24;
export const KEY_CAP = 8;
export const KEY_REGEN_MS = 30 * 60 * 1000;
/** Crystal buy-in per dungeon key (act-scaled total = keys × this). */
export const DUNGEON_CRYSTAL_COST_PER_KEY = 50;
/** @deprecated Prefer `dungeonCrystalCost(actId)`. Early-act (1 key) crystal buy-in. */
export const DUNGEON_CRYSTAL_COST = DUNGEON_CRYSTAL_COST_PER_KEY;

/**
 * Dungeon Key entry cost by act tier (Enter and Sweep).
 * Acts 1–3: 1 · 4–6: 2 · 7–9: 3 · Nightscar Apex (10): 4.
 */
export function dungeonKeyCost(actId: number): number {
  if (actId <= 3) return 1;
  if (actId <= 6) return 2;
  if (actId <= 9) return 3;
  return 4;
}

/** Crystal buy-in if the player is out of keys (same tier scaling). */
export function dungeonCrystalCost(actId: number): number {
  return dungeonKeyCost(actId) * DUNGEON_CRYSTAL_COST_PER_KEY;
}

/** Adventure Enter/Sweep button label. */
export function formatDungeonKeyCost(keys: number): string {
  return keys === 1 ? '1 Key' : `${keys} Keys`;
}

/** Full clears of a dungeon required before Sweep unlocks. */
export const SWEEP_UNLOCK_CLEARS = 5;

/** Ms until the next dungeon key regenerates; 0 when already at cap. */
export function msUntilNextKey(keys: number, keysAt: number, now: number): number {
  if (keys >= KEY_CAP) return 0;
  return Math.max(0, KEY_REGEN_MS - (now - keysAt));
}

/** Adventure HUD label: "next key in Xm" or "full" at cap. */
export function formatKeyRegenLabel(keys: number, remainingMs: number): string {
  if (keys >= KEY_CAP) return 'full';
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return `next key in ${minutes}m`;
}
export const STAGES_PER_ACT = 5;
export const PLAYABLE_STAGES = 50;

export interface Settings {
  autoSalvageReplaced: boolean;
  autoSalvageWorse: boolean;
  /**
   * Auto-salvage loot at or below this rarity (inclusive).
   * `null` = off (only `autoSalvageWorse` / bag-full rules apply).
   */
  autoSalvageRarityMax: RarityId | null;
  /** Persist mute for combat SFX. */
  muted: boolean;
  speed: number;
}

export interface SaveData {
  version: number;
  heroClass: HeroClass;
  /** False until the player picks a class on a new save / season. */
  classPicked: boolean;
  level: number;
  xp: number;
  gear: Gear;
  bag: Item[];
  pending: Item[];
  crystals: number;
  dust: number;
  gold: number;
  keys: number;
  keysAt: number;
  /** Number of normal stages cleared (0..PLAYABLE_STAGES). */
  stagesCleared: number;
  /** Currently selected stage index (0-based: act 1 stage 1 = 0). */
  currentStage: number;
  /** Next node to play in the current stage (progress kept after retreat/defeat). */
  nodeProgress: number;
  dungeons: Record<string, { cleared: boolean; clears: number }>;
  loadout: SkillId[];
  primary: SkillId | null;
  seenSkills: SkillId[];
  questIndex: number;
  salvageCount: number;
  settings: Settings;
  createdAt: number;
  /** Clan PvP currency. */
  clanTokens: number;
  clanTokensEarnedToday: number;
  clanTokensDayKey: string;
  clanWins: number;
  clanLosses: number;
  /** Calendar day key when the free challenge-up was spent (empty = unused). */
  clanChallengeUpDayKey: string;
  /** Unlocks Nightscar-exclusive Clan Armorer legendaries after a Nightscar match. */
  clanNightscarUnlocked: boolean;
  /**
   * Soft MMR within Nightscar bracket (team-scale). 0 = uninitialized → seed from team CP.
   * Compresses BiS vs fresh Nightscar matchups; Scout/Veteran ignore it.
   */
  clanNightscarMmr: number;
  clan: ClanData | null;
  /**
   * Stable id for this save's human in shared clan halls.
   * Empty until first create/join; then persisted across sessions.
   */
  clanHumanId: string;
  season: SeasonData;
  /** First-run tutorial coach. */
  tutorial: TutorialState;
  /**
   * Last dismissed What’s new content version (`APP_CONTENT_VERSION`).
   * Fresh saves seed to the current version (skip notes on first play).
   * Missing on legacy saves → empty string so notes show once after migrate.
   */
  lastSeenContentVersion: string;
  /** Claimed season milestone ids. */
  seasonClaimed: string[];
  /** Distinct calendar days played this season (for Recruit tier). */
  seasonLoginDays: string[];
  /** Daily quest progress counters (reset each calendar day). */
  daily: {
    dayKey: string;
    questId: string;
    stages: number;
    dungeons: number;
    salvage: number;
    clan: number;
    fullLoadout: number;
    claimed: boolean;
  };
  /** Town/Camp daily merchant slate (seed + purchased indices). */
  shop: DailyShopSave;
  /** Last successful persist timestamp (local or import). */
  savedAt: number;
  /**
   * Consecutive dry Nightscar Apex clears/sweeps (no Epic/Legendary loot).
   * Soft-ramps endgame drop odds; resets on high-tier success. Cap 8.
   */
  nightscarPity: number;
  /**
   * Consecutive dry Ascended Nightscar clears/sweeps (no Epic/Legendary).
   * Soft-ramps ascended drop odds independently of normal Apex pity.
   */
  ascendedPity: number;
  /** Full Ascended Seals — premium entry for Ascended Nightscar. */
  ascendedSeals: number;
  /** Fragments craft into Ascended Seals (see ASCENDED_SEAL_FRAGMENTS_PER_SEAL). */
  ascendedSealFragments: number;
  /** ISO week key when clan raid attempts were last spent. */
  clanRaidWeekKey: string;
  /** Clan Raid attempts used in the current week. */
  clanRaidAttemptsUsed: number;
  /**
   * Named gear loadout presets (2–3 slots). Null entries are empty.
   * Stores item ids by slot; apply swaps from bag without salvaging.
   */
  gearPresets: (GearPreset | null)[];
}

export function defaultSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    heroClass: 'Warrior',
    classPicked: false,
    level: 1,
    xp: 0,
    gear: starterGear('Warrior'),
    bag: [],
    pending: [],
    crystals: 0,
    dust: 0,
    gold: 0,
    keys: 3,
    keysAt: now,
    stagesCleared: 0,
    currentStage: 0,
    nodeProgress: 0,
    dungeons: {},
    loadout: [...DEFAULT_LOADOUT.Warrior],
    primary: null,
    seenSkills: [...DEFAULT_LOADOUT.Warrior],
    questIndex: 0,
    salvageCount: 0,
    settings: {
      autoSalvageReplaced: true,
      autoSalvageWorse: false,
      autoSalvageRarityMax: 'common',
      muted: false,
      speed: 1,
    },
    createdAt: now,
    clanTokens: 0,
    clanTokensEarnedToday: 0,
    clanTokensDayKey: new Date(now).toISOString().slice(0, 10),
    clanWins: 0,
    clanLosses: 0,
    clanChallengeUpDayKey: '',
    clanNightscarUnlocked: false,
    clanNightscarMmr: 0,
    clan: null,
    clanHumanId: '',
    season: defaultSeason(now),
    tutorial: defaultTutorial(),
    lastSeenContentVersion: APP_CONTENT_VERSION,
    seasonClaimed: [],
    seasonLoginDays: [new Date(now).toISOString().slice(0, 10)],
    daily: {
      dayKey: new Date(now).toISOString().slice(0, 10),
      questId: 'daily-stage-3',
      stages: 0,
      dungeons: 0,
      salvage: 0,
      clan: 0,
      fullLoadout: 0,
      claimed: false,
    },
    shop: defaultDailyShop(now),
    savedAt: now,
    nightscarPity: 0,
    ascendedPity: 0,
    ascendedSeals: 0,
    ascendedSealFragments: 0,
    clanRaidWeekKey: clanRaidWeekKey(now),
    clanRaidAttemptsUsed: 0,
    gearPresets: [null, null, null],
  };
}

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isHeroClass(v: unknown): v is HeroClass {
  return typeof v === 'string' && (HERO_CLASSES as string[]).includes(v);
}

const RARITY_IDS: RarityId[] = ['common', 'rare', 'epic', 'legendary'];

function isRarityId(v: unknown): v is RarityId {
  return typeof v === 'string' && (RARITY_IDS as string[]).includes(v);
}

function isSlotId(v: unknown): v is SlotId {
  return typeof v === 'string' && (SLOTS as string[]).includes(v);
}

/** Map legacy `legs` → `boots`; unknown slots fall back to weapon. */
export function coerceSlotId(v: unknown): SlotId {
  if (v === LEGACY_LEGS_SLOT) return 'boots';
  if (isSlotId(v)) return v;
  return 'weapon';
}

/** Item-only CP used when picking which footwear piece to keep equipped. */
export function itemPieceCp(item: Pick<Item, 'stats'>): number {
  const s: Stats = emptyStats();
  for (const k of STAT_KEYS) {
    const v = item.stats?.[k];
    if (typeof v === 'number') s[k] += v;
  }
  return cpFromStats(s);
}

function asItemRecord(value: unknown): Item | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as Item;
}

/**
 * Collapse legacy `legs` into `boots`. When both are filled, keep the higher-CP
 * piece equipped and push the other into `bag` (remapped to boots).
 */
export function collapseLegsIntoBoots(
  gearIn: Record<string, unknown> | Gear | undefined,
  bagIn: unknown[] | Item[] | undefined,
): { gear: Record<string, unknown>; bag: unknown[] } {
  const gear: Record<string, unknown> = { ...(gearIn ?? {}) };
  const bag: unknown[] = Array.isArray(bagIn) ? [...bagIn] : [];
  const legs = asItemRecord(gear[LEGACY_LEGS_SLOT]);
  const boots = asItemRecord(gear.boots);
  delete gear[LEGACY_LEGS_SLOT];

  if (legs) {
    const legsAsBoots: Item = { ...legs, slot: 'boots' };
    if (boots) {
      if (itemPieceCp(legsAsBoots) > itemPieceCp(boots)) {
        bag.push({ ...boots, slot: 'boots' });
        gear.boots = legsAsBoots;
      } else {
        bag.push(legsAsBoots);
      }
    } else {
      gear.boots = legsAsBoots;
    }
  }

  for (let i = 0; i < bag.length; i++) {
    const it = asItemRecord(bag[i]);
    if (it && (it.slot as string) === LEGACY_LEGS_SLOT) {
      bag[i] = { ...it, slot: 'boots' };
    }
  }

  return { gear, bag };
}

function isCapeId(v: unknown): v is CapeId {
  return typeof v === 'string' && v in CAPES;
}

const ICON_PACKS: readonly IconPack[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];

function sanitizeIconPack(v: unknown): IconPack {
  return ICON_PACKS.includes(v as IconPack) ? (v as IconPack) : 'a';
}

function sanitizeItemStats(raw: unknown): Partial<Stats> {
  const out: Partial<Stats> = {};
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const k of STAT_KEYS) {
    const v = src[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(-1e6, Math.min(1e6, v));
  }
  return out;
}

/** Harden item display strings / ids from save or import blobs. */
export function sanitizeItem(item: Item, heroClass: HeroClass | null = null): Item {
  const slot = coerceSlotId(item.slot);
  const gl = typeof item.gearLevel === 'number' && Number.isFinite(item.gearLevel) ? item.gearLevel : 1;
  const next: Item = {
    id: sanitizeDomId(typeof item.id === 'string' ? item.id : 'id', 80),
    name: sanitizePlainText(typeof item.name === 'string' ? item.name : '', 64) || 'Unknown Item',
    slot,
    rarity: isRarityId(item.rarity) ? item.rarity : 'common',
    gearLevel: Math.max(1, Math.min(99, Math.floor(gl))),
    icon: sanitizeIconPack(item.icon),
    stats: sanitizeItemStats(item.stats),
  };
  if (typeof item.setId === 'string' && Object.prototype.hasOwnProperty.call(SETS, item.setId)) {
    next.setId = item.setId as SetId;
  }
  if (slot === 'cape') {
    if (isCapeId(item.capeId)) next.capeId = item.capeId;
    else delete next.capeId;
    delete next.setId;
  } else if (item.capeId) {
    delete next.capeId;
  }
  if (slot === 'weapon') {
    return migrateLegacyWeapon(isWeaponType(item.weaponType) ? { ...next, weaponType: item.weaponType } : next);
  }
  if (isArmorSlot(slot)) {
    return migrateLegacyArmor(isArmorType(item.armorType) ? { ...next, armorType: item.armorType } : next, heroClass);
  }
  return next;
}

function sanitizeItemList(list: Item[] | undefined, heroClass: HeroClass | null = null): Item[] {
  if (!Array.isArray(list)) return [];
  return list.filter((i) => i && typeof i === 'object').map((i) => sanitizeItem(i as Item, heroClass));
}

function sanitizeGear(gear: Gear | undefined, fallback: Gear, heroClass: HeroClass | null = null): Gear {
  const collapsed = collapseLegsIntoBoots(gear as Record<string, unknown> | undefined, []);
  const base = { ...fallback, ...(collapsed.gear as Gear) };
  const out: Gear = {};
  for (const slot of SLOTS) {
    const piece = base[slot];
    if (piece) out[slot] = sanitizeItem(piece, heroClass);
  }
  return out;
}

function sanitizeClan(clan: ClanData): ClanData {
  return {
    ...clan,
    id: sanitizeDomId(typeof clan.id === 'string' ? clan.id : 'clan', 48),
    name: sanitizeClanName(typeof clan.name === 'string' ? clan.name : ''),
    code: sanitizeClanCode(typeof clan.code === 'string' ? clan.code : '') || 'UNKNOWN',
    members: (clan.members ?? []).map((m) => {
      const member = normalizeClanMember(m);
      const gear = member.gear ? sanitizeGear(member.gear, {}, isHeroClass(member.heroClass) ? member.heroClass : null) : undefined;
      return gear ? { ...member, gear } : member;
    }),
  };
}

function normalizeSettings(
  parsed: Partial<Settings> | undefined,
  fresh: Settings,
): Settings {
  const merged = { ...fresh, ...(parsed ?? {}) };
  if (parsed && 'autoSalvageRarityMax' in parsed) {
    const max = parsed.autoSalvageRarityMax;
    merged.autoSalvageRarityMax = max === null ? null : isRarityId(max) ? max : fresh.autoSalvageRarityMax;
  } else {
    merged.autoSalvageRarityMax = fresh.autoSalvageRarityMax;
  }
  merged.muted = !!merged.muted;
  merged.autoSalvageReplaced = !!merged.autoSalvageReplaced;
  merged.autoSalvageWorse = !!merged.autoSalvageWorse;
  merged.speed = typeof merged.speed === 'number' ? merged.speed : fresh.speed;
  return merged;
}

function migrateClanFields(parsed: Partial<SaveData>, fresh: SaveData, now: number): Pick<
  SaveData,
  | 'clanTokens'
  | 'clanTokensEarnedToday'
  | 'clanTokensDayKey'
  | 'clanWins'
  | 'clanLosses'
  | 'clanChallengeUpDayKey'
  | 'clanNightscarUnlocked'
  | 'clanNightscarMmr'
  | 'clan'
  | 'clanHumanId'
  | 'season'
  | 'tutorial'
  | 'lastSeenContentVersion'
  | 'seasonClaimed'
  | 'seasonLoginDays'
  | 'daily'
  | 'shop'
  | 'ascendedPity'
  | 'ascendedSeals'
  | 'ascendedSealFragments'
  | 'clanRaidWeekKey'
  | 'clanRaidAttemptsUsed'
  | 'gearPresets'
> {
  const day = new Date(now).toISOString().slice(0, 10);
  const tut = parsed.tutorial;
  let tutorial: TutorialState;
  if (tut && typeof tut.step === 'number') {
    const everCompleted = !!tut.everCompleted;
    // Completing an older shorter coach should not reopen when we add steps.
    const step = everCompleted ? Math.max(tut.step, TUTORIAL_STEPS.length) : tut.step;
    tutorial = { step, everCompleted, skipped: !!tut.skipped };
  } else {
    tutorial = fresh.tutorial;
  }
  // Legacy saves omit the field → '' so What’s new shows once for returning players.
  const lastSeenContentVersion =
    typeof parsed.lastSeenContentVersion === 'string' ? parsed.lastSeenContentVersion : '';
  return {
    clanTokens: typeof parsed.clanTokens === 'number' ? parsed.clanTokens : 0,
    clanTokensEarnedToday: typeof parsed.clanTokensEarnedToday === 'number' ? parsed.clanTokensEarnedToday : 0,
    clanTokensDayKey:
      typeof parsed.clanTokensDayKey === 'string' ? parsed.clanTokensDayKey : fresh.clanTokensDayKey,
    clanWins: typeof parsed.clanWins === 'number' ? parsed.clanWins : 0,
    clanLosses: typeof parsed.clanLosses === 'number' ? parsed.clanLosses : 0,
    clanChallengeUpDayKey:
      typeof parsed.clanChallengeUpDayKey === 'string' ? parsed.clanChallengeUpDayKey : '',
    clanNightscarUnlocked: !!parsed.clanNightscarUnlocked,
    clanNightscarMmr:
      typeof parsed.clanNightscarMmr === 'number' && Number.isFinite(parsed.clanNightscarMmr)
        ? Math.max(0, Math.round(parsed.clanNightscarMmr))
        : 0,
    clan: parsed.clan ? sanitizeClan(parsed.clan) : null,
    clanHumanId:
      typeof parsed.clanHumanId === 'string' && parsed.clanHumanId.trim()
        ? sanitizeDomId(parsed.clanHumanId, 48)
        : '',
    season: parsed.season?.startedAt ? parsed.season : defaultSeason(parsed.createdAt ?? now),
    tutorial,
    lastSeenContentVersion,
    seasonClaimed: Array.isArray(parsed.seasonClaimed) ? parsed.seasonClaimed.filter((x) => typeof x === 'string') : [],
    seasonLoginDays: Array.isArray(parsed.seasonLoginDays)
      ? parsed.seasonLoginDays.filter((x) => typeof x === 'string')
      : [day],
    daily:
      parsed.daily && typeof parsed.daily.dayKey === 'string'
        ? {
            dayKey: parsed.daily.dayKey,
            questId: typeof parsed.daily.questId === 'string' ? parsed.daily.questId : fresh.daily.questId,
            stages: Number(parsed.daily.stages) || 0,
            dungeons: Number(parsed.daily.dungeons) || 0,
            salvage: Number(parsed.daily.salvage) || 0,
            clan: Number(parsed.daily.clan) || 0,
            fullLoadout: Number(parsed.daily.fullLoadout) || 0,
            claimed: !!parsed.daily.claimed,
          }
        : { ...fresh.daily, dayKey: day },
    shop: normalizeDailyShop(parsed.shop, fresh.shop),
    ascendedPity: normalizeNightscarPity(parsed.ascendedPity),
    ascendedSeals: normalizeNonNegInt(parsed.ascendedSeals),
    ascendedSealFragments: normalizeNonNegInt(parsed.ascendedSealFragments),
    clanRaidWeekKey:
      typeof parsed.clanRaidWeekKey === 'string' && parsed.clanRaidWeekKey
        ? parsed.clanRaidWeekKey
        : clanRaidWeekKey(now),
    clanRaidAttemptsUsed: normalizeNonNegInt(parsed.clanRaidAttemptsUsed, 99),
    gearPresets: sanitizeGearPresets(
      (parsed as Partial<SaveData> & { gearPresets?: unknown }).gearPresets,
    ),
  };
}

/** Collapse legs→boots on gear/bag/pending before sanitize. */
function migrateFootwearSlots(parsed: Partial<SaveData>, heroClass: HeroClass | null): {
  gear: Gear;
  bag: Item[];
  pending: Item[];
} {
  const pendingRaw = Array.isArray(parsed.pending) ? [...parsed.pending] : [];
  for (let i = 0; i < pendingRaw.length; i++) {
    const it = asItemRecord(pendingRaw[i]);
    if (it && (it.slot as string) === LEGACY_LEGS_SLOT) {
      pendingRaw[i] = { ...it, slot: 'boots' };
    }
  }
  const collapsed = collapseLegsIntoBoots(
    parsed.gear as Record<string, unknown> | undefined,
    parsed.bag,
  );
  return {
    gear: collapsed.gear as Gear,
    bag: sanitizeItemList(collapsed.bag as Item[], heroClass),
    pending: sanitizeItemList(pendingRaw as Item[], heroClass),
  };
}

/** Normalize a parsed partial save blob, or null if unusable. */
export function normalizeParsedSave(
  parsed: Partial<SaveData> & { version?: number },
  now = Date.now(),
): SaveData | null {
  const fresh = defaultSave(now);
  if (!parsed) return null;

  // Warrior-only v1 era.
  if (parsed.version === 1 && parsed.heroClass === 'Warrior') {
    const footwear = migrateFootwearSlots(parsed, 'Warrior');
    return {
      ...fresh,
      ...parsed,
      version: SAVE_VERSION,
      heroClass: 'Warrior',
      classPicked: true,
      gear: sanitizeGear({ ...fresh.gear, ...footwear.gear }, fresh.gear, 'Warrior'),
      settings: normalizeSettings(parsed.settings, fresh.settings),
      dungeons: parsed.dungeons ?? {},
      bag: footwear.bag,
      pending: footwear.pending,
      loadout: parsed.loadout?.length ? parsed.loadout : fresh.loadout,
      seenSkills: parsed.seenSkills ?? fresh.seenSkills,
      ...migrateClanFields(parsed, fresh, now),
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : now,
      nightscarPity: normalizeNightscarPity(parsed.nightscarPity),
    };
  }

  // Accept current + future schema versions with a known class (forward-compatible).
  // Unknown fields are dropped by the explicit shape; missing fields fill from fresh.
  if (typeof parsed.version === 'number' && parsed.version >= 2 && isHeroClass(parsed.heroClass)) {
    const footwear = migrateFootwearSlots(parsed, parsed.heroClass);
    const classStarter = starterGear(parsed.heroClass);
    return {
      ...fresh,
      ...parsed,
      version: SAVE_VERSION,
      heroClass: parsed.heroClass,
      classPicked: parsed.classPicked !== false,
      gear: sanitizeGear({ ...classStarter, ...footwear.gear }, classStarter, parsed.heroClass),
      settings: normalizeSettings(parsed.settings, fresh.settings),
      dungeons: parsed.dungeons ?? {},
      bag: footwear.bag,
      pending: footwear.pending,
      loadout: parsed.loadout?.length ? parsed.loadout : [...DEFAULT_LOADOUT[parsed.heroClass]],
      seenSkills: parsed.seenSkills ?? [...DEFAULT_LOADOUT[parsed.heroClass]],
      ...migrateClanFields(parsed, fresh, now),
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : now,
      nightscarPity: normalizeNightscarPity(parsed.nightscarPity),
    };
  }

  return null;
}

/** Parse raw JSON text into SaveData (shared by localStorage + import codes). */
export function loadSaveFromRaw(raw: string, now = Date.now()): SaveData | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData> & { version?: number };
    return normalizeParsedSave(parsed, now);
  } catch {
    return null;
  }
}

function readRawSave(storage: Storage): { raw: string; fromKey: string } | null {
  const primary = storage.getItem(SAVE_KEY);
  if (primary) return { raw: primary, fromKey: SAVE_KEY };
  for (const key of LEGACY_SAVE_KEYS) {
    const raw = storage.getItem(key);
    if (raw) return { raw, fromKey: key };
  }
  return null;
}

function clearLegacyKeys(storage: Storage): void {
  for (const key of LEGACY_SAVE_KEYS) storage.removeItem(key);
}

export function loadSave(storage: Storage | undefined, now = Date.now()): SaveData {
  const fresh = defaultSave(now);
  if (!storage) return fresh;
  const found = readRawSave(storage);
  if (!found) return fresh;

  const migrated = loadSaveFromRaw(found.raw, now);
  if (!migrated) {
    // Keep corrupt blob recoverable; do not clobber until a real persist succeeds.
    try {
      storage.setItem(SAVE_BACKUP_KEY, found.raw);
    } catch {
      /* ignore */
    }
    return fresh;
  }

  // Migrate legacy versioned keys onto the stable key once.
  if (found.fromKey !== SAVE_KEY) {
    writeSave(storage, migrated);
    return migrated;
  }
  // Backfill missing schema fields (e.g. savedAt) without churning every load.
  try {
    const peek = JSON.parse(found.raw) as { version?: number; savedAt?: number };
    if (peek.version !== SAVE_VERSION || typeof peek.savedAt !== 'number') {
      writeSave(storage, migrated);
    }
  } catch {
    writeSave(storage, migrated);
  }
  return migrated;
}

export function writeSave(storage: Storage | undefined, save: SaveData, now = Date.now()): void {
  if (!storage) return;
  try {
    save.savedAt = now;
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    clearLegacyKeys(storage);
  } catch {
    /* storage full or unavailable */
  }
}

export function clearSave(storage: Storage | undefined): void {
  if (!storage) return;
  storage.removeItem(SAVE_KEY);
  storage.removeItem(SAVE_BACKUP_KEY);
  clearLegacyKeys(storage);
}

export function stageToActStage(index: number): { act: number; stage: number } {
  return { act: Math.floor(index / STAGES_PER_ACT) + 1, stage: (index % STAGES_PER_ACT) + 1 };
}

export function actStageToIndex(act: number, stage: number): number {
  return (act - 1) * STAGES_PER_ACT + (stage - 1);
}
