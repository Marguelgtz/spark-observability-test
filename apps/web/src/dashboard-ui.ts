import type { AccountV1, ActivityResponseV1, PullRequestActivityV1 } from '@spark/dashboard-contracts';
import type { OperationalDashboardResponseV1 } from '@spark/dashboard-contracts/dashboard';
import { evidenceLabel, relativeTime } from './format';
import { renderHomeInsightCanvases } from './insight-canvases';
import type { DashboardInsightsData } from './dashboard-api';
import type { OverviewDrilldownResponseV1, OverviewMetricV1 } from './overview-api';
import { serializeActivityState, type ActivityUrlState } from './state';
import { DEFAULT_PREVIEW_SIZE, progressiveList, type PreviewSize } from './progressive-list';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function cleanState(state: ActivityUrlState): ActivityUrlState {
  return { ...state, attention: 'ALL', cursor: null, query: undefined, favoritesOnly: false };
}

function stateHref(path: string, state: ActivityUrlState): string {
  const search = serializeActivityState(cleanState(state));
  return `${path}${search ? `?${search}` : ''}`;
}

function overviewHref(metric: OverviewMetricV1, state: ActivityUrlState): string {
  return stateHref(`/app/overview/${metric}`, state);
}

function activityHref(state: ActivityUrlState): string {
  return stateHref('/app/activity', state);
}

function metric(
  label: string,
  value: number,
  testId: string,
  detail?: string,
  href?: string,
): HTMLElement {
  const card = href
    ? node('a', 'home-metric home-metric-link') as HTMLAnchorElement
    : node('div', 'home-metric home-metric-static');
  if (card instanceof HTMLAnchorElement) {
    card.href = href!;
    card.dataset.routerLink = 'true';
  }
  card.dataset.testid = testId;
  card.setAttribute('aria-label', `${label}: ${value}`);
  card.append(node('strong', 'home-metric-value', String(value)), node('span', 'home-metric-label', label));
  if (detail) card.append(node('span', 'home-metric-detail', detail));
  if (href) card.append(node('span', 'home-metric-arrow', '→'));
  return card;
}

function renderOverview(response: OperationalDashboardResponseV1, state: ActivityUrlState): HTMLElement {
  const section = node('section', 'home-overview');
  section.dataset.testid = 'change-overview';
  section.setAttribute('aria-label', 'Operational overview');
  const metrics = node('div', 'home-metrics');
  metrics.append(
    metric('Needs attention', response.needsAttention.total, 'dashboard-card-attention', 'Open HIGH / MEDIUM', overviewHref('attention', state)),
    metric('Active changes', response.activeChanges.total, 'dashboard-card-active', 'Open observed PRs', overviewHref('pull-requests', state)),
    metric('Merged unresolved', response.overview.mergedUnresolved, 'dashboard-card-merged-unresolved', undefined, overviewHref('merged-unresolved', state)),
    metric('Recent recoveries', response.overview.recovery.recoveredPRs, 'dashboard-card-recoveries', `in ${state.window}`, overviewHref('merged-unresolved', state)),
  );
  section.append(metrics);
  return section;
}

function changeHref(activity: PullRequestActivityV1, state: ActivityUrlState): string {
  return stateHref(`/app/repositories/${activity.repository.id}/pulls/${activity.pullRequest.number}`, state);
}

function changeReason(activity: PullRequestActivityV1): string {
  return activity.latest.topReasons[0] ?? activity.latest.sensitiveSurfaces[0] ?? evidenceLabel(activity.latest.evidenceSummary);
}

function changeRow(activity: PullRequestActivityV1, state: ActivityUrlState, prefix: string): HTMLAnchorElement {
  const latest = activity.latest;
  const link = node('a', 'dashboard-change-row') as HTMLAnchorElement;
  link.href = changeHref(activity, state);
  link.dataset.routerLink = 'true';
  link.dataset.testid = `${prefix}-${activity.repository.id}-${activity.pullRequest.number}`;
  link.dataset.prKey = `${activity.repository.id}:${activity.pullRequest.number}`;
  link.setAttribute('aria-label', `Open pull request ${activity.pullRequest.number}: ${activity.pullRequest.title}`);

  const attention = node('span', `attention attention-${latest.attention.toLowerCase()}`, latest.attention);
  const body = node('span', 'dashboard-change-body');
  const title = node('span', 'dashboard-change-title');
  title.append(node('strong', undefined, activity.pullRequest.title));
  body.append(
    title,
    node('span', 'dashboard-change-context', `${activity.repository.owner}/${activity.repository.name} · #${activity.pullRequest.number} · ${activity.history.runCount} evaluation${activity.history.runCount === 1 ? '' : 's'}`),
    node('span', 'dashboard-change-reason', changeReason(activity)),
  );
  const time = node('time', 'dashboard-change-time', relativeTime(latest.evaluatedAt));
  time.dateTime = latest.evaluatedAt;
  link.append(attention, body, time);
  return link;
}

