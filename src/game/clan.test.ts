import { describe, expect, it } from 'vitest';
import { computeHero, rollItem, setCounts } from '../data/gear';
import { DEFAULT_LOADOUT } from '../data/skills';
import { Game } from './game';
import {
  CLAN_CREATE_COST,
  TOKEN_DAY_CAP,
  TOKEN_LOSS,
  TOKEN_WIN,
  applyTokenCap,
  createClan,
  pickQueueRoster,
  recruitForRoster,
  rosterReady,
} from './clan';
import { simulatePvp, buildOpponentRoster } from './pvp';
import { mulberry32 } from './rng';
import type { Storage } from './state';
import { SAVE_KEY, defaultSave, loadSave, writeSave } from './state';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('clan shell', () => {
  it('creates a clan for crystal cost and recruits a full class roster', () => {
    const game = new Game(memoryStorage(), mulberry32(42));
    game.pickClass('Warrior');
    game.save.crystals = CLAN_CREATE_COST;
    expect(game.createClan('Test Wolves')).toBeNull();
    expect(game.save.crystals).toBe(0);
    expect(game.clan?.name).toBe('Test Wolves');
    expect(game.clanRosterReady()).toBe(false);
    expect(game.recruitClanRoster()).toBeNull();
    expect(game.clanRosterReady()).toBe(true);
    const roster = pickQueueRoster(game.clan!.members, 'Warrior');
    expect(roster?.map((m) => m.heroClass).sort()).toEqual(['Mage', 'Ranger', 'Rogue', 'Warrior'].sort());
  });

  it('joins by code and can leave', () => {
    const game = new Game(memoryStorage(), mulberry32(7));
    game.pickClass('Mage');
    expect(game.joinClan('AB12CD')).toBeNull();
    expect(game.clan?.code).toBe('AB12CD');
    expect(game.leaveClan()).toBeNull();
    expect(game.clan).toBeNull();
  });

  it('caps daily clan tokens', () => {
    expect(applyTokenCap(190, TOKEN_WIN)).toEqual({ awarded: 10, earnedToday: 200 });
    expect(applyTokenCap(TOKEN_DAY_CAP, TOKEN_LOSS).awarded).toBe(0);
  });
});

describe('4v4 auto-battle', () => {
  it('simulates a decisive match using gear and loadouts', () => {
    const rng = mulberry32(99);
    const player = createClan(rng, 'A', {
      heroClass: 'Warrior',
      level: 12,
      cp: 800,
      loadout: [...DEFAULT_LOADOUT.Warrior],
      primary: null,
    });
    player.members.push(...recruitForRoster(player, rng, 12));
    expect(rosterReady(player.members)).toBe(true);
    const roster = pickQueueRoster(player.members, 'Warrior')!;
    const enemies = buildOpponentRoster(rng, roster, 800);
    const playerGear = enemies[0].gear!;
    const result = simulatePvp(roster, enemies, playerGear, 12, rng);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.duration).toBeLessThanOrEqual(90);
    expect(result.allyTeam).toHaveLength(4);
    expect(result.enemyTeam).toHaveLength(4);
    expect(typeof result.won).toBe('boolean');
  });

  it('awards win/loss tokens through Game.queueClanPvp', () => {
    const game = new Game(memoryStorage(), mulberry32(3));
    game.pickClass('Ranger');
    game.save.crystals = CLAN_CREATE_COST;
    game.createClan('Quills');
    game.recruitClanRoster();
    let saw = false;
    game.on((e) => {
      if (e.t === 'pvp') saw = true;
    });
    expect(game.queueClanPvp()).toBeNull();
    expect(saw).toBe(true);
    expect(game.save.clanTokens).toBeGreaterThanOrEqual(TOKEN_LOSS);
    expect(game.save.clanWins + game.save.clanLosses).toBe(1);
  });
});

describe('clan armorer + season', () => {
  it('sells Clanforged gear for tokens', () => {
    const game = new Game(memoryStorage(), mulberry32(11));
    game.pickClass('Rogue');
    game.save.clanTokens = 80;
    game.save.level = 18;
    expect(game.buyClanVendor(4)).toBeNull(); // legendary weapon
    expect(game.save.clanTokens).toBe(0);
    expect(game.save.pending[0]?.setId).toBe('clanforged');
    expect(game.save.pending[0]?.icon).toBe('k');
    const counts = setCounts({ weapon: game.save.pending[0]! });
    expect(counts.clanforged).toBe(1);
  });

  it('applies Clanforged set bonuses', () => {
    const rng = mulberry32(5);
    const gear = {
      weapon: rollItem(rng, { gearLevel: 18, rarity: 'epic', slot: 'weapon', setId: 'clanforged' }),
      chest: rollItem(rng, { gearLevel: 18, rarity: 'epic', slot: 'chest', setId: 'clanforged' }),
      helmet: rollItem(rng, { gearLevel: 18, rarity: 'epic', slot: 'helmet', setId: 'clanforged' }),
      belt: rollItem(rng, { gearLevel: 18, rarity: 'epic', slot: 'belt', setId: 'clanforged' }),
    };
    const fx = computeHero(18, gear, 'Warrior').effects;
    expect(fx.pvpCpPct).toBe(8);
    expect(fx.tokenGainPct).toBe(10);
  });

  it('local season reset keeps clan and reopens class pick', () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(2));
    game.pickClass('Warrior');
    game.save.crystals = CLAN_CREATE_COST;
    game.createClan('Persist');
    game.save.level = 10;
    game.resetSeasonLocal();
    expect(game.save.classPicked).toBe(false);
    expect(game.save.level).toBe(1);
    expect(game.clan?.name).toBe('Persist');
    expect(game.save.season.seasonId).toBe(2);
  });

  it('migrates v2 saves to v3 with clan defaults', () => {
    const store = memoryStorage();
    const v2 = { ...defaultSave(), version: 2, classPicked: true, heroClass: 'Mage' as const, level: 5 };
    store.setItem('daggah.save.v2', JSON.stringify(v2));
    const loaded = loadSave(store);
    expect(loaded.version).toBe(3);
    expect(loaded.heroClass).toBe('Mage');
    expect(loaded.clanTokens).toBe(0);
    expect(loaded.season.seasonId).toBe(1);
    writeSave(store, loaded);
    expect(store.getItem(SAVE_KEY)).toBeTruthy();
  });
});
