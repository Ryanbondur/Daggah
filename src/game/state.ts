import type { Gear } from '../data/gear';
import { starterGear } from '../data/gear';
import { DEFAULT_LOADOUT } from '../data/skills';
import type { HeroClass, Item, SkillId } from '../data/types';
import { HERO_CLASSES } from '../data/types';

export const SAVE_KEY = 'daggah.save.v2';
export const SAVE_VERSION = 2;
export const BAG_CAP = 24;
export const KEY_CAP = 8;
export const KEY_REGEN_MS = 30 * 60 * 1000;
export const DUNGEON_CRYSTAL_COST = 50;
export const STAGES_PER_ACT = 5;
export const PLAYABLE_STAGES = 20;

export interface Settings {
  autoSalvageReplaced: boolean;
  autoSalvageWorse: boolean;
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
    settings: { autoSalvageReplaced: true, autoSalvageWorse: false, speed: 1 },
    createdAt: now,
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

export function loadSave(storage: Storage | undefined, now = Date.now()): SaveData {
  const fresh = defaultSave(now);
  if (!storage) return fresh;
  try {
    // Prefer v2; migrate readable v1 Warrior saves if present.
    const raw = storage.getItem(SAVE_KEY) ?? storage.getItem('daggah.save.v1');
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<SaveData> & { version?: number };
    if (!parsed) return fresh;
    if (parsed.version === 1 && parsed.heroClass === 'Warrior') {
      const migrated: SaveData = {
        ...fresh,
        ...parsed,
        version: SAVE_VERSION,
        heroClass: 'Warrior',
        classPicked: true,
        gear: { ...fresh.gear, ...(parsed.gear ?? {}) },
        settings: { ...fresh.settings, ...(parsed.settings ?? {}) },
        dungeons: parsed.dungeons ?? {},
        bag: parsed.bag ?? [],
        pending: parsed.pending ?? [],
        loadout: parsed.loadout?.length ? parsed.loadout : fresh.loadout,
        seenSkills: parsed.seenSkills ?? fresh.seenSkills,
      };
      writeSave(storage, migrated);
      storage.removeItem('daggah.save.v1');
      return migrated;
    }
    if (parsed.version !== SAVE_VERSION || !isHeroClass(parsed.heroClass)) return fresh;
    return {
      ...fresh,
      ...parsed,
      heroClass: parsed.heroClass,
      classPicked: parsed.classPicked !== false,
      gear: { ...fresh.gear, ...(parsed.gear ?? {}) },
      settings: { ...fresh.settings, ...(parsed.settings ?? {}) },
      dungeons: parsed.dungeons ?? {},
      bag: parsed.bag ?? [],
      pending: parsed.pending ?? [],
      loadout: parsed.loadout?.length ? parsed.loadout : [...DEFAULT_LOADOUT[parsed.heroClass]],
      seenSkills: parsed.seenSkills ?? [...DEFAULT_LOADOUT[parsed.heroClass]],
    };
  } catch {
    return fresh;
  }
}

export function writeSave(storage: Storage | undefined, save: SaveData): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage full or unavailable */
  }
}

export function clearSave(storage: Storage | undefined): void {
  storage?.removeItem(SAVE_KEY);
  storage?.removeItem('daggah.save.v1');
}

export function stageToActStage(index: number): { act: number; stage: number } {
  return { act: Math.floor(index / STAGES_PER_ACT) + 1, stage: (index % STAGES_PER_ACT) + 1 };
}

export function actStageToIndex(act: number, stage: number): number {
  return (act - 1) * STAGES_PER_ACT + (stage - 1);
}
