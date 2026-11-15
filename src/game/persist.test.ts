import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { mulberry32 } from './rng';
import { checksum32, exportSaveCode, importSaveCode, SAVE_CODE_PREFIX } from './saveCode';
import {
  LEGACY_SAVE_KEYS,
  SAVE_BACKUP_KEY,
  SAVE_KEY,
  defaultSave,
  loadSave,
  writeSave,
  type Storage,
} from './state';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('durable save key', () => {
  it('migrates daggah.save.v3 onto stable daggah.save and clears legacy', () => {
    const store = memoryStorage();
    const legacy = defaultSave(1_700_000_000_000);
    legacy.classPicked = true;
    legacy.heroClass = 'Rogue';
    legacy.level = 12;
    legacy.loadout = ['backstab', 'shadow-veil', 'shadowstep', 'flurry'];
    store.setItem('daggah.save.v3', JSON.stringify({ ...legacy, version: 3 }));

    const loaded = loadSave(store, 1_700_000_000_100);
    expect(loaded.heroClass).toBe('Rogue');
    expect(loaded.level).toBe(12);
    expect(loaded.loadout).toContain('shadow-veil');
    expect(store.getItem(SAVE_KEY)).toBeTruthy();
    expect(store.getItem('daggah.save.v3')).toBeNull();
    for (const key of LEGACY_SAVE_KEYS) expect(store.getItem(key)).toBeNull();
  });

  it('keeps dual-passive loadouts across reload', () => {
    const store = memoryStorage();
    const game = new Game(store, mulberry32(9));
    game.pickClass('Warrior');
    expect(game.toggleSkill('bulwark')).toBeNull();
    expect(game.save.loadout).toContain('bulwark');
    expect(game.save.loadout).not.toContain('cleave');

    const again = new Game(store, mulberry32(9));
    expect(again.save.loadout).toContain('bulwark');
    expect(again.save.heroClass).toBe('Warrior');
  });

  it('backs up corrupt blobs instead of silently discarding recovery', () => {
    const store = memoryStorage();
    store.setItem(SAVE_KEY, '{not json');
    const loaded = loadSave(store);
    expect(loaded.level).toBe(1);
    expect(store.getItem(SAVE_BACKUP_KEY)).toBe('{not json');
  });

  it('accepts future schema versions with a known class (forward compatible)', () => {
    const store = memoryStorage();
    const future = {
      ...defaultSave(),
      version: 99,
      classPicked: true,
      heroClass: 'Mage' as const,
      level: 8,
      loadout: ['frostbite', 'ice-lance', 'frost-nova', 'firebolt'],
      extraFutureField: 'ignored-at-rest',
    };
    store.setItem(SAVE_KEY, JSON.stringify(future));
    const loaded = loadSave(store);
    expect(loaded.version).toBe(4);
    expect(loaded.level).toBe(8);
    expect(loaded.loadout).toContain('frostbite');
  });
});

describe('export / import save codes', () => {
  it('round-trips progress including dual passives', () => {
    const save = defaultSave();
    save.classPicked = true;
    save.heroClass = 'Ranger';
    save.level = 14;
    save.crystals = 77;
    save.loadout = ['deadeye', 'aimed-shot', 'hunters-mark', 'kill-shot'];
    const code = exportSaveCode(save);
    expect(code.startsWith(`${SAVE_CODE_PREFIX}.`)).toBe(true);

    const result = importSaveCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.level).toBe(14);
    expect(result.save.crystals).toBe(77);
    expect(result.save.loadout).toEqual(save.loadout);
    expect(result.save.heroClass).toBe('Ranger');
  });

  it('rejects tampered checksums', () => {
    const code = exportSaveCode(defaultSave());
    const parts = code.split('.');
    parts[2] = checksum32('nope');
    const result = importSaveCode(parts.join('.'));
    expect(result.ok).toBe(false);
  });

  it('Game.importSaveCode overwrites localStorage cache', () => {
    const store = memoryStorage();
    const a = new Game(store, mulberry32(1));
    a.pickClass('Mage');
    a.save.level = 9;
    a.save.loadout = ['frostbite', 'ice-lance', 'frost-nova', 'absolute-zero'];
    a.persist();
    const code = a.exportSaveCode();

    const b = new Game(memoryStorage(), mulberry32(2));
    b.pickClass('Warrior');
    expect(b.importSaveCode(code)).toBeNull();
    expect(b.save.heroClass).toBe('Mage');
    expect(b.save.level).toBe(9);
    expect(b.save.loadout).toContain('frostbite');
  });
});

describe('writeSave stable key', () => {
  it('writes only the stable key', () => {
    const store = memoryStorage();
    store.setItem('daggah.save.v3', '{"stale":true}');
    writeSave(store, defaultSave(42), 42);
    expect(store.getItem(SAVE_KEY)).toBeTruthy();
    expect(store.getItem('daggah.save.v3')).toBeNull();
    expect(JSON.parse(store.getItem(SAVE_KEY)!).savedAt).toBe(42);
  });
});