function changeList(items: PullRequestActivityV1[], state: ActivityUrlState, prefix: string): HTMLElement {
  const list = node('div', 'dashboard-change-list');
  for (const item of items) list.append(changeRow(item, state, prefix));
  return list;
}

function progressiveChangeList(
  items: PullRequestActivityV1[],
  total: number,
  state: ActivityUrlState,
  prefix: string,
  previewSize: PreviewSize,
): HTMLElement {
  return progressiveList({
    items,
    total,
    previewSize,
    identity: (item) => `${item.repository.id}:${item.pullRequest.number}`,
    renderItem: (item) => changeRow(item, state, prefix),
    itemsClassName: 'dashboard-change-list',
    itemLabel: 'changes',
  });
}

function renderNeedsAttention(response: OperationalDashboardResponseV1, state: ActivityUrlState, previewSize: PreviewSize): HTMLElement {
  const section = node('section', 'needs-attention dashboard-primary-section');
  section.dataset.testid = 'needs-attention';
  const heading = node('div', 'home-section-heading');
  const title = node('h2');
  const titleLink = node('a', 'home-section-link', 'Needs attention') as HTMLAnchorElement;
  titleLink.href = overviewHref('attention', state);
  titleLink.dataset.routerLink = 'true';
  title.append(titleLink);
  heading.append(title, node('span', 'home-section-count', String(response.needsAttention.total)));
  section.append(heading);

  if (!response.needsAttention.preview.length) {
    section.append(node('p', 'home-clear-state', 'Nothing currently needs attention in this view.'));
    return section;
  }
  section.append(progressiveChangeList(response.needsAttention.preview, response.needsAttention.total, state, 'attention-change', previewSize));
  return section;
}

function disclosure(title: string, testId: string, open: boolean, count?: string): { details: HTMLDetailsElement; content: HTMLElement } {
  const details = node('details', 'dashboard-disclosure') as HTMLDetailsElement;
  details.open = open;
  details.dataset.testid = testId;
  const summary = node('summary', 'dashboard-disclosure-summary');
  const heading = node('h2', undefined, title);
  summary.append(heading);
  if (count) summary.append(node('span', 'home-section-count', count));
  const content = node('div', 'dashboard-disclosure-content');
  details.append(summary, content);
  return { details, content };
}

function renderActiveChanges(response: OperationalDashboardResponseV1, state: ActivityUrlState, previewSize: PreviewSize): HTMLElement {
  const { details, content } = disclosure('Active changes', 'active-changes', true, String(response.activeChanges.total));
  details.id = 'active-changes';
  if (!response.activeChanges.preview.length) {
    content.append(node('p', 'home-clear-state', 'No active observed changes in this view.'));
  } else {
    content.append(progressiveChangeList(response.activeChanges.preview, response.activeChanges.total, state, 'active-change', previewSize));
  }
  const link = node('a', 'home-section-link dashboard-section-link', 'Browse all changes →') as HTMLAnchorElement;
  link.href = activityHref(state);
  link.dataset.routerLink = 'true';
  details.append(link);
  return details;
}

function renderRecentShell(state: ActivityUrlState): HTMLElement {
  const { details, content } = disclosure('Recent activity', 'recent-activity', true, '…');
  content.dataset.testid = 'dashboard-recent-content';
  const loading = node('p', 'dashboard-section-status', 'Loading recent activity…');
  loading.setAttribute('role', 'status');
  content.append(loading);
  const link = node('a', 'home-section-link dashboard-section-link', 'View all activity →') as HTMLAnchorElement;
  link.href = activityHref(state);
  link.dataset.routerLink = 'true';
  details.append(link);
  return details;
}

function renderTrendLink(state: ActivityUrlState): HTMLElement {
  const section = node('section', 'dashboard-trend-link');
  section.dataset.testid = 'dashboard-trend-link';
  const copy = node('div', 'dashboard-trend-link-copy');
  copy.append(node('h2', undefined, 'Trend analysis'), node('p', 'muted', 'Evaluation flow, attention composition, and iteration density.'));
  const link = node('a', 'secondary-link', 'Open evaluation trends →') as HTMLAnchorElement;
  link.href = overviewHref('evaluations', state);
  link.dataset.routerLink = 'true';
  section.append(copy, link);
  return section;
}

