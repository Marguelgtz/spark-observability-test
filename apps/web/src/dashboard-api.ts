import type {
  ActivityQueryV1,
  ActivityResponseV1,
  EvaluationSummaryV1,
  EvidenceHealthV1,
  PullRequestHistoryResponseV1,
  PullRequestTrajectoryV1,
} from '@spark/dashboard-contracts';
import type { OperationalDashboardResponseV1 } from '@spark/dashboard-contracts/dashboard';
import type { DashboardApi } from './api';
import { FixtureDashboardApi, UnauthorizedError, fixtureModeFromSearch } from './api';
import { getNotableTransitionInsights, getOverviewDrilldown, type NotableTransitionInsightsV1, type OverviewDrilldownResponseV1 } from './overview-api';
import type { ActivityUrlState } from './state';

function queryFromState(state: ActivityUrlState, limit?: number): ActivityQueryV1 {
  return {
    window: state.window,
    attention: 'ALL',
    repositoryId: state.repositoryId,
    cursor: null,
    ...(limit !== undefined ? { limit } : {}),
  };
}

function windowMs(window: ActivityUrlState['window']): number {
  if (window === '24h') return 24 * 60 * 60 * 1000;
  if (window === '7d') return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

function evidenceHealth(summary: EvaluationSummaryV1): EvidenceHealthV1 {
  if (summary.evidenceSummary.failed > 0) return 'FAILED';
  if (summary.evidenceSummary.pending > 0 || summary.evidenceSummary.missing > 0) return 'PENDING_OR_MISSING';
  if (summary.evidenceSummary.unknown > 0 && summary.evidenceSummary.passed === 0) return 'UNKNOWN';
  return 'CLEAR';
}

function activeTrajectory(trajectory: PullRequestTrajectoryV1): boolean {
  return !trajectory.lifecycle || trajectory.lifecycle.state === 'OPEN';
}

function fixtureRecovery(histories: PullRequestHistoryResponseV1[], start: number) {
  const recovered = new Set<string>();
  let failedToClearEvents = 0;
  let waitingToClearEvents = 0;

  for (const history of histories) {
    const chronological = [...history.runs].reverse();
    for (let index = 1; index < chronological.length; index += 1) {
      const previous = chronological[index - 1];
      const current = chronological[index];
      if (Date.parse(current.evaluatedAt) < start) continue;
      const from = evidenceHealth(previous);
      const to = evidenceHealth(current);
      if ((from === 'FAILED' || from === 'PENDING_OR_MISSING') && to === 'CLEAR') {
        recovered.add(`${history.repository.id}:${history.pullRequest.number}`);
      }
      if (from === 'FAILED' && to !== 'CLEAR') failedToClearEvents += 1;
      if (from === 'PENDING_OR_MISSING' && to !== 'CLEAR') waitingToClearEvents += 1;
    }
  }

  return { recoveredPRs: recovered.size, failedToClearEvents, waitingToClearEvents };
}

async function fixtureDashboard(state: ActivityUrlState): Promise<OperationalDashboardResponseV1> {
  const api = new FixtureDashboardApi(fixtureModeFromSearch(window.location.search));
  const activity = await api.getActivity(queryFromState(state, 50));
  const histories = await Promise.all(activity.pullRequests.map((item) => api.getPullRequestHistory(item.repository.id, item.pullRequest.number)));
  const trajectories = await Promise.all(activity.pullRequests.map((item) => api.getTrajectory(item.repository.id, item.pullRequest.number)));
  const now = Date.now();
  const start = now - windowMs(state.window);
  const active = activity.pullRequests.filter((_, index) => activeTrajectory(trajectories[index]));
  const needsAttention = active
    .filter((item) => item.latest.attention === 'HIGH' || item.latest.attention === 'MEDIUM')
    .sort((a, b) => {
      const attentionDelta = (b.latest.attention === 'HIGH' ? 2 : 1) - (a.latest.attention === 'HIGH' ? 2 : 1);
      return attentionDelta || Date.parse(b.latest.evaluatedAt) - Date.parse(a.latest.evaluatedAt);
    });
  const totalEvaluations = histories
    .flatMap((history) => history.runs)
    .filter((run) => Date.parse(run.evaluatedAt) >= start).length;
  const mergedUnresolved = trajectories.filter((trajectory) => trajectory.lifecycle?.state === 'MERGED'
    && trajectory.lifecycle.unresolvedAtMerge === true
    && trajectory.lifecycle.mergedAt
    && Date.parse(trajectory.lifecycle.mergedAt) >= start).length;

  return {
    version: 1,
    selectedWindow: state.window,
    selectedRepositoryId: state.repositoryId,
    counts: activity.counts,
    repositories: activity.repositories,
    overview: {
      observedPRs: activity.counts.LOW + activity.counts.MEDIUM + activity.counts.HIGH,
      totalEvaluations,
      activePRsNeedingAttention: needsAttention.length,
      mergedUnresolved,
      recovery: fixtureRecovery(histories, start),
    },
    needsAttention: { total: needsAttention.length, preview: needsAttention.slice(0, 15) },
    activeChanges: { total: active.length, preview: active.slice(0, 15) },
    hasObservedHistory: activity.repositories.length > 0,
  };
}

function dashboardFailure(): string | null {
  return new URLSearchParams(window.location.search).get('dashboardFailure');
}

export async function getOperationalDashboard(state: ActivityUrlState): Promise<OperationalDashboardResponseV1> {
  if (__SPARK_FIXTURE_API__) return fixtureDashboard(state);
  const params = new URLSearchParams({ window: state.window });
  if (state.repositoryId !== null) params.set('repositoryId', String(state.repositoryId));
  const response = await fetch(`/api/dashboard?${params.toString()}`, {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error(`Dashboard API request failed (${response.status})`);
  return response.json() as Promise<OperationalDashboardResponseV1>;
}

export async function getDashboardRecentActivity(api: DashboardApi, state: ActivityUrlState): Promise<ActivityResponseV1> {
  if (__SPARK_FIXTURE_API__ && dashboardFailure() === 'recent') throw new Error('Synthetic recent activity failure');
  return api.getActivity(queryFromState(state, 5));
}

export interface DashboardInsightsData {
  evaluations: OverviewDrilldownResponseV1;
  transitions: NotableTransitionInsightsV1;
}

export type DashboardInsightSource = 'evaluation trends' | 'transition insights';

export class DashboardInsightsError extends Error {
  constructor(readonly source: DashboardInsightSource, options?: ErrorOptions) {
    super(`${source} could not be loaded`, options);
    this.name = 'DashboardInsightsError';
  }
}

async function insightRequest<T>(source: DashboardInsightSource, request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (cause) {
    throw new DashboardInsightsError(source, { cause });
  }
}

export async function getDashboardInsights(state: ActivityUrlState): Promise<DashboardInsightsData> {
  if (__SPARK_FIXTURE_API__ && dashboardFailure() === 'insights') throw new DashboardInsightsError('evaluation trends');
  const [evaluations, transitions] = await Promise.all([
    insightRequest('evaluation trends', getOverviewDrilldown('evaluations', state)),
    insightRequest('transition insights', getNotableTransitionInsights(state)),
  ]);
  return { evaluations, transitions };
}
