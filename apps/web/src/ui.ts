import type {
  ActivityResponseV1,
  AttentionFilterV1,
  EvaluationDetailResponseV1,
  EvaluationDetailV1,
  EvaluationSummaryV1,
  ViewerV1
} from '@spark/dashboard-contracts';
import type { ActivityUrlState } from './state';
import { changeLabel, evidenceLabel, relativeTime, shortSha, trustedGitHubUrl } from './format';
import { serializeActivityState } from './state';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text: string, onClick: () => void, options: { active?: boolean; testId?: string } = {}): HTMLButtonElement {
  const element = node('button', `filter-button${options.active ? ' is-active' : ''}`, text);
  element.type = 'button';
  element.setAttribute('aria-pressed', options.active ? 'true' : 'false');
  if (options.testId) element.dataset.testid = options.testId;
  element.addEventListener('click', onClick);
  return element;
}

function safeExternalLink(label: string, value: string, className = 'external-link'): HTMLAnchorElement | HTMLSpanElement {
  const url = trustedGitHubUrl(value);
  if (!url) return node('span', 'external-link is-disabled', `${label} unavailable`);
  const anchor = node('a', className, label);
  anchor.href = url.toString();
  anchor.target = '_blank';
  anchor.rel = 'noreferrer noopener';
  return anchor;
}

function shell(viewer?: ViewerV1): { root: HTMLElement; main: HTMLElement } {
  const root = node('div', 'app-shell');
  const header = node('header', 'topbar');
  const brand = node('a', 'brand', 'Spark');
  brand.href = '/app';
  brand.dataset.routerLink = 'true';
  header.append(brand);

  if (viewer) {
    const identity = node('div', 'viewer');
    const avatar = node('img', 'viewer-avatar') as HTMLImageElement;
    avatar.src = viewer.avatarUrl;
    avatar.alt = '';
    avatar.width = 24;
    avatar.height = 24;
    identity.append(avatar, node('span', 'viewer-login', viewer.login));
    header.append(identity);
  }

  const main = node('main', 'main-column');
  root.append(header, main);
  return { root, main };
}

export function renderSignedOut(): HTMLElement {
  const { root, main } = shell();
  main.classList.add('centered-state');
  const section = node('section', 'signed-out');
  section.dataset.testid = 'signed-out';
  section.append(
    node('p', 'eyebrow', 'SPARK OBSERVABILITY'),
    node('h1', undefined, 'Software changes, in context.'),
    node('p', 'state-copy', 'See recent Spark evaluations across your repositories and return to GitHub when a change needs attention.')
  );
  const signIn = node('button', 'primary-button', 'Sign in with GitHub');
  signIn.type = 'button';
  signIn.dataset.testid = 'sign-in';
  signIn.addEventListener('click', () => undefined);
  section.append(signIn, node('p', 'phase-note', 'Phase 1 uses synthetic signed-in fixtures. OAuth is intentionally not implemented.'));
  main.append(section);
  return root;
}

export function renderLoading(viewer?: ViewerV1): HTMLElement {
  const { root, main } = shell(viewer);
  const titleRow = node('div', 'page-heading');
  titleRow.append(node('div', undefined, 'Activity'));
  main.append(titleRow);
  const loading = node('div', 'loading-list');
  loading.dataset.testid = 'loading';
  for (let index = 0; index < 5; index += 1) {
    const row = node('div', 'loading-row');
    row.append(node('div', 'skeleton skeleton-attention'), node('div', 'skeleton skeleton-main'), node('div', 'skeleton skeleton-meta'));
    loading.append(row);
  }
  main.append(loading);
  return root;
}

export function renderError(viewer: ViewerV1 | undefined, retry: () => void): HTMLElement {
  const { root, main } = shell(viewer);
  main.classList.add('centered-state');
  const state = node('section', 'status-state');
  state.dataset.testid = 'api-error';
  state.append(node('h1', undefined, 'Spark activity could not be loaded.'), node('p', 'state-copy', 'The dashboard could not read its activity source. GitHub checks and PR comments are unaffected.'));
  const retryButton = node('button', 'secondary-button', 'Retry');
  retryButton.type = 'button';
  retryButton.addEventListener('click', retry);
  state.append(retryButton);
  main.append(state);
  return root;
}

