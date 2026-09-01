import type {
  AttentionLevelV1,
  EvaluationDetailV1,
  EvaluationSummaryV1,
  EvidenceStatusV1,
  HistoryCompletenessV1,
  NotableTransitionKindV1,
  NotableTransitionV1,
  PullRequestEvidenceIssueV1,
  PullRequestInsightV1,
  PullRequestLifecycleV1,
  PullRequestTrajectoryV1,
  TransitionDeltaV1,
} from '@spark/dashboard-contracts';
import { evidenceHealth } from './pull-request-insights';

export interface TrajectoryRunInput {
  summary: EvaluationSummaryV1;
  detail?: EvaluationDetailV1;
  createdAt?: string;
}

export interface TrajectoryBuildOptions {
  totalRuns?: number;
  firstEvaluatedAt?: string;
  lastEvaluatedAt?: string;
  historyCompleteness?: HistoryCompletenessV1;
  evidenceIssues?: PullRequestEvidenceIssueV1[];
  insights?: PullRequestInsightV1[];
  lifecycle?: PullRequestLifecycleV1;
}

const ATTENTION_RANK: Record<AttentionLevelV1, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function runId(run: TrajectoryRunInput): string {
  return run.summary.runId
    ?? `legacy:${run.summary.repository.id}:${run.summary.headSha}:${run.summary.evaluatedAt}`;
}

