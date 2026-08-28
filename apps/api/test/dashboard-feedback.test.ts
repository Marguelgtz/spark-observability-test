import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { D1DashboardFeedbackStore } from '../src/dashboard-feedback';
import type { D1Database, D1PreparedStatement, D1Result } from '../src/d1';

type SqlValue = string | number | bigint | Uint8Array | null;

function migration(name: string): string {
  return readFileSync(resolve(process.cwd(), 'apps/api/migrations', name), 'utf8');
}

function sqliteD1(database: DatabaseSync): D1Database {
  return {
    prepare(query: string): D1PreparedStatement {
      const prepared = database.prepare(query);
      let values: SqlValue[] = [];
      const statement: D1PreparedStatement = {
        bind(...next: unknown[]) { values = next as SqlValue[]; return statement; },
        async run() {
          const result = prepared.run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
        async first<T>() { return (prepared.get(...values) as T | undefined) ?? null; },
        async all<T>() { return { results: prepared.all(...values) as T[] }; },
      };
      return statement;
    },
    async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
      const results: D1Result[] = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
}

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(migration('0001_initial.sql'));
  db.exec(migration('0003_dashboard_accounts.sql'));
  db.exec(migration('0008_trajectory_feedback.sql'));
  db.exec("INSERT INTO installations (id, account_id, account_login) VALUES (1, 7, 'acme')");
  db.exec("INSERT INTO repositories (id, installation_id, full_name) VALUES (2, 1, 'acme/repo')");
  db.exec("INSERT INTO dashboard_users (github_user_id, login, avatar_url) VALUES (7, 'marguel', 'https://avatars.test/7'), (8, 'other', 'https://avatars.test/8')");
  return db;
}

describe('D1 trajectory feedback persistence', () => {
  it('upserts one viewer-private record per transition', async () => {
    const db = database();
    try {
      const store = new D1DashboardFeedbackStore(sqliteD1(db));
      const first = await store.save(7, 2, 3, 'run:1:run:2', { classification: 'USEFUL', note: 'Found the failure quickly.' });
      const updated = await store.save(7, 2, 3, 'run:1:run:2', { classification: 'FIXED_BECAUSE_SPARK' });
      await store.save(8, 2, 3, 'run:1:run:2', { classification: 'EXPECTED' });

      expect(first).toMatchObject({ classification: 'USEFUL', note: 'Found the failure quickly.' });
      expect(updated).toMatchObject({ classification: 'FIXED_BECAUSE_SPARK' });
      expect(updated.note).toBeUndefined();
      expect(await store.list(7, 2, 3)).toEqual([updated]);
      expect(await store.list(8, 2, 3)).toEqual([expect.objectContaining({ classification: 'EXPECTED' })]);
      expect(db.prepare('SELECT COUNT(*) AS count FROM trajectory_feedback').get()).toEqual({ count: 2 });
    } finally {
      db.close();
    }
  });

  it('enforces the note bound in persistence', async () => {
    const db = database();
    try {
      const store = new D1DashboardFeedbackStore(sqliteD1(db));
      await expect(store.save(7, 2, 3, 'run:1:run:2', {
        classification: 'FALSE_POSITIVE',
        note: 'x'.repeat(501),
      })).rejects.toThrow();
      await expect(store.save(7, 2, 3, 'x'.repeat(1025), {
        classification: 'USEFUL',
      })).rejects.toThrow();
      expect(db.prepare('SELECT COUNT(*) AS count FROM trajectory_feedback').get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });
});
