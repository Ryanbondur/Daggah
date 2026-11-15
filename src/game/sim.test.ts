import { describe, expect, it } from 'vitest';
import { ACTS } from '../data/acts';
import type { HeroClass } from '../data/types';
import { Game } from './game';
import type { RunResult } from './game';
import { mulberry32 } from './rng';
import { dungeonKeyCost, type Storage } from './state';

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

function processLoot(game: Game, preferGearLevel: boolean): void {
  for (const item of [...game.save.pending]) {
    const info = game.compareFor(item);
    const cur = info.current;
    const bigGlUpgrade = !!cur && item.gearLevel > cur.gearLevel;
    if (info.levelOk && (info.cpDelta > 0 || (preferGearLevel && bigGlUpgrade))) {
      game.equip(item, true);
    } else {
      game.salvage(item);
    }
  }
  for (const item of [...game.save.bag]) {
    const info = game.compareFor(item);
    const cur = info.current;
    const bigGlUpgrade = !!cur && item.gearLevel > cur.gearLevel;
    if (info.levelOk && (info.cpDelta > 0 || (preferGearLevel && bigGlUpgrade))) {
      game.equip(item, true);
    }
  }
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
  let battleStartedAt = 0;
  while (tl.seconds < maxSeconds) {
    const frontier = Math.min(game.save.stagesCleared, ACTS.length * 5 - 1);
    const underpowered = game.stagePowerReadout(frontier).underpowered;
    // Break early-act set lock-in when behind: take +2 GL upgrades even if set CP dips.
    processLoot(game, underpowered || failStreak > 0);

    // Softlock guard: retreat if a single run exceeds 8 in-game minutes.
    if (game.battle && battleStartedAt > 0 && tl.seconds - battleStartedAt > 8 * 60) {
      game.retreat();
      failStreak += 1;
      tl.failures += 1;
      battleStartedAt = 0;
      continue;
    }

    if (!game.battle) {
      battleStartedAt = 0;
      const now = Date.now() + tl.seconds * 1000;
      game.refreshKeys(now);
      const s = game.save;
      const unlocked = ACTS.map((a) => a.dungeon!).filter((x) => game.dungeonUnlocked(x));
      const affordable = unlocked.filter((x) => s.keys >= dungeonKeyCost(x.actId));
      const canEnter = affordable.length > 0;
      // Prefer instant Sweep farms once unlocked; otherwise keep clearing toward 5.
      const sweepable = affordable.filter((x) => game.dungeonSweepUnlocked(x));
      const farmTarget =
        sweepable.length > 0
          ? sweepable[sweepable.length - 1]
          : affordable.length > 0
            ? affordable[affordable.length - 1]
            : null;
      const wantFarm = canEnter && (failStreak > 0 || underpowered || (s.stagesCleared >= 5 && s.keys >= 2));
      if (wantFarm && farmTarget) {
        const ok = game.dungeonSweepUnlocked(farmTarget)
          ? game.sweepDungeon(farmTarget.id)
          : game.startDungeon(farmTarget.id);
        if (ok) {
          failStreak = Math.max(0, failStreak - 1);
          if (game.battle) battleStartedAt = tl.seconds;
        }
      } else if (!canEnter && (failStreak > 0 || underpowered) && unlocked.length > 0) {
        const wait = Math.max(1, Math.ceil(game.nextKeyInMs(now) / 1000));
        tl.seconds += wait;
        continue;
      } else if (failStreak > 1 && s.currentStage > 0) {
        game.selectStage(Math.max(0, s.currentStage - 1));
        game.startBattle();
        battleStartedAt = tl.seconds;
        failStreak = 0;
      } else {
        game.selectStage(frontier);
        game.startBattle();
        battleStartedAt = tl.seconds;
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
  it('lets an auto-playing Warrior clear Acts 1-10 in a sane amount of time', () => {
    const game = seededGame(1337, 'Warrior');
    // Act-scaled keys + Sweep-at-5 slow mid/late farms; ~3 in-game days is a sane full-clear bar.
    const tl = autoplay(game, 72 * 3600, { stopAtCleared: 50 });
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
    expect(game.save.stagesCleared).toBe(50);
    expect(game.dungeonUnlocked(ACTS[9].dungeon!)).toBe(true);
  });

  it('lets Mage, Ranger, and Rogue clear Act 1', () => {
    for (const heroClass of ['Mage', 'Ranger', 'Rogue'] as HeroClass[]) {
      const game = seededGame(42 + heroClass.length * 17, heroClass);
      // Rogue can softlock a seed on 1-5; allow a longer window + retreat guard.
      const tl = autoplay(game, 180 * 60, { stopAtCleared: 5 });
      expect(game.save.stagesCleared, heroClass).toBeGreaterThanOrEqual(5);
      expect(tl.failures, heroClass).toBeLessThan(80);
    }
  });
});
