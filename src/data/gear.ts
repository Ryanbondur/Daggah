import type { Rng } from '../game/rng';
import { applyNightscarSoftPity } from '../game/nightscarPity';
import { CAPES, applyEquippedCapeEffects, capePoolFor } from './capes';
import type {
  CapeId,
  HeroClass,
  IconPack,
  Item,
  PlaystyleId,
  RarityId,
  SetId,
  SkillId,
  SlotId,
  StatKey,
  Stats,
  WeaponType,
  ArmorType,
} from './types';
import { STAT_KEYS } from './types';
import { PLAYSTYLES, playstyleCommitted } from './skills';
import { heroBaseStats } from './xp';
import { CLASS_WEAPON_TYPE, STARTER_WEAPON_NAME, weaponBaseNames } from './weapons';
import { CLASS_ARMOR_TYPE, STARTER_ARMOR_NAME, armorBaseNames, isArmorSlot } from './armor';

export const SLOTS: SlotId[] = [
  'weapon',
  'chest',
  'belt',
  'helmet',
  'gloves',
  'bracers',
  'shoulders',
  'boots',
  'amulet',
  'medal',
  'ring',
  'cape',
];

/** Slots that appear on set pieces / random non-cape rolls. Capes are catalog-only. */
export const SET_SLOTS = SLOTS.filter((s): s is Exclude<SlotId, 'cape'> => s !== 'cape');

export const SLOT_LABEL: Record<SlotId, string> = {
  weapon: 'Weapon',
  chest: 'Chest',
  belt: 'Belt',
  helmet: 'Helmet',
  gloves: 'Gloves',
  bracers: 'Bracers',
  shoulders: 'Shoulders',
  boots: 'Boots',
  amulet: 'Amulet',
  medal: 'Medal',
  ring: 'Ring',
  cape: 'Cape',
};

export interface RarityDef {
  id: RarityId;
  label: string;
  mult: number;
  color: string;
  substats: number;
  salvage: { dust: number; crystals: number };
}

export const RARITIES: Record<RarityId, RarityDef> = {
  common: {
    id: 'common',
    label: 'Common',
    mult: 1,
    color: '#b8b5ad',
    substats: 0,
    salvage: { dust: 5, crystals: 0 },
  },
  rare: {
    id: 'rare',
    label: 'Rare',
    mult: 1.25,
    color: '#3f78d8',
    substats: 1,
    salvage: { dust: 15, crystals: 2 },
  },
  epic: {
    id: 'epic',
    label: 'Epic',
    mult: 1.55,
    color: '#9a4bd0',
    substats: 2,
    salvage: { dust: 40, crystals: 8 },
  },
  legendary: {
    id: 'legendary',
    label: 'Legendary',
    mult: 1.9,
    color: '#f0cf3a',
    substats: 3,
    salvage: { dust: 100, crystals: 25 },
  },
};

export const RARITY_ORDER: RarityId[] = ['common', 'rare', 'epic', 'legendary'];

/** Drop tables. GDD §6.8. Nightscar floors are stingier; boss uses the endgame table. */
export type DropSource =
  | 'stage-boss'
  | 'stage-elite'
  | 'dungeon-floor'
  | 'dungeon-mini'
  | 'dungeon-boss'
  | 'nightscar-floor'
  | 'nightscar-mini'
  | 'nightscar-boss'
  | 'ascended-floor'
  | 'ascended-mini'
  | 'ascended-boss';

const DROP_WEIGHTS: Record<DropSource, Record<RarityId, number>> = {
  'stage-boss': { common: 70, rare: 25, epic: 5, legendary: 0 },
  'stage-elite': { common: 85, rare: 14, epic: 1, legendary: 0 },
  'dungeon-floor': { common: 55, rare: 30, epic: 13, legendary: 2 },
  'dungeon-mini': { common: 45, rare: 35, epic: 16, legendary: 4 },
  'dungeon-boss': { common: 35, rare: 40, epic: 20, legendary: 5 },
  // Floors lean Epic enough to assemble a full non-BiS clear set; Legendary stays
  // a lucky seasonal BiS chase (speed + clan CP), not a clear gate. Tuned so
  // ~42% of regular raiders complete a 6pc Legendary Regalia by day 30 (GDD §6.8).
  // Nightscar/Ascended Epic+Legendary weights are scaled by 1/(1 − capeDropChance) so
  // cape drops (which replace a drop) leave effective set-piece odds unchanged.
  'nightscar-floor': { common: 59.3, rare: 27.67, epic: 12.7, legendary: 0.33 },
  'nightscar-mini': { common: 44.4, rare: 32.86, epic: 21.6, legendary: 1.14 },
  'nightscar-boss': { common: 19.3, rare: 36.77, epic: 41.0, legendary: 2.93 },
  // Ascended Nightscar: higher BiS odds than Apex; still lucky, not guaranteed.
  'ascended-floor': { common: 46.8, rare: 29.26, epic: 22.2, legendary: 1.74 },
  'ascended-mini': { common: 29.8, rare: 31.58, epic: 35.1, legendary: 3.52 },
  'ascended-boss': { common: 6.4, rare: 17.97, epic: 64.9, legendary: 10.73 },
};

