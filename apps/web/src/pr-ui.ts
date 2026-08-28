import type {
  EvidenceHealthV1,
  PullRequestDetailV1,
  PullRequestInsightV1,
  PullRequestTransitionV1,
  ViewerV1,
} from '@spark/dashboard-contracts';
import { evidenceLabel, relativeTime, shortSha, trustedGitHubUrl } from './format';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function shell(viewer: ViewerV1): { root: HTMLElement; main: HTMLElement } {
  const root = node('div', 'app-shell');
  const header = node('header', 'topbar');
  const brand = node('a', 'brand', 'Spark') as HTMLAnchorElement;
  brand.href = '/app';
  brand.dataset.routerLink = 'true';
  const identity = node('div', 'viewer');
  const avatar = node('img', 'viewer-avatar') as HTMLImageElement;
  avatar.src = viewer.avatarUrl;
  avatar.alt = '';
  avatar.width = 24;
  avatar.height = 24;
  identity.append(avatar, node('span', 'viewer-login', viewer.login));
  header.append(brand, identity);
  const main = node('main', 'main-column pr-page');
  root.append(header, main);
  return { root, main };
}

function attentionClass(attention: string): string {
  return `attention attention-${attention.toLowerCase()}`;
}

export function pullRequestHref(repositoryId: number, pullRequestNumber: number, activitySearch = ''): string {
  const base = `/app/repositories/${repositoryId}/pulls/${pullRequestNumber}`;
  return activitySearch ? `${base}?${activitySearch}` : base;
}

function evaluationHref(repositoryId: number, headSha: string, activitySearch: string): string {
  const base = `/app/evaluations/${repositoryId}/${headSha}`;
  return activitySearch ? `${base}?${activitySearch}` : base;
}

function healthLabel(health: EvidenceHealthV1): string {
  if (health === 'CLEAR') return 'Clear';
  if (health === 'FAILED') return 'Failed evidence';
  if (health === 'PENDING_OR_MISSING') return 'Pending / missing';
  return 'Unknown';
}

function latestHealth(detail: PullRequestDetailV1): EvidenceHealthV1 {
  const evidence = detail.latest.evidenceSummary;
  if (evidence.failed > 0) return 'FAILED';
  if (evidence.pending > 0 || evidence.missing > 0) return 'PENDING_OR_MISSING';
  if (evidence.unknown > 0 && evidence.passed === 0) return 'UNKNOWN';
  return 'CLEAR';
}

function externalLink(label: string, value: string, className = 'secondary-link'): HTMLElement {
  const url = trustedGitHubUrl(value);
  if (!url) return node('span', 'external-link is-disabled', `${label} unavailable`);
  const link = node('a', className, label) as HTMLAnchorElement;
  link.href = url.toString();
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  return link;
}

function metric(label: string, value: string, detail?: string): HTMLElement {
  const card = node('div', 'pr-metric');
  card.append(node('span', 'pr-metric-label', label), node('strong', 'pr-metric-value', value));
  if (detail) card.append(node('span', 'pr-metric-detail', detail));
  return card;
}

