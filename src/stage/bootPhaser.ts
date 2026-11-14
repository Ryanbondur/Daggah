import type { Game } from '../game/game';

/** Opaque handle; avoid static Phaser import in the shell entry. */
export type PhaserHandle = object;

let pending: Promise<PhaserHandle> | null = null;

/**
 * Lazily load Phaser + StageScene and mount the canvas once.
 * Safe to call repeatedly; concurrent callers share one promise.
 */
export function ensurePhaser(game: Game, parent: HTMLElement): Promise<PhaserHandle> {
  if (pending) return pending;
  pending = (async (): Promise<PhaserHandle> => {
    const [{ default: Phaser }, { StageScene }] = await Promise.all([
      import('phaser'),
      import('./StageScene'),
    ]);
    const scene = new StageScene(game);
    return new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#0b0b12',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene,
      banner: false,
      audio: { noAudio: true },
      render: { antialias: true, roundPixels: false },
    });
  })();
  return pending;
}
