import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { EvaluationObservationRecord, PullRequestLifecycleRecord } from '../src/contracts';
import { D1SparkStore, type D1Database, type D1PreparedStatement, type D1Result } from '../src/d1';
import type { StoredEvaluationDetailV1 } from '../src/evaluation-detail';

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
        bind(...next: unknown[]) {
          values = next as SqlValue[];
          return statement;
        },
        async run() {
          const result = prepared.run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
        async first<T>() {
          return (prepared.get(...values) as T | undefined) ?? null;
        },
        async all<T>() {
          return { results: prepared.all(...values) as T[] };
        },
      };
      return statement;
    },
    async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
      database.exec('BEGIN');
      try {
        const results: D1Result[] = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function observation(
  id: string,
  deliveryId: string,
  evaluatedAt: string,
  evidenceHealth: 'PENDING_OR_MISSING' | 'FAILED' | 'CLEAR',
  attention: 'LOW' | 'MEDIUM' | 'HIGH',
): EvaluationObservationRecord {
  const normalized = {
    version: 1,
    testEvidenceHealth: evidenceHealth,
  } as unknown as StoredEvaluationDetailV1;
  const checkRunId = Number(id.slice(-1)) + 100;
  return {
    run: {
      id,
      idempotencyKey: `github:${deliveryId}`,
      repositoryId: 2,
      installationId: 1,
      pullRequestNumber: 3,
      headSha: 'same-sha',
      baseSha: 'base-sha',
      checkRunId,
      trigger: { event: 'check_run', action: 'completed', deliveryId },
      observationSource: 'LIVE',
      schemaVersion: 1,
      evaluatorVersion: 'deterministic-v1',
      evaluatedAt,
      attention,
      evidenceHealth,
      normalized,
      truncated: false,
    },
    evaluation: {
      repositoryId: 2,
      installationId: 1,
      pullRequestNumber: 3,
      headSha: 'same-sha',
      checkRunId,
      attention,
    },
    detail: {
      repositoryId: 2,
      headSha: 'same-sha',
      schemaVersion: 1,
      baseSha: 'base-sha',
      pullRequestTitle: 'Exercise same-SHA history',
      pullRequestUrl: 'https://github.com/acme/repo/pull/3',
      evaluatorVersion: 'deterministic-v1',
      evaluatedAt,
      checkUrl: `https://github.com/acme/repo/runs/${checkRunId}`,
      normalized,
      truncated: false,
    },
  };
}

function lifecycle(
  state: PullRequestLifecycleRecord['state'],
  occurredAt: string,
  patch: Partial<PullRequestLifecycleRecord> = {},
): PullRequestLifecycleRecord {
  return {
    repositoryId: 2,
    installationId: 1,
    repositoryFullName: 'acme/repo',
    pullRequestNumber: 3,
    state,
    occurredAt,
    ...patch,
  };
}

describe('D1 observation persistence', () => {
  it('retains three same-SHA runs and advances both current projections atomically', async () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(migration('0001_initial.sql'));
      database.exec(migration('0002_evaluation_details.sql'));
      database.exec(migration('0004_evaluation_runs.sql'));
      database.exec(migration('0007_pull_request_lifecycle.sql'));
      database.exec("INSERT INTO installations (id, account_id, account_login) VALUES (1, 7, 'acme')");
      database.exec("INSERT INTO repositories (id, installation_id, full_name) VALUES (2, 1, 'acme/repo')");

      const store = new D1SparkStore(sqliteD1(database));
      await store.saveEvaluationObservation(observation('run-1', 'delivery-1', '2026-08-28T10:00:00.000Z', 'PENDING_OR_MISSING', 'MEDIUM'));
      await store.saveEvaluationObservation(observation('run-2', 'delivery-2', '2026-08-28T10:05:00.000Z', 'FAILED', 'HIGH'));
      await store.saveEvaluationObservation(observation('run-3', 'delivery-3', '2026-08-28T10:10:00.000Z', 'CLEAR', 'LOW'));

      const runs = database.prepare(
        'SELECT id, head_sha, evidence_health FROM evaluation_runs ORDER BY evaluated_at ASC',
      ).all() as Array<{ id: string; head_sha: string; evidence_health: string }>;
      expect(runs).toEqual([
        { id: 'run-1', head_sha: 'same-sha', evidence_health: 'PENDING_OR_MISSING' },
        { id: 'run-2', head_sha: 'same-sha', evidence_health: 'FAILED' },
        { id: 'run-3', head_sha: 'same-sha', evidence_health: 'CLEAR' },
      ]);

      expect(database.prepare(
        'SELECT check_run_id, attention FROM evaluations WHERE repository_id = 2 AND head_sha = ?',
      ).get('same-sha')).toEqual({ check_run_id: 103, attention: 'LOW' });
      const detail = database.prepare(
        'SELECT evaluated_at, normalized_json FROM evaluation_details WHERE repository_id = 2 AND head_sha = ?',
      ).get('same-sha') as { evaluated_at: string; normalized_json: string };
      expect(detail.evaluated_at).toBe('2026-08-28T10:10:00.000Z');
      expect(JSON.parse(detail.normalized_json)).toMatchObject({ testEvidenceHealth: 'CLEAR' });

      const invalid = observation('run-4', 'delivery-4', '2026-08-28T10:15:00.000Z', 'FAILED', 'HIGH');
      invalid.run.repositoryId = 999;
      invalid.evaluation.repositoryId = 999;
      invalid.detail.repositoryId = 999;
      await expect(store.saveEvaluationObservation(invalid)).rejects.toThrow();
      expect(database.prepare('SELECT COUNT(*) AS count FROM evaluation_runs').get()).toEqual({ count: 3 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM evaluations').get()).toEqual({ count: 1 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM evaluation_details').get()).toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });

  it('reconciles the latest eligible pre-merge run regardless of webhook arrival order', async () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(migration('0001_initial.sql'));
      database.exec(migration('0002_evaluation_details.sql'));
      database.exec(migration('0004_evaluation_runs.sql'));
      database.exec(migration('0007_pull_request_lifecycle.sql'));
      database.exec("INSERT INTO installations (id, account_id, account_login) VALUES (1, 7, 'acme')");
      database.exec("INSERT INTO repositories (id, installation_id, full_name) VALUES (2, 1, 'acme/repo')");
      const store = new D1SparkStore(sqliteD1(database));

      await store.saveEvaluationObservation(observation('run-1', 'delivery-1', '2026-08-28T10:00:00.000Z', 'CLEAR', 'LOW'));
      const merged = lifecycle('MERGED', '2026-08-28T10:05:00.000Z', {
        openedAt: '2026-08-28T09:00:00.000Z',
        closedAt: '2026-08-28T10:05:00.000Z',
        mergedAt: '2026-08-28T10:05:00.000Z',
        mergeSha: 'merge-sha',
      });
      await store.savePullRequestLifecycle(merged);

      expect(database.prepare(
        `SELECT state, pre_merge_run_id, pre_merge_attention, pre_merge_evidence_health, unresolved_at_merge
         FROM pull_request_lifecycle WHERE repository_id = 2 AND pull_request_number = 3`,
      ).get()).toEqual({
        state: 'MERGED', pre_merge_run_id: 'run-1', pre_merge_attention: 'LOW',
        pre_merge_evidence_health: 'CLEAR', unresolved_at_merge: 0,
      });

      await store.saveEvaluationObservation(observation('run-2', 'delivery-2', '2026-08-28T10:04:00.000Z', 'PENDING_OR_MISSING', 'HIGH'));
      await store.saveEvaluationObservation(observation('run-3', 'delivery-3', '2026-08-28T10:06:00.000Z', 'CLEAR', 'LOW'));
      await store.savePullRequestLifecycle(merged);
      await store.savePullRequestLifecycle(lifecycle('OPEN', '2026-08-28T10:07:00.000Z'));

      expect(database.prepare(
        `SELECT state, merge_sha, pre_merge_run_id, pre_merge_attention,
                pre_merge_evidence_health, unresolved_at_merge
         FROM pull_request_lifecycle WHERE repository_id = 2 AND pull_request_number = 3`,
      ).get()).toEqual({
        state: 'MERGED', merge_sha: 'merge-sha', pre_merge_run_id: 'run-2',
        pre_merge_attention: 'HIGH', pre_merge_evidence_health: 'PENDING_OR_MISSING', unresolved_at_merge: 1,
      });
    } finally {
      database.close();
    }
  });

  it('orders closed and reopened lifecycle updates and supports merge without a prior run', async () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(migration('0001_initial.sql'));
      database.exec(migration('0002_evaluation_details.sql'));
      database.exec(migration('0004_evaluation_runs.sql'));
      database.exec(migration('0007_pull_request_lifecycle.sql'));
      database.exec("INSERT INTO installations (id, account_id, account_login) VALUES (1, 7, 'acme')");
      const store = new D1SparkStore(sqliteD1(database));

      await store.savePullRequestLifecycle(lifecycle('CLOSED', '2026-08-28T10:05:00.000Z', {
        closedAt: '2026-08-28T10:05:00.000Z',
      }));
      await store.savePullRequestLifecycle(lifecycle('OPEN', '2026-08-28T10:06:00.000Z'));
      await store.savePullRequestLifecycle(lifecycle('CLOSED', '2026-08-28T10:04:00.000Z', {
        closedAt: '2026-08-28T10:04:00.000Z',
      }));
      expect(database.prepare(
        'SELECT state, closed_at FROM pull_request_lifecycle WHERE repository_id = 2 AND pull_request_number = 3',
      ).get()).toEqual({ state: 'OPEN', closed_at: null });

      await store.savePullRequestLifecycle(lifecycle('MERGED', '2026-08-28T10:10:00.000Z', {
        mergedAt: '2026-08-28T10:10:00.000Z', mergeSha: 'merge-without-run',
      }));
      expect(database.prepare(
        `SELECT state, pre_merge_run_id, unresolved_at_merge
         FROM pull_request_lifecycle WHERE repository_id = 2 AND pull_request_number = 3`,
      ).get()).toEqual({ state: 'MERGED', pre_merge_run_id: null, unresolved_at_merge: null });
    } finally {
      database.close();
    }
  });
});