function insightText(insight: PullRequestInsightV1): { title: string; body: string } {
  switch (insight.kind) {
    case 'CURRENTLY_CLEAR': return { title: 'Currently clear', body: 'The latest evaluation has no failed, pending, or missing evidence.' };
    case 'CURRENTLY_FAILING': return { title: 'Evidence currently failing', body: 'The latest evaluation contains failed evidence that may need investigation.' };
    case 'CURRENTLY_WAITING': return { title: 'Waiting on evidence', body: 'The latest evaluation still has pending or missing evidence.' };
    case 'CLEAR_STREAK': return { title: `${insight.value ?? 0}-run clear streak`, body: 'Recent evaluations have remained clear without an evidence regression.' };
    case 'FAILURE_STREAK': return { title: `${insight.value ?? 0}-run failure streak`, body: 'Failed evidence has persisted across consecutive evaluations.' };
    case 'EVIDENCE_RECOVERED': return { title: 'Evidence recovered', body: `Recovery was observed ${insight.value ?? 1} time${insight.value === 1 ? '' : 's'} during this PR.` };
    case 'EVIDENCE_REGRESSED': return { title: 'Evidence regressed', body: `Clear evidence returned to failing ${insight.value ?? 1} time${insight.value === 1 ? '' : 's'}.` };
    case 'ATTENTION_INCREASED': return { title: 'Attention increased', body: `Spark attention increased ${insight.value ?? 1} time${insight.value === 1 ? '' : 's'} during the change.` };
    case 'ATTENTION_DECREASED': return { title: 'Attention decreased', body: `Spark attention decreased ${insight.value ?? 1} time${insight.value === 1 ? '' : 's'} as the PR evolved.` };
  }
}

function transitionText(transition: PullRequestTransitionV1): string {
  if (transition.kind === 'EVIDENCE_RECOVERED') return `${healthLabel(transition.fromEvidenceHealth)} → clear`;
  if (transition.kind === 'EVIDENCE_REGRESSED') return `Clear → ${healthLabel(transition.toEvidenceHealth).toLowerCase()}`;
  if (transition.kind === 'EVIDENCE_BECAME_PENDING') return `Evidence → ${healthLabel(transition.toEvidenceHealth).toLowerCase()}`;
  if (transition.kind === 'EVIDENCE_RESOLVED') return `${healthLabel(transition.fromEvidenceHealth)} → ${healthLabel(transition.toEvidenceHealth).toLowerCase()}`;
  return `${transition.fromAttention} → ${transition.toAttention} attention`;
}

function currentSection(detail: PullRequestDetailV1, activitySearch: string): HTMLElement {
  const section = node('section', 'pr-current');
  const top = node('div', 'pr-current-top');
  const state = node('div', 'pr-current-state');
  state.append(node('span', attentionClass(detail.latest.attention), detail.latest.attention));
  const evidenceState = node('strong', `pr-health pr-health-${latestHealth(detail).toLowerCase().replaceAll('_', '-')}`, healthLabel(latestHealth(detail)));
  state.append(evidenceState, node('span', 'pr-current-evidence', evidenceLabel(detail.latest.evidenceSummary)));
  const time = node('time', 'pr-current-time', `Latest ${relativeTime(detail.latest.evaluatedAt)} ago`);
  time.dateTime = detail.latest.evaluatedAt;
  top.append(state, time);
  section.append(top);

  if (detail.latest.topReasons.length) {
    const why = node('div', 'pr-why');
    why.append(node('span', 'pr-section-kicker', 'Why this state'));
    const list = node('ul', 'pr-why-list');
    for (const reason of detail.latest.topReasons) list.append(node('li', undefined, reason));
    why.append(list);
    section.append(why);
  }

  const actions = node('div', 'pr-actions');
  const latest = node('a', 'primary-link', 'View latest evaluation') as HTMLAnchorElement;
  latest.href = evaluationHref(detail.repository.id, detail.latest.headSha, activitySearch);
  latest.dataset.routerLink = 'true';
  actions.append(latest, externalLink('Open GitHub PR', detail.pullRequest.url));
  section.append(actions);
  return section;
}

