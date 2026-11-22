import { computeHero, rollItem, starterGear, type Gear } from '../data/gear';
import type { RarityId, SetId, SlotId } from '../data/types';
import { DEFAULT_LOADOUT, defaultPrimary, skillsForPlaystyle, CLASS_PLAYSTYLES, isUnlocked } from '../data/skills';
import type { HeroClass, SkillId } from '../data/types';
import { HERO_CLASSES } from '../data/types';
import { sanitizePlainText } from '../util/text';
import type { Rng } from './rng';

export const CLAN_CREATE_COST = 500;
export const CLAN_MIN_SIZE = 4;
/** Soft roster cap (UI + AI fill + local leaderboard rivals). */
export const CLAN_MAX_SIZE = 25;
export const TOKEN_WIN = 20;
export const TOKEN_LOSS = 5;
export const TOKEN_DAY_CAP = 200;
export const SEASON_DAYS = 30;
export const SEASON_MS = SEASON_DAYS * 86_400_000;

export type ClanRole = 'leader' | 'officer' | 'member';
/** AI gear quality for solo playtests until live multiplayer. */
export type AiGearTier = 'scaled' | 'endgame';

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
  gear?: Gear;
}

export interface ClanData {
  id: string;
  name: string;
  code: string;
  members: ClanMember[];
}

export interface SeasonData {
  seasonId: number;
  startedAt: number;
}

export function defaultSeason(now = Date.now()): SeasonData {
  return { seasonId: 1, startedAt: now };
}

export function seasonDay(season: SeasonData, now = Date.now()): number {
  const elapsed = Math.max(0, now - season.startedAt);
  return Math.min(SEASON_DAYS, Math.floor(elapsed / 86_400_000) + 1);
}

export function seasonRemainingMs(season: SeasonData, now = Date.now()): number {
  const end = season.startedAt + SEASON_MS;
  return Math.max(0, end - now);
}

export function dayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

const AI_NAMES = [
  'Ashen Blade',
  'Rime Whisper',
  'Quillmark',
  'Nightveil',
  'Cinder Fox',
  'Bone Warden',
  'Echo Step',
  'Void Lark',
  'Spire Hawk',
  'Mire Fang',
];

function makeCode(rng: Rng): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(rng.next() * alphabet.length)];
  return s;
}

export function loadoutForLevel(heroClass: HeroClass, level: number, preferStyle = 0): SkillId[] {
  const styles = CLASS_PLAYSTYLES[heroClass];
  const style = styles[preferStyle % styles.length];
  const unlocked = skillsForPlaystyle(style)
    .filter((s) => isUnlocked(s.id, level))
    .map((s) => s.id);
  if (unlocked.length >= 4) return unlocked.slice(0, 4);
  const fallback = DEFAULT_LOADOUT[heroClass].filter((id) => isUnlocked(id, level));
  const merged = [...new Set([...unlocked, ...fallback])];
  return merged.slice(0, 4);
}

function pickAiRarity(rng: Rng, tier: AiGearTier): RarityId {
  const r = rng.next();
  if (tier === 'endgame') {
    return r > 0.55 ? 'legendary' : 'epic';
  }
  if (r > 0.88) return 'legendary';
  if (r > 0.55) return 'epic';
  if (r > 0.2) return 'rare';
  return 'common';
}

function pickAiSet(rng: Rng, tier: AiGearTier, slot: SlotId): SetId | undefined {
  if (tier === 'endgame') {
    // Mix Nightscar + Clanforged so AI rivals exercise PvP set bonuses in playtests.
    if (rng.next() > 0.45) return 'clanforged';
    return 'nightscar-regalia';
  }
  if (rng.next() > 0.65) return undefined;
  // Light set presence when scaled to the player.
  void slot;
  return rng.next() > 0.5 ? 'nightscar-regalia' : undefined;
}

/** Build AI gear: `scaled` tracks player level; `endgame` uses high GL + sets for practice. */
export function aiGearFor(
  rng: Rng,
  level: number,
  heroClass: HeroClass,
  tier: AiGearTier = 'scaled',
): Gear {
  const gear = starterGear(heroClass);
  const gl =
    tier === 'endgame'
      ? Math.max(18, Math.min(20, Math.max(level, 18)))
      : Math.max(1, Math.min(20, level));
  const slots = Object.keys(gear) as SlotId[];
  for (const slot of slots) {
    const rarity = pickAiRarity(rng, tier);
    const setId = pickAiSet(rng, tier, slot);
    gear[slot] = rollItem(rng, {
      gearLevel: gl,
      rarity,
      slot,
      setId,
      icon: setId === 'clanforged' ? 'k' : setId === 'nightscar-regalia' ? 'j' : undefined,
      heroClass,
    });
  }
  return gear;
}

/** @deprecated Prefer aiGearFor — kept for call-site compatibility. */
export function mockGearFor(rng: Rng, level: number, heroClass: HeroClass): Gear {
  return aiGearFor(rng, level, heroClass, 'scaled');
}

