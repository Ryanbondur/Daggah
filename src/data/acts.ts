import { estimateStageRecCp } from './gear';
import type { SetId } from './types';

export type EnemyRole = 'trash' | 'elite' | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  role: EnemyRole;
  /** Visual height as a fraction of stage height. */
  size: number;
  hpMul: number;
  atkMul: number;
  atkInterval: number;
  speed: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  'ember-imp': {
    id: 'ember-imp',
    name: 'Ember Imp',
    sprite: 'enemy-ember-imp',
    role: 'trash',
    size: 0.19,
    hpMul: 0.85,
    atkMul: 1,
    atkInterval: 1.5,
    speed: 0.34,
  },
  'cinder-brute': {
    id: 'cinder-brute',
    name: 'Cinder Brute',
    sprite: 'enemy-cinder-brute',
    role: 'elite',
    size: 0.3,
    hpMul: 1,
    atkMul: 1,
    atkInterval: 2.2,
    speed: 0.22,
  },
  'hollow-king': {
    id: 'hollow-king',
    name: 'Hollow King',
    sprite: 'boss-hollow-king',
    role: 'boss',
    size: 0.46,
    hpMul: 1,
    atkMul: 1,
    atkInterval: 2.4,
    speed: 0.2,
  },
  'goat-demon': {
    id: 'goat-demon',
    name: 'Goat-Demon',
    sprite: 'enemy-goat-demon',
    role: 'trash',
    size: 0.19,
    hpMul: 1,
    atkMul: 1,
    atkInterval: 1.7,
    speed: 0.3,
  },
  'cave-skeleton': {
    id: 'cave-skeleton',
    name: 'Cave Skeleton',
    sprite: 'enemy-skeleton',
    role: 'trash',
    size: 0.2,
    hpMul: 0.9,
    atkMul: 1.05,
    atkInterval: 1.6,
    speed: 0.28,
  },
  'horned-overseer': {
    id: 'horned-overseer',
    name: 'Horned Overseer',
    sprite: 'enemy-horned-overseer',
    role: 'elite',
    size: 0.32,
    hpMul: 1,
    atkMul: 1,
    atkInterval: 2.1,
    speed: 0.22,
  },
  'deep-warden': {
    id: 'deep-warden',
    name: 'Deep Warden',
    sprite: 'boss-deep-warden',
    role: 'boss',
    size: 0.46,
    hpMul: 1,
    atkMul: 1,
    atkInterval: 2.5,
    speed: 0.2,
  },
  'bone-soldier': {
    id: 'bone-soldier',
    name: 'Bone Soldier',
    sprite: 'enemy-bone-soldier',
    role: 'trash',
    size: 0.21,
    hpMul: 1.05,
    atkMul: 1.05,
    atkInterval: 1.65,
    speed: 0.27,
  },
  'bone-archer': {
    id: 'bone-archer',
    name: 'Bone Archer',
    sprite: 'enemy-bone-archer',
    role: 'trash',
    size: 0.2,
    hpMul: 0.85,
    atkMul: 1.1,
    atkInterval: 1.8,
    speed: 0.26,
  },
  'ossuary-captain': {
    id: 'ossuary-captain',
    name: 'Ossuary Captain',
    sprite: 'enemy-ossuary-captain',
    role: 'elite',
    size: 0.33,
    hpMul: 1,
    atkMul: 1.05,
    atkInterval: 2.0,
    speed: 0.21,
  },
  'ossuary-lord': {
    id: 'ossuary-lord',
    name: 'Ossuary Lord',
    sprite: 'boss-ossuary-lord',
    role: 'boss',
    size: 0.48,
    hpMul: 1,
    atkMul: 1,
    atkInterval: 2.4,
    speed: 0.19,
  },
  'frost-wisp': {
    id: 'frost-wisp',
    name: 'Frost Wisp',
    sprite: 'enemy-frost-wisp',
    role: 'trash',
    size: 0.17,
    hpMul: 0.8,
    atkMul: 1.1,
    atkInterval: 1.4,
    speed: 0.36,
  },
  'ice-hound': {
    id: 'ice-hound',
    name: 'Ice Hound',
    sprite: 'enemy-ice-hound',
    role: 'trash',
    size: 0.2,
    hpMul: 1,
    atkMul: 1.05,
    atkInterval: 1.55,
    speed: 0.32,
  },
  'rime-brute': {
    id: 'rime-brute',
    name: 'Rime Brute',
    sprite: 'enemy-rime-brute',
    role: 'elite',
    size: 0.34,
    hpMul: 1,
    atkMul: 1.1,
    atkInterval: 2.15,
    speed: 0.2,
  },
  'rime-queen': {
    id: 'rime-queen',
    name: 'Rime Queen',
    sprite: 'boss-rime-queen',
    role: 'boss',
    size: 0.47,
    hpMul: 1,
    atkMul: 1.05,
    atkInterval: 2.35,
    speed: 0.19,
  },
  'spore-tick': {
    id: 'spore-tick',
    name: 'Spore Tick',
    sprite: 'enemy-spore-tick',
    role: 'trash',
    size: 0.16,
    hpMul: 0.85,
    atkMul: 1.05,
    atkInterval: 1.45,
    speed: 0.34,
  },
  'mire-slug': {
    id: 'mire-slug',
    name: 'Mire Slug',
    sprite: 'enemy-mire-slug',
    role: 'trash',
    size: 0.2,
    hpMul: 1.1,
    atkMul: 0.95,
    atkInterval: 1.9,
    speed: 0.22,
  },
  'witchmire-hag': {
    id: 'witchmire-hag',
    name: 'Witchmire Hag',
    sprite: 'enemy-witchmire-hag',
    role: 'elite',
    size: 0.34,
    hpMul: 1,
    atkMul: 1.1,
    atkInterval: 2.05,
    speed: 0.2,
  },
  'bog-hydra': {
    id: 'bog-hydra',
    name: 'Bog Hydra',
    sprite: 'boss-bog-hydra',
    role: 'boss',
    size: 0.5,
    hpMul: 1,
    atkMul: 1.05,
    atkInterval: 2.3,
    speed: 0.18,
  },
  'magma-scarab': {
    id: 'magma-scarab',
    name: 'Magma Scarab',
    sprite: 'enemy-magma-scarab',
    role: 'trash',
    size: 0.17,
    hpMul: 0.9,
    atkMul: 1.1,
    atkInterval: 1.5,
    speed: 0.33,
  },
  'ash-walker': {
    id: 'ash-walker',
    name: 'Ash Walker',
    sprite: 'enemy-ash-walker',
    role: 'trash',
    size: 0.21,
    hpMul: 1.05,
    atkMul: 1.05,
    atkInterval: 1.65,
    speed: 0.26,
  },
  'cinder-knight': {
    id: 'cinder-knight',
    name: 'Cinder Knight',
    sprite: 'enemy-cinder-knight',
    role: 'elite',
    size: 0.35,
    hpMul: 1,
    atkMul: 1.15,
    atkInterval: 2.1,
    speed: 0.2,
  },
  'forge-colossus': {
    id: 'forge-colossus',
    name: 'Forge Colossus',
    sprite: 'boss-forge-colossus',
    role: 'boss',
    size: 0.52,
    hpMul: 1,
    atkMul: 1.1,
    atkInterval: 2.45,
    speed: 0.17,
  },
  'ash-bat': {
    id: 'ash-bat',
    name: 'Ash Bat',
    sprite: 'enemy-ash-bat',
    role: 'trash',
    size: 0.16,
    hpMul: 0.8,
    atkMul: 1.1,
    atkInterval: 1.35,
    speed: 0.38,
  },
  'slag-imp': {
    id: 'slag-imp',
    name: 'Slag Imp',
    sprite: 'enemy-slag-imp',
    role: 'trash',
    size: 0.19,
    hpMul: 0.95,
    atkMul: 1.05,
    atkInterval: 1.55,
    speed: 0.3,
  },
  'magma-knight': {
    id: 'magma-knight',
    name: 'Magma Knight',
    sprite: 'enemy-magma-knight',
    role: 'elite',
    size: 0.36,
    hpMul: 1,
    atkMul: 1.15,
    atkInterval: 2.05,
    speed: 0.19,
  },
  'spire-tyrant': {
    id: 'spire-tyrant',
    name: 'Spire Tyrant',
    sprite: 'boss-spire-tyrant',
    role: 'boss',
    size: 0.52,
    hpMul: 1,
    atkMul: 1.12,
    atkInterval: 2.4,
    speed: 0.17,
  },
  'echo-wisp': {
    id: 'echo-wisp',
    name: 'Echo Wisp',
    sprite: 'enemy-echo-wisp',
    role: 'trash',
    size: 0.16,
    hpMul: 0.82,
    atkMul: 1.12,
    atkInterval: 1.4,
    speed: 0.36,
  },
  'crystal-mite': {
    id: 'crystal-mite',
    name: 'Crystal Mite',
    sprite: 'enemy-crystal-mite',
    role: 'trash',
    size: 0.18,
    hpMul: 1.05,
    atkMul: 1,
    atkInterval: 1.7,
    speed: 0.24,
  },
  'crystal-golem': {
    id: 'crystal-golem',
    name: 'Crystal Golem',
    sprite: 'enemy-crystal-golem',
    role: 'elite',
    size: 0.38,
    hpMul: 1.1,
    atkMul: 1.1,
    atkInterval: 2.2,
    speed: 0.18,
  },
  'resonance-queen': {
    id: 'resonance-queen',
    name: 'Resonance Queen',
    sprite: 'boss-resonance-queen',
    role: 'boss',
    size: 0.5,
    hpMul: 1,
    atkMul: 1.1,
    atkInterval: 2.35,
    speed: 0.18,
  },
  'void-larva': {
    id: 'void-larva',
    name: 'Void Larva',
    sprite: 'enemy-void-larva',
    role: 'trash',
    size: 0.16,
    hpMul: 0.88,
    atkMul: 1.1,
    atkInterval: 1.4,
    speed: 0.35,
  },
  'rift-shade': {
    id: 'rift-shade',
    name: 'Rift Shade',
    sprite: 'enemy-rift-shade',
    role: 'trash',
    size: 0.2,
    hpMul: 1,
    atkMul: 1.08,
    atkInterval: 1.6,
    speed: 0.28,
  },
  'gate-warden': {
    id: 'gate-warden',
    name: 'Gate Warden',
    sprite: 'enemy-gate-warden',
    role: 'elite',
    size: 0.37,
    hpMul: 1.05,
    atkMul: 1.15,
    atkInterval: 2.1,
    speed: 0.19,
  },
  'void-herald': {
    id: 'void-herald',
    name: 'Void Herald',
    sprite: 'boss-void-herald',
    role: 'boss',
    size: 0.52,
    hpMul: 1,
    atkMul: 1.12,
    atkInterval: 2.35,
    speed: 0.17,
  },
  'nightscar-shade': {
    id: 'nightscar-shade',
    name: 'Nightscar Shade',
    sprite: 'enemy-nightscar-shade',
    role: 'trash',
    size: 0.18,
    hpMul: 0.9,
    atkMul: 1.12,
    atkInterval: 1.45,
    speed: 0.34,
  },
  'abyss-crawler': {
    id: 'abyss-crawler',
    name: 'Abyss Crawler',
    sprite: 'enemy-abyss-crawler',
    role: 'trash',
    size: 0.19,
    hpMul: 1.05,
    atkMul: 1.05,
    atkInterval: 1.65,
    speed: 0.26,
  },
  'nightscar-champion': {
    id: 'nightscar-champion',
    name: 'Nightscar Champion',
    sprite: 'enemy-nightscar-champion',
    role: 'elite',
    size: 0.38,
    hpMul: 1.1,
    atkMul: 1.18,
    atkInterval: 2.05,
    speed: 0.18,
  },
  'daggah-hungering': {
    id: 'daggah-hungering',
    name: 'Daggah, the Hungering',
    sprite: 'boss-daggah-hungering',
    role: 'boss',
    size: 0.55,
    hpMul: 1.05,
    atkMul: 1.15,
    atkInterval: 2.3,
    speed: 0.16,
  },
};