function attentionClass(attention: string): string {
  return `attention attention-${attention.toLowerCase()}`;
}

function activityHref(summary: EvaluationSummaryV1, state: ActivityUrlState): string {
  const search = serializeActivityState(state);
  return `/app/evaluations/${summary.repository.id}/${summary.headSha}${search ? `?${search}` : ''}`;
}

function evaluationRow(summary: EvaluationSummaryV1, state: ActivityUrlState): HTMLAnchorElement {
  const row = node('a', 'evaluation-row') as HTMLAnchorElement;
  row.href = activityHref(summary, state);
  row.dataset.routerLink = 'true';
  row.dataset.testid = `evaluation-${summary.repository.id}-${shortSha(summary.headSha)}`;
  row.setAttribute('aria-label', `${summary.attention}: ${summary.pullRequest.title}, ${summary.repository.name} pull request ${summary.pullRequest.number}`);

  const level = node('span', attentionClass(summary.attention), summary.attention);
  const body = node('span', 'evaluation-body');
  body.append(node('strong', 'evaluation-title', summary.pullRequest.title));

  const compact = node('span', 'evaluation-compact');
  const contextParts = [summary.repository.name, `#${summary.pullRequest.number}`, changeLabel(summary.changeSummary.files, summary.changeSummary.additions, summary.changeSummary.deletions)];
  compact.append(node('span', undefined, contextParts.join(' · ')));

  const signal = summary.sensitiveSurfaces[0] ?? evidenceLabel(summary.evidenceSummary);
  compact.append(node('span', 'evaluation-signal', signal));
  body.append(compact);

  const time = node('time', 'evaluation-time', relativeTime(summary.evaluatedAt));
  time.dateTime = summary.evaluatedAt;
  row.append(level, body, time);
  return row;
}

export interface ActivityHandlers {
  setWindow(value: ActivityUrlState['window']): void;
  setAttention(value: AttentionFilterV1): void;
  setRepository(value: number | null): void;
  showAllAttention(): void;
}

export function renderActivity(viewer: ViewerV1, response: ActivityResponseV1, state: ActivityUrlState, handlers: ActivityHandlers): HTMLElement {
  const { root, main } = shell(viewer);
  main.dataset.testid = 'activity-view';

  const heading = node('div', 'activity-heading');
  heading.append(node('div', 'heading-copy', 'Activity'));
  const windows = node('div', 'filter-group window-group');
  for (const value of ['24h', '7d', '30d'] as const) {
    windows.append(button(value, () => handlers.setWindow(value), { active: state.window === value, testId: `window-${value}` }));
  }
  heading.append(windows);
  main.append(heading);

  const countTotal = response.counts.LOW + response.counts.MEDIUM + response.counts.HIGH;
  const attention = node('div', 'attention-filters');
  const choices: Array<[AttentionFilterV1, number]> = [
    ['ALL', countTotal],
    ['HIGH', response.counts.HIGH],
    ['MEDIUM', response.counts.MEDIUM],
    ['LOW', response.counts.LOW]
  ];
  for (const [value, count] of choices) {
    attention.append(button(`${value} ${count}`, () => handlers.setAttention(value), { active: state.attention === value, testId: `attention-${value}` }));
  }
  main.append(attention);

  const repositoryField = node('label', 'repository-filter');
  repositoryField.append(node('span', 'filter-label', 'Repository'));
  const select = node('select', 'repository-select') as HTMLSelectElement;
  select.dataset.testid = 'repository-select';
  const all = node('option', undefined, 'All observed repositories') as HTMLOptionElement;
  all.value = '';
  select.append(all);
  for (const repository of response.repositories) {
    const option = node('option', undefined, `${repository.owner}/${repository.name} (${repository.evaluationCount})`) as HTMLOptionElement;
    option.value = String(repository.id);
    option.selected = state.repositoryId === repository.id;
    select.append(option);
  }
  select.addEventListener('change', () => handlers.setRepository(select.value ? Number(select.value) : null));
  repositoryField.append(select);
  main.append(repositoryField);

  const section = node('section', 'activity-section');
  section.append(node('div', 'section-label', 'Recent evaluations'));

  if (response.evaluations.length === 0) {
    const empty = node('div', 'empty-state');
    empty.dataset.testid = 'empty-result';
    if (response.repositories.length === 0) {
      empty.append(node('h2', undefined, "Spark hasn't observed any evaluations yet."), node('p', 'state-copy', 'Evaluations will appear here after Spark observes pull requests.'));
    } else {
      empty.append(node('h2', undefined, `No ${state.attention === 'ALL' ? '' : `${state.attention} `}evaluations in this view.`), node('p', 'state-copy', 'Try a broader time window, another repository, or all attention levels.'));
      if (state.attention !== 'ALL') {
        const reset = node('button', 'secondary-button', 'Show all attention');
        reset.type = 'button';
        reset.addEventListener('click', handlers.showAllAttention);
        empty.append(reset);
      }
    }
    section.append(empty);
  } else {
    const list = node('div', 'evaluation-list');
    for (const summary of response.evaluations) list.append(evaluationRow(summary, state));
    section.append(list);
  }
  main.append(section);
  return root;
}

