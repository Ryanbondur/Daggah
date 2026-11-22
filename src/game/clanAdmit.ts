/**
 * Pure clan-roster admit helpers (no gear/AI generators).
 * Shared by client halls and the Postgres clan-hall API — keep merge-friendly.
 */
import type { HeroClass, SkillId } from '../data/types';
import { sanitizePlainText } from '../util/text';

export const CLAN_MAX_SIZE = 25;

export type ClanRole = 'leader' | 'officer' | 'member';

export interface ClanMember {
  id: string;
  name: string;
  heroClass: HeroClass;
  role: ClanRole;
  isPlayer: boolean;
  /** True for bot/AI fillers and rivals (not human multiplayer). */
  isAi: boolean;
  level: number;
  /** Snapshot CP for UI / matchmaking display. */
  cp: number;
  loadout: SkillId[];
  primary: SkillId | null;
  /** AI members keep a gear snapshot for PvP; player uses live save gear. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gear?: any;
}

export interface ClanData {
  id: string;
  name: string;
  code: string;
  members: ClanMember[];
}

export type ClanPlayerSnapshot = {
  heroClass: HeroClass;
  level: number;
  cp: number;
  loadout: SkillId[];
  primary: SkillId | null;
  /** Stable id across devices/saves for this human in shared halls. */
  humanId: string;
  /** Display name (auth username or "You"). */
  name: string;
};

/** Strip tags / control chars from member display names. */
export function sanitizeMemberName(name: string): string {
  return sanitizePlainText(name, 32) || 'Unknown';
}

/** Strip tags / control chars from clan name before storage. */
export function sanitizeClanName(name: string): string {
  return sanitizePlainText(name, 24) || 'Nameless Clan';
}

/** Normalize join codes to safe alphanumerics. */
export function sanitizeClanCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

/** Normalize older saves that lack `isAi`; sanitize display strings. */
export function normalizeClanMember(m: ClanMember): ClanMember {
  return {
    ...m,
    name: sanitizeMemberName(typeof m.name === 'string' ? m.name : 'Unknown'),
    role: (['leader', 'officer', 'member'] as const).includes(m.role as ClanRole)
      ? (m.role as ClanRole)
      : 'member',
    isAi: m.isPlayer ? false : m.isAi !== false,
  };
}

/** Build a real (non-AI) clan member. `isPlayer` is set by the local save view. */
export function buildHumanMember(
  player: ClanPlayerSnapshot,
  role: ClanRole = 'member',
  isPlayer = false,
): ClanMember {
  return {
    id: player.humanId,
    name: sanitizeMemberName(player.name),
    heroClass: player.heroClass,
    role,
    isPlayer,
    isAi: false,
    level: player.level,
    cp: player.cp,
    loadout: [...player.loadout],
    primary: player.primary,
  };
}

/** Sort AI candidates: lowest CP, then lowest level, then id. */
function sortAiWeakestFirst(ais: ClanMember[]): ClanMember[] {
  return [...ais].sort((a, b) => a.cp - b.cp || a.level - b.level || a.id.localeCompare(b.id));
}

/**
 * Weakest AI for real-player replacement: lowest CP, then lowest level, then id.
 * Never returns a real (non-AI) member.
 */
export function findWeakestAiMember(members: ClanMember[]): ClanMember | null {
  const ais = members.filter((m) => m.isAi && !m.isPlayer);
  if (!ais.length) return null;
  return sortAiWeakestFirst(ais)[0] ?? null;
}

/**
 * Pick an AI seat to replace on real join.
 * Prefer redundant-class AI (joiner's class first, then any class with 2+ seats)
 * before falling back to lowest CP — keeps 4v4 class coverage without an extra Fill.
 * Never returns a real (non-AI) member.
 */
