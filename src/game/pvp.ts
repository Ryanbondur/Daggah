import { computeHero, type Gear, type SetEffects } from '../data/gear';
import { DEFAULT_LOADOUT, SKILL_BY_ID, defaultPrimary } from '../data/skills';
import type { HeroClass, SkillId, Stats } from '../data/types';
import { HERO_CLASSES } from '../data/types';
import { maxEnergy } from '../data/xp';
import type { ClanMember } from './clan';
import { buildAiMember } from './clan';
import type { ClanBracketId } from './clanBrackets';
import { MATCH_CP_BANDS, matchCpBandForQueue, PRACTICE_MATCH_WAIT_S } from './clanBrackets';
import type { Rng } from './rng';

/** Sim clock timeout (seconds). Tuned for longer, readable 4v4s. */
export const PVP_TIMEOUT_S = 150;
export const PVP_KILL_TARGET = 4;
/** Extra HP on all fighters so trades last longer without feeling spongy. */
export const PVP_HP_MUL = 1.85;
/** Global outgoing damage scale (skills + autos). */
export const PVP_DMG_MUL = 0.68;
/** Basic swing cadence (seconds between autos). */
export const PVP_SWING_S = 1.55;
/** Ultimate skill multiplier (was 2.4). */
export const PVP_ULT_MUL = 2.0;

export interface PvpFighter {
  id: string;
  name: string;
  team: 'ally' | 'enemy';
  heroClass: HeroClass;
  level: number;
  isAi: boolean;
  isPlayer: boolean;
  stats: Stats;
  effects: SetEffects;
  loadout: SkillId[];
  primary: SkillId | null;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  cd: Partial<Record<SkillId, number>>;
  swingT: number;
  dead: boolean;
  x: number;
  /** Cumulative damage dealt this match (for DPS board / MVP). */
  damageDealt: number;
}

export interface PvpEvent {
  t: 'hit' | 'skill' | 'kill' | 'end';
  text: string;
  time: number;
  /** Structured fields for the post-match replay strip. */
  actor?: string;
  actorClass?: HeroClass;
  team?: 'ally' | 'enemy';
  skillId?: SkillId;
  skillName?: string;
  target?: string;
  targetTeam?: 'ally' | 'enemy';
  dmg?: number;
  crit?: boolean;
}

/** Initial arena layout for Phaser stage playback (presentation only). */
export interface PvpFighterSnap {
  id: string;
  name: string;
  team: 'ally' | 'enemy';
  heroClass: HeroClass;
  maxHp: number;
  x: number;
  isAi: boolean;
  isPlayer: boolean;
}

/** Ranked damage entry for mid-fight HUD + post-match MVP board. */
export interface PvpDpsEntry {
  id: string;
  name: string;
  heroClass: HeroClass;
  team: 'ally' | 'enemy';
  isPlayer: boolean;
  isAi: boolean;
  damage: number;
  /** Damage / duration (0 if fight just started). */
  dps: number;
  /** 1-based rank among all eight fighters by damage. */
  rank: number;
}

export interface PvpResult {
  won: boolean;
  allyKills: number;
  enemyKills: number;
  duration: number;
  timedOut: boolean;
  /** Filtered cast/kill strip for the post-fight breakdown modal. */
  log: PvpEvent[];
  /** Full timed log (incl. hits) for visual stage playback. */
  playback: PvpEvent[];
  /** Starting lineup + lane positions for the stage. */
  fighters: PvpFighterSnap[];
  allyHpLeft: number;
  enemyHpLeft: number;
  allyTeam: { name: string; heroClass: HeroClass; hp: number; maxHp: number; isAi: boolean }[];
  enemyTeam: { name: string; heroClass: HeroClass; hp: number; maxHp: number; isAi: boolean }[];
  /** True when this match used AI fillers / AI rivals (solo playtest). */
  practiceAi: boolean;
  /** Match bracket (natural or challenge-up). */
  bracket: ClanBracketId;
  /** True when this match used the daily challenge-up. */
  challengeUp: boolean;
  /** Ally team CP sum used for bracket assignment. */
  teamCp: number;
  /** Ranked DPS board (all fighters, damage desc). */
  dpsBoard: PvpDpsEntry[];
  /** Highest-damage ally (MVP). Null only if ally team dealt 0. */
  mvp: PvpDpsEntry | null;
  /** Matchmaking band label used to seed rivals (e.g. ±8% CP). */
  matchBandLabel: string;
}

