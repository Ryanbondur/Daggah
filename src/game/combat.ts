import type { BackgroundId, EnemyDef, EnemyRole, NodeType } from '../data/acts';
import { ENEMIES, enemyScale } from '../data/acts';
import type { SetEffects } from '../data/gear';
import { SKILL_BY_ID, defaultPrimary } from '../data/skills';
import type { HeroClass, SkillId, Stats } from '../data/types';
import { maxEnergy } from '../data/xp';
import type { Rng } from './rng';

export const HERO_X = 0.24;
export const STEP = 0.05;

export interface HeroInput {
  level: number;
  heroClass: HeroClass;
  stats: Stats;
  effects: SetEffects;
  loadout: SkillId[];
  primary: SkillId | null;
}

export interface RunNode {
  type: NodeType;
  tier: number;
  recLevel: number;
}

export interface RunDef {
  kind: 'stage' | 'dungeon';
  title: string;
  bg: BackgroundId;
  actId: number;
  nodes: RunNode[];
  trash: string[];
  elite: string;
  boss: string;
  startNode: number;
  startEnergy: number;
  walkTime: number;
}

export type BattleEvent =
  | { t: 'swing' }
  | { t: 'hit'; enemyId: number; dmg: number; crit: boolean; skill?: SkillId; aoe?: boolean }
  | { t: 'heroHit'; dmg: number; enemyId: number; absorbed: boolean }
  | { t: 'skill'; id: SkillId; name: string; ultimate: boolean }
  | { t: 'kill'; enemyId: number; role: EnemyRole; xp: number; gold: number; defId: string }
  | { t: 'nodeClear'; index: number; type: NodeType }
  | { t: 'runClear' }
  | { t: 'heroDeath' }
  | { t: 'heal'; amount: number }
  | { t: 'energy'; amount: number }
  | { t: 'blocked'; enemyId: number }
  | { t: 'stun'; enemyId: number }
  | { t: 'shout'; text: string }
  | { t: 'spawn'; enemyId: number };

export type BattleState = 'rest' | 'walk' | 'fight' | 'cleared' | 'defeat';

export interface Enemy {
  id: number;
  def: EnemyDef;
  hp: number;
  maxHp: number;
  atk: number;
  defense: number;
  xp: number;
  x: number;
  atkT: number;
  stunT: number;
  shredT: number;
  slowT: number;
  slowMul: number;
  rootT: number;
  burn: number;
  burnT: number;
  bleedT: number;
  bleedDps: number;
  markT: number;
  vulnT: number;
  hitFlash: number;
  attackAnim: number;
  dead: boolean;
  deathT: number;
  phaseDone: boolean;
  tier: number;
  engaged: boolean;
}

interface Buffs {
  bannerT: number;
  shield: number;
  shieldT: number;
  glacial: boolean;
  rallyT: number;
  rallyRate: number;
  guardT: number;
  spinT: number;
  spinTick: number;
  spinMul: number;
  spinSkill: SkillId | null;
  cleaveStacks: number;
  cleaveT: number;
  meteorT: number;
  meteorMul: number;
  trapT: number;
  trapMul: number;
  hasteT: number;
  hasteBonus: number;
  immuneT: number;
  smokeT: number;
  stealthT: number;
  ambushReady: boolean;
  firstSwing: boolean;
  critBonus: number;
  critBonusT: number;
}

function freshBuffs(): Buffs {
  return {
    bannerT: 0,
    shield: 0,
    shieldT: 0,
    glacial: false,
    rallyT: 0,
    rallyRate: 0,
    guardT: 0,
    spinT: 0,
    spinTick: 0,
    spinMul: 1,
    spinSkill: null,
    cleaveStacks: 0,
    cleaveT: 0,
    meteorT: 0,
    meteorMul: 1,
    trapT: 0,
    trapMul: 1,
    hasteT: 0,
    hasteBonus: 0,
    immuneT: 0,
    smokeT: 0,
    stealthT: 0,
    ambushReady: false,
    firstSwing: true,
    critBonus: 0,
    critBonusT: 0,
  };
}

const REST_TIME = 1.6;
const AI_INTERVAL = 0.25;
const CAST_LOCK = 0.5;

export class Battle {
  readonly run: RunDef;
  state: BattleState;
  nodeIndex: number;
  stateT = 0;
  time = 0;
  scroll = 0;
  enemies: Enemy[] = [];
  events: BattleEvent[] = [];

