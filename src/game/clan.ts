import { computeHero, rollItem, starterGear, type Gear } from '../data/gear';
import { DEFAULT_LOADOUT, defaultPrimary, skillsForPlaystyle, CLASS_PLAYSTYLES, isUnlocked } from '../data/skills';
import type { HeroClass, SkillId } from '../data/types';
import { HERO_CLASSES } from '../data/types';
import type { Rng } from './rng';

export const CLAN_CREATE_COST = 500;
export const CLAN_MIN_SIZE = 4;
export const CLAN_MAX_SIZE = 20;
export const TOKEN_WIN = 20;
export const TOKEN_LOSS = 5;
export const TOKEN_DAY_CAP = 200;
export const SEASON_DAYS = 30;
export const SEASON_MS = SEASON_DAYS * 86_400_000;

export type ClanRole = 'leader' | 'officer' | 'member';

export interface ClanMember {
  id: string;
  name: string;
  heroClass: HeroClass;
  role: ClanRole;
  isPlayer: boolean;
  level: number;
  /** Snapshot CP for UI / matchmaking display. */
  cp: number;
  loadout: SkillId[];
  primary: SkillId | null;
  /** Mock members keep a gear snapshot for PvP; player uses live save gear. */
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

const MOCK_NAMES = [
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

export function mockGearFor(rng: Rng, level: number, heroClass: HeroClass): Gear {
  const gear = starterGear(heroClass);
  const gl = Math.max(1, Math.min(20, level));
  const slots = Object.keys(gear) as (keyof Gear)[];
  for (const slot of slots) {
    const rarityRoll = rng.next();
    const rarity = rarityRoll > 0.92 ? 'legendary' : rarityRoll > 0.7 ? 'epic' : rarityRoll > 0.35 ? 'rare' : 'common';
    gear[slot] = rollItem(rng, { gearLevel: gl, rarity, slot });
  }
  return gear;
}

export function buildMockMember(
  rng: Rng,
  heroClass: HeroClass,
  level: number,
  role: ClanRole = 'member',
): ClanMember {
  const gear = mockGearFor(rng, level, heroClass);
  const totals = computeHero(level, gear, heroClass);
  const loadout = loadoutForLevel(heroClass, level, Math.floor(rng.next() * 2));
  return {
    id: `npc_${heroClass.toLowerCase()}_${Math.floor(rng.next() * 1e9).toString(36)}`,
    name: rng.pick(MOCK_NAMES),
    heroClass,
    role,
    isPlayer: false,
    level,
    cp: totals.cp,
    loadout,
    primary: defaultPrimary(loadout),
    gear,
  };
}

export function createClan(
  rng: Rng,
  name: string,
  player: { heroClass: HeroClass; level: number; cp: number; loadout: SkillId[]; primary: SkillId | null },
): ClanData {
  const trimmed = name.trim().slice(0, 24) || 'Nameless Clan';
  const playerMember: ClanMember = {
    id: 'player',
    name: 'You',
    heroClass: player.heroClass,
    role: 'leader',
    isPlayer: true,
    level: player.level,
    cp: player.cp,
    loadout: [...player.loadout],
    primary: player.primary,
  };
  return {
    id: `clan_${Math.floor(rng.next() * 1e9).toString(36)}`,
    name: trimmed,
    code: makeCode(rng),
    members: [playerMember],
  };
}

/** Join by code — local mock: any code opens/creates a hall with that banner. */
export function joinClanByCode(
  rng: Rng,
  code: string,
  player: { heroClass: HeroClass; level: number; cp: number; loadout: SkillId[]; primary: SkillId | null },
): ClanData {
  const clean = code.trim().toUpperCase().slice(0, 8) || makeCode(rng);
  const clan = createClan(rng, `Clan ${clean.slice(0, 4)}`, player);
  clan.code = clean;
  clan.members[0].role = 'member';
  // Prefill mock leader of a different class when possible.
  const other = HERO_CLASSES.find((c) => c !== player.heroClass) ?? 'Warrior';
  const leader = buildMockMember(rng, other, Math.max(1, player.level - 1), 'leader');
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

/** Fill empty class slots with mock recruits (up to clan max). */
export function recruitForRoster(clan: ClanData, rng: Rng, playerLevel: number): ClanMember[] {
  const added: ClanMember[] = [];
  const missing = missingClasses(clan.members);
  for (const cls of missing) {
    if (clan.members.length + added.length >= CLAN_MAX_SIZE) break;
    const m = buildMockMember(rng, cls, Math.max(1, playerLevel + Math.floor(rng.next() * 3) - 1));
    added.push(m);
  }
  // Pad to min size with random extras if still short (duplicate classes not allowed for queue).
  while (clan.members.length + added.length < CLAN_MIN_SIZE) {
    const free = HERO_CLASSES.filter((c) => ![...clan.members, ...added].some((m) => m.heroClass === c));
    if (!free.length) break;
    added.push(buildMockMember(rng, free[0], playerLevel));
  }
  return added;
}

/** Pick one of each class for the 4v4 queue (player always included). */
export function pickQueueRoster(members: ClanMember[], playerClass: HeroClass): ClanMember[] | null {
  if (!rosterReady(members)) return null;
  const player = members.find((m) => m.isPlayer);
  if (!player || player.heroClass !== playerClass) return null;
  const team: ClanMember[] = [player];
  for (const cls of HERO_CLASSES) {
    if (cls === playerClass) continue;
    const pick = members.find((m) => !m.isPlayer && m.heroClass === cls);
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
