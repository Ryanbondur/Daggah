import { describe, expect, it } from 'vitest';
import { ACTS, enemyScale, stageRecCp, stageRecLevel, stageTier } from '../data/acts';
import { rollItem, SET_SLOTS, type Gear } from '../data/gear';
import { DEFAULT_LOADOUT } from '../data/skills';
import { Game } from './game';
import { attemptStage, kitScaleForRatio, memStorage, scaledKit } from './cpSweep';
import { mulberry32 } from './rng';

const SEEDS = [3, 17, 41];

function winsAt(act: number, stage: number, ratio: number, heroClass: 'Warrior' | 'Mage' | 'Ranger' | 'Rogue' = 'Warrior') {
  const k = kitScaleForRatio(act, stage, ratio, heroClass);
  return SEEDS.filter((s) => attemptStage(act, stage, k, s, heroClass).cleared).length;
}

describe('enemy stage curve is continuous (no per-act cliffs)', () => {
  it('grows HP and ATK strictly with tier across all 50 stages', () => {
    for (const role of ['trash', 'elite', 'boss'] as const) {
      for (let t = 1; t < 55; t++) {
        const a = enemyScale(t - 1, role);
        const b = enemyScale(t, role);
        expect(b.hp, `${role} hp tier ${t}`).toBeGreaterThan(a.hp);
        expect(b.atk, `${role} atk tier ${t}`).toBeGreaterThan(a.atk);
      }
    }
  });

  it('has no HP/ATK collapse at the old act-pair boundaries (tier 10/20/30/40)', () => {
    for (const t of [10, 20, 30, 40]) {
      for (const role of ['trash', 'boss'] as const) {
        const a = enemyScale(t - 1, role);
        const b = enemyScale(t, role);
        expect(b.hp / a.hp).toBeGreaterThan(1);
        expect(b.hp / a.hp).toBeLessThan(1.15);
        expect(b.atk / a.atk).toBeLessThan(1.15);
      }
    }
  });

  it('keeps Act 10 enemies far above Act 7–9 (the old curve dipped to ~half)', () => {
    const act10 = enemyScale(stageTier(10, 4), 'trash');
    const act7 = enemyScale(stageTier(7, 4), 'trash');
    expect(act10.hp).toBeGreaterThan(act7.hp * 1.2);
    expect(act10.atk).toBeGreaterThan(act7.atk * 1.2);
  });
});

describe('recommended CP gates Act 10', () => {
  it("does not let Ryan's report (Lv20, 1,214 CP vs 1,765) clear 10-4", () => {
    expect(stageRecLevel(10, 4)).toBe(20);
    expect(stageRecCp(10, 4)).toBeGreaterThan(1700);
    const ratio = 1214 / stageRecCp(10, 4);
    expect(ratio).toBeCloseTo(0.69, 1);
    expect(winsAt(10, 4, ratio)).toBe(0);
  });

  it('fails every Act 10 stage at 60–80% of recommended CP', () => {
    for (let stage = 1; stage <= 5; stage++) {
      for (const ratio of [0.6, 0.7, 0.75, 0.8]) {
        expect(winsAt(10, stage, ratio), `10-${stage} @ ${ratio}`).toBe(0);
      }
    }
  });

  it('clears every Act 10 stage at ~100% of recommended CP and above', () => {
    for (let stage = 1; stage <= 5; stage++) {
      for (const ratio of [1.0, 1.1, 1.25]) {
        expect(winsAt(10, stage, ratio), `10-${stage} @ ${ratio}`).toBe(SEEDS.length);
      }
    }
  });

  it('applies the same gate to Mage and Ranger at Act 10', () => {
    for (const cls of ['Mage', 'Ranger'] as const) {
      expect(winsAt(10, 4, 0.7, cls), `${cls} 70%`).toBe(0);
      expect(winsAt(10, 5, 0.7, cls), `${cls} 70% boss`).toBe(0);
      expect(winsAt(10, 4, 1.0, cls), `${cls} 100%`).toBe(SEEDS.length);
      expect(winsAt(10, 5, 1.0, cls), `${cls} 100% boss`).toBe(SEEDS.length);
    }
  });

  it('keeps Rogue gated at 70% and clearing by 130% of recommended CP', () => {
    expect(winsAt(10, 4, 0.7, 'Rogue')).toBe(0);
    expect(winsAt(10, 5, 1.3, 'Rogue')).toBe(SEEDS.length);
  });
});

