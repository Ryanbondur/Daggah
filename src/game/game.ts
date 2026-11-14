import type { DungeonDef, NodeType } from '../data/acts';
import {
  ACTS,
  STAGE_NODES,
  enemyScale,
  getAct,
  getDungeon,
  stageRecLevel,
  stageTier,
  stageTitle,
} from '../data/acts';
import type { DropSource } from '../data/gear';
import {
  RARITIES,
  cpDelta,
  computeHero,
  rollItem,
  rollRarity,
  salvageValue,
} from '../data/gear';
import { QUESTS } from '../data/quests';
import type { QuestDef } from '../data/quests';
import { BAR_SIZE, SKILL_BY_ID, isUnlocked } from '../data/skills';
import type { Item, SkillId, StatKey } from '../data/types';
import { STAT_KEYS } from '../data/types';
import { addXp, availableSpeeds, maxEnergy } from '../data/xp';
import type { BattleEvent, HeroInput, RunDef } from './combat';
import { Battle, STEP } from './combat';
import type { Rng } from './rng';
import { defaultRng } from './rng';
import type { SaveData, Storage } from './state';
import {
  BAG_CAP,
  DUNGEON_CRYSTAL_COST,
  KEY_CAP,
  KEY_REGEN_MS,
  PLAYABLE_STAGES,
  STAGES_PER_ACT,
  clearSave,
  defaultSave,
  loadSave,
  stageToActStage,
  writeSave,
} from './state';

export type Mode = 'camp' | 'stage' | 'dungeon';

export interface RunResult {
  kind: 'dungeon' | 'actClear' | 'stageFailed';
  title: string;
  success: boolean;
  loot: Item[];
  xp: number;
  note?: string;
}

export type GameEvent =
  | { t: 'change' }
  | { t: 'run' }
  | { t: 'battle'; ev: BattleEvent }
  | { t: 'toast'; text: string; kind: 'good' | 'bad' | 'info' }
  | { t: 'levelUp'; level: number; newSkills: SkillId[] }
  | { t: 'result'; result: RunResult }
  | { t: 'chat'; text: string };

type Listener = (e: GameEvent) => void;

interface DungeonCtx {
  dungeon: DungeonDef;
  loot: Item[];
  xp: number;
}

export interface CompareInfo {
  current?: Item;
  candidate: Item;
  cpDelta: number;
  statDeltas: Partial<Record<StatKey, number>>;
  levelOk: boolean;
}

export const MAX_LIVES = 5;

export class Game {
  save: SaveData;
  battle: Battle | null = null;
  mode: Mode = 'camp';
  lives = MAX_LIVES;
  paused = false;
  chat: string[] = ['Welcome to Daggah. Tap Battle to begin.'];
  readonly rng: Rng;
  private storage: Storage | undefined;
  private listeners = new Set<Listener>();
  private acc = 0;
  private dungeonCtx: DungeonCtx | null = null;

