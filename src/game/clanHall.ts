/**
 * Local shared clan-hall registry (same-origin storage).
 * Lets real players join by code across saves that share this key.
 * Does not touch DG-42 season_stats / clan_results stubs.
 */
import type { ClanData } from './clan';
import { normalizeClanMember, sanitizeClanCode, sanitizeClanName } from './clan';
import type { Storage } from './state';

export const CLAN_HALLS_KEY = 'daggah.clanHalls';

export type ClanHallRecord = {
  clan: ClanData;
  updatedAt: number;
};

type HallMap = Record<string, ClanHallRecord>;

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

/** Snapshot for the shared hall: strip local isPlayer; keep isAi false for humans. */
function hallSnapshot(clan: ClanData): ClanData {
  const code = sanitizeClanCode(clan.code);
  return {
    id: clan.id,
    name: sanitizeClanName(clan.name),
    code,
    members: (clan.members ?? []).map((m) => {
      const n = normalizeClanMember(m);
      return {
        ...n,
        isPlayer: false,
        isAi: n.isAi === false ? false : true,
      };
    }),
  };
}

/** Publish / overwrite a hall snapshot for join-by-code. */
export function publishClanHall(storage: Storage | undefined, clan: ClanData, now = Date.now()): void {
  const snap = hallSnapshot(clan);
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
  return hallSnapshot(rec.clan);
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
  const members = rec.clan.members.filter((m) => m.id !== humanId).map((m) => ({ ...m }));
  if (!members.length) {
    delete map[clean];
  } else {
    if (!members.some((m) => m.role === 'leader')) {
      const promote = members.find((m) => m.isAi === false) ?? members[0];
      if (promote) promote.role = 'leader';
    }
    map[clean] = {
      clan: { ...rec.clan, code: clean, members },
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
