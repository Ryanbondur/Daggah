import { SLOTS, itemAllowedForClass, type Gear } from '../data/gear';
import type { HeroClass, Item, SlotId } from '../data/types';
import { sanitizeDomId, sanitizePlainText } from '../util/text';
import { BAG_CAP } from './state';

/** How many named gear presets a save may keep. */
export const GEAR_PRESET_COUNT = 3;
export const GEAR_PRESET_NAME_MAX = 24;

export const DEFAULT_GEAR_PRESET_NAMES = ['PvE', 'PvP', 'Farm'] as const;

/** Snapshot of equipped item ids by slot (empty slots omitted). */
export type GearPresetSlots = Partial<Record<SlotId, string>>;

export interface GearPreset {
  /** Stable slot index 0..GEAR_PRESET_COUNT-1. */
  index: number;
  name: string;
  /** Item ids currently equipped when the preset was saved. */
  slots: GearPresetSlots;
  /** Wall-clock ms when last overwritten. */
  savedAt: number;
}

export interface GearPresetApplyOk {
  ok: true;
  gear: Gear;
  bag: Item[];
  /** Slots whose target item was missing (salvaged / gone). */
  missing: SlotId[];
  /** Slots skipped because the piece failed class/level rules. */
  blocked: SlotId[];
  changed: boolean;
}

export interface GearPresetApplyErr {
  ok: false;
  error: string;
}

export type GearPresetApplyResult = GearPresetApplyOk | GearPresetApplyErr;

export function defaultGearPresetName(index: number): string {
  return DEFAULT_GEAR_PRESET_NAMES[index] ?? `Loadout ${index + 1}`;
}

/** Capture currently equipped gear as a preset payload. */
export function captureGearPreset(
  gear: Gear,
  index: number,
  name: string,
  now = Date.now(),
): GearPreset {
  const slots: GearPresetSlots = {};
  for (const slot of SLOTS) {
    const it = gear[slot];
    if (it) slots[slot] = it.id;
  }
  return {
    index: Math.max(0, Math.min(GEAR_PRESET_COUNT - 1, Math.floor(index))),
    name: sanitizePlainText(name, GEAR_PRESET_NAME_MAX) || defaultGearPresetName(index),
    slots,
    savedAt: now,
  };
}

/** True when every saved id still matches the equipped piece (empty slots must match). */
export function gearMatchesPreset(gear: Gear, preset: GearPreset | null | undefined): boolean {
  if (!preset) return false;
  for (const slot of SLOTS) {
    const want = preset.slots[slot];
    const have = gear[slot]?.id;
    if (want) {
      if (have !== want) return false;
    } else if (have) {
      return false;
    }
  }
  return true;
}

function findOwnedItem(id: string, gear: Gear, bag: Item[]): Item | undefined {
  for (const slot of SLOTS) {
    const it = gear[slot];
    if (it?.id === id) return it;
  }
  return bag.find((i) => i.id === id);
}

/**
 * Build next gear/bag for a one-tap swap.
 * Missing pieces leave the current slot alone; wrong-class / over-level pieces are blocked.
 * Never salvages — refuses when the bag would overflow.
 */
export function applyGearPreset(
  gear: Gear,
  bag: Item[],
  preset: GearPreset,
  heroClass: HeroClass,
  heroLevel: number,
): GearPresetApplyResult {
  const nextGear: Gear = { ...gear };
  const pool = new Map<string, Item>();
  for (const slot of SLOTS) {
    const it = gear[slot];
    if (it) pool.set(it.id, it);
  }
  for (const it of bag) pool.set(it.id, it);

  const missing: SlotId[] = [];
  const blocked: SlotId[] = [];
  const claimed = new Set<string>();

  for (const slot of SLOTS) {
    const wantId = preset.slots[slot];
    if (!wantId) {
      // Empty preset slot → unequip into bag later.
      delete nextGear[slot];
      continue;
    }
    const item = pool.get(wantId);
    if (!item) {
      missing.push(slot);
      continue;
    }
    if (item.slot !== slot) {
      blocked.push(slot);
      continue;
    }
    if (item.gearLevel > heroLevel) {
      blocked.push(slot);
      continue;
    }
    if (!itemAllowedForClass(item, heroClass)) {
      blocked.push(slot);
      continue;
    }
    nextGear[slot] = item;
    claimed.add(item.id);
  }

  // Pieces that were equipped or in bag but are no longer claimed stay in bag.
  const nextBag: Item[] = [];
  const seen = new Set<string>();
  const pushBag = (it: Item) => {
    if (claimed.has(it.id) || seen.has(it.id)) return;
    seen.add(it.id);
    nextBag.push(it);
  };

  for (const slot of SLOTS) {
    const it = gear[slot];
    if (it && !claimed.has(it.id)) pushBag(it);
  }
  for (const it of bag) pushBag(it);

  if (nextBag.length > BAG_CAP) {
    return { ok: false, error: `Bag full (${nextBag.length}/${BAG_CAP}) — free space, then swap.` };
  }

  let changed = nextBag.length !== bag.length;
  if (!changed) {
    for (const slot of SLOTS) {
      if (nextGear[slot]?.id !== gear[slot]?.id) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      for (let i = 0; i < bag.length; i++) {
        if (nextBag[i]?.id !== bag[i]?.id) {
          changed = true;
          break;
        }
      }
    }
  }

  return { ok: true, gear: nextGear, bag: nextBag, missing, blocked, changed };
}

/** Normalize a raw save field into a fixed-length sparse array (null = empty slot). */
export function sanitizeGearPresets(raw: unknown): (GearPreset | null)[] {
  const out: (GearPreset | null)[] = Array.from({ length: GEAR_PRESET_COUNT }, () => null);
  if (!Array.isArray(raw)) return out;

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Partial<GearPreset> & { slots?: Record<string, unknown> };
    if (typeof e.index !== 'number' || !Number.isFinite(e.index)) continue;
    const index = Math.floor(e.index);
    if (index < 0 || index >= GEAR_PRESET_COUNT) continue;

    const slots: GearPresetSlots = {};
    if (e.slots && typeof e.slots === 'object') {
      for (const slot of SLOTS) {
        const id = e.slots[slot];
        if (typeof id === 'string' && id) {
          slots[slot] = sanitizeDomId(id, 80);
        }
      }
    }
    // Skip empty shells (no pieces).
    if (Object.keys(slots).length === 0) continue;

    const nameRaw = typeof e.name === 'string' ? e.name : defaultGearPresetName(index);
    const savedAt =
      typeof e.savedAt === 'number' && Number.isFinite(e.savedAt) ? Math.max(0, e.savedAt) : 0;

    out[index] = {
      index,
      name: sanitizePlainText(nameRaw, GEAR_PRESET_NAME_MAX) || defaultGearPresetName(index),
      slots,
      savedAt,
    };
  }
  return out;
}

/** Compact summary for UI: set names / piece count. */
export function summarizeGearPreset(
  preset: GearPreset,
  gear: Gear,
  bag: Item[],
): { pieces: number; ready: number; missing: number } {
  let pieces = 0;
  let ready = 0;
  let missing = 0;
  for (const slot of SLOTS) {
    const id = preset.slots[slot];
    if (!id) continue;
    pieces += 1;
    if (findOwnedItem(id, gear, bag)) ready += 1;
    else missing += 1;
  }
  return { pieces, ready, missing };
}
