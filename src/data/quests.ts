export interface QuestProgressInput {
  salvageCount: number;
  stagesCleared: number;
  level: number;
  dungeonClears: number;
  clanWins: number;
  /** Mid-act farm: clears of a specific act dungeon id. */
  dungeonClearsById: Record<string, number>;
}

export type QuestKind = 'onboarding' | 'mid' | 'daily';

export interface QuestDef {
  id: string;
  text: string;
  goal: number;
  kind: QuestKind;
  progress: (s: QuestProgressInput) => number;
  reward: { crystals?: number; dust?: number; keys?: number };
}

/** Onboarding chain; the first quest mirrors the reference screenshots. */
export const QUESTS: QuestDef[] = [
  {
    id: 'salvage-5',
    kind: 'onboarding',
    text: 'Salvage 5 pcs of Gear.',
    goal: 5,
    progress: (s) => s.salvageCount,
    reward: { crystals: 300 },
  },
  {
    id: 'clear-act-1',
    kind: 'onboarding',
    text: 'Clear Act 1: Ember Hollow.',
    goal: 5,
    progress: (s) => Math.min(5, s.stagesCleared),
    reward: { crystals: 200, keys: 2 },
  },
  {
    id: 'hollow-crypt',
    kind: 'onboarding',
    text: 'Clear the Hollow Crypt dungeon.',
    goal: 1,
    progress: (s) => Math.min(1, s.dungeonClears),
    reward: { crystals: 200, dust: 40 },
  },
  {
    id: 'clear-act-2',
    kind: 'onboarding',
    text: 'Clear Act 2: Deep Cavern.',
    goal: 10,
    progress: (s) => Math.min(10, s.stagesCleared),
    reward: { crystals: 300, keys: 2 },
  },
  {
    id: 'reach-7',
    kind: 'onboarding',
    text: 'Reach Level 7 and unlock Bladestorm.',
    goal: 7,
    progress: (s) => Math.min(7, s.level),
    reward: { crystals: 500, keys: 3 },
  },
  {
    id: 'salvage-20',
    kind: 'onboarding',
    text: 'Salvage 20 pcs of Gear.',
    goal: 20,
    progress: (s) => Math.min(20, s.salvageCount),
    reward: { crystals: 400, dust: 100 },
  },
  // ---- Mid-act goals (Acts 5–8) so the campaign is not salvage-only ----
  {
    id: 'clear-act-5',
    kind: 'mid',
    text: 'Clear Act 5: Witchmire.',
    goal: 25,
    progress: (s) => Math.min(25, s.stagesCleared),
    reward: { crystals: 450, keys: 2 },
  },
  {
    id: 'farm-mire-sanctum',
    kind: 'mid',
    text: 'Clear Mire Sanctum 3 times.',
    goal: 3,
    progress: (s) => Math.min(3, s.dungeonClearsById['mire-sanctum'] ?? 0),
    reward: { crystals: 350, dust: 80 },
  },
  {
    id: 'clear-act-6',
    kind: 'mid',
    text: 'Clear Act 6: Cinderreach.',
    goal: 30,
    progress: (s) => Math.min(30, s.stagesCleared),
    reward: { crystals: 500, keys: 2 },
  },
  {
    id: 'reach-12',
    kind: 'mid',
    text: 'Reach Level 12.',
    goal: 12,
    progress: (s) => Math.min(12, s.level),
    reward: { crystals: 400, dust: 60 },
  },
  {
    id: 'clear-act-7',
    kind: 'mid',
    text: 'Clear Act 7: Ashen Spire.',
    goal: 35,
    progress: (s) => Math.min(35, s.stagesCleared),
    reward: { crystals: 550, keys: 3 },
  },
  {
    id: 'farm-spire-forge',
    kind: 'mid',
    text: 'Clear Spire Forge 3 times.',
    goal: 3,
    progress: (s) => Math.min(3, s.dungeonClearsById['spire-forge'] ?? 0),
    reward: { crystals: 400, dust: 100 },
  },
  {
    id: 'clear-act-8',
    kind: 'mid',
    text: 'Clear Act 8: Echoing Dark.',
    goal: 40,
    progress: (s) => Math.min(40, s.stagesCleared),
    reward: { crystals: 600, keys: 3 },
  },
  {
    id: 'clan-wins-3',
    kind: 'mid',
    text: 'Win 3 clan 4v4 battles.',
    goal: 3,
    progress: (s) => Math.min(3, s.clanWins),
    reward: { crystals: 500, dust: 80 },
  },
];

/** Daily rotating goals (beyond salvage). Index by day-of-season % length. */
export const DAILY_QUESTS: QuestDef[] = [
  {
    id: 'daily-stage-3',
    kind: 'daily',
    text: 'Daily: Clear 3 stage nodes (any act).',
    goal: 3,
    progress: (s) => Math.min(3, s.stagesCleared), // overridden by dailyProgress counter
    reward: { crystals: 120, dust: 20 },
  },
  {
    id: 'daily-dungeon-1',
    kind: 'daily',
    text: 'Daily: Complete 1 dungeon run.',
    goal: 1,
    progress: () => 0,
    reward: { crystals: 150, keys: 1 },
  },
  {
    id: 'daily-salvage-8',
    kind: 'daily',
    text: 'Daily: Salvage 8 pcs of Gear.',
    goal: 8,
    progress: () => 0,
    reward: { crystals: 100, dust: 40 },
  },
  {
    id: 'daily-clan-1',
    kind: 'daily',
    text: 'Daily: Fight 1 clan 4v4 battle.',
    goal: 1,
    progress: () => 0,
    reward: { crystals: 140 },
  },
  {
    id: 'daily-skills',
    kind: 'daily',
    text: 'Daily: Equip a full 4-skill playstyle bar.',
    goal: 1,
    progress: () => 0,
    reward: { crystals: 110, dust: 25 },
  },
];

export type DailyCounterKey = 'stages' | 'dungeons' | 'salvage' | 'clan' | 'fullLoadout';

export function dailyQuestForDay(dayIndex: number): QuestDef {
  return DAILY_QUESTS[((dayIndex % DAILY_QUESTS.length) + DAILY_QUESTS.length) % DAILY_QUESTS.length];
}

export function dailyCounterKey(questId: string): DailyCounterKey {
  if (questId.includes('dungeon')) return 'dungeons';
  if (questId.includes('salvage')) return 'salvage';
  if (questId.includes('clan')) return 'clan';
  if (questId.includes('skills') || questId.includes('loadout')) return 'fullLoadout';
  return 'stages';
}
