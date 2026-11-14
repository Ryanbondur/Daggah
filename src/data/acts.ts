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
};

export type BackgroundId = 'ember' | 'cavern';

export interface DungeonDef {
  id: string;
  name: string;
  actId: number;
  glBand: [number, number];
  sets: SetId[];
  floors: number;
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
];

/** Acts 3-10 are designed (GDD §5.1) but locked in this slice. */
export const LOCKED_ACTS: { id: number; name: string; theme: string }[] = [
  { id: 3, name: 'Bone Gallery', theme: 'Catacombs, skeletons' },
  { id: 4, name: 'Frostvein', theme: 'Ice-veined tunnels' },
  { id: 5, name: 'Witchmire', theme: 'Fungal marsh caverns' },
  { id: 6, name: 'Cinderreach', theme: 'Magma galleries' },
  { id: 7, name: 'Ashen Spire', theme: 'Volcanic ascent' },
  { id: 8, name: 'Echoing Dark', theme: 'Crystal echo chambers' },
  { id: 9, name: 'Voidgate', theme: 'Breach corridors' },
  { id: 10, name: 'Nightscar Depths', theme: 'Final abyss' },
];

export function getAct(id: number): ActDef {
  const act = ACTS.find((a) => a.id === id);
  if (!act) throw new Error(`Unknown act ${id}`);
  return act;
}

export function getDungeon(id: string): DungeonDef {
  for (const a of ACTS) if (a.dungeon?.id === id) return a.dungeon;
  throw new Error(`Unknown dungeon ${id}`);
}

export type NodeType = 'camp' | 'trash' | 'elite' | 'boss' | 'miniboss';

/** GDD §5.2: six nodes per stage. */
export const STAGE_NODES: NodeType[] = ['camp', 'trash', 'trash', 'elite', 'trash', 'boss'];

/** Global difficulty tier for a stage: Act 1 = 0-4, Act 2 = 5-9. */
export function stageTier(actId: number, stage: number): number {
  return (actId - 1) * 5 + (stage - 1);
}

export function stageRecLevel(actId: number, stage: number): number {
  const act = getAct(actId);
  const [lo, hi] = act.recLevel;
  return Math.round(lo + ((hi - lo) * (stage - 1)) / Math.max(1, act.stages - 1));
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
  const hp = 55 * Math.pow(1.22, tier);
  const atk = 9 * Math.pow(1.15, tier);
  const def = 2 + tier * 2.2;
  const xp = 1.8 * Math.pow(1.2, tier);
  const mul =
    role === 'trash'
      ? { hp: 1, atk: 1, xp: 1 }
      : role === 'elite'
        ? { hp: 3.4, atk: 1.5, xp: 4 }
        : { hp: 9, atk: 1.9, xp: 10 };
  return { hp: hp * mul.hp, atk: atk * mul.atk, def: def * (role === 'trash' ? 1 : 1.4), xp: xp * mul.xp };
}
