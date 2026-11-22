import { describe, expect, it } from 'vitest';
import { QUESTS, dailyQuestForDay } from '../data/quests';
import { SEASON_MILESTONES } from '../data/season';
import { TUTORIAL_STEPS, tutorialActive } from '../data/tutorial';
import { APP_CONTENT_VERSION, shouldShowWhatsNew, WHATS_NEW } from '../data/whatsNew';
import { escapeHtml } from '../ui/escape';
import { sanitizeClanCode, sanitizeClanName, CLAN_CREATE_COST } from './clan';
import { Game } from './game';
import { mulberry32 } from './rng';
import { defaultSave, loadSaveFromRaw, type Storage } from './state';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('XSS sanitization', () => {
  it('strips tags and control chars from clan name / code on create/join', async () => {
    expect(sanitizeClanName('<script>xss</script>Wolves')).toBe('xssWolves');
    expect(sanitizeClanCode('ab<script>12')).toBe('ABSCRIPT');
    expect(escapeHtml(`Nightscar "Wolves" & Co`)).toContain('&quot;');
    const game = new Game(memoryStorage(), mulberry32(1));
    game.pickClass('Warrior');
    game.save.crystals = CLAN_CREATE_COST;
    expect(await game.createClan('<b>Hack</b>')).toBeNull();
    expect(game.clan?.name).toBe('Hack');
    expect(game.clan?.name.includes('<')).toBe(false);
  });
});

describe('tutorial', () => {
  it('advances through first-run steps and unlocks skip after complete', () => {
    const game = new Game(memoryStorage(), mulberry32(2));
    game.pickClass('Warrior');
    expect(game.tutorialIsActive).toBe(true);
    expect(game.canSkipTutorial()).toBe(false);
    expect(game.tutorialStep?.id).toBe('auto-attack');
    game.advanceTutorial('auto-attack');
    expect(game.tutorialStep?.id).toBe('first-drop');
    game.advanceTutorial('first-drop');
    game.advanceTutorial('equip-skills');
    game.advanceTutorial('dungeon-key');
    expect(game.tutorialStep?.id).toBe('clan');
    game.advanceTutorial('clan');
    expect(game.tutorialIsActive).toBe(false);
    expect(game.save.tutorial.everCompleted).toBe(true);
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([
      'auto-attack',
      'first-drop',
      'equip-skills',
      'dungeon-key',
      'clan',
    ]);
    expect(TUTORIAL_STEPS).toHaveLength(5);
  });

  it('allows skip only after everCompleted, and preserves flag across season reset', () => {
    const game = new Game(memoryStorage(), mulberry32(3));
    game.pickClass('Warrior');
    game.save.tutorial.everCompleted = true;
    game.save.tutorial.step = 0;
    expect(tutorialActive(game.save.tutorial)).toBe(true);
    game.skipTutorial();
    expect(game.tutorialIsActive).toBe(false);
    game.resetSeasonLocal();
    expect(game.save.tutorial.everCompleted).toBe(true);
    expect(game.canSkipTutorial()).toBe(true);
  });

  it('completes clan step when founding a clan', async () => {
    const game = new Game(memoryStorage(), mulberry32(7));
    game.pickClass('Warrior');
    game.save.tutorial.step = TUTORIAL_STEPS.findIndex((s) => s.id === 'clan');
    game.save.crystals = CLAN_CREATE_COST;
    expect(game.tutorialStep?.id).toBe('clan');
    expect(await game.createClan('Wolves')).toBeNull();
    expect(game.tutorialIsActive).toBe(false);
    expect(game.save.tutorial.everCompleted).toBe(true);
  });
});

