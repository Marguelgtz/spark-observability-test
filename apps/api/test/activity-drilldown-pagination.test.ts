import { describe, expect, it } from 'vitest';
import type { D1Database } from '../src/d1';
import { InvalidOverviewCursorError, readActivityDrilldown } from '../src/activity-drilldown';

function row(number: number, evaluatedAt: string) {
  return {
    repository_id: 2,
    full_name: 'acme/repo',
    head_sha: `sha-${number}`,
    pull_request_number: number,
    attention: 'LOW' as const,
    evaluated_at: evaluatedAt,
    normalized_json: null,
    check_url: null,
    run_id: `run-${number}`,
    observation_source: 'LIVE' as const,
    evidence_health: 'CLEAR' as const,
    created_at: evaluatedAt,
    run_count: 1,
    low_count: 1,
    medium_count: 0,
    high_count: 0,
    total_count: 4,
  };
}

describe('overview cursor pagination', () => {
  it('returns an opaque metric-bound cursor while preserving the exact total', async () => {
    const statements: Array<{ query: string; bindings: unknown[] }> = [];
    const pageRows = [
      row(4, '2026-08-28T12:00:00.000Z'),
      row(3, '2026-08-28T11:00:00.000Z'),
      row(2, '2026-08-28T10:00:00.000Z'),
    ];
    const db = {
      prepare(query: string) {
        const record = { query, bindings: [] as unknown[] };
        statements.push(record);
        const statement = {
          bind(...values: unknown[]) { record.bindings = values; return statement; },
          async all() { return { results: query.includes('SELECT * FROM base') ? pageRows : [] }; },
          async first() { return null; },
          async run() { return { meta: { changes: 0 } }; },
        };
        return statement;
      },
      async batch() { return []; },
    } as unknown as D1Database;

    const response = await readActivityDrilldown(db, {
      metric: 'pull-requests',
      window: '7d',
      repositoryIds: [2],
      repositoryId: null,
      start: '2026-08-22T00:00:00.000Z',
      now: new Date('2026-08-29T00:00:00.000Z'),
      limit: 2,
    });

    expect(response.total).toBe(4);
    expect(response.items).toHaveLength(2);
    expect(response.pagination.nextCursor).toEqual(expect.any(String));
    expect(response.pagination.nextCursor).not.toContain('2026-08-28');
    expect(response.truncated).toBe(true);
    const listStatement = statements.find((statement) => statement.query.includes('SELECT * FROM base'))!;
    expect(listStatement.bindings.at(-1)).toBe(3);

    await expect(readActivityDrilldown(db, {
      metric: 'evaluations',
      window: '7d',
      repositoryIds: [2],
      repositoryId: null,
      start: '2026-08-22T00:00:00.000Z',
      now: new Date('2026-08-29T00:00:00.000Z'),
      cursor: response.pagination.nextCursor,
      limit: 2,
    })).rejects.toBeInstanceOf(InvalidOverviewCursorError);
  });
});