export type BackgroundId =
  | 'ember'
  | 'cavern'
  | 'bone'
  | 'frost'
  | 'mire'
  | 'cinder'
  | 'spire'
  | 'echo'
  | 'void'
  | 'nightscar'
  | 'clan';

export interface DungeonDef {
  id: string;
  name: string;
  actId: number;
  glBand: [number, number];
  sets: SetId[];
  floors: number;
  /** Nightscar Apex: stingy endgame drop tables (GDD §5.4 / §6.8). */
  endgame?: boolean;
  /** Ascended Nightscar: harder Apex variant with premium seal cost. */
  ascended?: boolean;
}

export interface ActDef {
  id: number;
  name: string;
  theme: string;
  bg: BackgroundId;
  stages: number;
  recLevel: [number, number];
  trash: string[];
  elite: string;
  boss: string;
  dungeon?: DungeonDef;
  playable: boolean;
}

export const ACTS: ActDef[] = [
  {
    id: 1,
    name: 'Ember Hollow',
    theme: 'Ash caves, ember imps',
    bg: 'ember',
    stages: 5,
    recLevel: [1, 2],
    trash: ['ember-imp'],
    elite: 'cinder-brute',
    boss: 'hollow-king',
    playable: true,
    dungeon: {
      id: 'hollow-crypt',
      name: 'Hollow Crypt',
      actId: 1,
      glBand: [1, 2],
      sets: ['ember-raider'],
      floors: 10,
    },
  },
  {
    id: 2,
    name: 'Deep Cavern',
    theme: 'Blue stalactite caves',
    bg: 'cavern',
    stages: 5,
    recLevel: [2, 4],
    trash: ['goat-demon', 'cave-skeleton'],
    elite: 'horned-overseer',
    boss: 'deep-warden',
    playable: true,
    dungeon: {
      id: 'cavern-vault',
      name: 'Cavern Vault',
      actId: 2,
      glBand: [2, 4],
      sets: ['cavern-cleaver', 'cavern-bulwark'],
      floors: 10,
    },
  },
  {
    id: 3,
    name: 'Bone Gallery',
    theme: 'Catacombs, skeletons',
    bg: 'bone',
    stages: 5,
    recLevel: [4, 6],
    trash: ['bone-soldier', 'bone-archer', 'cave-skeleton'],
    elite: 'ossuary-captain',
    boss: 'ossuary-lord',
    playable: true,
    dungeon: {
      id: 'ossuary',
      name: 'Ossuary',
      actId: 3,
      glBand: [4, 6],
      sets: ['gravemarch'],
      floors: 10,
    },
  },
  {
    id: 4,
    name: 'Frostvein',
    theme: 'Ice-veined tunnels',
    bg: 'frost',
    stages: 5,
    recLevel: [6, 8],
    trash: ['frost-wisp', 'ice-hound'],
    elite: 'rime-brute',
    boss: 'rime-queen',
    playable: true,
    dungeon: {
      id: 'rime-vault',
      name: 'Rime Vault',
      actId: 4,
      glBand: [6, 8],
      sets: ['ashen-codex', 'rime-circlet'],
      floors: 10,
    },
  },
  {
    id: 5,
    name: 'Witchmire',
    theme: 'Fungal marsh caverns',
    bg: 'mire',
    stages: 5,
    recLevel: [8, 10],
    trash: ['spore-tick', 'mire-slug'],
    elite: 'witchmire-hag',
    boss: 'bog-hydra',
    playable: true,
    dungeon: {
      id: 'mire-sanctum',
      name: 'Mire Sanctum',
      actId: 5,
      glBand: [8, 10],
      sets: ['quillstorm', 'deadeye'],
      floors: 10,
    },
  },
  {
    id: 6,
    name: 'Cinderreach',
    theme: 'Magma galleries',
    bg: 'cinder',
    stages: 5,
    recLevel: [10, 12],
    trash: ['magma-scarab', 'ash-walker'],
    elite: 'cinder-knight',
    boss: 'forge-colossus',
    playable: true,
    dungeon: {
      id: 'cinder-forge',
      name: 'Cinder Forge',
      actId: 6,
      glBand: [10, 12],
      sets: ['cinderstride'],
      floors: 10,
    },
  },
  {
    id: 7,
    name: 'Ashen Spire',
    theme: 'Volcanic ascent',
    bg: 'spire',
    stages: 5,
    recLevel: [12, 14],
    trash: ['ash-bat', 'slag-imp'],
    elite: 'magma-knight',
    boss: 'spire-tyrant',
    playable: true,
    dungeon: {
      id: 'spire-forge',
      name: 'Spire Forge',
      actId: 7,
      glBand: [12, 14],
      sets: ['nightfang', 'gloomveil'],
      floors: 10,
    },
  },
  {
    id: 8,
    name: 'Echoing Dark',
    theme: 'Crystal echo chambers',
    bg: 'echo',
    stages: 5,
    recLevel: [14, 16],
    trash: ['echo-wisp', 'crystal-mite'],
    elite: 'crystal-golem',
    boss: 'resonance-queen',
    playable: true,
    dungeon: {
      id: 'echo-crypt',
      name: 'Echo Crypt',
      actId: 8,
      glBand: [14, 16],
      sets: ['echoplate'],
      floors: 10,
    },
  },
  {
    id: 9,
    name: 'Voidgate',
    theme: 'Breach corridors',
    bg: 'void',
    stages: 5,
    recLevel: [16, 18],
    trash: ['void-larva', 'rift-shade'],
    elite: 'gate-warden',
    boss: 'void-herald',
    playable: true,
    dungeon: {
      id: 'gate-reliquary',
      name: 'Gate Reliquary',
      actId: 9,
      glBand: [16, 18],
      sets: ['voidwoven'],
      floors: 10,
    },
  },
  {
    id: 10,
    name: 'Nightscar Depths',
    theme: 'Final abyss',
    bg: 'nightscar',
    stages: 5,
    recLevel: [18, 20],
    trash: ['nightscar-shade', 'abyss-crawler'],
    elite: 'nightscar-champion',
    boss: 'daggah-hungering',
    playable: true,
    dungeon: {
      id: 'nightscar-apex',
      name: 'Nightscar Apex',
      actId: 10,
      glBand: [18, 20],
      sets: ['nightscar-regalia'],
      floors: 10,
      endgame: true,
    },
  },
];