  hero: { hp: number; maxHp: number; energy: number; maxEnergy: number };
  heroInput: HeroInput;
  buffs: Buffs = freshBuffs();
  cds: Partial<Record<SkillId, number>> = {};
  heroSwingAnim = 0;
  heroHitFlash = 0;

  private autoT = 0.4;
  private lockT = 0;
  private aiT = 0;
  private nextEnemyId = 1;
  private rng: Rng;

  constructor(run: RunDef, hero: HeroInput, rng: Rng) {
    this.run = run;
    this.rng = rng;
    this.heroInput = hero;
    const maxHp = hero.stats.hp;
    const maxEn = maxEnergy(hero.level);
    this.hero = { hp: maxHp, maxHp, energy: maxEn * run.startEnergy, maxEnergy: maxEn };
    if (run.startNode === 0 && run.nodes[0]?.type === 'camp') {
      this.state = 'rest';
      this.nodeIndex = 0;
    } else {
      this.state = 'walk';
      this.nodeIndex = run.startNode;
    }
  }

  get node(): RunNode {
    return this.run.nodes[this.nodeIndex];
  }

  get primaryId(): SkillId | null {
    const p = this.heroInput.primary;
    if (p && this.heroInput.loadout.includes(p)) return p;
    return defaultPrimary(this.heroInput.loadout);
  }

  get reach(): number {
    const c = this.heroInput.heroClass;
    return c === 'Mage' || c === 'Ranger' ? 0.55 : 0.4;
  }

  skillCost(id: SkillId): number {
    const pct = this.heroInput.effects.skillCostPct[id] ?? 0;
    return Math.round(SKILL_BY_ID[id].energy * (1 - pct / 100));
  }

  skillCd(id: SkillId): number {
    const minus = this.heroInput.effects.skillCdMinus[id] ?? 0;
    const base = Math.max(1, SKILL_BY_ID[id].cd - minus);
    const pct = this.heroInput.effects.globalCdPct;
    return pct > 0 ? Math.max(1, base * (1 - pct / 100)) : base;
  }

  cdFraction(id: SkillId): number {
    const left = this.cds[id] ?? 0;
    return left <= 0 ? 0 : Math.min(1, left / this.skillCd(id));
  }

  get alive(): Enemy[] {
    return this.enemies.filter((e) => !e.dead);
  }

