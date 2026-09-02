import { describe, expect, it } from 'vitest';
import { parseActivityState, serializeActivityState, withActivityState } from '../src/state';

describe('activity URL state', () => {
  it('uses safe defaults for invalid parameters', () => {
    expect(parseActivityState('?window=year&attention=CRITICAL&repositoryId=nope&sort=random')).toMatchObject({
      window: '7d',
      attention: 'ALL',
      repositoryId: null,
      limit: 25,
      sort: 'recent',
    });
  });

  it('parses valid filters', () => {
    expect(parseActivityState('?window=24h&attention=HIGH&repositoryId=202&fixture=normal&q=checkout&favorites=1&sort=attention')).toMatchObject({
      window: '24h',
      attention: 'HIGH',
      repositoryId: 202,
      fixture: 'normal',
      query: 'checkout',
      favoritesOnly: true,
      sort: 'attention',
    });
  });

  it('resolves absent URL values from saved defaults', () => {
    expect(parseActivityState('', { defaultWindow: '24h', defaultRepositoryId: 303 })).toMatchObject({
      window: '24h',
      repositoryId: 303,
      repositorySelection: { kind: 'absent' },
      sort: 'recent',
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
    const value = serializeActivityState({ window: '30d', attention: 'MEDIUM', repositoryId: 303, repositorySelection: { kind: 'repository', id: 303 }, fixture: 'error', query: 'deploy', favoritesOnly: true, sort: 'repository' });
    const parsed = parseActivityState(`?${value}`);
    expect(parsed).toMatchObject({ window: '30d', attention: 'MEDIUM', repositoryId: 303, fixture: 'error', query: 'deploy', favoritesOnly: true, sort: 'repository' });
  });

  it('omits the default recent sort while persisting alternate sorts', () => {
    const recent = serializeActivityState(parseActivityState('?sort=recent'));
    expect(recent).not.toContain('sort=');
    const evaluations = serializeActivityState(parseActivityState('?sort=evaluations'));
    expect(evaluations).toContain('sort=evaluations');
  });

  it('clears pagination when filters change', () => {
    const next = withActivityState({ window: '7d', attention: 'ALL', repositoryId: null, cursor: 'cursor', limit: 25 }, { attention: 'LOW' });
    expect(next.cursor).toBeNull();
    expect(next.attention).toBe('LOW');
  });

  it('clears pagination when sort changes', () => {
    const next = withActivityState({ window: '7d', attention: 'ALL', repositoryId: null, cursor: 'cursor', limit: 25, sort: 'recent' }, { sort: 'attention' });
    expect(next.cursor).toBeNull();
    expect(next.sort).toBe('attention');
  });

  it('serializes a user-selected All repositories override', () => {
    const current = parseActivityState('', { defaultWindow: '7d', defaultRepositoryId: 303 });
    const next = withActivityState(current, { repositorySelection: { kind: 'all' } });
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

  it('preserves attention/query/favorites/sort when window or repository changes (dashboard parity, R4.1)', () => {
    const base = parseActivityState('?window=7d&attention=HIGH&repositoryId=202&fixture=normal&q=checkout&favorites=1&sort=evaluations');
    expect(withActivityState(base, { window: '24h' })).toMatchObject({ window: '24h', attention: 'HIGH', repositoryId: 202, query: 'checkout', favoritesOnly: true, sort: 'evaluations' });
    expect(withActivityState(base, { repositorySelection: { kind: 'all' } })).toMatchObject({ window: '7d', attention: 'HIGH', query: 'checkout', favoritesOnly: true, sort: 'evaluations' });
    const toRepository = withActivityState(base, { repositorySelection: { kind: 'repository', id: 303 } });
    expect(toRepository).toMatchObject({ attention: 'HIGH', query: 'checkout', favoritesOnly: true, sort: 'evaluations' });
    expect(toRepository.repositorySelection).toEqual({ kind: 'repository', id: 303 });
  });

  it('round-trips filters through serialize/parse without losing them (R4.3)', () => {
    const value = serializeActivityState(parseActivityState('?window=24h&attention=HIGH&repositoryId=101&fixture=abnormal&q=deploy&favorites=1&sort=repository'));
    expect(value).toContain('window=24h');
    expect(value).toContain('attention=HIGH');
    expect(value).toContain('repositoryId=101');
    expect(value).toContain('fixture=abnormal');
    expect(value).toContain('q=deploy');
    expect(value).toContain('favorites=1');
    expect(value).toContain('sort=repository');
  });

  it('does not read cursor/limit from the URL and never re-serializes them (pagination is not URL-owned, D2/R4.2)', () => {
    const parsed = parseActivityState('?window=7d&attention=HIGH&cursor=opaque-cursor&limit=40&sort=attention');
    expect(parsed.cursor).toBeNull();
    expect(parsed.limit).toBe(40);
    expect(parsed.sort).toBe('attention');
    const value = serializeActivityState(parsed);
    expect(value).not.toContain('cursor=');
    expect(value).not.toContain('limit=');
    expect(value).toContain('sort=attention');
  });

  it('serializes repository selection for absent / all / repository (R5.3)', () => {
    const defaults = { defaultWindow: '7d' as const, defaultRepositoryId: 303 };
    const absent = serializeActivityState(parseActivityState('', defaults));
    expect(absent).not.toContain('repositoryId=');
    expect(parseActivityState(`?${absent}`, defaults).repositoryId).toBe(303);
    expect(serializeActivityState(parseActivityState('?repositoryId=all', defaults))).toContain('repositoryId=all');
    expect(serializeActivityState(parseActivityState('?repositoryId=202', defaults))).toContain('repositoryId=202');
  });
});
