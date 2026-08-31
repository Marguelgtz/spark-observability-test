import type {
  EvaluationSummaryV1,
  EvidenceHealthV1,
  NotableTransitionV1,
  PullRequestDetailV1,
  PullRequestInsightV1,
  PullRequestTrajectoryV1,
  PullRequestTransitionV1,
  SaveTrajectoryFeedbackV1,
  TrajectoryFeedbackClassificationV1,
  TrajectoryFeedbackV1,
  ViewerV1,
} from '@spark/dashboard-contracts';
import type { FavoriteStore } from './favorites';
import { evidenceLabel, relativeTime, shortSha, trustedGitHubUrl } from './format';
import { DEFAULT_PREVIEW_SIZE, progressiveList, type PreviewSize } from './progressive-list';
import { evaluationTarget, favoriteButton } from './ui';
import { activityRouteHref } from './route-links';

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

export function evaluationHref(repositoryId: number, headSha: string, activitySearch: string): string {
  // R6.1: encode the id so it re-parses through the router's shared (non-slash) id grammar.
  const base = `/app/evaluations/${repositoryId}/${encodeURIComponent(headSha)}`;
  return activitySearch ? `${base}?${activitySearch}` : base;
}

export function runHref(repositoryId: number, runId: string, activitySearch: string): string {
  const base = `/app/repositories/${repositoryId}/runs/${encodeURIComponent(runId)}`;
  return activitySearch ? `${base}?${activitySearch}` : base;
}

function observationHref(summary: EvaluationSummaryV1, activitySearch: string): string {
  return summary.runId
    ? runHref(summary.repository.id, summary.runId, activitySearch)
    : evaluationHref(summary.repository.id, summary.headSha, activitySearch);
}

function healthLabel(health: EvidenceHealthV1): string {
  if (health === 'CLEAR') return 'Clear';
  if (health === 'FAILED') return 'Failed evidence';
  if (health === 'PENDING_OR_MISSING') return 'Pending / missing';
  return 'Unknown';
}

function summaryHealth(summary: EvaluationSummaryV1): EvidenceHealthV1 {
  const evidence = summary.evidenceSummary;
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

function notableTransitionTitle(transition: NotableTransitionV1): string {
  const { delta } = transition;
  if (delta.attention) return `${delta.attention.from} → ${delta.attention.to}`;
  if (delta.evidenceHealth) return `${healthLabel(delta.evidenceHealth.from)} → ${healthLabel(delta.evidenceHealth.to)}`;
  if (transition.kinds.includes('SENSITIVE_SURFACE_ADDED')) return 'Sensitive surface added';
  return 'Change scope expanded';
}

function evidenceStatusLabel(status: string | undefined): string {
  return status ? status.toLowerCase().replaceAll('_', ' ') : 'not present';
}

function notableTransitionCauses(transition: NotableTransitionV1): string[] {
  const { delta } = transition;
  const causes = delta.evidence.map(item => `${item.name}: ${evidenceStatusLabel(item.from)} → ${evidenceStatusLabel(item.to)}`);
  if (delta.sensitiveSurfaces.added.length) causes.push(`Sensitive surface added: ${delta.sensitiveSurfaces.added.join(', ')}`);
  if (delta.areas.directAdded.length) causes.push(`Direct area added: ${delta.areas.directAdded.join(', ')}`);
  if (delta.areas.affectedAdded.length) causes.push(`Affected area added: ${delta.areas.affectedAdded.join(', ')}`);
  if (delta.changedFiles.added.length) causes.push(`Change scope added ${delta.changedFiles.added.length} file${delta.changedFiles.added.length === 1 ? '' : 's'}`);
  for (const reason of delta.reasons.added.slice(0, 2)) causes.push(reason);
  if (delta.detailCompleteness === 'PARTIAL') causes.push('Structured detail is incomplete for this boundary');
  return [...new Set(causes)];
}

const FEEDBACK_OPTIONS: Array<{ value: TrajectoryFeedbackClassificationV1; label: string }> = [
  { value: 'USEFUL', label: 'Useful' },
  { value: 'EXPECTED', label: 'Expected' },
  { value: 'FALSE_POSITIVE', label: 'False positive' },
  { value: 'FIXED_BECAUSE_SPARK', label: 'Fixed because of Spark' },
];

export type SaveTransitionFeedback = (
  transitionId: string,
  input: SaveTrajectoryFeedbackV1,
) => Promise<TrajectoryFeedbackV1>;

function feedbackControls(
  transition: NotableTransitionV1,
  saved: TrajectoryFeedbackV1 | undefined,
  saveFeedback: SaveTransitionFeedback,
): HTMLElement {
  const controls = node('div', 'pr-feedback');
  controls.dataset.testid = 'transition-feedback';
  controls.append(node('span', 'pr-feedback-question', 'Was this useful?'));
  const options = node('div', 'pr-feedback-options');
  const buttons: HTMLButtonElement[] = [];
  for (const option of FEEDBACK_OPTIONS) {
    const button = node('button', 'pr-feedback-option', option.label) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.classification = option.value;
    button.setAttribute('aria-pressed', String(saved?.classification === option.value));
    if (saved?.classification === option.value) button.classList.add('is-selected');
    buttons.push(button);
    options.append(button);
  }
  controls.append(options);

  const context = node('details', 'pr-feedback-context');
  context.append(node('summary', undefined, saved?.note ? 'Edit optional context' : 'Add optional context'));
  const note = node('textarea') as HTMLTextAreaElement;
  note.maxLength = 500;
  note.rows = 2;
  note.placeholder = 'What made this useful or inaccurate? (500 characters max)';
  note.setAttribute('aria-label', 'Optional feedback context');
  note.value = saved?.note ?? '';
  context.append(note);
  controls.append(context);

  const status = node('span', 'pr-feedback-status', saved ? 'Feedback saved' : '');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  controls.append(status);

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const classification = button.dataset.classification as TrajectoryFeedbackClassificationV1;
      const noteValue = note.value.trim();
      for (const item of buttons) item.disabled = true;
      status.textContent = 'Saving feedback…';
      void saveFeedback(transition.id, {
        classification,
        ...(noteValue ? { note: noteValue } : {}),
      }).then((result) => {
        for (const item of buttons) {
          const selected = item.dataset.classification === result.classification;
          item.classList.toggle('is-selected', selected);
          item.setAttribute('aria-pressed', String(selected));
        }
        note.value = result.note ?? '';
        status.textContent = `Saved as ${FEEDBACK_OPTIONS.find(item => item.value === result.classification)?.label ?? 'feedback'}`;
      }).catch(() => {
        status.textContent = 'Feedback could not be saved. Try again.';
      }).finally(() => {
        for (const item of buttons) item.disabled = false;
      });
    });
  }
  return controls;
}

