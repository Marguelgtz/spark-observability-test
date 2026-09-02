import type { ActivityOverviewV1, ActivityResponseV1, ActivityWindowV1, NeedsAttentionV1 } from '@spark/dashboard-contracts';
import type { DashboardQueryV1, OperationalDashboardResponseV1 } from '@spark/dashboard-contracts/dashboard';
import type { Env } from './app';
import type { DashboardAuthorizer } from './dashboard-access';
import { D1DashboardReader, type DashboardReader } from './dashboard-reader';
import { readActiveChanges, type ActiveChangesInput } from './dashboard-summary';
import { GitHubDashboardAuth } from './github-auth';

const WINDOWS: ActivityWindowV1[] = ['24h', '7d', '30d'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function windowStart(window: ActivityWindowV1, now: Date): string {
  const duration = window === '24h'
    ? 24 * 60 * 60 * 1000
    : window === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - duration).toISOString();
}

function parseDashboardQuery(url: URL): DashboardQueryV1 | undefined {
  const windowValue = url.searchParams.get('window') ?? '7d';
  if (!WINDOWS.includes(windowValue as ActivityWindowV1)) return undefined;

  const repositoryValue = url.searchParams.get('repositoryId');
  let repositoryId: number | null = null;
  if (repositoryValue) {
    repositoryId = Number(repositoryValue);
    if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) return undefined;
  }

  return { window: windowValue as ActivityWindowV1, repositoryId };
}

function fallbackOverview(activity: ActivityResponseV1): ActivityOverviewV1 {
  const observedPRs = activity.counts.LOW + activity.counts.MEDIUM + activity.counts.HIGH;
  return {
    observedPRs,
    totalEvaluations: observedPRs,
    activePRsNeedingAttention: activity.counts.HIGH + activity.counts.MEDIUM,
    mergedUnresolved: 0,
    recovery: { recoveredPRs: 0, failedToClearEvents: 0, waitingToClearEvents: 0 },
  };
}

function fallbackNeedsAttention(activity: ActivityResponseV1): NeedsAttentionV1 {
  const preview = activity.pullRequests
    .filter((item) => item.latest.attention === 'HIGH' || item.latest.attention === 'MEDIUM')
    .slice(0, 5);
  return { total: preview.length, preview };
}

export interface OperationalDashboardDependencies {
  authorizer?: DashboardAuthorizer;
  reader?: DashboardReader;
  activeChangesReader?: (db: Env['DB'], input: ActiveChangesInput) => ReturnType<typeof readActiveChanges>;
  now?: () => Date;
}

export function isOperationalDashboardRequest(request: Request): boolean {
  return request.method === 'GET' && new URL(request.url).pathname === '/api/dashboard';
}

export async function handleOperationalDashboardRequest(
  request: Request,
  env: Env,
  dependencies: OperationalDashboardDependencies = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/dashboard') return json({ error: 'not found' }, 404);

  const authorizer = dependencies.authorizer ?? new GitHubDashboardAuth(env);
  const principal = await authorizer.authorize(request);
  if (!principal) return json({ error: 'unauthorized' }, 401);

  const query = parseDashboardQuery(url);
  if (!query) return json({ error: 'invalid dashboard query' }, 400);
  if (query.repositoryId !== null && !principal.repositoryIds.includes(query.repositoryId)) {
    return json({ error: 'not found' }, 404);
  }

  const now = dependencies.now?.() ?? new Date();
  const reader = dependencies.reader ?? new D1DashboardReader(env.DB);
  const activeChangesReader = dependencies.activeChangesReader ?? readActiveChanges;
  const activeInput: ActiveChangesInput = {
    repositoryIds: principal.repositoryIds,
    repositoryId: query.repositoryId,
    start: windowStart(query.window, now),
    limit: 5,
  };

  const [activity, activeChanges] = await Promise.all([
    reader.activity({
      window: query.window,
      attention: 'ALL',
      repositoryId: query.repositoryId,
      cursor: null,
      limit: 1,
    }, principal.repositoryIds, now),
    activeChangesReader(env.DB, activeInput),
  ]);

  const response: OperationalDashboardResponseV1 = {
    version: 1,
    selectedWindow: query.window,
    selectedRepositoryId: query.repositoryId,
    counts: activity.counts,
    repositories: activity.repositories,
    overview: activity.overview ?? fallbackOverview(activity),
    needsAttention: activity.needsAttention ?? fallbackNeedsAttention(activity),
    activeChanges,
    hasObservedHistory: activity.hasObservedHistory ?? activity.repositories.length > 0,
  };
  return json(response);
}
