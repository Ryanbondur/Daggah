/**
 * Clan-hall registry: same-origin localStorage fallback + helpers.
 * Cross-device sync uses /api/daggah-clan when auth + DB are available.
 * Does not touch DG-42 season_stats / clan_results stubs.
 */
import type { ClanData } from './clan';
import { sanitizeClanCode } from './clan';
import {
  hallSnapshot,
  removeHumanFromClan,
  type ClanData as AdmitClanData,
} from './clanAdmit';
import type { Storage } from './state';

export const CLAN_HALLS_KEY = 'daggah.clanHalls';

export type ClanHallRecord = {
  clan: ClanData;
  updatedAt: number;
};

type HallMap = Record<string, ClanHallRecord>;

function asAdmit(clan: ClanData): AdmitClanData {
  return clan as unknown as AdmitClanData;
}

function fromAdmit(clan: AdmitClanData): ClanData {
  return clan as unknown as ClanData;
}

function readMap(storage: Storage | undefined): HallMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CLAN_HALLS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HallMap;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeMap(storage: Storage | undefined, map: HallMap): void {
  if (!storage) return;
  try {
    storage.setItem(CLAN_HALLS_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/** Publish / overwrite a hall snapshot for join-by-code (local fallback). */
export function publishClanHall(storage: Storage | undefined, clan: ClanData, now = Date.now()): void {
  const snap = fromAdmit(hallSnapshot(asAdmit(clan)));
  if (!snap.code) return;
  const map = readMap(storage);
  map[snap.code] = { clan: snap, updatedAt: now };
  writeMap(storage, map);
}

export function lookupClanHall(storage: Storage | undefined, code: string): ClanData | null {
  const clean = sanitizeClanCode(code);
  if (!clean) return null;
  const rec = readMap(storage)[clean];
  if (!rec?.clan) return null;
  return fromAdmit(hallSnapshot(asAdmit(rec.clan)));
}

export function removeMemberFromHall(
  storage: Storage | undefined,
  code: string,
  humanId: string,
  now = Date.now(),
): void {
  const clean = sanitizeClanCode(code);
  if (!clean) return;
  const map = readMap(storage);
  const rec = map[clean];
  if (!rec) return;
  const next = removeHumanFromClan(asAdmit(rec.clan), humanId);
  if (!next) {
    delete map[clean];
  } else {
    map[clean] = {
      clan: fromAdmit(next),
      updatedAt: now,
    };
  }
  writeMap(storage, map);
}

export function deleteClanHall(storage: Storage | undefined, code: string): void {
  const clean = sanitizeClanCode(code);
  if (!clean) return;
  const map = readMap(storage);
  if (!(clean in map)) return;
  delete map[clean];
  writeMap(storage, map);
}
