import type { ActivityOverviewV1, AttentionLevelV1, EvaluationObservationSourceV1, EvidenceHealthV1 } from '@spark/dashboard-contracts';
import type { D1Database } from './d1';

const REPOSITORY_SCOPE_SQL = 'SELECT CAST(value AS INTEGER) FROM json_each(?)';

export interface HomeActivityRow {
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

interface OverviewRow {
  observed_prs: number;
  total_evaluations: number;
  active_needing_attention: number;
  merged_unresolved: number;
  recovered_prs: number;
  failed_to_clear_events: number;
  waiting_to_clear_events: number;
}

export interface ActivityHomeData {
  overview: ActivityOverviewV1;
  hasObservedHistory: boolean;
  needsAttentionTotal: number;
  needsAttentionRows: HomeActivityRow[];
}

interface ActivityHomeInput {
  repositoryIds: number[];
  repositoryId: number | null;
  start: string;
}

export async function readActivityHome(db: D1Database, input: ActivityHomeInput): Promise<ActivityHomeData> {
  const repositoryScope = JSON.stringify(input.repositoryIds);
  const repositoryFilter = input.repositoryId === null ? '' : 'AND er.repository_id = ?';
  const lifecycleRepositoryFilter = input.repositoryId === null ? '' : 'AND pl.repository_id = ?';
  const scopedBindings: unknown[] = [repositoryScope, ...(input.repositoryId === null ? [] : [input.repositoryId])];

  const observed = await db.prepare(
    `SELECT 1 AS observed
     FROM evaluation_runs
     WHERE repository_id IN (${REPOSITORY_SCOPE_SQL})
     LIMIT 1`,
  ).bind(repositoryScope).first<{ observed: number }>();
  const hasObservedHistory = Boolean(observed);

  const overview = await db.prepare(
    `WITH ordered_runs AS (
       SELECT er.repository_id, er.pull_request_number, er.attention, er.evidence_health,
              er.evaluated_at, er.created_at, er.id,
              LAG(er.evidence_health) OVER (
                PARTITION BY er.repository_id, er.pull_request_number
                ORDER BY datetime(er.evaluated_at), datetime(er.created_at), er.id
              ) AS previous_evidence_health,
              ROW_NUMBER() OVER (
                PARTITION BY er.repository_id, er.pull_request_number
                ORDER BY datetime(er.evaluated_at) DESC, datetime(er.created_at) DESC, er.id DESC
              ) AS latest_rank
       FROM evaluation_runs er
       WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
       ${repositoryFilter}
     ),
     windowed_runs AS (
       SELECT * FROM ordered_runs WHERE datetime(evaluated_at) >= datetime(?)
     )
     SELECT
       COUNT(DISTINCT CAST(repository_id AS TEXT) || ':' || CAST(pull_request_number AS TEXT)) AS observed_prs,
       COUNT(*) AS total_evaluations,
       (
         SELECT COUNT(*)
         FROM ordered_runs latest
         LEFT JOIN pull_request_lifecycle pl
           ON pl.repository_id = latest.repository_id AND pl.pull_request_number = latest.pull_request_number
         WHERE latest.latest_rank = 1
           AND datetime(latest.evaluated_at) >= datetime(?)
           AND latest.attention IN ('HIGH', 'MEDIUM')
           AND (pl.state IS NULL OR pl.state = 'OPEN')
       ) AS active_needing_attention,
       (
         SELECT COUNT(*)
         FROM pull_request_lifecycle pl
         WHERE pl.repository_id IN (${REPOSITORY_SCOPE_SQL})
           ${lifecycleRepositoryFilter}
           AND pl.state = 'MERGED'
           AND pl.unresolved_at_merge = 1
           AND pl.merged_at IS NOT NULL
           AND datetime(pl.merged_at) >= datetime(?)
       ) AS merged_unresolved,
       COUNT(DISTINCT CASE
         WHEN previous_evidence_health IN ('FAILED', 'PENDING_OR_MISSING') AND evidence_health = 'CLEAR'
         THEN CAST(repository_id AS TEXT) || ':' || CAST(pull_request_number AS TEXT)
       END) AS recovered_prs,
       SUM(CASE
         WHEN previous_evidence_health = 'FAILED' AND evidence_health <> 'CLEAR' THEN 1 ELSE 0
       END) AS failed_to_clear_events,
       SUM(CASE
         WHEN previous_evidence_health = 'PENDING_OR_MISSING' AND evidence_health <> 'CLEAR' THEN 1 ELSE 0
       END) AS waiting_to_clear_events
     FROM windowed_runs`,
  ).bind(
    ...scopedBindings,
    input.start,
    input.start,
    repositoryScope,
    ...(input.repositoryId === null ? [] : [input.repositoryId]),
    input.start,
  ).first<OverviewRow>();

  const needsAttention = await db.prepare(
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
       AND ranked.attention IN ('HIGH', 'MEDIUM')
       AND (pl.state IS NULL OR pl.state = 'OPEN')
     ORDER BY CASE ranked.attention WHEN 'HIGH' THEN 0 ELSE 1 END,
              datetime(ranked.evaluated_at) DESC,
              ranked.repository_id DESC,
              ranked.pull_request_number DESC
     LIMIT 5`,
  ).bind(
    ...scopedBindings,
    ...scopedBindings,
    input.start,
  ).all<HomeActivityRow>();

  const rows = needsAttention.results ?? [];
  return {
    hasObservedHistory,
    overview: {
      observedPRs: Number(overview?.observed_prs ?? 0),
      totalEvaluations: Number(overview?.total_evaluations ?? 0),
      activePRsNeedingAttention: Number(overview?.active_needing_attention ?? 0),
      mergedUnresolved: Number(overview?.merged_unresolved ?? 0),
      recovery: {
        recoveredPRs: Number(overview?.recovered_prs ?? 0),
        failedToClearEvents: Number(overview?.failed_to_clear_events ?? 0),
        waitingToClearEvents: Number(overview?.waiting_to_clear_events ?? 0),
      },
    },
    needsAttentionTotal: Number(rows[0]?.total_count ?? 0),
    needsAttentionRows: rows,
  };
}
