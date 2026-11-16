import type { SetEffects } from './gear';
import type { CapeId, HeroClass, IconPack } from './types';

export interface CapeDef {
  id: CapeId;
  name: string;
  heroClass: HeroClass;
  /** Earliest act whose dungeons can drop this cape (7–10). */
  minAct: number;
  /** Flavor + combat effect shown on the detail card. */
  effectText: string;
  icon: IconPack;
  /** Merged into SetEffects when this cape is equipped (not a set bonus). */
  apply: (fx: SetEffects) => void;
}

/**
 * 3 unique effect capes per class (12 total). Class-locked, never set pieces.
 * Drop gates: Act 7 Spire / Act 8 Echo / Act 9–10 Gate+Nightscar.
 */
export const CAPES: Record<CapeId, CapeDef> = {
  'bulwark-mantle': {
    id: 'bulwark-mantle',
    name: 'Bulwark Mantle',
    heroClass: 'Warrior',
    minAct: 7,
    effectText: 'Take 10% less damage. Iron Skin / shields absorb +15%.',
    icon: 'b',
    apply: (fx) => {
      fx.dmgTakenReductionPct += 10;
      fx.absorbPct += 15;
    },
  },
  'bloodhowl-cape': {
    id: 'bloodhowl-cape',
    name: 'Bloodhowl Cape',
    heroClass: 'Warrior',
    minAct: 8,
    effectText: 'On kill: heal 3% Max HP. +8% ATK.',
    icon: 'c',
    apply: (fx) => {
      fx.onKillHealPct += 3;
      fx.atkPct += 8;
    },
  },
  'warlords-drape': {
    id: 'warlords-drape',
    name: "Warlord's Drape",
    heroClass: 'Warrior',
    minAct: 9,
    effectText: 'Ultimates deal +18% damage. After ultimate: +10% damage for 5s.',
    icon: 'd',
    apply: (fx) => {
      fx.ultimateDmgPct += 18;
      fx.postUltDmgPct += 10;
      fx.postUltDuration = Math.max(fx.postUltDuration, 5);
    },
  },
  'ashveil-cloak': {
    id: 'ashveil-cloak',
    name: 'Ashveil Cloak',
    heroClass: 'Mage',
    minAct: 7,
    effectText: '+14% burn damage. Combustion deals +25%.',
    icon: 'e',
    apply: (fx) => {
      fx.burnPct += 14;
      fx.combustPct += 25;
    },
  },
  'frostspire-cape': {
    id: 'frostspire-cape',
    name: 'Frostspire Cape',
    heroClass: 'Mage',
    minAct: 8,
    effectText: '+14% slow potency. Freeze duration +1.0s.',
    icon: 'f',
    apply: (fx) => {
      fx.slowPct += 14;
      fx.freezeBonus += 1;
    },
  },
  'arcane-loom': {
    id: 'arcane-loom',
    name: 'Arcane Loom',
    heroClass: 'Mage',
    minAct: 9,
    effectText: 'On skill cast: refund 10 Energy. +12% Skill Power.',
    icon: 'g',
    apply: (fx) => {
      fx.skillEnergyRefund += 10;
      fx.skillPowerPct += 12;
    },
  },
  'quillwind-cape': {
    id: 'quillwind-cape',
    name: 'Quillwind Cape',
    heroClass: 'Ranger',
    minAct: 7,
    effectText: '+12% AoE damage. Arrow Rain width +20%.',
    icon: 'h',
    apply: (fx) => {
      fx.aoePct += 12;
      fx.arrowRainWidth += 20;
    },
  },
  'deadeye-shroud': {
    id: 'deadeye-shroud',
    name: 'Deadeye Shroud',
    heroClass: 'Ranger',
    minAct: 8,
    effectText: '+5% Crit Rate. Kill Shot threshold 35%.',
    icon: 'i',
    apply: (fx) => {
      fx.critRatePct += 5;
      fx.executeThreshold = Math.max(fx.executeThreshold, 0.35);
    },
  },
  'hawkflight-mantle': {
    id: 'hawkflight-mantle',
    name: 'Hawkflight Mantle',
    heroClass: 'Ranger',
    minAct: 9,
    effectText: '+8% Haste. All skill cooldowns −7%.',
    icon: 'j',
    apply: (fx) => {
      fx.hastePct += 8;
      fx.globalCdPct += 7;
    },
  },
  'nightstalker-cape': {
    id: 'nightstalker-cape',
    name: 'Nightstalker Cape',
    heroClass: 'Rogue',
    minAct: 7,
    effectText: '+14% Crit Dmg. Ambush deals +25%.',
    icon: 'k',
    apply: (fx) => {
      fx.critDmgPct += 14;
      fx.skillDmgPct.ambush = (fx.skillDmgPct.ambush ?? 0) + 25;
    },
  },
  'shadowweave-cloak': {
    id: 'shadowweave-cloak',
    name: 'Shadowweave Cloak',
    heroClass: 'Rogue',
    minAct: 8,
    effectText: '+8% Haste. +1 Shadowstep charge.',
    icon: 'b',
    apply: (fx) => {
      fx.hastePct += 8;
      fx.shadowstepCharges += 1;
    },
  },
  'deathveil-drape': {
    id: 'deathveil-drape',
    name: 'Deathveil Drape',
    heroClass: 'Rogue',
    minAct: 9,
    effectText: 'On critical hit: heal 1.5% Max HP. Death Mark cost −12%.',
    icon: 'c',
    apply: (fx) => {
      fx.onCritHealPct += 1.5;
      fx.skillCostPct['death-mark'] = (fx.skillCostPct['death-mark'] ?? 0) + 12;
    },
  },
};

export const CAPE_IDS = Object.keys(CAPES) as CapeId[];

export function capeDef(id: CapeId): CapeDef {
  return CAPES[id];
}

/** Capes available for this class at the given act (and Nightscar/Ascended). */
export function capePoolFor(heroClass: HeroClass, actId: number): CapeId[] {
  return CAPE_IDS.filter((id) => {
    const c = CAPES[id];
    return c.heroClass === heroClass && c.minAct <= actId;
  });
}

/** Late-act / endgame dungeons can roll capes (Acts 7–10, Ascended). */
export function dungeonAllowsCapes(actId: number, endgame?: boolean): boolean {
  return endgame === true || actId >= 7;
}

/** Apply equipped cape special effect into set-effect bag (additive, not a set). */
export function applyEquippedCapeEffects(fx: SetEffects, cape: { capeId?: CapeId; slot?: string } | undefined): void {
  if (!cape?.capeId || cape.slot !== 'cape') return;
  CAPES[cape.capeId].apply(fx);
}
