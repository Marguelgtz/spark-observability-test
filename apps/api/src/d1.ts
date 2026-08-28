import type { GitHubEventRequest, GitHubRepository } from '@spark/github';
import type { EvaluationDetailRecord, EvaluationRecord, SparkStore, StoredEvaluation } from './contracts';

export interface D1Result {
  meta?: { changes?: number };
}

export interface D1AllResult<T> {
  results?: T[];
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1AllResult<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function repositoryRows(value: unknown): Array<{ id: number; full_name: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const row = object(item);
    return typeof row?.id === 'number' && typeof row.full_name === 'string' ? [{ id: row.id, full_name: row.full_name }] : [];
  });
}

export class D1SparkStore implements SparkStore {
  constructor(private readonly db: D1Database) {}

  async claimDelivery(deliveryId: string, event: string): Promise<boolean> {
    await this.db.prepare("DELETE FROM webhook_deliveries WHERE received_at < datetime('now', '-7 days')").run();
    const result = await this.db.prepare(
      'INSERT OR IGNORE INTO webhook_deliveries (delivery_id, event) VALUES (?, ?)',
    ).bind(deliveryId, event).run();
    return (result.meta?.changes ?? 0) === 1;
  }

  async releaseDelivery(deliveryId: string): Promise<void> {
    await this.db.prepare('DELETE FROM webhook_deliveries WHERE delivery_id = ?').bind(deliveryId).run();
  }

  async saveInstallationEvent(request: GitHubEventRequest): Promise<void> {
    const installation = object(request.payload.installation);
    const account = object(installation?.account);
    if (!request.installationId) return;
    if (request.kind === 'installation' && request.action === 'deleted') {
      await this.db.prepare('DELETE FROM installations WHERE id = ?').bind(request.installationId).run();
      return;
    }
    if (request.kind === 'installation') {
      if (typeof account?.id !== 'number' || typeof account.login !== 'string') return;
      const statements: D1PreparedStatement[] = [this.db.prepare(
        `INSERT INTO installations (id, account_id, account_login)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id, account_login = excluded.account_login, updated_at = CURRENT_TIMESTAMP`,
      ).bind(request.installationId, account.id, account.login)];
      for (const repository of repositoryRows(request.payload.repositories)) {
        statements.push(this.repositoryUpsert(request.installationId, repository));
      }
      await this.db.batch(statements);
      return;
    }
    if (request.kind === 'installation_repositories') {
      const statements: D1PreparedStatement[] = [];
      for (const repository of repositoryRows(request.payload.repositories_added)) {
        statements.push(this.repositoryUpsert(request.installationId, repository));
      }
      for (const repository of repositoryRows(request.payload.repositories_removed)) {
        statements.push(this.db.prepare('DELETE FROM repositories WHERE id = ? AND installation_id = ?').bind(repository.id, request.installationId));
      }
      if (statements.length) await this.db.batch(statements);
    }
  }

  private repositoryUpsert(installationId: number, repository: { id: number; full_name: string }): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO repositories (id, installation_id, full_name)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET installation_id = excluded.installation_id, full_name = excluded.full_name, updated_at = CURRENT_TIMESTAMP`,
    ).bind(repository.id, installationId, repository.full_name);
  }

  async saveRepository(installationId: number, repository: GitHubRepository): Promise<void> {
    await this.repositoryUpsert(installationId, repository).run();
  }

  async findEvaluation(repositoryId: number, headSha: string): Promise<StoredEvaluation | undefined> {
    const row = await this.db.prepare(
      `SELECT repository_id AS repositoryId, head_sha AS headSha, pull_request_number AS pullRequestNumber,
              check_run_id AS checkRunId, attention
       FROM evaluations WHERE repository_id = ? AND head_sha = ?`,
    ).bind(repositoryId, headSha).first<StoredEvaluation>();
    return row ?? undefined;
  }

  async saveEvaluation(record: EvaluationRecord): Promise<void> {
    await this.db.prepare(
      `INSERT INTO evaluations
       (repository_id, head_sha, installation_id, pull_request_number, check_run_id, attention)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(repository_id, head_sha) DO UPDATE SET
         installation_id = excluded.installation_id,
         pull_request_number = excluded.pull_request_number,
         check_run_id = excluded.check_run_id,
         attention = excluded.attention,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      record.repositoryId, record.headSha, record.installationId, record.pullRequestNumber,
      record.checkRunId, record.attention,
    ).run();
  }

  async saveEvaluationDetail(record: EvaluationDetailRecord): Promise<void> {
    await this.db.prepare(
      `INSERT INTO evaluation_details
       (repository_id, head_sha, schema_version, base_sha, pull_request_title, pull_request_url,
        evaluator_version, evaluated_at, check_url, normalized_json, truncated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(repository_id, head_sha) DO UPDATE SET
         schema_version = excluded.schema_version,
         base_sha = excluded.base_sha,
         pull_request_title = excluded.pull_request_title,
         pull_request_url = excluded.pull_request_url,
         evaluator_version = excluded.evaluator_version,
         evaluated_at = excluded.evaluated_at,
         check_url = excluded.check_url,
         normalized_json = excluded.normalized_json,
         truncated = excluded.truncated,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      record.repositoryId,
      record.headSha,
      record.schemaVersion,
      record.baseSha,
      record.pullRequestTitle,
      record.pullRequestUrl,
      record.evaluatorVersion,
      record.evaluatedAt,
      record.checkUrl ?? null,
      JSON.stringify(record.normalized),
      record.truncated ? 1 : 0,
    ).run();
  }
}
