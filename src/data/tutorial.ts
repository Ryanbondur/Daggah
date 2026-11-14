export type TutorialStepId =
  | 'auto-attack'
  | 'first-drop'
  | 'equip-skills'
  | 'dungeon-key'
  | 'clan';

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  body: string;
  /** Nav tab hint for the coach mark. */
  tab?: 'camp' | 'skill' | 'adventure' | 'clan' | 'battle';
}

/**
 * Guided first-run chain (core loop: fight → gear → skills → dungeon → clan).
 * Skip is only offered after the player has completed it once.
 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'auto-attack',
    title: 'Fight',
    body: 'Tap Battle. Your hero auto-attacks — no mashing.',
    tab: 'battle',
  },
  {
    id: 'first-drop',
    title: 'Gear',
    body: 'Compare Combat Power and arrows. Replace upgrades; Salvage junk.',
    tab: 'camp',
  },
  {
    id: 'equip-skills',
    title: 'Skills',
    body: 'Open Skill and fill all 4 bar slots. Stick to one playstyle.',
    tab: 'skill',
  },
  {
    id: 'dungeon-key',
    title: 'Dungeon',
    body: 'Adventure → clear Act 1 → Enter a dungeon with a key for set gear.',
    tab: 'adventure',
  },
  {
    id: 'clan',
    title: 'Clan',
    body: 'Clan tab: create or join, fill AI teammates, queue 4v4 for tokens.',
    tab: 'clan',
  },
];

export interface TutorialState {
  /** Current step index (0..length). Equals length when finished this run. */
  step: number;
  /** True after the player finishes all steps at least once (survives season reset). */
  everCompleted: boolean;
  /** Player skipped this season after having completed once. */
  skipped: boolean;
}

export function defaultTutorial(): TutorialState {
  return { step: 0, everCompleted: false, skipped: false };
}

export function tutorialActive(t: TutorialState): boolean {
  if (t.skipped) return false;
  if (t.everCompleted && t.step >= TUTORIAL_STEPS.length) return false;
  return t.step < TUTORIAL_STEPS.length;
}

export function currentTutorialStep(t: TutorialState): TutorialStep | null {
  if (!tutorialActive(t)) return null;
  return TUTORIAL_STEPS[t.step] ?? null;
}