function scaleStats(stats: Stats, pct: number): Stats {
  if (pct <= 0) return { ...stats };
  const m = 1 + pct / 100;
  return {
    atk: Math.round(stats.atk * m),
    def: Math.round(stats.def * m),
    hp: Math.round(stats.hp * m),
    critRate: stats.critRate,
    critDmg: stats.critDmg,
    skillPower: stats.skillPower,
    haste: stats.haste,
    energyRegen: stats.energyRegen,
  };
}

function fighterFromMember(
  m: ClanMember,
  team: 'ally' | 'enemy',
  liveGear: Gear | undefined,
  liveLevel: number | undefined,
  rng: Rng,
): PvpFighter {
  const level = m.isPlayer && liveLevel != null ? liveLevel : m.level;
  const gear =
    m.isPlayer && liveGear
      ? liveGear
      : m.gear ?? buildAiMember(rng, m.heroClass, level, 'member', team === 'enemy' ? 'endgame' : 'scaled').gear!;
  const loadout = (m.isPlayer ? m.loadout : m.loadout.length ? m.loadout : DEFAULT_LOADOUT[m.heroClass]).slice(0, 4);
  const totals = computeHero(level, gear, m.heroClass, loadout);
  const stats = scaleStats(totals.stats, totals.effects.pvpCpPct);
  const primary = m.primary && loadout.includes(m.primary) ? m.primary : defaultPrimary(loadout);
  const maxEn = maxEnergy(level);
  // Spread lanes across the short portrait stage band (allies left / foes right).
  const lane = HERO_CLASSES.indexOf(m.heroClass);
  const x = team === 'ally' ? 0.1 + lane * 0.1 : 0.6 + lane * 0.1;
  const isAi = m.isPlayer ? false : m.isAi !== false;
  const maxHp = Math.round(stats.hp * PVP_HP_MUL);
  return {
    id: `${team}_${m.id}`,
    name: m.name,
    team,
    heroClass: m.heroClass,
    level,
    isAi,
    isPlayer: !!m.isPlayer,
    stats,
    effects: totals.effects,
    loadout,
    primary,
    hp: maxHp,
    maxHp,
    energy: maxEn * 0.6,
    maxEnergy: maxEn,
    cd: {},
    swingT: 0.3 + rng.next() * 0.5,
    dead: false,
    x,
    damageDealt: 0,
  };
}

export interface BuildOpponentOpts {
  /** Half-width band as fraction of avgCp (e.g. 0.08 → ±8%). Default: practice tight band. */
  bandPct?: number;
}

/**
 * Enemy clan for 4v4 practice: one of each class with endgame/testing gear,
 * CP nudged toward the ally average within the matchmaking band.
 */
export function buildOpponentRoster(
  rng: Rng,
  ally: ClanMember[],
  avgCp: number,
  opts?: BuildOpponentOpts,
): ClanMember[] {
  const bandPct = opts?.bandPct ?? MATCH_CP_BANDS[0]!.pct;
  const lo = 1 - bandPct;
  const span = bandPct * 2;
  const team: ClanMember[] = [];
  for (const cls of HERO_CLASSES) {
    const mirror = ally.find((m) => m.heroClass === cls);
    const baseLevel = Math.max(
      1,
      Math.min(20, Math.max(mirror?.level ?? 10, Math.round(avgCp > 0 ? 12 : 10)) + Math.floor(rng.next() * 3) - 1),
    );
    // Prefer endgame kit when allies are mid/high CP or high level; else scale down.
    const useEndgame = avgCp >= 600 || baseLevel >= 12;
    let m = buildAiMember(rng, cls, useEndgame ? Math.max(baseLevel, 16) : baseLevel, 'member', useEndgame ? 'endgame' : 'scaled');
    const target = avgCp * (lo + rng.next() * span);
    if (m.cp > 0 && target > 0) {
      const ratio = target / m.cp;
      const gl = Math.max(1, Math.min(20, Math.round(m.level * Math.sqrt(Math.max(0.5, ratio)))));
      const tier = gl >= 16 || useEndgame ? 'endgame' : 'scaled';
      m = buildAiMember(rng, cls, gl, 'member', tier);
    }
    m.name = `AI Rival ${cls}`;
    team.push(m);
  }
  return team;
}

