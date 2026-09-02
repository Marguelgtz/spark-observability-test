import type {
  ActivityWindowV1,
  AttentionLevelV1,
  EvaluationObservationSourceV1,
  EvaluationSummaryV1,
  EvidenceHealthV1,
  PullRequestActivityV1,
  PullRequestLifecycleV1,
  RepositoryRefV1,
} from '@spark/dashboard-contracts';
import type { D1Database } from './d1';
import { summaryFromRow } from './dashboard-reader';
import { readActivityTrend, type ActivityTrendPointV1 } from './activity-trend';

const REPOSITORY_SCOPE_SQL = 'SELECT CAST(value AS INTEGER) FROM json_each(?)';
const MAX_ITEMS = 100;

export type OverviewMetricV1 = 'pull-requests' | 'evaluations' | 'attention' | 'merged-unresolved';

interface BaseRunRow {
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
}

interface PullRequestRow extends BaseRunRow {
  run_count: number;
  low_count: number;
  medium_count: number;
  high_count: number;
  lifecycle_state?: PullRequestLifecycleV1['state'] | null;
  opened_at?: string | null;
  closed_at?: string | null;
  merged_at?: string | null;
  merge_sha?: string | null;
  pre_merge_run_id?: string | null;
  pre_merge_attention?: PullRequestLifecycleV1['preMergeAttention'] | null;
  pre_merge_evidence_health?: PullRequestLifecycleV1['preMergeEvidenceHealth'] | null;
  unresolved_at_merge?: number | null;
  lifecycle_last_event_at?: string | null;
  total_count: number;
}

interface EvaluationRow extends BaseRunRow {
  total_count: number;
}

interface MergeRow {
  repository_id: number;
  full_name: string;
  pull_request_number: number;
  lifecycle_state: PullRequestLifecycleV1['state'];
  opened_at?: string | null;
  closed_at?: string | null;
  merged_at?: string | null;
  merge_sha?: string | null;
  pre_merge_run_id?: string | null;
  pre_merge_attention?: PullRequestLifecycleV1['preMergeAttention'] | null;
  pre_merge_evidence_health?: PullRequestLifecycleV1['preMergeEvidenceHealth'] | null;
  unresolved_at_merge?: number | null;
  lifecycle_last_event_at: string;
  head_sha?: string | null;
  attention?: AttentionLevelV1 | null;
  evaluated_at?: string | null;
  normalized_json?: string | null;
  run_id?: string | null;
  observation_source?: EvaluationObservationSourceV1 | null;
  evidence_health?: EvidenceHealthV1 | null;
  created_at?: string | null;
  run_count?: number | null;
  low_count?: number | null;
  medium_count?: number | null;
  high_count?: number | null;
  total_count: number;
}

export type OverviewDrilldownItemV1 =
  | { kind: 'pull-request'; activity: PullRequestActivityV1; lifecycle?: PullRequestLifecycleV1 }
  | { kind: 'evaluation'; evaluation: EvaluationSummaryV1 }
  | {
      kind: 'merge';
      repository: RepositoryRefV1;
      pullRequest: { number: number; title: string; url: string };
      latest?: EvaluationSummaryV1;
      lifecycle: PullRequestLifecycleV1;
    };

export interface OverviewDrilldownResponseV1 {
  version: 1;
  metric: OverviewMetricV1;
  selectedWindow: ActivityWindowV1;
  selectedRepositoryId: number | null;
  total: number;
  trend: ActivityTrendPointV1[];
  items: OverviewDrilldownItemV1[];
  truncated: boolean;
}

interface DrilldownInput {
  metric: OverviewMetricV1;
  window: ActivityWindowV1;
  repositoryIds: number[];
  repositoryId: number | null;
  start: string;
  now: Date;
}

function splitRepository(id: number, fullName: string): RepositoryRefV1 {
  const [owner = '', name = fullName] = fullName.split('/');
  return { id, owner, name, url: `https://github.com/${fullName}` };
}

