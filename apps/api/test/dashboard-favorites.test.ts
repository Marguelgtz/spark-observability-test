import { describe, expect, it, vi } from 'vitest';
import { D1DashboardFavoriteStore, favoriteKey } from '../src/dashboard-favorites';
import type { D1AllResult, D1Database, D1PreparedStatement, D1Result } from '../src/d1';

function database(options: { rows?: unknown[]; changes?: number; first?: unknown } = {}) {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const prepare = vi.fn((query: string): D1PreparedStatement => {
    const call = { query, values: [] as unknown[] };
    calls.push(call);
    const statement: D1PreparedStatement = {
      bind: (...values: unknown[]) => {
        call.values = values;
        return statement;
      },
      run: async (): Promise<D1Result> => ({ meta: { changes: options.changes ?? 1 } }),
      first: async <T>(): Promise<T | null> => (options.first ?? null) as T | null,
      all: async <T>(): Promise<D1AllResult<T>> => ({ results: (options.rows ?? []) as T[] }),
    };
    return statement;
  });
  return { db: { prepare, batch: vi.fn() } as unknown as D1Database, calls };
}

describe('D1 dashboard favorites', () => {
  it('maps viewer-scoped rows back to API favorite identities', async () => {
    const fake = database({ rows: [
      { kind: 'PULL_REQUEST', repositoryId: 2, pullRequestNumber: 3, runId: null, headSha: null },
      { kind: 'EVALUATION_RUN', repositoryId: 2, pullRequestNumber: 3, runId: 'run:1', headSha: 'abc1234' },
    ] });
    const store = new D1DashboardFavoriteStore(fake.db);

    await expect(store.list(7, [2, 4])).resolves.toEqual({
      version: 1,
      favorites: [
        { kind: 'pull-request', repositoryId: 2, pullRequestNumber: 3 },
        { kind: 'evaluation', repositoryId: 2, pullRequestNumber: 3, runId: 'run:1', headSha: 'abc1234' },
      ],
    });
    expect(fake.calls[0].values).toEqual([7, '[2,4]']);
  });

  it('binds a large repository scope as one JSON value', async () => {
    const fake = database();
    const store = new D1DashboardFavoriteStore(fake.db);
    const repositoryIds = Array.from({ length: 250 }, (_, index) => index + 1);

    await store.list(7, repositoryIds);

    expect(fake.calls[0].query).toContain('json_each(?)');
    expect(fake.calls[0].values).toEqual([7, JSON.stringify(repositoryIds)]);
  });

  it('uses immutable run identity for same-SHA evaluation favorites', async () => {
    const fake = database();
    const store = new D1DashboardFavoriteStore(fake.db);
    const first = { kind: 'evaluation' as const, repositoryId: 2, pullRequestNumber: 3, runId: 'run:1', headSha: 'abc1234' };
    const second = { ...first, runId: 'run:2' };

    expect(favoriteKey(first)).not.toBe(favoriteKey(second));
    await expect(store.add(7, first)).resolves.toBe(true);
    expect(fake.calls[0].query).toContain('FROM evaluation_runs');
    expect(fake.calls[0].values).toEqual([7, favoriteKey(first), 'run:1', 2, 3, 'abc1234']);
  });

  it('removes only the authenticated viewer and exact favorite key', async () => {
    const fake = database();
    const store = new D1DashboardFavoriteStore(fake.db);
    const favorite = { kind: 'pull-request' as const, repositoryId: 2, pullRequestNumber: 3 };

    await store.remove(7, favorite);
    expect(fake.calls[0].values).toEqual([7, favoriteKey(favorite)]);
  });
});