export function buildAiMember(
  rng: Rng,
  heroClass: HeroClass,
  level: number,
  role: ClanRole = 'member',
  tier: AiGearTier = 'scaled',
): ClanMember {
  const gear = aiGearFor(rng, level, heroClass, tier);
  const loadout = loadoutForLevel(heroClass, Math.max(level, tier === 'endgame' ? 18 : level), Math.floor(rng.next() * 2));
  const totals = computeHero(level, gear, heroClass, loadout);
  return {
    id: `ai_${heroClass.toLowerCase()}_${Math.floor(rng.next() * 1e9).toString(36)}`,
    name: rng.pick(AI_NAMES),
    heroClass,
    role,
    isPlayer: false,
    isAi: true,
    level,
    cp: totals.cp,
    loadout,
    primary: defaultPrimary(loadout),
    gear,
  };
}

/** @deprecated Prefer buildAiMember. */
export function buildMockMember(
  rng: Rng,
  heroClass: HeroClass,
  level: number,
  role: ClanRole = 'member',
): ClanMember {
  return buildAiMember(rng, heroClass, level, role, 'scaled');
}

/** Strip tags / control chars from member display names. */
export function sanitizeMemberName(name: string): string {
  return sanitizePlainText(name, 32) || 'Unknown';
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

/** Officers + leaders can kick AI and approve pending joins. */
export function canKickAi(role: ClanRole): boolean {
  return role === 'leader' || role === 'officer';
}

/** Officers + leaders mint invite links / approve pending joins. */
export function canApproveJoins(role: ClanRole): boolean {
  return role === 'leader' || role === 'officer';
}

/** Leaders only: promote / demote roster roles. */
export function canPromoteDemote(role: ClanRole): boolean {
  return role === 'leader';
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
    // Already in this hall (re-join / sync) — refresh snapshot, never kick anyone.
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
    // Ensure a leader exists after replacing an AI leader.
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

/** Remove an AI member by id. Never removes real humans. */
export function kickAiMember(clan: ClanData, aiId: string): { ok: true; clan: ClanData } | { ok: false; error: string } {
  const members = clan.members.map(normalizeClanMember);
  const target = members.find((m) => m.id === aiId);
  if (!target) return { ok: false, error: 'Member not found.' };
  if (!target.isAi || target.isPlayer) return { ok: false, error: 'Can only kick AI fillers.' };
  const next = members.filter((m) => m.id !== aiId);
  if (!next.some((m) => m.role === 'leader')) {
    const promote = next.find((m) => !m.isAi) ?? next[0];
    if (promote) promote.role = 'leader';
  }
  return { ok: true, clan: { ...clan, members: next } };
}

/**
 * Leader promote/demote.
 * - promote: member → officer
 * - demote: officer → member
 * Cannot change the sole leader; cannot promote to leader via this path.
 */
export function setMemberRole(
  clan: ClanData,
  memberId: string,
  role: Exclude<ClanRole, 'leader'>,
): { ok: true; clan: ClanData } | { ok: false; error: string } {
  const members = clan.members.map(normalizeClanMember);
  const idx = members.findIndex((m) => m.id === memberId);
  if (idx < 0) return { ok: false, error: 'Member not found.' };
  const target = members[idx]!;
  if (target.isAi) return { ok: false, error: 'AI fillers have no rank.' };
  if (target.role === 'leader') return { ok: false, error: 'Cannot demote the clan leader here.' };
  if (role === 'officer' && target.role === 'officer') {
    return { ok: true, clan: { ...clan, members } };
  }
  if (role === 'member' && target.role === 'member') {
    return { ok: true, clan: { ...clan, members } };
  }
  const next = members.map((m, i) => (i === idx ? { ...m, role } : m));
  return { ok: true, clan: { ...clan, members: next } };
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
      // AI fillers / rivals on the roster.
      return { ...m, isAi: true, isPlayer: false };
    }),
  };
}

export function createClan(
  rng: Rng,
  name: string,
  player: ClanPlayerSnapshot,
): ClanData {
  const trimmed = sanitizeClanName(name);
  const playerMember = buildHumanMember(player, 'leader', true);
  return {
    id: `clan_${Math.floor(rng.next() * 1e9).toString(36)}`,
    name: trimmed,
    code: makeCode(rng),
    members: [playerMember],
  };
}

/**
 * @deprecated Prefer joining a published hall via admitRealMember.
 * Kept for tests that invent a solo mock hall with an AI leader.
 */
export function joinClanByCode(
  rng: Rng,
  code: string,
  player: ClanPlayerSnapshot,
): ClanData {
  const clean = sanitizeClanCode(code) || makeCode(rng);
  const clan = createClan(rng, `Clan ${clean.slice(0, 4)}`, player);
  clan.code = clean;
  clan.members[0]!.role = 'member';
  const other = HERO_CLASSES.find((c) => c !== player.heroClass) ?? 'Warrior';
  const leader = buildAiMember(rng, other, Math.max(1, player.level - 1), 'leader', 'scaled');
  leader.name = 'Hall Warden';
  clan.members.unshift(leader);
  return clan;
}

