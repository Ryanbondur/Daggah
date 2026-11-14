import type { Item, SkillId } from '../data/types';

const BASE = import.meta.env.BASE_URL;

export const asset = (path: string): string => `${BASE}assets/${path}`;

export const itemIcon = (item: Pick<Item, 'icon' | 'slot'>): string =>
  asset(`icons/gear-${item.icon}/${item.slot}.webp`);

export const skillIcon = (id: SkillId): string => asset(`icons/skills/${id}.webp`);

export const navIcon = (name: 'camp' | 'skill' | 'adventure' | 'town' | 'crystal' | 'key'): string =>
  asset(`icons/nav/${name}.webp`);

export const ENEMY_SPRITES = [
  'enemy-goat-demon',
  'enemy-skeleton',
  'enemy-ember-imp',
  'enemy-cinder-brute',
  'enemy-horned-overseer',
  'boss-hollow-king',
  'boss-deep-warden',
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
];
