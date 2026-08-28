import type { ActivityWindowV1 } from '@spark/dashboard-contracts';
import type { D1Database } from './d1';

const REPOSITORY_SCOPE_SQL = 'SELECT CAST(value AS INTEGER) FROM json_each(?)';

export interface ActivityTrendPointV1 {
  bucketStart: string;
  observedPRs: number;
  evaluations: number;
  attentionEvaluations: number;
  mergedUnresolved: number;
}

interface TrendRow {
  bucket_start: string;
  observed_prs: number;
  evaluations: number;
  attention_evaluations: number;
}

interface MergeTrendRow {
  bucket_start: string;
  merged_unresolved: number;
}

interface ActivityTrendInput {
  repositoryIds: number[];
  repositoryId: number | null;
  start: string;
  now: Date;
  window: ActivityWindowV1;
}

function floorBucket(value: Date, hourly: boolean): Date {
  const result = new Date(value);
  result.setUTCMinutes(0, 0, 0);
  if (!hourly) result.setUTCHours(0);
  return result;
}

function bucketKey(value: Date, hourly: boolean): string {
  if (hourly) return `${value.toISOString().slice(0, 13)}:00:00Z`;
  return `${value.toISOString().slice(0, 10)}T00:00:00Z`;
}

function emptyBuckets(start: string, now: Date, hourly: boolean): ActivityTrendPointV1[] {
  const first = floorBucket(new Date(start), hourly);
  const last = floorBucket(now, hourly);
  const step = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const buckets: ActivityTrendPointV1[] = [];
  for (let timestamp = first.getTime(); timestamp <= last.getTime(); timestamp += step) {
    const date = new Date(timestamp);
    buckets.push({
      bucketStart: bucketKey(date, hourly),
      observedPRs: 0,
      evaluations: 0,
      attentionEvaluations: 0,
      mergedUnresolved: 0,
    });
  }
  return buckets;
}

export async function readActivityTrend(db: D1Database, input: ActivityTrendInput): Promise<ActivityTrendPointV1[]> {
  if (!input.repositoryIds.length) return [];
  const hourly = input.window === '24h';
  const format = hourly ? '%Y-%m-%dT%H:00:00Z' : '%Y-%m-%dT00:00:00Z';
  const repositoryScope = JSON.stringify(input.repositoryIds);
  const repositoryFilter = input.repositoryId === null ? '' : 'AND er.repository_id = ?';
  const lifecycleRepositoryFilter = input.repositoryId === null ? '' : 'AND pl.repository_id = ?';

  const runRows = await db.prepare(
    `SELECT strftime(?, er.evaluated_at) AS bucket_start,
            COUNT(DISTINCT CAST(er.repository_id AS TEXT) || ':' || CAST(er.pull_request_number AS TEXT)) AS observed_prs,
            COUNT(*) AS evaluations,
            SUM(CASE WHEN er.attention IN ('HIGH', 'MEDIUM') THEN 1 ELSE 0 END) AS attention_evaluations
     FROM evaluation_runs er
     WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
       ${repositoryFilter}
       AND datetime(er.evaluated_at) >= datetime(?)
       AND datetime(er.evaluated_at) <= datetime(?)
     GROUP BY bucket_start
     ORDER BY bucket_start ASC`,
  ).bind(
    format,
    repositoryScope,
    ...(input.repositoryId === null ? [] : [input.repositoryId]),
    input.start,
    input.now.toISOString(),
  ).all<TrendRow>();

  const mergeRows = await db.prepare(
    `SELECT strftime(?, pl.merged_at) AS bucket_start,
            COUNT(*) AS merged_unresolved
     FROM pull_request_lifecycle pl
     WHERE pl.repository_id IN (${REPOSITORY_SCOPE_SQL})
       ${lifecycleRepositoryFilter}
       AND pl.state = 'MERGED'
       AND pl.unresolved_at_merge = 1
       AND pl.merged_at IS NOT NULL
       AND datetime(pl.merged_at) >= datetime(?)
       AND datetime(pl.merged_at) <= datetime(?)
     GROUP BY bucket_start
     ORDER BY bucket_start ASC`,
  ).bind(
    format,
    repositoryScope,
    ...(input.repositoryId === null ? [] : [input.repositoryId]),
    input.start,
    input.now.toISOString(),
  ).all<MergeTrendRow>();

  const buckets = emptyBuckets(input.start, input.now, hourly);
  const byKey = new Map(buckets.map((point) => [point.bucketStart, point]));
  for (const row of runRows.results ?? []) {
    const point = byKey.get(row.bucket_start);
    if (!point) continue;
    point.observedPRs = Number(row.observed_prs ?? 0);
    point.evaluations = Number(row.evaluations ?? 0);
    point.attentionEvaluations = Number(row.attention_evaluations ?? 0);
  }
  for (const row of mergeRows.results ?? []) {
    const point = byKey.get(row.bucket_start);
    if (point) point.mergedUnresolved = Number(row.merged_unresolved ?? 0);
  }
  return buckets;
}