export function missingClasses(members: ClanMember[]): HeroClass[] {
  const have = new Set(members.map((m) => m.heroClass));
  return HERO_CLASSES.filter((c) => !have.has(c));
}

export function rosterReady(members: ClanMember[]): boolean {
  if (members.length < CLAN_MIN_SIZE) return false;
  return missingClasses(members).length === 0;
}

/**
 * Auto-fill empty class slots with AI teammates (player class stays human).
 * Enough AI so 4v4 always queues — one of each class.
 */
export function fillAiRoster(
  clan: ClanData,
  rng: Rng,
  playerLevel: number,
  tier: AiGearTier = 'scaled',
): ClanMember[] {
  const added: ClanMember[] = [];
  const missing = missingClasses(clan.members);
  for (const cls of missing) {
    if (clan.members.length + added.length >= CLAN_MAX_SIZE) break;
    const lvl = Math.max(1, playerLevel + Math.floor(rng.next() * 3) - 1);
    added.push(buildAiMember(rng, cls, lvl, 'member', tier));
  }
  while (clan.members.length + added.length < CLAN_MIN_SIZE) {
    const free = HERO_CLASSES.filter((c) => ![...clan.members, ...added].some((m) => m.heroClass === c));
    if (!free.length) break;
    added.push(buildAiMember(rng, free[0], playerLevel, 'member', tier));
  }
  return added;
}

/** @deprecated Prefer fillAiRoster. */
export function recruitForRoster(clan: ClanData, rng: Rng, playerLevel: number): ClanMember[] {
  return fillAiRoster(clan, rng, playerLevel, 'scaled');
}

/** Pick one of each class for the 4v4 queue (player always included; prefer real humans over AI). */
export function pickQueueRoster(members: ClanMember[], playerClass: HeroClass): ClanMember[] | null {
  if (!rosterReady(members)) return null;
  const player = members.find((m) => m.isPlayer);
  if (!player || player.heroClass !== playerClass) return null;
  const team: ClanMember[] = [player];
  for (const cls of HERO_CLASSES) {
    if (cls === playerClass) continue;
    const real = members.find((m) => !m.isPlayer && !m.isAi && m.heroClass === cls);
    const pick = real ?? members.find((m) => !m.isPlayer && m.heroClass === cls);
    if (!pick) return null;
    team.push(pick);
  }
  // Stable class order for UI.
  return HERO_CLASSES.map((c) => team.find((m) => m.heroClass === c)!);
}

export function applyTokenCap(earnedToday: number, gain: number): { awarded: number; earnedToday: number } {
  const room = Math.max(0, TOKEN_DAY_CAP - earnedToday);
  const awarded = Math.min(room, gain);
  return { awarded, earnedToday: earnedToday + awarded };
}

/** Local season ranking score for clan leaderboard (solo stub until live MP). */
export function clanSeasonScore(wins: number, losses: number, tokens: number, members: number): number {
  return Math.max(0, wins * 100 + tokens + members * 8 - losses * 12);
}

export interface ClanLeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  wins: number;
  members: number;
  isPlayer: boolean;
}

const RIVAL_CLANS = [
  'Ashen Pact',
  'Rime Circle',
  'Nightscar Legion',
  'Quillmark Guild',
  'Bone Choir',
  'Spire Hawks',
  'Mire Fang',
  'Void Lark Cohort',
  'Cinder Foxes',
  'Echo Step',
];

/** Deterministic local rival board for the current season + optional player clan. */
export function buildClanLeaderboard(
  seasonId: number,
  player: { name: string; wins: number; losses: number; tokens: number; members: number } | null,
): ClanLeaderboardEntry[] {
  const rivals: ClanLeaderboardEntry[] = RIVAL_CLANS.map((name, i) => {
    const seed = (seasonId * 97 + i * 13) % 1000;
    const wins = 2 + ((seed * 7) % 18);
    const losses = 1 + ((seed * 3) % 12);
    const tokens = 40 + ((seed * 11) % 220);
    const members = CLAN_MIN_SIZE + ((seed * 5) % (CLAN_MAX_SIZE - CLAN_MIN_SIZE + 1));
    return {
      rank: 0,
      name,
      score: clanSeasonScore(wins, losses, tokens, members),
      wins,
      members,
      isPlayer: false,
    };
  });
  if (player) {
    rivals.push({
      rank: 0,
      name: player.name,
      score: clanSeasonScore(player.wins, player.losses, player.tokens, player.members),
      wins: player.wins,
      members: player.members,
      isPlayer: true,
    });
  }
  rivals.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return rivals.map((e, i) => ({ ...e, rank: i + 1 }));
}
