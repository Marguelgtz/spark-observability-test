import type { ActivityResponseV1 } from '@spark/dashboard-contracts';
import { renderHomeInsightCanvases, renderOverviewInsightCanvases } from './insight-canvases';
import type { NotableTransitionInsightsV1, OverviewDrilldownResponseV1 } from './overview-api';
import type { ActivityUrlState } from './state';

export function enhanceHomeWithInsightCanvases(
  root: HTMLElement,
  activity: ActivityResponseV1,
  evaluations: OverviewDrilldownResponseV1,
  transitions: NotableTransitionInsightsV1,
  state: ActivityUrlState,
): HTMLElement {
  const existing = root.querySelector<HTMLElement>('[data-testid="home-charts"]');
  const canvases = renderHomeInsightCanvases(activity, evaluations, transitions, state);
  if (existing) existing.replaceWith(canvases);
  else root.querySelector('[data-testid="needs-attention"]')?.insertAdjacentElement('afterend', canvases);
  return root;
}

export function enhanceOverviewWithInsightCanvases(
  root: HTMLElement,
  response: OverviewDrilldownResponseV1,
  transitions: NotableTransitionInsightsV1,
  state: ActivityUrlState,
  companion?: OverviewDrilldownResponseV1,
): HTMLElement {
  const existing = root.querySelector<HTMLElement>('[data-testid="overview-charts"]');
  const canvases = renderOverviewInsightCanvases(response, transitions, state, companion);
  if (existing) existing.replaceWith(canvases);
  else root.querySelector('.overview-detail-heading')?.insertAdjacentElement('afterend', canvases);
  return root;
}