function skillMul(id: SkillId): number {
  const def = SKILL_BY_ID[id];
  if (def.passive) return 1;
  if (def.ultimate) return PVP_ULT_MUL;
  return 1.28 + Math.min(1.05, def.energy / 420);
}

function skillCost(f: PvpFighter, id: SkillId): number {
  const def = SKILL_BY_ID[id];
  const pct = f.effects.skillCostPct[id] ?? 0;
  const ultPct = def.ultimate ? f.effects.ultimateCostPct : 0;
  return Math.round(def.energy * (1 - pct / 100) * (1 - ultPct / 100));
}

function skillCd(f: PvpFighter, id: SkillId): number {
  const minus = f.effects.skillCdMinus[id] ?? 0;
  const base = Math.max(1, SKILL_BY_ID[id].cd - minus);
  const pct = f.effects.globalCdPct;
  return pct > 0 ? Math.max(1, base * (1 - pct / 100)) : base;
}

function dealDamage(attacker: PvpFighter, target: PvpFighter, mul: number, rng: Rng): { dmg: number; crit: boolean } {
  const raw = attacker.stats.atk * mul * (0.95 + rng.next() * 0.1);
  const sp = 1 + attacker.stats.skillPower / 100;
  let dmg = raw * (mul > 1.05 ? sp : 1);
  const critChance = Math.min(0.75, attacker.stats.critRate / 100);
  const crit = rng.next() < critChance;
  if (crit) dmg *= Math.max(1.2, attacker.stats.critDmg / 100);
  const mitigated = Math.max(1, dmg * (100 / (100 + target.stats.def * 0.95)));
  const ultBonus = mul >= 2 ? 1 + attacker.effects.ultimateDmgPct / 100 : 1;
  const final = Math.round(mitigated * ultBonus * (1 + attacker.effects.aoePct / 200) * PVP_DMG_MUL);
  target.hp = Math.max(0, target.hp - final);
  attacker.damageDealt += final;
  return { dmg: final, crit };
}

/** Build ranked DPS board from fighter damage totals. */
export function buildDpsBoard(
  fighters: { id: string; name: string; heroClass: HeroClass; team: 'ally' | 'enemy'; isPlayer: boolean; isAi: boolean; damageDealt: number }[],
  duration: number,
): PvpDpsEntry[] {
  const dur = Math.max(0.1, duration);
  const sorted = [...fighters].sort((a, b) => b.damageDealt - a.damageDealt || a.name.localeCompare(b.name));
  return sorted.map((f, i) => ({
    id: f.id,
    name: f.name,
    heroClass: f.heroClass,
    team: f.team,
    isPlayer: f.isPlayer,
    isAi: f.isAi,
    damage: f.damageDealt,
    dps: Math.round((f.damageDealt / dur) * 10) / 10,
    rank: i + 1,
  }));
}

/** Live DPS totals from playback events already applied (HUD). */
export function dpsBoardFromPlayback(
  fighters: PvpFighterSnap[],
  playback: PvpEvent[],
  throughIdx: number,
  elapsed: number,
): PvpDpsEntry[] {
  const dmg = new Map<string, number>();
  for (const f of fighters) dmg.set(`${f.team}|${f.name}`, 0);
  const end = Math.min(throughIdx, playback.length);
  for (let i = 0; i < end; i++) {
    const ev = playback[i]!;
    if ((ev.t !== 'hit' && ev.t !== 'skill') || ev.dmg == null || !ev.actor || !ev.team) continue;
    const key = `${ev.team}|${ev.actor}`;
    dmg.set(key, (dmg.get(key) ?? 0) + ev.dmg);
  }
  return buildDpsBoard(
    fighters.map((f) => ({
      id: f.id,
      name: f.name,
      heroClass: f.heroClass,
      team: f.team,
      isPlayer: f.isPlayer,
      isAi: f.isAi,
      damageDealt: dmg.get(`${f.team}|${f.name}`) ?? 0,
    })),
    elapsed,
  );
}

