import type { ActivityWindowV1, EvaluationSummaryV1, PullRequestActivityV1, ViewerV1 } from '@spark/dashboard-contracts';
import { evidenceLabel, relativeTime, shortSha } from './format';
import { renderOverviewInsightCanvases } from './insight-canvases';
import type { NotableTransitionInsightsV1, OverviewDrilldownResponseV1, OverviewMetricV1 } from './overview-api';
import type { ActivityUrlState } from './state';
import { serializeActivityState } from './state';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

const metricConfig: Record<OverviewMetricV1, { title: string; description: string }> = {
  'pull-requests': {
    title: 'Observed pull requests',
    description: 'Pull requests with at least one Spark evaluation in the selected window.',
  },
  evaluations: {
    title: 'Evaluations',
    description: 'Immutable Spark evaluation runs recorded in the selected window.',
  },
  attention: {
    title: 'Needs attention',
    description: 'Open pull requests whose latest Spark state is HIGH or MEDIUM attention.',
  },
  'merged-unresolved': {
    title: 'Merged unresolved',
    description: 'Pull requests merged while Spark still had unresolved attention or evidence.',
  },
};

function stateHref(path: string, state: ActivityUrlState): string {
  const search = serializeActivityState({ ...state, attention: 'ALL', query: undefined, favoritesOnly: false, cursor: null });
  return `${path}${search ? `?${search}` : ''}`;
}

function windowControls(state: ActivityUrlState, onWindow: (window: ActivityWindowV1) => void): HTMLElement {
  const group = node('div', 'filter-group window-group overview-window-group');
  for (const value of ['24h', '7d', '30d'] as const) {
    const button = node('button', `filter-button${state.window === value ? ' is-active' : ''}`, value) as HTMLButtonElement;
    button.type = 'button';
    button.setAttribute('aria-pressed', state.window === value ? 'true' : 'false');
    button.dataset.testid = `overview-window-${value}`;
    button.addEventListener('click', () => onWindow(value));
    group.append(button);
  }
  return group;
}

function attentionBadge(attention: string): HTMLElement {
  return node('span', `attention attention-${attention.toLowerCase()}`, attention);
}

function prHref(activity: PullRequestActivityV1, state: ActivityUrlState): string {
  return stateHref(`/app/repositories/${activity.repository.id}/pulls/${activity.pullRequest.number}`, state);
}

function evaluationHref(evaluation: EvaluationSummaryV1, state: ActivityUrlState): string {
  if (evaluation.runId) return stateHref(`/app/repositories/${evaluation.repository.id}/runs/${encodeURIComponent(evaluation.runId)}`, state);
  return stateHref(`/app/evaluations/${evaluation.repository.id}/${evaluation.headSha}`, state);
}

function pullRequestItem(activity: PullRequestActivityV1, state: ActivityUrlState, mergeWarning = false): HTMLElement {
  const link = node('a', 'overview-list-row') as HTMLAnchorElement;
  link.href = prHref(activity, state);
  link.dataset.routerLink = 'true';
  link.append(attentionBadge(activity.latest.attention));
  const body = node('span', 'overview-list-body');
  const title = node('span', 'overview-list-title');
  title.append(node('strong', undefined, activity.pullRequest.title));
  if (mergeWarning) title.append(node('span', 'merge-unresolved-badge', 'Merged unresolved'));
  body.append(
    title,
    node('span', 'overview-list-context', `${activity.repository.owner}/${activity.repository.name} · #${activity.pullRequest.number} · ${activity.history.runCount} evaluation${activity.history.runCount === 1 ? '' : 's'}`),
    node('span', 'overview-list-signal', activity.latest.topReasons[0] ?? evidenceLabel(activity.latest.evidenceSummary)),
  );
  const time = node('time', 'overview-list-time', relativeTime(activity.latest.evaluatedAt));
  time.dateTime = activity.latest.evaluatedAt;
  link.append(body, time);
  return link;
}

function evaluationItem(evaluation: EvaluationSummaryV1, state: ActivityUrlState): HTMLElement {
  const link = node('a', 'overview-list-row overview-evaluation-row') as HTMLAnchorElement;
  link.href = evaluationHref(evaluation, state);
  link.dataset.routerLink = 'true';
  link.append(attentionBadge(evaluation.attention));
  const body = node('span', 'overview-list-body');
  body.append(
    node('strong', 'overview-list-title', evaluation.pullRequest.title),
    node('span', 'overview-list-context', `${evaluation.repository.owner}/${evaluation.repository.name} · #${evaluation.pullRequest.number} · ${shortSha(evaluation.headSha)}`),
    node('span', 'overview-list-signal', evidenceLabel(evaluation.evidenceSummary)),
  );
  const time = node('time', 'overview-list-time', relativeTime(evaluation.evaluatedAt));
  time.dateTime = evaluation.evaluatedAt;
  link.append(body, time);
  return link;
}