function historySection(detail: PullRequestDetailV1): HTMLElement {
  const section = node('section', 'pr-section');
  section.append(node('h2', undefined, 'Trajectory'));
  const evidence = detail.history.evidenceCounts;
  const attention = detail.history.attentionCounts;
  const metrics = node('div', 'pr-metrics');
  metrics.append(
    metric('Evaluations', String(detail.history.totalRuns), detail.truncated ? `Showing latest ${detail.runs.length}` : 'Complete observed history'),
    metric('Clear', String(evidence.CLEAR), detail.history.currentClearStreak ? `${detail.history.currentClearStreak} current streak` : undefined),
    metric('Failed evidence', String(evidence.FAILED), detail.history.currentFailureStreak ? `${detail.history.currentFailureStreak} current streak` : undefined),
    metric('Pending / missing', String(evidence.PENDING_OR_MISSING)),
  );
  section.append(metrics);
  const attentionLine = node('div', 'pr-attention-summary');
  attentionLine.append(
    node('span', undefined, 'Attention history'),
    node('strong', undefined, `${attention.HIGH} high · ${attention.MEDIUM} medium · ${attention.LOW} low`),
  );
  section.append(attentionLine);
  return section;
}

function insightsSection(detail: PullRequestDetailV1): HTMLElement {
  const section = node('section', 'pr-section');
  section.append(node('h2', undefined, 'Observations'));
  if (!detail.insights.length) {
    section.append(node('p', 'muted', 'No notable deterministic transitions observed yet.'));
    return section;
  }
  const list = node('div', 'pr-insights');
  for (const insight of detail.insights.slice(0, 6)) {
    const copy = insightText(insight);
    const item = node('div', 'pr-insight');
    item.append(node('strong', undefined, copy.title), node('span', undefined, copy.body));
    list.append(item);
  }
  section.append(list);
  return section;
}

function evidenceIssuesSection(detail: PullRequestDetailV1): HTMLElement {
  const section = node('section', 'pr-section');
  section.append(node('h2', undefined, 'Evidence issues'));
  if (!detail.evidenceIssues.length) {
    section.append(node('p', 'muted', 'No named evidence issues are available in the retained evaluation detail.'));
    return section;
  }
  const list = node('div', 'pr-issue-list');
  for (const issue of detail.evidenceIssues.slice(0, 10)) {
    const item = node('div', 'pr-issue');
    const title = node('div', 'pr-issue-title');
    title.append(node('strong', undefined, issue.name), node('span', undefined, `Latest: ${issue.latestStatus.toLowerCase()}`));
    const counts = [
      issue.failedRuns ? `${issue.failedRuns} failed` : '',
      issue.missingRuns ? `${issue.missingRuns} missing` : '',
      issue.pendingRuns ? `${issue.pendingRuns} pending` : '',
      issue.unknownRuns ? `${issue.unknownRuns} unknown` : '',
    ].filter(Boolean).join(' · ');
    item.append(title, node('span', 'pr-issue-counts', counts));
    if (issue.lastProblemAt) item.append(node('span', 'muted', `Most recent problem ${relativeTime(issue.lastProblemAt)} ago${issue.lastProblemHeadSha ? ` · ${shortSha(issue.lastProblemHeadSha)}` : ''}`));
    list.append(item);
  }
  section.append(list);
  return section;
}

function timelineSection(detail: PullRequestDetailV1, activitySearch: string): HTMLElement {
  const section = node('section', 'pr-section');
  const heading = node('div', 'pr-section-heading');
  heading.append(node('h2', undefined, 'Evaluation history'), node('span', 'muted', 'Newest first'));
  section.append(heading);
  const rail = node('div', 'pr-timeline');
  rail.setAttribute('role', 'list');
  for (const [index, run] of detail.runs.entries()) {
    const link = node('a', `pr-run${index === 0 ? ' is-latest' : ''}`) as HTMLAnchorElement;
    link.href = evaluationHref(detail.repository.id, run.headSha, activitySearch);
    link.dataset.routerLink = 'true';
    link.setAttribute('role', 'listitem');
    const top = node('span', 'pr-run-top');
    top.append(node('span', attentionClass(run.attention), run.attention), node('code', undefined, shortSha(run.headSha)));
    link.append(top, node('strong', undefined, evidenceLabel(run.evidenceSummary)), node('time', undefined, `${relativeTime(run.evaluatedAt)} ago`));
    if (index === 0) link.append(node('span', 'pr-run-latest', 'Latest'));
    rail.append(link);
  }
  section.append(rail);

  if (detail.transitions.length) {
    const transitions = node('div', 'pr-transition-list');
    transitions.append(node('span', 'pr-section-kicker', 'Notable transitions'));
    for (const item of [...detail.transitions].reverse().slice(0, 6)) {
      const row = node('div', 'pr-transition');
      row.append(node('strong', undefined, transitionText(item)), node('span', undefined, `${shortSha(item.toHeadSha)} · ${relativeTime(item.evaluatedAt)} ago`));
      transitions.append(row);
    }
    section.append(transitions);
  }
  return section;
}

