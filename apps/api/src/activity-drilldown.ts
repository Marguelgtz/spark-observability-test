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
const MAX_ITEMS = 50;

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
  pagination: { nextCursor: string | null };
  /** @deprecated Prefer pagination.nextCursor. */
  truncated: boolean;
}

interface DrilldownInput {
  metric: OverviewMetricV1;
  window: ActivityWindowV1;
  repositoryIds: number[];
  repositoryId: number | null;
  start: string;
  now: Date;
  cursor?: string | null;
  limit?: number;
}

interface DrilldownCursorV1 {
  v: 1;
  m: OverviewMetricV1;
  t: string;
  r: number;
  p: number;
  c?: string;
  i?: string;
  a?: AttentionLevelV1;
}

export class InvalidOverviewCursorError extends Error {}

function encodeCursor(cursor: DrilldownCursorV1): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(value: string | null | undefined, metric: OverviewMetricV1): DrilldownCursorV1 | undefined {
  if (!value) return undefined;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const parsed = JSON.parse(atob(padded)) as Partial<DrilldownCursorV1>;
    if (parsed.v !== 1 || parsed.m !== metric || typeof parsed.t !== 'string'
      || typeof parsed.r !== 'number' || typeof parsed.p !== 'number') throw new Error('invalid');
    if (metric === 'evaluations' && (typeof parsed.c !== 'string' || typeof parsed.i !== 'string')) throw new Error('invalid');
    if (metric === 'attention' && parsed.a !== 'HIGH' && parsed.a !== 'MEDIUM') throw new Error('invalid');
    return parsed as DrilldownCursorV1;
  } catch {
    throw new InvalidOverviewCursorError('Invalid overview cursor');
  }
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

interface DrilldownData {
  total: number;
  items: OverviewDrilldownItemV1[];
  nextCursor: string | null;
}

async function pullRequestItems(db: D1Database, input: DrilldownInput): Promise<DrilldownData> {
  const repositoryScope = JSON.stringify(input.repositoryIds);
  const repositoryFilter = input.repositoryId === null ? '' : 'AND er.repository_id = ?';
  const cursor = decodeCursor(input.cursor, input.metric);
  const limit = Math.max(1, Math.min(input.limit ?? 15, MAX_ITEMS));
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
     ), base AS (
       SELECT ${commonPullRequestSelect()}, COUNT(*) OVER() AS total_count
       FROM latest
       JOIN history ON history.repository_id = latest.repository_id AND history.pull_request_number = latest.pull_request_number
       LEFT JOIN pull_request_lifecycle pl ON pl.repository_id = latest.repository_id AND pl.pull_request_number = latest.pull_request_number
       WHERE latest.latest_rank = 1
         AND datetime(latest.evaluated_at) >= datetime(?)
         AND latest.attention IN ('HIGH', 'MEDIUM')
         AND (pl.state IS NULL OR pl.state = 'OPEN')
     )
     SELECT * FROM base
     ${cursor ? `WHERE (CASE attention WHEN 'HIGH' THEN 0 ELSE 1 END > ?
       OR (CASE attention WHEN 'HIGH' THEN 0 ELSE 1 END = ? AND
         (evaluated_at < ? OR (evaluated_at = ? AND repository_id < ?)
          OR (evaluated_at = ? AND repository_id = ? AND pull_request_number < ?))))` : ''}
     ORDER BY CASE attention WHEN 'HIGH' THEN 0 ELSE 1 END,
              datetime(evaluated_at) DESC, repository_id DESC, pull_request_number DESC
     LIMIT ?`;
    const rank = cursor?.a === 'HIGH' ? 0 : 1;
    bindings = [
      repositoryScope,
      ...(input.repositoryId === null ? [] : [input.repositoryId]),
      repositoryScope,
      input.start,
      ...(cursor ? [rank, rank, cursor.t, cursor.t, cursor.r, cursor.t, cursor.r, cursor.p] : []),
      limit + 1,
    ];
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
     ), base AS (
       SELECT ${commonPullRequestSelect()}, COUNT(*) OVER() AS total_count
       FROM latest
       JOIN window_prs ON window_prs.repository_id = latest.repository_id AND window_prs.pull_request_number = latest.pull_request_number
       JOIN history ON history.repository_id = latest.repository_id AND history.pull_request_number = latest.pull_request_number
       LEFT JOIN pull_request_lifecycle pl ON pl.repository_id = latest.repository_id AND pl.pull_request_number = latest.pull_request_number
       WHERE latest.latest_rank = 1
     )
     SELECT * FROM base
     ${cursor ? `WHERE (evaluated_at < ? OR (evaluated_at = ? AND repository_id < ?)
       OR (evaluated_at = ? AND repository_id = ? AND pull_request_number < ?))` : ''}
     ORDER BY datetime(evaluated_at) DESC, repository_id DESC, pull_request_number DESC
     LIMIT ?`;
    bindings = [
      repositoryScope,
      repositoryScope,
      ...(input.repositoryId === null ? [] : [input.repositoryId]),
      input.start,
      repositoryScope,
      ...(cursor ? [cursor.t, cursor.t, cursor.r, cursor.t, cursor.r, cursor.p] : []),
      limit + 1,
    ];
  }

  const result = await db.prepare(query).bind(...bindings).all<PullRequestRow>();
  const rows = result.results ?? [];
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    total: Number(rows[0]?.total_count ?? 0),
    items: page.map((row) => {
      const lifecycle = lifecycleFromRow(row);
      return { kind: 'pull-request' as const, activity: activityFromRow(row), ...(lifecycle ? { lifecycle } : {}) };
    }),
    nextCursor: rows.length > limit && last
      ? encodeCursor({ v: 1, m: input.metric, t: last.evaluated_at, r: last.repository_id, p: last.pull_request_number, ...(input.metric === 'attention' ? { a: last.attention } : {}) })
      : null,
  };
}

