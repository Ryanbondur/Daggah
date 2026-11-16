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
  | 'boots'
  | 'amulet'
  | 'medal'
  | 'ring'
  | 'cape';

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
  | 'cinderstride'
  | 'nightfang'
  | 'gloomveil'
  | 'echoplate'
  | 'voidwoven'
  | 'nightscar-regalia'
  | 'clanforged';

/** Class-locked unique-effect cape IDs (not set pieces). */
export type CapeId =
  | 'bulwark-mantle'
  | 'bloodhowl-cape'
  | 'warlords-drape'
  | 'ashveil-cloak'
  | 'frostspire-cape'
  | 'arcane-loom'
  | 'quillwind-cape'
  | 'deadeye-shroud'
  | 'hawkflight-mantle'
  | 'nightstalker-cape'
  | 'shadowweave-cloak'
  | 'deathveil-drape';

export type IconPack = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k';

export interface Item {
  id: string;
  slot: SlotId;
  rarity: RarityId;
  gearLevel: number;
  name: string;
  setId?: SetId;
  /** Present on cape-slot items; mutually exclusive with setId. */
  capeId?: CapeId;
  icon: IconPack;
  stats: Partial<Stats>;
}

export type SkillId =
  // Warrior
  | 'cleave'
  | 'whirlwind'
  | 'bladestorm'
  | 'war-banner'
  | 'bulwark'
  | 'shield-bash'
  | 'iron-skin'
  | 'rally'
  | 'executioners-guard'
  // Mage
  | 'firebolt'
  | 'flame-wave'
  | 'meteor'
  | 'combustion'
  | 'frostbite'
  | 'ice-lance'
  | 'frost-nova'
  | 'glacial-armor'
  | 'absolute-zero'
  // Ranger
  | 'piercing-shot'
  | 'arrow-rain'
  | 'multishot'
  | 'storm-of-quills'
  | 'deadeye'
  | 'aimed-shot'
  | 'hunters-mark'
  | 'explosive-trap'
  | 'kill-shot'
  // Rogue
  | 'backstab'
  | 'garrote'
  | 'ambush'
  | 'death-mark'
  | 'shadow-veil'
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
