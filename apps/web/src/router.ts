import type { OverviewMetricV1 } from './overview-api';

export type DashboardRoute =
  | { kind: 'dashboard' }
  | { kind: 'activity' }
  | { kind: 'settings' }
  | { kind: 'overview'; metric: OverviewMetricV1 }
  | { kind: 'account' }
  | { kind: 'pull-request'; repositoryId: number; pullRequestNumber: number }
  | { kind: 'run'; repositoryId: number; runId: string }
  | { kind: 'evaluation'; repositoryId: number; headSha: string }
  | { kind: 'not-found' };

const LEGACY_ACTIVITY_PARAMS = ['cursor', 'q', 'favorites', 'limit'] as const;

export function parseRoute(pathname: string): DashboardRoute {
  if (pathname === '/app' || pathname === '/app/') return { kind: 'dashboard' };
  if (pathname === '/app/activity' || pathname === '/app/activity/') return { kind: 'activity' };
  if (pathname === '/app/settings' || pathname === '/app/settings/') return { kind: 'settings' };
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

export function legacyActivityRedirect(pathname: string, search: string): string | null {
  if (pathname !== '/app' && pathname !== '/app/') return null;
  const params = new URLSearchParams(search);
  const hasAttentionFilter = params.has('attention') && params.get('attention')?.toUpperCase() !== 'ALL';
  if (!hasAttentionFilter && !LEGACY_ACTIVITY_PARAMS.some((name) => params.has(name))) return null;
  const serialized = params.toString();
  return `/app/activity${serialized ? `?${serialized}` : ''}`;
}

export function navigate(url: string): void {
  history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
