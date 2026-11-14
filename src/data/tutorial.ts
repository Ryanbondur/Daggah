export type TutorialStepId = 'auto-attack' | 'first-drop' | 'equip-skills' | 'dungeon-key';

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  body: string;
  /** Nav tab hint for the coach mark. */
  tab?: 'camp' | 'skill' | 'adventure' | 'town' | 'battle';
}

/** Guided first-run chain. Skip is only offered after the player has completed it once. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'auto-attack',
    title: 'Auto-attack',
    body: 'Tap the center Battle button. Your hero walks east and auto-attacks — no need to mash.',
    tab: 'battle',
  },
  {
    id: 'first-drop',
    title: 'Compare gear',
    body: 'When gear drops, compare Combat Power and green arrows. Replace upgrades or Salvage junk.',
    tab: 'camp',
  },
  {
    id: 'equip-skills',
    title: 'Equip 4 skills',
    body: 'Open Skill and fill all 4 bar slots. One playstyle set beats a mixed bar.',
    tab: 'skill',
  },
  {
    id: 'dungeon-key',
    title: 'Dungeon key',
    body: 'Adventure → clear Act 1 → Enter Hollow Crypt with a dungeon key for set gear.',
    tab: 'adventure',
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