export function getAct(id: number): ActDef {
  const act = ACTS.find((a) => a.id === id);
  if (!act) throw new Error(`Unknown act ${id}`);
  return act;
}

/** Ascended Nightscar — harder Apex; not listed as an act dungeon row. */
export const ASCENDED_NIGHTSCAR_DEF: DungeonDef = {
  id: 'nightscar-ascended',
  name: 'Ascended Nightscar',
  actId: 10,
  glBand: [18, 20],
  sets: ['nightscar-regalia'],
  floors: 10,
  endgame: true,
  ascended: true,
};

/** Clan Raid boss stub (single floor); rewards are seals/fragments only. */
export const CLAN_RAID_DEF: DungeonDef = {
  id: 'clan-raid',
  name: 'Clan Raid',
  actId: 10,
  glBand: [18, 20],
  sets: [],
  floors: 1,
};

export function getDungeon(id: string): DungeonDef {
  if (id === ASCENDED_NIGHTSCAR_DEF.id) return ASCENDED_NIGHTSCAR_DEF;
  if (id === CLAN_RAID_DEF.id) return CLAN_RAID_DEF;
  for (const a of ACTS) if (a.dungeon?.id === id) return a.dungeon;
  throw new Error(`Unknown dungeon ${id}`);
}

export type NodeType = 'camp' | 'trash' | 'elite' | 'boss' | 'miniboss';

