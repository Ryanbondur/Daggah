import type { EnemyRole } from '../data/acts';
import type { HeroClass, Item } from '../data/types';
import type { RaidAlly } from './combat';
import type { PvpDpsEntry, PvpResult } from './pvp';
import { buildDpsBoard } from './pvp';

/** One fallen combatant (enemy KO or ally down) for the post-fight strip. */
export interface FightKoEntry {
  name: string;
  side: 'ally' | 'foe';
  /** Enemy role when known (trash / elite / boss). */
  role?: EnemyRole;
  time: number;
  isPlayer?: boolean;
}

/** Compact last-fight / match summary — Act, dungeon, raid, or PvP. */
export interface FightSummary {
  kind: 'stage' | 'dungeon' | 'clanRaid' | 'pvp';
  title: string;
  success: boolean;
  duration: number;
  /** Hero lives spent (Act) or ally KO count (PvP). */
  deaths: number;
  dpsBoard: PvpDpsEntry[];
  koOrder: FightKoEntry[];
  /** Gear / set pieces from this fight (display snapshot). */
  loot: Item[];
  note?: string;
  /** PvP token payout when applicable. */
  tokens?: number;
}

export interface ActFightAccum {
  damageHero: number;
  /** Per raid-ally id → damage (Clan Raid). */
  allyDamage: Map<string, number>;
  kills: FightKoEntry[];
  allyDowns: FightKoEntry[];
  heroDeaths: number;
  loot: Item[];
}

export function freshActFightAccum(): ActFightAccum {
  return {
    damageHero: 0,
    allyDamage: new Map(),
    kills: [],
    allyDowns: [],
    heroDeaths: 0,
    loot: [],
  };
}

/** Build DPS rows for a solo Act/dungeon hero (and optional raid allies). */
export function buildActDpsBoard(opts: {
  name: string;
  heroClass: HeroClass;
  heroDamage: number;
  duration: number;
  allies?: RaidAlly[];
}): PvpDpsEntry[] {
  const dur = Math.max(0.1, opts.duration);
  const rows: {
    id: string;
    name: string;
    heroClass: HeroClass;
    team: 'ally' | 'enemy';
    isPlayer: boolean;
    isAi: boolean;
    damageDealt: number;
  }[] = [
    {
      id: 'hero',
      name: opts.name,
      heroClass: opts.heroClass,
      team: 'ally',
      isPlayer: true,
      isAi: false,
      damageDealt: opts.heroDamage,
    },
  ];
  for (const a of opts.allies ?? []) {
    if (a.isPlayer) continue;
    rows.push({
      id: a.id,
      name: a.name,
      heroClass: a.heroClass,
      team: 'ally',
      isPlayer: false,
      isAi: a.isAi,
      damageDealt: a.damageDealt,
    });
  }
  return buildDpsBoard(rows, dur);
}

export function summaryFromAct(opts: {
  kind: 'stage' | 'dungeon' | 'clanRaid';
  title: string;
  success: boolean;
  duration: number;
  accum: ActFightAccum;
  heroName: string;
  heroClass: HeroClass;
  allies?: RaidAlly[];
  loot?: Item[];
  note?: string;
}): FightSummary {
  const loot = opts.loot ?? opts.accum.loot;
  const dpsBoard = buildActDpsBoard({
    name: opts.heroName,
    heroClass: opts.heroClass,
    heroDamage: opts.accum.damageHero,
    duration: opts.duration,
    allies: opts.allies,
  });
  const koOrder = [...opts.accum.kills, ...opts.accum.allyDowns].sort((a, b) => a.time - b.time);
  return {
    kind: opts.kind,
    title: opts.title,
    success: opts.success,
    duration: Math.round(opts.duration * 10) / 10,
    deaths: opts.accum.heroDeaths,
    dpsBoard,
    koOrder,
    loot: loot.slice(),
    note: opts.note,
  };
}

/** Map an existing PvP result into the shared last-fight shape (tokens optional). */
export function summaryFromPvp(result: PvpResult, tokens = 0): FightSummary {
  const koOrder: FightKoEntry[] = result.log
    .filter((e) => e.t === 'kill')
    .map((e) => ({
      name: e.target ?? '?',
      side: e.targetTeam === 'enemy' ? 'foe' : 'ally',
      time: e.time,
      isPlayer: e.targetTeam === 'ally' && result.allyTeam.some((a) => a.name === e.target && !a.isAi),
    }));
  return {
    kind: 'pvp',
    title: result.won ? 'Clan Victory' : 'Clan Defeat',
    success: result.won,
    duration: result.duration,
    deaths: result.enemyKills + result.allyKills,
    dpsBoard: result.dpsBoard,
    koOrder,
    loot: [],
    tokens,
    note: result.timedOut ? 'Timed out' : undefined,
  };
}