function lifecycleFromRow(row: {
  lifecycle_state?: PullRequestLifecycleV1['state'] | null;
  opened_at?: string | null;
  closed_at?: string | null;
  merged_at?: string | null;
  merge_sha?: string | null;
  pre_merge_run_id?: string | null;
  pre_merge_attention?: PullRequestLifecycleV1['preMergeAttention'] | null;
  pre_merge_evidence_health?: PullRequestLifecycleV1['preMergeEvidenceHealth'] | null;
  unresolved_at_merge?: number | null;
  lifecycle_last_event_at?: string | null;
}): PullRequestLifecycleV1 | undefined {
  if (!row.lifecycle_state || !row.lifecycle_last_event_at) return undefined;
  return {
    state: row.lifecycle_state,
    ...(row.opened_at ? { openedAt: row.opened_at } : {}),
    ...(row.closed_at ? { closedAt: row.closed_at } : {}),
    ...(row.merged_at ? { mergedAt: row.merged_at } : {}),
    ...(row.merge_sha ? { mergeSha: row.merge_sha } : {}),
    ...(row.pre_merge_run_id ? { preMergeRunId: row.pre_merge_run_id } : {}),
    ...(row.pre_merge_attention ? { preMergeAttention: row.pre_merge_attention } : {}),
    ...(row.pre_merge_evidence_health ? { preMergeEvidenceHealth: row.pre_merge_evidence_health } : {}),
    ...(row.unresolved_at_merge !== null && row.unresolved_at_merge !== undefined
      ? { unresolvedAtMerge: row.unresolved_at_merge === 1 }
      : {}),
    lastEventAt: row.lifecycle_last_event_at,
  };
}

