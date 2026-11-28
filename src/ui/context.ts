import type { PlaystyleId } from '../data/types';
import type { ClanLeaderboardEntry } from '../game/clan';
import type { ClanBoardSource } from '../game/clanBoardClient';
import type { Game } from '../game/game';

export type Tab = 'camp' | 'skill' | 'adventure' | 'clan';
/** Sub-views inside the Clan tab. */
export type ClanPane = 'hall' | 'board' | 'town';
/** Camp home: gear paper doll or Daily Shop (one-tap from main loop). */
export type CampPane = 'gear' | 'shop';
/** Adventure difficulty strip: Normal acts vs Ascended Nightscar. */
export type AdventureDiff = 'normal' | 'ascended';

export interface UIContext {
  game: Game;
  tab: Tab;
  /** Clan tab sub-pane (Hall / Leaderboard / Town services). */
  clanPane: ClanPane;
  /** Camp sub-pane (Gear / Shop). */
  campPane: CampPane;
  /** Adventure difficulty (Normal / Ascended). */
  adventureDiff: AdventureDiff;
  /**
   * Simplified Adventure: which act card is expanded (1–10).
   * Null = auto (act of current stage).
   */
  adventureFocusAct: number | null;
  skillStyle: PlaystyleId;
  /** Skill bar slot index selected for swap (Skill tab). */
  skillBarFocus: number | null;
  /** Cached live clan season board (null until first fetch). */
  clanBoardLive: ClanLeaderboardEntry[] | null;
  clanBoardSource: ClanBoardSource;
  clanBoardSeasonId: number | null;
  /** Last board fetch failure copy (rate-limit / network); cleared on success. */
  clanBoardError: string | null;
  /** Kick a background refresh of the season board (no-op if already loading). */
  refreshClanBoard(force?: boolean): void;
  setTab(tab: Tab): void;
  /** Ensure Phaser + stage canvas are loaded (lazy; no-op once ready). */
  ensureStage(): Promise<void>;
  /** Jump to Camp → Daily Shop (from Town or CTAs). */
  openDailyShop(): void;
  render(): void;
  openModal(html: string, opts?: ModalOpts): HTMLElement;
  closeModal(): void;
  readonly modalOpen: boolean;
  showCompare(itemId: string, source: 'pending' | 'bag'): void;
  showBag(): void;
  showHero(): void;
  showSettings(): void;
  showLogin(opts?: { allowGuest?: boolean }): void;
  showChat(): void;
  showItemInfo(slot: string): void;
  showClassPick(): void;
  showClanHall(): void;
  showSeasonBoard(): void;
  showClanArmorer(): void;
  showBlacksmith(): void;
  showSetProgress(): void;
  showGearLoadouts(): void;
  /** Condensed Arsenal hub (Loadouts / Craft / Sets). No-op when simplified menus are off. */
  showGearHub(tab?: 'loadouts' | 'craft' | 'sets'): void;
  flashSlot(slot: string): void;
}

export interface ModalOpts {
  /** Called when the dim background is tapped. */
  onDismiss?: () => void;
  onClose?: () => void;
  className?: string;
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
