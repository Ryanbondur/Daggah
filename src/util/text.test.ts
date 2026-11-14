import { describe, expect, it } from 'vitest';
import { exportSaveCode, importSaveCode } from '../game/saveCode';
import { defaultSave, loadSaveFromRaw, sanitizeItem, type Storage } from '../game/state';
import { Game } from '../game/game';
import { mulberry32 } from '../game/rng';
import { CLAN_CREATE_COST } from '../game/clan';
import { cardHtml } from '../ui/items';
import { starterGear } from '../data/gear';
import {
  escapeHtml,
  sanitizeDomId,
  sanitizePlainText,
  stripTags,
} from './text';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('text sanitizer', () => {
  it('escapeHtml encodes entities used in XSS payloads', () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)>`)).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(escapeHtml(`a"b'c&d`)).toBe('a&quot;b&#39;c&amp;d');
  });

  it('stripTags removes tags and leftover brackets', () => {
    expect(stripTags('<script>alert(1)</script>Wolves')).toBe('alert(1)Wolves');
    expect(stripTags('A <b>bold</b> name')).toBe('A bold name');
    expect(stripTags('partial <tag')).toBe('partial tag');
  });

  it('sanitizePlainText strips tags, controls, and caps length', () => {
    expect(sanitizePlainText('<b>Hack</b>\u0000Name', 64)).toBe('HackName');
    expect(sanitizePlainText('  x'.repeat(40), 10)).toHaveLength(10);
  });

  it('sanitizeDomId keeps only attribute-safe chars', () => {
    expect(sanitizeDomId(`it_1"><img onerror=alert(1)>`)).toBe('it_1imgonerroralert1');
    expect(sanitizeDomId('@@@')).toBe('id');
  });

  it('sanitizeItem cleans name and id from save-shaped blobs', () => {
    const dirty = sanitizeItem({
      id: `x"><script>`,
      slot: 'helmet',
      rarity: 'rare',
      gearLevel: 3,
      name: '<img src=x onerror=alert(1)> Blade',
      icon: 'a',
      stats: { atk: 1 },
    });
    expect(dirty.name.includes('<')).toBe(false);
    expect(dirty.name).toContain('Blade');
    expect(dirty.id).toBe(sanitizeDomId(`x"><script>`));
  });
});

describe('save import / display XSS path', () => {
  it('strips poisoned clan + item strings on importSaveCode', () => {
    const save = defaultSave();
    save.classPicked = true;
    save.heroClass = 'Warrior';
    save.clan = {
      id: 'c1',
      name: '<script>xss</script>Wolves',
      code: 'ab<script>',
      members: [
        {
          id: 'player',
          name: '<img src=x onerror=alert(1)>You',
          heroClass: 'Warrior',
          role: 'leader',
          isPlayer: true,
          isAi: false,
          level: 1,
          cp: 100,
          loadout: [...save.loadout],
          primary: null,
        },
      ],
    };
    save.bag = [
      {
        id: `bag"><b>`,
        slot: 'weapon',
        rarity: 'common',
        gearLevel: 1,
        name: '<b>Evil Sword</b>',
        icon: 'a',
        stats: { atk: 5 },
      },
    ];
    save.gear = {
      ...starterGear('Warrior'),
      helmet: {
        id: 'helm1',
        slot: 'helmet',
        rarity: 'common',
        gearLevel: 1,
        name: '<svg onload=alert(1)>Helm',
        icon: 'a',
        stats: { def: 2 },
      },
    };

    const code = exportSaveCode(save);
    const result = importSaveCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.clan?.name).toBe('xssWolves');
    expect(result.save.clan?.name.includes('<')).toBe(false);
    expect(result.save.clan?.code).toBe('ABSCRIPT');
    expect(result.save.clan?.members[0]?.name.includes('<')).toBe(false);
    expect(result.save.bag[0]?.name).toBe('Evil Sword');
    expect(result.save.bag[0]?.id.includes('"')).toBe(false);
    expect(result.save.gear.helmet?.name.includes('<')).toBe(false);

    const html = cardHtml(result.save.bag[0], { gear: result.save.gear });
    expect(html).toContain('Evil Sword');
    expect(html).not.toMatch(/<b>Evil/);
    expect(html).not.toContain('<script');
  });

  it('loadSaveFromRaw sanitizes localStorage clan payloads', () => {
    const raw = JSON.stringify({
      ...defaultSave(),
      version: 3,
      classPicked: true,
      clan: {
        id: 'c',
        name: '<iframe src=x></iframe>Hall',
        code: '!!bad!!',
        members: [],
      },
    });
    const loaded = loadSaveFromRaw(raw);
    expect(loaded?.clan?.name).toBe('Hall');
    expect(loaded?.clan?.code).toBe('BAD');
  });

  it('Game import overwrites with sanitized clan name for UI chat/toast path', () => {
    const store = memoryStorage();
    const donor = new Game(memoryStorage(), mulberry32(11));
    donor.pickClass('Warrior');
    donor.save.crystals = CLAN_CREATE_COST;
    expect(donor.createClan('<b>Hack</b> Clan')).toBeNull();
    expect(donor.clan?.name).toBe('Hack Clan');
    const code = donor.exportSaveCode();

    const victim = new Game(store, mulberry32(12));
    victim.pickClass('Mage');
    expect(victim.importSaveCode(code)).toBeNull();
    expect(victim.clan?.name).toBe('Hack Clan');
    expect(victim.clan?.name.includes('<')).toBe(false);
  });
});