/**
 * Client-local 4v4 auto-battle (GDD §10).
 * Fight until 4 kills or timeout; timeout → higher remaining HP wins.
 */
export function simulatePvp(
  allyRoster: ClanMember[],
  enemyRoster: ClanMember[],
  playerGear: Gear,
  playerLevel: number,
  rng: Rng,
  meta: {
    bracket: ClanBracketId;
    challengeUp: boolean;
    teamCp: number;
    matchBandLabel?: string;
    /** True for cross-device peer matches (AI roster fillers allowed; rivals are real). */
    liveMatch?: boolean;
  } = {
    bracket: 'veteran',
    challengeUp: false,
    teamCp: 0,
  },
): PvpResult {
  const fighters: PvpFighter[] = [
    ...allyRoster.map((m) => fighterFromMember(m, 'ally', playerGear, playerLevel, rng)),
    ...enemyRoster.map((m) => fighterFromMember(m, 'enemy', undefined, undefined, rng)),
  ];
  const log: PvpEvent[] = [];
  let allyKills = 0;
  let enemyKills = 0;
  let time = 0;
  const dt = 0.25;

  const living = (team: 'ally' | 'enemy') => fighters.filter((f) => f.team === team && !f.dead);
  const opponents = (f: PvpFighter) => living(f.team === 'ally' ? 'enemy' : 'ally');

  while (time < PVP_TIMEOUT_S && allyKills < PVP_KILL_TARGET && enemyKills < PVP_KILL_TARGET) {
    time += dt;
    for (const f of fighters) {
      if (f.dead) continue;
      f.energy = Math.min(f.maxEnergy, f.energy + (8 + f.stats.energyRegen) * (1 + f.effects.energyRegenPct / 100) * dt);
      for (const id of Object.keys(f.cd) as SkillId[]) {
        f.cd[id] = Math.max(0, (f.cd[id] ?? 0) - dt);
      }
      f.swingT -= dt * (1 + f.stats.haste / 100 + f.effects.hastePct / 100);

      const foes = opponents(f);
      if (!foes.length) continue;
      foes.sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x));
      const target = foes[0];

      // Skill AI: primary if ready and energy, else first ready active.
      let cast: SkillId | null = null;
      const prim = f.primary;
      if (prim && SKILL_BY_ID[prim] && !SKILL_BY_ID[prim].passive) {
        if ((f.cd[prim] ?? 0) <= 0 && f.energy >= skillCost(f, prim)) cast = prim;
      }
      if (!cast) {
        for (const id of f.loadout) {
          const def = SKILL_BY_ID[id];
          if (!def || def.passive) continue;
          if ((f.cd[id] ?? 0) > 0) continue;
          if (f.energy < skillCost(f, id)) continue;
          cast = id;
          break;
        }
      }
      if (cast) {
        const cost = skillCost(f, cast);
        f.energy -= cost;
        f.cd[cast] = skillCd(f, cast);
        const mul = skillMul(cast);
        const { dmg, crit } = dealDamage(f, target, mul, rng);
        log.push({
          t: 'skill',
          text: `${f.name} ${SKILL_BY_ID[cast].name} → ${target.name} ${dmg}${crit ? '!' : ''}`,
          time,
          actor: f.name,
          actorClass: f.heroClass,
          team: f.team,
          skillId: cast,
          skillName: SKILL_BY_ID[cast].name,
          target: target.name,
          targetTeam: target.team,
          dmg,
          crit,
        });
        if (target.hp <= 0) {
          target.dead = true;
          if (f.team === 'ally') allyKills += 1;
          else enemyKills += 1;
          log.push({
            t: 'kill',
            text: `${target.name} falls (${f.team === 'ally' ? 'ally' : 'enemy'} kill)`,
            time,
            actor: f.name,
            actorClass: f.heroClass,
            team: f.team,
            target: target.name,
            targetTeam: target.team,
          });
          if (f.effects.onKillHealPct > 0) {
            f.hp = Math.min(f.maxHp, f.hp + f.maxHp * (f.effects.onKillHealPct / 100));
          }
        }
        continue;
      }

      if (f.swingT <= 0) {
        f.swingT = PVP_SWING_S;
        const { dmg, crit } = dealDamage(f, target, 1, rng);
        log.push({
          t: 'hit',
          text: `${f.name} hits ${target.name} for ${dmg}${crit ? ' crit' : ''}`,
          time,
          actor: f.name,
          actorClass: f.heroClass,
          team: f.team,
          target: target.name,
          targetTeam: target.team,
          dmg,
          crit,
        });
        if (target.hp <= 0) {
          target.dead = true;
          if (f.team === 'ally') allyKills += 1;
          else enemyKills += 1;
          log.push({
            t: 'kill',
            text: `${target.name} falls`,
            time,
            actor: f.name,
            actorClass: f.heroClass,
            team: f.team,
            target: target.name,
            targetTeam: target.team,
          });
        }
      }
    }
  }

  const timedOut = allyKills < PVP_KILL_TARGET && enemyKills < PVP_KILL_TARGET;
  const allyHpLeft = living('ally').reduce((s, f) => s + f.hp, 0);
  const enemyHpLeft = living('enemy').reduce((s, f) => s + f.hp, 0);
  let won: boolean;
  if (allyKills >= PVP_KILL_TARGET) won = true;
  else if (enemyKills >= PVP_KILL_TARGET) won = false;
  else won = allyHpLeft >= enemyHpLeft;

  log.push({
    t: 'end',
    text: won
      ? timedOut
        ? `Victory on HP (${Math.round(allyHpLeft)} vs ${Math.round(enemyHpLeft)})`
        : `Victory — ${allyKills} kills`
      : timedOut
        ? `Defeat on HP (${Math.round(allyHpLeft)} vs ${Math.round(enemyHpLeft)})`
        : `Defeat — enemy ${enemyKills} kills`,
    time,
  });

  const snap = (team: 'ally' | 'enemy') =>
    fighters
      .filter((f) => f.team === team)
      .map((f) => ({
        name: f.name,
        heroClass: f.heroClass,
        hp: Math.max(0, Math.round(f.hp)),
        maxHp: f.maxHp,
        isAi: f.isAi,
      }));

  // Live peer matches keep AI clan fillers but are not "AI practice".
  const practiceAi = meta.liveMatch
    ? false
    : fighters.some((f) => f.team === 'ally' && f.isAi) ||
      fighters.some((f) => f.team === 'enemy' && f.isAi);

  const fighterSnaps: PvpFighterSnap[] = fighters.map((f) => ({
    id: f.id,
    name: f.name,
    team: f.team,
    heroClass: f.heroClass,
    maxHp: f.maxHp,
    x: f.x,
    isAi: f.isAi,
    isPlayer: f.isPlayer,
  }));

  const duration = Math.round(time * 10) / 10;
  const dpsBoard = buildDpsBoard(fighters, duration);
  const mvp = dpsBoard.find((e) => e.team === 'ally' && e.damage > 0) ?? null;
  const matchBandLabel =
    meta.matchBandLabel ?? matchCpBandForQueue(PRACTICE_MATCH_WAIT_S).label;

  return {
    won,
    allyKills,
    enemyKills,
    duration,
    timedOut,
    log: log.filter((e) => e.t !== 'hit').slice(-48),
    playback: log,
    fighters: fighterSnaps,
    allyHpLeft: Math.round(allyHpLeft),
    enemyHpLeft: Math.round(enemyHpLeft),
    allyTeam: snap('ally'),
    enemyTeam: snap('enemy'),
    practiceAi,
    bracket: meta.bracket,
    challengeUp: meta.challengeUp,
    teamCp: meta.teamCp,
    dpsBoard,
    mvp,
    matchBandLabel,
  };
}

// Re-export band helper for callers that import matchmaking from pvp.
export { matchCpBandForQueue, PRACTICE_MATCH_WAIT_S };
