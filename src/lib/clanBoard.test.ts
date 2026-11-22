import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as boardGet } from '../../api/_lib/clanBoardApi';
import {
  clanSeasonScore,
  extractSeasonReport,
  listClanResults,
  rankClanRows,
  upsertSeasonReport,
} from '../../api/_lib/clanBoard';
import { PUT as savePut } from '../../api/_lib/saveApi';
import { ACCOUNT_CODE_HEADER } from './owner';
import { sql } from './db';
import { resetPgliteForTests } from './dbPglite';
import { mergePlayerOntoBoard } from '../game/clanBoardClient';
import { clanSeasonScore as clientScore } from '../game/clan';

function validAccountCode(body = 'abcdefghijklmnopqrstuvwx'): string {
  let h = 2166136261;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const sum = (h >>> 0).toString(36);
  return `DGAC.${body}.${sum}`;
}

function sampleSave(overrides: Record<string, unknown> = {}) {
  return {
    version: 3,
    heroClass: 'Warrior',
    classPicked: true,
    level: 12,
    xp: 0,
    savedAt: 1_700_000_100_000,
    clanWins: 4,
    clanLosses: 1,
    clanTokens: 85,
    season: { seasonId: 1, startedAt: 1_700_000_000_000 },
    clan: {
      id: 'clan_test',
      name: 'Ashwardens',
      code: 'ASH7',
      members: [
        { id: 'p1', name: 'You', heroClass: 'Warrior', role: 'leader', isPlayer: true, isAi: false },
        { id: 'a1', name: 'Bot', heroClass: 'Mage', role: 'member', isPlayer: false, isAi: true },
        { id: 'a2', name: 'Bot2', heroClass: 'Ranger', role: 'member', isPlayer: false, isAi: true },
        { id: 'a3', name: 'Bot3', heroClass: 'Rogue', role: 'member', isPlayer: false, isAi: true },
      ],
    },
    ...overrides,
  };
}

describe('clan season leaderboard (DG-120)', () => {
  beforeEach(() => {
    resetPgliteForTests();
    process.env.CURSOR_APP_ID = 'daggah-test';
    process.env.CURSOR_APP_IDENTITY_ISSUER = 'https://example.invalid';
  });

  afterEach(() => {
    resetPgliteForTests();
    delete process.env.CURSOR_APP_ID;
    delete process.env.CURSOR_APP_IDENTITY_ISSUER;
  });

  it('keeps client and server score formulas identical', () => {
    expect(clanSeasonScore(5, 2, 40, 8)).toBe(clientScore(5, 2, 40, 8));
    expect(clanSeasonScore(0, 10, 0, 4)).toBe(clientScore(0, 10, 0, 4));
  });

  it('extracts season report from save payloads', () => {
    const report = extractSeasonReport(sampleSave() as Record<string, unknown>);
    expect(report).toEqual({
      seasonId: 1,
      clanCode: 'ASH7',
      clanName: 'Ashwardens',
      wins: 4,
      losses: 1,
      tokens: 85,
      members: 4,
    });
    expect(extractSeasonReport(sampleSave({ clan: null }) as Record<string, unknown>)?.clanCode).toBeNull();
  });

  it('upserts season_stats + clan_results and ranks the board', async () => {
    await upsertSeasonReport('ac:test1', {
      seasonId: 1,
      clanCode: 'ASH7',
      clanName: 'Ashwardens',
      wins: 4,
      losses: 1,
      tokens: 85,
      members: 4,
    });
    await upsertSeasonReport('ac:test2', {
      seasonId: 1,
      clanCode: 'RIME',
      clanName: 'Rime Circle',
      wins: 8,
      losses: 0,
      tokens: 120,
      members: 6,
    });

    const cols = await sql<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'clan_results' and column_name = any($1)
       order by column_name`,
      [['clan_name', 'members', 'tokens']],
    );
    expect(cols.map((c) => c.column_name)).toEqual(['clan_name', 'members', 'tokens']);

    const rows = await listClanResults(1);
    expect(rows).toHaveLength(2);
    const ranked = rankClanRows(rows, 'ASH7');
    expect(ranked[0]!.name).toBe('Rime Circle');
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[1]!.isPlayer).toBe(true);
    expect(ranked[1]!.score).toBe(clanSeasonScore(4, 1, 85, 4));
  });

  it('GET /api/daggah-clan-board returns live standings', async () => {
    await upsertSeasonReport('ac:board', {
      seasonId: 2,
      clanCode: 'VOID',
      clanName: 'Void Lark',
      wins: 3,
      losses: 2,
      tokens: 50,
      members: 5,
    });

    const res = await boardGet(
      new Request('http://localhost/api/daggah-clan-board?seasonId=2&code=VOID'),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      source: string;
      seasonId: number;
      entries: Array<{ name: string; isPlayer: boolean; rank: number }>;
    };
    expect(body.source).toBe('live');
    expect(body.seasonId).toBe(2);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]!.name).toBe('Void Lark');
    expect(body.entries[0]!.isPlayer).toBe(true);
    expect(body.entries[0]!.rank).toBe(1);
  });

  it('cloud save PUT publishes clan standings', async () => {
    const code = validAccountCode('clanboardpublishbody01');
    const put = await savePut(
      new Request('http://localhost/api/daggah-save', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          [ACCOUNT_CODE_HEADER]: code,
        },
        body: JSON.stringify(sampleSave({ savedAt: 200 })),
      }),
    );
    expect(put.status).toBe(204);

    const board = await boardGet(
      new Request('http://localhost/api/daggah-clan-board?seasonId=1&code=ASH7'),
    );
    const body = (await board.json()) as {
      entries: Array<{ name: string; wins: number; isPlayer: boolean }>;
    };
    expect(body.entries.some((e) => e.name === 'Ashwardens' && e.wins === 4 && e.isPlayer)).toBe(
      true,
    );
  });

  it('mergePlayerOntoBoard inserts or upgrades the local clan', () => {
    const merged = mergePlayerOntoBoard(
      [
        {
          rank: 1,
          name: 'Rivals',
          score: 500,
          wins: 5,
          members: 4,
          isPlayer: false,
          code: 'RIV1',
        },
      ],
      { name: 'Mine', code: 'MINE', wins: 9, losses: 0, tokens: 10, members: 4 },
    );
    expect(merged[0]!.isPlayer).toBe(true);
    expect(merged[0]!.name).toBe('Mine');
    expect(merged).toHaveLength(2);
  });
});