/** Base drop weights for a source (before Nightscar soft pity). */
export function baseDropWeights(source: DropSource): Record<RarityId, number> {
  return { ...DROP_WEIGHTS[source] };
}

/**
 * Resolve rarity weights. `pity` only affects Nightscar / Ascended Apex sources
 * (`nightscar-*`, `ascended-*`); other tables ignore it.
 */
export function dropWeightsFor(source: DropSource, pity = 0): Record<RarityId, number> {
  const base = baseDropWeights(source);
  const pityable = source.startsWith('nightscar-') || source.startsWith('ascended-');
  if (!pityable || pity <= 0) return base;
  return applyNightscarSoftPity(base, pity);
}

export function rollRarity(rng: Rng, source: DropSource, pity = 0): RarityId {
  const w = dropWeightsFor(source, pity);
  const total = RARITY_ORDER.reduce((s, r) => s + w[r], 0);
  let roll = rng.next() * total;
  for (const r of RARITY_ORDER) {
    roll -= w[r];
    if (roll < 0) return r;
  }
  return 'common';
}

/** Per-slot stat weights. Armor pieces split HP/DEF by weight. */
const ARMOR_WEIGHT: Partial<Record<SlotId, number>> = {
  chest: 1.6,
  helmet: 1,
  shoulders: 1,
  /** Merged former legs (1.3) + boots (0.8) so full-kit CP stays stable. */
  boots: 2.1,
  belt: 0.7,
  gloves: 0.6,
  bracers: 0.6,
  /** Cape: light armor + specialty; power is mostly the unique effect. */
  cape: 0.85,
};

const SUBSTAT_POOL: StatKey[] = ['critRate', 'critDmg', 'haste', 'energyRegen', 'skillPower'];