describe('Rogue clear CP vs peer baseline (DG-119)', () => {
  /** Lowest ratio where all SEEDS clear (binary search). */
  function minClearRatio(act: number, stage: number, heroClass: 'Warrior' | 'Mage' | 'Ranger' | 'Rogue') {
    let lo = 0.65;
    let hi = 1.55;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (winsAt(act, stage, mid, heroClass) === SEEDS.length) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  function peerBaseline(act: number, stage: number) {
    const peers = (['Warrior', 'Mage', 'Ranger'] as const).map((c) => minClearRatio(act, stage, c));
    return peers.reduce((a, b) => a + b, 0) / peers.length;
  }

  it('needs ~1.13–1.3× peer clear CP on mid/late bosses (not 1.4×+)', () => {
    for (const [act, stage] of [
      [4, 5],
      [8, 5],
      [10, 5],
    ] as const) {
      const peer = peerBaseline(act, stage);
      const rogue = minClearRatio(act, stage, 'Rogue');
      const rel = rogue / peer;
      expect(rel, `${act}-${stage} Rogue/peer=${rel.toFixed(3)}`).toBeGreaterThanOrEqual(1.1);
      expect(rel, `${act}-${stage} Rogue/peer=${rel.toFixed(3)}`).toBeLessThanOrEqual(1.32);
    }
  });
});

describe('recommended CP gates every act consistently', () => {
  it('clears stages 4 and 5 of every act at 100% of recommended CP', () => {
    for (const act of ACTS) {
      for (const stage of [4, 5]) {
        expect(winsAt(act.id, stage, 1.0), `${act.id}-${stage} @100%`).toBe(SEEDS.length);
      }
    }
  });

  it('walls Acts 4–10 stages 4/5 at 75% of recommended CP', () => {
    for (let act = 4; act <= 10; act++) {
      for (const stage of [4, 5]) {
        expect(winsAt(act, stage, 0.75), `${act}-${stage} @75%`).toBe(0);
      }
    }
  });

  it('walls Acts 2–3 at 65% so the early curve is not free either', () => {
    for (const act of [2, 3]) {
      for (const stage of [4, 5]) {
        expect(winsAt(act, stage, 0.65), `${act}-${stage} @65%`).toBe(0);
      }
    }
  });

  it('no longer walls on-curve heroes in Acts 4 and 6 (old curve needed 110–140% CP)', () => {
    for (const act of [4, 6]) {
      for (const stage of [1, 2, 3, 4, 5]) {
        expect(winsAt(act, stage, 1.05), `${act}-${stage} @105%`).toBe(SEEDS.length);
      }
    }
  });
});

describe('endgame modes stay clearable after the stage retune', () => {
  function equipEpic(game: Game, seed: number) {
    const rng = mulberry32(seed);
    game.save.level = 19;
    game.save.xp = 0;
    const gear: Gear = {};
    for (const slot of SET_SLOTS) {
      gear[slot] = rollItem(rng, { slot, rarity: 'epic', gearLevel: 19, setId: 'nightscar-regalia' });
    }
    game.save.gear = gear;
    game.save.loadout = [...DEFAULT_LOADOUT.Warrior];
  }

  it('clears Ascended Nightscar on full Epic Regalia (non-BiS)', () => {
    for (const seed of [11, 29, 47]) {
      const game = new Game(memStorage(), mulberry32(seed));
      game.pickClass('Warrior');
      game.devUnlockThroughAct(10);
      equipEpic(game, seed + 99);
      game.save.ascendedSeals = 3;
      expect(game.startDungeon('nightscar-ascended')).toBe(true);
      let t = 0;
      while (t < 900 && game.battle) {
        game.tick(0.25);
        t += 0.25;
      }
      expect(game.battle, `seed ${seed} timed out`).toBeNull();
      expect(game.save.dungeons['nightscar-ascended']?.cleared).toBe(true);
    }
  });

  it('keeps stage-10 hero CP honest: Epic Regalia at Lv19 is well over recommended', () => {
    const game = new Game(memStorage(), mulberry32(5));
    game.pickClass('Warrior');
    equipEpic(game, 77);
    expect(game.cp).toBeGreaterThan(stageRecCp(10, 5) * 1.2);
  });

  it('uses a benchmark kit that matches stageRecCp at k=1', () => {
    const game = new Game(memStorage(), mulberry32(5));
    game.pickClass('Warrior');
    game.save.level = stageRecLevel(10, 5);
    game.save.gear = scaledKit(stageRecLevel(10, 5), 1);
    expect(game.cp).toBe(stageRecCp(10, 5));
  });
});