function renderInsightsShell(collapseSecondarySections: boolean): HTMLElement {
  const { details, content } = disclosure('Insights', 'dashboard-insights', !collapseSecondarySections);
  details.id = 'insights';
  content.dataset.testid = 'dashboard-insights-content';
  const loading = node('p', 'dashboard-section-status', 'Loading supporting insights…');
  loading.setAttribute('role', 'status');
  content.append(loading);
  return details;
}

function githubLink(label: string, href: string, className: string): HTMLAnchorElement {
  const link = node('a', className, label);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  return link;
}

function renderNoRepositories(account: AccountV1): HTMLElement {
  const section = node('section', 'home-onboarding');
  section.dataset.testid = 'onboarding-no-repositories';
  section.append(
    node('p', 'eyebrow', 'GET STARTED'),
    node('h1', undefined, 'Connect a repository to Spark.'),
    node('p', 'state-copy', 'Spark needs access to at least one GitHub repository before it can observe changes and build a history.'),
    githubLink('Install Spark on GitHub', account.githubInstallUrl, 'primary-link'),
  );
  return section;
}

function renderNoHistory(account: AccountV1): HTMLElement {
  const section = node('section', 'home-onboarding');
  section.dataset.testid = 'onboarding-no-history';
  section.append(
    node('p', 'eyebrow', 'CONNECTED'),
    node('h1', undefined, 'Spark is connected. The first change will start the story.'),
    node('p', 'state-copy', `Spark can access ${account.repositoryCount} repositor${account.repositoryCount === 1 ? 'y' : 'ies'}, but no evaluation history has been observed yet.`),
  );

  const checklist = node('ol', 'onboarding-checklist');
  checklist.append(
    node('li', undefined, 'Repository access is configured.'),
    node('li', undefined, 'Open or update a pull request in an installed repository.'),
    node('li', undefined, 'After Spark evaluates it, the change and its trajectory will appear here.'),
  );
  section.append(checklist, githubLink('Manage repository access', account.githubSettingsUrl, 'secondary-link'));

  const example = node('div', 'example-trajectory');
  example.append(node('span', 'example-label', 'STATIC EXAMPLE · NOT YOUR DATA'));
  const story = node('div', 'example-story');
  for (const [level, copy] of [
    ['LOW', 'Initial evaluation'],
    ['HIGH', 'Sensitive surface touched · integration evidence missing'],
    ['MEDIUM', 'Unit evidence recovered · integration evidence still missing'],
    ['MERGED', 'Merged with unresolved attention'],
  ]) {
    const row = node('div', 'example-story-row');
    row.append(node('strong', 'example-story-state', level), node('span', undefined, copy));
    story.append(row);
  }
  example.append(story);
  section.append(example);
  return section;
}

function windowControls(state: ActivityUrlState, setWindow: DashboardHandlers['setWindow']): HTMLElement {
  const group = node('div', 'filter-group window-group');
  for (const value of ['24h', '7d', '30d'] as const) {
    const button = node('button', `filter-button${state.window === value ? ' is-active' : ''}`, value) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.testid = `window-${value}`;
    button.setAttribute('aria-pressed', String(state.window === value));
    button.addEventListener('click', () => setWindow(value));
    group.append(button);
  }
  return group;
}

function repositoryControl(response: OperationalDashboardResponseV1, state: ActivityUrlState, setRepository: DashboardHandlers['setRepository']): HTMLElement {
  const field = node('label', 'repository-filter dashboard-repository-filter');
  field.append(node('span', 'filter-label', 'Repository'));
  const select = node('select', 'repository-select') as HTMLSelectElement;
  select.dataset.testid = 'repository-select';
  const all = node('option', undefined, 'All observed repositories') as HTMLOptionElement;
  all.value = '';
  select.append(all);
  for (const repository of response.repositories) {
    const option = node('option', undefined, `${repository.owner}/${repository.name} (${repository.pullRequestCount})`) as HTMLOptionElement;
    option.value = String(repository.id);
    option.selected = state.repositoryId === repository.id;
    select.append(option);
  }
  select.addEventListener('change', () => setRepository(select.value ? Number(select.value) : null));
  field.append(select);
  return field;
}

export interface DashboardHandlers {
  setWindow(value: ActivityUrlState['window']): void;
  setRepository(value: number | null): void;
}