async function evaluationItems(db: D1Database, input: DrilldownInput): Promise<DrilldownData> {
  const repositoryScope = JSON.stringify(input.repositoryIds);
  const repositoryFilter = input.repositoryId === null ? '' : 'AND er.repository_id = ?';
  const cursor = decodeCursor(input.cursor, input.metric);
  const limit = Math.max(1, Math.min(input.limit ?? 15, MAX_ITEMS));
  const result = await db.prepare(
    `WITH base AS (
       SELECT er.repository_id, r.full_name, er.head_sha, er.pull_request_number, er.attention,
            er.evaluated_at, er.normalized_json, NULL AS check_url,
            er.id AS run_id, er.observation_source, er.evidence_health, er.created_at,
            COUNT(*) OVER() AS total_count
       FROM evaluation_runs er
       JOIN repositories r ON r.id = er.repository_id
       WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
         ${repositoryFilter}
         AND datetime(er.evaluated_at) >= datetime(?)
     )
     SELECT * FROM base
     ${cursor ? `WHERE (evaluated_at < ? OR (evaluated_at = ? AND created_at < ?)
       OR (evaluated_at = ? AND created_at = ? AND run_id < ?))` : ''}
     ORDER BY datetime(evaluated_at) DESC, datetime(created_at) DESC, run_id DESC
     LIMIT ?`,
  ).bind(
    repositoryScope,
    ...(input.repositoryId === null ? [] : [input.repositoryId]),
    input.start,
    ...(cursor ? [cursor.t, cursor.t, cursor.c, cursor.t, cursor.c, cursor.i] : []),
    limit + 1,
  ).all<EvaluationRow>();
  const rows = result.results ?? [];
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    total: Number(rows[0]?.total_count ?? 0),
    items: page.map((row) => ({ kind: 'evaluation' as const, evaluation: summaryFromRow(row) })),
    nextCursor: rows.length > limit && last && last.created_at && last.run_id
      ? encodeCursor({ v: 1, m: input.metric, t: last.evaluated_at, c: last.created_at, i: last.run_id, r: last.repository_id, p: last.pull_request_number })
      : null,
  };
}

async function mergeItems(db: D1Database, input: DrilldownInput): Promise<DrilldownData> {
  const repositoryScope = JSON.stringify(input.repositoryIds);
  const repositoryFilter = input.repositoryId === null ? '' : 'AND pl.repository_id = ?';
  const cursor = decodeCursor(input.cursor, input.metric);
  const limit = Math.max(1, Math.min(input.limit ?? 15, MAX_ITEMS));
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
     ), base AS (
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
     )
     SELECT * FROM base
     ${cursor ? `WHERE (merged_at < ? OR (merged_at = ? AND repository_id < ?)
       OR (merged_at = ? AND repository_id = ? AND pull_request_number < ?))` : ''}
     ORDER BY datetime(merged_at) DESC, repository_id DESC, pull_request_number DESC
     LIMIT ?`,
  ).bind(
    repositoryScope,
    repositoryScope,
    ...(input.repositoryId === null ? [] : [input.repositoryId]),
    input.start,
    ...(cursor ? [cursor.t, cursor.t, cursor.r, cursor.t, cursor.r, cursor.p] : []),
    limit + 1,
  ).all<MergeRow>();
  const rows = result.results ?? [];
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    total: Number(rows[0]?.total_count ?? 0),
    items: page.map((row) => {
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
    nextCursor: rows.length > limit && last && last.merged_at
      ? encodeCursor({ v: 1, m: input.metric, t: last.merged_at, r: last.repository_id, p: last.pull_request_number })
      : null,
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
      pagination: { nextCursor: null },
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
    pagination: { nextCursor: data.nextCursor },
    truncated: data.nextCursor !== null,
  };
}