export function findAiToReplace(members: ClanMember[], joinerClass: HeroClass): ClanMember | null {
  const ais = members.filter((m) => m.isAi && !m.isPlayer);
  if (!ais.length) return null;

  const sameClass = sortAiWeakestFirst(ais.filter((a) => a.heroClass === joinerClass));
  if (sameClass.length) return sameClass[0]!;

  const classCounts = new Map<HeroClass, number>();
  for (const m of members) {
    classCounts.set(m.heroClass, (classCounts.get(m.heroClass) ?? 0) + 1);
  }
  const redundant = sortAiWeakestFirst(
    ais.filter((a) => (classCounts.get(a.heroClass) ?? 0) > 1),
  );
  if (redundant.length) return redundant[0]!;

  return sortAiWeakestFirst(ais)[0] ?? null;
}

export type AdmitRealResult =
  | { ok: true; clan: ClanData; replacedAi: ClanMember | null; added: ClanMember }
  | { ok: false; error: string };

/**
 * Admit a real player into an existing clan hall.
 * - If any AI remain: replace class-priority AI (redundant class → lowest CP). Never kicks reals.
 * - Else if under CLAN_MAX_SIZE: append.
 * - Else: clan full.
 */
export function admitRealMember(clan: ClanData, player: ClanPlayerSnapshot): AdmitRealResult {
  const members = clan.members.map(normalizeClanMember);
  const existingIdx = members.findIndex((m) => m.id === player.humanId);
  if (existingIdx >= 0) {
    const existing = members[existingIdx]!;
    const updated = buildHumanMember(
      player,
      existing.role === 'leader' ? 'leader' : existing.role,
      true,
    );
    const next = members.map((m, i) => (i === existingIdx ? updated : { ...m, isPlayer: false }));
    return { ok: true, clan: { ...clan, members: next }, replacedAi: null, added: updated };
  }

  const human = buildHumanMember(player, 'member', true);
  const victim = findAiToReplace(members, player.heroClass);
  if (victim) {
    const next = members.map((m) => {
      if (m.id !== victim.id) return { ...m, isPlayer: false };
      return human;
    });
    if (victim.role === 'leader' && !next.some((m) => m.role === 'leader')) {
      const promote = next.find((m) => !m.isAi) ?? next[0];
      if (promote) promote.role = 'leader';
    }
    return { ok: true, clan: { ...clan, members: next }, replacedAi: victim, added: human };
  }
  if (members.length >= CLAN_MAX_SIZE) {
    return { ok: false, error: `Clan is full (${CLAN_MAX_SIZE}/${CLAN_MAX_SIZE}).` };
  }
  return {
    ok: true,
    clan: { ...clan, members: [...members.map((m) => ({ ...m, isPlayer: false })), human] },
    replacedAi: null,
    added: human,
  };
}

/** Mark which member is the local player for this save view. */
export function viewClanForHuman(clan: ClanData, humanId: string): ClanData {
  return {
    ...clan,
    members: clan.members.map(normalizeClanMember).map((m) => {
      const isLocal = m.id === humanId;
      if (isLocal || m.isAi === false) {
        return { ...m, isAi: false, isPlayer: isLocal };
      }
      return { ...m, isAi: true, isPlayer: false };
    }),
  };
}

/** Snapshot for the shared hall: strip local isPlayer; keep isAi false for humans. */
export function hallSnapshot(clan: ClanData): ClanData {
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

/** Remove a human seat; promote a real (else any) member to leader if needed. */
export function removeHumanFromClan(clan: ClanData, humanId: string): ClanData | null {
  const members = clan.members
    .map(normalizeClanMember)
    .filter((m) => m.id !== humanId)
    .map((m) => ({ ...m, isPlayer: false }));
  if (!members.length) return null;
  if (!members.some((m) => m.role === 'leader')) {
    const promote = members.find((m) => m.isAi === false) ?? members[0];
    if (promote) promote.role = 'leader';
  }
  return {
    id: clan.id,
    name: sanitizeClanName(clan.name),
    code: sanitizeClanCode(clan.code),
    members,
  };
}

export function humanIdForUser(userId: string): string {
  return `human_${userId}`;
}
