import { DROP_SET_IDS, SETS, rollItem, sellValue } from '../data/gear';
import type { Item, RarityId, SetId } from '../data/types';
import type { EnemyRole } from '../data/acts';
import type { Rng } from './rng';
import { mulberry32 } from './rng';
import { dayKey } from './clan';

/** Offers shown in the Town/Camp daily merchant each calendar day. */
export const DAILY_SHOP_SIZE = 5;

/** Gold price multipliers by rarity (vs sellValue baseline). Prefer Gold sink. */
const RARITY_PRICE_MULT: Record<RarityId, number> = {
  common: 4,
  rare: 7,
  epic: 12,
  legendary: 20,
};

/** Set pieces cost more than plain gear of the same rarity. */
const SET_PRICE_MULT = 1.45;

export interface DailyShopSave {
  dayKey: string;
  seed: number;
  /** Indices into the daily slate that have been bought. */
  purchased: number[];
}

export interface DailyShopOffer {
  index: number;
  item: Item;
  price: number;
  purchased: boolean;
}

export function defaultDailyShop(now = Date.now()): DailyShopSave {
  return {
    dayKey: dayKey(now),
    seed: hashDayKey(dayKey(now)),
    purchased: [],
  };
}

/** Stable 32-bit seed from YYYY-MM-DD. */
export function hashDayKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Gold from a monster kill. Scales lightly by act (tier) and enemy role.
 * Trash pays little; elites/bosses pay more without exploding mid-game economy.
 */
export function goldFromKill(tier: number, role: EnemyRole): number {
  const act = Math.floor(Math.max(0, tier) / 5) + 1;
  const base = 2 + Math.floor(tier * 0.55);
  const roleMul = role === 'trash' ? 1 : role === 'elite' ? 2.2 : 4.5;
  const actMul = 1 + (act - 1) * 0.07;
  return Math.max(1, Math.round(base * roleMul * actMul));
}

/** Vendor buy price — Gold only, rarity-scaled (set pieces premium). */
export function shopPrice(item: Pick<Item, 'rarity' | 'setId' | 'gearLevel' | 'stats'> & Partial<Item>): number {
  const salvageGold = sellValue(item as Item);
  const floor = 12 + item.gearLevel * 8;
  let price = Math.max(floor, Math.round(salvageGold * RARITY_PRICE_MULT[item.rarity]));
  if (item.setId) price = Math.round(price * SET_PRICE_MULT);
  return price;
}

/** Rarity weights for the daily slate (Common cheap → Legendary/set rare). */
const SHOP_RARITY_WEIGHTS: Record<RarityId, number> = {
  common: 48,
  rare: 32,
  epic: 15,
  legendary: 5,
};

function rollShopRarity(rng: Rng): RarityId {
  const order: RarityId[] = ['common', 'rare', 'epic', 'legendary'];
  const total = order.reduce((s, r) => s + SHOP_RARITY_WEIGHTS[r], 0);
  let roll = rng.next() * total;
  for (const r of order) {
    roll -= SHOP_RARITY_WEIGHTS[r];
    if (roll < 0) return r;
  }
  return 'common';
}

/**
 * Build today's merchant slate from a seed.
 * Occasional set pieces (~22%); gear level tracks hero progress.
 */
export function buildDailyOffers(
  seed: number,
  opts: { level: number; stagesCleared: number; purchased?: readonly number[] },
): DailyShopOffer[] {
  const rng = mulberry32(seed);
  const gl = Math.max(1, Math.min(20, opts.level + rng.int(0, 1)));
  const actUnlocked = Math.max(1, Math.min(10, Math.floor(opts.stagesCleared / 5) + 1));
  const pool = DROP_SET_IDS.filter((id) => SETS[id].act <= actUnlocked);
  const offers: DailyShopOffer[] = [];
  const bought = new Set(opts.purchased ?? []);

  for (let i = 0; i < DAILY_SHOP_SIZE; i++) {
    const rarity = rollShopRarity(rng);
    const wantSet = rng.chance(0.22) && pool.length > 0 && rarity !== 'common';
    const setId: SetId | undefined = wantSet ? rng.pick(pool) : undefined;
    const item = rollItem(rng, {
      gearLevel: gl,
      rarity,
      setId,
    });
    // Stable id for the day so bag/equip flows stay unique after refresh.
    item.id = `shop_${seed.toString(36)}_${i}`;
    offers.push({
      index: i,
      item,
      price: shopPrice(item),
      purchased: bought.has(i),
    });
  }
  return offers;
}

export function normalizeDailyShop(
  parsed: Partial<DailyShopSave> | undefined,
  fresh: DailyShopSave,
): DailyShopSave {
  if (!parsed || typeof parsed.dayKey !== 'string') return { ...fresh };
  return {
    dayKey: parsed.dayKey,
    seed: typeof parsed.seed === 'number' ? parsed.seed >>> 0 : hashDayKey(parsed.dayKey),
    purchased: Array.isArray(parsed.purchased)
      ? parsed.purchased.filter((n) => typeof n === 'number' && n >= 0 && n < DAILY_SHOP_SIZE)
      : [],
  };
}

/** Exported for tests — rarity price ordering. */
export function rarityPriceRank(rarity: RarityId): number {
  return RARITY_PRICE_MULT[rarity];
}
