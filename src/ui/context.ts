import type { PlaystyleId } from '../data/types';
import type { Game } from '../game/game';

export type Tab = 'camp' | 'skill' | 'adventure' | 'clan';
/** Sub-views inside the Clan tab. */
export type ClanPane = 'hall' | 'board' | 'town';

export interface UIContext {
  game: Game;
  tab: Tab;
  /** Clan tab sub-pane (Hall / Leaderboard / Town services). */
  clanPane: ClanPane;
  skillStyle: PlaystyleId;
  /** Skill bar slot index selected for swap (Skill tab). */
  skillBarFocus: number | null;
  setTab(tab: Tab): void;
  render(): void;
  openModal(html: string, opts?: ModalOpts): HTMLElement;
  closeModal(): void;
  readonly modalOpen: boolean;
  showCompare(itemId: string, source: 'pending' | 'bag'): void;
  showBag(): void;
  showHero(): void;
  showSettings(): void;
  showChat(): void;
  showItemInfo(slot: string): void;
  showClassPick(): void;
  showClanHall(): void;
  showSeasonBoard(): void;
  showClanArmorer(): void;
  flashSlot(slot: string): void;
}

export interface ModalOpts {
  /** Called when the dim background is tapped. */
  onDismiss?: () => void;
  onClose?: () => void;
  className?: string;
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
