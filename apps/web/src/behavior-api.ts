import type { ActivityQueryV1, AttentionLevelV1, PullRequestTrajectoryV1 } from '@spark/dashboard-contracts';
import type {
  BehaviorBoundaryV1,
  BehaviorEventKindV1,
  BehaviorMotifOccurrenceV1,
  BehaviorPatternsResponseV1,
  ChangeBehaviorV1,
} from '@spark/dashboard-contracts/behavior';
import { createDashboardApi } from './api';
import type { ActivityUrlState } from './state';

const ATTENTION_RANK: Record<AttentionLevelV1, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'include', headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Behavior API request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function fixtureBoundary(transition: PullRequestTrajectoryV1['notableTransitions'][number]): BehaviorBoundaryV1 {
  const kinds = new Set<BehaviorEventKindV1>();
  for (const kind of transition.kinds) {
    if (kind === 'ATTENTION_INCREASED') kinds.add('ATTENTION_UP');
    else if (kind === 'ATTENTION_DECREASED') kinds.add('ATTENTION_DOWN');
    else if (kind === 'EVIDENCE_REGRESSED' || kind === 'EVIDENCE_BECAME_PENDING') kinds.add('EVIDENCE_WORSE');
    else if (kind === 'EVIDENCE_RECOVERED' || kind === 'EVIDENCE_RESOLVED') kinds.add('EVIDENCE_BETTER');
    else if (kind === 'SENSITIVE_SURFACE_ADDED') kinds.add('SENSITIVE_SURFACE_ADDED');
    else if (kind === 'CHANGE_SCOPE_EXPANDED') kinds.add('SCOPE_EXPANDED');
  }
  return {
    transitionId: transition.id,
    occurredAt: transition.occurredAt,
    kinds: [...kinds],
    sourceKinds: transition.kinds,
    severity: transition.severity,
  };
}

// Fixture-only projection for browser acceptance. Production behavior semantics are
// derived exclusively by the backend behavior engine.
function fixtureBehavior(trajectory: PullRequestTrajectoryV1): ChangeBehaviorV1 {
  const chronological = [...trajectory.runs].reverse();
  const boundaries = trajectory.notableTransitions.map(fixtureBoundary);
  const attentions = chronological.map((run) => run.attention);
  const initial = chronological[0];
  const final = chronological.at(-1)!;
  const peak = attentions.reduce((value, attention) => ATTENTION_RANK[attention] > ATTENTION_RANK[value] ? attention : value, attentions[0]);
  const up = boundaries.filter((boundary) => boundary.kinds.includes('ATTENTION_UP')).length;
  const down = boundaries.filter((boundary) => boundary.kinds.includes('ATTENTION_DOWN')).length;
  const regressions = boundaries.filter((boundary) => boundary.kinds.includes('EVIDENCE_WORSE')).length;
  const recoveries = boundaries.filter((boundary) => boundary.kinds.includes('EVIDENCE_BETTER')).length;
  const motifs: BehaviorMotifOccurrenceV1[] = [];
  const regression = boundaries.find((boundary) => boundary.kinds.includes('EVIDENCE_WORSE'));
  const recovery = regression && boundaries.find((boundary) => boundary.occurredAt > regression.occurredAt && boundary.kinds.includes('EVIDENCE_BETTER'));
  if (regression && recovery) {
    motifs.push({
      id: `REGRESSION_THEN_RECOVERY:${regression.transitionId}:${recovery.transitionId}`,
      kind: 'REGRESSION_THEN_RECOVERY',
      startedAt: regression.occurredAt,
      endedAt: recovery.occurredAt,
      durationMs: Math.max(0, Date.parse(recovery.occurredAt) - Date.parse(regression.occurredAt)),
      transitionIds: [regression.transitionId, recovery.transitionId],
    });
  }
  const archetypes: ChangeBehaviorV1['archetypes'] = [];
  if (!up && !down) archetypes.push({ kind: 'STABLE', evidence: [`Attention remained ${final.attention}`] });
  if (ATTENTION_RANK[final.attention] > ATTENTION_RANK[initial.attention]) archetypes.push({ kind: 'DETERIORATING', evidence: [`Attention moved from ${initial.attention} to ${final.attention}`] });
  if (ATTENTION_RANK[peak] > ATTENTION_RANK[final.attention] && down) archetypes.push({ kind: 'RECOVERED', evidence: [`Peak attention ${peak}`, `Final attention ${final.attention}`] });
  if (up >= 2 && down >= 1) archetypes.push({ kind: 'OSCILLATING', evidence: [`${up} attention increases`, `${down} attention decreases`] });
  const compressed = attentions.filter((attention, index) => index === 0 || attention !== attentions[index - 1]);
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
    archetypes,
    features: {
      evaluationCount: chronological.length,
      notableBoundaryCount: boundaries.length,
      attentionIncreaseCount: up,
      attentionDecreaseCount: down,
      evidenceRegressionCount: regressions,
      evidenceRecoveryCount: recoveries,
      sensitiveSurfaceAdditionCount: boundaries.filter((boundary) => boundary.kinds.includes('SENSITIVE_SURFACE_ADDED')).length,
      scopeExpansionCount: boundaries.filter((boundary) => boundary.kinds.includes('SCOPE_EXPANDED')).length,
      reachedHigh: attentions.includes('HIGH'),
      recoveredFromHigh: peak === 'HIGH' && final.attention !== 'HIGH',
      regressionThenRecovery: motifs.length > 0,
      oscillatedAttention: up >= 2 && down >= 1,
      timeAtHighMs: 0,
    },
    signatures: {
      full: boundaries.length ? `v1:${boundaries.map((boundary) => boundary.kinds.join('+')).join('>')}` : 'v1:NO_NOTABLE_BOUNDARIES',
      attention: `v1:${compressed.join('>')}`,
    },
    ...(trajectory.lifecycle ? { lifecycle: trajectory.lifecycle } : {}),
    ...(trajectory.historyCompleteness ? { historyCompleteness: trajectory.historyCompleteness } : {}),
    truncated: trajectory.truncated,
  };
}

