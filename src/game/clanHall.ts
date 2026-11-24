/**
 * Local shared clan-hall registry (same-origin storage).
 *
 * Intentional fallback when Postgres `/api/daggah-clan` is unavailable:
 * guests, offline play, and `database_unavailable` / `schema_missing`.
 * Signed-in clients prefer the cloud API (see clanHallCloud.ts); this key
 * still mirrors the last known roster for same-origin multi-save joins.
 *
 * Does not write DG-120 season_stats / clan_results (those come from cloud save).
 */
import type { ClanData, ClanPlayerSnapshot } from './clan';
import {
  admitRealMember,
  buildHumanMember,
  normalizeClanMember,
  sanitizeClanCode,
  sanitizeClanName,
  sanitizeMemberName,
} from './clan';
import type { HeroClass, SkillId } from '../data/types';
import type { Rng } from './rng';
import type { Storage } from './state';

export const CLAN_HALLS_KEY = 'daggah.clanHalls';
export const CLAN_INVITES_KEY = 'daggah.clanInvites';

/** Default officer invite lifetime (24h). */
export const CLAN_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export type ClanHallRecord = {
  clan: ClanData;
  updatedAt: number;
  /** Pending join requests awaiting officer/leader approval. */
  pending?: ClanPendingJoin[];
};

export type ClanPendingJoin = {
  humanId: string;
  name: string;
  heroClass: HeroClass;
  level: number;
  cp: number;
  loadout: SkillId[];
  primary: SkillId | null;
  requestedAt: number;
};

export type ClanInvite = {
  /** One-time token (not the permanent clan code). */
  token: string;
  clanCode: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  /** Starts at 1 for one-time links. */
  usesLeft: number;
};

type HallMap = Record<string, ClanHallRecord>;
type InviteMap = Record<string, ClanInvite>;

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

