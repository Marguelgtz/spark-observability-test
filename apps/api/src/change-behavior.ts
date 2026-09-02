import type {
  AttentionLevelV1,
  NotableTransitionKindV1,
  PullRequestTrajectoryV1,
} from '@spark/dashboard-contracts';
import type {
  BehaviorArchetypeV1,
  BehaviorBoundaryV1,
  BehaviorEventKindV1,
  ChangeBehaviorV1,
} from '@spark/dashboard-contracts/behavior';
import { deriveBehaviorMotifs } from './behavior-motifs';

const ATTENTION_RANK: Record<AttentionLevelV1, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const KIND_ORDER: BehaviorEventKindV1[] = [
  'SCOPE_EXPANDED',
  'SENSITIVE_SURFACE_ADDED',
  'EVIDENCE_WORSE',
  'EVIDENCE_BETTER',
  'ATTENTION_UP',
  'ATTENTION_DOWN',
];

function normalizeKinds(sourceKinds: NotableTransitionKindV1[]): BehaviorEventKindV1[] {
  const normalized = new Set<BehaviorEventKindV1>();
  for (const kind of sourceKinds) {
    if (kind === 'ATTENTION_INCREASED') normalized.add('ATTENTION_UP');
    else if (kind === 'ATTENTION_DECREASED') normalized.add('ATTENTION_DOWN');
    else if (kind === 'EVIDENCE_REGRESSED' || kind === 'EVIDENCE_BECAME_PENDING') normalized.add('EVIDENCE_WORSE');
    else if (kind === 'EVIDENCE_RECOVERED' || kind === 'EVIDENCE_RESOLVED') normalized.add('EVIDENCE_BETTER');
    else if (kind === 'SENSITIVE_SURFACE_ADDED') normalized.add('SENSITIVE_SURFACE_ADDED');
    else if (kind === 'CHANGE_SCOPE_EXPANDED') normalized.add('SCOPE_EXPANDED');
  }
  return KIND_ORDER.filter((kind) => normalized.has(kind));
}

function boundariesFromTrajectory(trajectory: PullRequestTrajectoryV1): BehaviorBoundaryV1[] {
  return trajectory.notableTransitions
    .map((transition) => ({
      transitionId: transition.id,
      occurredAt: transition.occurredAt,
      kinds: normalizeKinds(transition.kinds),
      sourceKinds: transition.kinds,
      severity: transition.severity,
    }))
    .filter((boundary) => boundary.kinds.length > 0)
    .sort((left, right) => {
      const time = left.occurredAt.localeCompare(right.occurredAt);
      return time !== 0 ? time : left.transitionId.localeCompare(right.transitionId);
    });
}

function chronologicalRuns(trajectory: PullRequestTrajectoryV1) {
  return [...trajectory.runs].sort((left, right) => {
    const time = left.evaluatedAt.localeCompare(right.evaluatedAt);
    if (time !== 0) return time;
    return (left.runId ?? left.headSha).localeCompare(right.runId ?? right.headSha);
  });
}

function peakAttention(attentions: AttentionLevelV1[]): AttentionLevelV1 {
  return attentions.reduce((peak, attention) =>
    ATTENTION_RANK[attention] > ATTENTION_RANK[peak] ? attention : peak, attentions[0]);
}

function observedTimeAtHighMs(trajectory: PullRequestTrajectoryV1): number {
  const runs = chronologicalRuns(trajectory);
  let total = 0;
  for (let index = 0; index + 1 < runs.length; index += 1) {
    if (runs[index].attention !== 'HIGH') continue;
    const duration = Date.parse(runs[index + 1].evaluatedAt) - Date.parse(runs[index].evaluatedAt);
    if (Number.isFinite(duration)) total += Math.max(0, duration);
  }
  const last = runs[runs.length - 1];
  const terminalAt = trajectory.lifecycle?.mergedAt ?? trajectory.lifecycle?.closedAt;
  if (last?.attention === 'HIGH' && terminalAt) {
    const duration = Date.parse(terminalAt) - Date.parse(last.evaluatedAt);
    if (Number.isFinite(duration)) total += Math.max(0, duration);
  }
  return total;
}

function attentionSignature(attentions: AttentionLevelV1[]): string {
  const compressed: AttentionLevelV1[] = [];
  for (const attention of attentions) {
    if (compressed[compressed.length - 1] !== attention) compressed.push(attention);
  }
  return `v1:${compressed.join('>')}`;
}

function fullSignature(boundaries: BehaviorBoundaryV1[]): string {
  if (!boundaries.length) return 'v1:NO_NOTABLE_BOUNDARIES';
  return `v1:${boundaries.map((boundary) => boundary.kinds.join('+')).join('>')}`;
}

