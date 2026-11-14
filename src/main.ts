import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/800.css';
import '@fontsource/playfair-display/900.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/lilita-one/400.css';
import './style.css';
import { getCloudLinkStatus, syncCloudSave } from './game/cloudSave';
import { Game } from './game/game';
import { ensurePhaser } from './stage/bootPhaser';
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

  // Pull on boot when linked (account code) or when identity may be present.
  const linked = getCloudLinkStatus(storage).linked;
  void syncCloudSave(storage, game.save, Date.now(), { askOnConflict: linked }).then(({ save, result }) => {
    if (result.status === 'pulled') {
      game.save = save;
      game.emit({ t: 'change' });
      game.toast('Restored newer cloud save', 'good');
      return;
    }
    if (result.status === 'conflict' && linked) {
      const cloudNewer = (result.cloud.savedAt ?? 0) > (result.local.savedAt ?? 0);
      // Newer wins automatically on boot; Settings → Sync now can ask.
      if (cloudNewer) {
        game.save = result.cloud;
        game.emit({ t: 'change' });
        game.toast('Loaded newer cloud save', 'good');
      }
    }
  });

  await Promise.all([
    document.fonts.load('900 20px "Playfair Display"'),
    document.fonts.load('400 20px "Lilita One"'),
    document.fonts.load('700 20px "Inter"'),
  ]).catch(() => undefined);

  const root = document.getElementById('app')!;
  let phaserParent: HTMLElement | null = null;

  const ensureStage = async (): Promise<void> => {
    if (!phaserParent) return;
    const phaser = await ensurePhaser(game, phaserParent);
    (window as unknown as { __daggah: unknown }).__daggah = { game, phaser };
  };

  ({ phaserParent } = mountUI(game, root, { ensureStage }));

  (window as unknown as { __daggah: unknown }).__daggah = { game, phaser: null };

  window.setInterval(() => game.persist(), 5000);
  window.addEventListener('pagehide', () => game.persist());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.persist();
  });
}

void boot();
