import { describe, expect, it } from 'vitest';
import { getDungeon } from '../data/acts';
import { ASCENDED_SEAL_FRAGMENTS_PER_SEAL } from './ascended';
import {
  CLAN_RAID_DUNGEON,
  CLAN_RAID_FRAGMENT_MAX,
  CLAN_RAID_FRAGMENT_MIN,
  CLAN_RAID_SEAL_CHANCE,
  CLAN_RAID_WEEKLY_ATTEMPTS,
  clanRaidWeekKey,
  expectedSealsPerClanRaidWeek,
  formatClanRaidReward,
  isClanRaidDungeon,
  rollClanRaidReward,
} from './clanRaid';
import { Game } from './game';
import { mulberry32 } from './rng';

async function raidReadyGame(): Promise<Game> {
  const game = new Game(undefined, mulberry32(7));
  game.save.classPicked = true;
  game.save.level = 20;
  game.save.stagesCleared = 50;
  game.save.crystals = 500;
  expect(await game.createClan('Raid Test')).toBeNull();
  return game;
}

describe('clanRaid helpers', () => {
  it('uses clan-raid dungeon id', () => {
    expect(isClanRaidDungeon(CLAN_RAID_DUNGEON)).toBe(true);
    expect(getDungeon('clan-raid').id).toBe('clan-raid');
  });

  it('formats week keys stably within an ISO week', () => {
    // Mon–Sun same week (UTC): 2026-11-16 (Mon) and 2026-11-22 (Sun).
    const a = clanRaidWeekKey(Date.UTC(2026, 10, 16));
    const b = clanRaidWeekKey(Date.UTC(2026, 10, 22));
    expect(a).toMatch(/^\d{4}-W\d{2}$/);
    expect(a).toBe(b);
    expect(clanRaidWeekKey(Date.UTC(2026, 10, 23))).not.toBe(a);
  });

  it('rolls seal or fragments only', () => {
    const sealRng = mulberry32(1);
    // Force many rolls; ensure only seals/fragments fields are set.
    let seals = 0;
    let frags = 0;
    for (let i = 0; i < 40; i++) {
      const r = rollClanRaidReward(sealRng);
      expect(r.ascendedSeals + (r.ascendedSealFragments > 0 ? 1 : 0)).toBeGreaterThan(0);
      expect(r.ascendedSeals === 0 || r.ascendedSealFragments === 0).toBe(true);
      seals += r.ascendedSeals;
      frags += r.ascendedSealFragments;
      if (r.ascendedSealFragments > 0) {
        expect(r.ascendedSealFragments).toBeGreaterThanOrEqual(CLAN_RAID_FRAGMENT_MIN);
        expect(r.ascendedSealFragments).toBeLessThanOrEqual(CLAN_RAID_FRAGMENT_MAX);
      }
    }
    expect(seals + frags).toBeGreaterThan(0);
    expect(CLAN_RAID_SEAL_CHANCE).toBeGreaterThan(0);
    expect(formatClanRaidReward({ ascendedSeals: 1, ascendedSealFragments: 0 })).toMatch(/Seal/);
  });

  it('targets ~2–3 seals/week after craft for a full-attempt raider', () => {
    expect(CLAN_RAID_WEEKLY_ATTEMPTS).toBe(3);
    expect(CLAN_RAID_SEAL_CHANCE).toBe(0.4);
    expect(CLAN_RAID_FRAGMENT_MIN).toBe(2);
    expect(CLAN_RAID_FRAGMENT_MAX).toBe(4);
    expect(ASCENDED_SEAL_FRAGMENTS_PER_SEAL).toBe(5);
    const week = expectedSealsPerClanRaidWeek();
    expect(week).toBeGreaterThanOrEqual(2);
    expect(week).toBeLessThanOrEqual(3);
    // Closed form: 3 * (0.4 + 0.6 * 3/5) = 2.28
    expect(week).toBeCloseTo(2.28, 5);
  });
});

describe('Clan Raid flow', () => {
  it('requires clan + Act 10 clear', async () => {
    const game = new Game(undefined, mulberry32(3));
    game.save.classPicked = true;
    game.save.crystals = 500;
    expect(game.startClanRaid()).toMatch(/clan/i);
    expect(await game.createClan('Early')).toBeNull();
    game.save.stagesCleared = 20;
    expect(game.startClanRaid()).toMatch(/Nightscar|Act 10/i);
  });

  it('starts a single-boss run with a party of 4 and spends a weekly attempt', async () => {
    const game = await raidReadyGame();
    expect(game.clanRaidAttemptsLeft()).toBe(CLAN_RAID_WEEKLY_ATTEMPTS);
    expect(game.startClanRaid()).toBeNull();
    expect(game.mode).toBe('dungeon');
    expect(game.battle?.run.nodes).toHaveLength(1);
    expect(game.battle?.run.nodes[0]?.type).toBe('boss');
    expect(game.battle?.isClanRaid).toBe(true);
    expect(game.battle?.raidAllies).toHaveLength(4);
    expect(game.battle?.raidAllies.filter((a) => a.isPlayer)).toHaveLength(1);
    expect(game.battle?.raidAllies.filter((a) => a.isAi)).toHaveLength(3);
    expect(game.clanRaidAttemptsLeft()).toBe(CLAN_RAID_WEEKLY_ATTEMPTS - 1);
  });

  it('caps weekly attempts', async () => {
    const game = await raidReadyGame();
    for (let i = 0; i < CLAN_RAID_WEEKLY_ATTEMPTS; i++) {
      expect(game.startClanRaid()).toBeNull();
      game.retreat();
    }
    expect(game.startClanRaid()).toMatch(/attempts/i);
  });

  it('awards seals or fragments on clear — never gear loot', async () => {
    const game = await raidReadyGame();
    const beforeSeals = game.save.ascendedSeals;
    const beforeFrags = game.save.ascendedSealFragments;
    expect(game.startClanRaid()).toBeNull();
    for (let i = 0; i < 4000 && game.mode === 'dungeon'; i++) {
      const b = game.battle;
      if (b) {
        for (const e of b.enemies) {
          e.hp = 0;
          e.dead = true;
        }
      }
      game.tick(0.05);
    }
    expect(game.mode).toBe('camp');
    const gainedSeals = game.save.ascendedSeals - beforeSeals;
    const gainedFrags = game.save.ascendedSealFragments - beforeFrags;
    expect(gainedSeals > 0 || gainedFrags > 0).toBe(true);
    expect(game.save.pending.length).toBe(0);
  });
});
