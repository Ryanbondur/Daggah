import type { Rng } from '../game/rng';
import type {
  HeroClass,
  IconPack,
  Item,
  RarityId,
  SetId,
  SkillId,
  SlotId,
  StatKey,
  Stats,
} from './types';
import { STAT_KEYS } from './types';
import { heroBaseStats } from './xp';

export const SLOTS: SlotId[] = [
  'weapon',
  'chest',
  'belt',
  'helmet',
  'gloves',
  'bracers',
  'shoulders',
  'legs',
  'boots',
  'amulet',
  'medal',
  'ring',
];

export const SLOT_LABEL: Record<SlotId, string> = {
  weapon: 'Weapon',
  chest: 'Chest',
  belt: 'Belt',
  helmet: 'Helmet',
  gloves: 'Gloves',
  bracers: 'Bracers',
  shoulders: 'Shoulders',
  legs: 'Legs',
  boots: 'Boots',
  amulet: 'Amulet',
  medal: 'Medal',
  ring: 'Ring',
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

/** Drop tables. GDD §6.8. */
export type DropSource = 'stage-boss' | 'stage-elite' | 'dungeon-floor' | 'dungeon-mini' | 'dungeon-boss';

const DROP_WEIGHTS: Record<DropSource, Record<RarityId, number>> = {
  'stage-boss': { common: 70, rare: 25, epic: 5, legendary: 0 },
  'stage-elite': { common: 85, rare: 14, epic: 1, legendary: 0 },
  'dungeon-floor': { common: 55, rare: 30, epic: 13, legendary: 2 },
  'dungeon-mini': { common: 45, rare: 35, epic: 16, legendary: 4 },
  'dungeon-boss': { common: 35, rare: 40, epic: 20, legendary: 5 },
};

export function rollRarity(rng: Rng, source: DropSource): RarityId {
  const w = DROP_WEIGHTS[source];
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
  legs: 1.3,
  boots: 0.8,
  belt: 0.7,
  gloves: 0.6,
  bracers: 0.6,
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
  } else {
    const w = ARMOR_WEIGHT[slot] ?? 1;
    s.hp = Math.round((10 + 8 * gl) * w * mult);
    s.def = Math.max(1, Math.round((0.8 + 0.9 * gl) * w * mult));
  }
  return s;
}

