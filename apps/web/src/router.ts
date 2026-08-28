import type { OverviewMetricV1 } from './overview-api';

export type DashboardRoute =
  | { kind: 'activity' }
  | { kind: 'overview'; metric: OverviewMetricV1 }
  | { kind: 'account' }
  | { kind: 'pull-request'; repositoryId: number; pullRequestNumber: number }
  | { kind: 'run'; repositoryId: number; runId: string }
  | { kind: 'evaluation'; repositoryId: number; headSha: string }
  | { kind: 'not-found' };

export function parseRoute(pathname: string): DashboardRoute {
  if (pathname === '/app' || pathname === '/app/') return { kind: 'activity' };
  if (pathname === '/app/account' || pathname === '/app/account/') return { kind: 'account' };
  const overviewMatch = pathname.match(/^\/app\/overview\/(pull-requests|evaluations|attention|merged-unresolved)\/?$/i);
  if (overviewMatch) return { kind: 'overview', metric: overviewMatch[1].toLowerCase() as OverviewMetricV1 };
  const pullRequestMatch = pathname.match(/^\/app\/repositories\/(\d+)\/pulls\/(\d+)\/?$/i);
  if (pullRequestMatch) {
    return {
      kind: 'pull-request',
      repositoryId: Number(pullRequestMatch[1]),
      pullRequestNumber: Number(pullRequestMatch[2]),
    };
  }
  const runMatch = pathname.match(/^\/app\/repositories\/(\d+)\/runs\/([^/]+)\/?$/i);
  if (runMatch) {
    return {
      kind: 'run',
      repositoryId: Number(runMatch[1]),
      runId: decodeURIComponent(runMatch[2]),
    };
  }
  const evaluationMatch = pathname.match(/^\/app\/evaluations\/(\d+)\/([a-f0-9]{7,64})\/?$/i);
  if (evaluationMatch) return { kind: 'evaluation', repositoryId: Number(evaluationMatch[1]), headSha: evaluationMatch[2] };
  return { kind: 'not-found' };
}

export function navigate(url: string): void {
  history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
