import { describe, expect, it } from 'vitest';
import {
  claimApiErrorAnnounce,
  friendlyApiError,
  isNetworkFailure,
  isRateLimitFailure,
  resetApiErrorAnnounceForTests,
  shouldAnnounceApiFailure,
} from './apiErrors';

describe('apiErrors', () => {
  it('throttles repeated announce claims', () => {
    resetApiErrorAnnounceForTests();
    expect(claimApiErrorAnnounce('leaderboard', 60_000)).toBe(true);
    expect(claimApiErrorAnnounce('leaderboard', 60_000)).toBe(false);
    expect(claimApiErrorAnnounce('clan-sync', 60_000)).toBe(true);
  });

  it('detects rate limits from code or status', () => {
    expect(isRateLimitFailure('rate_limited')).toBe(true);
    expect(isRateLimitFailure('http 429')).toBe(true);
    expect(isRateLimitFailure({ status: 429 })).toBe(true);
    expect(isRateLimitFailure({ error: 'not_found', status: 404 })).toBe(false);
  });

  it('detects network failures', () => {
    expect(isNetworkFailure('network')).toBe(true);
    expect(isNetworkFailure('unreachable')).toBe(true);
    expect(isNetworkFailure({ status: 0, error: 'network' })).toBe(true);
    expect(isNetworkFailure({ status: 503, error: 'database_unavailable' })).toBe(false);
  });

  it('writes clear rate-limit copy per surface', () => {
    expect(friendlyApiError({ error: 'rate_limited', surface: 'match' })).toMatch(/Matchmaking.*rate-limited/i);
    expect(friendlyApiError({ status: 429, surface: 'leaderboard' })).toMatch(/Leaderboard.*rate-limited/i);
    expect(friendlyApiError({ error: 'rate_limited', surface: 'clan' })).toMatch(/Clan hall.*rate-limited/i);
  });

  it('writes clear network copy', () => {
    expect(friendlyApiError({ error: 'network', surface: 'clan' })).toMatch(/unreachable/i);
    expect(friendlyApiError('unreachable')).toMatch(/unreachable/i);
  });

  it('passes through human sentences and softens snake_case', () => {
    expect(friendlyApiError('No clan with that code.')).toBe('No clan with that code.');
    expect(friendlyApiError('not_found')).toBe('not found');
  });

  it('announces rate-limit and network only', () => {
    expect(shouldAnnounceApiFailure({ status: 429, error: 'rate_limited' })).toBe(true);
    expect(shouldAnnounceApiFailure({ status: 0, error: 'network' })).toBe(true);
    expect(shouldAnnounceApiFailure({ status: 404, error: 'not_found' })).toBe(false);
  });
});
