import type { ActivityWindowV1 } from '@spark/dashboard-contracts';
import type { Env } from './app';
import { readActivityDrilldown, type OverviewMetricV1 } from './activity-drilldown';
import { readNotableTransitionInsights } from './activity-transitions';
import { GitHubDashboardAuth } from './github-auth';
import { readOutcomeOverview } from './outcome-overview';

const WINDOWS: ActivityWindowV1[] = ['24h', '7d', '30d'];
const METRICS: OverviewMetricV1[] = ['pull-requests', 'evaluations', 'attention', 'merged-unresolved'];

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

export function isOverviewRequest(request: Request): boolean {
  if (request.method !== 'GET') return false;
  return /^\/api\/overview\/(pull-requests|evaluations|attention|merged-unresolved|transitions)$/.test(new URL(request.url).pathname);
}

export async function handleOverviewRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/overview\/(pull-requests|evaluations|attention|merged-unresolved|transitions)$/);
  if (!match) return json({ error: 'not found' }, 404);

  const auth = new GitHubDashboardAuth(env);
  const principal = await auth.authorize(request);
  if (!principal) return json({ error: 'unauthorized' }, 401);

  const windowValue = url.searchParams.get('window') ?? '7d';
  if (!WINDOWS.includes(windowValue as ActivityWindowV1)) return json({ error: 'invalid overview query' }, 400);
  const window = windowValue as ActivityWindowV1;

  const repositoryValue = url.searchParams.get('repositoryId');
  let repositoryId: number | null = null;
  if (repositoryValue) {
    repositoryId = Number(repositoryValue);
    if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) return json({ error: 'invalid overview query' }, 400);
    if (!principal.repositoryIds.includes(repositoryId)) return json({ error: 'not found' }, 404);
  }

  const now = new Date();
  const input = {
    window,
    repositoryIds: principal.repositoryIds,
    repositoryId,
    start: windowStart(window, now),
    now,
  };

  if (match[1] === 'transitions') {
    return json(await readNotableTransitionInsights(env.DB, input));
  }

  if (!METRICS.includes(match[1] as OverviewMetricV1)) return json({ error: 'not found' }, 404);
  const metric = match[1] as OverviewMetricV1;
  const drilldown = await readActivityDrilldown(env.DB, { ...input, metric });
  if (metric !== 'merged-unresolved') return json(drilldown);

  const outcomes = await readOutcomeOverview(env.DB, {
    ...input,
    githubUserId: principal.viewer.id,
  });
  return json({ ...drilldown, outcomes });
}
