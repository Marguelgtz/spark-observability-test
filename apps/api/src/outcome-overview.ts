import type {
  ActivityWindowV1,
  AttentionLevelV1,
  EvaluationObservationSourceV1,
  EvidenceHealthV1,
  TrajectoryFeedbackClassificationV1,
} from '@spark/dashboard-contracts';
import type { D1Database } from './d1';
import {
  classifyNotableTransition,
  deriveTransitionDelta,
  sortRunsChronologically,
  type TrajectoryRunInput,
} from './change-trajectory';
import { detailFromRow, summaryFromRow } from './dashboard-reader';

const REPOSITORY_SCOPE_SQL = 'SELECT CAST(value AS INTEGER) FROM json_each(?)';
const MAX_UNRESOLVED_ITEMS = 100;

interface MergeRow {
  repository_id: number;
  full_name: string;
  pull_request_number: number;
  merged_at: string;
  merge_sha?: string | null;
  pre_merge_attention?: AttentionLevelV1 | null;
  pre_merge_evidence_health?: EvidenceHealthV1 | null;
  unresolved_at_merge?: number | null;
}

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

interface FeedbackRow {
  repository_id: number;
  pull_request_number: number;
  transition_id: string;
  classification: TrajectoryFeedbackClassificationV1;
}

export interface OutcomeTimelinePointV1 {
  bucketStart: string;
  resolved: number;
  unresolved: number;
  unavailable: number;
}

export interface OutcomeTransitionTrendPointV1 {
  bucketStart: string;
  regressions: number;
  recoveries: number;
  attentionIncreases: number;
  attentionDecreases: number;
}

export interface OutcomeUnresolvedItemV1 {
  repository: { id: number; owner: string; name: string; url: string };
  pullRequest: { number: number; title: string; url: string };
  mergedAt: string;
  mergeSha?: string;
  preMergeAttention?: AttentionLevelV1;
  preMergeEvidenceHealth?: EvidenceHealthV1;
}

export interface OutcomeOverviewV1 {
  version: 1;
  selectedWindow: ActivityWindowV1;
  selectedRepositoryId: number | null;
  merges: {
    total: number;
    resolved: number;
    unresolved: number;
    unavailable: number;
  };
  preMergeAttention: Record<AttentionLevelV1, number> & { UNKNOWN: number };
  preMergeEvidence: Record<EvidenceHealthV1, number> & { UNAVAILABLE: number };
  stabilization: {
    regressedPRs: number;
    recoveredPRs: number;
    recoveredAfterRegressionPRs: number;
    oscillatingPRs: number;
    attentionIncreases: number;
    attentionDecreases: number;
    regressions: number;
    recoveries: number;
  };
  feedback: {
    materialTransitions: number;
    classifiedTransitions: number;
    classifications: Record<TrajectoryFeedbackClassificationV1, number>;
  };
  timeline: OutcomeTimelinePointV1[];
  transitionTrend: OutcomeTransitionTrendPointV1[];
  unresolved: OutcomeUnresolvedItemV1[];
  unresolvedTruncated: boolean;
}

interface OutcomeInput {
  repositoryIds: number[];
  repositoryId: number | null;
  githubUserId: number;
  start: string;
  now: Date;
  window: ActivityWindowV1;
}