const BASE_NAMES: Record<SlotId, string[]> = {
  weapon: ['Axe', 'Cleaver', 'Hatchet'],
  chest: ['Breastplate', 'Cuirass', 'Hauberk'],
  belt: ['Belt', 'Girdle'],
  helmet: ['Helm', 'Greathelm'],
  gloves: ['Gloves', 'Gauntlets'],
  bracers: ['Bracers', 'Wristguards'],
  shoulders: ['Pauldrons', 'Spaulders'],
  legs: ['Greaves', 'Legguards'],
  boots: ['Boots', 'Treads'],
  amulet: ['Amulet', 'Fang Charm'],
  medal: ['Medal', 'War Token'],
  ring: ['Ring', 'Band'],
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
    favors: 'Warrior Bladestorm',
    icon: 'b',
    bonuses: [
      { pieces: 2, text: '+8% AoE damage' },
      { pieces: 4, text: 'Whirlwind CD -2s' },
      { pieces: 6, text: 'Bladestorm cost -15%' },
    ],
  },
  'cavern-bulwark': {
    id: 'cavern-bulwark',
    name: 'Cavern Bulwark',
    act: 2,
    favors: 'Warrior Ironclad',
    icon: 'b',
    bonuses: [
      { pieces: 2, text: '+8% DEF' },
      { pieces: 4, text: 'Iron Skin +20% absorb' },
      { pieces: 6, text: 'Rally heals +15%' },
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
    favors: 'Mage Inferno',
    icon: 'd',
    bonuses: [
      { pieces: 2, text: '+8% burn damage' },
      { pieces: 4, text: 'Meteor CD -2s' },
      { pieces: 6, text: 'Combustion +25%' },
    ],
  },
  'rime-circlet': {
    id: 'rime-circlet',
    name: 'Rime Circlet',
    act: 4,
    favors: 'Mage Frostbind',
    icon: 'd',
    bonuses: [
      { pieces: 2, text: '+8% slow potency' },
      { pieces: 4, text: 'Nova CD -2s' },
      { pieces: 6, text: 'Absolute Zero +1s freeze' },
    ],
  },
  quillstorm: {
    id: 'quillstorm',
    name: 'Quillstorm',
    act: 5,
    favors: 'Ranger Volley',
    icon: 'e',
    bonuses: [
      { pieces: 2, text: '+8% AoE' },
      { pieces: 4, text: 'Arrow Rain width +20%' },
      { pieces: 6, text: 'Storm of Quills +15% dmg' },
    ],
  },
  deadeye: {
    id: 'deadeye',
    name: 'Deadeye',
    act: 5,
    favors: 'Ranger Marksmanship',
    icon: 'e',
    bonuses: [
      { pieces: 2, text: '+6% Crit Rate' },
      { pieces: 4, text: 'Mark duration +3s' },
      { pieces: 6, text: 'Kill Shot threshold 35%' },
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
    favors: 'Rogue Assassination',
    icon: 'g',
    bonuses: [
      { pieces: 2, text: '+10% Crit Dmg' },
      { pieces: 4, text: 'Ambush +15%' },
      { pieces: 6, text: 'Death Mark -10% cost' },
    ],
  },
  gloomveil: {
    id: 'gloomveil',
    name: 'Gloomveil',
    act: 7,
    favors: 'Rogue Shadowdance',
    icon: 'g',
    bonuses: [
      { pieces: 2, text: '+8% Haste' },
      { pieces: 4, text: 'Shadowstep +1 charge' },
      { pieces: 6, text: 'Cloak +0.5s' },
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

export function computeSetEffects(gear: Gear): SetEffects {
  const fx = emptySetEffects();
  const counts = setCounts(gear);
  const n = (id: SetId) => counts[id] ?? 0;
  if (n('ember-raider') >= 2) fx.atkPct += 5;
  if (n('ember-raider') >= 4) fx.hpPct += 8;
  if (n('ember-raider') >= 6) fx.energyRegenPct += 10;
  if (n('cavern-cleaver') >= 2) fx.aoePct += 8;
  if (n('cavern-cleaver') >= 4) fx.skillCdMinus.whirlwind = 2;
  if (n('cavern-cleaver') >= 6) fx.skillCostPct.bladestorm = 15;
  if (n('cavern-bulwark') >= 2) fx.defPct += 8;
  if (n('cavern-bulwark') >= 4) fx.absorbPct += 20;
  if (n('cavern-bulwark') >= 6) fx.healPct += 15;
  if (n('gravemarch') >= 2) fx.defPct += 6;
  if (n('gravemarch') >= 4) fx.hpPct += 8;
  if (n('gravemarch') >= 6) fx.onKillHealPct += 2;
  if (n('ashen-codex') >= 2) fx.burnPct += 8;
  if (n('ashen-codex') >= 4) fx.skillCdMinus.meteor = 2;
  if (n('ashen-codex') >= 6) fx.combustPct += 25;
  if (n('rime-circlet') >= 2) fx.slowPct += 8;
  if (n('rime-circlet') >= 4) fx.skillCdMinus['frost-nova'] = 2;
  if (n('rime-circlet') >= 6) fx.freezeBonus += 1;
  if (n('quillstorm') >= 2) fx.aoePct += 8;
  if (n('quillstorm') >= 4) fx.arrowRainWidth += 20;
  if (n('quillstorm') >= 6) fx.skillDmgPct['storm-of-quills'] = 15;
  if (n('deadeye') >= 2) fx.critRatePct += 6;
  if (n('deadeye') >= 4) fx.markDurationBonus += 3;
  if (n('deadeye') >= 6) fx.executeThreshold = Math.max(fx.executeThreshold, 0.35);
  if (n('cinderstride') >= 2) fx.hastePct += 6;
  if (n('cinderstride') >= 4) fx.energyRegenPct += 8;
  if (n('cinderstride') >= 6) fx.globalCdPct += 5;
  if (n('nightfang') >= 2) fx.critDmgPct += 10;
  if (n('nightfang') >= 4) fx.skillDmgPct.ambush = 15;
  if (n('nightfang') >= 6) fx.skillCostPct['death-mark'] = 10;
  if (n('gloomveil') >= 2) fx.hastePct += 8;
  if (n('gloomveil') >= 4) fx.shadowstepCharges += 1;
  if (n('gloomveil') >= 6) fx.cloakDurationBonus += 0.5;
  if (n('echoplate') >= 2) fx.atkPct += 7;
  if (n('echoplate') >= 4) fx.skillPowerPct += 7;
  if (n('echoplate') >= 6) {
    fx.postUltDmgPct += 10;
    fx.postUltDuration = Math.max(fx.postUltDuration, 5);
  }
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

export function computeHero(level: number, gear: Gear, heroClass: HeroClass = 'Warrior'): HeroTotals {
  const stats = heroBaseStats(level, heroClass);
  for (const slot of SLOTS) {
    const it = gear[slot];
    if (!it) continue;
    for (const k of STAT_KEYS) {
      const v = it.stats[k];
      if (v) stats[k] += v;
    }
  }
  const effects = computeSetEffects(gear);
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
): number {
  const next: Gear = { ...gear, [slot]: item };
  return computeHero(level, next, heroClass).cp;
}

/** CP change if `item` replaced what is in its slot (includes set-bonus changes). */
export function cpDelta(level: number, gear: Gear, item: Item, heroClass: HeroClass = 'Warrior'): number {
  return heroCpWith(level, gear, item.slot, item, heroClass) - computeHero(level, gear, heroClass).cp;
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
}

export function rollItem(rng: Rng, opts: RollOptions): Item {
  const slot = opts.slot ?? rng.pick(SLOTS);
  const rarity = RARITIES[opts.rarity];
  const gl = Math.max(1, opts.gearLevel);
  const stats = baseStatsForSlot(slot, gl, rarity.mult);

  const pool = SUBSTAT_POOL.filter((k) => stats[k] === undefined);
  for (let i = 0; i < rarity.substats && pool.length > 0; i++) {
    const idx = Math.floor(rng.next() * pool.length);
    const key = pool.splice(idx, 1)[0];
    stats[key] = substatValue(key, gl, rarity.mult);
  }

  const base = rng.pick(BASE_NAMES[slot]);
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
    icon: opts.icon ?? (opts.setId ? SETS[opts.setId].icon : 'a'),
    stats,
  };
}

const STARTER_WEAPON: Record<HeroClass, string> = {
  Warrior: 'Rusty Axe',
  Mage: 'Splintered Staff',
  Ranger: 'Warped Bow',
  Rogue: 'Notched Daggers',
};

const STARTER_NAMES: Record<Exclude<SlotId, 'weapon'>, string> = {
  chest: 'Worn Jerkin',
  belt: 'Frayed Belt',
  helmet: 'Dented Helm',
  gloves: 'Torn Gloves',
  bracers: 'Cracked Bracers',
  shoulders: 'Patched Pauldrons',
  legs: 'Worn Greaves',
  boots: 'Muddy Boots',
  amulet: 'Bone Charm',
  medal: 'Dull Medal',
  ring: 'Useless Ring',
};

export function starterGear(heroClass: HeroClass = 'Warrior'): Gear {
  const gear: Gear = {};
  for (const slot of SLOTS) {
    gear[slot] = {
      id: `starter_${slot}`,
      slot,
      rarity: 'common',
      gearLevel: 1,
      name: slot === 'weapon' ? STARTER_WEAPON[heroClass] : STARTER_NAMES[slot],
      icon: 'a',
      stats: baseStatsForSlot(slot, 1, 1),
    };
  }
  return gear;
}

export const ALL_SET_IDS = Object.keys(SETS) as SetId[];

export function salvageValue(item: Item): { dust: number; crystals: number } {
  return RARITIES[item.rarity].salvage;
}

export function formatStat(key: StatKey, value: number): string {
  const suffix = key === 'critRate' || key === 'critDmg' || key === 'skillPower' || key === 'haste' ? '%' : '';
  const v = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${v}${suffix}`;
}

export function statsOrdered(item: Item): StatKey[] {
  return STAT_KEYS.filter((k) => (item.stats[k] ?? 0) !== 0);
}