export async function getChangeBehavior(repositoryId: number, pullRequestNumber: number, search = window.location.search): Promise<ChangeBehaviorV1> {
  if (!__SPARK_FIXTURE_API__) return request(`/api/repositories/${repositoryId}/pulls/${pullRequestNumber}/behavior`);
  const trajectory = await createDashboardApi(search).getTrajectory(repositoryId, pullRequestNumber);
  return fixtureBehavior(trajectory);
}

export async function getBehaviorPatterns(state: ActivityUrlState, search = window.location.search): Promise<BehaviorPatternsResponseV1> {
  if (!__SPARK_FIXTURE_API__) {
    const params = new URLSearchParams({ window: state.window });
    if (state.repositoryId !== null) params.set('repositoryId', String(state.repositoryId));
    return request(`/api/behavior/patterns?${params.toString()}`);
  }

  const query: ActivityQueryV1 = { window: state.window, attention: 'ALL', repositoryId: state.repositoryId };
  const api = createDashboardApi(search);
  const activity = await api.getActivity(query);
  const examples = activity.pullRequests.slice(0, 3).map((item, index) => ({
    repository: item.repository,
    pullRequest: item.pullRequest,
    latestAt: item.latest.evaluatedAt,
    outcome: index === 0 ? 'MERGED_UNRESOLVED' as const : 'OPEN' as const,
    occurrences: index === 0 ? 2 : 1,
    truncated: false,
  }));
  return {
    version: 1,
    behaviorSchemaVersion: 1,
    selectedWindow: state.window,
    selectedRepositoryId: state.repositoryId,
    observedPRs: activity.pullRequests.length,
    patterns: examples.length ? [{
      kind: 'MOTIF',
      key: 'motif:v1:REGRESSION_THEN_RECOVERY',
      label: 'Evidence regression followed by recovery',
      motifKind: 'REGRESSION_THEN_RECOVERY',
      occurrences: examples.reduce((sum, example) => sum + example.occurrences, 0),
      affectedPRs: examples.length,
      outcomes: {
        resolvedBeforeMerge: 0,
        mergedUnresolved: 1,
        outcomeUnavailable: 0,
        closedWithoutMerge: 0,
        open: Math.max(0, examples.length - 1),
      },
      repositories: [],
      examples,
    }] : [],
  };
}