/** GDD §5.2: six nodes per stage. */
export const STAGE_NODES: NodeType[] = ['camp', 'trash', 'trash', 'elite', 'trash', 'boss'];

/** Global difficulty tier for a stage: Act 1 = 0-4, Act 2 = 5-9, ... */
export function stageTier(actId: number, stage: number): number {
  return (actId - 1) * 5 + (stage - 1);
}

export function stageRecLevel(actId: number, stage: number): number {
  const act = getAct(actId);
  const [lo, hi] = act.recLevel;
  return Math.round(lo + ((hi - lo) * (stage - 1)) / Math.max(1, act.stages - 1));
}

/** Recommended Combat Power for a stage (rare-full kit at rec level). */
export function stageRecCp(actId: number, stage: number): number {
  return estimateStageRecCp(stageRecLevel(actId, stage));
}

export function stageTitle(actId: number, stage: number): string {
  return `[Normal] ${getAct(actId).name} ${actId}-${stage}`;
}

export interface EnemyScale {
  hp: number;
  atk: number;
  def: number;
  xp: number;
}

/** Enemy stats for a given tier and role. Tuned against hero progression in game/sim.test.ts. */
export function enemyScale(tier: number, role: EnemyRole): EnemyScale {
  // Soften after Act 2, 4, 6, then 8 so Acts 9-10 stay clearable with set farming.
  // Softened further past Act 6 so act-scaled key costs (2–4) still allow set-farm clears.
  const growth =
    tier <= 9 ? 1.22 : tier <= 19 ? 1.175 : tier <= 29 ? 1.13 : tier <= 39 ? 1.09 : 1.07;
  const atkGrowth =
    tier <= 9 ? 1.15 : tier <= 19 ? 1.12 : tier <= 29 ? 1.095 : tier <= 39 ? 1.07 : 1.05;
  const hp = 55 * Math.pow(growth, tier);
  const atk = 9 * Math.pow(atkGrowth, tier);
  const def = 2 + tier * 2.0;
  const xp = 2.0 * Math.pow(1.2, tier);
  const mul =
    role === 'trash'
      ? { hp: 1, atk: 1, xp: 1 }
      : role === 'elite'
        ? { hp: 3.2, atk: 1.45, xp: 4 }
        : { hp: 8.2, atk: 1.8, xp: 10 };
  return { hp: hp * mul.hp, atk: atk * mul.atk, def: def * (role === 'trash' ? 1 : 1.35), xp: xp * mul.xp };
}