function compareRuns(left: TrajectoryRunInput, right: TrajectoryRunInput): number {
  const evaluated = left.summary.evaluatedAt.localeCompare(right.summary.evaluatedAt);
  if (evaluated !== 0) return evaluated;
  const created = (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
  if (created !== 0) return created;
  return runId(left).localeCompare(runId(right));
}

export function sortRunsChronologically(runs: TrajectoryRunInput[]): TrajectoryRunInput[] {
  return [...runs].sort(compareRuns);
}

function setDelta(previous: string[], current: string[]): { added: string[]; removed: string[] } {
  const before = new Set(previous);
  const after = new Set(current);
  return {
    added: [...after].filter(value => !before.has(value)).sort(),
    removed: [...before].filter(value => !after.has(value)).sort(),
  };
}

function evidenceDelta(previous?: EvaluationDetailV1, current?: EvaluationDetailV1): TransitionDeltaV1['evidence'] {
  if (!previous || !current) return [];
  const before = new Map(previous.evidence.map(item => [item.name, item.status]));
  const after = new Map(current.evidence.map(item => [item.name, item.status]));
  const names = new Set([...before.keys(), ...after.keys()]);
  const changes: TransitionDeltaV1['evidence'] = [];
  for (const name of [...names].sort()) {
    const from = before.get(name);
    const to = after.get(name);
    if (from === to) continue;
    if (from === undefined) changes.push({ name, to, change: 'ADDED' });
    else if (to === undefined) changes.push({ name, from, change: 'REMOVED' });
    else changes.push({ name, from, to, change: 'STATUS_CHANGED' });
  }
  return changes;
}

function profileDelta(previous?: EvaluationDetailV1, current?: EvaluationDetailV1): TransitionDeltaV1['profile'] {
  if (!previous || !current) return undefined;
  const fromSourceSha = previous.profile.sourceSha;
  const toSourceSha = current.profile.sourceSha;
  const changed = previous.profile.state !== current.profile.state || fromSourceSha !== toSourceSha;
  return changed ? {
    changed,
    ...(fromSourceSha ? { fromSourceSha } : {}),
    ...(toSourceSha ? { toSourceSha } : {}),
  } : undefined;
}

export function deriveTransitionDelta(previous: TrajectoryRunInput, current: TrajectoryRunInput): TransitionDeltaV1 {
  const previousDetail = previous.detail;
  const currentDetail = current.detail;
  const direct = setDelta(previousDetail?.directAreas ?? [], currentDetail?.directAreas ?? []);
  const affected = setDelta(previousDetail?.affectedAreas ?? [], currentDetail?.affectedAreas ?? []);
  const sensitive = setDelta(previousDetail?.sensitiveSurfaces ?? previous.summary.sensitiveSurfaces, currentDetail?.sensitiveSurfaces ?? current.summary.sensitiveSurfaces);
  const files = setDelta(previousDetail?.changedFiles.map(file => file.path) ?? [], currentDetail?.changedFiles.map(file => file.path) ?? []);
  const reasons = setDelta(previousDetail?.reasons ?? previous.summary.topReasons, currentDetail?.reasons ?? current.summary.topReasons);
  const profile = profileDelta(previousDetail, currentDetail);
  const fromHealth = evidenceHealth(previous.summary);
  const toHealth = evidenceHealth(current.summary);
  const elapsed = Date.parse(current.summary.evaluatedAt) - Date.parse(previous.summary.evaluatedAt);
  return {
    fromRunId: runId(previous),
    toRunId: runId(current),
    fromHeadSha: previous.summary.headSha,
    toHeadSha: current.summary.headSha,
    evaluatedAt: current.summary.evaluatedAt,
    timeInPreviousStateMs: Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0,
    ...(previous.summary.attention !== current.summary.attention ? {
      attention: {
        from: previous.summary.attention,
        to: current.summary.attention,
        direction: ATTENTION_RANK[current.summary.attention] > ATTENTION_RANK[previous.summary.attention]
          ? 'INCREASED' as const
          : 'DECREASED' as const,
      },
    } : {}),
    ...(fromHealth !== toHealth ? { evidenceHealth: { from: fromHealth, to: toHealth } } : {}),
    evidence: evidenceDelta(previousDetail, currentDetail),
    areas: {
      directAdded: direct.added,
      directRemoved: direct.removed,
      affectedAdded: affected.added,
      affectedRemoved: affected.removed,
    },
    sensitiveSurfaces: sensitive,
    changedFiles: files,
    reasons,
    ...(profile ? { profile } : {}),
    detailCompleteness: previousDetail && currentDetail ? 'COMPLETE' : 'PARTIAL',
  };
}

function became(delta: TransitionDeltaV1, status: EvidenceStatusV1): boolean {
  return delta.evidence.some(item => item.to === status && item.from !== status);
}

function resolved(delta: TransitionDeltaV1, statuses: EvidenceStatusV1[]): boolean {
  return delta.evidence.some(item => item.from && statuses.includes(item.from) && item.to === 'PASSED');
}

export function classifyNotableTransition(delta: TransitionDeltaV1): NotableTransitionV1 | undefined {
  const kinds: NotableTransitionKindV1[] = [];
  const revisionChanged = delta.fromHeadSha !== delta.toHeadSha;
  if (delta.attention?.direction === 'INCREASED') kinds.push('ATTENTION_INCREASED');
  if (delta.attention?.direction === 'DECREASED') kinds.push('ATTENTION_DECREASED');

  const health = delta.evidenceHealth;
  if (became(delta, 'FAILED') || (health?.to === 'FAILED' && health.from !== 'FAILED')) kinds.push('EVIDENCE_REGRESSED');
  if (resolved(delta, ['FAILED']) || (health?.from === 'FAILED' && health.to === 'CLEAR')) kinds.push('EVIDENCE_RECOVERED');
  const pendingOrMissingHealthBecame = health?.to === 'PENDING_OR_MISSING' && health.from !== 'PENDING_OR_MISSING';
  if (became(delta, 'MISSING') || (!revisionChanged && (became(delta, 'PENDING') || pendingOrMissingHealthBecame))) {
    kinds.push('EVIDENCE_BECAME_PENDING');
  }
  if (resolved(delta, ['PENDING', 'MISSING']) || (health?.from === 'PENDING_OR_MISSING' && health.to === 'CLEAR')) {
    kinds.push('EVIDENCE_RESOLVED');
  }
  if (delta.sensitiveSurfaces.added.length) kinds.push('SENSITIVE_SURFACE_ADDED');
  if (delta.areas.directAdded.length || delta.areas.affectedAdded.length || delta.changedFiles.added.length) {
    kinds.push('CHANGE_SCOPE_EXPANDED');
  }
  if (!kinds.length) return undefined;

  const material = kinds.some(kind => kind !== 'CHANGE_SCOPE_EXPANDED' && kind !== 'ATTENTION_DECREASED')
    || (kinds.includes('ATTENTION_DECREASED') && delta.attention?.from === 'HIGH');
  return {
    id: `${delta.fromRunId}:${delta.toRunId}`,
    fromRunId: delta.fromRunId,
    toRunId: delta.toRunId,
    occurredAt: delta.evaluatedAt,
    kinds,
    severity: material ? 'MATERIAL' : 'INFO',
    delta,
  };
}

function currentClearStreak(newestFirst: TrajectoryRunInput[]): number {
  let count = 0;
  for (const run of newestFirst) {
    if (evidenceHealth(run.summary) !== 'CLEAR') break;
    count += 1;
  }
  return count;
}

export function buildTrajectory(
  runs: TrajectoryRunInput[],
  options: TrajectoryBuildOptions = {},
): PullRequestTrajectoryV1 | undefined {
  if (!runs.length) return undefined;
  const chronological = sortRunsChronologically(runs);
  const notableTransitions: NotableTransitionV1[] = [];
  for (let index = 1; index < chronological.length; index += 1) {
    const notable = classifyNotableTransition(deriveTransitionDelta(chronological[index - 1], chronological[index]));
    if (notable) notableTransitions.push(notable);
  }
  const newestFirst = [...chronological].reverse();
  const current = newestFirst[0].summary;
  const totalRuns = options.totalRuns ?? newestFirst.length;
  return {
    version: 1,
    repository: current.repository,
    pullRequest: current.pullRequest,
    current,
    summary: {
      totalRuns,
      analyzedRuns: newestFirst.length,
      totalTransitions: notableTransitions.length,
      regressions: notableTransitions.filter(item => item.kinds.includes('EVIDENCE_REGRESSED')).length,
      recoveries: notableTransitions.filter(item => item.kinds.includes('EVIDENCE_RECOVERED')).length,
      attentionIncreases: notableTransitions.filter(item => item.kinds.includes('ATTENTION_INCREASED')).length,
      attentionDecreases: notableTransitions.filter(item => item.kinds.includes('ATTENTION_DECREASED')).length,
      currentClearStreak: currentClearStreak(newestFirst),
      firstEvaluatedAt: options.firstEvaluatedAt ?? chronological[0].summary.evaluatedAt,
      lastEvaluatedAt: options.lastEvaluatedAt ?? current.evaluatedAt,
    },
    evidenceIssues: options.evidenceIssues ?? [],
    insights: options.insights ?? [],
    notableTransitions,
    runs: newestFirst.map(run => run.summary),
    ...(options.lifecycle ? { lifecycle: options.lifecycle } : {}),
    ...(options.historyCompleteness ? { historyCompleteness: options.historyCompleteness } : {}),
    truncated: totalRuns > newestFirst.length,
  };
}
