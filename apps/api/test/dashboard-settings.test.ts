import { describe, expect, it, vi } from 'vitest';
import { D1DashboardSettingsStore } from '../src/dashboard-settings';
import type { D1Database, D1PreparedStatement } from '../src/d1';

const row = {
  revision: 3,
  defaultWindow: '24h',
  previewSize: 10,
  density: 'COMPACT',
  collapseSecondarySections: 0,
  defaultRepositoryId: 2,
  updatedAt: '2026-08-29T12:00:00.000Z',
};

function database(firstResults: unknown[]) {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const prepare = vi.fn((query: string): D1PreparedStatement => {
    const call = { query, values: [] as unknown[] };
    calls.push(call);
    const statement: D1PreparedStatement = {
      bind: (...values: unknown[]) => {
        call.values = values;
        return statement;
      },
      first: async <T>() => (firstResults.shift() ?? null) as T | null,
      run: async () => ({ meta: { changes: 1 } }),
      all: async () => ({ results: [] }),
    };
    return statement;
  });
  return { db: { prepare, batch: vi.fn() } as unknown as D1Database, calls };
}

const input = {
  defaultWindow: '24h' as const,
  previewSize: 10 as const,
  density: 'COMPACT' as const,
  collapseSecondarySections: false,
  defaultRepositoryId: 2,
};

describe('D1 dashboard settings', () => {
  it('returns no persisted row without creating one', async () => {
    const fake = database([null]);
    await expect(new D1DashboardSettingsStore(fake.db).get(7)).resolves.toBeUndefined();
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].query).toContain('SELECT');
    expect(fake.calls[0].values).toEqual([7]);
  });

  it('inserts revision one only when the expected revision is zero', async () => {
    const fake = database([{ ...row, revision: 1 }]);
    await expect(new D1DashboardSettingsStore(fake.db).replace(7, 0, input)).resolves.toMatchObject({
      version: 1,
      revision: 1,
      ...input,
    });
    expect(fake.calls[0].query).toContain('ON CONFLICT(github_user_id) DO NOTHING');
    expect(fake.calls[0].query).toContain('RETURNING');
    expect(fake.calls[0].values).toEqual([7, '24h', 10, 'COMPACT', 0, 2]);
  });

  it('updates through an atomic revision predicate and reports conflicts', async () => {
    const success = database([row]);
    await expect(new D1DashboardSettingsStore(success.db).replace(7, 2, input)).resolves.toMatchObject({
      revision: 3,
      collapseSecondarySections: false,
    });
    expect(success.calls[0].query).toContain('revision = revision + 1');
    expect(success.calls[0].query).toContain('github_user_id = ? AND revision = ?');
    expect(success.calls[0].values).toEqual(['24h', 10, 'COMPACT', 0, 2, 7, 2]);

    const conflict = database([null]);
    await expect(new D1DashboardSettingsStore(conflict.db).replace(7, 2, input)).resolves.toBeUndefined();
  });
});
