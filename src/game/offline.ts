import { xpToNext } from '../data/xp';
import { STEP } from './combat';
import type { Game, Mode } from './game';

/** Max wall-clock catch-up after background / freeze (Safari freezes rAF). */
export const OFFLINE_CAP_MS = 4 * 60 * 60 * 1000;
/** Ignore tiny visibility blips (tab switch flicker). */
export const OFFLINE_MIN_MS = 1500;

export interface OfflineSummary {
  /** Wall-clock ms actually simulated (after cap). */
  appliedMs: number;
  capped: boolean;
  xp: number;
  gold: number;
  stagesCleared: number;
  crystals: number;
  levels: number;
  /** Mode at catch-up start. */
  startedIn: Mode | 'none';
  /** True if a dungeon run ended during catch-up (key already paid; no re-entry). */
  dungeonEnded: boolean;
}

/**
 * Simulate combat for backgrounded time without relying on rAF/Phaser.
 * Campaign stages keep chaining (`onStageClear` → `startStage`).
 * Dungeons finish the current paid run only — never auto-spend more keys.
 */
export function applyOfflineProgress(game: Game, elapsedMs: number, now = Date.now()): OfflineSummary | null {
  game.refreshKeys(now);
  if (!game.battle || game.mode === 'camp') return null;

  const capped = elapsedMs > OFFLINE_CAP_MS;
  const applyMs = Math.min(Math.max(0, elapsedMs), OFFLINE_CAP_MS);
  if (applyMs < OFFLINE_MIN_MS) return null;

  const startedIn = game.mode;
  const before = {
    xp: totalXp(game),
    gold: game.save.gold,
    stagesCleared: game.save.stagesCleared,
    crystals: game.save.crystals,
    level: game.save.level,
  };

  const wallSeconds = applyMs / 1000;
  const targetSim = wallSeconds * game.speed;
  const wasPaused = game.paused;
  game.paused = false;
  game.beginQuiet();

  let sim = 0;
  let dungeonEnded = false;
  const maxSteps = Math.ceil(targetSim / STEP) + 2;
  for (let i = 0; i < maxSteps && sim + 1e-9 < targetSim; i++) {
    if (!game.battle) break;
    const modeBefore: Mode = game.mode;
    game.stepSim(STEP);
    sim += STEP;
    // Read mode after step without battle-truthy narrowing (wipe/clear → camp).
    const modeAfter = game.mode as Mode;
    if (modeBefore === 'dungeon' && (game.battle == null || modeAfter === 'camp')) {
      dungeonEnded = true;
      break;
    }
    // Stage wipe ends the run — stop rather than auto-retry (no free progress past a wall).
    if (modeBefore === 'stage' && modeAfter === 'camp') {
      break;
    }
  }

  game.endQuiet();
  game.paused = wasPaused;
  game.clearAccumulator();
  game.persist();
  game.emit({ t: 'change' });
  game.emit({ t: 'run' });

  const summary: OfflineSummary = {
    appliedMs: applyMs,
    capped,
    xp: Math.max(0, totalXp(game) - before.xp),
    gold: Math.max(0, game.save.gold - before.gold),
    stagesCleared: Math.max(0, game.save.stagesCleared - before.stagesCleared),
    crystals: Math.max(0, game.save.crystals - before.crystals),
    levels: Math.max(0, game.save.level - before.level),
    startedIn,
    dungeonEnded,
  };

  if (!hasMeaningfulGains(summary)) return summary;
  game.toast(formatOfflineToast(summary), 'good');
  return summary;
}

export function hasMeaningfulGains(s: OfflineSummary): boolean {
  return s.xp > 0 || s.gold > 0 || s.stagesCleared > 0 || s.crystals > 0 || s.levels > 0 || s.dungeonEnded;
}

export function formatOfflineToast(s: OfflineSummary): string {
  const mins = Math.max(1, Math.round(s.appliedMs / 60000));
  const parts: string[] = [];
  if (s.stagesCleared > 0) parts.push(`${s.stagesCleared} stage${s.stagesCleared === 1 ? '' : 's'}`);
  if (s.xp > 0) parts.push(`+${Math.round(s.xp)} XP`);
  if (s.gold > 0) parts.push(`+${Math.round(s.gold)} gold`);
  if (s.crystals > 0) parts.push(`+${s.crystals} crystals`);
  if (s.levels > 0) parts.push(`Lv.+${s.levels}`);
  if (s.dungeonEnded && parts.length === 0) parts.push('dungeon finished');
  const body = parts.length ? parts.join(' · ') : 'progress saved';
  const cap = s.capped ? ' (capped)' : '';
  return `AFK ${mins}m${cap}: ${body}`;
}

function totalXp(game: Game): number {
  let total = game.save.xp;
  for (let level = 1; level < game.save.level; level++) total += xpToNext(level);
  return total;
}
