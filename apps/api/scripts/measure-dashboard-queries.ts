import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { D1DashboardReader } from '../src/dashboard-reader';
import { readActivityDrilldown } from '../src/activity-drilldown';
import { readActiveChanges } from '../src/dashboard-summary';
import { readOutcomeOverview } from '../src/outcome-overview';
import type { D1Database, D1PreparedStatement } from '../src/d1';

type StatementRecord = { sql: string; bindings: unknown[] };

class SqliteStatement implements D1PreparedStatement {
  private bindings: unknown[] = [];

  constructor(private readonly database: DatabaseSync, private readonly sql: string) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.bindings = values;
    return this;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.database.prepare(this.sql).all(...this.bindings) as T[] };
  }

  async first<T>(): Promise<T | null> {
    return (this.database.prepare(this.sql).get(...this.bindings) as T | undefined) ?? null;
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const result = this.database.prepare(this.sql).run(...this.bindings);
    return { meta: { changes: Number(result.changes) } };
  }
}

class RecordingDatabase implements D1Database {
  readonly statements: StatementRecord[] = [];

  constructor(readonly database: DatabaseSync) {}

  prepare(sql: string): D1PreparedStatement {
    const record: StatementRecord = { sql, bindings: [] };
    this.statements.push(record);
    const statement = new SqliteStatement(this.database, sql);
    return {
      bind: (...values: unknown[]) => {
        record.bindings = values;
        statement.bind(...values);
        return statement;
      },
      all: () => statement.all(),
      first: () => statement.first(),
      run: () => statement.run(),
    };
  }

