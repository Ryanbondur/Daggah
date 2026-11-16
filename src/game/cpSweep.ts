import { stageRecCp, stageRecLevel } from '../data/acts';
import { baseStatsForSlot, computeHero, RARITIES, SET_SLOTS, type Gear } from '../data/gear';
import { DEFAULT_LOADOUT } from '../data/skills';
import type { HeroClass, StatKey } from '../data/types';
import { Game } from './game';
import { mulberry32 } from './rng';
import type { Storage } from './state';

export function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

/** Benchmark-style full rare kit at `gl`, every stat scaled by `k` (k=1 matches stageRecCp's kit). */
export function scaledKit(gl: number, k: number): Gear {
  const gear: Gear = {};
  for (const slot of SET_SLOTS) {
    const stats = baseStatsForSlot(slot, gl, RARITIES.rare.mult);
    for (const key of Object.keys(stats) as StatKey[]) {
      const v = stats[key] ?? 0;
      stats[key] = Math.round(v * k * 10) / 10;
    }
    gear[slot] = { id: `sweep_${slot}`, slot, rarity: 'rare', gearLevel: gl, name: 'Sweep', icon: 'a', stats };
  }
  return gear;
}

/** Kit scale `k` whose CP lands closest to `ratio` × the stage's recommended CP (at rec level/gear level). */
export function kitScaleForRatio(actId: number, stage: number, ratio: number, heroClass: HeroClass = 'Warrior'): number {
  const lvl = stageRecLevel(actId, stage);
  const target = stageRecCp(actId, stage) * ratio;
  let lo = 0;
  let hi = 4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (computeHero(lvl, scaledKit(lvl, mid), heroClass).cp < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

export interface StageAttempt {
  cp: number;
  /** Cleared the stage in one 5-life attempt starting at node 0. */
  cleared: boolean;
  deaths: number;
  seconds: number;
}

/** Fresh hero at the stage's rec level with a scaled rare kit; one attempt at the stage. */
export function attemptStage(
  actId: number,
  stage: number,
  k: number,
  seed: number,
  heroClass: HeroClass = 'Warrior',
  opts: { level?: number; gl?: number } = {},
): StageAttempt {
  const game = new Game(memStorage(), mulberry32(seed));
  game.pickClass(heroClass);
  game.devUnlockThroughAct(10);
  const lvl = opts.level ?? stageRecLevel(actId, stage);
  game.save.level = lvl;
  game.save.xp = 0;
  game.save.gear = scaledKit(opts.gl ?? lvl, k);
  game.save.loadout = [...DEFAULT_LOADOUT[heroClass]];
  game.selectStage((actId - 1) * 5 + (stage - 1));
  game.save.nodeProgress = 0;
  let failed = false;
  let cleared = false;
  let deaths = 0;
  game.on((e) => {
    if (e.t === 'result' && e.result.kind === 'stageFailed') failed = true;
    if (e.t === 'battle' && e.ev.t === 'heroDeath') deaths += 1;
    if (e.t === 'battle' && e.ev.t === 'runClear') cleared = true;
  });
  game.startBattle();
  const cp = game.cp;
  let t = 0;
  const dt = 0.25;
  while (t < 1500 && game.battle && !failed && !cleared) {
    game.tick(dt);
    t += dt;
  }
  return { cp, cleared, deaths, seconds: t };
}
