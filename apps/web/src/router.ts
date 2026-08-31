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
  // R6.1: run and evaluation detail routes share one id grammar - an encoded, non-slash
  // segment - so every href the builders emit re-parses to the same route. R6.3: /runs/
  // is the current detail route; /evaluations/ is the legacy spelling kept for existing
  // bookmarks, to be retired once links move to /runs/.
  const evaluationMatch = pathname.match(/^\/app\/evaluations\/(\d+)\/([^/]+)\/?$/i);
  if (evaluationMatch) return { kind: 'evaluation', repositoryId: Number(evaluationMatch[1]), headSha: decodeURIComponent(evaluationMatch[2]) };
  return { kind: 'not-found' };
}

export function legacyActivityRedirect(pathname: string, search: string): string | null {
  // R8.3 (C1): redirects legacy bookmarks that pointed activity-shaped filters at the
  // dashboard (/app) over to the activity list. It fires only for a non-ALL attention
  // filter or one of the list-only params (cursor, q, favorites, limit).
  //
  // Deliberate asymmetry: window and repository are *native dashboard filters* (the
  // operational dashboard renders its overview for a chosen window + repository), so a
  // window- or repo-only /app bookmark is a valid *dashboard* view and intentionally
  // stays on /app rather than redirecting to /app/activity. Do not "fix" this by
  // extending the redirect to window/repo-only params; it is locked by router tests.
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