function splitRepository(id: number, fullName: string) {
  const [owner = '', name = fullName] = fullName.split('/');
  return { id, owner, name, url: `https://github.com/${fullName}` };
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

function timeline<T extends { bucketStart: string }>(
  input: OutcomeInput,
  factory: (bucketStart: string) => T,
): T[] {
  const hourly = input.window === '24h';
  const first = floorBucket(new Date(input.start), hourly);
  const last = floorBucket(input.now, hourly);
  const step = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const points: T[] = [];
  for (let at = first.getTime(); at <= last.getTime(); at += step) {
    const key = bucketKey(new Date(at), hourly);
    points.push(factory(key));
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

function emptyOutcome(input: OutcomeInput): OutcomeOverviewV1 {
  return {
    version: 1,
    selectedWindow: input.window,
    selectedRepositoryId: input.repositoryId,
    merges: { total: 0, resolved: 0, unresolved: 0, unavailable: 0 },
    preMergeAttention: { LOW: 0, MEDIUM: 0, HIGH: 0, UNKNOWN: 0 },
    preMergeEvidence: { CLEAR: 0, FAILED: 0, PENDING_OR_MISSING: 0, UNKNOWN: 0, UNAVAILABLE: 0 },
    stabilization: {
      regressedPRs: 0,
      recoveredPRs: 0,
      recoveredAfterRegressionPRs: 0,
      oscillatingPRs: 0,
      attentionIncreases: 0,
      attentionDecreases: 0,
      regressions: 0,
      recoveries: 0,
    },
    feedback: {
      materialTransitions: 0,
      classifiedTransitions: 0,
      classifications: { USEFUL: 0, EXPECTED: 0, FALSE_POSITIVE: 0, FIXED_BECAUSE_SPARK: 0 },
    },
    timeline: timeline(input, (bucketStart) => ({ bucketStart, resolved: 0, unresolved: 0, unavailable: 0 })),
    transitionTrend: timeline(input, (bucketStart) => ({
      bucketStart,
      regressions: 0,
      recoveries: 0,
      attentionIncreases: 0,
      attentionDecreases: 0,
    })),
    unresolved: [],
    unresolvedTruncated: false,
  };
}

export async function readOutcomeOverview(db: D1Database, input: OutcomeInput): Promise<OutcomeOverviewV1> {
  if (!input.repositoryIds.length) return emptyOutcome(input);

  const repositoryScope = JSON.stringify(input.repositoryIds);
  const lifecycleRepositoryFilter = input.repositoryId === null ? '' : 'AND pl.repository_id = ?';
  const runRepositoryFilter = input.repositoryId === null ? '' : 'AND er.repository_id = ?';
  const feedbackRepositoryFilter = input.repositoryId === null ? '' : 'AND tf.repository_id = ?';

  const [mergeResult, transitionResult, feedbackResult] = await Promise.all([
    db.prepare(
      `SELECT pl.repository_id, r.full_name, pl.pull_request_number, pl.merged_at, pl.merge_sha,
              pl.pre_merge_attention, pl.pre_merge_evidence_health, pl.unresolved_at_merge
       FROM pull_request_lifecycle pl
       JOIN repositories r ON r.id = pl.repository_id
       WHERE pl.repository_id IN (${REPOSITORY_SCOPE_SQL})
         ${lifecycleRepositoryFilter}
         AND pl.state = 'MERGED'
         AND pl.merged_at IS NOT NULL
         AND datetime(pl.merged_at) >= datetime(?)
         AND datetime(pl.merged_at) <= datetime(?)
       ORDER BY datetime(pl.merged_at) DESC, pl.repository_id DESC, pl.pull_request_number DESC`,
    ).bind(
      repositoryScope,
      ...(input.repositoryId === null ? [] : [input.repositoryId]),
      input.start,
      input.now.toISOString(),
    ).all<MergeRow>(),

    db.prepare(
      `SELECT er.repository_id, r.full_name, er.head_sha, er.pull_request_number, er.attention,
              er.evaluated_at, er.normalized_json, NULL AS check_url,
              er.id AS run_id, er.observation_source, er.evidence_health, er.created_at
       FROM evaluation_runs er
       JOIN repositories r ON r.id = er.repository_id
       WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
         ${runRepositoryFilter}
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
    ).all<TransitionRunRow>(),

    db.prepare(
      `SELECT tf.repository_id, tf.pull_request_number, tf.transition_id, tf.classification
       FROM trajectory_feedback tf
       WHERE tf.github_user_id = ?
         AND tf.repository_id IN (${REPOSITORY_SCOPE_SQL})
         ${feedbackRepositoryFilter}`,
    ).bind(
      input.githubUserId,
      repositoryScope,
      ...(input.repositoryId === null ? [] : [input.repositoryId]),
    ).all<FeedbackRow>(),
  ]);

  const response = emptyOutcome(input);
  const mergeRows = mergeResult.results ?? [];
  response.merges.total = mergeRows.length;
  const mergeTimeline = new Map(response.timeline.map((point) => [point.bucketStart, point]));
  const hourly = input.window === '24h';

  for (const row of mergeRows) {
    if (row.unresolved_at_merge === 1) response.merges.unresolved += 1;
    else if (row.unresolved_at_merge === 0) response.merges.resolved += 1;
    else response.merges.unavailable += 1;

    if (row.pre_merge_attention === 'LOW' || row.pre_merge_attention === 'MEDIUM' || row.pre_merge_attention === 'HIGH') {
      response.preMergeAttention[row.pre_merge_attention] += 1;
    } else {
      response.preMergeAttention.UNKNOWN += 1;
    }

    if (row.pre_merge_evidence_health === 'CLEAR'
      || row.pre_merge_evidence_health === 'FAILED'
      || row.pre_merge_evidence_health === 'PENDING_OR_MISSING'
      || row.pre_merge_evidence_health === 'UNKNOWN') {
      response.preMergeEvidence[row.pre_merge_evidence_health] += 1;
    } else {
      response.preMergeEvidence.UNAVAILABLE += 1;
    }

    const point = mergeTimeline.get(bucketKey(new Date(row.merged_at), hourly));
    if (point) {
      if (row.unresolved_at_merge === 1) point.unresolved += 1;
      else if (row.unresolved_at_merge === 0) point.resolved += 1;
      else point.unavailable += 1;
    }
  }

  const unresolvedRows = mergeRows.filter((row) => row.unresolved_at_merge === 1);
  response.unresolvedTruncated = unresolvedRows.length > MAX_UNRESOLVED_ITEMS;
  response.unresolved = unresolvedRows.slice(0, MAX_UNRESOLVED_ITEMS).map((row) => {
    const repository = splitRepository(row.repository_id, row.full_name);
    return {
      repository,
      pullRequest: {
        number: row.pull_request_number,
        title: `PR #${row.pull_request_number}`,
        url: `https://github.com/${row.full_name}/pull/${row.pull_request_number}`,
      },
      mergedAt: row.merged_at,
      ...(row.merge_sha ? { mergeSha: row.merge_sha } : {}),
      ...(row.pre_merge_attention ? { preMergeAttention: row.pre_merge_attention } : {}),
      ...(row.pre_merge_evidence_health ? { preMergeEvidenceHealth: row.pre_merge_evidence_health } : {}),
    };
  });

  const grouped = new Map<string, TransitionRunRow[]>();
  for (const row of transitionResult.results ?? []) {
    const key = `${row.repository_id}:${row.pull_request_number}`;
    const rows = grouped.get(key) ?? [];
    rows.push(row);
    grouped.set(key, rows);
  }

  const transitionTimeline = new Map(response.transitionTrend.map((point) => [point.bucketStart, point]));
  const regressedPRs = new Set<string>();
  const recoveredPRs = new Set<string>();
  const recoveredAfterRegressionPRs = new Set<string>();
  const attentionDirections = new Map<string, Set<'INCREASED' | 'DECREASED'>>();
  const attentionMovementCounts = new Map<string, number>();
  const materialTransitionKeys = new Set<string>();

  for (const [prKey, rows] of grouped) {
    const chronological = sortRunsChronologically(rows.map(trajectoryInput));
    let regressionSeenInWindow = false;
    for (let index = 1; index < chronological.length; index += 1) {
      const notable = classifyNotableTransition(deriveTransitionDelta(chronological[index - 1], chronological[index]));
      if (!notable) continue;
      const occurredAt = Date.parse(notable.occurredAt);
      if (occurredAt < Date.parse(input.start) || occurredAt > input.now.getTime()) continue;

      const [repositoryId, pullRequestNumber] = prKey.split(':');
      if (notable.severity === 'MATERIAL') {
        materialTransitionKeys.add(`${repositoryId}:${pullRequestNumber}:${notable.id}`);
      }

      const point = transitionTimeline.get(bucketKey(new Date(notable.occurredAt), hourly));
      if (notable.kinds.includes('EVIDENCE_REGRESSED')) {
        response.stabilization.regressions += 1;
        regressedPRs.add(prKey);
        regressionSeenInWindow = true;
        if (point) point.regressions += 1;
      }
      if (notable.kinds.includes('EVIDENCE_RECOVERED')) {
        response.stabilization.recoveries += 1;
        recoveredPRs.add(prKey);
        if (regressionSeenInWindow) recoveredAfterRegressionPRs.add(prKey);
        if (point) point.recoveries += 1;
      }
      if (notable.kinds.includes('ATTENTION_INCREASED')) {
        response.stabilization.attentionIncreases += 1;
        const directions = attentionDirections.get(prKey) ?? new Set<'INCREASED' | 'DECREASED'>();
        directions.add('INCREASED');
        attentionDirections.set(prKey, directions);
        attentionMovementCounts.set(prKey, (attentionMovementCounts.get(prKey) ?? 0) + 1);
        if (point) point.attentionIncreases += 1;
      }
      if (notable.kinds.includes('ATTENTION_DECREASED')) {
        response.stabilization.attentionDecreases += 1;
        const directions = attentionDirections.get(prKey) ?? new Set<'INCREASED' | 'DECREASED'>();
        directions.add('DECREASED');
        attentionDirections.set(prKey, directions);
        attentionMovementCounts.set(prKey, (attentionMovementCounts.get(prKey) ?? 0) + 1);
        if (point) point.attentionDecreases += 1;
      }
    }
  }

  response.stabilization.regressedPRs = regressedPRs.size;
  response.stabilization.recoveredPRs = recoveredPRs.size;
  response.stabilization.recoveredAfterRegressionPRs = recoveredAfterRegressionPRs.size;
  response.stabilization.oscillatingPRs = [...attentionDirections.entries()].filter(([prKey, directions]) =>
    directions.size > 1 && (attentionMovementCounts.get(prKey) ?? 0) >= 2,
  ).length;

  response.feedback.materialTransitions = materialTransitionKeys.size;
  for (const row of feedbackResult.results ?? []) {
    const key = `${row.repository_id}:${row.pull_request_number}:${row.transition_id}`;
    if (!materialTransitionKeys.has(key)) continue;
    response.feedback.classifiedTransitions += 1;
    response.feedback.classifications[row.classification] += 1;
  }

  return response;
}