function detailSection(title: string, values: string[], emptyLabel = 'None observed'): HTMLElement {
  const section = node('section', 'detail-section');
  section.append(node('h2', undefined, title));
  if (!values.length) {
    section.append(node('p', 'muted', emptyLabel));
    return section;
  }
  const list = node('ul', 'detail-list');
  for (const value of values) list.append(node('li', undefined, value));
  section.append(list);
  return section;
}

function availableDetail(detail: EvaluationDetailV1, activitySearch: string): HTMLElement {
  const fragment = node('div', 'detail-content');
  const back = node('a', 'back-link', '← Activity');
  back.href = `/app${activitySearch ? `?${activitySearch}` : ''}`;
  back.dataset.routerLink = 'true';
  fragment.append(back);

  const header = node('header', 'detail-header');
  header.append(node('span', attentionClass(detail.attention), detail.attention));
  const identity = node('div', 'detail-identity');
  identity.append(node('p', 'detail-repo', `${detail.repository.owner}/${detail.repository.name} · PR #${detail.pullRequest.number}`), node('h1', undefined, detail.pullRequest.title));
  header.append(identity);
  fragment.append(header);

  fragment.append(detailSection('Why', detail.reasons));

  const change = node('section', 'detail-section');
  change.append(node('h2', undefined, 'Change'), node('p', 'change-summary', changeLabel(detail.changeSummary.files, detail.changeSummary.additions, detail.changeSummary.deletions)));
  if (detail.changeSummary.extensions.length) change.append(node('p', 'muted', detail.changeSummary.extensions.map((item) => `${item.extension || 'no extension'} ×${item.count}`).join(' · ')));
  const files = node('div', 'file-list');
  for (const file of detail.changedFiles.slice(0, 8)) {
    const line = node('div', 'file-row');
    line.append(node('code', undefined, file.path), node('span', 'muted', file.additions !== undefined && file.deletions !== undefined ? `+${file.additions}/-${file.deletions}` : file.status));
    files.append(line);
  }
  change.append(files);
  fragment.append(change);

  fragment.append(detailSection('Directly changed', detail.directAreas), detailSection('Potentially affected', detail.affectedAreas, 'None known'));

  const evidence = node('section', 'detail-section');
  evidence.append(node('h2', undefined, 'Evidence'));
  const evidenceList = node('div', 'evidence-list');
  for (const item of detail.evidence) {
    const row = node('div', 'evidence-row');
    row.append(node('span', `evidence-status evidence-${item.status.toLowerCase()}`, item.status), node('span', 'evidence-name', item.name));
    const coverage = item.coverage === 'UNKNOWN' ? 'coverage unknown' : item.coverage.join(', ');
    row.append(node('span', 'muted', coverage));
    evidenceList.append(row);
  }
  evidence.append(evidenceList);
  fragment.append(evidence);

  fragment.append(detailSection('Sensitive surfaces', detail.sensitiveSurfaces, 'None'));

  const context = node('section', 'detail-section');
  context.append(node('h2', undefined, 'Repository context'));
  context.append(node('p', 'profile-state', `Profile: ${detail.profile.state.toLowerCase()}`));
  for (const area of detail.profile.matchedAreas) {
    const row = node('div', 'profile-area');
    row.append(node('strong', undefined, area.id));
    const meta = [area.criticality ? `criticality: ${area.criticality}` : null, area.owners.length ? `owners: ${area.owners.join(', ')}` : null, area.expectedEvidence.length ? `expected: ${area.expectedEvidence.join(', ')}` : null].filter(Boolean).join(' · ');
    if (meta) row.append(node('span', 'muted', meta));
    context.append(row);
  }
  fragment.append(context);

  if (detail.analysisNotes.length) fragment.append(detailSection('Analysis notes', detail.analysisNotes));

  const evaluated = node('section', 'detail-section detail-meta');
  evaluated.append(node('h2', undefined, 'Evaluated'));
  evaluated.append(node('p', undefined, `Head ${shortSha(detail.headSha)} · Base ${shortSha(detail.baseSha)} · ${relativeTime(detail.evaluatedAt)}`));
  evaluated.append(node('p', 'muted', `Evaluator ${detail.evaluatorVersion}${detail.profile.sourceSha ? ` · Profile ${shortSha(detail.profile.sourceSha)}` : ''}`));
  fragment.append(evaluated);

  const actions = node('div', 'detail-actions');
  actions.append(safeExternalLink('Open GitHub PR', detail.pullRequest.url, 'primary-link'), safeExternalLink('Open full Spark Check', detail.githubCheckUrl, 'secondary-link'));
  fragment.append(actions);
  return fragment;
}