export function renderOperationalDashboard(
  account: AccountV1,
  response: OperationalDashboardResponseV1,
  state: ActivityUrlState,
  handlers: DashboardHandlers,
  previewSize: PreviewSize = DEFAULT_PREVIEW_SIZE,
  collapseSecondarySections = true,
): HTMLElement {
  const main = node('main', 'dashboard-page');
  main.dataset.testid = 'dashboard-view';

  const heading = node('div', 'activity-heading dashboard-heading');
  const copy = node('div', 'dashboard-heading-copy');
  copy.append(node('p', 'eyebrow', 'OPERATIONS'), node('div', 'heading-copy', 'Dashboard'));
  heading.append(copy, windowControls(state, handlers.setWindow));
  main.append(heading);

  if (account.repositoryCount === 0) {
    main.append(renderNoRepositories(account));
    return main;
  }
  if (!response.hasObservedHistory) {
    main.append(renderNoHistory(account));
    return main;
  }

  main.append(
    repositoryControl(response, state, handlers.setRepository),
    renderOverview(response, state),
    renderNeedsAttention(response, state, previewSize),
    renderActiveChanges(response, state, previewSize),
    renderTrendLink(state),
    renderRecentShell(state),
    renderInsightsShell(collapseSecondarySections),
  );
  return main;
}

export function renderDashboardRecentActivity(root: HTMLElement, response: ActivityResponseV1, state: ActivityUrlState): void {
  const content = root.querySelector<HTMLElement>('[data-testid="dashboard-recent-content"]');
  if (!content) return;
  const total = response.counts.LOW + response.counts.MEDIUM + response.counts.HIGH;
  const summaryCount = root.querySelector<HTMLElement>('[data-testid="recent-activity"] .home-section-count');
  if (summaryCount) summaryCount.textContent = String(total);
  if (!response.pullRequests.length) {
    content.replaceChildren(node('p', 'home-clear-state', 'No recent activity in this view.'));
    return;
  }
  content.replaceChildren(changeList(response.pullRequests.slice(0, 5), state, 'recent-change'));
}

export function renderDashboardRecentActivityError(root: HTMLElement): void {
  const content = root.querySelector<HTMLElement>('[data-testid="dashboard-recent-content"]');
  if (!content) return;
  const status = node('p', 'dashboard-section-error', 'Recent activity could not be loaded. The operational summary above is still current.');
  status.setAttribute('role', 'status');
  content.replaceChildren(status);
}

export function renderDashboardInsights(
  root: HTMLElement,
  response: OperationalDashboardResponseV1,
  insights: DashboardInsightsData,
  state: ActivityUrlState,
): void {
  const content = root.querySelector<HTMLElement>('[data-testid="dashboard-insights-content"]');
  if (!content) return;
  const activityLike: ActivityResponseV1 = {
    version: 1,
    selectedWindow: response.selectedWindow,
    selectedAttention: 'ALL',
    selectedRepositoryId: response.selectedRepositoryId,
    counts: response.counts,
    repositories: response.repositories,
    pullRequests: [],
    overview: response.overview,
    needsAttention: response.needsAttention,
    hasObservedHistory: response.hasObservedHistory,
    pagination: { nextCursor: null },
  };
  content.replaceChildren(renderHomeInsightCanvases(activityLike, insights.evaluations, insights.transitions, state));
}

export function renderDashboardInsightsError(root: HTMLElement): void {
  const content = root.querySelector<HTMLElement>('[data-testid="dashboard-insights-content"]');
  if (!content) return;
  const status = node('p', 'dashboard-section-error', 'Supporting insights could not be loaded. Needs attention and active-change data are unaffected.');
  status.setAttribute('role', 'status');
  content.replaceChildren(status);
}

export function markDashboardMergedUnresolved(root: HTMLElement, overview: OverviewDrilldownResponseV1): void {
  const merged = new Set(
    overview.items
      .filter((item) => item.kind === 'merge')
      .map((item) => `${item.repository.id}:${item.pullRequest.number}`),
  );
  for (const row of root.querySelectorAll<HTMLElement>('[data-testid^="recent-change-"]')) {
    if (!row.dataset.prKey || !merged.has(row.dataset.prKey)) continue;
    const title = row.querySelector<HTMLElement>('.dashboard-change-title');
    if (!title || title.querySelector('.merge-unresolved-badge')) continue;
    title.append(node('span', 'merge-unresolved-badge', 'Merged unresolved'));
  }
}
