import type { AccountV1, ActivityOverviewV1, ActivityResponseV1, PullRequestActivityV1 } from '@spark/dashboard-contracts';
import { evidenceLabel, relativeTime } from './format';
import type { OverviewDrilldownResponseV1, OverviewMetricV1 } from './overview-api';
import { serializeActivityState, type ActivityUrlState } from './state';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function overviewFallback(response: ActivityResponseV1): ActivityOverviewV1 {
  const observedPRs = response.counts.LOW + response.counts.MEDIUM + response.counts.HIGH;
  return {
    observedPRs,
    totalEvaluations: observedPRs,
    activePRsNeedingAttention: response.counts.HIGH + response.counts.MEDIUM,
    mergedUnresolved: 0,
    recovery: { recoveredPRs: 0, failedToClearEvents: 0, waitingToClearEvents: 0 },
  };
}

function overviewHref(metric: OverviewMetricV1, state: ActivityUrlState): string {
  const search = serializeActivityState({
    ...state,
    attention: 'ALL',
    cursor: null,
    query: undefined,
    favoritesOnly: false,
  });
  return `/app/overview/${metric}${search ? `?${search}` : ''}`;
}

function metric(label: string, value: number, metricKey: OverviewMetricV1, state: ActivityUrlState, detail?: string): HTMLAnchorElement {
  const card = node('a', 'home-metric home-metric-link') as HTMLAnchorElement;
  card.href = overviewHref(metricKey, state);
  card.dataset.routerLink = 'true';
  card.dataset.testid = `overview-card-${metricKey}`;
  card.setAttribute('aria-label', `Open ${label.toLowerCase()} details: ${value}`);
  card.append(node('strong', 'home-metric-value', String(value)), node('span', 'home-metric-label', label));
  if (detail) card.append(node('span', 'home-metric-detail', detail));
  card.append(node('span', 'home-metric-arrow', '→'));
  return card;
}

function renderOverview(response: ActivityResponseV1, state: ActivityUrlState): HTMLElement {
  const overview = response.overview ?? overviewFallback(response);
  const section = node('section', 'home-overview');
  section.dataset.testid = 'change-overview';
  section.setAttribute('aria-label', 'Change overview');

  const metrics = node('div', 'home-metrics');
  metrics.append(
    metric('Observed PRs', overview.observedPRs, 'pull-requests', state),
    metric('Evaluations', overview.totalEvaluations, 'evaluations', state),
    metric('Need attention', overview.activePRsNeedingAttention, 'attention', state),
    metric('Merged unresolved', overview.mergedUnresolved, 'merged-unresolved', state),
  );

  const recovery = node('div', 'home-recovery');
  recovery.append(
    node('span', 'home-recovery-label', 'Recovery'),
    node('span', undefined, `${overview.recovery.recoveredPRs} PR${overview.recovery.recoveredPRs === 1 ? '' : 's'} recovered`),
    node('span', undefined, `${overview.recovery.failedToClearEvents} failed-to-clear`),
    node('span', undefined, `${overview.recovery.waitingToClearEvents} waiting-to-clear`),
  );
  section.append(metrics, recovery);
  return section;
}

function attentionHref(activity: PullRequestActivityV1, state: ActivityUrlState): string {
  const search = serializeActivityState(state);
  const path = `/app/repositories/${activity.repository.id}/pulls/${activity.pullRequest.number}`;
  return `${path}${search ? `?${search}` : ''}`;
}

function attentionReason(activity: PullRequestActivityV1): string {
  const latest = activity.latest;
  return latest.topReasons[0] ?? latest.sensitiveSurfaces[0] ?? evidenceLabel(latest.evidenceSummary);
}

function renderNeedsAttention(response: ActivityResponseV1, state: ActivityUrlState): HTMLElement {
  const needsAttention = response.needsAttention ?? {
    total: response.pullRequests.filter((item) => item.latest.attention === 'HIGH' || item.latest.attention === 'MEDIUM').length,
    preview: response.pullRequests.filter((item) => item.latest.attention === 'HIGH' || item.latest.attention === 'MEDIUM').slice(0, 5),
  };
  const section = node('section', 'needs-attention');
  section.dataset.testid = 'needs-attention';

  const heading = node('div', 'home-section-heading');
  const title = node('h2');
  const titleLink = node('a', 'home-section-link', 'Needs attention') as HTMLAnchorElement;
  titleLink.href = overviewHref('attention', state);
  titleLink.dataset.routerLink = 'true';
  title.append(titleLink);
  heading.append(title, node('span', 'home-section-count', String(needsAttention.total)));
  section.append(heading);

  if (!needsAttention.preview.length) {
    section.append(node('p', 'home-clear-state', 'Nothing currently needs attention in this view.'));
    return section;
  }

  const list = node('div', 'needs-attention-list');
  for (const activity of needsAttention.preview) {
    const latest = activity.latest;
    const link = node('a', 'needs-attention-row') as HTMLAnchorElement;
    link.href = attentionHref(activity, state);
    link.dataset.routerLink = 'true';
    link.setAttribute('aria-label', `Review ${latest.attention} attention for pull request ${activity.pullRequest.number}: ${activity.pullRequest.title}`);

    const attention = node('span', `attention attention-${latest.attention.toLowerCase()}`, latest.attention);
    const body = node('span', 'needs-attention-body');
    body.append(
      node('strong', 'needs-attention-title', activity.pullRequest.title),
      node('span', 'needs-attention-context', `${activity.repository.owner}/${activity.repository.name} · #${activity.pullRequest.number}`),
      node('span', 'needs-attention-reason', attentionReason(activity)),
    );
    const time = node('time', 'needs-attention-time', relativeTime(latest.evaluatedAt));
    time.dateTime = latest.evaluatedAt;
    link.append(attention, body, time);
    list.append(link);
  }
  section.append(list);
  return section;
}

