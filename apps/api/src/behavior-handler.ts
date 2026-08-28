import type { ActivityWindowV1, PullRequestTrajectoryV1 } from '@spark/dashboard-contracts';
import type { BehaviorPatternsResponseV1, ChangeBehaviorV1 } from '@spark/dashboard-contracts/behavior';
import type { Env } from './app';
import type { DashboardPrincipal } from './dashboard-access';
import { D1DashboardReader } from './dashboard-reader';
import { GitHubDashboardAuth } from './github-auth';
import { deriveChangeBehavior } from './change-behavior';
import { readChangePatterns } from './change-patterns';

const WINDOWS: ActivityWindowV1[] = ['24h', '7d', '30d'];

interface BehaviorHandlerDependencies {
  authorize?: (request: Request) => Promise<DashboardPrincipal | undefined>;
  trajectory?: (repositoryId: number, pullRequestNumber: number) => Promise<PullRequestTrajectoryV1 | undefined>;
  patterns?: (input: {
    repositoryIds: number[];
    window: ActivityWindowV1;
    repositoryId: number | null;
  }) => Promise<BehaviorPatternsResponseV1>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function isBehaviorRequest(request: Request): boolean {
  if (request.method !== 'GET') return false;
  const path = new URL(request.url).pathname;
  return path === '/api/behavior/patterns'
    || /^\/api\/repositories\/\d+\/pulls\/\d+\/behavior$/.test(path);
}

export async function handleBehaviorRequest(
  request: Request,
  env: Env,
  dependencies: BehaviorHandlerDependencies = {},
): Promise<Response> {
  const url = new URL(request.url);
  const auth = dependencies.authorize
    ?? ((candidate: Request) => new GitHubDashboardAuth(env).authorize(candidate));
  const principal = await auth(request);
  if (!principal) return json({ error: 'unauthorized' }, 401);

  const behaviorMatch = url.pathname.match(/^\/api\/repositories\/(\d+)\/pulls\/(\d+)\/behavior$/);
  if (behaviorMatch) {
    const repositoryId = Number(behaviorMatch[1]);
    const pullRequestNumber = Number(behaviorMatch[2]);
    if (!Number.isSafeInteger(repositoryId) || !Number.isSafeInteger(pullRequestNumber)
      || repositoryId <= 0 || pullRequestNumber <= 0
      || !principal.repositoryIds.includes(repositoryId)) {
      return json({ error: 'not found' }, 404);
    }
    const readTrajectory = dependencies.trajectory
      ?? ((repoId: number, pr: number) => new D1DashboardReader(env.DB).trajectory(repoId, pr));
    const trajectory = await readTrajectory(repositoryId, pullRequestNumber);
    if (!trajectory) return json({ error: 'not found' }, 404);
    const behavior: ChangeBehaviorV1 = deriveChangeBehavior(trajectory);
    return json(behavior);
  }

  if (url.pathname !== '/api/behavior/patterns') return json({ error: 'not found' }, 404);
  const windowValue = url.searchParams.get('window') ?? '7d';
  if (!WINDOWS.includes(windowValue as ActivityWindowV1)) return json({ error: 'invalid behavior query' }, 400);
  const window = windowValue as ActivityWindowV1;

  const repositoryValue = url.searchParams.get('repositoryId');
  let repositoryId: number | null = null;
  if (repositoryValue) {
    repositoryId = Number(repositoryValue);
    if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) return json({ error: 'invalid behavior query' }, 400);
    if (!principal.repositoryIds.includes(repositoryId)) return json({ error: 'not found' }, 404);
  }

  const readPatterns = dependencies.patterns
    ?? ((input: { repositoryIds: number[]; window: ActivityWindowV1; repositoryId: number | null }) =>
      readChangePatterns(env.DB, input));
  return json(await readPatterns({
    repositoryIds: principal.repositoryIds,
    repositoryId,
    window,
  }));
}