function archetypes(
  initial: AttentionLevelV1,
  peak: AttentionLevelV1,
  final: AttentionLevelV1,
  attentionIncreaseCount: number,
  attentionDecreaseCount: number,
  oscillatedAttention: boolean,
): BehaviorArchetypeV1[] {
  const values: BehaviorArchetypeV1[] = [];
  if (attentionIncreaseCount === 0 && attentionDecreaseCount === 0) {
    values.push({ kind: 'STABLE', evidence: [`Attention remained ${final}`] });
  }
  if (ATTENTION_RANK[final] > ATTENTION_RANK[initial]) {
    values.push({
      kind: 'DETERIORATING',
      evidence: [`Attention moved from ${initial} to ${final}`, `Peak attention ${peak}`],
    });
  }
  if (ATTENTION_RANK[peak] > ATTENTION_RANK[final] && attentionDecreaseCount > 0) {
    values.push({
      kind: 'RECOVERED',
      evidence: [`Peak attention ${peak}`, `Final attention ${final}`, `${attentionDecreaseCount} attention decrease${attentionDecreaseCount === 1 ? '' : 's'}`],
    });
  }
  if (oscillatedAttention) {
    values.push({
      kind: 'OSCILLATING',
      evidence: [`${attentionIncreaseCount} attention increases`, `${attentionDecreaseCount} attention decreases`],
    });
  }
  return values;
}

export function deriveChangeBehavior(trajectory: PullRequestTrajectoryV1): ChangeBehaviorV1 {
  const runs = chronologicalRuns(trajectory);
  const initial = runs[0];
  const final = runs[runs.length - 1];
  const boundaries = boundariesFromTrajectory(trajectory);
  const motifs = deriveBehaviorMotifs(boundaries);
  const attentions = runs.map((run) => run.attention);
  const peak = peakAttention(attentions);
  const attentionIncreaseCount = boundaries.filter((boundary) => boundary.kinds.includes('ATTENTION_UP')).length;
  const attentionDecreaseCount = boundaries.filter((boundary) => boundary.kinds.includes('ATTENTION_DOWN')).length;
  const evidenceRegressionCount = boundaries.filter((boundary) => boundary.kinds.includes('EVIDENCE_WORSE')).length;
  const evidenceRecoveryCount = boundaries.filter((boundary) => boundary.kinds.includes('EVIDENCE_BETTER')).length;
  const regressionThenRecovery = motifs.some((motif) => motif.kind === 'REGRESSION_THEN_RECOVERY');
  const oscillatedAttention = motifs.some((motif) => motif.kind === 'ATTENTION_OSCILLATION');
  const firstRegression = boundaries.find((boundary) => boundary.kinds.includes('EVIDENCE_WORSE'));
  const firstRecoveryAfterRegression = firstRegression
    ? boundaries.find((boundary) => boundary.occurredAt >= firstRegression.occurredAt && boundary.kinds.includes('EVIDENCE_BETTER'))
    : undefined;
  const timeToFirstRegressionMs = firstRegression
    ? Math.max(0, Date.parse(firstRegression.occurredAt) - Date.parse(initial.evaluatedAt))
    : undefined;
  const timeToFirstRecoveryAfterRegressionMs = firstRegression && firstRecoveryAfterRegression
    ? Math.max(0, Date.parse(firstRecoveryAfterRegression.occurredAt) - Date.parse(firstRegression.occurredAt))
    : undefined;
  const firstHighIndex = runs.findIndex((run) => run.attention === 'HIGH');
  const recoveredFromHigh = firstHighIndex >= 0 && runs.slice(firstHighIndex + 1).some((run) => run.attention !== 'HIGH');

  return {
    version: 1,
    behaviorSchemaVersion: 1,
    repository: trajectory.repository,
    pullRequest: trajectory.pullRequest,
    startedAt: initial.evaluatedAt,
    lastEvaluatedAt: final.evaluatedAt,
    initialAttention: initial.attention,
    peakAttention: peak,
    finalAttention: final.attention,
    boundaries,
    motifs,
    archetypes: archetypes(
      initial.attention,
      peak,
      final.attention,
      attentionIncreaseCount,
      attentionDecreaseCount,
      oscillatedAttention,
    ),
    features: {
      evaluationCount: runs.length,
      notableBoundaryCount: boundaries.length,
      attentionIncreaseCount,
      attentionDecreaseCount,
      evidenceRegressionCount,
      evidenceRecoveryCount,
      sensitiveSurfaceAdditionCount: boundaries.filter((boundary) => boundary.kinds.includes('SENSITIVE_SURFACE_ADDED')).length,
      scopeExpansionCount: boundaries.filter((boundary) => boundary.kinds.includes('SCOPE_EXPANDED')).length,
      reachedHigh: attentions.includes('HIGH'),
      recoveredFromHigh,
      regressionThenRecovery,
      oscillatedAttention,
      timeAtHighMs: observedTimeAtHighMs(trajectory),
      ...(timeToFirstRegressionMs !== undefined ? { timeToFirstRegressionMs } : {}),
      ...(timeToFirstRecoveryAfterRegressionMs !== undefined ? { timeToFirstRecoveryAfterRegressionMs } : {}),
    },
    signatures: {
      full: fullSignature(boundaries),
      attention: attentionSignature(attentions),
    },
    ...(trajectory.lifecycle ? { lifecycle: trajectory.lifecycle } : {}),
    ...(trajectory.historyCompleteness ? { historyCompleteness: trajectory.historyCompleteness } : {}),
    truncated: trajectory.truncated,
  };
}
