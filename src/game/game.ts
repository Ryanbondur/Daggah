import type { DungeonDef, NodeType } from '../data/acts';
import {
  ACTS,
  STAGE_NODES,
  enemyScale,
  getAct,
  getDungeon,
  stageRecCp,
  stageRecLevel,
  stageTier,
  stageTitle,
} from '../data/acts';
import {
  ASCENDED_NIGHTSCAR,
  ASCENDED_NIGHTSCAR_KEY_COST,
  ASCENDED_NIGHTSCAR_SEAL_COST,
  ASCENDED_SEAL_FRAGMENTS_PER_SEAL,
  ASCENDED_TIER_BUMP,
  formatAscendedEntryCost,
  isAscendedDungeon,
  sealsCraftableFrom,
} from './ascended';
import {
  CLAN_RAID_ALLY_SWING_MUL,
  CLAN_RAID_BOSS_ATK_MUL,
  CLAN_RAID_BOSS_HP_MUL,
  CLAN_RAID_BOSS_TIER_EXTRA,
  CLAN_RAID_DUNGEON,
  CLAN_RAID_ENEMY_ATK_MUL,
  CLAN_RAID_ENEMY_HP_MUL,
  CLAN_RAID_STAGE_FLOOR,
  CLAN_RAID_TIER_BUMP,
  CLAN_RAID_WEEKLY_ATTEMPTS,
  buildClanRaidAllies,
  clanRaidWeekKey,
  formatClanRaidReward,
  isClanRaidDungeon,
  rollClanRaidReward,
} from './clanRaid';
import { dungeonAllowsCapes } from '../data/capes';
import type { DropSource } from '../data/gear';
import {
  DROP_SET_IDS,
  RARITIES,
  capeDropChance,
  cpDelta,
  computeHero,
  filterSetsForClass,
  formatSalvageYield,
  itemAllowedForClass,
  lootCompareHighlight,
  rarityAtMost,
  rarityBelow,
  rollCape,
  rollItem,
  rollRarity,
  salvageValue,
  sellValue,
  starterGear,
  unequipWrongClassGear,
} from '../data/gear';
import { QUESTS, dailyCounterKey, dailyQuestForDay } from '../data/quests';
import type { QuestDef } from '../data/quests';
import { SEASON_MILESTONES } from '../data/season';
import {
  BAR_SIZE,
  DEFAULT_LOADOUT,
  PLAYSTYLES,
  SKILL_BY_ID,
  isUnlocked,
  playstyleCommitted,
  skillsForClass,
} from '../data/skills';
import {
  TUTORIAL_STEPS,
  currentTutorialStep,
  tutorialActive,
  type TutorialStep,
} from '../data/tutorial';
import { APP_CONTENT_VERSION, shouldShowWhatsNew } from '../data/whatsNew';
import type { HeroClass, Item, PlaystyleId, RarityId, SkillId, SlotId, StatKey } from '../data/types';
import { HERO_CLASSES, STAT_KEYS } from '../data/types';
import { addXp, availableSpeeds, maxEnergy } from '../data/xp';
import type { ClanData } from './clan';
import {
  CLAN_CREATE_COST,
  TOKEN_DAY_CAP,
  applyTokenCap,
  createClan,
  dayKey,
  fillAiRoster,
  joinClanByCode,
  missingClasses,
  normalizeClanMember,
  pickQueueRoster,
  rosterReady,
  sanitizeClanCode,
  sanitizeClanName,
  seasonDay,
  seasonRemainingMs,
} from './clan';
import type { ClanBracketId } from './clanBrackets';
import {
  BRACKET_TARGET_AVG_CP,
  CLAN_BRACKET_LABEL,
  assignBracket,
  bracketTokenReward,
  challengeUpAvailable,
  clanQueueFloorMessage,
  meetsClanQueueFloor,
  nextBracket,
  teamCpSum,
} from './clanBrackets';
import type { BattleEvent, HeroInput, RunDef } from './combat';
import { Battle, STEP } from './combat';
import type { PvpEvent, PvpFighterSnap, PvpResult } from './pvp';
import { buildOpponentRoster, simulatePvp } from './pvp';
import { nextNightscarPity } from './nightscarPity';
import type { Rng } from './rng';
import { defaultRng } from './rng';
import { flushCloudPush, scheduleCloudPush } from './cloudSave';
import { exportSaveCode, importSaveCode } from './saveCode';
import { applyOfflineProgress, type OfflineSummary } from './offline';
import type { DailyShopOffer } from './shop';
import { buildDailyOffers, hashDayKey } from './shop';
import type { SaveData, Storage } from './state';
import {
  BAG_CAP,
  DUNGEON_CRYSTAL_COST_PER_KEY,
  KEY_CAP,
  KEY_REGEN_MS,
  dungeonKeyCost,
  formatDungeonKeyCost,
  msUntilNextKey,
  PLAYABLE_STAGES,
  STAGES_PER_ACT,
  SWEEP_UNLOCK_CLEARS,
  clearSave,
  defaultSave,
  loadSave,
  stageToActStage,
  writeSave,
} from './state';
export type { OfflineSummary } from './offline';
export { OFFLINE_CAP_MS, OFFLINE_MIN_MS, formatOfflineToast } from './offline';

export type Mode = 'camp' | 'stage' | 'dungeon' | 'pvp';

export interface RunResult {
  kind: 'dungeon' | 'actClear' | 'stageFailed' | 'clanRaid';
  title: string;
  success: boolean;
  loot: Item[];
  xp: number;
  note?: string;
  /** Stage wipe tension: player CP vs recommended stage CP. */
  yourCp?: number;
  recCp?: number;
  /** Clear “farm gear → retry” nudge after wipe. */
  farmHint?: string;
  /** Clan Raid / seal craft spoils (never gear). */
  ascendedSeals?: number;
  ascendedSealFragments?: number;
}

/** Live fighter state while the Phaser stage replays a resolved 4v4. */
export interface PvpPlaybackFighter extends PvpFighterSnap {
  hp: number;
  dead: boolean;
  hitFlash: number;
  swingAnim: number;
  deathT: number;
}

export interface PvpPlayback {
  result: PvpResult;
  tokens: number;
  /** Sim-time cursor into result.playback. */
  t: number;
  nextIdx: number;
  /** Wall-clock hold after the end event before opening the breakdown. */
  holdT: number;
  /** Wall-clock intro before the first log event so teams are visible. */
  introT: number;
  /** Sim-seconds advanced per wall-clock second (before game.speed). */
  rate: number;
  fighters: PvpPlaybackFighter[];
  finished: boolean;
}

export type GameEvent =
  | { t: 'change' }
  | { t: 'run' }
  | { t: 'battle'; ev: BattleEvent }
  | { t: 'toast'; text: string; kind: 'good' | 'bad' | 'info' }
  | { t: 'levelUp'; level: number; newSkills: SkillId[] }
  | { t: 'result'; result: RunResult }
  | { t: 'pvpFx'; ev: PvpEvent }
  | { t: 'pvp'; result: PvpResult; tokens: number }
  | { t: 'chat'; text: string };

/** Clan Armorer catalog (GDD Clanforged). Legendaries are Nightscar-exclusive. */
export const CLAN_VENDOR: {
  slot: SlotId;
  rarity: 'epic' | 'legendary';
  cost: number;
  label: string;
  nightscarOnly?: boolean;
}[] = [
  { slot: 'weapon', rarity: 'epic', cost: 40, label: 'Clanforged Weapon (Epic)' },
  { slot: 'chest', rarity: 'epic', cost: 35, label: 'Clanforged Chest (Epic)' },
  { slot: 'helmet', rarity: 'epic', cost: 30, label: 'Clanforged Helm (Epic)' },
  { slot: 'ring', rarity: 'epic', cost: 30, label: 'Clanforged Ring (Epic)' },
  {
    slot: 'weapon',
    rarity: 'legendary',
    cost: 80,
    label: 'Clanforged Weapon (Legendary)',
    nightscarOnly: true,
  },
  {
    slot: 'medal',
    rarity: 'legendary',
    cost: 70,
    label: 'Clanforged Medal (Legendary)',
    nightscarOnly: true,
  },
  {
    slot: 'amulet',
    rarity: 'legendary',
    cost: 70,
    label: 'Clanforged Amulet (Legendary)',
    nightscarOnly: true,
  },
];

export interface ClanBracketStatus {
  teamCp: number;
  bracket: ClanBracketId;
  label: string;
  floorMet: boolean;
  floorMessage: string;
  challengeUpLeft: number;
  canChallengeUp: boolean;
  nextBracket: ClanBracketId | null;
  nextLabel: string | null;
  nightscarShopUnlocked: boolean;
}

type Listener = (e: GameEvent) => void;