function currentSection(detail: PullRequestTrajectoryV1, activitySearch: string): HTMLElement {
  const section = node('section', 'pr-current');
  const top = node('div', 'pr-current-top');
  const state = node('div', 'pr-current-state');
  state.append(node('span', attentionClass(detail.current.attention), detail.current.attention));
  const currentHealth = summaryHealth(detail.current);
  const evidenceState = node('strong', `pr-health pr-health-${currentHealth.toLowerCase().replaceAll('_', '-')}`, healthLabel(currentHealth));
  state.append(evidenceState, node('span', 'pr-current-evidence', evidenceLabel(detail.current.evidenceSummary)));
  const time = node('time', 'pr-current-time', `Latest ${relativeTime(detail.current.evaluatedAt)} ago`);
  time.dateTime = detail.current.evaluatedAt;
  top.append(state, time);
  section.append(top);

  if (detail.current.topReasons.length) {
    const why = node('div', 'pr-why');
    why.append(node('span', 'pr-section-kicker', 'Why this state'));
    const list = node('ul', 'pr-why-list');
    for (const reason of detail.current.topReasons) list.append(node('li', undefined, reason));
    why.append(list);
    section.append(why);
  }

  const actions = node('div', 'pr-actions');
  const latest = node('a', 'primary-link', 'View latest evaluation') as HTMLAnchorElement;
  latest.href = observationHref(detail.current, activitySearch);
  latest.dataset.routerLink = 'true';
  actions.append(latest, externalLink('Open GitHub PR', detail.pullRequest.url));
  section.append(actions);
  return section;
}

function historySection(detail: PullRequestTrajectoryV1): HTMLElement {
  const section = node('section', 'pr-section');
  section.append(node('h2', undefined, 'Trajectory'));
  const historyNote = detail.historyCompleteness === 'PARTIAL_BACKFILL'
    ? detail.truncated
      ? `Partial history · showing latest ${detail.runs.length}`
      : 'Includes reconstructed pre-trajectory history'
    : detail.truncated
      ? `Showing latest ${detail.runs.length}`
      : 'Complete observed history';
  const metrics = node('div', 'pr-metrics');
  metrics.append(
    metric('Evaluations', String(detail.summary.totalRuns), historyNote),
    metric('Notable transitions', String(detail.summary.totalTransitions), `${detail.summary.analyzedRuns} runs analyzed`),
    metric('Regressions', String(detail.summary.regressions)),
    metric('Recoveries', String(detail.summary.recoveries), detail.summary.currentClearStreak ? `${detail.summary.currentClearStreak} current clear streak` : undefined),
  );
  section.append(metrics);
  const attentionLine = node('div', 'pr-attention-summary');
  attentionLine.append(
    node('span', undefined, 'Attention movement'),
    node('strong', undefined, `${detail.summary.attentionIncreases} increased · ${detail.summary.attentionDecreases} decreased`),
  );
  section.append(attentionLine);
  return section;
}