function chartBucketLabel(value: string, hourly: boolean): string {
  const date = new Date(value);
  return hourly
    ? date.toLocaleTimeString(undefined, { hour: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function miniChart(
  title: string,
  overview: OverviewDrilldownResponseV1,
  read: (point: OverviewDrilldownResponseV1['trend'][number]) => number,
): HTMLElement {
  const figure = node('figure', 'home-chart');
  const caption = node('figcaption', 'home-chart-caption');
  caption.append(node('strong', undefined, title), node('span', undefined, overview.selectedWindow === '24h' ? 'Hourly' : 'Daily'));
  figure.append(caption);

  const values = overview.trend.map(read);
  const max = Math.max(1, ...values);
  const bars = node('div', 'home-chart-bars');
  bars.setAttribute('role', 'img');
  bars.setAttribute('aria-label', `${title} over ${overview.selectedWindow}`);
  overview.trend.forEach((point, index) => {
    const value = values[index];
    const cell = node('div', 'home-chart-cell');
    const bar = node('div', 'home-chart-bar');
    bar.style.height = `${Math.max(value > 0 ? 7 : 1, (value / max) * 100)}%`;
    const label = chartBucketLabel(point.bucketStart, overview.selectedWindow === '24h');
    cell.title = `${label}: ${value}`;
    cell.setAttribute('aria-label', `${label}: ${value}`);
    cell.append(bar);
    bars.append(cell);
  });
  figure.append(bars);
  return figure;
}

function renderHomeCharts(overview?: OverviewDrilldownResponseV1): HTMLElement | undefined {
  if (!overview?.trend.length) return undefined;
  const section = node('section', 'home-chart-grid');
  section.dataset.testid = 'home-charts';
  section.append(
    miniChart('Evaluation volume', overview, (point) => point.evaluations),
    miniChart('Attention evaluations', overview, (point) => point.attentionEvaluations),
  );
  return section;
}

function markMergedUnresolved(main: HTMLElement, overview?: OverviewDrilldownResponseV1): void {
  if (!overview) return;
  for (const item of overview.items) {
    if (item.kind !== 'merge') continue;
    const wrapper = main.querySelector<HTMLElement>(`[data-testid="pull-request-${item.repository.id}-${item.pullRequest.number}"]`);
    if (!wrapper || wrapper.querySelector('.merge-unresolved-badge')) continue;
    wrapper.classList.add('is-merged-unresolved');
    const title = wrapper.querySelector<HTMLElement>('.evaluation-title');
    if (!title) continue;
    const badge = node('span', 'merge-unresolved-badge', 'Merged unresolved');
    badge.title = 'This pull request merged while Spark still had unresolved attention or evidence.';
    title.insertAdjacentElement('afterend', badge);
  }
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
  const states = [
    ['LOW', 'Initial evaluation'],
    ['HIGH', 'Sensitive surface touched · integration evidence missing'],
    ['MEDIUM', 'Unit evidence recovered · integration evidence still missing'],
    ['MERGED', 'Merged with unresolved attention'],
  ];
  for (const [level, copy] of states) {
    const row = node('div', 'example-story-row');
    row.append(node('strong', 'example-story-state', level), node('span', undefined, copy));
    story.append(row);
  }
  example.append(story);
  section.append(example);
  return section;
}

export function enhanceActivityHome(
  root: HTMLElement,
  account: AccountV1,
  response: ActivityResponseV1,
  state: ActivityUrlState,
  overviewDetail?: OverviewDrilldownResponseV1,
): HTMLElement {
  const main = root.querySelector<HTMLElement>('main[data-testid="activity-view"]');
  if (!main) return root;

  const heading = main.querySelector<HTMLElement>('.activity-heading');
  const headingCopy = heading?.querySelector<HTMLElement>('.heading-copy');
  if (headingCopy) headingCopy.textContent = 'Change overview';

  if (account.repositoryCount === 0) {
    main.replaceChildren(...(heading ? [heading] : []), renderNoRepositories(account));
    return root;
  }

  const hasObservedHistory = response.hasObservedHistory ?? response.repositories.length > 0;
  if (!hasObservedHistory) {
    main.replaceChildren(...(heading ? [heading] : []), renderNoHistory(account));
    return root;
  }

  const attentionFilters = main.querySelector<HTMLElement>('.attention-filters');
  if (!heading || !attentionFilters) return root;

  heading.after(renderOverview(response, state), renderNeedsAttention(response, state));
  const charts = renderHomeCharts(overviewDetail);
  if (charts) main.querySelector('.needs-attention')?.insertAdjacentElement('afterend', charts);

  const recent = node('div', 'recent-activity-heading');
  recent.append(node('h2', undefined, 'Recent activity'), node('span', undefined, 'Search, favorites, and attention filters apply below.'));
  attentionFilters.before(recent);
  markMergedUnresolved(main, overviewDetail);
  return root;
}