function activityFromRow(row: PullRequestRow): PullRequestActivityV1 {
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

function commonPullRequestSelect(): string {
  return `latest.repository_id, latest.full_name, latest.head_sha, latest.pull_request_number,
          latest.attention, latest.evaluated_at, latest.normalized_json, NULL AS check_url,
          latest.run_id, latest.observation_source, latest.evidence_health, latest.created_at,
          history.run_count, history.low_count, history.medium_count, history.high_count,
          pl.state AS lifecycle_state, pl.opened_at, pl.closed_at, pl.merged_at, pl.merge_sha,
          pl.pre_merge_run_id, pl.pre_merge_attention, pl.pre_merge_evidence_health,
          pl.unresolved_at_merge, pl.last_event_at AS lifecycle_last_event_at`;
}

async function pullRequestItems(db: D1Database, input: DrilldownInput): Promise<{ total: number; items: OverviewDrilldownItemV1[] }> {
  const repositoryScope = JSON.stringify(input.repositoryIds);
  const repositoryFilter = input.repositoryId === null ? '' : 'AND er.repository_id = ?';
  let query: string;
  let bindings: unknown[];

  if (input.metric === 'attention') {
    query = `WITH latest AS (
       SELECT er.repository_id, r.full_name, er.head_sha, er.pull_request_number, er.attention,
              er.evaluated_at, er.normalized_json, er.id AS run_id, er.observation_source,
              er.evidence_health, er.created_at,
              ROW_NUMBER() OVER (
                PARTITION BY er.repository_id, er.pull_request_number
                ORDER BY datetime(er.evaluated_at) DESC, datetime(er.created_at) DESC, er.id DESC
              ) AS latest_rank
       FROM evaluation_runs er
       JOIN repositories r ON r.id = er.repository_id
       WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
       ${repositoryFilter}
     ), history AS (
       SELECT er.repository_id, er.pull_request_number, COUNT(*) AS run_count,
              SUM(CASE WHEN er.attention = 'LOW' THEN 1 ELSE 0 END) AS low_count,
              SUM(CASE WHEN er.attention = 'MEDIUM' THEN 1 ELSE 0 END) AS medium_count,
              SUM(CASE WHEN er.attention = 'HIGH' THEN 1 ELSE 0 END) AS high_count
       FROM evaluation_runs er
       WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
       GROUP BY er.repository_id, er.pull_request_number
     )
     SELECT ${commonPullRequestSelect()}, COUNT(*) OVER() AS total_count
     FROM latest
     JOIN history ON history.repository_id = latest.repository_id AND history.pull_request_number = latest.pull_request_number
     LEFT JOIN pull_request_lifecycle pl ON pl.repository_id = latest.repository_id AND pl.pull_request_number = latest.pull_request_number
     WHERE latest.latest_rank = 1
       AND datetime(latest.evaluated_at) >= datetime(?)
       AND latest.attention IN ('HIGH', 'MEDIUM')
       AND (pl.state IS NULL OR pl.state = 'OPEN')
     ORDER BY CASE latest.attention WHEN 'HIGH' THEN 0 ELSE 1 END,
              datetime(latest.evaluated_at) DESC, latest.repository_id DESC, latest.pull_request_number DESC
     LIMIT ${MAX_ITEMS}`;
    bindings = [repositoryScope, ...(input.repositoryId === null ? [] : [input.repositoryId]), repositoryScope, input.start];
  } else {
    query = `WITH latest AS (
       SELECT er.repository_id, r.full_name, er.head_sha, er.pull_request_number, er.attention,
              er.evaluated_at, er.normalized_json, er.id AS run_id, er.observation_source,
              er.evidence_health, er.created_at,
              ROW_NUMBER() OVER (
                PARTITION BY er.repository_id, er.pull_request_number
                ORDER BY datetime(er.evaluated_at) DESC, datetime(er.created_at) DESC, er.id DESC
              ) AS latest_rank
       FROM evaluation_runs er
       JOIN repositories r ON r.id = er.repository_id
       WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
     ), window_prs AS (
       SELECT DISTINCT er.repository_id, er.pull_request_number
       FROM evaluation_runs er
       WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
       ${repositoryFilter}
       AND datetime(er.evaluated_at) >= datetime(?)
     ), history AS (
       SELECT er.repository_id, er.pull_request_number, COUNT(*) AS run_count,
              SUM(CASE WHEN er.attention = 'LOW' THEN 1 ELSE 0 END) AS low_count,
              SUM(CASE WHEN er.attention = 'MEDIUM' THEN 1 ELSE 0 END) AS medium_count,
              SUM(CASE WHEN er.attention = 'HIGH' THEN 1 ELSE 0 END) AS high_count
       FROM evaluation_runs er
       WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
       GROUP BY er.repository_id, er.pull_request_number
     )
     SELECT ${commonPullRequestSelect()}, COUNT(*) OVER() AS total_count
     FROM latest
     JOIN window_prs ON window_prs.repository_id = latest.repository_id AND window_prs.pull_request_number = latest.pull_request_number
     JOIN history ON history.repository_id = latest.repository_id AND history.pull_request_number = latest.pull_request_number
     LEFT JOIN pull_request_lifecycle pl ON pl.repository_id = latest.repository_id AND pl.pull_request_number = latest.pull_request_number
     WHERE latest.latest_rank = 1
     ORDER BY datetime(latest.evaluated_at) DESC, latest.repository_id DESC, latest.pull_request_number DESC
     LIMIT ${MAX_ITEMS}`;
    bindings = [repositoryScope, repositoryScope, ...(input.repositoryId === null ? [] : [input.repositoryId]), input.start, repositoryScope];
  }

  const result = await db.prepare(query).bind(...bindings).all<PullRequestRow>();
  const rows = result.results ?? [];
  return {
    total: Number(rows[0]?.total_count ?? 0),
    items: rows.map((row) => {
      const lifecycle = lifecycleFromRow(row);
      return { kind: 'pull-request' as const, activity: activityFromRow(row), ...(lifecycle ? { lifecycle } : {}) };
    }),
  };
}

async function evaluationItems(db: D1Database, input: DrilldownInput): Promise<{ total: number; items: OverviewDrilldownItemV1[] }> {
  const repositoryScope = JSON.stringify(input.repositoryIds);
  const repositoryFilter = input.repositoryId === null ? '' : 'AND er.repository_id = ?';
  const result = await db.prepare(
    `SELECT er.repository_id, r.full_name, er.head_sha, er.pull_request_number, er.attention,
            er.evaluated_at, er.normalized_json, NULL AS check_url,
            er.id AS run_id, er.observation_source, er.evidence_health, er.created_at,
            COUNT(*) OVER() AS total_count
     FROM evaluation_runs er
     JOIN repositories r ON r.id = er.repository_id
     WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
       ${repositoryFilter}
       AND datetime(er.evaluated_at) >= datetime(?)
     ORDER BY datetime(er.evaluated_at) DESC, datetime(er.created_at) DESC, er.id DESC
     LIMIT ${MAX_ITEMS}`,
  ).bind(
    repositoryScope,
    ...(input.repositoryId === null ? [] : [input.repositoryId]),
    input.start,
  ).all<EvaluationRow>();
  const rows = result.results ?? [];
  return {
    total: Number(rows[0]?.total_count ?? 0),
    items: rows.map((row) => ({ kind: 'evaluation' as const, evaluation: summaryFromRow(row) })),
  };
}

async function mergeItems(db: D1Database, input: DrilldownInput): Promise<{ total: number; items: OverviewDrilldownItemV1[] }> {
  const repositoryScope = JSON.stringify(input.repositoryIds);
  const repositoryFilter = input.repositoryId === null ? '' : 'AND pl.repository_id = ?';
  const result = await db.prepare(
    `WITH latest AS (
       SELECT er.repository_id, er.pull_request_number, er.head_sha, er.attention, er.evaluated_at,
              er.normalized_json, er.id AS run_id, er.observation_source, er.evidence_health, er.created_at,
              ROW_NUMBER() OVER (
                PARTITION BY er.repository_id, er.pull_request_number
                ORDER BY datetime(er.evaluated_at) DESC, datetime(er.created_at) DESC, er.id DESC
              ) AS latest_rank
       FROM evaluation_runs er
       WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
     )
     SELECT pl.repository_id, r.full_name, pl.pull_request_number,
            pl.state AS lifecycle_state, pl.opened_at, pl.closed_at, pl.merged_at, pl.merge_sha,
            pl.pre_merge_run_id, pl.pre_merge_attention, pl.pre_merge_evidence_health,
            pl.unresolved_at_merge, pl.last_event_at AS lifecycle_last_event_at,
            latest.head_sha, latest.attention, latest.evaluated_at, latest.normalized_json,
            latest.run_id, latest.observation_source, latest.evidence_health, latest.created_at,
            COUNT(*) OVER() AS total_count
     FROM pull_request_lifecycle pl
     JOIN repositories r ON r.id = pl.repository_id
     LEFT JOIN latest ON latest.repository_id = pl.repository_id
       AND latest.pull_request_number = pl.pull_request_number AND latest.latest_rank = 1
     WHERE pl.repository_id IN (${REPOSITORY_SCOPE_SQL})
       ${repositoryFilter}
       AND pl.state = 'MERGED'
       AND pl.unresolved_at_merge = 1
       AND pl.merged_at IS NOT NULL
       AND datetime(pl.merged_at) >= datetime(?)
     ORDER BY datetime(pl.merged_at) DESC, pl.repository_id DESC, pl.pull_request_number DESC
     LIMIT ${MAX_ITEMS}`,
  ).bind(
    repositoryScope,
    repositoryScope,
    ...(input.repositoryId === null ? [] : [input.repositoryId]),
    input.start,
  ).all<MergeRow>();
  const rows = result.results ?? [];
  return {
    total: Number(rows[0]?.total_count ?? 0),
    items: rows.map((row) => {
      const lifecycle = lifecycleFromRow(row)!;
      const repository = splitRepository(row.repository_id, row.full_name);
      let latest: EvaluationSummaryV1 | undefined;
      if (row.head_sha && row.attention && row.evaluated_at) {
        latest = summaryFromRow({
          repository_id: row.repository_id,
          full_name: row.full_name,
          head_sha: row.head_sha,
          pull_request_number: row.pull_request_number,
          attention: row.attention,
          evaluated_at: row.evaluated_at,
          normalized_json: row.normalized_json ?? null,
          check_url: null,
          run_id: row.run_id,
          observation_source: row.observation_source,
          evidence_health: row.evidence_health,
          created_at: row.created_at,
        });
      }
      return {
        kind: 'merge' as const,
        repository: latest?.repository ?? repository,
        pullRequest: latest?.pullRequest ?? {
          number: row.pull_request_number,
          title: `PR #${row.pull_request_number}`,
          url: `https://github.com/${row.full_name}/pull/${row.pull_request_number}`,
        },
        ...(latest ? { latest } : {}),
        lifecycle,
      };
    }),
  };
}

export async function readActivityDrilldown(db: D1Database, input: DrilldownInput): Promise<OverviewDrilldownResponseV1> {
  if (!input.repositoryIds.length) {
    return {
      version: 1,
      metric: input.metric,
      selectedWindow: input.window,
      selectedRepositoryId: input.repositoryId,
      total: 0,
      trend: [],
      items: [],
      truncated: false,
    };
  }

  const [trend, data] = await Promise.all([
    readActivityTrend(db, input),
    input.metric === 'evaluations'
      ? evaluationItems(db, input)
      : input.metric === 'merged-unresolved'
        ? mergeItems(db, input)
        : pullRequestItems(db, input),
  ]);

  return {
    version: 1,
    metric: input.metric,
    selectedWindow: input.window,
    selectedRepositoryId: input.repositoryId,
    total: data.total,
    trend,
    items: data.items,
    truncated: data.total > data.items.length,
  };
}
