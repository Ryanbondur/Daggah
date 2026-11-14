import type { Gear } from '../data/gear';
import { starterGear } from '../data/gear';
import { DEFAULT_LOADOUT } from '../data/skills';
import type { Item, SkillId } from '../data/types';

export const SAVE_KEY = 'daggah.save.v1';
export const SAVE_VERSION = 1;
export const BAG_CAP = 24;
export const KEY_CAP = 8;
export const KEY_REGEN_MS = 30 * 60 * 1000;
export const DUNGEON_CRYSTAL_COST = 50;
export const STAGES_PER_ACT = 5;
export const PLAYABLE_STAGES = 10;

export interface Settings {
  autoSalvageReplaced: boolean;
  autoSalvageWorse: boolean;
  speed: number;
}

export interface SaveData {
  version: number;
  heroClass: 'Warrior';
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
  /** Number of normal stages cleared (0..10). Stage index i is unlocked when i <= stagesCleared. */
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
    level: 1,
    xp: 0,
    gear: starterGear(),
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
    loadout: [...DEFAULT_LOADOUT],
    primary: null,
    seenSkills: [...DEFAULT_LOADOUT],
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

export function loadSave(storage: Storage | undefined, now = Date.now()): SaveData {
  const fresh = defaultSave(now);
  if (!storage) return fresh;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (!parsed || parsed.version !== SAVE_VERSION || parsed.heroClass !== 'Warrior') return fresh;
    return {
      ...fresh,
      ...parsed,
      gear: { ...fresh.gear, ...(parsed.gear ?? {}) },
      settings: { ...fresh.settings, ...(parsed.settings ?? {}) },
      dungeons: parsed.dungeons ?? {},
      bag: parsed.bag ?? [],
      pending: parsed.pending ?? [],
      loadout: parsed.loadout?.length ? parsed.loadout : fresh.loadout,
      seenSkills: parsed.seenSkills ?? fresh.seenSkills,
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
}

export function stageToActStage(index: number): { act: number; stage: number } {
  return { act: Math.floor(index / STAGES_PER_ACT) + 1, stage: (index % STAGES_PER_ACT) + 1 };
}

export function actStageToIndex(act: number, stage: number): number {
  return (act - 1) * STAGES_PER_ACT + (stage - 1);
}
