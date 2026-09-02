/**
 * Single source of truth for same-origin SPA route URLs built from an
 * already-serialized activity-state search string. Renderers call these to set
 * explicit back/forward links so no link target is ever derived from matching
 * rendered text (see docs/UI_ROUTE_HYGIENE_PLAN.md, findings A1 / R2).
 */
export function activityRouteHref(search?: string): string {
  return `/app/activity${search ? `?${search}` : ''}`;
}

export function dashboardRouteHref(search?: string): string {
  return `/app${search ? `?${search}` : ''}`;
}

export function pullRequestHref(repositoryId: number, pullRequestNumber: number, activitySearch = ''): string {
  const base = `/app/repositories/${repositoryId}/pulls/${pullRequestNumber}`;
  return activitySearch ? `${base}?${activitySearch}` : base;
}