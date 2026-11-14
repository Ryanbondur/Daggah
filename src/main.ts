import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/800.css';
import '@fontsource/playfair-display/900.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/lilita-one/400.css';
import Phaser from 'phaser';
import './style.css';
import { Game } from './game/game';
import { StageScene } from './stage/StageScene';
import { mountUI } from './ui';

async function boot(): Promise<void> {
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  })();
  const game = new Game(storage);

  await Promise.all([
    document.fonts.load('900 20px "Playfair Display"'),
    document.fonts.load('400 20px "Lilita One"'),
    document.fonts.load('700 20px "Inter"'),
  ]).catch(() => undefined);

  const root = document.getElementById('app')!;
  const { phaserParent } = mountUI(game, root);

  const scene = new StageScene(game);
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: phaserParent,
    backgroundColor: '#0b0b12',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene,
    banner: false,
    audio: { noAudio: true },
    render: { antialias: true, roundPixels: false },
  });

  window.setInterval(() => game.persist(), 5000);
  window.addEventListener('pagehide', () => game.persist());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.persist();
  });

  (window as unknown as { __daggah: unknown }).__daggah = { game, phaser };
}

void boot();
