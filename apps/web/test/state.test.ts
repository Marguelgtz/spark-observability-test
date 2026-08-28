import { describe, expect, it } from 'vitest';
import { parseActivityState, serializeActivityState, withActivityState } from '../src/state';

describe('activity URL state', () => {
  it('uses safe defaults for invalid parameters', () => {
    expect(parseActivityState('?window=year&attention=CRITICAL&repositoryId=nope')).toMatchObject({
      window: '7d',
      attention: 'ALL',
      repositoryId: null,
      limit: 25
    });
  });

  it('parses valid filters', () => {
    expect(parseActivityState('?window=24h&attention=HIGH&repositoryId=202&fixture=normal&q=checkout&favorites=1')).toMatchObject({
      window: '24h',
      attention: 'HIGH',
      repositoryId: 202,
      fixture: 'normal',
      query: 'checkout',
      favoritesOnly: true,
    });
  });

  it('serializes refresh-safe filter state', () => {
    const value = serializeActivityState({ window: '30d', attention: 'MEDIUM', repositoryId: 303, fixture: 'error', query: 'deploy', favoritesOnly: true });
    const parsed = parseActivityState(`?${value}`);
    expect(parsed).toMatchObject({ window: '30d', attention: 'MEDIUM', repositoryId: 303, fixture: 'error', query: 'deploy', favoritesOnly: true });
  });

  it('clears pagination when filters change', () => {
    const next = withActivityState({ window: '7d', attention: 'ALL', repositoryId: null, cursor: 'cursor', limit: 25 }, { attention: 'LOW' });
    expect(next.cursor).toBeNull();
    expect(next.attention).toBe('LOW');
  });
});