function lifecycleTerminal(detail: PullRequestTrajectoryV1): HTMLElement | undefined {
  const lifecycle = detail.lifecycle;
  if (!lifecycle || lifecycle.state === 'OPEN') return undefined;
  const section = node('section', `pr-terminal pr-terminal-${lifecycle.state.toLowerCase()}`);
  section.dataset.testid = 'lifecycle-terminal';
  const heading = node('div', 'pr-terminal-heading');
  const label = lifecycle.state === 'MERGED'
    ? `Merged${lifecycle.preMergeAttention ? ` · ${lifecycle.preMergeAttention}` : ''}`
    : 'Closed without merge';
  heading.append(node('strong', undefined, label));
  const terminalAt = lifecycle.mergedAt ?? lifecycle.closedAt ?? lifecycle.lastEventAt;
  const time = node('time', undefined, `${relativeTime(terminalAt)} ago`);
  time.dateTime = terminalAt;
  heading.append(time);
  section.append(heading);

  if (lifecycle.state === 'MERGED') {
    const copy = lifecycle.preMergeRunId && lifecycle.preMergeEvidenceHealth
      ? `At merge, Spark's selected pre-merge observation was ${lifecycle.preMergeAttention ?? 'unknown attention'} with ${healthLabel(lifecycle.preMergeEvidenceHealth).toLowerCase()}.`
      : 'No Spark evaluation was available at or before merge.';
    section.append(node('p', undefined, copy));
    if (lifecycle.unresolvedAtMerge !== undefined) {
      section.append(node(
        'span',
        lifecycle.unresolvedAtMerge ? 'pr-terminal-status is-unresolved' : 'pr-terminal-status is-resolved',
        lifecycle.unresolvedAtMerge ? 'Unresolved at merge' : 'Clear at merge',
      ));
    }
  }
  return section;
}