  async batch(statements: D1PreparedStatement[]): Promise<Array<{ meta: { changes: number } }>> {
    const results: Array<{ meta: { changes: number } }> = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

function migrate(database: DatabaseSync): void {
  const migrationDirectory = resolve(process.cwd(), 'apps/api/migrations');
  for (const filename of readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()) {
    database.exec(readFileSync(resolve(migrationDirectory, filename), 'utf8'));
  }
}

function seed(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO installations (id, account_id, account_login, created_at, updated_at)
    VALUES (1, 99, 'synthetic', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
    INSERT INTO repositories (id, installation_id, full_name, created_at, updated_at)
    VALUES (101, 1, 'synthetic/alpha', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
           (202, 1, 'synthetic/beta', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
  `);

  const evaluation = database.prepare(`
    INSERT INTO evaluations (repository_id, head_sha, installation_id, pull_request_number, check_run_id, attention, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?)
  `);
  const detail = database.prepare(`
    INSERT INTO evaluation_details (repository_id, head_sha, schema_version, base_sha, pull_request_title, pull_request_url, evaluator_version, evaluated_at, normalized_json, created_at, updated_at)
    VALUES (?, ?, 1, 'base', ?, ?, 'synthetic-v1', ?, '{}', ?, ?)
  `);
  const run = database.prepare(`
    INSERT INTO evaluation_runs (id, idempotency_key, repository_id, installation_id, pull_request_number, head_sha, base_sha, check_run_id, source_event, source_action, observation_source, schema_version, evaluator_version, evaluated_at, attention, evidence_health, normalized_json, created_at)
    VALUES (?, ?, ?, 1, ?, ?, 'base', ?, 'synthetic', 'created', 'LIVE', 1, 'synthetic-v1', ?, ?, 'CLEAR', '{}', ?)
  `);
  for (const repositoryId of [101, 202]) {
    for (let pullRequest = 1; pullRequest <= 50; pullRequest += 1) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const headSha = `${repositoryId}-${pullRequest}-${attempt}`;
        const evaluatedAt = `2026-09-${String(10 - Math.min(attempt + (pullRequest % 3), 8)).padStart(2, '0')}T${String((pullRequest + attempt) % 24).padStart(2, '0')}:00:00.000Z`;
        const attention = attempt === 2 && pullRequest % 5 === 0 ? 'HIGH' : attempt === 1 ? 'MEDIUM' : 'LOW';
        const createdAt = evaluatedAt;
        evaluation.run(repositoryId, headSha, pullRequest, repositoryId * 100000 + pullRequest * 10 + attempt, attention, createdAt, createdAt);
        detail.run(repositoryId, headSha, `Synthetic PR #${pullRequest}`, `https://example.test/${repositoryId}/${pullRequest}`, evaluatedAt, createdAt, createdAt);
        run.run(`synthetic:${repositoryId}:${pullRequest}:${attempt}`, `synthetic:${repositoryId}:${pullRequest}:${attempt}`, repositoryId, pullRequest, headSha, repositoryId * 100000 + pullRequest * 10 + attempt, evaluatedAt, attention, createdAt);
      }
      if (pullRequest % 10 === 0) {
        database.prepare(`
          INSERT INTO pull_request_lifecycle (repository_id, installation_id, pull_request_number, state, merged_at, unresolved_at_merge, last_event_at)
          VALUES (?, 1, ?, 'MERGED', '2026-09-09T12:00:00.000Z', 1, '2026-09-09T12:00:00.000Z')
        `).run(repositoryId, pullRequest);
      }
    }
  }
}

function explain(database: DatabaseSync, record: StatementRecord): string[] {
  try {
    return (database.prepare(`EXPLAIN QUERY PLAN ${record.sql}`).all(...record.bindings) as Array<{ detail: string }>)
      .map((row) => row.detail);
  } catch (error) {
    return [`EXPLAIN failed: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function directPlan(database: DatabaseSync, sql: string, ...bindings: unknown[]): string[] {
  return (database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...bindings) as Array<{ detail: string }>)
    .map((row) => row.detail);
}

async function main(): Promise<void> {
  const database = new DatabaseSync(':memory:');
  migrate(database);
  seed(database);
  const recording = new RecordingDatabase(database);
  const reader = new D1DashboardReader(recording);
  const now = new Date('2026-09-10T12:00:00.000Z');
  const activity = await reader.activity({ window: '7d', attention: 'ALL', repositoryId: null, limit: 15 }, [101, 202], now);
  const activityStatements = recording.statements.splice(0);
  const activeChanges = await readActiveChanges(recording, {
    repositoryIds: [101, 202],
    repositoryId: null,
    start: '2026-09-03T12:00:00.000Z',
    limit: 15,
  });
  const dashboardStatements = recording.statements.splice(0);
  const overview = await readActivityDrilldown(recording, {
    metric: 'evaluations',
    window: '7d',
    repositoryIds: [101, 202],
    repositoryId: null,
    start: '2026-09-03T12:00:00.000Z',
    now,
    limit: 15,
  });
  const overviewStatements = recording.statements.splice(0);
  const merged = await readActivityDrilldown(recording, {
    metric: 'merged-unresolved',
    window: '7d',
    repositoryIds: [101, 202],
    repositoryId: null,
    start: '2026-09-03T12:00:00.000Z',
    now,
    limit: 15,
  });
  const mergedDrilldownStatements = recording.statements.splice(0);
  const outcomes = await readOutcomeOverview(recording, {
    window: '7d',
    repositoryIds: [101, 202],
    repositoryId: null,
    start: '2026-09-03T12:00:00.000Z',
    now,
    githubUserId: 7,
  });
  const mergedOutcomeStatements = recording.statements.splice(0);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixture: { repositories: 2, pullRequests: 100, evaluationRuns: 300, lifecycleRows: 10 },
    operations: [
      {
        name: 'activity-first-page',
        result: { total: activity.total, rows: activity.pullRequests.length, nextCursor: Boolean(activity.pagination.nextCursor) },
        statementCount: activityStatements.length,
        plans: activityStatements.map((statement) => ({ sql: statement.sql.replace(/\s+/g, ' ').trim(), plan: explain(database, statement) })),
      },
      {
        name: 'dashboard-active-changes-summary',
        result: { total: activeChanges.total, rows: activeChanges.preview.length },
        statementCount: dashboardStatements.length,
        plans: dashboardStatements.map((statement) => ({ sql: statement.sql.replace(/\s+/g, ' ').trim(), plan: explain(database, statement) })),
      },
      {
        name: 'dashboard-first-load-readers',
        result: { total: activity.total, rows: activity.pullRequests.length, nextCursor: Boolean(activity.pagination.nextCursor) },
        activeChanges: { total: activeChanges.total, rows: activeChanges.preview.length },
        statementCount: activityStatements.length + dashboardStatements.length,
        plans: [...activityStatements, ...dashboardStatements].map((statement) => ({ sql: statement.sql.replace(/\s+/g, ' ').trim(), plan: explain(database, statement) })),
      },
      {
        name: 'overview-evaluations-first-page',
        result: { total: overview.total, rows: overview.items.length, nextCursor: Boolean(overview.pagination.nextCursor) },
        statementCount: overviewStatements.length,
        plans: overviewStatements.map((statement) => ({ sql: statement.sql.replace(/\s+/g, ' ').trim(), plan: explain(database, statement) })),
      },
      {
        name: 'overview-merged-unresolved-first-page',
        result: { total: merged.total, rows: merged.items.length, nextCursor: Boolean(merged.pagination.nextCursor), outcomeMerges: outcomes.merges.total },
        statementCount: mergedDrilldownStatements.length + mergedOutcomeStatements.length,
        plans: [...mergedDrilldownStatements, ...mergedOutcomeStatements].map((statement) => ({ sql: statement.sql.replace(/\s+/g, ' ').trim(), plan: explain(database, statement) })),
      },
    ],
    timestampComparison: {
      raw: directPlan(database, 'SELECT repository_id, evaluated_at FROM evaluation_runs WHERE repository_id = ? AND evaluated_at >= ? ORDER BY evaluated_at DESC LIMIT 15', 101, '2026-09-03T12:00:00.000Z'),
      datetimeWrapped: directPlan(database, 'SELECT repository_id, evaluated_at FROM evaluation_runs WHERE repository_id = ? AND datetime(evaluated_at) >= datetime(?) ORDER BY datetime(evaluated_at) DESC LIMIT 15', 101, '2026-09-03T12:00:00.000Z'),
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
