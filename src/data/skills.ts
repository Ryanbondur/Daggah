import type { PlaystyleId, SkillId } from './types';

export interface SkillDef {
  id: SkillId;
  name: string;
  playstyle: PlaystyleId;
  role: string;
  desc: string;
  energy: number;
  cd: number;
  unlockLevel: number;
  passive?: boolean;
  ultimate?: boolean;
}

export const PLAYSTYLES: Record<PlaystyleId, { name: string; tagline: string }> = {
  bladestorm: {
    name: 'Bladestorm',
    tagline: 'AoE cleave. Stack Cleave, spin through packs, finish with Bladestorm.',
  },
  ironclad: {
    name: 'Ironclad',
    tagline: 'Sustain and guard. Shred, soak, then counter.',
  },
};

/** Warrior skill catalog. GDD §3.4 (names, numbers = balance seeds). */
export const SKILLS: SkillDef[] = [
  {
    id: 'cleave',
    name: 'Cleave',
    playstyle: 'bladestorm',
    role: 'Passive empower',
    desc: 'Auto-attacks also hit 2 more targets for 60% damage and build Cleave stacks (max 5) that empower Whirlwind and Bladestorm.',
    energy: 0,
    cd: 0,
    unlockLevel: 1,
    passive: true,
  },
  {
    id: 'whirlwind',
    name: 'Whirlwind',
    playstyle: 'bladestorm',
    role: 'Spin AoE',
    desc: 'Spin for 160% ATK to every enemy. Each Cleave stack adds +4% damage and refunds 6 Energy.',
    energy: 120,
    cd: 8,
    unlockLevel: 3,
  },
  {
    id: 'bladestorm',
    name: 'Bladestorm',
    playstyle: 'bladestorm',
    role: 'Ultimate spin',
    desc: 'Channel a blade vortex for 2.4s: six hits of 90% ATK to every enemy. Cleave stacks add +6% each.',
    energy: 465,
    cd: 18,
    unlockLevel: 7,
    ultimate: true,
  },
  {
    id: 'war-banner',
    name: 'War Banner',
    playstyle: 'bladestorm',
    role: 'ATK buff',
    desc: 'Plant a banner: +25% ATK and +15% Haste for 8s.',
    energy: 80,
    cd: 14,
    unlockLevel: 12,
  },
  {
    id: 'shield-bash',
    name: 'Shield Bash',
    playstyle: 'ironclad',
    role: 'Stun + DEF shred',
    desc: 'Slam the front enemy for 130% ATK, stunning it for 1.5s and making it take +20% damage for 5s.',
    energy: 90,
    cd: 7,
    unlockLevel: 1,
  },
  {
    id: 'iron-skin',
    name: 'Iron Skin',
    playstyle: 'ironclad',
    role: 'Absorb shield',
    desc: 'Gain a shield worth 30% of Max HP for 8s.',
    energy: 100,
    cd: 12,
    unlockLevel: 4,
  },
  {
    id: 'rally',
    name: 'Rally',
    playstyle: 'ironclad',
    role: 'Heal over time',
    desc: 'Recover 30% of Max HP over 4s.',
    energy: 140,
    cd: 16,
    unlockLevel: 9,
  },
  {
    id: 'executioners-guard',
    name: "Executioner's Guard",
    playstyle: 'ironclad',
    role: 'Counter',
    desc: 'Guard for 5s: block the next hit and counter for 300% ATK, stunning the attacker.',
    energy: 200,
    cd: 20,
    unlockLevel: 15,
    ultimate: true,
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<
  SkillId,
  SkillDef
>;

export const BAR_SIZE = 4;

export const DEFAULT_LOADOUT: SkillId[] = ['cleave', 'shield-bash'];

export function skillsForPlaystyle(p: PlaystyleId): SkillDef[] {
  return SKILLS.filter((s) => s.playstyle === p);
}

export function isUnlocked(id: SkillId, level: number): boolean {
  return SKILL_BY_ID[id].unlockLevel <= level;
}

/** Default Primary = highest-cost skill in loadout (GDD §3.5). */
export function defaultPrimary(loadout: SkillId[]): SkillId | null {
  const actives = loadout.map((id) => SKILL_BY_ID[id]).filter((s) => !s.passive);
  if (actives.length === 0) return null;
  actives.sort((a, b) => b.energy - a.energy);
  return actives[0].id;
}
