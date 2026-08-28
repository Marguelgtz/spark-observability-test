import type { GitHubEventRequest, GitHubRepository } from '@spark/github';
import type {
  EvaluationDetailRecord,
  EvaluationObservationRecord,
  EvaluationRecord,
  EvaluationRunRecord,
  PullRequestLifecycleRecord,
  SparkStore,
  StoredEvaluation,
} from './contracts';

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

  private evaluationUpsert(record: EvaluationRecord): D1PreparedStatement {
    return this.db.prepare(
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
    );
  }

  private evaluationDetailUpsert(record: EvaluationDetailRecord): D1PreparedStatement {
    return this.db.prepare(
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
    );
  }

  private evaluationRunInsert(record: EvaluationRunRecord): D1PreparedStatement {
    return this.db.prepare(
      `INSERT OR IGNORE INTO evaluation_runs
       (id, idempotency_key, repository_id, installation_id, pull_request_number, head_sha, base_sha,
        check_run_id, source_event, source_action, source_delivery_id, observation_source,
        schema_version, evaluator_version, evaluated_at, attention, evidence_health, normalized_json, truncated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      record.id,
      record.idempotencyKey,
      record.repositoryId,
      record.installationId,
      record.pullRequestNumber,
      record.headSha,
      record.baseSha ?? null,
      record.checkRunId,
      record.trigger.event,
      record.trigger.action,
      record.trigger.deliveryId ?? null,
      record.observationSource,
      record.schemaVersion ?? null,
      record.evaluatorVersion ?? null,
      record.evaluatedAt,
      record.attention,
      record.evidenceHealth,
      record.normalized ? JSON.stringify(record.normalized) : null,
      record.truncated ? 1 : 0,
    );
  }

  private reconcilePreMergeRun(repositoryId: number, pullRequestNumber: number): D1PreparedStatement {
    return this.db.prepare(
      `WITH candidate AS (
         SELECT er.id, er.attention, er.evidence_health
         FROM evaluation_runs er
         JOIN pull_request_lifecycle lifecycle
           ON lifecycle.repository_id = er.repository_id
          AND lifecycle.pull_request_number = er.pull_request_number
         WHERE er.repository_id = ? AND er.pull_request_number = ?
           AND lifecycle.state = 'MERGED'
           AND datetime(er.evaluated_at) <= datetime(lifecycle.merged_at)
         ORDER BY datetime(er.evaluated_at) DESC, datetime(er.created_at) DESC, er.id DESC
         LIMIT 1
       )
       UPDATE pull_request_lifecycle
       SET pre_merge_run_id = candidate.id,
           pre_merge_attention = candidate.attention,
           pre_merge_evidence_health = candidate.evidence_health,
           unresolved_at_merge = CASE
             WHEN candidate.attention != 'LOW' OR candidate.evidence_health != 'CLEAR' THEN 1
             ELSE 0
           END,
           updated_at = CURRENT_TIMESTAMP
       FROM candidate
       WHERE repository_id = ? AND pull_request_number = ? AND state = 'MERGED'
         AND (
           pre_merge_run_id IS NOT candidate.id
           OR pre_merge_attention IS NOT candidate.attention
           OR pre_merge_evidence_health IS NOT candidate.evidence_health
         )`,
    ).bind(repositoryId, pullRequestNumber, repositoryId, pullRequestNumber);
  }

  private lifecycleUpsert(record: PullRequestLifecycleRecord): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO pull_request_lifecycle
       (repository_id, installation_id, pull_request_number, state, opened_at, closed_at,
        merged_at, merge_sha, last_event_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(repository_id, pull_request_number) DO UPDATE SET
         installation_id = excluded.installation_id,
         state = excluded.state,
         opened_at = COALESCE(pull_request_lifecycle.opened_at, excluded.opened_at),
         closed_at = CASE WHEN excluded.state = 'OPEN' THEN NULL ELSE excluded.closed_at END,
         merged_at = CASE WHEN excluded.state = 'MERGED' THEN excluded.merged_at ELSE NULL END,
         merge_sha = CASE WHEN excluded.state = 'MERGED' THEN excluded.merge_sha ELSE NULL END,
         pre_merge_run_id = CASE WHEN excluded.state = 'MERGED' THEN pull_request_lifecycle.pre_merge_run_id ELSE NULL END,
         pre_merge_attention = CASE WHEN excluded.state = 'MERGED' THEN pull_request_lifecycle.pre_merge_attention ELSE NULL END,
         pre_merge_evidence_health = CASE WHEN excluded.state = 'MERGED' THEN pull_request_lifecycle.pre_merge_evidence_health ELSE NULL END,
         unresolved_at_merge = CASE WHEN excluded.state = 'MERGED' THEN pull_request_lifecycle.unresolved_at_merge ELSE NULL END,
         last_event_at = excluded.last_event_at,
         updated_at = CURRENT_TIMESTAMP
       WHERE datetime(excluded.last_event_at) >= datetime(pull_request_lifecycle.last_event_at)
         AND (pull_request_lifecycle.state != 'MERGED' OR excluded.state = 'MERGED')`,
    ).bind(
      record.repositoryId,
      record.installationId,
      record.pullRequestNumber,
      record.state,
      record.openedAt ?? null,
      record.closedAt ?? null,
      record.mergedAt ?? null,
      record.mergeSha ?? null,
      record.occurredAt,
    );
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
    await this.evaluationUpsert(record).run();
  }

  async saveEvaluationDetail(record: EvaluationDetailRecord): Promise<void> {
    await this.evaluationDetailUpsert(record).run();
  }

  async saveEvaluationObservation(record: EvaluationObservationRecord): Promise<void> {
    const results = await this.db.batch([
      this.evaluationRunInsert(record.run),
      this.evaluationUpsert(record.evaluation),
      this.evaluationDetailUpsert(record.detail),
      this.reconcilePreMergeRun(record.run.repositoryId, record.run.pullRequestNumber),
    ]);
    if ((results[3]?.meta?.changes ?? 0) > 0) {
      console.info(JSON.stringify({
        event: 'pre_merge_projection_reconciled',
        repositoryId: record.run.repositoryId,
        pr: record.run.pullRequestNumber,
        source: 'evaluation_run',
      }));
    }
  }

  async savePullRequestLifecycle(record: PullRequestLifecycleRecord): Promise<void> {
    const results = await this.db.batch([
      this.repositoryUpsert(record.installationId, { id: record.repositoryId, full_name: record.repositoryFullName }),
      this.lifecycleUpsert(record),
      this.reconcilePreMergeRun(record.repositoryId, record.pullRequestNumber),
    ]);
    if ((results[1]?.meta?.changes ?? 0) > 0) {
      console.info(JSON.stringify({
        event: 'lifecycle_projection_updated',
        repositoryId: record.repositoryId,
        pr: record.pullRequestNumber,
        state: record.state,
      }));
    }
    if ((results[2]?.meta?.changes ?? 0) > 0) {
      console.info(JSON.stringify({
        event: 'pre_merge_projection_reconciled',
        repositoryId: record.repositoryId,
        pr: record.pullRequestNumber,
        source: 'lifecycle',
      }));
    }
  }
}
