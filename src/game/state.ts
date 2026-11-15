import type { Gear } from '../data/gear';
import { SLOTS, starterGear } from '../data/gear';
import { DEFAULT_LOADOUT } from '../data/skills';
import { defaultTutorial, TUTORIAL_STEPS, type TutorialState } from '../data/tutorial';
import { APP_CONTENT_VERSION } from '../data/whatsNew';
import type { HeroClass, Item, RarityId, SkillId, SlotId } from '../data/types';
import { HERO_CLASSES } from '../data/types';
import { sanitizeDomId, sanitizePlainText } from '../util/text';
import type { ClanData, SeasonData } from './clan';
import {
  defaultSeason,
  normalizeClanMember,
  sanitizeClanCode,
  sanitizeClanName,
} from './clan';
import { normalizeNightscarPity } from './nightscarPity';
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
export const SAVE_VERSION = 3;
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
  clan: ClanData | null;
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
    clan: null,
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

/** Harden item display strings / ids from save or import blobs. */
export function sanitizeItem(item: Item): Item {
  return {
    ...item,
    id: sanitizeDomId(typeof item.id === 'string' ? item.id : 'id', 80),
    name: sanitizePlainText(typeof item.name === 'string' ? item.name : '', 64) || 'Unknown Item',
    slot: isSlotId(item.slot) ? item.slot : 'weapon',
    rarity: isRarityId(item.rarity) ? item.rarity : 'common',
  };
}

function sanitizeItemList(list: Item[] | undefined): Item[] {
  if (!Array.isArray(list)) return [];
  return list.filter((i) => i && typeof i === 'object').map((i) => sanitizeItem(i as Item));
}

function sanitizeGear(gear: Gear | undefined, fallback: Gear): Gear {
  const base = { ...fallback, ...(gear ?? {}) };
  const out: Gear = {};
  for (const slot of SLOTS) {
    const piece = base[slot];
    if (piece) out[slot] = sanitizeItem(piece);
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
      const gear = member.gear ? sanitizeGear(member.gear, {}) : undefined;
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
  | 'clan'
  | 'season'
  | 'tutorial'
  | 'lastSeenContentVersion'
  | 'seasonClaimed'
  | 'seasonLoginDays'
  | 'daily'
  | 'shop'
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
    clan: parsed.clan ? sanitizeClan(parsed.clan) : null,
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
    return {
      ...fresh,
      ...parsed,
      version: SAVE_VERSION,
      heroClass: 'Warrior',
      classPicked: true,
      gear: sanitizeGear({ ...fresh.gear, ...(parsed.gear ?? {}) }, fresh.gear),
      settings: normalizeSettings(parsed.settings, fresh.settings),
      dungeons: parsed.dungeons ?? {},
      bag: sanitizeItemList(parsed.bag),
      pending: sanitizeItemList(parsed.pending),
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
    return {
      ...fresh,
      ...parsed,
      version: SAVE_VERSION,
      heroClass: parsed.heroClass,
      classPicked: parsed.classPicked !== false,
      gear: sanitizeGear({ ...fresh.gear, ...(parsed.gear ?? {}) }, fresh.gear),
      settings: normalizeSettings(parsed.settings, fresh.settings),
      dungeons: parsed.dungeons ?? {},
      bag: sanitizeItemList(parsed.bag),
      pending: sanitizeItemList(parsed.pending),
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