  drain(): BattleEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  update(dt: number): void {
    this.time += dt;
    this.heroSwingAnim = Math.max(0, this.heroSwingAnim - dt);
    this.heroHitFlash = Math.max(0, this.heroHitFlash - dt);
    for (const e of this.enemies) {
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.attackAnim = Math.max(0, e.attackAnim - dt);
      if (e.dead) e.deathT += dt;
    }
    this.enemies = this.enemies.filter((e) => !e.dead || e.deathT < 0.7);

    if (this.state === 'defeat' || this.state === 'cleared') return;

    this.regenEnergy(dt);
    this.tickBuffs(dt);
    if (this.hero.hp <= 0) return;

    switch (this.state) {
      case 'rest':
        this.stateT += dt;
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * 0.6 * dt);
        if (this.stateT >= REST_TIME) {
          this.events.push({ t: 'nodeClear', index: this.nodeIndex, type: 'camp' });
          this.nodeIndex += 1;
          this.setState('walk');
        }
        break;
      case 'walk':
        this.stateT += dt;
        this.scroll += dt;
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * 0.04 * dt);
        if (this.stateT >= this.run.walkTime) this.spawnNode();
        break;
      case 'fight':
        this.updateFight(dt);
        break;
    }
  }

  private setState(s: BattleState): void {
    this.state = s;
    this.stateT = 0;
  }

  private regenEnergy(dt: number): void {
    const fx = this.heroInput.effects;
    const rate = (8 + this.heroInput.stats.energyRegen) * (1 + fx.energyRegenPct / 100);
    this.gainEnergy(rate * dt, false);
  }

  private gainEnergy(n: number, announce: boolean): void {
    const before = this.hero.energy;
    this.hero.energy = Math.min(this.hero.maxEnergy, this.hero.energy + n);
    const gained = Math.round(this.hero.energy - before);
    if (announce && gained > 0) this.events.push({ t: 'energy', amount: gained });
  }

  private tickBuffs(dt: number): void {
    const b = this.buffs;
    b.bannerT = Math.max(0, b.bannerT - dt);
    b.immuneT = Math.max(0, b.immuneT - dt);
    b.smokeT = Math.max(0, b.smokeT - dt);
    b.stealthT = Math.max(0, b.stealthT - dt);
    if (b.critBonusT > 0) {
      b.critBonusT -= dt;
      if (b.critBonusT <= 0) b.critBonus = 0;
    }
    if (b.hasteT > 0) {
      b.hasteT -= dt;
      if (b.hasteT <= 0) b.hasteBonus = 0;
    }
    if (b.shieldT > 0) {
      b.shieldT -= dt;
      if (b.shieldT <= 0) {
        b.shield = 0;
        b.glacial = false;
      }
    }
    b.guardT = Math.max(0, b.guardT - dt);
    if (b.cleaveT > 0) {
      b.cleaveT -= dt;
      if (b.cleaveT <= 0) b.cleaveStacks = 0;
    }
    if (b.rallyT > 0) {
      const slice = Math.min(dt, b.rallyT);
      b.rallyT -= dt;
      const heal = b.rallyRate * slice;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
    }
    if (b.meteorT > 0) {
      b.meteorT -= dt;
      if (b.meteorT <= 0) {
        this.heroAoe(2.8 * b.meteorMul, 'meteor');
      }
    }
    if (b.trapT > 0) {
      b.trapT -= dt;
      if (b.trapT <= 0) {
        for (const e of this.alive) {
          this.hitEnemy(e, 2.2 * b.trapMul, { skill: 'explosive-trap', aoe: true, sp: true });
          if (!e.dead) this.applySlow(e, 3, 0.7);
        }
      }
    }
    for (const e of this.alive) {
      if (e.burnT > 0 && e.burn > 0) {
        const tick = this.heroInput.stats.atk * 0.12 * e.burn * (1 + this.heroInput.effects.burnPct / 100) * dt;
        e.hp -= tick;
        e.burnT -= dt;
        if (e.burnT <= 0) e.burn = 0;
        if (e.hp <= 0) this.killEnemy(e);
      }
      if (e.bleedT > 0) {
        e.hp -= e.bleedDps * dt;
        e.bleedT -= dt;
        if (e.hp <= 0) this.killEnemy(e);
      }
    }
    for (const id of Object.keys(this.cds) as SkillId[]) {
      this.cds[id] = Math.max(0, (this.cds[id] ?? 0) - dt);
    }
    this.lockT = Math.max(0, this.lockT - dt);
  }

  private spawnNode(): void {
    const node = this.node;
    const run = this.run;
    const ids: { id: string; hpMul?: number }[] = [];
    const trash = () => this.rng.pick(run.trash);
    switch (node.type) {
      case 'trash': {
        const n = this.rng.int(3, 5);
        for (let i = 0; i < n; i++) ids.push({ id: trash() });
        break;
      }
      case 'elite': {
        ids.push({ id: run.elite });
        ids.push({ id: trash() }, { id: trash() });
        break;
      }
      case 'miniboss': {
        ids.push({ id: run.elite });
        ids.push({ id: trash() }, { id: trash() }, { id: trash() });
        break;
      }
      case 'boss':
        ids.push({ id: run.boss });
        break;
      default:
        break;
    }
    ids.forEach((spec, i) => this.spawnEnemy(spec.id, node.tier, 1.08 + i * 0.07, spec.hpMul ?? 1));
    this.setState('fight');
    this.autoT = Math.min(this.autoT, 0.5);
    this.aiT = 0.1;
    this.buffs.firstSwing = true;
    if (node.type === 'boss') this.events.push({ t: 'shout', text: ENEMIES[run.boss].name });
  }

  private spawnEnemy(defId: string, tier: number, x: number, hpMul: number): Enemy {
    const def = ENEMIES[defId];
    const sc = enemyScale(tier, def.role);
    const hp = Math.round(sc.hp * def.hpMul * hpMul);
    const enemy: Enemy = {
      id: this.nextEnemyId++,
      def,
      hp,
      maxHp: hp,
      atk: sc.atk * def.atkMul,
      defense: sc.def,
      xp: sc.xp,
      x,
      atkT: def.atkInterval * this.rng.range(0.6, 1),
      stunT: 0,
      shredT: 0,
      slowT: 0,
      slowMul: 1,
      rootT: 0,
      burn: 0,
      burnT: 0,
      bleedT: 0,
      bleedDps: 0,
      markT: 0,
      vulnT: 0,
      hitFlash: 0,
      attackAnim: 0,
      dead: false,
      deathT: 0,
      phaseDone: false,
      tier,
      engaged: false,
    };
    this.enemies.push(enemy);
    this.events.push({ t: 'spawn', enemyId: enemy.id });
    return enemy;
  }

  private updateFight(dt: number): void {
    this.updateEnemies(dt);
    if (this.hero.hp <= 0) return;
    this.updateHero(dt);
    if (this.alive.length === 0) this.finishNode();
  }

  private finishNode(): void {
    this.events.push({ t: 'nodeClear', index: this.nodeIndex, type: this.node.type });
    this.buffs.guardT = 0;
    if (this.nodeIndex >= this.run.nodes.length - 1) {
      this.setState('cleared');
      this.events.push({ t: 'runClear' });
      return;
    }
    this.nodeIndex += 1;
    this.setState('walk');
  }

  private frontEnemy(): Enemy | undefined {
    let best: Enemy | undefined;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!best || e.x < best.x) best = e;
    }
    return best;
  }

  private applySlow(e: Enemy, dur: number, mul: number): void {
    const potency = 1 + this.heroInput.effects.slowPct / 100;
    const slowed = Math.max(0.35, 1 - (1 - mul) * potency);
    e.slowT = Math.max(e.slowT, dur);
    e.slowMul = Math.min(e.slowMul, slowed);
  }

  private applyBurn(e: Enemy, stacks = 1): void {
    e.burn = Math.min(5, e.burn + stacks);
    e.burnT = 4;
  }

  private updateEnemies(dt: number): void {
    const alive = this.enemies.filter((e) => !e.dead).sort((a, b) => a.x - b.x);
    let offset = 0;
    alive.forEach((e) => {
      const gap = e.def.role === 'boss' ? 0.12 : e.def.role === 'elite' ? 0.085 : 0.062;
      const targetX = HERO_X + 0.13 + offset + gap * 0.5;
      offset += gap;
      e.rootT = Math.max(0, e.rootT - dt);
      e.slowT = Math.max(0, e.slowT - dt);
      if (e.slowT <= 0) e.slowMul = 1;
      e.markT = Math.max(0, e.markT - dt);
      e.vulnT = Math.max(0, e.vulnT - dt);
      const frozen = e.stunT > 0 || e.rootT > 0;
      if (e.stunT > 0) {
        e.stunT -= dt;
      } else if (!frozen && e.x > targetX) {
        e.x = Math.max(targetX, e.x - e.def.speed * e.slowMul * dt);
      }
      e.shredT = Math.max(0, e.shredT - dt);
      e.engaged = e.x <= targetX + 0.02;
      if (!frozen && e.engaged) {
        e.atkT -= dt;
        if (e.atkT <= 0) {
          e.atkT = e.def.atkInterval * this.rng.range(0.9, 1.1);
          this.enemyAttack(e);
        }
      }
    });
  }

  private enemyAttack(e: Enemy): void {
    e.attackAnim = 0.25;
    const b = this.buffs;
    if (b.immuneT > 0) return;
    if (b.smokeT > 0 && this.rng.chance(0.4)) {
      this.events.push({ t: 'blocked', enemyId: e.id });
      return;
    }
    if (b.guardT > 0) {
      b.guardT = 0;
      this.events.push({ t: 'blocked', enemyId: e.id });
      this.hitEnemy(e, 3.0, { skill: 'executioners-guard', sp: true });
      e.stunT = Math.max(e.stunT, e.def.role === 'trash' ? 1.2 : 0.7);
      this.events.push({ t: 'stun', enemyId: e.id });
      this.gainEnergy(2, false);
      return;
    }
    const def = this.heroInput.stats.def;
    const mitigation = 1 - def / (def + 90);
    const node = this.node;
    const soft = this.heroInput.level <= node.recLevel - 3 ? 1.5 : 1;
    let dmg = Math.max(1, Math.round(e.atk * this.rng.range(0.9, 1.1) * mitigation * soft));
    let absorbed = false;
    if (b.shield > 0) {
      absorbed = true;
      const soak = Math.min(b.shield, dmg);
      b.shield -= soak;
      dmg -= soak;
      if (b.glacial) this.applySlow(e, 2, 0.6);
      if (b.shield <= 0) {
        b.shieldT = 0;
        b.glacial = false;
      }
    }
    this.hero.hp -= dmg;
    this.heroHitFlash = 0.15;
    this.gainEnergy(2, false);
    this.events.push({ t: 'heroHit', dmg, enemyId: e.id, absorbed });
    if (this.hero.hp <= 0) {
      this.hero.hp = 0;
      this.setState('defeat');
      this.events.push({ t: 'heroDeath' });
    }
  }

  private updateHero(dt: number): void {
    const b = this.buffs;
    if (b.spinT > 0) {
      b.spinT -= dt;
      b.spinTick -= dt;
      if (b.spinTick <= 0) {
        b.spinTick += 0.4;
        const skill = b.spinSkill ?? 'bladestorm';
        this.heroAoe(0.9 * b.spinMul, skill);
      }
      return;
    }

    this.aiT -= dt;
    if (this.aiT <= 0 && this.lockT <= 0) {
      this.aiT = AI_INTERVAL;
      const pick = this.pickSkill();
      if (pick) {
        this.cast(pick);
        return;
      }
    }

    this.autoT -= dt;
    if (this.autoT <= 0 && this.lockT <= 0) {
      const front = this.frontEnemy();
      if (front && front.x <= HERO_X + this.reach) {
        this.autoAttack(front);
      }
    }
  }

  private autoInterval(): number {
    const haste =
      this.heroInput.stats.haste / 100 +
      (this.buffs.bannerT > 0 ? 0.15 : 0) +
      this.buffs.hasteBonus;
    return 1.2 / (1 + haste);
  }

  private autoAttack(front: Enemy): void {
    this.autoT = this.autoInterval();
    this.heroSwingAnim = 0.22;
    this.events.push({ t: 'swing' });
    const load = this.heroInput.loadout;
    let mult = 1;
    let forceCrit = false;
    if (load.includes('backstab') && (this.buffs.firstSwing || this.buffs.stealthT > 0 || this.buffs.ambushReady)) {
      mult = 1.6;
      forceCrit = true;
      this.buffs.ambushReady = false;
      this.buffs.stealthT = 0;
    }
    this.buffs.firstSwing = false;
    this.hitEnemy(front, mult, { forceCrit });
    if (load.includes('cleave')) {
      const others = this.alive
        .filter((e) => e !== front)
        .sort((a, b) => a.x - b.x)
        .slice(0, 2);
      for (const o of others) this.hitEnemy(o, 0.6, { aoe: true });
      this.buffs.cleaveStacks = Math.min(5, this.buffs.cleaveStacks + 1);
      this.buffs.cleaveT = 6;
    }
    if (load.includes('firebolt')) this.applyBurn(front, 1);
    if (load.includes('piercing-shot')) {
      const rest = this.alive.filter((e) => e !== front).sort((a, b) => a.x - b.x);
      for (const o of rest) this.hitEnemy(o, 0.7, { aoe: true });
    }
    this.gainEnergy(3, true);
  }

  private hitEnemy(
    e: Enemy,
    mult: number,
    opts: {
      skill?: SkillId;
      aoe?: boolean;
      sp?: boolean;
      noEnergy?: boolean;
      forceCrit?: boolean;
      critBonus?: number;
    },
  ): number {
    if (e.dead) return 0;
    const inp = this.heroInput;
    const atk = inp.stats.atk * (this.buffs.bannerT > 0 ? 1.25 : 1);
    let dmg = atk * mult * this.rng.range(0.95, 1.05);
    if (opts.aoe) dmg *= 1 + inp.effects.aoePct / 100;
    if (opts.sp) dmg *= 1 + inp.stats.skillPower / 100;
    if (opts.skill) {
      const skillBonus = inp.effects.skillDmgPct[opts.skill] ?? 0;
      if (skillBonus) dmg *= 1 + skillBonus / 100;
    }
    if (e.shredT > 0) dmg *= 1.2;
    if (e.markT > 0) dmg *= 1.2;
    if (e.vulnT > 0) dmg *= 1.25;
    if (e.burn > 0 && (opts.skill === 'flame-wave' || opts.skill === 'meteor')) {
      dmg *= 1 + 0.04 * e.burn;
    }
    const critChance =
      inp.stats.critRate / 100 + (opts.critBonus ?? 0) + this.buffs.critBonus;
    const crit = opts.forceCrit || this.rng.chance(critChance);
    if (crit) dmg *= 1.5 + inp.stats.critDmg / 100;
    dmg *= 100 / (100 + e.defense * 1.5);
    const final = Math.max(1, Math.round(dmg));
    e.hp -= final;
    e.hitFlash = 0.12;
    this.events.push({ t: 'hit', enemyId: e.id, dmg: final, crit, skill: opts.skill, aoe: opts.aoe });
    if (e.def.role === 'boss' && !e.phaseDone && e.hp > 0 && e.hp <= e.maxHp * 0.5) {
      e.phaseDone = true;
      this.events.push({ t: 'shout', text: 'Reinforcements!' });
      const alive = this.alive.length;
      for (let i = 0; i < 2; i++) {
        const id = this.rng.pick(this.run.trash);
        this.spawnEnemy(id, e.tier, 1.05 + (alive + i) * 0.07, 0.8);
      }
    }
    if (e.hp <= 0) this.killEnemy(e);
    return final;
  }

  private killEnemy(e: Enemy): void {
    e.hp = 0;
    e.dead = true;
    e.deathT = 0;
    const xp = Math.max(1, Math.round(e.xp));
    const gold = Math.max(1, Math.round(xp * 0.8));
    this.events.push({ t: 'kill', enemyId: e.id, role: e.def.role, xp, gold, defId: e.def.id });
    const healPct = this.heroInput.effects.onKillHealPct;
    if (healPct > 0) {
      const amount = Math.round(this.hero.maxHp * (healPct / 100));
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + amount);
      this.events.push({ t: 'heal', amount });
    }
  }

  private heroAoe(mult: number, skill: SkillId): void {
    if (skill === 'arrow-rain' && this.heroInput.effects.arrowRainWidth > 0) {
      mult *= 1 + this.heroInput.effects.arrowRainWidth / 100;
    }
    for (const e of this.alive) this.hitEnemy(e, mult, { skill, aoe: true, sp: true });
    this.gainEnergy(3, false);
  }

  // ---- skills -------------------------------------------------------------

  canCast(id: SkillId): boolean {
    if (!this.heroInput.loadout.includes(id)) return false;
    if (SKILL_BY_ID[id].passive) return false;
    if (this.state !== 'fight' || this.hero.hp <= 0) return false;
    if (this.buffs.spinT > 0 || this.lockT > 0) return false;
    if ((this.cds[id] ?? 0) > 0) return false;
    return this.hero.energy >= this.skillCost(id);
  }

  forceCastPrimary(): boolean {
    const id = this.primaryId;
    if (!id || !this.canCast(id)) return false;
    if (this.alive.length === 0) return false;
    this.cast(id);
    return true;
  }

  private pickSkill(): SkillId | null {
    const alive = this.alive;
    if (alive.length === 0) return null;
    const n = alive.length;
    const hasBoss = alive.some((e) => e.def.role === 'boss');
    const hasElite = alive.some((e) => e.def.role !== 'trash');
    const hpPct = this.hero.hp / this.hero.maxHp;
    const b = this.buffs;
    const front = this.frontEnemy();
    const inReach = !!front && front.x <= HERO_X + this.reach;
    const execThresh = this.heroInput.effects.executeThreshold;
    const lowTarget = alive.find((e) => e.hp / e.maxHp <= execThresh);

    const primary = this.primaryId;
    if (primary && this.canCast(primary) && inReach && (n >= 3 || hasBoss)) return primary;

    const order: SkillId[] = [
      'rally',
      'cloak-of-shadows',
      'executioners-guard',
      'iron-skin',
      'glacial-armor',
      'shadowstep',
      'war-banner',
      'hunters-mark',
      'kill-shot',
      'death-mark',
      'absolute-zero',
      'meteor',
      'storm-of-quills',
      'bladestorm',
      'combustion',
      'ambush',
      'whirlwind',
      'flame-wave',
      'arrow-rain',
      'multishot',
      'frost-nova',
      'explosive-trap',
      'flurry',
      'garrote',
      'smoke-bomb',
      'aimed-shot',
      'ice-lance',
      'shield-bash',
    ];
    for (const id of order) {
      if (!this.canCast(id)) continue;
      switch (id) {
        case 'rally':
          if (hpPct < 0.55) return id;
          break;
        case 'cloak-of-shadows':
          if (hpPct < 0.4 && b.immuneT <= 0) return id;
          break;
        case 'executioners-guard':
          if ((hasElite || hpPct < 0.6) && b.guardT <= 0 && inReach) return id;
          break;
        case 'iron-skin':
        case 'glacial-armor':
          if (b.shield <= 0 && inReach && (n >= 2 || hasElite)) return id;
          break;
        case 'shadowstep':
          if (b.immuneT <= 0 && inReach) return id;
          break;
        case 'war-banner':
          if (b.bannerT <= 0 && inReach && (n >= 3 || hasBoss)) return id;
          break;
        case 'hunters-mark':
          if (front && front.markT <= 0 && inReach) return id;
          break;
        case 'kill-shot':
          if (lowTarget && inReach) return id;
          break;
        case 'death-mark':
          if (inReach && (lowTarget || hasBoss || hasElite)) return id;
          break;
        case 'absolute-zero':
        case 'meteor':
        case 'storm-of-quills':
        case 'bladestorm':
          if (inReach && (n >= 2 || hasBoss)) return id;
          break;
        case 'combustion':
          if (inReach && alive.some((e) => e.burn >= 2)) return id;
          break;
        case 'ambush':
          if (inReach && (hasElite || n >= 2)) return id;
          break;
        case 'whirlwind':
        case 'flame-wave':
        case 'arrow-rain':
        case 'multishot':
        case 'frost-nova':
          if (inReach && n >= 2) return id;
          break;
        case 'explosive-trap':
          if (inReach && n >= 2) return id;
          break;
        case 'flurry':
        case 'garrote':
        case 'aimed-shot':
        case 'ice-lance':
        case 'shield-bash':
          if (inReach && front && (hasElite || n >= 2 || front.stunT <= 0)) return id;
          break;
        case 'smoke-bomb':
          if (b.smokeT <= 0 && inReach && (n >= 3 || hpPct < 0.6)) return id;
          break;
        default:
          break;
      }
    }
    return null;
  }

  private cast(id: SkillId): void {
    const def = SKILL_BY_ID[id];
    this.hero.energy -= this.skillCost(id);
    this.cds[id] = this.skillCd(id);
    this.lockT = CAST_LOCK;
    this.heroSwingAnim = 0.3;
    this.events.push({ t: 'skill', id, name: def.name, ultimate: !!def.ultimate });
    const b = this.buffs;
    const front = this.frontEnemy();
    switch (id) {
      case 'whirlwind': {
        const stacks = b.cleaveStacks;
        this.heroAoe(1.6 * (1 + 0.04 * stacks), id);
        this.gainEnergy(6 * stacks, false);
        b.cleaveStacks = 0;
        break;
      }
      case 'bladestorm': {
        b.spinT = 2.4;
        b.spinTick = 0;
        b.spinMul = 1 + 0.06 * b.cleaveStacks;
        b.spinSkill = 'bladestorm';
        b.cleaveStacks = 0;
        break;
      }
      case 'war-banner':
        b.bannerT = 8;
        break;
      case 'shield-bash': {
        if (front) {
          this.hitEnemy(front, 1.3, { skill: id, sp: true });
          front.stunT = front.def.role === 'trash' ? 1.5 : 0.8;
          front.shredT = 5;
          this.events.push({ t: 'stun', enemyId: front.id });
        }
        break;
      }
      case 'iron-skin': {
        b.shield = Math.round(
          this.hero.maxHp * 0.3 * (1 + this.heroInput.effects.absorbPct / 100),
        );
        b.shieldT = 8;
        b.glacial = false;
        break;
      }
      case 'rally': {
        b.rallyT = 4;
        b.rallyRate = (this.hero.maxHp * 0.3 * (1 + this.heroInput.effects.healPct / 100)) / 4;
        this.events.push({ t: 'heal', amount: Math.round(b.rallyRate * 4) });
        break;
      }
      case 'executioners-guard':
        b.guardT = 5;
        break;
      case 'flame-wave': {
        for (const e of this.alive) {
          this.hitEnemy(e, 1.5, { skill: id, aoe: true, sp: true });
          if (!e.dead) this.applyBurn(e, 1);
        }
        break;
      }
      case 'meteor': {
        let burnBonus = 0;
        for (const e of this.alive) burnBonus = Math.max(burnBonus, e.burn);
        b.meteorT = 0.6;
        b.meteorMul = 1 + 0.05 * burnBonus;
        break;
      }
      case 'combustion': {
        const mul = 1 + this.heroInput.effects.combustPct / 100;
        for (const e of [...this.alive]) {
          if (e.burn <= 0) continue;
          this.hitEnemy(e, 0.7 * e.burn * mul, { skill: id, sp: true });
          e.burn = 0;
          e.burnT = 0;
        }
        break;
      }
      case 'ice-lance': {
        if (front) {
          this.hitEnemy(front, 1.7, { skill: id, sp: true });
          this.applySlow(front, 4, 0.6);
        }
        break;
      }
      case 'frost-nova': {
        for (const e of this.alive) {
          this.hitEnemy(e, 1.1, { skill: id, aoe: true, sp: true });
          if (!e.dead) e.rootT = Math.max(e.rootT, 2);
        }
        break;
      }
      case 'glacial-armor': {
        b.shield = Math.round(this.hero.maxHp * 0.25);
        b.shieldT = 8;
        b.glacial = true;
        break;
      }
      case 'absolute-zero': {
        const freeze = 2.5 + this.heroInput.effects.freezeBonus;
        for (const e of this.alive) {
          e.stunT = Math.max(e.stunT, freeze);
          e.vulnT = Math.max(e.vulnT, 6);
          this.events.push({ t: 'stun', enemyId: e.id });
        }
        break;
      }
      case 'arrow-rain':
        this.heroAoe(1.4, id);
        break;
      case 'multishot': {
        const targets = this.alive.sort((a, c) => a.x - c.x).slice(0, 4);
        for (const e of targets) this.hitEnemy(e, 1.3, { skill: id, aoe: true, sp: true });
        break;
      }
      case 'storm-of-quills': {
        b.spinT = 2.0;
        b.spinTick = 0;
        b.spinMul = 0.8 / 0.9;
        b.spinSkill = 'storm-of-quills';
        break;
      }
      case 'aimed-shot': {
        if (front) {
          const bonus = front.markT > 0 ? 0.15 : 0;
          this.hitEnemy(front, 2.0 * (1 + bonus), { skill: id, sp: true, critBonus: 0.25 });
        }
        break;
      }
      case 'hunters-mark': {
        if (front) front.markT = 8 + this.heroInput.effects.markDurationBonus;
        break;
      }
      case 'explosive-trap':
        b.trapT = 0.8;
        b.trapMul = 1;
        break;
      case 'kill-shot': {
        const target =
          this.alive.find((e) => e.hp / e.maxHp <= this.heroInput.effects.executeThreshold) ??
          front;
        if (target) this.hitEnemy(target, 3.5, { skill: id, sp: true, forceCrit: true });
        break;
      }
      case 'garrote': {
        if (front) {
          this.hitEnemy(front, 0.8, { skill: id, sp: true });
          front.bleedT = 6;
          front.bleedDps = this.heroInput.stats.atk * 0.4;
        }
        break;
      }
      case 'ambush': {
        b.stealthT = 1.5;
        b.immuneT = Math.max(b.immuneT, 0.4);
        b.ambushReady = true;
        b.critBonus = 0.4;
        b.critBonusT = 1.5;
        if (front) this.hitEnemy(front, 2.2, { skill: id, sp: true, critBonus: 0.4 });
        break;
      }
      case 'death-mark': {
        if (front) {
          let mul = 3.0;
          if (front.hp / front.maxHp < 0.35) mul *= 1.5;
          if (front.bleedT > 0) {
            mul += 0.8;
            front.bleedT = 0;
          }
          this.hitEnemy(front, mul, { skill: id, sp: true });
        }
        break;
      }
      case 'shadowstep':
        b.immuneT = Math.max(b.immuneT, 0.6);
        b.hasteT = 3;
        b.hasteBonus = 0.3;
        break;
      case 'smoke-bomb':
        b.smokeT = 4;
        break;
      case 'flurry': {
        if (front) {
          for (let i = 0; i < 4; i++) this.hitEnemy(front, 0.7, { skill: id, sp: true });
        }
        break;
      }
      case 'cloak-of-shadows': {
        b.immuneT = Math.max(b.immuneT, 2);
        const heal = Math.round(this.hero.maxHp * 0.1);
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + heal);
        this.events.push({ t: 'heal', amount: heal });
        break;
      }
      default:
        break;
    }
  }

  /** After a defeat with lives left: restart the current node at full health. */
  revive(): void {
    this.hero.hp = this.hero.maxHp;
    this.hero.energy = this.hero.maxEnergy * 0.5;
    this.buffs = freshBuffs();
    this.cds = {};
    this.enemies = [];
    this.setState('walk');
    this.stateT = this.run.walkTime - 0.8;
  }

  get progressPct(): number {
    const total = this.run.nodes.length;
    if (this.state === 'cleared') return 100;
    return Math.round((this.nodeIndex / total) * 100);
  }
}