describe('whats-new', () => {
  it('shows once then suppresses until the content version bumps', () => {
    expect(WHATS_NEW.bullets.length).toBeGreaterThanOrEqual(3);
    expect(shouldShowWhatsNew('')).toBe(true);
    expect(shouldShowWhatsNew(APP_CONTENT_VERSION)).toBe(false);
    expect(shouldShowWhatsNew('older')).toBe(true);

    const game = new Game(memoryStorage(), mulberry32(8));
    game.pickClass('Ranger');
    // Fresh save seeds current version; new players skip notes.
    expect(game.shouldShowWhatsNew()).toBe(false);
    game.save.lastSeenContentVersion = '';
    // Tutorial still active blocks notes.
    expect(game.tutorialIsActive).toBe(true);
    expect(game.shouldShowWhatsNew()).toBe(false);
    game.save.tutorial.everCompleted = true;
    game.save.tutorial.step = TUTORIAL_STEPS.length;
    expect(game.shouldShowWhatsNew()).toBe(true);
    game.dismissWhatsNew();
    expect(game.save.lastSeenContentVersion).toBe(APP_CONTENT_VERSION);
    expect(game.shouldShowWhatsNew()).toBe(false);
  });

  it('migrates legacy saves without lastSeen so notes appear once', () => {
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    delete legacy.lastSeenContentVersion;
    const loaded = loadSaveFromRaw(JSON.stringify(legacy));
    expect(loaded).not.toBeNull();
    expect(loaded!.lastSeenContentVersion).toBe('');
    expect(shouldShowWhatsNew(loaded!.lastSeenContentVersion)).toBe(true);
  });
});

describe('mid-act + daily quests', () => {
  it('extends campaign quests through Acts 5–8', () => {
    expect(QUESTS.some((q) => q.id === 'clear-act-5')).toBe(true);
    expect(QUESTS.some((q) => q.id === 'clear-act-8')).toBe(true);
    expect(QUESTS.filter((q) => q.kind === 'mid').length).toBeGreaterThanOrEqual(4);
  });

  it('rotates daily quests and claims rewards', () => {
    const game = new Game(memoryStorage(), mulberry32(4));
    game.pickClass('Ranger');
    const q = dailyQuestForDay(0);
    game.save.daily.questId = q.id;
    game.save.daily.stages = 10;
    game.save.daily.dungeons = 10;
    game.save.daily.salvage = 10;
    game.save.daily.clan = 10;
    game.save.daily.fullLoadout = 10;
    game.save.daily.claimed = false;
    expect(game.dailyReady()).toBe(true);
    const before = game.save.crystals;
    expect(game.claimDaily()).toBe(true);
    expect(game.save.crystals).toBeGreaterThan(before);
    expect(game.save.daily.claimed).toBe(true);
  });
});

describe('season milestones', () => {
  it('claims clear-act / wins milestones when progress met', () => {
    const game = new Game(memoryStorage(), mulberry32(5));
    game.pickClass('Mage');
    expect(SEASON_MILESTONES.length).toBeGreaterThanOrEqual(5);
    game.save.stagesCleared = 25;
    game.save.clanWins = 10;
    game.save.seasonLoginDays = ['a', 'b', 'c', 'd', 'e'];
    expect(game.claimSeasonMilestone('clear-act-5')).toBeNull();
    expect(game.save.seasonClaimed).toContain('clear-act-5');
    expect(game.claimSeasonMilestone('wins-10')).toBeNull();
    expect(game.seasonRemainingMs).toBeGreaterThan(0);
    expect(game.seasonDay).toBeGreaterThanOrEqual(1);
  });
});

describe('pvp replay strip data', () => {
  it('records structured skill and kill events', () => {
    const game = new Game(memoryStorage(), mulberry32(6));
    game.pickClass('Warrior');
    game.save.level = 12;
    game.save.stagesCleared = 15;
    let saw: { t: string; skillName?: string; target?: string }[] = [];
    game.on((e) => {
      if (e.t === 'pvp') saw = e.result.log;
    });
    expect(game.queuePractice4v4()).toBeNull();
    game.finishPvpPlayback();
    const castOrKill = saw.filter((e) => e.t === 'skill' || e.t === 'kill');
    expect(castOrKill.length).toBeGreaterThan(0);
    expect(castOrKill.some((e) => e.t === 'skill' && !!e.skillName)).toBe(true);
    expect(castOrKill.some((e) => e.t === 'kill' && !!e.target)).toBe(true);
  });
});
