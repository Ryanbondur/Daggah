import { computeHero, type Gear, type SetEffects } from '../data/gear';
import { DEFAULT_LOADOUT, SKILL_BY_ID, defaultPrimary } from '../data/skills';
import type { HeroClass, SkillId, Stats } from '../data/types';
import { HERO_CLASSES } from '../data/types';
import { maxEnergy } from '../data/xp';
import type { ClanMember } from './clan';
import { buildAiMember } from './clan';
import type { ClanBracketId } from './clanBrackets';
import type { Rng } from './rng';

export const PVP_TIMEOUT_S = 90;
export const PVP_KILL_TARGET = 4;

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
    hp: stats.hp,
    maxHp: stats.hp,
    energy: maxEn * 0.6,
    maxEnergy: maxEn,
    cd: {},
    swingT: 0.3 + rng.next() * 0.5,
    dead: false,
    x,
  };
}

/**
 * Enemy clan for 4v4 practice: one of each class with endgame/testing gear,
 * CP nudged toward the ally average (±15%).
 */
export function buildOpponentRoster(rng: Rng, ally: ClanMember[], avgCp: number): ClanMember[] {
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
    const target = avgCp * (0.85 + rng.next() * 0.3);
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
  if (def.ultimate) return 2.4;
  return 1.35 + Math.min(1.2, def.energy / 400);
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
  const mitigated = Math.max(1, dmg * (100 / (100 + target.stats.def * 0.85)));
  const ultBonus = mul >= 2 ? 1 + attacker.effects.ultimateDmgPct / 100 : 1;
  const final = Math.round(mitigated * ultBonus * (1 + attacker.effects.aoePct / 200));
  target.hp = Math.max(0, target.hp - final);
  return { dmg: final, crit };
}

/**
 * Client-local 4v4 auto-battle (GDD §10).
 * Fight until 4 kills or 90s; timeout → higher remaining HP wins.
 */
export function simulatePvp(
  allyRoster: ClanMember[],
  enemyRoster: ClanMember[],
  playerGear: Gear,
  playerLevel: number,
  rng: Rng,
  meta: { bracket: ClanBracketId; challengeUp: boolean; teamCp: number } = {
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
        f.swingT = 1.2;
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

  const practiceAi =
    fighters.some((f) => f.team === 'ally' && f.isAi) || fighters.some((f) => f.team === 'enemy' && f.isAi);

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

  return {
    won,
    allyKills,
    enemyKills,
    duration: Math.round(time * 10) / 10,
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
  };
}

