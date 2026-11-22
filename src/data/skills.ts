import type { HeroClass, PlaystyleId, SkillId } from './types';

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

export const PLAYSTYLES: Record<PlaystyleId, { name: string; tagline: string; heroClass: HeroClass }> =
  {
    bladestorm: {
      name: 'Bladestorm',
      tagline: 'AoE cleave. Stack Cleave, spin through packs, finish with Bladestorm.',
      heroClass: 'Warrior',
    },
    ironclad: {
      name: 'Ironclad',
      tagline: 'Bulwark soak → Bash shred → Guard counter.',
      heroClass: 'Warrior',
    },
    inferno: {
      name: 'Inferno',
      tagline: 'Burn apply → Wave → Combustion / Meteor.',
      heroClass: 'Mage',
    },
    frostbind: {
      name: 'Frostbind',
      tagline: 'Frostbite chill → Lance → Nova → Absolute Zero.',
      heroClass: 'Mage',
    },
    volley: {
      name: 'Volley',
      tagline: 'Pierce → Rain → Multishot weave.',
      heroClass: 'Ranger',
    },
    marksmanship: {
      name: 'Marksmanship',
      tagline: 'Deadeye crits → Mark → Aimed → Kill Shot.',
      heroClass: 'Ranger',
    },
    assassination: {
      name: 'Assassination',
      tagline: 'Garrote → Ambush Crit window → Death Mark.',
      heroClass: 'Rogue',
    },
    shadowdance: {
      name: 'Shadowdance',
      tagline: 'Shadow Veil → Step → Flurry → Cloak panic.',
      heroClass: 'Rogue',
    },
  };