function readInvites(storage: Storage | undefined): InviteMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CLAN_INVITES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as InviteMap;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeInvites(storage: Storage | undefined, map: InviteMap): void {
  if (!storage) return;
  try {
    storage.setItem(CLAN_INVITES_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

function makeInviteToken(rng: Rng): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'I';
  for (let i = 0; i < 9; i++) s += alphabet[Math.floor(rng.next() * alphabet.length)];
  return s;
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

function pendingFromSnapshot(player: ClanPlayerSnapshot, now: number): ClanPendingJoin {
  return {
    humanId: player.humanId,
    name: sanitizeMemberName(player.name),
    heroClass: player.heroClass,
    level: player.level,
    cp: player.cp,
    loadout: [...player.loadout],
    primary: player.primary,
    requestedAt: now,
  };
}

function snapshotFromPending(p: ClanPendingJoin): ClanPlayerSnapshot {
  return {
    humanId: p.humanId,
    name: p.name,
    heroClass: p.heroClass,
    level: p.level,
    cp: p.cp,
    loadout: [...p.loadout],
    primary: p.primary,
  };
}

/** Publish / overwrite a hall snapshot for join-by-code. Preserves pending queue. */
export function publishClanHall(storage: Storage | undefined, clan: ClanData, now = Date.now()): void {
  const snap = hallSnapshot(clan);
  if (!snap.code) return;
  const map = readMap(storage);
  const prev = map[snap.code];
  map[snap.code] = {
    clan: snap,
    updatedAt: now,
    pending: prev?.pending?.filter((p) => !snap.members.some((m) => m.id === p.humanId)) ?? [],
  };
  writeMap(storage, map);
}

export function lookupClanHall(storage: Storage | undefined, code: string): ClanData | null {
  const clean = sanitizeClanCode(code);
  if (!clean) return null;
  const rec = readMap(storage)[clean];
  if (!rec?.clan) return null;
  return hallSnapshot(rec.clan);
}

export function lookupClanHallRecord(
  storage: Storage | undefined,
  code: string,
): ClanHallRecord | null {
  const clean = sanitizeClanCode(code);
  if (!clean) return null;
  const rec = readMap(storage)[clean];
  if (!rec?.clan) return null;
  return {
    clan: hallSnapshot(rec.clan),
    updatedAt: rec.updatedAt,
    pending: [...(rec.pending ?? [])],
  };
}

export function listPendingJoins(storage: Storage | undefined, code: string): ClanPendingJoin[] {
  return lookupClanHallRecord(storage, code)?.pending ?? [];
}

/**
 * Request to join (pending officer approval). Does not admit.
 * No-op / error if already a member or already pending.
 */
export function requestClanJoin(
  storage: Storage | undefined,
  code: string,
  player: ClanPlayerSnapshot,
  now = Date.now(),
): { ok: true } | { ok: false; error: string } {
  const clean = sanitizeClanCode(code);
  if (!clean) return { ok: false, error: 'Enter a clan code.' };
  const map = readMap(storage);
  const rec = map[clean];
  if (!rec?.clan) return { ok: false, error: 'No clan with that code. Ask an officer for an invite.' };
  const clan = hallSnapshot(rec.clan);
  if (clan.members.some((m) => m.id === player.humanId)) {
    return { ok: false, error: 'Already in this clan.' };
  }
  const pending = [...(rec.pending ?? [])];
  if (pending.some((p) => p.humanId === player.humanId)) {
    return { ok: false, error: 'Join request already pending.' };
  }
  pending.push(pendingFromSnapshot(player, now));
  map[clean] = { ...rec, clan, pending, updatedAt: now };
  writeMap(storage, map);
  return { ok: true };
}

/** Officer/leader admits a pending join (class-priority AI replace). */
export function approvePendingJoin(
  storage: Storage | undefined,
  code: string,
  humanId: string,
  now = Date.now(),
): { ok: true; clan: ClanData; replacedAiName: string | null } | { ok: false; error: string } {
  const clean = sanitizeClanCode(code);
  if (!clean) return { ok: false, error: 'Invalid clan code.' };
  const map = readMap(storage);
  const rec = map[clean];
  if (!rec?.clan) return { ok: false, error: 'Clan hall not found.' };
  const pending = [...(rec.pending ?? [])];
  const idx = pending.findIndex((p) => p.humanId === humanId);
  if (idx < 0) return { ok: false, error: 'No pending request for that player.' };
  const req = pending[idx]!;
  const result = admitRealMember(hallSnapshot(rec.clan), snapshotFromPending(req));
  if (!result.ok) return { ok: false, error: result.error };
  pending.splice(idx, 1);
  map[clean] = {
    clan: hallSnapshot(result.clan),
    updatedAt: now,
    pending,
  };
  writeMap(storage, map);
  return {
    ok: true,
    clan: result.clan,
    replacedAiName: result.replacedAi?.name ?? null,
  };
}

export function denyPendingJoin(
  storage: Storage | undefined,
  code: string,
  humanId: string,
  now = Date.now(),
): { ok: true } | { ok: false; error: string } {
  const clean = sanitizeClanCode(code);
  if (!clean) return { ok: false, error: 'Invalid clan code.' };
  const map = readMap(storage);
  const rec = map[clean];
  if (!rec) return { ok: false, error: 'Clan hall not found.' };
  const pending = (rec.pending ?? []).filter((p) => p.humanId !== humanId);
  if (pending.length === (rec.pending ?? []).length) {
    return { ok: false, error: 'No pending request for that player.' };
  }
  map[clean] = { ...rec, pending, updatedAt: now };
  writeMap(storage, map);
  return { ok: true };
}

/** Mint a one-time officer invite link (token + expiry). */
export function createClanInvite(
  storage: Storage | undefined,
  clanCode: string,
  createdBy: string,
  rng: Rng,
  opts?: { ttlMs?: number; now?: number },
): { ok: true; invite: ClanInvite } | { ok: false; error: string } {
  const clean = sanitizeClanCode(clanCode);
  if (!clean) return { ok: false, error: 'Invalid clan code.' };
  if (!lookupClanHall(storage, clean)) return { ok: false, error: 'Publish the clan hall first.' };
  const now = opts?.now ?? Date.now();
  const ttl = opts?.ttlMs ?? CLAN_INVITE_TTL_MS;
  const invites = readInvites(storage);
  // Prune expired / spent.
  for (const [tok, inv] of Object.entries(invites)) {
    if (inv.usesLeft <= 0 || inv.expiresAt <= now) delete invites[tok];
  }
  let token = makeInviteToken(rng);
  let guard = 0;
  while (invites[token] && guard++ < 8) token = makeInviteToken(rng);
  const invite: ClanInvite = {
    token,
    clanCode: clean,
    createdBy,
    createdAt: now,
    expiresAt: now + ttl,
    usesLeft: 1,
  };
  invites[token] = invite;
  writeInvites(storage, invites);
  return { ok: true, invite };
}

export function sanitizeInviteToken(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

export function lookupClanInvite(
  storage: Storage | undefined,
  token: string,
  now = Date.now(),
): ClanInvite | null {
  const clean = sanitizeInviteToken(token);
  if (!clean) return null;
  const inv = readInvites(storage)[clean];
  if (!inv) return null;
  if (inv.usesLeft <= 0 || inv.expiresAt <= now) return null;
  return { ...inv };
}

/** Consume a one-time invite (call after successful admit). */
export function consumeClanInvite(
  storage: Storage | undefined,
  token: string,
  now = Date.now(),
): void {
  const clean = sanitizeInviteToken(token);
  if (!clean) return;
  const invites = readInvites(storage);
  const inv = invites[clean];
  if (!inv) return;
  inv.usesLeft = Math.max(0, inv.usesLeft - 1);
  if (inv.usesLeft <= 0 || inv.expiresAt <= now) delete invites[clean];
  else invites[clean] = inv;
  writeInvites(storage, invites);
}

/**
 * Resolve join input: permanent clan code OR one-time invite token.
 * Invite tokens are longer and typically start with `I`.
 */
export function resolveJoinTarget(
  storage: Storage | undefined,
  raw: string,
  now = Date.now(),
):
  | { kind: 'code'; code: string }
  | { kind: 'invite'; invite: ClanInvite; code: string }
  | { kind: 'error'; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'error', error: 'Enter a clan code or invite link.' };

  const inviteTok = sanitizeInviteToken(trimmed);
  const inv = inviteTok.length >= 8 ? lookupClanInvite(storage, inviteTok, now) : null;
  if (inv) return { kind: 'invite', invite: inv, code: inv.clanCode };

  // Explicit invite-shaped token that failed lookup.
  if (/^I[A-Z0-9]{8,}$/i.test(trimmed)) {
    const spent = readInvites(storage)[inviteTok];
    if (spent && spent.expiresAt <= now) return { kind: 'error', error: 'Invite link expired.' };
    if (spent && spent.usesLeft <= 0) return { kind: 'error', error: 'Invite link already used.' };
    return { kind: 'error', error: 'Invite link not found or expired.' };
  }

  const code = sanitizeClanCode(trimmed);
  if (!code) return { kind: 'error', error: 'Enter a clan code or invite link.' };
  return { kind: 'code', code };
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
  const pending = (rec.pending ?? []).filter((p) => p.humanId !== humanId);
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
      pending,
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
  // Drop invites pointing at this hall.
  const invites = readInvites(storage);
  let dirty = false;
  for (const [tok, inv] of Object.entries(invites)) {
    if (inv.clanCode === clean) {
      delete invites[tok];
      dirty = true;
    }
  }
  if (dirty) writeInvites(storage, invites);
}

/** @internal test helper — build a pending row without storage. */
export function pendingJoinFromPlayer(player: ClanPlayerSnapshot, now = Date.now()): ClanPendingJoin {
  return pendingFromSnapshot(player, now);
}

/** @internal — re-export for callers that assemble human seats after approve. */
export { buildHumanMember };
