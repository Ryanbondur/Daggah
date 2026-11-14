import type { HeroClass, Item, SkillId } from '../data/types';

const BASE = import.meta.env.BASE_URL;

export const asset = (path: string): string => `${BASE}assets/${path}`;

export const itemIcon = (item: Pick<Item, 'icon' | 'slot'>): string =>
  asset(`icons/gear-${item.icon}/${item.slot}.webp`);

export const skillIcon = (id: SkillId): string => asset(`icons/skills/${id}.webp`);

export const navIcon = (name: 'camp' | 'skill' | 'adventure' | 'town' | 'crystal' | 'key'): string =>
  asset(`icons/nav/${name}.webp`);

export const heroSprite = (heroClass: HeroClass): string =>
  asset(`sprites/hero-${heroClass.toLowerCase()}.webp`);

export const ENEMY_SPRITES = [
  'enemy-goat-demon',
  'enemy-skeleton',
  'enemy-ember-imp',
  'enemy-cinder-brute',
  'enemy-horned-overseer',
  'boss-hollow-king',
  'boss-deep-warden',
  'enemy-bone-soldier',
  'enemy-bone-archer',
  'enemy-ossuary-captain',
  'boss-ossuary-lord',
  'enemy-frost-wisp',
  'enemy-ice-hound',
  'enemy-rime-brute',
  'boss-rime-queen',
  'enemy-spore-tick',
  'enemy-mire-slug',
  'enemy-witchmire-hag',
  'boss-bog-hydra',
  'enemy-magma-scarab',
  'enemy-ash-walker',
  'enemy-cinder-knight',
  'boss-forge-colossus',
];

export const SKILL_IDS: SkillId[] = [
  'cleave',
  'whirlwind',
  'bladestorm',
  'war-banner',
  'shield-bash',
  'iron-skin',
  'rally',
  'executioners-guard',
  'firebolt',
  'flame-wave',
  'meteor',
  'combustion',
  'ice-lance',
  'frost-nova',
  'glacial-armor',
  'absolute-zero',
  'piercing-shot',
  'arrow-rain',
  'multishot',
  'storm-of-quills',
  'aimed-shot',
  'hunters-mark',
  'explosive-trap',
  'kill-shot',
  'backstab',
  'garrote',
  'ambush',
  'death-mark',
  'shadowstep',
  'smoke-bomb',
  'flurry',
  'cloak-of-shadows',
];
