export type StatKey =
  | 'atk'
  | 'def'
  | 'hp'
  | 'critRate'
  | 'critDmg'
  | 'skillPower'
  | 'haste'
  | 'energyRegen';

export type Stats = Record<StatKey, number>;

export const STAT_KEYS: StatKey[] = [
  'atk',
  'def',
  'hp',
  'critRate',
  'critDmg',
  'skillPower',
  'haste',
  'energyRegen',
];

export const STAT_LABEL: Record<StatKey, string> = {
  atk: 'ATK',
  def: 'DEF',
  hp: 'HP',
  critRate: 'Crit Rate',
  critDmg: 'Crit Dmg',
  skillPower: 'Skill Power',
  haste: 'Haste',
  energyRegen: 'Energy Regen',
};

export const STAT_SUFFIX: Record<StatKey, string> = {
  atk: '',
  def: '',
  hp: '',
  critRate: '%',
  critDmg: '%',
  skillPower: '%',
  haste: '%',
  energyRegen: '',
};

export function emptyStats(): Stats {
  return {
    atk: 0,
    def: 0,
    hp: 0,
    critRate: 0,
    critDmg: 0,
    skillPower: 0,
    haste: 0,
    energyRegen: 0,
  };
}

export type HeroClass = 'Warrior' | 'Mage' | 'Ranger' | 'Rogue';

export const HERO_CLASSES: HeroClass[] = ['Warrior', 'Mage', 'Ranger', 'Rogue'];

export type SlotId =
  | 'weapon'
  | 'chest'
  | 'belt'
  | 'helmet'
  | 'gloves'
  | 'bracers'
  | 'shoulders'
  | 'legs'
  | 'boots'
  | 'amulet'
  | 'medal'
  | 'ring';

export type RarityId = 'common' | 'rare' | 'epic' | 'legendary';

export type SetId =
  | 'ember-raider'
  | 'cavern-cleaver'
  | 'cavern-bulwark'
  | 'gravemarch'
  | 'ashen-codex'
  | 'rime-circlet'
  | 'quillstorm'
  | 'deadeye'
  | 'cinderstride';

export type IconPack = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

export interface Item {
  id: string;
  slot: SlotId;
  rarity: RarityId;
  gearLevel: number;
  name: string;
  setId?: SetId;
  icon: IconPack;
  stats: Partial<Stats>;
}

export type SkillId =
  // Warrior
  | 'cleave'
  | 'whirlwind'
  | 'bladestorm'
  | 'war-banner'
  | 'shield-bash'
  | 'iron-skin'
  | 'rally'
  | 'executioners-guard'
  // Mage
  | 'firebolt'
  | 'flame-wave'
  | 'meteor'
  | 'combustion'
  | 'ice-lance'
  | 'frost-nova'
  | 'glacial-armor'
  | 'absolute-zero'
  // Ranger
  | 'piercing-shot'
  | 'arrow-rain'
  | 'multishot'
  | 'storm-of-quills'
  | 'aimed-shot'
  | 'hunters-mark'
  | 'explosive-trap'
  | 'kill-shot'
  // Rogue
  | 'backstab'
  | 'garrote'
  | 'ambush'
  | 'death-mark'
  | 'shadowstep'
  | 'smoke-bomb'
  | 'flurry'
  | 'cloak-of-shadows';

export type PlaystyleId =
  | 'bladestorm'
  | 'ironclad'
  | 'inferno'
  | 'frostbind'
  | 'volley'
  | 'marksmanship'
  | 'assassination'
  | 'shadowdance';