export function renderPullRequest(viewer: ViewerV1, detail: PullRequestDetailV1, activitySearch: string): HTMLElement {
  const { root, main } = shell(viewer);
  main.dataset.testid = 'pull-request-detail';
  const back = node('a', 'back-link', '← Activity') as HTMLAnchorElement;
  back.href = `/app${activitySearch ? `?${activitySearch}` : ''}`;
  back.dataset.routerLink = 'true';
  main.append(back);

  const header = node('header', 'pr-header');
  header.append(node('p', 'pr-repo', `${detail.repository.owner}/${detail.repository.name} · PR #${detail.pullRequest.number}`), node('h1', undefined, detail.pullRequest.title));
  main.append(header, currentSection(detail, activitySearch), historySection(detail), insightsSection(detail), evidenceIssuesSection(detail), timelineSection(detail, activitySearch));
  return root;
}

function transitionForRun(detail: PullRequestDetailV1, headSha: string): PullRequestTransitionV1[] {
  return detail.transitions.filter(item => item.toHeadSha === headSha);
}

export function enhanceEvaluationWithPullRequestContext(
  root: HTMLElement,
  detail: PullRequestDetailV1,
  headSha: string,
  activitySearch: string,
): void {
  const main = root.querySelector<HTMLElement>('main[data-testid="evaluation-detail"]');
  if (!main) return;
  const existingBack = main.querySelector<HTMLAnchorElement>('.back-link');
  if (existingBack) {
    existingBack.textContent = `← PR #${detail.pullRequest.number}`;
    existingBack.href = pullRequestHref(detail.repository.id, detail.pullRequest.number, activitySearch);
  }

  const index = detail.runs.findIndex(run => run.headSha === headSha);
  if (index < 0) return;
  const previous = detail.runs[index + 1];
  const next = index > 0 ? detail.runs[index - 1] : undefined;
  const context = node('section', 'evaluation-pr-context');
  const position = node('div', 'evaluation-pr-position');
  position.append(node('strong', undefined, `Evaluation ${detail.runs.length - index} of ${detail.history.totalRuns}`), node('span', undefined, `Head ${shortSha(headSha)}`));
  const nav = node('div', 'evaluation-run-nav');
  if (previous) {
    const link = node('a', 'secondary-link', '← Previous') as HTMLAnchorElement;
    link.href = evaluationHref(detail.repository.id, previous.headSha, activitySearch);
    link.dataset.routerLink = 'true';
    nav.append(link);
  }
  if (next) {
    const link = node('a', 'secondary-link', 'Next →') as HTMLAnchorElement;
    link.href = evaluationHref(detail.repository.id, next.headSha, activitySearch);
    link.dataset.routerLink = 'true';
    nav.append(link);
  }
  position.append(nav);
  context.append(position);

  const changes = transitionForRun(detail, headSha);
  if (changes.length) {
    const since = node('div', 'evaluation-since');
    since.append(node('span', 'pr-section-kicker', 'Since previous evaluation'));
    for (const item of changes) since.append(node('div', 'evaluation-since-row', transitionText(item)));
    context.append(since);
  }

  const back = main.querySelector('.back-link');
  if (back) back.insertAdjacentElement('afterend', context);
  else main.prepend(context);
}
