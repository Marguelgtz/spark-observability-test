import type { ActiveChangesV1 } from '@spark/dashboard-contracts/dashboard';
import type { AttentionLevelV1, EvaluationObservationSourceV1, EvidenceHealthV1, PullRequestActivityV1 } from '@spark/dashboard-contracts';
import type { D1Database } from './d1';
import { summaryFromRow } from './dashboard-reader';

const REPOSITORY_SCOPE_SQL = 'SELECT CAST(value AS INTEGER) FROM json_each(?)';

interface ActiveChangeRow {
  repository_id: number;
  full_name: string;
  head_sha: string;
  pull_request_number: number;
  attention: AttentionLevelV1;
  evaluated_at: string;
  normalized_json: string | null;
  check_url: string | null;
  run_id?: string | null;
  observation_source?: EvaluationObservationSourceV1 | null;
  evidence_health?: EvidenceHealthV1 | null;
  created_at?: string | null;
  run_count: number;
  low_count: number;
  medium_count: number;
  high_count: number;
  total_count?: number | null;
}

export interface ActiveChangesInput {
  repositoryIds: number[];
  repositoryId: number | null;
  start: string;
  limit?: number;
}

function activityFromRow(row: ActiveChangeRow): PullRequestActivityV1 {
  const latest = summaryFromRow(row);
  return {
    repository: latest.repository,
    pullRequest: latest.pullRequest,
    latest,
    history: {
      runCount: Number(row.run_count ?? 0),
      attentionCounts: {
        LOW: Number(row.low_count ?? 0),
        MEDIUM: Number(row.medium_count ?? 0),
        HIGH: Number(row.high_count ?? 0),
      },
    },
  };
}

export async function readActiveChanges(db: D1Database, input: ActiveChangesInput): Promise<ActiveChangesV1> {
  if (input.repositoryIds.length === 0) return { total: 0, preview: [] };

  const repositoryScope = JSON.stringify(input.repositoryIds);
  const repositoryFilter = input.repositoryId === null ? '' : 'AND er.repository_id = ?';
  const scopeBindings: unknown[] = [repositoryScope, ...(input.repositoryId === null ? [] : [input.repositoryId])];
  const limit = Math.max(1, Math.min(input.limit ?? 5, 15));

  const result = await db.prepare(
    `WITH ranked AS (
       SELECT er.repository_id, r.full_name, er.head_sha, er.pull_request_number, er.attention,
              er.evaluated_at, er.normalized_json, NULL AS check_url,
              er.id AS run_id, er.observation_source, er.evidence_health, er.created_at,
              ROW_NUMBER() OVER (
                PARTITION BY er.repository_id, er.pull_request_number
                ORDER BY datetime(er.evaluated_at) DESC, datetime(er.created_at) DESC, er.id DESC
              ) AS latest_rank
       FROM evaluation_runs er
       JOIN repositories r ON r.id = er.repository_id
       WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
       ${repositoryFilter}
     ),
     history AS (
       SELECT er.repository_id, er.pull_request_number,
              COUNT(*) AS run_count,
              SUM(CASE WHEN er.attention = 'LOW' THEN 1 ELSE 0 END) AS low_count,
              SUM(CASE WHEN er.attention = 'MEDIUM' THEN 1 ELSE 0 END) AS medium_count,
              SUM(CASE WHEN er.attention = 'HIGH' THEN 1 ELSE 0 END) AS high_count
       FROM evaluation_runs er
       WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
       ${repositoryFilter}
       GROUP BY er.repository_id, er.pull_request_number
     )
     SELECT ranked.repository_id, ranked.full_name, ranked.head_sha, ranked.pull_request_number,
            ranked.attention, ranked.evaluated_at, ranked.normalized_json, ranked.check_url,
            ranked.run_id, ranked.observation_source, ranked.evidence_health, ranked.created_at,
            COALESCE(history.run_count, 1) AS run_count,
            COALESCE(history.low_count, 0) AS low_count,
            COALESCE(history.medium_count, 0) AS medium_count,
            COALESCE(history.high_count, 0) AS high_count,
            COUNT(*) OVER() AS total_count
     FROM ranked
     LEFT JOIN history
       ON history.repository_id = ranked.repository_id AND history.pull_request_number = ranked.pull_request_number
     LEFT JOIN pull_request_lifecycle pl
       ON pl.repository_id = ranked.repository_id AND pl.pull_request_number = ranked.pull_request_number
     WHERE ranked.latest_rank = 1
       AND datetime(ranked.evaluated_at) >= datetime(?)
       AND (pl.state IS NULL OR pl.state = 'OPEN')
     ORDER BY datetime(ranked.evaluated_at) DESC,
              ranked.repository_id DESC,
              ranked.pull_request_number DESC
     LIMIT ?`,
  ).bind(
    ...scopeBindings,
    ...scopeBindings,
    input.start,
    limit,
  ).all<ActiveChangeRow>();

  const rows = result.results ?? [];
  return {
    total: Number(rows[0]?.total_count ?? 0),
    preview: rows.map(activityFromRow),
  };
}