export function renderEvaluation(viewer: ViewerV1, response: EvaluationDetailResponseV1, activitySearch: string): HTMLElement {
  const { root, main } = shell(viewer);
  main.dataset.testid = 'evaluation-detail';

  if (response.status === 'available') {
    main.append(availableDetail(response.detail, activitySearch));
    return root;
  }

  const back = node('a', 'back-link', '← Activity');
  back.href = `/app${activitySearch ? `?${activitySearch}` : ''}`;
  back.dataset.routerLink = 'true';
  const unavailable = node('section', 'status-state unavailable-state');
  unavailable.dataset.testid = 'detail-unavailable';
  unavailable.append(node('span', attentionClass(response.summary.attention), response.summary.attention), node('h1', undefined, 'Historical detail unavailable'), node('p', 'state-copy', "This evaluation predates Spark's detailed dashboard history. Attention and PR identity were retained, but the full normalized evaluation was not stored."), node('p', 'muted', `${response.summary.repository.owner}/${response.summary.repository.name} · PR #${response.summary.pullRequest.number} · ${shortSha(response.summary.headSha)}`), safeExternalLink('Open GitHub PR', response.summary.pullRequest.url, 'primary-link'));
  main.append(back, unavailable);
  return root;
}

export function renderNotFound(viewer?: ViewerV1): HTMLElement {
  const { root, main } = shell(viewer);
  main.classList.add('centered-state');
  const state = node('section', 'status-state');
  state.append(node('h1', undefined, 'Dashboard route not found.'), node('p', 'state-copy', 'Return to Spark activity to continue.'));
  const link = node('a', 'primary-link', 'Open activity');
  link.href = '/app';
  link.dataset.routerLink = 'true';
  state.append(link);
  main.append(state);
  return root;
}
