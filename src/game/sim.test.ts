import { describe, expect, it } from 'vitest';
import { ACTS } from '../data/acts';
import type { HeroClass } from '../data/types';
import { Game } from './game';
import type { RunResult } from './game';
import { mulberry32 } from './rng';
import type { Storage } from './state';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

interface Timeline {
  seconds: number;
  stageClears: { stage: number; t: number; level: number; cp: number }[];
  failures: number;
  dungeonRuns: number;
  dungeonFails: number;
}

/** Headless auto-player: pushes the frontier, farms dungeons when it stalls. */
function autoplay(game: Game, maxSeconds: number, opts: { stopAtCleared?: number } = {}): Timeline {
  const tl: Timeline = { seconds: 0, stageClears: [], failures: 0, dungeonRuns: 0, dungeonFails: 0 };
  const dt = 0.25;
  let lastCleared = game.save.stagesCleared;
  let failStreak = 0;
  game.on((e) => {
    if (e.t === 'result') handleResult(e.result);
  });
  const handleResult = (r: RunResult) => {
    if (r.loot.length) game.queueLoot(r.loot, false);
    if (r.kind === 'stageFailed') {
      tl.failures += 1;
      failStreak += 1;
    }
    if (r.kind === 'dungeon') {
      tl.dungeonRuns += 1;
      if (!r.success) tl.dungeonFails += 1;
    }
  };
  while (tl.seconds < maxSeconds) {
    for (const item of [...game.save.pending]) {
      const info = game.compareFor(item);
      if (info.levelOk && info.cpDelta > 0) game.equip(item, true);
      else game.salvage(item);
    }
    for (const item of [...game.save.bag]) {
      const info = game.compareFor(item);
      if (info.levelOk && info.cpDelta > 0) game.equip(item, true);
    }
    if (!game.battle) {
      game.refreshKeys(Date.now() + tl.seconds * 1000);
      const s = game.save;
      const d = ACTS.map((a) => a.dungeon!).filter((x) => game.dungeonUnlocked(x));
      const canEnter = d.length > 0 && (s.keys > 0 || s.crystals >= 50);
      const farmForPower = canEnter && s.stagesCleared >= 5 && failStreak === 0 && s.keys >= 2 && tl.dungeonRuns < s.stagesCleared;
      const wantFarm = canEnter && (failStreak > 0 || farmForPower);
      if (wantFarm) {
        const target = d[d.length - 1];
        game.startDungeon(target.id);
        failStreak = Math.max(0, failStreak - 1);
      } else if (failStreak > 1 && s.currentStage > 0) {
        game.selectStage(Math.max(0, s.currentStage - 1));
        game.startBattle();
        failStreak = 0;
      } else {
        game.startBattle();
      }
    }
    game.tick(dt);
    tl.seconds += dt;
    if (game.save.stagesCleared !== lastCleared) {
      lastCleared = game.save.stagesCleared;
      failStreak = 0;
      tl.stageClears.push({
        stage: lastCleared,
        t: Math.round(tl.seconds),
        level: game.save.level,
        cp: game.cp,
      });
      if (opts.stopAtCleared && lastCleared >= opts.stopAtCleared) break;
    }
  }
  return tl;
}

function seededGame(seed: number, heroClass: HeroClass): Game {
  const game = new Game(memoryStorage(), mulberry32(seed));
  game.pickClass(heroClass);
  return game;
}

describe('combat + progression sim', () => {
  it('lets an auto-playing Warrior clear Acts 1-4 in a sane amount of time', () => {
    const game = seededGame(1337, 'Warrior');
    const tl = autoplay(game, 8 * 3600, { stopAtCleared: 20 });
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          class: 'Warrior',
          minutes: Math.round(tl.seconds / 60),
          level: game.save.level,
          cp: game.cp,
          failures: tl.failures,
          dungeonRuns: tl.dungeonRuns,
          dungeonFails: tl.dungeonFails,
          clears: tl.stageClears,
        },
        null,
        1,
      ),
    );
    expect(game.save.stagesCleared).toBe(20);
  });

  it('lets Mage, Ranger, and Rogue clear Act 1', () => {
    for (const heroClass of ['Mage', 'Ranger', 'Rogue'] as HeroClass[]) {
      const game = seededGame(42 + heroClass.length * 17, heroClass);
      const tl = autoplay(game, 90 * 60, { stopAtCleared: 5 });
      expect(game.save.stagesCleared, heroClass).toBeGreaterThanOrEqual(5);
      expect(tl.failures, heroClass).toBeLessThan(50);
    }
  });
});