interface DungeonCtx {
  dungeon: DungeonDef;
  loot: Item[];
  xp: number;
  /** Ascended Nightscar run (premium seal cost + ascended tables). */
  ascended?: boolean;
  /** Clan Raid boss — seals/fragments only, no gear drops. */
  clanRaid?: boolean;
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
  /** Authoritative sim result playing out on the Phaser stage before the breakdown modal. */
  pvpPlayback: PvpPlayback | null = null;
  readonly rng: Rng;
  readonly storage: Storage | undefined;
  private listeners = new Set<Listener>();
  private acc = 0;
  private dungeonCtx: DungeonCtx | null = null;
  /** Suppress per-event toasts/chat while applying AFK catch-up. */
  private quiet = false;

  constructor(storage?: Storage, rng: Rng = defaultRng) {
    this.storage = storage;
    this.rng = rng;
    this.save = loadSave(storage);
    this.stripWrongClassEquipped();
    this.refreshKeys();
    this.refreshDaily();
    this.refreshShop();
    this.noteSeasonLogin();
    if (!availableSpeeds(this.save.level).includes(this.save.settings.speed)) {
      this.save.settings.speed = 1;
    }
  }

  /**
   * Legacy / bad drops may leave wrong-class set pieces equipped.
   * Auto-unequip into bag on load (cannot re-equip); keeps salvage option.
   */
  private stripWrongClassEquipped(): void {
    if (!this.save.classPicked) return;
    const { gear, bag, moved } = unequipWrongClassGear(
      this.save.gear,
      this.save.bag,
      this.save.heroClass,
    );
    if (!moved.length) return;
    this.save.gear = gear;
    this.save.bag = bag;
    writeSave(this.storage, this.save);
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
    scheduleCloudPush(this.storage, this.save);
  }

  /** Shareable single-line save code (localStorage remains the fast cache). */
  exportSaveCode(): string {
    this.persist();
    return exportSaveCode(this.save);
  }

  /**
   * Replace the current save from an Export code.
   * @returns null on success, or an error message.
   */
  importSaveCode(code: string): string | null {
    const result = importSaveCode(code);
    if (!result.ok) return result.error;
    this.save = result.save;
    this.stripWrongClassEquipped();
    this.battle = null;
    this.pvpPlayback = null;
    this.mode = 'camp';
    this.dungeonCtx = null;
    this.lives = MAX_LIVES;
    this.persist();
    this.emit({ t: 'run' });
    this.emit({ t: 'change' });
    this.toast('Save imported', 'good');
    return null;
  }

  changed(): void {
    this.persist();
    this.emit({ t: 'change' });
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    if (this.quiet) return;
    this.emit({ t: 'toast', text, kind });
  }

  say(text: string): void {
    if (this.quiet) return;
    this.chat.push(text);
    if (this.chat.length > 30) this.chat.shift();
    this.emit({ t: 'chat', text });
  }

  beginQuiet(): void {
    this.quiet = true;
  }

  endQuiet(): void {
    this.quiet = false;
  }

  clearAccumulator(): void {
    this.acc = 0;
  }

  /**
   * Advance battle by one fixed sim step (used by AFK catch-up).
   * Does not apply the rAF dt clamp — callers own the wall-clock budget.
   */
  stepSim(dt: number = STEP): void {
    const b: Battle | null = this.battle;
    if (!b) return;
    b.update(dt);
    const events = b.drain();
    // Skip per-hit FX during AFK catch-up — resume would flood the scene.
    if (!this.quiet) {
      for (const ev of events) this.emit({ t: 'battle', ev });
    }
    this.processEvents(b, events);
  }

  /**
   * Apply offline / background gains for elapsed wall-clock ms (capped).
   * Campaign chains stages; dungeons finish the current paid run only.
   */
  applyOffline(elapsedMs: number, now = Date.now()): OfflineSummary | null {
    return applyOfflineProgress(this, elapsedMs, now);
  }

  // ---- derived ------------------------------------------------------------

