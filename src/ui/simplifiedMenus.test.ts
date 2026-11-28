import { describe, expect, it } from 'vitest';
import { SAVE_KEY, defaultSave, loadSave, type Storage } from '../game/state';
import { gearHubTabRow, isGearHubTab } from './gearHub';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('simplifiedMenus flag', () => {
  it('defaults ON for new saves', () => {
    expect(defaultSave().settings.simplifiedMenus).toBe(true);
  });

  it('defaults ON when migrating saves that lack the key', () => {
    const store = memoryStorage();
    const raw = defaultSave();
    const settings = { ...raw.settings } as Record<string, unknown>;
    delete settings.simplifiedMenus;
    store.setItem(SAVE_KEY, JSON.stringify({ ...raw, settings }));
    expect(loadSave(store).settings.simplifiedMenus).toBe(true);
  });

  it('preserves explicit OFF across load', () => {
    const store = memoryStorage();
    const raw = defaultSave();
    raw.settings.simplifiedMenus = false;
    store.setItem(SAVE_KEY, JSON.stringify(raw));
    expect(loadSave(store).settings.simplifiedMenus).toBe(false);
  });
});

describe('gear hub chrome', () => {
  it('renders three Arsenal tabs with the active one marked', () => {
    const html = gearHubTabRow('craft');
    expect(html).toContain('aria-label="Arsenal"');
    expect(html).toContain('data-tab="craft"');
    expect(html.match(/gear-hub-tab on/g)?.length).toBe(1);
    expect(isGearHubTab('sets')).toBe(true);
    expect(isGearHubTab('town')).toBe(false);
  });
});