function substatValue(stat: StatKey, gl: number, mult: number): number {
  switch (stat) {
    case 'critRate':
      return round1((0.8 + 0.35 * gl) * mult);
    case 'critDmg':
      return round1((2 + 1.2 * gl) * mult);
    case 'haste':
      return round1((0.8 + 0.3 * gl) * mult);
    case 'energyRegen':
      return round1((0.4 + 0.25 * gl) * mult);
    case 'skillPower':
      return round1((1 + 0.6 * gl) * mult);
    default:
      return 0;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function baseStatsForSlot(slot: SlotId, gl: number, mult: number): Partial<Stats> {
  const s: Partial<Stats> = {};
  if (slot === 'weapon') {
    s.atk = Math.round((2 + 3 * gl) * mult);
    s.critRate = round1((1 + 0.5 * gl) * mult);
  } else if (slot === 'ring') {
    s.atk = Math.round((1 + 0.6 * gl) * mult);
    s.def = Math.max(1, Math.round((0.2 + 0.2 * gl) * mult));
    s.hp = Math.round((8 + 10 * gl) * mult);
  } else if (slot === 'amulet') {
    s.skillPower = round1((2 + 1.2 * gl) * mult);
    s.energyRegen = round1((0.5 + 0.4 * gl) * mult);
    s.hp = Math.round((6 + 6 * gl) * mult);
  } else if (slot === 'medal') {
    s.haste = round1((1 + 0.6 * gl) * mult);
    s.critDmg = round1((3 + 2 * gl) * mult);
  } else if (slot === 'cape') {
    // Capes: modest HP/DEF + a haste or skill-power secondary; unique effect is the hook.
    const w = ARMOR_WEIGHT.cape ?? 0.85;
    s.hp = Math.round((10 + 8 * gl) * w * mult);
    s.def = Math.max(1, Math.round((0.8 + 0.9 * gl) * w * mult));
    s.haste = round1((0.6 + 0.25 * gl) * mult);
  } else {
    const w = ARMOR_WEIGHT[slot] ?? 1;
    s.hp = Math.round((10 + 8 * gl) * w * mult);
    s.def = Math.max(1, Math.round((0.8 + 0.9 * gl) * w * mult));
  }
  return s;
}

/** Class-neutral slots; armor-slot names are class-specific (see armor.ts). */
const BASE_NAMES: Record<'amulet' | 'medal' | 'ring' | 'cape', string[]> = {
  amulet: ['Amulet', 'Fang Charm'],
  medal: ['Medal', 'War Token'],
  ring: ['Ring', 'Band'],
  cape: ['Cape', 'Cloak', 'Mantle', 'Drape'],
};

const PREFIX: Record<RarityId, string[]> = {
  common: ['Rusty', 'Worn', 'Cracked', 'Battered', 'Useless'],
  rare: ['Tempered', 'Reinforced', 'Gleaming'],
  epic: ["Warlord's", 'Runed', 'Gilded'],
  legendary: ["Daggah-bane", 'Ancient', 'Emberheart'],
};

export interface SetDef {
  id: SetId;
  name: string;
  act: number;
  favors: string;
  /** When set, 4/6 bonuses require a committed playstyle loadout (≥3 matching skills). */
  favorsPlaystyle?: PlaystyleId;
  icon: IconPack;
  bonuses: { pieces: 2 | 4 | 6; text: string }[];
}

export const SETS: Record<SetId, SetDef> = {
  'ember-raider': {
    id: 'ember-raider',
    name: 'Ember Raider',
    act: 1,
    favors: 'Any / leveling',
    icon: 'a',
    bonuses: [
      { pieces: 2, text: '+5% ATK' },
      { pieces: 4, text: '+8% HP' },
      { pieces: 6, text: '+10% Energy Regen' },
    ],
  },
  'cavern-cleaver': {
    id: 'cavern-cleaver',
    name: 'Cavern Cleaver',
    act: 2,
    favors: 'Warrior Bladestorm (requires loadout)',
    favorsPlaystyle: 'bladestorm',
    icon: 'b',
    bonuses: [
      { pieces: 2, text: '+12% AoE (+18% ATK when Bladestorm bar)' },
      { pieces: 4, text: 'Whirlwind CD -3s · +25% WW dmg (Bladestorm bar)' },
      { pieces: 6, text: 'Bladestorm cost -20% · +35% ult dmg (Bladestorm bar)' },
    ],
  },
  'cavern-bulwark': {
    id: 'cavern-bulwark',
    name: 'Cavern Bulwark',
    act: 2,
    favors: 'Warrior Ironclad (requires loadout)',
    favorsPlaystyle: 'ironclad',
    icon: 'b',
    bonuses: [
      { pieces: 2, text: '+12% DEF (+18% HP when Ironclad bar)' },
      { pieces: 4, text: 'Iron Skin +35% absorb (Ironclad bar)' },
      { pieces: 6, text: 'Rally heals +25% · +12% DEF (Ironclad bar)' },
    ],
  },
  gravemarch: {
    id: 'gravemarch',
    name: 'Gravemarch',
    act: 3,
    favors: 'Any / sustain',
    icon: 'c',
    bonuses: [
      { pieces: 2, text: '+6% DEF' },
      { pieces: 4, text: '+8% HP' },
      { pieces: 6, text: 'On-kill heal 2% Max HP' },
    ],
  },
  'ashen-codex': {
    id: 'ashen-codex',
    name: 'Ashen Codex',
    act: 4,
    favors: 'Mage Inferno (requires loadout)',
    favorsPlaystyle: 'inferno',
    icon: 'd',
    bonuses: [
      { pieces: 2, text: '+12% burn (+15% Skill Power when Inferno bar)' },
      { pieces: 4, text: 'Meteor CD -3s (Inferno bar)' },
      { pieces: 6, text: 'Combustion +40% (Inferno bar)' },
    ],
  },
  'rime-circlet': {
    id: 'rime-circlet',
    name: 'Rime Circlet',
    act: 4,
    favors: 'Mage Frostbind (requires loadout)',
    favorsPlaystyle: 'frostbind',
    icon: 'd',
    bonuses: [
      { pieces: 2, text: '+12% slow (+12% DEF when Frostbind bar)' },
      { pieces: 4, text: 'Nova CD -3s (Frostbind bar)' },
      { pieces: 6, text: 'Absolute Zero +1.5s freeze (Frostbind bar)' },
    ],
  },
  quillstorm: {
    id: 'quillstorm',
    name: 'Quillstorm',
    act: 5,
    favors: 'Ranger Volley (requires loadout)',
    favorsPlaystyle: 'volley',
    icon: 'e',
    bonuses: [
      { pieces: 2, text: '+12% AoE (+15% ATK when Volley bar)' },
      { pieces: 4, text: 'Arrow Rain width +30% (Volley bar)' },
      { pieces: 6, text: 'Storm of Quills +30% dmg (Volley bar)' },
    ],
  },
  deadeye: {
    id: 'deadeye',
    name: 'Deadeye',
    act: 5,
    favors: 'Ranger Marksmanship (requires loadout)',
    favorsPlaystyle: 'marksmanship',
    icon: 'e',
    bonuses: [
      { pieces: 2, text: '+8% Crit Rate (+12% Crit Dmg when Marksman bar)' },
      { pieces: 4, text: 'Mark duration +4s (Marksman bar)' },
      { pieces: 6, text: 'Kill Shot threshold 40% (Marksman bar)' },
    ],
  },
  cinderstride: {
    id: 'cinderstride',
    name: 'Cinderstride',
    act: 6,
    favors: 'Any / haste',
    icon: 'f',
    bonuses: [
      { pieces: 2, text: '+6% Haste' },
      { pieces: 4, text: '+8% Energy Regen' },
      { pieces: 6, text: 'Skill CDs -5%' },
    ],
  },
  nightfang: {
    id: 'nightfang',
    name: 'Nightfang',
    act: 7,
    favors: 'Rogue Assassination (requires loadout)',
    favorsPlaystyle: 'assassination',
    icon: 'g',
    bonuses: [
      { pieces: 2, text: '+14% Crit Dmg (+12% ATK when Assassination bar)' },
      { pieces: 4, text: 'Ambush +30% (Assassination bar)' },
      { pieces: 6, text: 'Death Mark -15% cost (Assassination bar)' },
    ],
  },
  gloomveil: {
    id: 'gloomveil',
    name: 'Gloomveil',
    act: 7,
    favors: 'Rogue Shadowdance (requires loadout)',
    favorsPlaystyle: 'shadowdance',
    icon: 'g',
    bonuses: [
      { pieces: 2, text: '+12% Haste (+10% Energy Regen when Shadowdance bar)' },
      { pieces: 4, text: 'Shadowstep +1 charge (Shadowdance bar)' },
      { pieces: 6, text: 'Cloak +1.0s (Shadowdance bar)' },
    ],
  },
  echoplate: {
    id: 'echoplate',
    name: 'Echoplate',
    act: 8,
    favors: 'Any / hybrid',
    icon: 'h',
    bonuses: [
      { pieces: 2, text: '+7% ATK' },
      { pieces: 4, text: '+7% Skill Power' },
      { pieces: 6, text: 'After ultimate: +10% dmg 5s' },
    ],
  },
  voidwoven: {
    id: 'voidwoven',
    name: 'Voidwoven',
    act: 9,
    favors: 'Any / endgame prep',
    icon: 'i',
    bonuses: [
      { pieces: 2, text: '+9% all primary' },
      { pieces: 4, text: '+10% Crit Dmg' },
      { pieces: 6, text: 'Ultimate cost -10%' },
    ],
  },
  'nightscar-regalia': {
    id: 'nightscar-regalia',
    name: 'Nightscar Regalia',
    act: 10,
    favors: 'All endgame',
    icon: 'j',
    bonuses: [
      { pieces: 2, text: '+10% all primary' },
      { pieces: 4, text: '+12% Skill Power' },
      { pieces: 6, text: 'Class ultimate +20% dmg' },
    ],
  },
  clanforged: {
    id: 'clanforged',
    name: 'Clanforged',
    act: 0,
    favors: 'Clan PvP',
    icon: 'k',
    bonuses: [
      { pieces: 2, text: '+8% CP in PvP' },
      { pieces: 4, text: '+10% clan token gains' },
      { pieces: 6, text: 'Clanforged legendary visual' },
    ],
  },
};

export interface SetEffects {
  atkPct: number;
  hpPct: number;
  defPct: number;
  energyRegenPct: number;
  aoePct: number;
  skillCdMinus: Partial<Record<SkillId, number>>;
  skillCostPct: Partial<Record<SkillId, number>>;
  skillDmgPct: Partial<Record<SkillId, number>>;
  absorbPct: number;
  healPct: number;
  burnPct: number;
  combustPct: number;
  slowPct: number;
  freezeBonus: number;
  onKillHealPct: number;
  executeThreshold: number;
  critRatePct: number;
  markDurationBonus: number;
  hastePct: number;
  globalCdPct: number;
  arrowRainWidth: number;
  critDmgPct: number;
  skillPowerPct: number;
  shadowstepCharges: number;
  cloakDurationBonus: number;
  postUltDmgPct: number;
  postUltDuration: number;
  ultimateCostPct: number;
  ultimateDmgPct: number;
  /** Clanforged 2pc — applied in PvP only. */
  pvpCpPct: number;
  /** Clanforged 4pc — token reward multiplier. */
  tokenGainPct: number;
  /** Cape: flat damage-taken reduction (enemy hits). */
  dmgTakenReductionPct: number;
  /** Cape: flat energy refunded after each skill cast. */
  skillEnergyRefund: number;
  /** Cape: heal % Max HP on critical hits. */
  onCritHealPct: number;
}

export function emptySetEffects(): SetEffects {
  return {
    atkPct: 0,
    hpPct: 0,
    defPct: 0,
    energyRegenPct: 0,
    aoePct: 0,
    skillCdMinus: {},
    skillCostPct: {},
    skillDmgPct: {},
    absorbPct: 0,
    healPct: 0,
    burnPct: 0,
    combustPct: 0,
    slowPct: 0,
    freezeBonus: 0,
    onKillHealPct: 0,
    executeThreshold: 0.3,
    critRatePct: 0,
    markDurationBonus: 0,
    hastePct: 0,
    globalCdPct: 0,
    arrowRainWidth: 0,
    critDmgPct: 0,
    skillPowerPct: 0,
    shadowstepCharges: 0,
    cloakDurationBonus: 0,
    postUltDmgPct: 0,
    postUltDuration: 0,
    ultimateCostPct: 0,
    ultimateDmgPct: 0,
    pvpCpPct: 0,
    tokenGainPct: 0,
    dmgTakenReductionPct: 0,
    skillEnergyRefund: 0,
    onCritHealPct: 0,
  };
}

export type Gear = Partial<Record<SlotId, Item>>;

export function setCounts(gear: Gear): Partial<Record<SetId, number>> {
  const counts: Partial<Record<SetId, number>> = {};
  for (const slot of SLOTS) {
    const it = gear[slot];
    if (it?.setId) counts[it.setId] = (counts[it.setId] ?? 0) + 1;
  }
  return counts;
}

export function computeSetEffects(gear: Gear, loadout?: SkillId[]): SetEffects {
  const fx = emptySetEffects();
  const counts = setCounts(gear);
  const n = (id: SetId) => counts[id] ?? 0;
  const styleOn = (id: SetId): boolean => {
    const style = SETS[id].favorsPlaystyle;
    if (!style) return true;
    return playstyleCommitted(loadout, style);
  };

  if (n('ember-raider') >= 2) fx.atkPct += 5;
  if (n('ember-raider') >= 4) fx.hpPct += 8;
  if (n('ember-raider') >= 6) fx.energyRegenPct += 10;

  // Playstyle sets: 2pc baseline always; identity/4/6 require committed loadout (≥3 skills).
  if (n('cavern-cleaver') >= 2) {
    fx.aoePct += 8;
    if (styleOn('cavern-cleaver')) {
      fx.aoePct += 4;
      fx.atkPct += 18;
    }
  }
  if (n('cavern-cleaver') >= 4 && styleOn('cavern-cleaver')) {
    fx.skillCdMinus.whirlwind = 3;
    fx.skillDmgPct.whirlwind = (fx.skillDmgPct.whirlwind ?? 0) + 25;
  }
  if (n('cavern-cleaver') >= 6 && styleOn('cavern-cleaver')) {
    fx.skillCostPct.bladestorm = 20;
    fx.ultimateDmgPct += 35;
  }

  if (n('cavern-bulwark') >= 2) {
    fx.defPct += 8;
    if (styleOn('cavern-bulwark')) {
      fx.defPct += 4;
      fx.hpPct += 18;
    }
  }
  if (n('cavern-bulwark') >= 4 && styleOn('cavern-bulwark')) fx.absorbPct += 35;
  if (n('cavern-bulwark') >= 6 && styleOn('cavern-bulwark')) {
    fx.healPct += 25;
    fx.defPct += 12;
  }

  if (n('gravemarch') >= 2) fx.defPct += 6;
  if (n('gravemarch') >= 4) fx.hpPct += 8;
  if (n('gravemarch') >= 6) fx.onKillHealPct += 2;

  if (n('ashen-codex') >= 2) {
    fx.burnPct += 8;
    if (styleOn('ashen-codex')) {
      fx.burnPct += 4;
      fx.skillPowerPct += 15;
    }
  }
  if (n('ashen-codex') >= 4 && styleOn('ashen-codex')) fx.skillCdMinus.meteor = 3;
  if (n('ashen-codex') >= 6 && styleOn('ashen-codex')) fx.combustPct += 40;

  if (n('rime-circlet') >= 2) {
    fx.slowPct += 8;
    if (styleOn('rime-circlet')) {
      fx.slowPct += 4;
      fx.defPct += 12;
    }
  }
  if (n('rime-circlet') >= 4 && styleOn('rime-circlet')) fx.skillCdMinus['frost-nova'] = 3;
  if (n('rime-circlet') >= 6 && styleOn('rime-circlet')) fx.freezeBonus += 1.5;

  if (n('quillstorm') >= 2) {
    fx.aoePct += 8;
    if (styleOn('quillstorm')) {
      fx.aoePct += 4;
      fx.atkPct += 15;
    }
  }
  if (n('quillstorm') >= 4 && styleOn('quillstorm')) fx.arrowRainWidth += 30;
  if (n('quillstorm') >= 6 && styleOn('quillstorm')) fx.skillDmgPct['storm-of-quills'] = 30;

  if (n('deadeye') >= 2) {
    fx.critRatePct += 6;
    if (styleOn('deadeye')) {
      fx.critRatePct += 2;
      fx.critDmgPct += 12;
    }
  }
  if (n('deadeye') >= 4 && styleOn('deadeye')) fx.markDurationBonus += 4;
  if (n('deadeye') >= 6 && styleOn('deadeye')) fx.executeThreshold = Math.max(fx.executeThreshold, 0.4);

  if (n('cinderstride') >= 2) fx.hastePct += 6;
  if (n('cinderstride') >= 4) fx.energyRegenPct += 8;
  if (n('cinderstride') >= 6) fx.globalCdPct += 5;

  if (n('nightfang') >= 2) {
    fx.critDmgPct += 10;
    if (styleOn('nightfang')) {
      fx.critDmgPct += 4;
      fx.atkPct += 12;
    }
  }
  if (n('nightfang') >= 4 && styleOn('nightfang')) fx.skillDmgPct.ambush = 30;
  if (n('nightfang') >= 6 && styleOn('nightfang')) fx.skillCostPct['death-mark'] = 15;

  if (n('gloomveil') >= 2) {
    fx.hastePct += 8;
    if (styleOn('gloomveil')) {
      fx.hastePct += 4;
      fx.energyRegenPct += 10;
    }
  }
  if (n('gloomveil') >= 4 && styleOn('gloomveil')) fx.shadowstepCharges += 1;
  if (n('gloomveil') >= 6 && styleOn('gloomveil')) fx.cloakDurationBonus += 1;

  if (n('echoplate') >= 2) fx.atkPct += 7;
  if (n('echoplate') >= 4) fx.skillPowerPct += 7;
  if (n('echoplate') >= 6) {
    fx.postUltDmgPct += 10;
    fx.postUltDuration = Math.max(fx.postUltDuration, 5);
  }
  if (n('voidwoven') >= 2) {
    fx.atkPct += 9;
    fx.defPct += 9;
    fx.hpPct += 9;
  }
  if (n('voidwoven') >= 4) fx.critDmgPct += 10;
  if (n('voidwoven') >= 6) fx.ultimateCostPct += 10;
  if (n('nightscar-regalia') >= 2) {
    fx.atkPct += 10;
    fx.defPct += 10;
    fx.hpPct += 10;
  }
  if (n('nightscar-regalia') >= 4) fx.skillPowerPct += 12;
  if (n('nightscar-regalia') >= 6) fx.ultimateDmgPct += 20;
  if (n('clanforged') >= 2) fx.pvpCpPct += 8;
  if (n('clanforged') >= 4) fx.tokenGainPct += 10;
  // Capes are not set pieces; fold their unique effect into the same combat bag.
  applyEquippedCapeEffects(fx, gear.cape);
  return fx;
}

export interface HeroTotals {
  stats: Stats;
  effects: SetEffects;
  cp: number;
}

/** GDD §3.1 CP formula (assumption). */
export function cpFromStats(s: Stats): number {
  return Math.round(
    s.atk * 2 +
      s.def * 1.5 +
      s.hp * 0.15 +
      s.critRate * 8 +
      s.critDmg * 4 +
      s.skillPower * 2.2 +
      s.haste * 6,
  );
}

export function computeHero(
  level: number,
  gear: Gear,
  heroClass: HeroClass = 'Warrior',
  loadout?: SkillId[],
): HeroTotals {
  const stats = heroBaseStats(level, heroClass);
  for (const slot of SLOTS) {
    const it = gear[slot];
    if (!it) continue;
    for (const k of STAT_KEYS) {
      const v = it.stats[k];
      if (v) stats[k] += v;
    }
  }
  const effects = computeSetEffects(gear, loadout);
  stats.atk = Math.round(stats.atk * (1 + effects.atkPct / 100));
  stats.hp = Math.round(stats.hp * (1 + effects.hpPct / 100));
  stats.def = Math.round(stats.def * (1 + effects.defPct / 100));
  stats.critRate = Math.round((stats.critRate + effects.critRatePct) * 10) / 10;
  stats.critDmg = Math.round((stats.critDmg + effects.critDmgPct) * 10) / 10;
  stats.skillPower = Math.round((stats.skillPower + effects.skillPowerPct) * 10) / 10;
  stats.haste = Math.round((stats.haste + effects.hastePct) * 10) / 10;
  stats.energyRegen = Math.round(stats.energyRegen * 10) / 10;
  return { stats, effects, cp: cpFromStats(stats) };
}

export function heroCpWith(
  level: number,
  gear: Gear,
  slot: SlotId,
  item: Item | undefined,
  heroClass: HeroClass = 'Warrior',
  loadout?: SkillId[],
): number {
  const next: Gear = { ...gear, [slot]: item };
  return computeHero(level, next, heroClass, loadout).cp;
}

/** CP change if `item` replaced what is in its slot (includes set-bonus / playstyle changes). */
export function cpDelta(
  level: number,
  gear: Gear,
  item: Item,
  heroClass: HeroClass = 'Warrior',
  loadout?: SkillId[],
): number {
  return (
    heroCpWith(level, gear, item.slot, item, heroClass, loadout) -
    computeHero(level, gear, heroClass, loadout).cp
  );
}

/** Slot badge for dungeon loot / compare lists: empty slot → BiS, else CP delta. */
export interface LootCompareHighlight {
  upgrade: boolean;
  cpDelta: number;
  levelOk: boolean;
  /** Corner badge text when `upgrade` (portrait-safe); null otherwise. */
  badge: string | null;
}

/**
 * Pure compare highlight for a drop vs the equipped piece in that slot.
 * Mirrors gear-compare rules: positive CP and equippable = upgrade.
 */
export function lootCompareHighlight(
  level: number,
  gear: Gear,
  item: Item,
  heroClass: HeroClass = 'Warrior',
  loadout?: SkillId[],
): LootCompareHighlight {
  const levelOk = item.gearLevel <= level;
  // Wrong-class set pieces are never BiS upgrades for this hero.
  if (!itemAllowedForClass(item, heroClass)) {
    return { upgrade: false, cpDelta: 0, levelOk, badge: null };
  }
  const delta = cpDelta(level, gear, item, heroClass, loadout);
  const upgrade = delta > 0 && levelOk;
  let badge: string | null = null;
  if (upgrade) {
    badge = gear[item.slot] ? `+${delta}` : 'BiS';
  }
  return { upgrade, cpDelta: delta, levelOk, badge };
}

let itemCounter = 0;
function newId(): string {
  itemCounter += 1;
  return `it_${Date.now().toString(36)}_${itemCounter.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export interface RollOptions {
  gearLevel: number;
  rarity: RarityId;
  slot?: SlotId;
  setId?: SetId;
  icon?: IconPack;
  /** Class receiving the drop; picks weapon / armor type, names and art. Defaults to Warrior. */
  heroClass?: HeroClass;
}

export function rollItem(rng: Rng, opts: RollOptions): Item {
  // Capes never roll from the generic set/plain pool — use `rollCape`.
  const slot = opts.slot ?? rng.pick(SET_SLOTS);
  if (slot === 'cape') {
    throw new Error('rollItem cannot create capes; use rollCape');
  }
  const rarity = RARITIES[opts.rarity];
  const gl = Math.max(1, opts.gearLevel);
  const stats = baseStatsForSlot(slot, gl, rarity.mult);

  const pool = SUBSTAT_POOL.filter((k) => stats[k] === undefined);
  for (let i = 0; i < rarity.substats && pool.length > 0; i++) {
    const idx = Math.floor(rng.next() * pool.length);
    const key = pool.splice(idx, 1)[0];
    stats[key] = substatValue(key, gl, rarity.mult);
  }

  const icon: IconPack = opts.icon ?? (opts.setId ? SETS[opts.setId].icon : 'a');
  let weaponType: WeaponType | undefined;
  let armorType: ArmorType | undefined;
  let base: string;
  if (slot === 'weapon') {
    weaponType = CLASS_WEAPON_TYPE[opts.heroClass ?? 'Warrior'];
    base = rng.pick(weaponBaseNames(weaponType, icon));
  } else if (isArmorSlot(slot)) {
    armorType = CLASS_ARMOR_TYPE[opts.heroClass ?? 'Warrior'];
    base = rng.pick(armorBaseNames(armorType, slot));
  } else {
    base = rng.pick(BASE_NAMES[slot]);
  }
  const name = opts.setId
    ? `${SETS[opts.setId].name} ${base}`
    : `${rng.pick(PREFIX[opts.rarity])} ${base}`;

  return {
    id: newId(),
    slot,
    rarity: opts.rarity,
    gearLevel: gl,
    name,
    setId: opts.setId,
    icon,
    ...(weaponType ? { weaponType } : {}),
    ...(armorType ? { armorType } : {}),
    stats,
  };
}

export interface RollCapeOptions {
  gearLevel: number;
  rarity: RarityId;
  heroClass: HeroClass;
  actId: number;
  capeId?: CapeId;
}

/** Roll a class-locked cape. Never attaches setId. */
export function rollCape(rng: Rng, opts: RollCapeOptions): Item | null {
  const capeId =
    opts.capeId ??
    (() => {
      const pool = capePoolFor(opts.heroClass, opts.actId);
      return pool.length ? rng.pick(pool) : null;
    })();
  if (!capeId) return null;
  const def = CAPES[capeId];
  if (def.heroClass !== opts.heroClass) return null;
  const rarity = RARITIES[opts.rarity];
  const gl = Math.max(1, opts.gearLevel);
  const stats = baseStatsForSlot('cape', gl, rarity.mult);
  const subPool = SUBSTAT_POOL.filter((k) => stats[k] === undefined);
  for (let i = 0; i < rarity.substats && subPool.length > 0; i++) {
    const idx = Math.floor(rng.next() * subPool.length);
    const key = subPool.splice(idx, 1)[0];
    stats[key] = substatValue(key, gl, rarity.mult);
  }
  return {
    id: newId(),
    slot: 'cape',
    rarity: opts.rarity,
    gearLevel: gl,
    name: def.name,
    capeId: def.id,
    icon: def.icon,
    stats,
  };
}

/** Chance a dungeon drop becomes a cape instead of set/plain gear. */
export function capeDropChance(source: DropSource): number {
  switch (source) {
    case 'dungeon-floor':
    case 'nightscar-floor':
    case 'ascended-floor':
      return 0.08;
    case 'dungeon-mini':
    case 'nightscar-mini':
    case 'ascended-mini':
      return 0.12;
    case 'dungeon-boss':
    case 'nightscar-boss':
    case 'ascended-boss':
      return 0.18;
    default:
      return 0;
  }
}

const STARTER_NAMES: Record<'amulet' | 'medal' | 'ring', string> = {
  amulet: 'Bone Charm',
  medal: 'Dull Medal',
  ring: 'Useless Ring',
};

/** Starter kit fills every slot except Cape (late-act drops only). */
export function starterGear(heroClass: HeroClass = 'Warrior'): Gear {
  const gear: Gear = {};
  for (const slot of SET_SLOTS) {
    gear[slot] = {
      id: `starter_${slot}`,
      slot,
      rarity: 'common',
      gearLevel: 1,
      name:
        slot === 'weapon'
          ? STARTER_WEAPON_NAME[heroClass]
          : isArmorSlot(slot)
            ? STARTER_ARMOR_NAME[heroClass][slot]
            : STARTER_NAMES[slot],
      icon: 'a',
      ...(slot === 'weapon' ? { weaponType: CLASS_WEAPON_TYPE[heroClass] } : {}),
      ...(isArmorSlot(slot) ? { armorType: CLASS_ARMOR_TYPE[heroClass] } : {}),
      stats: baseStatsForSlot(slot, 1, 1),
    };
  }
  return gear;
}

export const ALL_SET_IDS = Object.keys(SETS) as SetId[];
/** Act/dungeon drop pool — Clanforged is vendor-only. */
export const DROP_SET_IDS = ALL_SET_IDS.filter((id) => id !== 'clanforged');

/**
 * Class lock for a set, if any.
 * Sets with `favorsPlaystyle` are locked to that playstyle's class;
 * "Any" / endgame / Clanforged sets return null (usable by every class).
 */
export function setLockedHeroClass(setId: SetId): HeroClass | null {
  const style = SETS[setId].favorsPlaystyle;
  return style ? PLAYSTYLES[style].heroClass : null;
}

/** True when `heroClass` may receive / equip pieces of this set. */
export function setAllowedForClass(setId: SetId, heroClass: HeroClass): boolean {
  const locked = setLockedHeroClass(setId);
  return locked == null || locked === heroClass;
}

/**
 * Capes are always class-locked via capeId.
 * Plain (non-set, non-cape) gear is always allowed; set pieces follow `setAllowedForClass`.
 */
export function itemAllowedForClass(
  item: Pick<Item, 'setId' | 'capeId'>,
  heroClass: HeroClass,
): boolean {
  if (item.capeId) return CAPES[item.capeId].heroClass === heroClass;
  if (!item.setId) return true;
  return setAllowedForClass(item.setId, heroClass);
}

/** Filter a dungeon/shop set pool to pieces this class may receive. */
export function filterSetsForClass(sets: readonly SetId[], heroClass: HeroClass): SetId[] {
  return sets.filter((id) => setAllowedForClass(id, heroClass));
}

/**
 * Unequip wrong-class set pieces into the bag (keep for salvage; cannot re-equip).
 * Used on save load / import so legacy equipped Quillstorm-on-Warrior etc. clears.
 */
export function unequipWrongClassGear(
  gear: Gear,
  bag: Item[],
  heroClass: HeroClass,
): { gear: Gear; bag: Item[]; moved: Item[] } {
  const nextGear: Gear = { ...gear };
  const nextBag = [...bag];
  const moved: Item[] = [];
  for (const slot of SLOTS) {
    const it = nextGear[slot];
    if (!it || itemAllowedForClass(it, heroClass)) continue;
    delete nextGear[slot];
    moved.push(it);
    nextBag.push(it);
  }
  return { gear: nextGear, bag: nextBag, moved };
}

export function salvageValue(item: Item): { dust: number; crystals: number } {
  return RARITIES[item.rarity].salvage;
}

/** Toast / bag preview line for salvage returns (dust always, crystals when > 0). */
export function formatSalvageYield(dust: number, crystals: number): string {
  if (crystals > 0) return `+${dust} dust, +${crystals} crystals`;
  return `+${dust} dust`;
}

/** Vendor junk price — gold from dust/crystals salvage yield. */
export function sellValue(item: Item): number {
  const v = salvageValue(item);
  return v.dust * 2 + v.crystals * 10;
}

export function rarityIndex(r: RarityId): number {
  return RARITY_ORDER.indexOf(r);
}

/** True when `item` rarity is strictly below the given ceiling. */
export function rarityBelow(item: Item, ceiling: RarityId): boolean {
  return rarityIndex(item.rarity) < rarityIndex(ceiling);
}

/** True when `item` rarity is at or below the given max (inclusive). */
export function rarityAtMost(item: Item, max: RarityId): boolean {
  return rarityIndex(item.rarity) <= rarityIndex(max);
}

/**
 * Recommended CP for a stage at the given hero/gear level — full rare kit
 * (primary stats only) so push tension reads against a clear farming bar.
 */
export function estimateStageRecCp(level: number): number {
  const gl = Math.max(1, level);
  const gear: Gear = {};
  // Benchmark kit excludes cape so early-act recommended CP stays stable.
  for (const slot of SET_SLOTS) {
    gear[slot] = {
      id: `rec_${slot}`,
      slot,
      rarity: 'rare',
      gearLevel: gl,
      name: 'Benchmark',
      icon: 'a',
      stats: baseStatsForSlot(slot, gl, RARITIES.rare.mult),
    };
  }
  return computeHero(gl, gear, 'Warrior').cp;
}

export function formatStat(key: StatKey, value: number): string {
  const suffix = key === 'critRate' || key === 'critDmg' || key === 'skillPower' || key === 'haste' ? '%' : '';
  const v = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${v}${suffix}`;
}

export function statsOrdered(item: Item): StatKey[] {
  return STAT_KEYS.filter((k) => (item.stats[k] ?? 0) !== 0);
}