/** Full skill catalog. GDD §3.4 (names, numbers = balance seeds). */
export const SKILLS: SkillDef[] = [
  // ---- Warrior ------------------------------------------------------------
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
    id: 'bulwark',
    name: 'Bulwark',
    playstyle: 'ironclad',
    role: 'Passive guard',
    desc: 'Auto-attacks grant a small absorb shield (1.5% Max HP, up to 12%). Soft sustain for Ironclad.',
    energy: 0,
    cd: 0,
    unlockLevel: 1,
    passive: true,
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
  // ---- Mage ---------------------------------------------------------------
  {
    id: 'firebolt',
    name: 'Firebolt',
    playstyle: 'inferno',
    role: 'Passive burn',
    desc: 'Auto-attacks apply Burn (DoT for 4s, stacking to 5). Burned enemies take +4% damage per stack from Flame Wave and Meteor.',
    energy: 0,
    cd: 0,
    unlockLevel: 1,
    passive: true,
  },
  {
    id: 'flame-wave',
    name: 'Flame Wave',
    playstyle: 'inferno',
    role: 'Cone AoE',
    desc: 'Cone of fire for 150% ATK to every enemy in range. Applies 1 Burn stack.',
    energy: 110,
    cd: 7,
    unlockLevel: 3,
  },
  {
    id: 'meteor',
    name: 'Meteor',
    playstyle: 'inferno',
    role: 'Delayed AoE',
    desc: 'Call a meteor after 0.6s for 280% ATK AoE. Burn stacks add +5% each.',
    energy: 400,
    cd: 20,
    unlockLevel: 8,
    ultimate: true,
  },
  {
    id: 'combustion',
    name: 'Combustion',
    playstyle: 'inferno',
    role: 'Detonate burns',
    desc: 'Detonate all Burn stacks for 70% ATK per stack as burst (set bonuses may amplify).',
    energy: 160,
    cd: 12,
    unlockLevel: 13,
  },
  {
    id: 'frostbite',
    name: 'Frostbite',
    playstyle: 'frostbind',
    role: 'Passive chill',
    desc: 'Auto-attacks chill the front enemy (25% slow for 2.5s). Soft control for Frostbind.',
    energy: 0,
    cd: 0,
    unlockLevel: 1,
    passive: true,
  },
  {
    id: 'ice-lance',
    name: 'Ice Lance',
    playstyle: 'frostbind',
    role: 'Slow + ST',
    desc: 'Pierce the front enemy for 170% ATK and slow it 40% for 4s.',
    energy: 95,
    cd: 6,
    unlockLevel: 1,
  },
  {
    id: 'frost-nova',
    name: 'Frost Nova',
    playstyle: 'frostbind',
    role: 'AoE root',
    desc: 'Root all enemies for 2s and deal 110% ATK.',
    energy: 130,
    cd: 14,
    unlockLevel: 5,
  },
  {
    id: 'glacial-armor',
    name: 'Glacial Armor',
    playstyle: 'frostbind',
    role: 'Shield + chill',
    desc: 'Gain a 25% Max HP shield for 8s. Attackers are chilled (slowed) for 2s.',
    energy: 120,
    cd: 16,
    unlockLevel: 10,
  },
  {
    id: 'absolute-zero',
    name: 'Absolute Zero',
    playstyle: 'frostbind',
    role: 'Freeze ultimate',
    desc: 'Freeze all enemies for 2.5s and mark them Vulnerable (+25% damage taken) for 6s.',
    energy: 380,
    cd: 22,
    unlockLevel: 16,
    ultimate: true,
  },
  // ---- Ranger -------------------------------------------------------------
  {
    id: 'piercing-shot',
    name: 'Piercing Shot',
    playstyle: 'volley',
    role: 'Passive pierce',
    desc: 'Auto-attacks pierce through the pack, hitting every enemy in a line for 70% damage after the first.',
    energy: 0,
    cd: 0,
    unlockLevel: 1,
    passive: true,
  },
  {
    id: 'arrow-rain',
    name: 'Arrow Rain',
    playstyle: 'volley',
    role: 'Ground AoE',
    desc: 'Rain arrows for 140% ATK to every enemy.',
    energy: 125,
    cd: 9,
    unlockLevel: 3,
  },
  {
    id: 'multishot',
    name: 'Multishot',
    playstyle: 'volley',
    role: 'Fan of arrows',
    desc: 'Fan of arrows hitting up to 4 enemies for 130% ATK each.',
    energy: 180,
    cd: 11,
    unlockLevel: 8,
  },
  {
    id: 'storm-of-quills',
    name: 'Storm of Quills',
    playstyle: 'volley',
    role: 'Ultimate barrage',
    desc: 'Barrage for 2s: five waves of 80% ATK AoE.',
    energy: 420,
    cd: 20,
    unlockLevel: 14,
    ultimate: true,
  },
  {
    id: 'deadeye',
    name: 'Deadeye',
    playstyle: 'marksmanship',
    role: 'Passive precision',
    desc: 'Auto-attacks gain +15% Crit Rate. Soft precision for Marksmanship.',
    energy: 0,
    cd: 0,
    unlockLevel: 1,
    passive: true,
  },
  {
    id: 'aimed-shot',
    name: 'Aimed Shot',
    playstyle: 'marksmanship',
    role: 'High Crit ST',
    desc: 'Careful shot for 200% ATK with +25% Crit Rate. Marked targets take +15% more.',
    energy: 100,
    cd: 6,
    unlockLevel: 1,
  },
  {
    id: 'hunters-mark',
    name: "Hunter's Mark",
    playstyle: 'marksmanship',
    role: 'Mark',
    desc: 'Mark the front enemy for 8s: they take +20% damage from you.',
    energy: 70,
    cd: 10,
    unlockLevel: 4,
  },
  {
    id: 'explosive-trap',
    name: 'Explosive Trap',
    playstyle: 'marksmanship',
    role: 'Trap burst',
    desc: 'Place a trap that detonates after 0.8s for 220% ATK AoE and slows survivors 30% for 3s.',
    energy: 150,
    cd: 14,
    unlockLevel: 9,
  },
  {
    id: 'kill-shot',
    name: 'Kill Shot',
    playstyle: 'marksmanship',
    role: 'Execute',
    desc: 'Execute a target under 30% HP for 350% ATK. Always Crits.',
    energy: 220,
    cd: 16,
    unlockLevel: 15,
    ultimate: true,
  },
  // ---- Rogue --------------------------------------------------------------
  {
    id: 'backstab',
    name: 'Backstab',
    playstyle: 'assassination',
    role: 'Passive opener',
    desc: 'The first auto each fight and attacks from Stealth deal +90% damage and guarantee Crit.',
    energy: 0,
    cd: 0,
    unlockLevel: 1,
    passive: true,
  },
  {
    id: 'garrote',
    name: 'Garrote',
    playstyle: 'assassination',
    role: 'Bleed DoT',
    desc: 'Bleed the front enemy for 50% ATK/s over 6s and deal 100% ATK on apply.',
    energy: 90,
    cd: 7,
    unlockLevel: 3,
  },
  {
    id: 'ambush',
    name: 'Ambush',
    playstyle: 'assassination',
    role: 'Stealth Crit',
    desc: 'Dash into Stealth for 1.5s, then strike for 260% ATK with +40% Crit Rate.',
    energy: 160,
    cd: 12,
    unlockLevel: 7,
  },
  {
    id: 'death-mark',
    name: 'Death Mark',
    playstyle: 'assassination',
    role: 'Execute finisher',
    desc: 'Finisher for 340% ATK. Below 35% HP deals +50% more. Consumes Bleed for bonus burst.',
    energy: 450,
    cd: 22,
    unlockLevel: 14,
    ultimate: true,
  },
  {
    id: 'shadow-veil',
    name: 'Shadow Veil',
    playstyle: 'shadowdance',
    role: 'Passive evade',
    desc: 'Auto-attacks refresh a short veil (1.2s): 25% chance enemy attacks miss. Soft tempo for Shadowdance.',
    energy: 0,
    cd: 0,
    unlockLevel: 1,
    passive: true,
  },
  {
    id: 'shadowstep',
    name: 'Shadowstep',
    playstyle: 'shadowdance',
    role: 'Dash i-frames',
    desc: 'Dash strike for 130% ATK, brief immunity (0.6s), and +35% Haste for 3s.',
    energy: 70,
    cd: 7,
    unlockLevel: 1,
  },
  {
    id: 'smoke-bomb',
    name: 'Smoke Bomb',
    playstyle: 'shadowdance',
    role: 'AoE miss',
    desc: 'Blind enemies for 4s: 45% chance their attacks miss.',
    energy: 100,
    cd: 14,
    unlockLevel: 5,
  },
  {
    id: 'flurry',
    name: 'Flurry',
    playstyle: 'shadowdance',
    role: 'Multi-hit',
    desc: 'Four rapid strikes of 85% ATK on the front enemy.',
    energy: 130,
    cd: 9,
    unlockLevel: 10,
  },
  {
    id: 'cloak-of-shadows',
    name: 'Cloak of Shadows',
    playstyle: 'shadowdance',
    role: 'Cleanse + immunity',
    desc: 'Cleanse slows/roots on self and gain 2s immunity. Restore 10% Max HP.',
    energy: 200,
    cd: 18,
    unlockLevel: 16,
    ultimate: true,
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<
  SkillId,
  SkillDef
>;

export const BAR_SIZE = 4;

export const DEFAULT_LOADOUT: Record<HeroClass, SkillId[]> = {
  Warrior: ['cleave', 'shield-bash'],
  Mage: ['firebolt', 'ice-lance'],
  Ranger: ['piercing-shot', 'aimed-shot'],
  Rogue: ['backstab', 'shadowstep'],
};

export const CLASS_PLAYSTYLES: Record<HeroClass, PlaystyleId[]> = {
  Warrior: ['bladestorm', 'ironclad'],
  Mage: ['inferno', 'frostbind'],
  Ranger: ['volley', 'marksmanship'],
  Rogue: ['assassination', 'shadowdance'],
};

export function skillsForPlaystyle(p: PlaystyleId): SkillDef[] {
  return SKILLS.filter((s) => s.playstyle === p);
}

/** How many equipped skills belong to `style`. */
export function loadoutStyleCount(loadout: SkillId[] | undefined, style: PlaystyleId): number {
  if (!loadout?.length) return 0;
  return loadout.filter((id) => SKILL_BY_ID[id]?.playstyle === style).length;
}

/**
 * Playstyle identity is "on" when ≥3 of 4 bar slots match the style.
 * Mixed bars keep 2-piece crumbs only (see set effects).
 */
export function playstyleCommitted(loadout: SkillId[] | undefined, style: PlaystyleId): boolean {
  return loadoutStyleCount(loadout, style) >= 3;
}

/** Dominant playstyle on the bar, or null if tied/empty. */
export function dominantPlaystyle(loadout: SkillId[] | undefined): PlaystyleId | null {
  if (!loadout?.length) return null;
  const counts = new Map<PlaystyleId, number>();
  for (const id of loadout) {
    const p = SKILL_BY_ID[id]?.playstyle;
    if (!p) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best: PlaystyleId | null = null;
  let n = 0;
  for (const [p, c] of counts) {
    if (c > n) {
      best = p;
      n = c;
    } else if (c === n) {
      best = null;
    }
  }
  return n >= 2 ? best : null;
}

export function skillsForClass(heroClass: HeroClass): SkillDef[] {
  return SKILLS.filter((s) => PLAYSTYLES[s.playstyle].heroClass === heroClass);
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

/** Class passives (exactly two — one per playstyle). */
export function passivesForClass(heroClass: HeroClass): SkillDef[] {
  return skillsForClass(heroClass).filter((s) => s.passive);
}
