import type {
  ActivityWindowV1,
  EvaluationSummaryV1,
  NotableTransitionKindV1,
  PullRequestActivityV1,
  PullRequestLifecycleV1,
  RepositoryRefV1,
} from '@spark/dashboard-contracts';
import { FixtureDashboardApi, UnauthorizedError, fixtureModeFromSearch } from './api';
import type { ActivityUrlState } from './state';

export type OverviewMetricV1 = 'pull-requests' | 'evaluations' | 'attention' | 'merged-unresolved';

export interface ActivityTrendPointV1 {
  bucketStart: string;
  observedPRs: number;
  evaluations: number;
  attentionEvaluations: number;
  mergedUnresolved: number;
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

function windowMs(window: ActivityWindowV1): number {
  if (window === '24h') return 24 * 60 * 60 * 1000;
  if (window === '7d') return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

function bucketStart(value: Date, hourly: boolean): string {
  const date = new Date(value);
  date.setUTCMinutes(0, 0, 0);
  if (!hourly) date.setUTCHours(0);
  return hourly ? `${date.toISOString().slice(0, 13)}:00:00Z` : `${date.toISOString().slice(0, 10)}T00:00:00Z`;
}

function fixtureTrend(
  window: ActivityWindowV1,
  now: Date,
  runs: EvaluationSummaryV1[],
  lifecycles: PullRequestLifecycleV1[],
): ActivityTrendPointV1[] {
  const hourly = window === '24h';
  const start = new Date(now.getTime() - windowMs(window));
  const first = new Date(bucketStart(start, hourly));
  const last = new Date(bucketStart(now, hourly));
  const step = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const points: ActivityTrendPointV1[] = [];
  for (let timestamp = first.getTime(); timestamp <= last.getTime(); timestamp += step) {
    points.push({ bucketStart: bucketStart(new Date(timestamp), hourly), observedPRs: 0, evaluations: 0, attentionEvaluations: 0, mergedUnresolved: 0 });
  }
  const byKey = new Map(points.map((point) => [point.bucketStart, point]));
  const prsByBucket = new Map<string, Set<string>>();
  for (const run of runs) {
    const key = bucketStart(new Date(run.evaluatedAt), hourly);
    const point = byKey.get(key);
    if (!point) continue;
    point.evaluations += 1;
    if (run.attention === 'HIGH' || run.attention === 'MEDIUM') point.attentionEvaluations += 1;
    const prs = prsByBucket.get(key) ?? new Set<string>();
    prs.add(`${run.repository.id}:${run.pullRequest.number}`);
    prsByBucket.set(key, prs);
  }
  for (const [key, prs] of prsByBucket) {
    const point = byKey.get(key);
    if (point) point.observedPRs = prs.size;
  }
  for (const lifecycle of lifecycles) {
    if (!lifecycle.mergedAt || lifecycle.unresolvedAtMerge !== true) continue;
    const point = byKey.get(bucketStart(new Date(lifecycle.mergedAt), hourly));
    if (point) point.mergedUnresolved += 1;
  }
  return points;
}

async function fixtureOverview(metric: OverviewMetricV1, state: ActivityUrlState): Promise<OverviewDrilldownResponseV1> {
  const api = new FixtureDashboardApi(fixtureModeFromSearch(window.location.search));
  const activity = await api.getActivity({ ...state, attention: 'ALL', cursor: null, limit: 50 });
  const histories = await Promise.all(activity.pullRequests.map((item) => api.getPullRequestHistory(item.repository.id, item.pullRequest.number)));
  const trajectories = await Promise.all(activity.pullRequests.map((item) => api.getTrajectory(item.repository.id, item.pullRequest.number)));
  const now = new Date();
  const start = now.getTime() - windowMs(state.window);
  const runs = histories.flatMap((history) => history.runs).filter((run) => Date.parse(run.evaluatedAt) >= start);
  const lifecycles = trajectories.map((trajectory) => trajectory.lifecycle).filter((value): value is PullRequestLifecycleV1 => Boolean(value));

  let items: OverviewDrilldownItemV1[];
  if (metric === 'evaluations') {
    items = [...runs]
      .sort((a, b) => Date.parse(b.evaluatedAt) - Date.parse(a.evaluatedAt))
      .map((evaluation) => ({ kind: 'evaluation' as const, evaluation }));
  } else if (metric === 'merged-unresolved') {
    items = trajectories
      .filter((trajectory) => trajectory.lifecycle?.state === 'MERGED'
        && trajectory.lifecycle.unresolvedAtMerge === true
        && trajectory.lifecycle.mergedAt
        && Date.parse(trajectory.lifecycle.mergedAt) >= start)
      .map((trajectory) => ({
        kind: 'merge' as const,
        repository: trajectory.repository,
        pullRequest: trajectory.pullRequest,
        latest: trajectory.current,
        lifecycle: trajectory.lifecycle!,
      }));
  } else {
    items = activity.pullRequests
      .map((activityItem, index) => ({
        kind: 'pull-request' as const,
        activity: activityItem,
        ...(trajectories[index].lifecycle ? { lifecycle: trajectories[index].lifecycle } : {}),
      }))
      .filter((item) => metric !== 'attention'
        || ((item.activity.latest.attention === 'HIGH' || item.activity.latest.attention === 'MEDIUM')
          && (!item.lifecycle || item.lifecycle.state === 'OPEN')));
  }

  return {
    version: 1,
    metric,
    selectedWindow: state.window,
    selectedRepositoryId: state.repositoryId,
    total: items.length,
    trend: fixtureTrend(state.window, now, runs, lifecycles),
    items: items.slice(0, 100),
    truncated: items.length > 100,
  };
}

async function fixtureTransitions(state: ActivityUrlState): Promise<NotableTransitionInsightsV1> {
  const api = new FixtureDashboardApi(fixtureModeFromSearch(window.location.search));
  const activity = await api.getActivity({ ...state, attention: 'ALL', cursor: null, limit: 50 });
  const trajectories = await Promise.all(activity.pullRequests.map((item) => api.getTrajectory(item.repository.id, item.pullRequest.number)));
  const now = new Date();
  const start = now.getTime() - windowMs(state.window);
  const notable = trajectories.flatMap((trajectory) => trajectory.notableTransitions.map((transition) => ({
    transition,
    prKey: `${trajectory.repository.id}:${trajectory.pullRequest.number}`,
  }))).filter(({ transition }) => Date.parse(transition.occurredAt) >= start && Date.parse(transition.occurredAt) <= now.getTime());

  const hourly = state.window === '24h';
  const first = new Date(bucketStart(new Date(start), hourly));
  const last = new Date(bucketStart(now, hourly));
  const step = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const trend: NotableTransitionTrendPointV1[] = [];
  for (let timestamp = first.getTime(); timestamp <= last.getTime(); timestamp += step) {
    trend.push({ bucketStart: bucketStart(new Date(timestamp), hourly), total: 0, regressions: 0, recoveries: 0, attentionIncreases: 0, attentionDecreases: 0 });
  }
  const byBucket = new Map(trend.map((point) => [point.bucketStart, point]));
  const counts = new Map<NotableTransitionKindV1, number>(TRANSITION_KINDS.map((kind) => [kind, 0]));
  const affected = new Set<string>();
  let material = 0;
  let info = 0;

  for (const { transition, prKey } of notable) {
    affected.add(prKey);
    if (transition.severity === 'MATERIAL') material += 1;
    else info += 1;
    for (const kind of transition.kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    const point = byBucket.get(bucketStart(new Date(transition.occurredAt), hourly));
    if (!point) continue;
    point.total += 1;
    if (transition.kinds.includes('EVIDENCE_REGRESSED')) point.regressions += 1;
    if (transition.kinds.includes('EVIDENCE_RECOVERED')) point.recoveries += 1;
    if (transition.kinds.includes('ATTENTION_INCREASED')) point.attentionIncreases += 1;
    if (transition.kinds.includes('ATTENTION_DECREASED')) point.attentionDecreases += 1;
  }

  return {
    total: notable.length,
    material,
    info,
    affectedPRs: affected.size,
    byKind: TRANSITION_KINDS.map((kind) => ({ kind, count: counts.get(kind) ?? 0 })),
    trend,
  };
}

function overviewParams(state: ActivityUrlState): URLSearchParams {
  const params = new URLSearchParams({ window: state.window });
  if (state.repositoryId !== null) params.set('repositoryId', String(state.repositoryId));
  return params;
}

export async function getOverviewDrilldown(metric: OverviewMetricV1, state: ActivityUrlState): Promise<OverviewDrilldownResponseV1> {
  if (__SPARK_FIXTURE_API__) return fixtureOverview(metric, state);
  const response = await fetch(`/api/overview/${metric}?${overviewParams(state).toString()}`, {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error(`Overview API request failed (${response.status})`);
  return response.json() as Promise<OverviewDrilldownResponseV1>;
}

export async function getNotableTransitionInsights(state: ActivityUrlState): Promise<NotableTransitionInsightsV1> {
  if (__SPARK_FIXTURE_API__) return fixtureTransitions(state);
  const response = await fetch(`/api/overview/transitions?${overviewParams(state).toString()}`, {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error(`Transition insights request failed (${response.status})`);
  return response.json() as Promise<NotableTransitionInsightsV1>;
}