export function renderOverviewDrilldown(
  viewer: ViewerV1,
  response: OverviewDrilldownResponseV1,
  state: ActivityUrlState,
  onWindow: (window: ActivityWindowV1) => void,
  transitions: NotableTransitionInsightsV1,
  companion?: OverviewDrilldownResponseV1,
): HTMLElement {
  const main = node('main', 'overview-detail-page');
  main.dataset.testid = `overview-${response.metric}`;

  const back = node('a', 'back-link', '← Change overview') as HTMLAnchorElement;
  back.href = stateHref('/app', state);
  back.dataset.routerLink = 'true';
  main.append(back);

  const config = metricConfig[response.metric];
  const heading = node('header', 'overview-detail-heading');
  const copy = node('div', 'overview-detail-heading-copy');
  copy.append(node('p', 'eyebrow', 'CHANGE OVERVIEW'), node('h1', undefined, config.title), node('p', 'state-copy', config.description));
  const total = node('div', 'overview-detail-total');
  total.append(node('strong', undefined, String(response.total)), node('span', undefined, `in ${state.window}`));
  heading.append(copy, total, windowControls(state, onWindow));
  main.append(heading, renderOverviewInsightCanvases(response, transitions, state, companion));

  if (response.metric === 'attention') {
    main.append(node('p', 'overview-chart-note', 'The headline count is the current active queue. Transition charts show notable changes observed during the selected window, not historical queue snapshots.'));
  }

  const section = node('section', 'overview-list-section');
  const sectionHeading = node('div', 'home-section-heading');
  sectionHeading.append(node('h2', undefined, response.metric === 'evaluations' ? 'Evaluation history' : 'Pull requests'), node('span', 'home-section-count', String(response.total)));
  section.append(sectionHeading);

  const list = node('div', 'overview-list');
  for (const item of response.items) {
    if (item.kind === 'evaluation') {
      list.append(evaluationItem(item.evaluation, state));
      continue;
    }
    if (item.kind === 'pull-request') {
      list.append(pullRequestItem(item.activity, state, item.lifecycle?.unresolvedAtMerge === true));
      continue;
    }
    const latest = item.latest;
    const pseudoActivity: PullRequestActivityV1 = {
      repository: item.repository,
      pullRequest: item.pullRequest,
      latest: latest ?? {
        repository: item.repository,
        pullRequest: item.pullRequest,
        headSha: item.lifecycle.mergeSha ?? 'unknown',
        attention: item.lifecycle.preMergeAttention ?? 'MEDIUM',
        topReasons: ['Merged before unresolved Spark attention cleared'],
        changeSummary: { files: 0, extensions: [] },
        sensitiveSurfaces: [],
        evidenceSummary: { passed: 0, pending: 0, failed: 0, missing: 0, unknown: 1 },
        evaluatedAt: item.lifecycle.mergedAt ?? item.lifecycle.lastEventAt,
        githubCheckUrl: item.pullRequest.url,
        detailAvailable: false,
      },
      history: { runCount: latest ? 1 : 0, attentionCounts: { LOW: 0, MEDIUM: 0, HIGH: 0 } },
    };
    const row = pullRequestItem(pseudoActivity, state, true);
    const context = row.querySelector<HTMLElement>('.overview-list-context');
    if (context && item.lifecycle.mergedAt) context.textContent = `${item.repository.owner}/${item.repository.name} · #${item.pullRequest.number} · merged ${relativeTime(item.lifecycle.mergedAt)}`;
    const signal = row.querySelector<HTMLElement>('.overview-list-signal');
    if (signal) signal.textContent = `${item.lifecycle.preMergeAttention ?? 'Unknown'} attention · ${item.lifecycle.preMergeEvidenceHealth ?? 'unknown evidence'}`;
    list.append(row);
  }

  if (!response.items.length) {
    const empty = node('div', 'empty-state');
    empty.append(node('h2', undefined, 'Nothing in this window.'), node('p', 'state-copy', 'Try a broader time window or another repository.'));
    list.append(empty);
  }
  section.append(list);
  if (response.truncated) section.append(node('p', 'overview-truncated', `Showing the latest ${response.items.length} of ${response.total}.`));
  main.append(section);
  void viewer;
  return main;
}
