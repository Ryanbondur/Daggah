import { describe, expect, it } from 'vitest';
import { matchCpBandForQueue } from './clanBrackets';
import {
  LIVE_QUEUE_FALLBACK_S,
  bandForTicket,
  matchBandLabelForPair,
  ticketsCompatible,
  type MatchTicketSnap,
} from './matchmaking';

function ticket(partial: Partial<MatchTicketSnap> & Pick<MatchTicketSnap, 'userId' | 'clanCode'>): MatchTicketSnap {
  return {
    avgCp: 1000,
    teamCp: 4000,
    bracket: 'veteran',
    atTop: false,
    waitS: 0,
    ...partial,
  };
}

describe('live 4v4 matchmaking bands', () => {
  it('rejects same user or same clan', () => {
    const a = ticket({ userId: 'u1', clanCode: 'AAAA' });
    expect(ticketsCompatible(a, ticket({ userId: 'u1', clanCode: 'BBBB' }))).toBe(false);
    expect(ticketsCompatible(a, ticket({ userId: 'u2', clanCode: 'AAAA' }))).toBe(false);
  });

  it('requires the same bracket pool', () => {
    const a = ticket({ userId: 'u1', clanCode: 'AAAA', bracket: 'scout' });
    const b = ticket({ userId: 'u2', clanCode: 'BBBB', bracket: 'veteran' });
    expect(ticketsCompatible(a, b)).toBe(false);
  });

  it('matches close CP at tight band and rejects far CP until wait widens', () => {
    const a = ticket({ userId: 'u1', clanCode: 'AAAA', avgCp: 1000, waitS: 0 });
    const near = ticket({ userId: 'u2', clanCode: 'BBBB', avgCp: 1050, waitS: 0 });
    // 1200 is outside tight ±8% and standard ±15%, inside wide ±25%.
    const far = ticket({ userId: 'u3', clanCode: 'CCCC', avgCp: 1200, waitS: 0 });
    expect(ticketsCompatible(a, near)).toBe(true);
    expect(ticketsCompatible(a, far)).toBe(false);
    expect(ticketsCompatible({ ...a, waitS: 10 }, { ...far, waitS: 10 })).toBe(false);

    // ±25% at 20s wait covers 1200 vs 1000 both ways.
    expect(ticketsCompatible({ ...a, waitS: 20 }, { ...far, waitS: 20 })).toBe(true);
  });

  it('uses Nightscar wider start via atTop', () => {
    const band = bandForTicket({ waitS: 0, atTop: true });
    expect(band.id).toBe(matchCpBandForQueue(0, { atTopOfLadder: true }).id);
    expect(band.id).toBe('standard');
  });

  it('labels the sealing band from the wider wait', () => {
    const a = ticket({ userId: 'u1', clanCode: 'AAAA', waitS: 5 });
    const b = ticket({ userId: 'u2', clanCode: 'BBBB', waitS: 25 });
    const label = matchBandLabelForPair(a, b);
    expect(label.toLowerCase()).toContain('wide');
  });

  it('falls back to AI practice after the 30s meter', () => {
    expect(LIVE_QUEUE_FALLBACK_S).toBe(30);
  });
});
