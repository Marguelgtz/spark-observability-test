export type DashboardRoute =
  | { kind: 'activity' }
  | { kind: 'account' }
  | { kind: 'evaluation'; repositoryId: number; headSha: string }
  | { kind: 'not-found' };

export function parseRoute(pathname: string): DashboardRoute {
  if (pathname === '/app' || pathname === '/app/') return { kind: 'activity' };
  if (pathname === '/app/account' || pathname === '/app/account/') return { kind: 'account' };
  const match = pathname.match(/^\/app\/evaluations\/(\d+)\/([a-f0-9]{7,64})\/?$/i);
  if (match) return { kind: 'evaluation', repositoryId: Number(match[1]), headSha: match[2] };
  return { kind: 'not-found' };
}

export function navigate(url: string): void {
  history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
