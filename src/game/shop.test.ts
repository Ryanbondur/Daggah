import { describe, expect, it } from 'vitest';
import { rollItem } from '../data/gear';
import type { RarityId } from '../data/types';
import { mulberry32 } from './rng';
import { Game } from './game';
import {
  DAILY_SHOP_SIZE,
  goldFromKill,
  hashDayKey,
  rarityPriceRank,
  shopPrice,
} from './shop';
import { SAVE_KEY, type Storage } from './state';

function memStore(seed: Record<string, string> = {}): Storage {
  const data = { ...seed };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe('goldFromKill', () => {
  it('scales lightly by act/tier and enemy role', () => {
    const trashLow = goldFromKill(0, 'trash');
    const trashHigh = goldFromKill(45, 'trash');
    const elite = goldFromKill(10, 'elite');
    const boss = goldFromKill(10, 'boss');
    expect(trashLow).toBeGreaterThanOrEqual(1);
    expect(trashHigh).toBeGreaterThan(trashLow);
    expect(elite).toBeGreaterThan(goldFromKill(10, 'trash'));
    expect(boss).toBeGreaterThan(elite);
  });

  it('grants gold on kill and persists to save', () => {
    const store = memStore();
    const game = new Game(store, mulberry32(42));
    game.pickClass('Warrior');
    const before = game.save.gold;
    // Simulate combat kill grant path used by Battle events.
    const grant = goldFromKill(4, 'elite');
    game.save.gold += grant;
    game.persist();
    const raw = JSON.parse(store.getItem(SAVE_KEY)!) as { gold: number };
    expect(raw.gold).toBe(before + grant);
    expect(grant).toBe(goldFromKill(4, 'elite'));
  });
});

describe('shopPrice by rarity', () => {
  it('prices Common < Rare < Epic < Legendary, with set premium', () => {
    const rng = mulberry32(7);
    const prices: Record<RarityId, number> = {
      common: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    };
    for (const rarity of Object.keys(prices) as RarityId[]) {
      const item = rollItem(rng, { gearLevel: 5, rarity, slot: 'weapon' });
      prices[rarity] = shopPrice(item);
    }
    expect(prices.common).toBeLessThan(prices.rare);
    expect(prices.rare).toBeLessThan(prices.epic);
    expect(prices.epic).toBeLessThan(prices.legendary);
    expect(rarityPriceRank('legendary')).toBeGreaterThan(rarityPriceRank('common'));

    const plain = rollItem(rng, { gearLevel: 8, rarity: 'epic', slot: 'chest' });
    const setPiece = rollItem(rng, {
      gearLevel: 8,
      rarity: 'epic',
      slot: 'chest',
      setId: 'ember-raider',
    });
    expect(shopPrice(setPiece)).toBeGreaterThan(shopPrice(plain));
  });
});

describe('daily shop refresh', () => {
  it('cycles a new slate once per calendar day and persists purchases', () => {
    const store = memStore();
    const game = new Game(store, mulberry32(99));
    game.pickClass('Mage');
    game.save.gold = 50_000;

    const dayA = Date.parse('2026-11-14T12:00:00Z');
    game.refreshShop(dayA);
    const seedA = game.save.shop.seed;
    const offersA = game.dailyShopOffers(dayA);
    expect(offersA).toHaveLength(DAILY_SHOP_SIZE);
    expect(game.save.shop.dayKey).toBe('2026-11-14');
    expect(seedA).toBe(hashDayKey('2026-11-14'));

    const sameDay = Date.parse('2026-11-14T23:00:00Z');
    game.refreshShop(sameDay);
    expect(game.save.shop.seed).toBe(seedA);
    expect(game.dailyShopOffers(sameDay).map((o) => o.item.id)).toEqual(offersA.map((o) => o.item.id));

    const cheapest = [...offersA].sort((a, b) => a.price - b.price)[0];
    expect(game.buyDailyShop(cheapest.index, dayA)).toBeNull();
    expect(game.save.shop.purchased).toContain(cheapest.index);
    expect(game.buyDailyShop(cheapest.index, dayA)).toMatch(/already/i);

    const dayB = Date.parse('2026-11-15T01:00:00Z');
    game.refreshShop(dayB);
    expect(game.save.shop.dayKey).toBe('2026-11-15');
    expect(game.save.shop.seed).not.toBe(seedA);
    expect(game.save.shop.purchased).toEqual([]);
    const offersB = game.dailyShopOffers(dayB);
    expect(offersB.map((o) => o.item.id)).not.toEqual(offersA.map((o) => o.item.id));

    const raw = JSON.parse(store.getItem(SAVE_KEY)!) as {
      shop: { dayKey: string; seed: number; purchased: number[] };
    };
    expect(raw.shop.dayKey).toBe('2026-11-15');
    expect(raw.shop.purchased).toEqual([]);
  });

  it('migrates missing shop field on load', () => {
    const store = memStore({
      [SAVE_KEY]: JSON.stringify({
        version: 3,
        heroClass: 'Warrior',
        classPicked: true,
        level: 3,
        xp: 0,
        gear: {},
        bag: [],
        pending: [],
        crystals: 0,
        dust: 0,
        gold: 12,
        keys: 3,
        keysAt: Date.now(),
        stagesCleared: 0,
        currentStage: 0,
        nodeProgress: 0,
        dungeons: {},
        loadout: [],
        primary: null,
        seenSkills: [],
        questIndex: 0,
        salvageCount: 0,
        settings: { autoSalvageReplaced: true, autoSalvageWorse: false, autoSalvageRarityMax: 'common', muted: false, speed: 1 },
        createdAt: Date.now(),
      }),
    });
    const game = new Game(store, mulberry32(1));
    expect(game.save.gold).toBe(12);
    expect(game.save.shop.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(game.dailyShopOffers()).toHaveLength(DAILY_SHOP_SIZE);
  });
});