  constructor(storage?: Storage, rng: Rng = defaultRng) {
    this.storage = storage;
    this.rng = rng;
    this.save = loadSave(storage);
    this.refreshKeys();
    if (!availableSpeeds(this.save.level).includes(this.save.settings.speed)) {
      this.save.settings.speed = 1;
    }
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  persist(): void {
    writeSave(this.storage, this.save);
  }

  changed(): void {
    this.persist();
    this.emit({ t: 'change' });
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    this.emit({ t: 'toast', text, kind });
  }

  say(text: string): void {
    this.chat.push(text);
    if (this.chat.length > 30) this.chat.shift();
    this.emit({ t: 'chat', text });
  }

  // ---- derived ------------------------------------------------------------

  get totals() {
    return computeHero(this.save.level, this.save.gear);
  }

  get cp(): number {
    return this.totals.cp;
  }

  get speed(): number {
    return this.save.settings.speed;
  }

  get currentAct(): number {
    return stageToActStage(this.save.currentStage).act;
  }

  get currentStageNo(): number {
    return stageToActStage(this.save.currentStage).stage;
  }

  heroInput(): HeroInput {
    const t = this.totals;
    return {
      level: this.save.level,
      stats: t.stats,
      effects: t.effects,
      loadout: this.save.loadout.filter((id) => isUnlocked(id, this.save.level)),
      primary: this.save.primary,
    };
  }

  /** Nodes shown on the progress track. */
  get trackNodes(): NodeType[] {
    return this.battle ? this.battle.run.nodes.map((n) => n.type) : STAGE_NODES;
  }

  get title(): string {
    if (this.mode === 'dungeon' && this.dungeonCtx) {
      const floor = this.battle ? this.battle.nodeIndex + 1 : 1;
      return `${this.dungeonCtx.dungeon.name} F${Math.min(10, floor)}`;
    }
    return stageTitle(this.currentAct, this.currentStageNo);
  }

  get progressPct(): number {
    if (this.battle) return this.battle.progressPct;
    return Math.round((this.save.nodeProgress / STAGE_NODES.length) * 100);
  }

  get currentNodeIndex(): number {
    if (this.battle) return this.battle.nodeIndex;
    return this.save.nodeProgress;
  }

  get inBattle(): boolean {
    return this.mode !== 'camp' && !!this.battle;
  }

  get bg() {
    if (this.battle) return this.battle.run.bg;
    return getAct(this.currentAct).bg;
  }

  // ---- loop ---------------------------------------------------------------

  tick(dtReal: number): void {
    if (!this.battle || this.paused) return;
    this.acc += Math.min(dtReal, 0.25) * this.speed;
    let guard = 0;
    while (this.acc >= STEP && guard < 12) {
      this.acc -= STEP;
      guard += 1;
      const b: Battle | null = this.battle;
      if (!b) break;
      b.update(STEP);
      const events = b.drain();
      for (const ev of events) this.emit({ t: 'battle', ev });
      this.processEvents(b, events);
      if (this.battle !== b) {
        this.acc = 0;
        break;
      }
    }
  }

  private processEvents(b: Battle, events: BattleEvent[]): void {
    for (const ev of events) {
      if (this.battle !== b) return;
      switch (ev.t) {
        case 'kill':
          this.onKill(ev);
          break;
        case 'nodeClear':
          this.onNodeClear(ev.index, ev.type);
          break;
        case 'runClear':
          this.onRunClear();
          return;
        case 'heroDeath':
          this.onHeroDeath();
          return;
        default:
          break;
      }
    }
  }

  private onKill(ev: Extract<BattleEvent, { t: 'kill' }>): void {
    this.save.gold += ev.gold;
    if (this.dungeonCtx) this.dungeonCtx.xp += ev.xp;
    this.gainXp(ev.xp);
    if (this.mode === 'stage' && ev.role === 'elite' && this.rng.chance(0.12)) {
      this.dropFromStage('stage-elite');
    }
  }

  private onNodeClear(index: number, type: NodeType): void {
    if (this.mode === 'stage') {
      this.save.nodeProgress = Math.min(index + 1, STAGE_NODES.length - 1);
      this.persist();
    } else if (this.mode === 'dungeon' && this.dungeonCtx && type !== 'camp') {
      const ctx = this.dungeonCtx;
      const source: DropSource =
        type === 'boss' ? 'dungeon-boss' : type === 'miniboss' ? 'dungeon-mini' : 'dungeon-floor';
      const drops = type === 'boss' ? 2 : 1;
      for (let i = 0; i < drops; i++) {
        ctx.loot.push(this.rollDungeonItem(ctx.dungeon, index + 1, source));
      }
      this.say(`Floor ${index + 1} cleared.`);
    }
  }

  private onHeroDeath(): void {
    const b = this.battle;
    if (!b) return;
    this.lives -= 1;
    if (this.lives > 0) {
      this.say(`You fell! ${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left.`);
      this.toast(`Defeated - ${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left`, 'bad');
      b.revive();
      this.emit({ t: 'change' });
      return;
    }
    this.say('Out of lives. Returning to camp.');
    if (this.mode === 'dungeon' && this.dungeonCtx) {
      const ctx = this.dungeonCtx;
      this.dungeonCtx = null;
      this.endRun();
      this.emit({
        t: 'result',
        result: {
          kind: 'dungeon',
          title: `${ctx.dungeon.name} - Failed`,
          success: false,
          loot: ctx.loot,
          xp: ctx.xp,
          note: 'You ran out of lives. Loot gathered so far is yours.',
        },
      });
    } else {
      const title = stageTitle(this.currentAct, this.currentStageNo);
      this.endRun();
      this.emit({
        t: 'result',
        result: {
          kind: 'stageFailed',
          title,
          success: false,
          loot: [],
          xp: 0,
          note: 'Out of lives. Stage progress is kept. Upgrade gear, swap skills, or farm a dungeon.',
        },
      });
    }
  }

  private onRunClear(): void {
    if (this.mode === 'stage') this.onStageClear();
    else if (this.mode === 'dungeon') this.onDungeonClear();
  }

  private onStageClear(): void {
    const idx = this.save.currentStage;
    const { act, stage } = stageToActStage(idx);
    const first = idx === this.save.stagesCleared && idx < PLAYABLE_STAGES;
    this.dropFromStage('stage-boss');
    this.say(`${stageTitle(act, stage)} cleared!`);
    this.save.nodeProgress = 0;
    let actCleared = false;
    if (first) {
      this.save.stagesCleared += 1;
      this.save.crystals += 20;
      this.toast(`Stage ${act}-${stage} cleared  +20 crystals`, 'good');
      actCleared = this.save.stagesCleared % STAGES_PER_ACT === 0;
    } else {
      this.toast(`Stage ${act}-${stage} cleared`, 'good');
    }
    this.save.currentStage = first ? Math.min(this.save.stagesCleared, PLAYABLE_STAGES - 1) : idx;

    if (actCleared) {
      const a = getAct(act);
      const nextPlayable = ACTS.some((x) => x.id === act + 1);
      this.say(`${a.name} cleared. ${a.dungeon?.name ?? 'Dungeon'} unlocked!`);
      this.emit({
        t: 'result',
        result: {
          kind: 'actClear',
          title: `Act ${act} Cleared`,
          success: true,
          loot: [],
          xp: 0,
          note: `${a.dungeon?.name ?? 'The dungeon'} is now open in Adventure. ${
            nextPlayable
              ? `Act ${act + 1} awaits.`
              : 'Acts 3-10 arrive in a future update. Farm dungeons and gear up!'
          }`,
        },
      });
    }
    this.persist();
    this.startStage();
  }

  private onDungeonClear(): void {
    const ctx = this.dungeonCtx;
    if (!ctx) return;
    const rec = this.save.dungeons[ctx.dungeon.id] ?? { cleared: false, clears: 0 };
    rec.cleared = true;
    rec.clears += 1;
    this.save.dungeons[ctx.dungeon.id] = rec;
    this.dungeonCtx = null;
    this.endRun();
    this.say(`${ctx.dungeon.name} cleared!`);
    this.emit({
      t: 'result',
      result: {
        kind: 'dungeon',
        title: `${ctx.dungeon.name} - Cleared`,
        success: true,
        loot: ctx.loot,
        xp: ctx.xp,
        note: rec.clears === 1 ? 'Sweep unlocked: loot instantly for one key.' : undefined,
      },
    });
    this.changed();
  }

  private endRun(): void {
    this.battle = null;
    this.mode = 'camp';
    this.acc = 0;
    this.changed();
    this.emit({ t: 'run' });
  }

  // ---- XP -----------------------------------------------------------------

  gainXp(amount: number): void {
    const before = this.save.level;
    const res = addXp(this.save.level, this.save.xp, amount);
    this.save.level = res.level;
    this.save.xp = res.xp;
    if (res.levelsGained > 0) {
      const newSkills = (Object.keys(SKILL_BY_ID) as SkillId[]).filter(
        (id) => SKILL_BY_ID[id].unlockLevel > before && SKILL_BY_ID[id].unlockLevel <= res.level,
      );
      this.refreshBattleHero(true);
      this.say(`Level up! You are now Lv.${res.level}.`);
      this.emit({ t: 'levelUp', level: res.level, newSkills });
      for (const id of newSkills) this.say(`New skill unlocked: ${SKILL_BY_ID[id].name}.`);
      this.persist();
    }
    this.emit({ t: 'change' });
  }

  refreshBattleHero(healFull = false): void {
    const b = this.battle;
    if (!b) return;
    const input = this.heroInput();
    const oldMax = b.hero.maxHp;
    b.heroInput = input;
    b.hero.maxHp = input.stats.hp;
    b.hero.maxEnergy = maxEnergy(input.level);
    b.hero.hp = healFull ? b.hero.maxHp : Math.min(b.hero.maxHp, (b.hero.hp / oldMax) * b.hero.maxHp);
    b.hero.energy = Math.min(b.hero.energy, b.hero.maxEnergy);
  }

  // ---- runs ---------------------------------------------------------------

  buildStageRun(index: number, startNode: number): RunDef {
    const { act, stage } = stageToActStage(index);
    const a = getAct(act);
    const tier = stageTier(act, stage);
    const rec = stageRecLevel(act, stage);
    return {
      kind: 'stage',
      title: stageTitle(act, stage),
      bg: a.bg,
      actId: act,
      nodes: STAGE_NODES.map((type) => ({ type, tier, recLevel: rec })),
      trash: a.trash,
      elite: a.elite,
      boss: a.boss,
      startNode,
      startEnergy: 0.5,
      walkTime: 2.2,
    };
  }

  buildDungeonRun(d: DungeonDef): RunDef {
    const a = getAct(d.actId);
    const baseTier = stageTier(d.actId, 5) + 0.3;
    const rec = stageRecLevel(d.actId, 5);
    const nodes = Array.from({ length: d.floors }, (_, i) => {
      const floor = i + 1;
      const type: NodeType = floor === d.floors ? 'boss' : floor === 5 ? 'miniboss' : 'trash';
      return { type, tier: baseTier + i * 0.12, recLevel: rec };
    });
    return {
      kind: 'dungeon',
      title: d.name,
      bg: a.bg,
      actId: d.actId,
      nodes,
      trash: a.trash,
      elite: a.elite,
      boss: a.boss,
      startNode: 0,
      startEnergy: 1,
      walkTime: 1.3,
    };
  }

  startStage(): void {
    const idx = this.save.currentStage;
    const nodes = STAGE_NODES.length;
    const start = this.save.nodeProgress >= nodes ? 0 : this.save.nodeProgress;
    const run = this.buildStageRun(idx, start);
    this.battle = new Battle(run, this.heroInput(), this.rng);
    this.mode = 'stage';
    this.lives = MAX_LIVES;
    this.acc = 0;
    this.emit({ t: 'run' });
    this.emit({ t: 'change' });
  }

  startBattle(): void {
    if (this.battle && this.mode !== 'camp') return;
    this.startStage();
    this.say(`Entering ${this.title}.`);
  }

  retreat(): void {
    if (!this.battle) return;
    this.dungeonCtx = null;
    this.endRun();
    this.say('You retreat to camp.');
  }

  forceCast(): boolean {
    return this.battle?.forceCastPrimary() ?? false;
  }

  selectStage(index: number): boolean {
    if (index < 0 || index >= PLAYABLE_STAGES || index > this.save.stagesCleared) return false;
    if (this.mode === 'dungeon') return false;
    this.save.currentStage = index;
    this.save.nodeProgress = 0;
    if (this.mode === 'stage') this.startStage();
    this.changed();
    return true;
  }

  // ---- dungeons -----------------------------------------------------------

  dungeonUnlocked(d: DungeonDef): boolean {
    return this.save.stagesCleared >= d.actId * STAGES_PER_ACT;
  }

  dungeonCleared(d: DungeonDef): boolean {
    return !!this.save.dungeons[d.id]?.cleared;
  }

  refreshKeys(now = Date.now()): void {
    const s = this.save;
    if (s.keys >= KEY_CAP) {
      s.keysAt = now;
      return;
    }
    const n = Math.floor((now - s.keysAt) / KEY_REGEN_MS);
    if (n > 0) {
      s.keys = Math.min(KEY_CAP, s.keys + n);
      s.keysAt = s.keys >= KEY_CAP ? now : s.keysAt + n * KEY_REGEN_MS;
    }
  }

  nextKeyInMs(now = Date.now()): number {
    if (this.save.keys >= KEY_CAP) return 0;
    return Math.max(0, KEY_REGEN_MS - (now - this.save.keysAt));
  }

  private payDungeonEntry(): boolean {
    this.refreshKeys();
    if (this.save.keys > 0) {
      this.save.keys -= 1;
      return true;
    }
    if (this.save.crystals >= DUNGEON_CRYSTAL_COST) {
      this.save.crystals -= DUNGEON_CRYSTAL_COST;
      return true;
    }
    this.toast(`Need 1 Dungeon Key or ${DUNGEON_CRYSTAL_COST} Crystals`, 'bad');
    return false;
  }

  startDungeon(id: string): boolean {
    const d = getDungeon(id);
    if (!this.dungeonUnlocked(d)) {
      this.toast(`Clear Act ${d.actId} to unlock ${d.name}`, 'bad');
      return false;
    }
    if (this.mode === 'dungeon') return false;
    if (!this.payDungeonEntry()) return false;
    this.dungeonCtx = { dungeon: d, loot: [], xp: 0 };
    this.battle = new Battle(this.buildDungeonRun(d), this.heroInput(), this.rng);
    this.mode = 'dungeon';
    this.lives = MAX_LIVES;
    this.acc = 0;
    this.say(`Entering ${d.name}.`);
    this.emit({ t: 'run' });
    this.changed();
    return true;
  }

  sweepDungeon(id: string): boolean {
    const d = getDungeon(id);
    if (!this.dungeonCleared(d)) {
      this.toast('Clear the dungeon once to unlock Sweep', 'bad');
      return false;
    }
    if (this.mode === 'dungeon') return false;
    if (!this.payDungeonEntry()) return false;
    const loot: Item[] = [];
    let xp = 0;
    const baseTier = stageTier(d.actId, 5) + 0.3;
    for (let floor = 1; floor <= d.floors; floor++) {
      const type: NodeType = floor === d.floors ? 'boss' : floor === 5 ? 'miniboss' : 'trash';
      const source: DropSource =
        type === 'boss' ? 'dungeon-boss' : type === 'miniboss' ? 'dungeon-mini' : 'dungeon-floor';
      const drops = type === 'boss' ? 2 : 1;
      for (let i = 0; i < drops; i++) loot.push(this.rollDungeonItem(d, floor, source));
      const tier = baseTier + (floor - 1) * 0.12;
      const sc = (role: 'trash' | 'elite' | 'boss') => enemyScale(tier, role).xp;
      xp +=
        type === 'boss'
          ? sc('boss') + 2 * sc('trash') * 0.8
          : type === 'miniboss'
            ? sc('elite') + 3 * sc('trash')
            : 4 * sc('trash');
    }
    xp = Math.round(xp);
    const dc = this.save.dungeons[d.id];
    if (dc) dc.clears += 1;
    this.gainXp(xp);
    this.say(`Swept ${d.name}.`);
    this.emit({
      t: 'result',
      result: { kind: 'dungeon', title: `${d.name} - Sweep`, success: true, loot, xp },
    });
    this.changed();
    return true;
  }

  // ---- loot ---------------------------------------------------------------

  private stageGearLevel(): number {
    const { act, stage } = stageToActStage(this.save.currentStage);
    const [lo, hi] = getAct(act).dungeon?.glBand ?? [1, 2];
    return Math.round(lo + ((hi - lo) * (stage - 1)) / (STAGES_PER_ACT - 1));
  }

  private dropFromStage(source: DropSource): void {
    const item = rollItem(this.rng, {
      gearLevel: this.stageGearLevel(),
      rarity: rollRarity(this.rng, source),
    });
    this.queueLoot([item]);
  }

  private rollDungeonItem(d: DungeonDef, floor: number, source: DropSource): Item {
    const [lo, hi] = d.glBand;
    const gl = Math.round(lo + ((hi - lo) * (floor - 1)) / (d.floors - 1));
    return rollItem(this.rng, {
      gearLevel: gl,
      rarity: rollRarity(this.rng, source),
      setId: this.rng.pick(d.sets),
    });
  }

  isUpgrade(item: Item): boolean {
    return cpDelta(this.save.level, this.save.gear, item) > 0 && item.gearLevel <= this.save.level;
  }

  /** Put drops into the pickup queue (or auto-salvage non-upgrades when enabled). */
  queueLoot(items: Item[], salvageNonUpgrades = this.save.settings.autoSalvageWorse): void {
    let salvaged = 0;
    for (const item of items) {
      if (salvageNonUpgrades && !this.isUpgrade(item)) {
        this.applySalvage(item);
        salvaged += 1;
      } else {
        this.save.pending.push(item);
      }
    }
    if (salvaged > 0) this.toast(`Auto-salvaged ${salvaged} item${salvaged > 1 ? 's' : ''}`, 'info');
    const best = items.find((i) => i.rarity === 'legendary') ?? items.find((i) => i.rarity === 'epic');
    if (best) this.say(`Found ${RARITIES[best.rarity].label} ${best.name}!`);
    this.changed();
  }

  compareFor(item: Item): CompareInfo {
    const current = this.save.gear[item.slot];
    const statDeltas: Partial<Record<StatKey, number>> = {};
    for (const k of STAT_KEYS) {
      const d = (item.stats[k] ?? 0) - (current?.stats[k] ?? 0);
      if (d !== 0 || item.stats[k] !== undefined) statDeltas[k] = d;
    }
    return {
      current,
      candidate: item,
      cpDelta: cpDelta(this.save.level, this.save.gear, item),
      statDeltas,
      levelOk: item.gearLevel <= this.save.level,
    };
  }

  private removeFromQueues(item: Item): void {
    this.save.pending = this.save.pending.filter((i) => i.id !== item.id);
    this.save.bag = this.save.bag.filter((i) => i.id !== item.id);
  }

  private applySalvage(item: Item): void {
    const v = salvageValue(item);
    this.save.dust += v.dust;
    this.save.crystals += v.crystals;
    this.save.salvageCount += 1;
  }

  salvage(item: Item): void {
    this.removeFromQueues(item);
    this.applySalvage(item);
    this.toast(`Salvaged: +${salvageValue(item).dust} dust${salvageValue(item).crystals ? `, +${salvageValue(item).crystals} crystals` : ''}`, 'info');
    this.changed();
  }

  equip(item: Item, autoSalvageOld: boolean): boolean {
    if (item.gearLevel > this.save.level) {
      this.toast(`Requires hero Lv.${item.gearLevel}`, 'bad');
      return false;
    }
    this.removeFromQueues(item);
    const old = this.save.gear[item.slot];
    this.save.gear[item.slot] = item;
    this.save.settings.autoSalvageReplaced = autoSalvageOld;
    if (old) {
      if (autoSalvageOld || this.save.bag.length >= BAG_CAP) {
        this.applySalvage(old);
        if (!autoSalvageOld) this.toast('Bag full: old gear salvaged', 'info');
      } else {
        this.save.bag.push(old);
      }
    }
    this.refreshBattleHero(false);
    this.changed();
    return true;
  }

  /** Close the compare dialog without choosing: the item goes to the bag. */
  keepInBag(item: Item): void {
    const inPending = this.save.pending.some((i) => i.id === item.id);
    if (inPending) {
      this.save.pending = this.save.pending.filter((i) => i.id !== item.id);
      if (this.save.bag.length >= BAG_CAP) {
        this.applySalvage(item);
        this.toast('Bag full: item salvaged', 'info');
      } else {
        this.save.bag.push(item);
      }
      this.changed();
    }
  }

  setAutoSalvageReplaced(v: boolean): void {
    this.save.settings.autoSalvageReplaced = v;
    this.persist();
  }

  // ---- skills -------------------------------------------------------------

  get newSkillsAvailable(): boolean {
    return (Object.keys(SKILL_BY_ID) as SkillId[]).some(
      (id) => isUnlocked(id, this.save.level) && !this.save.seenSkills.includes(id),
    );
  }

  markSkillsSeen(): void {
    const all = (Object.keys(SKILL_BY_ID) as SkillId[]).filter((id) => isUnlocked(id, this.save.level));
    if (all.some((id) => !this.save.seenSkills.includes(id))) {
      this.save.seenSkills = all;
      this.changed();
    }
  }

  toggleSkill(id: SkillId): string | null {
    if (this.mode !== 'camp') return 'Retreat to camp to change your skill bar.';
    if (!isUnlocked(id, this.save.level)) return `Unlocks at Lv.${SKILL_BY_ID[id].unlockLevel}`;
    const lo = this.save.loadout;
    const idx = lo.indexOf(id);
    if (idx >= 0) {
      lo.splice(idx, 1);
      if (this.save.primary === id) this.save.primary = null;
    } else {
      if (lo.length >= BAR_SIZE) return 'Skill bar is full. Unequip a skill first.';
      lo.push(id);
    }
    this.changed();
    return null;
  }

  setPrimary(id: SkillId | null): string | null {
    if (this.mode !== 'camp') return 'Retreat to camp to change your skill bar.';
    if (id && SKILL_BY_ID[id].passive) return 'Passive skills cannot be Primary.';
    if (id && !this.save.loadout.includes(id)) return 'Equip the skill first.';
    this.save.primary = id;
    this.changed();
    return null;
  }

  // ---- quests -------------------------------------------------------------

  get quest(): QuestDef | null {
    return QUESTS[this.save.questIndex] ?? null;
  }

  questProgress(): number {
    const q = this.quest;
    if (!q) return 0;
    const dungeonClears = Object.values(this.save.dungeons).reduce((n, d) => n + d.clears, 0);
    return Math.min(
      q.goal,
      q.progress({
        salvageCount: this.save.salvageCount,
        stagesCleared: this.save.stagesCleared,
        level: this.save.level,
        dungeonClears,
      }),
    );
  }

  questReady(): boolean {
    const q = this.quest;
    return !!q && this.questProgress() >= q.goal;
  }

  claimQuest(): boolean {
    const q = this.quest;
    if (!q || !this.questReady()) return false;
    this.save.crystals += q.reward.crystals ?? 0;
    this.save.dust += q.reward.dust ?? 0;
    this.save.keys += q.reward.keys ?? 0;
    this.save.questIndex += 1;
    const parts = [
      q.reward.crystals ? `${q.reward.crystals} crystals` : '',
      q.reward.keys ? `${q.reward.keys} keys` : '',
      q.reward.dust ? `${q.reward.dust} dust` : '',
    ].filter(Boolean);
    this.toast(`Quest complete: ${parts.join(', ')}`, 'good');
    this.say(`Quest complete: ${q.text}`);
    this.changed();
    return true;
  }

  // ---- settings & dev -----------------------------------------------------

  setSpeed(speed: number): void {
    if (!availableSpeeds(this.save.level).includes(speed)) return;
    this.save.settings.speed = speed;
    this.changed();
  }

  cycleSpeed(): void {
    const speeds = availableSpeeds(this.save.level);
    const i = speeds.indexOf(this.speed);
    this.setSpeed(speeds[(i + 1) % speeds.length]);
  }

  setAutoSalvageWorse(v: boolean): void {
    this.save.settings.autoSalvageWorse = v;
    this.changed();
  }

  devGrantXp(n: number): void {
    this.gainXp(n);
    this.changed();
  }

  devGrantResources(): void {
    this.save.keys = Math.min(KEY_CAP, this.save.keys + 5);
    this.save.crystals += 500;
    this.save.dust += 200;
    this.changed();
  }

  devUnlockActs(): void {
    this.save.stagesCleared = PLAYABLE_STAGES;
    this.save.currentStage = PLAYABLE_STAGES - 1;
    this.save.nodeProgress = 0;
    if (this.mode === 'stage') this.startStage();
    this.changed();
  }

  devRollLoot(count = 5): void {
    const items: Item[] = [];
    for (let i = 0; i < count; i++) {
      items.push(
        rollItem(this.rng, {
          gearLevel: Math.max(1, Math.min(this.save.level, this.rng.int(1, 4))),
          rarity: rollRarity(this.rng, 'dungeon-floor'),
          setId: this.rng.pick(['ember-raider', 'cavern-cleaver', 'cavern-bulwark'] as const),
        }),
      );
    }
    this.queueLoot(items, false);
  }

  resetSave(): void {
    clearSave(this.storage);
    this.save = defaultSave();
    this.battle = null;
    this.mode = 'camp';
    this.dungeonCtx = null;
    this.lives = MAX_LIVES;
    this.emit({ t: 'run' });
    this.changed();
  }
}
