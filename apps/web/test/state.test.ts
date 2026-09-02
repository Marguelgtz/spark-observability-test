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

  it('resolves absent URL values from saved defaults', () => {
    expect(parseActivityState('', { defaultWindow: '24h', defaultRepositoryId: 303 })).toMatchObject({
      window: '24h',
      repositoryId: 303,
      repositorySelection: { kind: 'absent' },
    });
  });

  it('keeps explicit all and concrete repositories distinct', () => {
    const defaults = { defaultWindow: '7d' as const, defaultRepositoryId: 303 };
    const all = parseActivityState('?repositoryId=all', defaults);
    expect(all).toMatchObject({ repositoryId: null, repositorySelection: { kind: 'all' } });
    expect(serializeActivityState(all)).toContain('repositoryId=all');

    expect(parseActivityState('?window=30d&repositoryId=202', defaults)).toMatchObject({
      window: '30d',
      repositoryId: 202,
      repositorySelection: { kind: 'repository', id: 202 },
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

  it('serializes a user-selected All repositories override', () => {
    const current = parseActivityState('', { defaultWindow: '7d', defaultRepositoryId: 303 });
    const next = withActivityState(current, { repositoryId: null });
    expect(next.repositorySelection).toEqual({ kind: 'all' });
    expect(serializeActivityState(next)).toContain('repositoryId=all');
  });

  it('preserves an absent repository selection while another filter changes', () => {
    const defaults = { defaultWindow: '7d' as const, defaultRepositoryId: 303 };
    const current = parseActivityState('', defaults);
    const search = serializeActivityState(withActivityState(current, { window: '30d' }));
    expect(search).not.toContain('repositoryId=');
    expect(parseActivityState(`?${search}`, defaults).repositoryId).toBe(303);
  });
});
