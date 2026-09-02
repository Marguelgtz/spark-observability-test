import type {
  AttentionLevelV1,
  EvaluationObservationSourceV1,
  EvidenceHealthV1,
  NotableTransitionKindV1,
} from '@spark/dashboard-contracts';
import type { D1Database } from './d1';
import { classifyNotableTransition, deriveTransitionDelta, sortRunsChronologically, type TrajectoryRunInput } from './change-trajectory';
import { detailFromRow, summaryFromRow } from './dashboard-reader';

const REPOSITORY_SCOPE_SQL = 'SELECT CAST(value AS INTEGER) FROM json_each(?)';
const TRANSITION_KINDS: NotableTransitionKindV1[] = [
  'ATTENTION_INCREASED',
  'ATTENTION_DECREASED',
  'EVIDENCE_REGRESSED',
  'EVIDENCE_RECOVERED',
  'EVIDENCE_BECAME_PENDING',
  'EVIDENCE_RESOLVED',
  'SENSITIVE_SURFACE_ADDED',
  'CHANGE_SCOPE_EXPANDED',
];

interface TransitionRunRow {
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

export interface NotableTransitionTrendPointV1 {
  bucketStart: string;
  total: number;
  regressions: number;
  recoveries: number;
  attentionIncreases: number;
  attentionDecreases: number;
}

export interface NotableTransitionInsightsV1 {
  total: number;
  material: number;
  info: number;
  affectedPRs: number;
  byKind: Array<{ kind: NotableTransitionKindV1; count: number }>;
  trend: NotableTransitionTrendPointV1[];
}

interface TransitionInsightInput {
  repositoryIds: number[];
  repositoryId: number | null;
  start: string;
  now: Date;
  window: '24h' | '7d' | '30d';
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

function emptyTrend(input: TransitionInsightInput): NotableTransitionTrendPointV1[] {
  const hourly = input.window === '24h';
  const first = floorBucket(new Date(input.start), hourly);
  const last = floorBucket(input.now, hourly);
  const step = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const points: NotableTransitionTrendPointV1[] = [];
  for (let timestamp = first.getTime(); timestamp <= last.getTime(); timestamp += step) {
    points.push({
      bucketStart: bucketKey(new Date(timestamp), hourly),
      total: 0,
      regressions: 0,
      recoveries: 0,
      attentionIncreases: 0,
      attentionDecreases: 0,
    });
  }
  return points;
}

function trajectoryInput(row: TransitionRunRow): TrajectoryRunInput {
  const summary = summaryFromRow(row);
  const detail = detailFromRow(row);
  return {
    summary,
    ...(detail.status === 'available' ? { detail: detail.detail } : {}),
    ...(row.created_at ? { createdAt: row.created_at } : {}),
  };
}

export function emptyNotableTransitionInsights(input: TransitionInsightInput): NotableTransitionInsightsV1 {
  return {
    total: 0,
    material: 0,
    info: 0,
    affectedPRs: 0,
    byKind: TRANSITION_KINDS.map((kind) => ({ kind, count: 0 })),
    trend: emptyTrend(input),
  };
}

export async function readNotableTransitionInsights(
  db: D1Database,
  input: TransitionInsightInput,
): Promise<NotableTransitionInsightsV1> {
  if (!input.repositoryIds.length) return emptyNotableTransitionInsights(input);
  const repositoryScope = JSON.stringify(input.repositoryIds);
  const repositoryFilter = input.repositoryId === null ? '' : 'AND er.repository_id = ?';
  const result = await db.prepare(
    `SELECT er.repository_id, r.full_name, er.head_sha, er.pull_request_number, er.attention,
            er.evaluated_at, er.normalized_json, NULL AS check_url,
            er.id AS run_id, er.observation_source, er.evidence_health, er.created_at
     FROM evaluation_runs er
     JOIN repositories r ON r.id = er.repository_id
     WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
       ${repositoryFilter}
       AND datetime(er.evaluated_at) <= datetime(?)
       AND (
         datetime(er.evaluated_at) >= datetime(?)
         OR er.id = (
           SELECT previous.id
           FROM evaluation_runs previous
           WHERE previous.repository_id = er.repository_id
             AND previous.pull_request_number = er.pull_request_number
             AND datetime(previous.evaluated_at) < datetime(?)
           ORDER BY datetime(previous.evaluated_at) DESC, datetime(previous.created_at) DESC, previous.id DESC
           LIMIT 1
         )
       )
       AND EXISTS (
         SELECT 1
         FROM evaluation_runs current_window
         WHERE current_window.repository_id = er.repository_id
           AND current_window.pull_request_number = er.pull_request_number
           AND datetime(current_window.evaluated_at) >= datetime(?)
           AND datetime(current_window.evaluated_at) <= datetime(?)
       )
     ORDER BY er.repository_id ASC, er.pull_request_number ASC,
              datetime(er.evaluated_at) ASC, datetime(er.created_at) ASC, er.id ASC`,
  ).bind(
    repositoryScope,
    ...(input.repositoryId === null ? [] : [input.repositoryId]),
    input.now.toISOString(),
    input.start,
    input.start,
    input.start,
    input.now.toISOString(),
  ).all<TransitionRunRow>();

  const grouped = new Map<string, TransitionRunRow[]>();
  for (const row of result.results ?? []) {
    const key = `${row.repository_id}:${row.pull_request_number}`;
    const rows = grouped.get(key) ?? [];
    rows.push(row);
    grouped.set(key, rows);
  }

  const kindCounts = new Map<NotableTransitionKindV1, number>(TRANSITION_KINDS.map((kind) => [kind, 0]));
  const affectedPRs = new Set<string>();
  const trend = emptyTrend(input);
  const byBucket = new Map(trend.map((point) => [point.bucketStart, point]));
  const hourly = input.window === '24h';
  let total = 0;
  let material = 0;
  let info = 0;

  for (const [prKey, rows] of grouped) {
    const chronological = sortRunsChronologically(rows.map(trajectoryInput));
    for (let index = 1; index < chronological.length; index += 1) {
      const notable = classifyNotableTransition(deriveTransitionDelta(chronological[index - 1], chronological[index]));
      if (!notable) continue;
      if (Date.parse(notable.occurredAt) < Date.parse(input.start) || Date.parse(notable.occurredAt) > input.now.getTime()) continue;

      total += 1;
      if (notable.severity === 'MATERIAL') material += 1;
      else info += 1;
      affectedPRs.add(prKey);
      for (const kind of notable.kinds) kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);

      const point = byBucket.get(bucketKey(new Date(notable.occurredAt), hourly));
      if (!point) continue;
      point.total += 1;
      if (notable.kinds.includes('EVIDENCE_REGRESSED')) point.regressions += 1;
      if (notable.kinds.includes('EVIDENCE_RECOVERED')) point.recoveries += 1;
      if (notable.kinds.includes('ATTENTION_INCREASED')) point.attentionIncreases += 1;
      if (notable.kinds.includes('ATTENTION_DECREASED')) point.attentionDecreases += 1;
    }
  }

  return {
    total,
    material,
    info,
    affectedPRs: affectedPRs.size,
    byKind: TRANSITION_KINDS.map((kind) => ({ kind, count: kindCounts.get(kind) ?? 0 })),
    trend,
  };
}