  get totals() {
    return computeHero(this.save.level, this.save.gear, this.save.heroClass, this.save.loadout);
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
      heroClass: this.save.heroClass,
      stats: t.stats,
      effects: t.effects,
      loadout: this.save.loadout.filter((id) => isUnlocked(id, this.save.level)),
      primary: this.save.primary,
    };
  }

  /** Season / new-save class pick. Locked afterward until reset. */
  pickClass(heroClass: HeroClass): boolean {
    if (this.save.classPicked) return false;
    this.save.heroClass = heroClass;
    this.save.classPicked = true;
    this.save.gear = starterGear(heroClass);
    this.save.loadout = [...DEFAULT_LOADOUT[heroClass]];
    this.save.seenSkills = [...DEFAULT_LOADOUT[heroClass]];
    this.save.primary = null;
    this.say(`${heroClass} chosen. Class is locked for this season.`);
    this.changed();
    return true;
  }

  /** Nodes shown on the progress track. */
  get trackNodes(): NodeType[] {
    return this.battle ? this.battle.run.nodes.map((n) => n.type) : STAGE_NODES;
  }

  get title(): string {
    if (this.mode === 'pvp') return 'Clan 4v4';
    if (this.mode === 'dungeon' && this.dungeonCtx) {
      if (this.dungeonCtx.clanRaid) return 'Clan Raid';
      const floor = this.battle ? this.battle.nodeIndex + 1 : 1;
      const maxF = this.dungeonCtx.dungeon.floors;
      return `${this.dungeonCtx.dungeon.name} F${Math.min(maxF, floor)}`;
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
    return (this.mode !== 'camp' && !!this.battle) || this.mode === 'pvp';
  }

  get bg() {
    if (this.mode === 'pvp') return 'clan';
    if (this.battle) return this.battle.run.bg;
    return getAct(this.currentAct).bg;
  }

  // ---- loop ---------------------------------------------------------------

  tick(dtReal: number): void {
    if (this.mode === 'pvp' && this.pvpPlayback && !this.paused) {
      this.tickPvp(dtReal);
      return;
    }
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
    this.persist();
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
      // Clan Raid: no gear — seals/fragments award on clear only.
      if (!ctx.clanRaid) {
        const source = this.dungeonDropSource(ctx.dungeon, type);
        const drops = type === 'boss' ? 2 : 1;
        for (let i = 0; i < drops; i++) {
          ctx.loot.push(this.rollDungeonItem(ctx.dungeon, index + 1, source));
        }
      }
      this.say(ctx.clanRaid ? 'Raid boss staggered…' : `Floor ${index + 1} cleared.`);
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
      if (ctx.clanRaid) {
        this.emit({
          t: 'result',
          result: {
            kind: 'clanRaid',
            title: 'Clan Raid - Failed',
            success: false,
            loot: [],
            xp: ctx.xp,
            note: 'Out of lives. No seals this attempt.',
          },
        });
      } else {
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
      }
    } else {
      const act = this.currentAct;
      const stage = this.currentStageNo;
      const title = stageTitle(act, stage);
      const yourCp = this.cp;
      const recCp = stageRecCp(act, stage);
      const underpowered = yourCp < recCp;
      const farmHint = underpowered
        ? 'Farm gear → retry: your CP is below this stage. Clear the act dungeon for set pieces, then push again.'
        : 'Farm gear → retry: swap skills or farm the act dungeon for an edge, then push again.';
      this.endRun();
      this.emit({
        t: 'result',
        result: {
          kind: 'stageFailed',
          title,
          success: false,
          loot: [],
          xp: 0,
          note: 'Out of lives. Stage progress is kept.',
          yourCp,
          recCp,
          farmHint,
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
      this.bumpDaily('stages');
      this.toast(`Stage ${act}-${stage} cleared  +20 crystals`, 'good');
      actCleared = this.save.stagesCleared % STAGES_PER_ACT === 0;
    } else {
      this.bumpDaily('stages');
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
              : 'Acts 7-10 arrive in a future update. Farm dungeons and gear up!'
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
    if (ctx.clanRaid) {
      this.onClanRaidClear(ctx);
      return;
    }
    const rec = this.save.dungeons[ctx.dungeon.id] ?? { cleared: false, clears: 0 };
    rec.cleared = true;
    rec.clears += 1;
    this.save.dungeons[ctx.dungeon.id] = rec;
    this.resolveNightscarPity(ctx.dungeon, ctx.loot);
    this.bumpDaily('dungeons');
    this.advanceTutorial('dungeon-key');
    this.dungeonCtx = null;
    this.endRun();
    this.say(`${ctx.dungeon.name} cleared!`);
    const entryNote = isAscendedDungeon(ctx.dungeon)
      ? formatAscendedEntryCost()
      : formatDungeonKeyCost(dungeonKeyCost(ctx.dungeon.actId));
    this.emit({
      t: 'result',
      result: {
        kind: 'dungeon',
        title: `${ctx.dungeon.name} - Cleared`,
        success: true,
        loot: ctx.loot,
        xp: ctx.xp,
        note:
          rec.clears === SWEEP_UNLOCK_CLEARS
            ? `Sweep unlocked: loot instantly for ${entryNote}.`
            : rec.clears < SWEEP_UNLOCK_CLEARS
              ? `Sweep unlocks after ${SWEEP_UNLOCK_CLEARS} clears (${rec.clears}/${SWEEP_UNLOCK_CLEARS}).`
              : undefined,
      },
    });
    this.changed();
  }

  private onClanRaidClear(ctx: DungeonCtx): void {
    const reward = rollClanRaidReward(this.rng);
    this.save.ascendedSeals += reward.ascendedSeals;
    this.save.ascendedSealFragments += reward.ascendedSealFragments;
    this.dungeonCtx = null;
    this.endRun();
    const label = formatClanRaidReward(reward);
    this.say(`Clan Raid cleared! ${label}.`);
    this.toast(label, 'good');
    this.emit({
      t: 'result',
      result: {
        kind: 'clanRaid',
        title: 'Clan Raid - Cleared',
        success: true,
        loot: [],
        xp: ctx.xp,
        ascendedSeals: reward.ascendedSeals,
        ascendedSealFragments: reward.ascendedSealFragments,
        note: `${label}. Craft fragments into Seals in Adventure (5 → 1).`,
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
      const newSkills = skillsForClass(this.save.heroClass)
        .map((s) => s.id)
        .filter((id) => SKILL_BY_ID[id].unlockLevel > before && SKILL_BY_ID[id].unlockLevel <= res.level);
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
    const ascended = isAscendedDungeon(d);
    const raid = isClanRaidDungeon(d);
    const bump = ascended ? ASCENDED_TIER_BUMP : raid ? CLAN_RAID_TIER_BUMP : 0;
    const baseTier = stageTier(d.actId, 5) + 0.3 + bump;
    const rec = stageRecLevel(d.actId, 5);
    const nodes = raid
      ? ([{ type: 'boss' as const, tier: baseTier + CLAN_RAID_BOSS_TIER_EXTRA, recLevel: rec }] as const)
      : Array.from({ length: d.floors }, (_, i) => {
          const floor = i + 1;
          const type: NodeType = floor === d.floors ? 'boss' : floor === 5 ? 'miniboss' : 'trash';
          return { type, tier: baseTier + i * 0.12, recLevel: rec };
        });
    return {
      kind: 'dungeon',
      title: d.name,
      bg: raid ? 'clan' : a.bg,
      actId: d.actId,
      nodes: [...nodes],
      trash: a.trash,
      elite: a.elite,
      boss: a.boss,
      startNode: 0,
      startEnergy: 1,
      walkTime: raid ? 0.8 : 1.3,
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
    this.advanceTutorial('auto-attack');
    if (!this.save.classPicked) {
      this.toast('Pick a class first', 'info');
      return;
    }
    if (this.mode === 'pvp') {
      this.finishPvpPlayback();
      return;
    }
    if (this.battle && this.mode !== 'camp') return;
    this.startStage();
    this.say(`Entering ${this.title}.`);
  }

  retreat(): void {
    if (this.mode === 'pvp') {
      this.finishPvpPlayback();
      return;
    }
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

  /** Sweep unlocks only after this dungeon has been fully cleared N times. */
  dungeonSweepUnlocked(d: DungeonDef): boolean {
    return (this.save.dungeons[d.id]?.clears ?? 0) >= SWEEP_UNLOCK_CLEARS;
  }

  dungeonClearCount(d: DungeonDef): number {
    return this.save.dungeons[d.id]?.clears ?? 0;
  }

  /** True when the player has enough dungeon keys for this act’s Enter/Sweep cost. */
  canAffordDungeonKeys(actId: number): boolean {
    this.refreshKeys();
    return this.save.keys >= dungeonKeyCost(actId);
  }

  /** How many more keys fit under the pouch cap. */
  dungeonKeyRoom(): number {
    this.refreshKeys();
    return Math.max(0, KEY_CAP - this.save.keys);
  }

  /** Crystal cost to buy `count` dungeon keys (explicit purchase — never a silent bypass). */
  crystalCostForDungeonKeys(count: number): number {
    return Math.max(0, Math.floor(count)) * DUNGEON_CRYSTAL_COST_PER_KEY;
  }

  /**
   * Buy dungeon keys with Crystals. Keys only — does not enter/sweep.
   * Returns an error string, or null on success.
   */
  buyDungeonKeys(count: number): string | null {
    this.refreshKeys();
    const n = Math.floor(count);
    if (n < 1) return 'Pick at least 1 Key to buy.';
    const room = this.dungeonKeyRoom();
    if (n > room) return `Key pouch full (${this.save.keys}/${KEY_CAP}).`;
    const cost = this.crystalCostForDungeonKeys(n);
    if (this.save.crystals < cost) {
      return `Need ${cost} Crystals (you have ${this.save.crystals}).`;
    }
    this.save.crystals -= cost;
    this.save.keys += n;
    this.toast(`Bought ${formatDungeonKeyCost(n)} for ${cost} Crystals`, 'good');
    this.changed();
    return null;
  }

  /** Ascended Nightscar: seals (keys only if ASCENDED_NIGHTSCAR_KEY_COST > 0). */
  canAffordAscendedEntry(): boolean {
    this.refreshKeys();
    if (this.save.ascendedSeals < ASCENDED_NIGHTSCAR_SEAL_COST) return false;
    if (ASCENDED_NIGHTSCAR_KEY_COST > 0 && this.save.keys < ASCENDED_NIGHTSCAR_KEY_COST) {
      return false;
    }
    return true;
  }

  ascendedUnlocked(): boolean {
    return this.dungeonUnlocked(getDungeon('nightscar-apex'));
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
    return msUntilNextKey(this.save.keys, this.save.keysAt, now);
  }

  /** Spend keys only — crystals never bypass; buy keys via `buyDungeonKeys` first. */
  private payDungeonEntry(actId: number): boolean {
    this.refreshKeys();
    const keysNeeded = dungeonKeyCost(actId);
    if (this.save.keys >= keysNeeded) {
      this.save.keys -= keysNeeded;
      return true;
    }
    this.toast(`Need ${formatDungeonKeyCost(keysNeeded)} to enter or Sweep`, 'bad');
    return false;
  }

  private payAscendedEntry(): boolean {
    this.refreshKeys();
    const cost = formatAscendedEntryCost();
    if (this.save.ascendedSeals < ASCENDED_NIGHTSCAR_SEAL_COST) {
      this.toast(`Need ${cost} (you have ${this.save.ascendedSeals} seals)`, 'bad');
      return false;
    }
    if (ASCENDED_NIGHTSCAR_KEY_COST > 0 && this.save.keys < ASCENDED_NIGHTSCAR_KEY_COST) {
      this.toast(`Need ${cost} (you have ${this.save.keys} keys)`, 'bad');
      return false;
    }
    this.save.ascendedSeals -= ASCENDED_NIGHTSCAR_SEAL_COST;
    if (ASCENDED_NIGHTSCAR_KEY_COST > 0) {
      this.save.keys -= ASCENDED_NIGHTSCAR_KEY_COST;
    }
    return true;
  }

  startDungeon(id: string): boolean {
    if (id === ASCENDED_NIGHTSCAR.id) return this.startAscendedDungeon();
    if (isClanRaidDungeon({ id })) return this.startClanRaid() === null;
    const d = getDungeon(id);
    if (!this.dungeonUnlocked(d)) {
      this.toast(`Clear Act ${d.actId} to unlock ${d.name}`, 'bad');
      return false;
    }
    if (this.mode === 'dungeon') return false;
    if (!this.payDungeonEntry(d.actId)) return false;
    this.dungeonCtx = { dungeon: d, loot: [], xp: 0 };
    this.battle = new Battle(this.buildDungeonRun(d), this.heroInput(), this.rng);
    this.mode = 'dungeon';
    this.lives = MAX_LIVES;
    this.acc = 0;
    this.advanceTutorial('dungeon-key');
    this.say(`Entering ${d.name}.`);
    this.emit({ t: 'run' });
    this.changed();
    return true;
  }

  /** Ascended Nightscar Enter — 1 Ascended Seal (no key surcharge). */
  startAscendedDungeon(): boolean {
    const d = ASCENDED_NIGHTSCAR;
    if (!this.ascendedUnlocked()) {
      this.toast('Clear Nightscar Depths to unlock Ascended Nightscar', 'bad');
      return false;
    }
    if (this.mode === 'dungeon' || this.mode === 'pvp') return false;
    if (this.battle) {
      this.toast('Retreat to camp first', 'bad');
      return false;
    }
    if (!this.payAscendedEntry()) return false;
    this.dungeonCtx = { dungeon: d, loot: [], xp: 0, ascended: true };
    this.battle = new Battle(this.buildDungeonRun(d), this.heroInput(), this.rng);
    this.mode = 'dungeon';
    this.lives = MAX_LIVES;
    this.acc = 0;
    this.say(`Entering Ascended Nightscar (−${formatAscendedEntryCost()}).`);
    this.emit({ t: 'run' });
    this.changed();
    return true;
  }

  sweepDungeon(id: string): boolean {
    if (id === ASCENDED_NIGHTSCAR.id) return this.sweepAscendedDungeon();
    const d = getDungeon(id);
    if (!this.dungeonSweepUnlocked(d)) {
      const n = this.dungeonClearCount(d);
      this.toast(
        `Clear this dungeon ${SWEEP_UNLOCK_CLEARS} times to unlock Sweep (${n}/${SWEEP_UNLOCK_CLEARS})`,
        'bad',
      );
      return false;
    }
    if (this.mode === 'dungeon') return false;
    if (!this.payDungeonEntry(d.actId)) return false;
    const loot: Item[] = [];
    let xp = 0;
    const baseTier = stageTier(d.actId, 5) + 0.3;
    for (let floor = 1; floor <= d.floors; floor++) {
      const type: NodeType = floor === d.floors ? 'boss' : floor === 5 ? 'miniboss' : 'trash';
      const source = this.dungeonDropSource(d, type);
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
    this.resolveNightscarPity(d, loot);
    this.gainXp(xp);
    this.say(`Swept ${d.name}.`);
    this.emit({
      t: 'result',
      result: { kind: 'dungeon', title: `${d.name} - Sweep`, success: true, loot, xp },
    });
    this.changed();
    return true;
  }

  /** Ascended Nightscar Sweep — same premium cost as Enter. */
  sweepAscendedDungeon(): boolean {
    const d = ASCENDED_NIGHTSCAR;
    if (!this.dungeonSweepUnlocked(d)) {
      const n = this.dungeonClearCount(d);
      this.toast(
        `Clear Ascended Nightscar ${SWEEP_UNLOCK_CLEARS} times to unlock Sweep (${n}/${SWEEP_UNLOCK_CLEARS})`,
        'bad',
      );
      return false;
    }
    if (this.mode === 'dungeon' || this.mode === 'pvp' || this.battle) return false;
    if (!this.payAscendedEntry()) return false;
    const loot: Item[] = [];
    let xp = 0;
    const baseTier = stageTier(d.actId, 5) + 0.3 + ASCENDED_TIER_BUMP;
    for (let floor = 1; floor <= d.floors; floor++) {
      const type: NodeType = floor === d.floors ? 'boss' : floor === 5 ? 'miniboss' : 'trash';
      const source = this.dungeonDropSource(d, type);
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
    const dc = this.save.dungeons[d.id] ?? { cleared: true, clears: 0 };
    dc.cleared = true;
    dc.clears += 1;
    this.save.dungeons[d.id] = dc;
    this.resolveNightscarPity(d, loot);
    this.gainXp(xp);
    this.say(`Swept Ascended Nightscar.`);
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

  private dungeonDropSource(d: DungeonDef, type: NodeType): DropSource {
    if (isAscendedDungeon(d)) {
      return type === 'boss' ? 'ascended-boss' : type === 'miniboss' ? 'ascended-mini' : 'ascended-floor';
    }
    if (d.endgame) {
      return type === 'boss' ? 'nightscar-boss' : type === 'miniboss' ? 'nightscar-mini' : 'nightscar-floor';
    }
    return type === 'boss' ? 'dungeon-boss' : type === 'miniboss' ? 'dungeon-mini' : 'dungeon-floor';
  }

  private rollDungeonItem(d: DungeonDef, floor: number, source: DropSource): Item {
    const [lo, hi] = d.glBand;
    const gl = Math.round(lo + ((hi - lo) * (floor - 1)) / Math.max(1, d.floors - 1));
    const pity = isAscendedDungeon(d)
      ? this.save.ascendedPity
      : d.endgame
        ? this.save.nightscarPity
        : 0;
    const rarity = rollRarity(this.rng, source, pity);
    // Late acts / Nightscar / Ascended: chance for a class-locked cape (not a set piece).
    if (dungeonAllowsCapes(d.actId, d.endgame) && this.rng.chance(capeDropChance(source))) {
      const cape = rollCape(this.rng, {
        gearLevel: gl,
        rarity,
        heroClass: this.save.heroClass,
        actId: d.actId,
      });
      if (cape) return cape;
    }
    const setPool = filterSetsForClass(d.sets, this.save.heroClass);
    return rollItem(this.rng, {
      gearLevel: gl,
      rarity,
      // Wrong-class set pools (e.g. Warrior in Quillstorm dungeon) → plain gear.
      setId: setPool.length ? this.rng.pick(setPool) : undefined,
    });
  }

  /** Soft pity tracks successful Nightscar / Ascended clears/sweeps separately. */
  private resolveNightscarPity(d: DungeonDef, loot: Item[]): void {
    if (isAscendedDungeon(d)) {
      this.save.ascendedPity = nextNightscarPity(this.save.ascendedPity, loot);
      return;
    }
    if (!d.endgame) return;
    this.save.nightscarPity = nextNightscarPity(this.save.nightscarPity, loot);
  }

  isUpgrade(item: Item): boolean {
    return lootCompareHighlight(
      this.save.level,
      this.save.gear,
      item,
      this.save.heroClass,
      this.save.loadout,
    ).upgrade;
  }

  /** Whether loot should auto-salvage given settings (rarity threshold and/or worse-than-equipped). */
  shouldAutoSalvage(item: Item, salvageNonUpgrades = this.save.settings.autoSalvageWorse): boolean {
    const max = this.save.settings.autoSalvageRarityMax;
    if (max && rarityAtMost(item, max)) return true;
    return salvageNonUpgrades && !this.isUpgrade(item);
  }

  /** Put drops into the pickup queue (or auto-salvage by threshold / non-upgrade rules). */
  queueLoot(items: Item[], salvageNonUpgrades = this.save.settings.autoSalvageWorse): void {
    let salvaged = 0;
    let dust = 0;
    let crystals = 0;
    for (const item of items) {
      if (this.shouldAutoSalvage(item, salvageNonUpgrades)) {
        const v = this.applySalvage(item);
        salvaged += 1;
        dust += v.dust;
        crystals += v.crystals;
      } else {
        this.save.pending.push(item);
      }
    }
    if (salvaged > 0) {
      this.toast(`Auto-salvaged ${salvaged}: ${formatSalvageYield(dust, crystals)}`, 'good');
    }
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
      cpDelta: cpDelta(this.save.level, this.save.gear, item, this.save.heroClass, this.save.loadout),
      statDeltas,
      levelOk: item.gearLevel <= this.save.level,
    };
  }

  private removeFromQueues(item: Item): void {
    this.save.pending = this.save.pending.filter((i) => i.id !== item.id);
    this.save.bag = this.save.bag.filter((i) => i.id !== item.id);
  }

  private applySalvage(item: Item): { dust: number; crystals: number } {
    const v = salvageValue(item);
    this.save.dust += v.dust;
    this.save.crystals += v.crystals;
    this.save.salvageCount += 1;
    this.bumpDaily('salvage');
    return v;
  }

  salvage(item: Item): void {
    this.removeFromQueues(item);
    const v = this.applySalvage(item);
    this.advanceTutorial('first-drop');
    this.toast(`Salvaged: ${formatSalvageYield(v.dust, v.crystals)}`, 'good');
    this.changed();
  }

  /** Salvage every bag item strictly below the given rarity ceiling. */
  salvageBagBelow(ceiling: RarityId): number {
    const targets = this.save.bag.filter((i) => rarityBelow(i, ceiling));
    let dust = 0;
    let crystals = 0;
    for (const item of targets) {
      this.removeFromQueues(item);
      const v = this.applySalvage(item);
      dust += v.dust;
      crystals += v.crystals;
    }
    if (targets.length) {
      this.advanceTutorial('first-drop');
      this.toast(
        `Salvaged ${targets.length} below ${RARITIES[ceiling].label}: ${formatSalvageYield(dust, crystals)}`,
        'good',
      );
      this.changed();
    }
    return targets.length;
  }

  /** Salvage every bag item that is not a CP upgrade (no rarity filter). */
  salvageBagNonUpgrades(): { count: number; dust: number; crystals: number } {
    const targets = this.save.bag.filter((i) => !this.isUpgrade(i));
    let dust = 0;
    let crystals = 0;
    for (const item of targets) {
      this.removeFromQueues(item);
      const v = this.applySalvage(item);
      dust += v.dust;
      crystals += v.crystals;
    }
    if (targets.length) {
      this.advanceTutorial('first-drop');
      this.toast(
        `Salvaged ${targets.length} non-upgrade${targets.length > 1 ? 's' : ''}: ${formatSalvageYield(dust, crystals)}`,
        'good',
      );
      this.changed();
    }
    return { count: targets.length, dust, crystals };
  }

  /** Sell every bag item strictly below the given rarity for gold (no dust/crystals). */
  sellBagBelow(ceiling: RarityId): { count: number; gold: number } {
    const targets = this.save.bag.filter((i) => rarityBelow(i, ceiling));
    let gold = 0;
    for (const item of targets) {
      gold += sellValue(item);
      this.removeFromQueues(item);
    }
    if (targets.length) {
      this.save.gold += gold;
      this.toast(`Sold ${targets.length} below ${RARITIES[ceiling].label}: +${gold} gold`, 'good');
      this.changed();
    }
    return { count: targets.length, gold };
  }

  equip(item: Item, autoSalvageOld: boolean): boolean {
    if (item.gearLevel > this.save.level) {
      this.toast(`Requires hero Lv.${item.gearLevel}`, 'bad');
      return false;
    }
    if (!itemAllowedForClass(item, this.save.heroClass)) {
      this.toast(item.capeId ? 'Wrong class for this cape' : 'Wrong class for this set', 'bad');
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
    this.advanceTutorial('first-drop');
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
    return skillsForClass(this.save.heroClass).some(
      (s) => isUnlocked(s.id, this.save.level) && !this.save.seenSkills.includes(s.id),
    );
  }

  markSkillsSeen(): void {
    const all = skillsForClass(this.save.heroClass)
      .map((s) => s.id)
      .filter((id) => isUnlocked(id, this.save.level));
    if (all.some((id) => !this.save.seenSkills.includes(id))) {
      this.save.seenSkills = [...new Set([...this.save.seenSkills, ...all])];
      this.changed();
    }
  }

  /**
   * Equip / unequip a skill. When the bar is full, pass `replaceIndex` (0..3)
   * to swap into that slot — needed to re-equip passives without a free slot.
   * Equipping a class passive replaces any other equipped passive (one choice).
   */
  toggleSkill(id: SkillId, replaceIndex?: number): string | null {
    if (this.mode !== 'camp') return 'Retreat to camp to change your skill bar.';
    if (PLAYSTYLES[SKILL_BY_ID[id].playstyle].heroClass !== this.save.heroClass) {
      return 'That skill belongs to another class.';
    }
    if (!isUnlocked(id, this.save.level)) return `Unlocks at Lv.${SKILL_BY_ID[id].unlockLevel}`;
    const lo = this.save.loadout;
    const idx = lo.indexOf(id);
    const def = SKILL_BY_ID[id];
    if (idx >= 0) {
      lo.splice(idx, 1);
      if (this.save.primary === id) this.save.primary = null;
    } else if (def.passive) {
      // One passive at a time: swap over the other class passive when present.
      const otherIdx = lo.findIndex((x) => SKILL_BY_ID[x]?.passive);
      if (otherIdx >= 0) {
        lo[otherIdx] = id;
      } else if (lo.length >= BAR_SIZE) {
        if (replaceIndex === undefined || replaceIndex < 0 || replaceIndex >= lo.length) {
          return 'Skill bar is full. Tap a bar slot to replace, then Equip.';
        }
        const old = lo[replaceIndex]!;
        lo[replaceIndex] = id;
        if (this.save.primary === old) this.save.primary = null;
      } else {
        lo.push(id);
      }
    } else if (lo.length >= BAR_SIZE) {
      if (replaceIndex === undefined || replaceIndex < 0 || replaceIndex >= lo.length) {
        return 'Skill bar is full. Tap a bar slot to replace, then Equip.';
      }
      const old = lo[replaceIndex]!;
      lo[replaceIndex] = id;
      if (this.save.primary === old) this.save.primary = null;
    } else {
      lo.push(id);
    }
    if (lo.length >= BAR_SIZE) {
      this.bumpDaily('fullLoadout');
      this.advanceTutorial('equip-skills');
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

  private questInput() {
    const dungeonClearsById: Record<string, number> = {};
    let dungeonClears = 0;
    for (const [id, d] of Object.entries(this.save.dungeons)) {
      dungeonClearsById[id] = d.clears;
      dungeonClears += d.clears;
    }
    return {
      salvageCount: this.save.salvageCount,
      stagesCleared: this.save.stagesCleared,
      level: this.save.level,
      dungeonClears,
      clanWins: this.save.clanWins,
      dungeonClearsById,
    };
  }

  get quest(): QuestDef | null {
    return QUESTS[this.save.questIndex] ?? null;
  }

  questProgress(): number {
    const q = this.quest;
    if (!q) return 0;
    return Math.min(q.goal, q.progress(this.questInput()));
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

  refreshDaily(now = Date.now()): void {
    const key = dayKey(now);
    if (this.save.daily.dayKey === key) return;
    const day = seasonDay(this.save.season, now);
    const q = dailyQuestForDay(day - 1);
    this.save.daily = {
      dayKey: key,
      questId: q.id,
      stages: 0,
      dungeons: 0,
      salvage: 0,
      clan: 0,
      fullLoadout: this.save.loadout.length >= BAR_SIZE ? 1 : 0,
      claimed: false,
    };
  }

  /** Roll / rotate the Town daily merchant once per calendar day. */
  refreshShop(now = Date.now()): void {
    const key = dayKey(now);
    if (this.save.shop?.dayKey === key && typeof this.save.shop.seed === 'number') return;
    this.save.shop = {
      dayKey: key,
      seed: hashDayKey(key),
      purchased: [],
    };
    this.persist();
  }

  /** Today's merchant slate (refreshes when the calendar day changes). */
  dailyShopOffers(now = Date.now()): DailyShopOffer[] {
    this.refreshShop(now);
    return buildDailyOffers(this.save.shop.seed, {
      level: this.save.level,
      stagesCleared: this.save.stagesCleared,
      heroClass: this.save.heroClass,
      purchased: this.save.shop.purchased,
    });
  }

  /** Buy a daily merchant offer for Gold. Returns error or null. */
  buyDailyShop(index: number, now = Date.now()): string | null {
    const offers = this.dailyShopOffers(now);
    const offer = offers[index];
    if (!offer) return 'Unknown offer.';
    if (offer.purchased || this.save.shop.purchased.includes(index)) return 'Already purchased today.';
    if (!itemAllowedForClass(offer.item, this.save.heroClass)) {
      return offer.item.capeId ? 'Wrong class for this cape.' : 'Wrong class for this set.';
    }
    if (this.save.gold < offer.price) return `Need ${offer.price} gold.`;
    this.save.gold -= offer.price;
    this.save.shop.purchased = [...this.save.shop.purchased, index];
    this.queueLoot([offer.item], false);
    this.toast(`Bought ${offer.item.name} (−${offer.price} gold)`, 'good');
    this.changed();
    return null;
  }

  noteSeasonLogin(now = Date.now()): void {
    const key = dayKey(now);
    if (!this.save.seasonLoginDays.includes(key)) {
      this.save.seasonLoginDays.push(key);
      this.persist();
    }
  }

  get dailyQuest(): QuestDef {
    this.refreshDaily();
    return dailyQuestForDay(Math.max(0, this.seasonDay - 1));
  }

  dailyProgress(): number {
    this.refreshDaily();
    const q = this.dailyQuest;
    const key = dailyCounterKey(q.id);
    const v = this.save.daily[key];
    return Math.min(q.goal, typeof v === 'number' ? v : 0);
  }

  dailyReady(): boolean {
    return !this.save.daily.claimed && this.dailyProgress() >= this.dailyQuest.goal;
  }

  claimDaily(): boolean {
    this.refreshDaily();
    const q = this.dailyQuest;
    if (this.save.daily.claimed || this.dailyProgress() < q.goal) return false;
    this.save.crystals += q.reward.crystals ?? 0;
    this.save.dust += q.reward.dust ?? 0;
    this.save.keys += q.reward.keys ?? 0;
    this.save.daily.claimed = true;
    this.toast(`Daily complete: ${q.text}`, 'good');
    this.changed();
    return true;
  }

  private bumpDaily(key: 'stages' | 'dungeons' | 'salvage' | 'clan' | 'fullLoadout'): void {
    this.refreshDaily();
    this.save.daily[key] += 1;
  }

  // ---- tutorial -----------------------------------------------------------

  get tutorialStep(): TutorialStep | null {
    return currentTutorialStep(this.save.tutorial);
  }

  get tutorialIsActive(): boolean {
    return tutorialActive(this.save.tutorial);
  }

  canSkipTutorial(): boolean {
    return this.save.tutorial.everCompleted;
  }

  skipTutorial(): void {
    if (!this.canSkipTutorial()) return;
    this.save.tutorial.skipped = true;
    this.save.tutorial.step = TUTORIAL_STEPS.length;
    this.changed();
  }

  advanceTutorial(stepId: string): void {
    const cur = this.tutorialStep;
    if (!cur || cur.id !== stepId) return;
    this.save.tutorial.step += 1;
    if (this.save.tutorial.step >= TUTORIAL_STEPS.length) {
      this.save.tutorial.everCompleted = true;
      this.toast('Tutorial complete', 'good');
      this.say('Tutorial complete. Season Board tracks mid-act goals.');
    }
    this.changed();
  }

  // ---- what's new ---------------------------------------------------------

  shouldShowWhatsNew(): boolean {
    // First-run coach takes priority; notes are for returning players after a bump.
    if (this.tutorialIsActive) return false;
    return shouldShowWhatsNew(this.save.lastSeenContentVersion);
  }

  dismissWhatsNew(): void {
    this.save.lastSeenContentVersion = APP_CONTENT_VERSION;
    this.changed();
  }

  // ---- season milestones --------------------------------------------------

  seasonProgressInput() {
    const dungeonClears = Object.values(this.save.dungeons).reduce((n, d) => n + d.clears, 0);
    return {
      seasonDay: this.seasonDay,
      stagesCleared: this.save.stagesCleared,
      clanWins: this.save.clanWins,
      dungeonClears,
      loginDays: this.save.seasonLoginDays.length,
    };
  }

  claimSeasonMilestone(id: string): string | null {
    const def = SEASON_MILESTONES.find((m) => m.id === id);
    if (!def) return 'Unknown milestone.';
    if (this.save.seasonClaimed.includes(id)) return 'Already claimed.';
    const prog = def.progress(this.seasonProgressInput());
    if (prog < def.goal) return `Progress ${prog}/${def.goal}.`;
    this.save.seasonClaimed.push(id);
    this.save.crystals += def.reward.crystals ?? 0;
    this.save.dust += def.reward.dust ?? 0;
    this.toast(`Season: ${def.text}`, 'good');
    this.changed();
    return null;
  }

  /** True when equipped set bonuses are gated by a committed playstyle. */
  playstyleSetActive(style: PlaystyleId): boolean {
    return playstyleCommitted(this.save.loadout, style);
  }

  recommendPlaystyleSet(): PlaystyleId | null {
    const styles = Object.keys(PLAYSTYLES) as PlaystyleId[];
    for (const s of styles) {
      if (PLAYSTYLES[s].heroClass !== this.save.heroClass) continue;
      if (playstyleCommitted(this.save.loadout, s)) return s;
    }
    return null;
  }

  // ---- clan / season / PvP -----------------------------------------------

  refreshClanTokenDay(now = Date.now()): void {
    const key = dayKey(now);
    if (this.save.clanTokensDayKey !== key) {
      this.save.clanTokensDayKey = key;
      this.save.clanTokensEarnedToday = 0;
    }
  }

  get clan(): ClanData | null {
    return this.save.clan;
  }

  get seasonDay(): number {
    return seasonDay(this.save.season);
  }

  get seasonRemainingMs(): number {
    return seasonRemainingMs(this.save.season);
  }

  syncPlayerClanMember(): void {
    const clan = this.save.clan;
    if (!clan) return;
    const me = clan.members.find((m) => m.isPlayer);
    if (!me) return;
    me.heroClass = this.save.heroClass;
    me.level = this.save.level;
    me.cp = this.cp;
    me.loadout = [...this.save.loadout];
    me.primary = this.save.primary;
  }

  createClan(name: string): string | null {
    if (this.save.clan) return 'Already in a clan.';
    if (!this.save.classPicked) return 'Pick a class first.';
    if (this.save.crystals < CLAN_CREATE_COST) return `Need ${CLAN_CREATE_COST} crystals to found a clan.`;
    this.save.crystals -= CLAN_CREATE_COST;
    this.save.clan = createClan(this.rng, sanitizeClanName(name), {
      heroClass: this.save.heroClass,
      level: this.save.level,
      cp: this.cp,
      loadout: this.save.loadout,
      primary: this.save.primary,
    });
    this.say(`Clan ${this.save.clan.name} founded. Code ${this.save.clan.code}.`);
    this.toast(`Clan founded (−${CLAN_CREATE_COST} crystals)`, 'good');
    this.advanceTutorial('clan');
    this.changed();
    return null;
  }

  joinClan(code: string): string | null {
    if (this.save.clan) return 'Already in a clan.';
    if (!this.save.classPicked) return 'Pick a class first.';
    if (!code.trim()) return 'Enter a clan code.';
    this.save.clan = joinClanByCode(this.rng, sanitizeClanCode(code), {
      heroClass: this.save.heroClass,
      level: this.save.level,
      cp: this.cp,
      loadout: this.save.loadout,
      primary: this.save.primary,
    });
    this.say(`Joined ${this.save.clan.name} (${this.save.clan.code}).`);
    this.toast(`Joined ${this.save.clan.name}`, 'good');
    this.advanceTutorial('clan');
    this.changed();
    return null;
  }

  leaveClan(): string | null {
    if (!this.save.clan) return 'Not in a clan.';
    const name = this.save.clan.name;
    this.save.clan = null;
    this.say(`Left ${name}.`);
    this.changed();
    return null;
  }

  /** Fill missing class slots with AI teammates (keeps the human on their class). */
  fillAiClanRoster(): string | null {
    if (!this.save.clan) return 'Join or create a clan first.';
    this.save.clan.members = this.save.clan.members.map(normalizeClanMember);
    const added = fillAiRoster(this.save.clan, this.rng, this.save.level, 'scaled');
    if (!added.length) {
      if (rosterReady(this.save.clan.members)) return 'Roster already has one of each class.';
      return 'Clan is full.';
    }
    this.save.clan.members.push(...added);
    this.toast(`AI fillers: ${added.map((m) => m.heroClass).join(', ')}`, 'good');
    this.say(`AI roster filled (+${added.length}). Solo playtest until live multiplayer.`);
    this.changed();
    return null;
  }

  /** @deprecated Prefer fillAiClanRoster — same behavior (mock recruit alias). */
  recruitClanRoster(): string | null {
    return this.fillAiClanRoster();
  }

  clanRosterReady(): boolean {
    return !!this.save.clan && rosterReady(this.save.clan.members);
  }

  clanMissingClasses(): HeroClass[] {
    return this.save.clan ? missingClasses(this.save.clan.members) : [...HERO_CLASSES];
  }

  /** Current roster team CP + Scout/Veteran/Nightscar status for Clan Hall UI. */
  clanBracketStatus(now = Date.now()): ClanBracketStatus {
    this.syncPlayerClanMember();
    const roster =
      this.save.clan && this.clanRosterReady()
        ? pickQueueRoster(this.save.clan.members, this.save.heroClass)
        : null;
    const teamCp = roster ? teamCpSum(roster) : this.cp * 4;
    const bracket = assignBracket(teamCp);
    const floorMet = meetsClanQueueFloor(this.save.stagesCleared, this.cp);
    const today = dayKey(now);
    const challengeLeft = challengeUpAvailable(this.save.clanChallengeUpDayKey, today) ? 1 : 0;
    const nxt = nextBracket(bracket);
    return {
      teamCp,
      bracket,
      label: CLAN_BRACKET_LABEL[bracket],
      floorMet,
      floorMessage: clanQueueFloorMessage(),
      challengeUpLeft: challengeLeft,
      canChallengeUp: floorMet && !!roster && challengeLeft > 0 && !!nxt,
      nextBracket: nxt,
      nextLabel: nxt ? CLAN_BRACKET_LABEL[nxt] : null,
      nightscarShopUnlocked: this.save.clanNightscarUnlocked,
    };
  }

  /**
   * Playtest helper: ensure a clan exists, fill AI teammates, queue 4v4 vs AI rivals.
   * Creates a free "Practice Hall" clan when the player is not in one.
   * Soft floor still applies (same as ranked queue) so solo test mirrors live rules.
   */
  queuePractice4v4(opts?: { challengeUp?: boolean }): string | null {
    if (this.mode === 'pvp') return 'Clan fight in progress.';
    if (this.mode !== 'camp' || this.battle) return 'Retreat to camp before queuing.';
    if (!this.save.classPicked) return 'Pick a class first.';
    if (!this.save.clan) {
      this.save.clan = createClan(this.rng, 'Practice Hall', {
        heroClass: this.save.heroClass,
        level: this.save.level,
        cp: this.cp,
        loadout: this.save.loadout,
        primary: this.save.primary,
      });
      this.say(`Practice Hall opened (AI playtest clan). Code ${this.save.clan.code}.`);
    }
    const fillErr = this.fillAiClanRoster();
    if (fillErr && !this.clanRosterReady()) return fillErr;
    this.advanceTutorial('clan');
    return this.queueClanPvp(opts);
  }

  // ---- Ascended Seals / Clan Raid -----------------------------------------

  refreshClanRaidWeek(now = Date.now()): void {
    const week = clanRaidWeekKey(now);
    if (this.save.clanRaidWeekKey !== week) {
      this.save.clanRaidWeekKey = week;
      this.save.clanRaidAttemptsUsed = 0;
    }
  }

  clanRaidAttemptsLeft(now = Date.now()): number {
    this.refreshClanRaidWeek(now);
    return Math.max(0, CLAN_RAID_WEEKLY_ATTEMPTS - this.save.clanRaidAttemptsUsed);
  }

  clanRaidUnlocked(): boolean {
    return !!this.save.clan && this.save.stagesCleared >= CLAN_RAID_STAGE_FLOOR;
  }

  clanRaidStatus(now = Date.now()): {
    unlocked: boolean;
    attemptsLeft: number;
    attemptsMax: number;
    seals: number;
    fragments: number;
    weekKey: string;
  } {
    this.refreshClanRaidWeek(now);
    return {
      unlocked: this.clanRaidUnlocked(),
      attemptsLeft: this.clanRaidAttemptsLeft(now),
      attemptsMax: CLAN_RAID_WEEKLY_ATTEMPTS,
      seals: this.save.ascendedSeals,
      fragments: this.save.ascendedSealFragments,
      weekKey: this.save.clanRaidWeekKey,
    };
  }

  /**
   * Start weekly Clan Raid boss on the Phaser stage.
   * Rewards: Ascended Seal or Fragments only (no marks / chests / bracket bonus).
   * Shared multiplayer HP is stubbed — party of 4 (you + 3 AI) vs boss.
   */
  startClanRaid(): string | null {
    if (this.mode === 'pvp' || this.mode === 'dungeon') return 'Finish your current fight first.';
    if (this.battle) return 'Retreat to camp before starting Clan Raid.';
    if (!this.save.clan) return 'Join a clan first.';
    if (this.save.stagesCleared < CLAN_RAID_STAGE_FLOOR) {
      return 'Clear Nightscar Depths (Act 10) to unlock Clan Raid.';
    }
    this.refreshClanRaidWeek();
    if (this.save.clanRaidAttemptsUsed >= CLAN_RAID_WEEKLY_ATTEMPTS) {
      return `No Clan Raid attempts left this week (${CLAN_RAID_WEEKLY_ATTEMPTS}/${CLAN_RAID_WEEKLY_ATTEMPTS}).`;
    }
    // Ensure AI fillers so the stage always shows a full 4-hero party.
    this.fillAiClanRoster();
    const input = this.heroInput();
    const allies = buildClanRaidAllies(
      this.save.clan,
      this.save.heroClass,
      this.save.level,
      {
        atk: input.stats.atk,
        def: input.stats.def,
        hp: input.stats.hp,
        haste: input.stats.haste,
      },
      this.rng,
    );
    this.save.clanRaidAttemptsUsed += 1;
    const d = CLAN_RAID_DUNGEON;
    this.dungeonCtx = { dungeon: d, loot: [], xp: 0, clanRaid: true };
    this.battle = new Battle(this.buildDungeonRun(d), input, this.rng, {
      raidAllies: allies,
      raidEnemyHpMul: CLAN_RAID_ENEMY_HP_MUL,
      raidEnemyAtkMul: CLAN_RAID_ENEMY_ATK_MUL,
      raidBossHpMul: CLAN_RAID_BOSS_HP_MUL,
      raidBossAtkMul: CLAN_RAID_BOSS_ATK_MUL,
      allySwingMul: CLAN_RAID_ALLY_SWING_MUL,
    });
    this.mode = 'dungeon';
    this.lives = MAX_LIVES;
    this.acc = 0;
    this.say(
      `Clan Raid begun — party of ${allies.length} (${this.clanRaidAttemptsLeft()}/${CLAN_RAID_WEEKLY_ATTEMPTS} left). Seals & fragments only.`,
    );
    this.emit({ t: 'run' });
    this.changed();
    return null;
  }

  /** Craft Ascended Seals from fragments (inventory). Returns seals crafted or error. */
  craftAscendedSeals(count = 1): string | null {
    const n = Math.max(1, Math.floor(count));
    const need = n * ASCENDED_SEAL_FRAGMENTS_PER_SEAL;
    if (this.save.ascendedSealFragments < need) {
      const have = this.save.ascendedSealFragments;
      return `Need ${need} fragments (have ${have}). ${ASCENDED_SEAL_FRAGMENTS_PER_SEAL} → 1 Seal.`;
    }
    this.save.ascendedSealFragments -= need;
    this.save.ascendedSeals += n;
    this.toast(`Crafted ${n} Ascended Seal${n > 1 ? 's' : ''}`, 'good');
    this.changed();
    return null;
  }

  /** Craft as many seals as fragments allow. */
  craftAllAscendedSeals(): string | null {
    const n = sealsCraftableFrom(this.save.ascendedSealFragments);
    if (n <= 0) {
      return `Need ${ASCENDED_SEAL_FRAGMENTS_PER_SEAL} fragments per Seal (have ${this.save.ascendedSealFragments}).`;
    }
    return this.craftAscendedSeals(n);
  }

  /**
   * Queue local 4v4 auto-battle.
   * Sim + rewards resolve immediately; Phaser stage plays the log, then emits `pvp` for the breakdown modal.
   */
  queueClanPvp(opts?: { challengeUp?: boolean }): string | null {
    if (this.mode === 'pvp') return 'Clan fight in progress.';
    if (this.mode !== 'camp' || this.battle) return 'Retreat to camp before queuing.';
    if (!this.save.clan) return 'Join a clan first.';
    if (!meetsClanQueueFloor(this.save.stagesCleared, this.cp)) {
      return clanQueueFloorMessage();
    }
    this.save.clan.members = this.save.clan.members.map(normalizeClanMember);
    this.syncPlayerClanMember();
    const roster = pickQueueRoster(this.save.clan.members, this.save.heroClass);
    if (!roster) return 'Need 4 members with one of each class ready.';
    const teamCp = teamCpSum(roster);
    const natural = assignBracket(teamCp);
    let matchBracket: ClanBracketId = natural;
    let usedChallenge = false;
    if (opts?.challengeUp) {
      const nxt = nextBracket(natural);
      if (!nxt) return 'Already Nightscar — no higher bracket.';
      const today = dayKey();
      if (!challengeUpAvailable(this.save.clanChallengeUpDayKey, today)) {
        return 'Challenge-up already used today.';
      }
      matchBracket = nxt;
      usedChallenge = true;
    }
    const avgCp = teamCp / roster.length;
    const matchAvg = usedChallenge ? BRACKET_TARGET_AVG_CP[matchBracket] : avgCp;
    const enemies = buildOpponentRoster(this.rng, roster, matchAvg);
    const result = simulatePvp(roster, enemies, this.save.gear, this.save.level, this.rng, {
      bracket: matchBracket,
      challengeUp: usedChallenge,
      teamCp,
    });
    this.refreshClanTokenDay();
    if (usedChallenge) this.save.clanChallengeUpDayKey = dayKey();
    if (matchBracket === 'nightscar') this.save.clanNightscarUnlocked = true;
    const base = bracketTokenReward(matchBracket, result.won);
    const tokenPct = this.totals.effects.tokenGainPct;
    const gain = Math.round(base * (1 + tokenPct / 100));
    const { awarded, earnedToday } = applyTokenCap(this.save.clanTokensEarnedToday, gain);
    this.save.clanTokensEarnedToday = earnedToday;
    this.save.clanTokens += awarded;
    if (result.won) this.save.clanWins += 1;
    else this.save.clanLosses += 1;
    this.bumpDaily('clan');
    this.advanceTutorial('clan');
    const tierNote = ` [${CLAN_BRACKET_LABEL[matchBracket]}${usedChallenge ? '↑' : ''}]`;
    const capNote =
      awarded < gain ? ` (day cap ${TOKEN_DAY_CAP}; +${awarded})` : ` (+${awarded} tokens)`;
    this.say(
      `Clan 4v4 ${result.won ? 'WIN' : 'LOSS'}${tierNote}${capNote}${result.practiceAi ? ' (AI practice)' : ''}.`,
    );
    this.toast(`${result.won ? 'Victory' : 'Defeat'}${tierNote}${capNote}`, result.won ? 'good' : 'bad');
    this.beginPvpPlayback(result, awarded);
    this.changed();
    return null;
  }

  /** Skip remaining stage playback and open the existing PvP breakdown modal. */
  finishPvpPlayback(): void {
    const pb = this.pvpPlayback;
    if (!pb || pb.finished) return;
    // Snap fighters to final HP from the authoritative result.
    for (const f of pb.fighters) {
      const final =
        f.team === 'ally'
          ? pb.result.allyTeam.find((t) => t.name === f.name)
          : pb.result.enemyTeam.find((t) => t.name === f.name);
      if (final) {
        f.hp = final.hp;
        f.dead = final.hp <= 0;
        if (f.dead && f.deathT <= 0) f.deathT = 0.7;
      }
    }
    pb.nextIdx = pb.result.playback.length;
    pb.t = pb.result.duration;
    pb.holdT = 99;
    this.emitPvpResult(pb);
  }

  private beginPvpPlayback(result: PvpResult, tokens: number): void {
    // Keep short wipeouts readable; stretch long matches into ~8–12s of stage time.
    const targetWall = Math.max(4, Math.min(12, Math.max(0.5, result.duration) / 5));
    const rate = Math.max(0.15, result.duration / targetWall);
    this.pvpPlayback = {
      result,
      tokens,
      t: 0,
      nextIdx: 0,
      holdT: 0,
      introT: 0.85,
      rate,
      finished: false,
      fighters: result.fighters.map((f) => ({
        ...f,
        hp: f.maxHp,
        dead: false,
        hitFlash: 0,
        swingAnim: 0,
        deathT: 0,
      })),
    };
    this.mode = 'pvp';
    this.battle = null;
    this.emit({ t: 'run' });
  }

  private tickPvp(dtReal: number): void {
    const pb = this.pvpPlayback;
    if (!pb || pb.finished) return;
    const dt = Math.min(dtReal, 0.25) * this.speed;
    for (const f of pb.fighters) {
      if (f.hitFlash > 0) f.hitFlash = Math.max(0, f.hitFlash - dt);
      if (f.swingAnim > 0) f.swingAnim = Math.max(0, f.swingAnim - dt);
      if (f.dead && f.deathT < 0.7) f.deathT = Math.min(0.7, f.deathT + dt);
    }

    if (pb.introT > 0) {
      pb.introT = Math.max(0, pb.introT - dt);
      return;
    }

    if (pb.nextIdx >= pb.result.playback.length) {
      pb.holdT += dt;
      if (pb.holdT >= 0.9) this.emitPvpResult(pb);
      return;
    }

    pb.t += dt * pb.rate;
    const log = pb.result.playback;
    while (pb.nextIdx < log.length && log[pb.nextIdx]!.time <= pb.t) {
      const ev = log[pb.nextIdx]!;
      pb.nextIdx += 1;
      this.applyPvpFx(pb, ev);
      this.emit({ t: 'pvpFx', ev });
    }
  }

  private applyPvpFx(pb: PvpPlayback, ev: PvpEvent): void {
    const find = (name: string | undefined, team: 'ally' | 'enemy' | undefined) => {
      if (!name) return undefined;
      return pb.fighters.find((f) => f.name === name && (!team || f.team === team));
    };
    if (ev.t === 'skill' || ev.t === 'hit') {
      const actor = find(ev.actor, ev.team);
      const target = find(ev.target, ev.targetTeam);
      if (actor) actor.swingAnim = 0.28;
      if (target && ev.dmg != null) {
        target.hp = Math.max(0, target.hp - ev.dmg);
        target.hitFlash = 0.12;
        if (target.hp <= 0) {
          target.dead = true;
          if (target.deathT <= 0) target.deathT = 0.01;
        }
      }
    } else if (ev.t === 'kill') {
      const target = find(ev.target, ev.targetTeam);
      if (target) {
        target.hp = 0;
        target.dead = true;
        if (target.deathT <= 0) target.deathT = 0.01;
      }
    }
  }

  private emitPvpResult(pb: PvpPlayback): void {
    if (pb.finished) return;
    pb.finished = true;
    const { result, tokens } = pb;
    this.pvpPlayback = null;
    this.mode = 'camp';
    this.emit({ t: 'pvp', result, tokens });
    this.emit({ t: 'run' });
    this.emit({ t: 'change' });
  }

  buyClanVendor(index: number): string | null {
    const offer = CLAN_VENDOR[index];
    if (!offer) return 'Unknown offer.';
    if (offer.nightscarOnly && !this.save.clanNightscarUnlocked) {
      return 'Nightscar bracket unlock required for this piece.';
    }
    if (this.save.clanTokens < offer.cost) return `Need ${offer.cost} clan tokens.`;
    this.save.clanTokens -= offer.cost;
    const gl = Math.max(18, Math.min(20, this.save.level));
    const item = rollItem(this.rng, {
      gearLevel: gl,
      rarity: offer.rarity,
      slot: offer.slot,
      setId: 'clanforged',
      icon: 'k',
    });
    this.queueLoot([item], false);
    this.toast(`Bought ${item.name}`, 'good');
    this.changed();
    return null;
  }

  /** Local season reset hook — wipes progression, keeps clan membership + cosmetics stub. */
  resetSeasonLocal(): void {
    const clan = this.save.clan;
    const seasonId = this.save.season.seasonId + 1;
    const keepTokens = 0; // GDD: clan tokens reset
    const everTut = this.save.tutorial.everCompleted;
    const lastSeen = this.save.lastSeenContentVersion;
    this.save = defaultSave();
    this.wipeActProgress();
    this.save.tutorial.everCompleted = everTut;
    this.save.tutorial.step = everTut ? TUTORIAL_STEPS.length : 0;
    this.save.tutorial.skipped = false;
    this.save.lastSeenContentVersion = lastSeen;
    this.save.clan = clan
      ? {
          ...clan,
          members: clan.members.map((m) =>
            normalizeClanMember(
              m.isPlayer
                ? {
                    ...m,
                    level: 1,
                    cp: 0,
                    loadout: [...DEFAULT_LOADOUT[m.heroClass]],
                    primary: null,
                    heroClass: m.heroClass,
                    isAi: false,
                  }
                : m,
            ),
          ),
        }
      : null;
    this.save.season = { seasonId, startedAt: Date.now() };
    this.save.clanTokens = keepTokens;
    this.save.clanChallengeUpDayKey = '';
    this.save.clanNightscarUnlocked = false;
    this.save.classPicked = false;
    this.battle = null;
    this.pvpPlayback = null;
    this.mode = 'camp';
    this.dungeonCtx = null;
    this.lives = MAX_LIVES;
    this.say(`Season ${seasonId} begins. Re-pick your class.`);
    this.emit({ t: 'run' });
    this.changed();
    flushCloudPush(this.storage, this.save);
  }

  /** Zero stage / act / dungeon unlock progress so a new run starts locked. */
  private wipeActProgress(): void {
    this.save.stagesCleared = 0;
    this.save.currentStage = 0;
    this.save.nodeProgress = 0;
    this.save.dungeons = {};
    this.save.questIndex = 0;
    this.save.nightscarPity = 0;
    this.save.ascendedPity = 0;
    this.save.ascendedSeals = 0;
    this.save.ascendedSealFragments = 0;
    this.save.clanRaidAttemptsUsed = 0;
    this.save.clanRaidWeekKey = clanRaidWeekKey();
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

  setAutoSalvageRarityMax(v: RarityId | null): void {
    this.save.settings.autoSalvageRarityMax = v;
    this.changed();
  }

  setMuted(v: boolean): void {
    this.save.settings.muted = v;
    this.persist();
    this.emit({ t: 'change' });
  }

  get muted(): boolean {
    return !!this.save.settings.muted;
  }

  /** CP vs recommended for the currently selected stage (adventure / push tension). */
  stagePowerReadout(stageIndex = this.save.currentStage): { yourCp: number; recCp: number; underpowered: boolean } {
    const { act, stage } = stageToActStage(stageIndex);
    const yourCp = this.cp;
    const recCp = stageRecCp(act, stage);
    return { yourCp, recCp, underpowered: yourCp < recCp };
  }

  devGrantXp(n: number): void {
    this.gainXp(n);
    this.changed();
  }

  devGrantResources(): void {
    this.save.keys = Math.min(KEY_CAP, this.save.keys + 5);
    this.save.crystals += 500;
    this.save.dust += 200;
    this.save.gold += 1000;
    this.save.clanTokens += 100;
    this.save.ascendedSeals += 3;
    this.save.ascendedSealFragments += 5;
    this.changed();
  }

  devUnlockActs(): void {
    this.save.stagesCleared = PLAYABLE_STAGES;
    this.save.currentStage = PLAYABLE_STAGES - 1;
    this.save.nodeProgress = 0;
    if (this.mode === 'stage') this.startStage();
    this.changed();
  }

  /** Unlock through Act N (5 stages each). */
  devUnlockThroughAct(actId: number): void {
    const cleared = Math.min(PLAYABLE_STAGES, actId * STAGES_PER_ACT);
    this.save.stagesCleared = cleared;
    this.save.currentStage = Math.max(0, cleared - 1);
    this.save.nodeProgress = 0;
    this.changed();
  }

  devRollLoot(count = 5): void {
    const items: Item[] = [];
    const setPool = filterSetsForClass(DROP_SET_IDS, this.save.heroClass);
    for (let i = 0; i < count; i++) {
      items.push(
        rollItem(this.rng, {
          gearLevel: Math.max(1, Math.min(this.save.level, this.rng.int(1, 8))),
          rarity: rollRarity(this.rng, 'dungeon-floor'),
          setId: setPool.length ? this.rng.pick(setPool) : undefined,
        }),
      );
    }
    this.queueLoot(items, false);
  }

  resetSave(): void {
    clearSave(this.storage);
    this.save = defaultSave();
    this.wipeActProgress();
    this.battle = null;
    this.pvpPlayback = null;
    this.mode = 'camp';
    this.dungeonCtx = null;
    this.lives = MAX_LIVES;
    this.emit({ t: 'run' });
    this.changed();
    flushCloudPush(this.storage, this.save);
  }
}
