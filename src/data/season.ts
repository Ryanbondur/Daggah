/** Local season participation milestones (GDD §9). */

export interface SeasonMilestoneDef {
  id: string;
  text: string;
  /** Rough day band for free track pacing (~every 3 days). */
  dayHint: number;
  reward: { crystals?: number; dust?: number; seasonMarks?: number };
  /** Progress against save snapshot. */
  progress: (s: SeasonProgressInput) => number;
  goal: number;
}

export interface SeasonProgressInput {
  seasonDay: number;
  stagesCleared: number;
  clanWins: number;
  dungeonClears: number;
  loginDays: number;
}

export const SEASON_MILESTONES: SeasonMilestoneDef[] = [
  {
    id: 'login-5',
    text: 'Recruit: play on 5 different days',
    dayHint: 5,
    goal: 5,
    progress: (s) => Math.min(5, s.loginDays),
    reward: { crystals: 200, seasonMarks: 50 },
  },
  {
    id: 'clear-act-3',
    text: 'Clear Act 3',
    dayHint: 6,
    goal: 15,
    progress: (s) => Math.min(15, s.stagesCleared),
    reward: { crystals: 250, dust: 40 },
  },
  {
    id: 'clear-act-5',
    text: 'Campaigner: Clear Act 5',
    dayHint: 12,
    goal: 25,
    progress: (s) => Math.min(25, s.stagesCleared),
    reward: { crystals: 400, seasonMarks: 100 },
  },
  {
    id: 'wins-5',
    text: 'Win 5 clan battles',
    dayHint: 15,
    goal: 5,
    progress: (s) => Math.min(5, s.clanWins),
    reward: { crystals: 300, dust: 60 },
  },
  {
    id: 'wins-10',
    text: 'Warlord: Win 10 clan battles',
    dayHint: 21,
    goal: 10,
    progress: (s) => Math.min(10, s.clanWins),
    reward: { crystals: 500, seasonMarks: 150 },
  },
  {
    id: 'clear-act-8',
    text: 'Clear Act 8',
    dayHint: 24,
    goal: 40,
    progress: (s) => Math.min(40, s.stagesCleared),
    reward: { crystals: 450, dust: 80 },
  },
  {
    id: 'dungeon-20',
    text: 'Clear 20 dungeon runs this season',
    dayHint: 27,
    goal: 20,
    progress: (s) => Math.min(20, s.dungeonClears),
    reward: { crystals: 600, seasonMarks: 200 },
  },
];