function insightsSection(detail: Pick<PullRequestTrajectoryV1, 'insights'>): HTMLElement {
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

function evidenceIssuesSection(detail: Pick<PullRequestTrajectoryV1, 'evidenceIssues'>): HTMLElement {
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

function timelineSection(
  detail: PullRequestTrajectoryV1,
  activitySearch: string,
  favorites: FavoriteStore,
  saveFeedback: SaveTransitionFeedback,
  previewSize: PreviewSize,
): HTMLElement {
  const section = node('section', 'pr-section');
  const heading = node('div', 'pr-section-heading');
  heading.append(node('h2', undefined, 'Evaluation history'), node('span', 'muted', 'Newest first'));
  section.append(heading);
  const renderRun = (run: EvaluationSummaryV1): HTMLElement => {
    const index = detail.runs.indexOf(run);
    const runShell = node('div', 'pr-run-shell');
    runShell.setAttribute('role', 'listitem');
    runShell.tabIndex = -1;
    const link = node('a', `pr-run${index === 0 ? ' is-latest' : ''}`) as HTMLAnchorElement;
    link.href = observationHref(run, activitySearch);
    link.dataset.routerLink = 'true';
    if (run.runId) link.dataset.runId = run.runId;
    const top = node('span', 'pr-run-top');
    top.append(node('span', attentionClass(run.attention), run.attention), node('code', undefined, shortSha(run.headSha)));
    link.append(top, node('strong', undefined, evidenceLabel(run.evidenceSummary)), node('time', undefined, `${relativeTime(run.evaluatedAt)} ago`));
    if (run.observationSource === 'BACKFILL') link.append(node('span', 'pr-run-latest', 'Backfilled'));
    else if (index === 0) link.append(node('span', 'pr-run-latest', 'Latest'));
    const favorite = favoriteButton(favorites, evaluationTarget(run), `evaluation ${shortSha(run.headSha)}`);
    favorite.classList.add('favorite-overlay');
    runShell.append(link, favorite);
    return runShell;
  };
  const rail = progressiveList({
    items: detail.runs,
    total: detail.runs.length,
    previewSize,
    identity: (run) => run.runId ?? `${run.repository.id}:${run.headSha}:${run.evaluatedAt}`,
    renderItem: renderRun,
    itemsClassName: 'pr-timeline',
    testId: 'pr-history-progressive-list',
    itemLabel: 'evaluations',
  });
  rail.querySelector('.progressive-list-items')?.setAttribute('role', 'list');
  section.append(rail);

  if (detail.notableTransitions.length) {
    const transitions = node('div', 'pr-transition-list');
    transitions.append(node('span', 'pr-section-kicker', 'Notable transitions'));
    for (const item of [...detail.notableTransitions].reverse().slice(0, 8)) {
      const row = node('article', `pr-transition pr-transition-${item.severity.toLowerCase()}`);
      row.dataset.testid = 'notable-transition';
      const heading = node('div', 'pr-transition-heading');
      heading.append(
        node('strong', undefined, notableTransitionTitle(item)),
        node('span', undefined, `${shortSha(item.delta.toHeadSha)} · ${relativeTime(item.occurredAt)} ago`),
      );
      row.append(heading);
      const causes = notableTransitionCauses(item);
      if (causes.length) {
        const list = node('ul', 'pr-transition-causes');
        for (const cause of causes) list.append(node('li', undefined, cause));
        row.append(list);
      }
      if (item.severity === 'MATERIAL') {
        row.append(feedbackControls(item, detail.feedback?.find(feedback => feedback.transitionId === item.id), saveFeedback));
      }
      transitions.append(row);
    }
    section.append(transitions);
  }
  return section;
}

export function renderPullRequest(
  viewer: ViewerV1,
  detail: PullRequestTrajectoryV1,
  activitySearch: string,
  favorites: FavoriteStore,
  saveFeedback: SaveTransitionFeedback,
  previewSize: PreviewSize = DEFAULT_PREVIEW_SIZE,
): HTMLElement {
  const { root, main } = shell(viewer);
  main.dataset.testid = 'pull-request-detail';
  const back = node('a', 'back-link', '← Activity') as HTMLAnchorElement;
  back.href = activityRouteHref(activitySearch);
  back.dataset.routerLink = 'true';
  main.append(back);

  const header = node('header', 'pr-header');
  const headerCopy = node('div');
  headerCopy.append(node('p', 'pr-repo', `${detail.repository.owner}/${detail.repository.name} · PR #${detail.pullRequest.number}`), node('h1', undefined, detail.pullRequest.title));
  header.append(
    headerCopy,
    favoriteButton(
      favorites,
      { kind: 'pull-request', repositoryId: detail.repository.id, pullRequestNumber: detail.pullRequest.number },
      `pull request #${detail.pullRequest.number}`,
    ),
  );
  const terminal = lifecycleTerminal(detail);
  main.append(header, currentSection(detail, activitySearch));
  if (terminal) main.append(terminal);
  main.append(historySection(detail), insightsSection(detail), evidenceIssuesSection(detail), timelineSection(detail, activitySearch, favorites, saveFeedback, previewSize));
  return root;
}

function transitionForRun(detail: PullRequestDetailV1, headSha: string): PullRequestTransitionV1[] {
  return detail.transitions.filter(item => item.toHeadSha === headSha);
}

export interface EvaluationObservationIdentity {
  headSha: string;
  runId?: string;
}

export function enhanceEvaluationWithPullRequestContext(
  root: HTMLElement,
  detail: PullRequestDetailV1,
  identity: EvaluationObservationIdentity,
  activitySearch: string,
): void {
  const main = root.querySelector<HTMLElement>('main[data-testid="evaluation-detail"]');
  if (!main) return;

  // R7.4: the back-link slot is reserved by the base view (correct PR target) before
  // this async enhancement runs, so we only append the PR-context section — no flip.
  const index = identity.runId
    ? detail.runs.findIndex(run => run.runId === identity.runId)
    : detail.runs.findIndex(run => run.headSha === identity.headSha);
  if (index < 0) return;
  const current = detail.runs[index];
  const previous = detail.runs[index + 1];
  const next = index > 0 ? detail.runs[index - 1] : undefined;
  const context = node('section', 'evaluation-pr-context');
  const position = node('div', 'evaluation-pr-position');
  position.append(node('strong', undefined, `Evaluation ${detail.runs.length - index} of ${detail.history.totalRuns}`), node('span', undefined, `Head ${shortSha(current.headSha)}`));
  const nav = node('div', 'evaluation-run-nav');
  if (previous) {
    const link = node('a', 'secondary-link', '← Previous') as HTMLAnchorElement;
    link.href = observationHref(previous, activitySearch);
    link.dataset.routerLink = 'true';
    nav.append(link);
  }
  if (next) {
    const link = node('a', 'secondary-link', 'Next →') as HTMLAnchorElement;
    link.href = observationHref(next, activitySearch);
    link.dataset.routerLink = 'true';
    nav.append(link);
  }
  position.append(nav);
  context.append(position);

  const sameShaCount = detail.runs.filter(run => run.headSha === current.headSha).length;
  const changes = identity.runId && sameShaCount > 1 ? [] : transitionForRun(detail, current.headSha);
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
