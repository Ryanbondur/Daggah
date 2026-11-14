export interface QuestProgressInput {
  salvageCount: number;
  stagesCleared: number;
  level: number;
  dungeonClears: number;
}

export interface QuestDef {
  id: string;
  text: string;
  goal: number;
  progress: (s: QuestProgressInput) => number;
  reward: { crystals?: number; dust?: number; keys?: number };
}

/** Onboarding chain; the first quest mirrors the reference screenshots. */
export const QUESTS: QuestDef[] = [
  {
    id: 'salvage-5',
    text: 'Salvage 5 pcs of Gear.',
    goal: 5,
    progress: (s) => s.salvageCount,
    reward: { crystals: 300 },
  },
  {
    id: 'clear-act-1',
    text: 'Clear Act 1: Ember Hollow.',
    goal: 5,
    progress: (s) => Math.min(5, s.stagesCleared),
    reward: { crystals: 200, keys: 2 },
  },
  {
    id: 'hollow-crypt',
    text: 'Clear the Hollow Crypt dungeon.',
    goal: 1,
    progress: (s) => Math.min(1, s.dungeonClears),
    reward: { crystals: 200, dust: 40 },
  },
  {
    id: 'clear-act-2',
    text: 'Clear Act 2: Deep Cavern.',
    goal: 10,
    progress: (s) => Math.min(10, s.stagesCleared),
    reward: { crystals: 300, keys: 2 },
  },
  {
    id: 'reach-7',
    text: 'Reach Level 7 and unlock Bladestorm.',
    goal: 7,
    progress: (s) => Math.min(7, s.level),
    reward: { crystals: 500, keys: 3 },
  },
  {
    id: 'salvage-20',
    text: 'Salvage 20 pcs of Gear.',
    goal: 20,
    progress: (s) => Math.min(20, s.salvageCount),
    reward: { crystals: 400, dust: 100 },
  },
];
