import type {
  ActivityResponseV1,
  AttentionFilterV1,
  EvaluationDetailResponseV1,
  EvaluationDetailV1,
  EvaluationSummaryV1,
  PullRequestActivityV1,
  PullRequestHistoryResponseV1,
  ViewerV1
} from '@spark/dashboard-contracts';
import type { ActivityUrlState } from './state';
import { FavoriteStore, type FavoriteTarget } from './favorites';
import { changeLabel, evidenceLabel, relativeTime, shortSha, trustedGitHubUrl } from './format';
import { serializeActivityState } from './state';
import { DEFAULT_PREVIEW_SIZE, progressiveList, type PreviewSize } from './progressive-list';
import { pullRequestHref } from './route-links';

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

export function evaluationTarget(summary: Pick<EvaluationSummaryV1, 'repository' | 'pullRequest' | 'runId' | 'headSha'>): FavoriteTarget {
  return {
    kind: 'evaluation',
    repositoryId: summary.repository.id,
    pullRequestNumber: summary.pullRequest.number,
    runId: summary.runId,
    headSha: summary.headSha,
  };
}

export function favoriteButton(
  favorites: FavoriteStore,
  target: FavoriteTarget,
  label: string,
  onChange: () => void = () => undefined,
): HTMLButtonElement {
  const element = node('button', 'favorite-button') as HTMLButtonElement;
  element.type = 'button';
  const sync = (active: boolean) => {
    element.classList.toggle('is-favorite', active);
    element.setAttribute('aria-pressed', active ? 'true' : 'false');
    element.setAttribute('aria-label', `${active ? 'Remove' : 'Favorite'} ${label}${active ? ' from favorites' : ''}`);
    element.title = active ? 'Remove from favorites' : 'Add to favorites';
    element.textContent = active ? '★' : '☆';
  };
  sync(favorites.isFavorite(target));
  element.addEventListener('click', async () => {
    element.disabled = true;
    try {
      sync(await favorites.toggle(target));
      onChange();
    } catch {
      element.title = 'Could not update favorite';
      element.classList.add('has-error');
    } finally {
      element.disabled = false;
    }
  });
  return element;
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
  const base = summary.runId
    ? `/app/repositories/${summary.repository.id}/runs/${encodeURIComponent(summary.runId)}`
    : `/app/evaluations/${summary.repository.id}/${summary.headSha}`;
  return `${base}${search ? `?${search}` : ''}`;
}

function historyMix(activity: PullRequestActivityV1): string {
  const { HIGH, MEDIUM, LOW } = activity.history.attentionCounts;
  const parts = [
    HIGH ? `${HIGH} high` : '',
    MEDIUM ? `${MEDIUM} medium` : '',
    LOW ? `${LOW} low` : ''
  ].filter(Boolean);
  return parts.join(' · ');
}

function historyRunState(summary: EvaluationSummaryV1): 'failed' | 'pending' | 'clear' | 'unknown' {
  if (summary.evidenceSummary.failed > 0) return 'failed';
  if (summary.evidenceSummary.pending > 0 || summary.evidenceSummary.missing > 0) return 'pending';
  if (summary.evidenceSummary.unknown > 0 && summary.evidenceSummary.passed === 0) return 'unknown';
  return 'clear';
}

function sameObservation(run: EvaluationSummaryV1, latest: EvaluationSummaryV1): boolean {
  return latest.runId ? run.runId === latest.runId : run.headSha === latest.headSha;
}

function renderHistoryPanel(
  history: PullRequestHistoryResponseV1,
  latest: EvaluationSummaryV1,
  state: ActivityUrlState,
  favorites: FavoriteStore,
  previewSize: PreviewSize,
): HTMLElement {
  const panel = node('div', 'pr-history-panel');
  panel.dataset.testid = `history-${history.repository.id}-${history.pullRequest.number}`;

  const failed = history.runs.filter((run) => historyRunState(run) === 'failed').length;
  const pending = history.runs.filter((run) => historyRunState(run) === 'pending').length;
  const clear = history.runs.filter((run) => historyRunState(run) === 'clear').length;
  const provenance = history.historyCompleteness === 'PARTIAL_BACKFILL' ? ' · includes reconstructed history' : '';
  const summary = node('div', 'pr-history-summary');
  summary.append(
    node('strong', undefined, `${history.totalRunCount} run${history.totalRunCount === 1 ? '' : 's'}`),
    node('span', undefined, `${clear} clear · ${failed} failed evidence · ${pending} pending/missing${history.truncated ? ' · showing latest 100' : ''}${provenance}`)
  );
  panel.append(summary);

  const renderRun = (run: EvaluationSummaryV1): HTMLElement => {
    const isLatest = sameObservation(run, latest);
    const shell = node('div', 'history-card-shell');
    shell.setAttribute('role', 'listitem');
    shell.tabIndex = -1;
    const card = node('a', `history-card${isLatest ? ' is-latest' : ''}`) as HTMLAnchorElement;
    card.href = activityHref(run, state);
    card.dataset.routerLink = 'true';
    if (run.runId) card.dataset.runId = run.runId;
    card.setAttribute('aria-label', `${isLatest ? 'Latest, ' : ''}${run.attention}, ${shortSha(run.headSha)}, ${evidenceLabel(run.evidenceSummary)}`);
    const top = node('span', 'history-card-top');
    top.append(node('span', attentionClass(run.attention), run.attention), node('code', undefined, shortSha(run.headSha)));
    card.append(top, node('strong', 'history-evidence', evidenceLabel(run.evidenceSummary)), node('time', 'history-time', relativeTime(run.evaluatedAt)));
    if (run.observationSource === 'BACKFILL') card.append(node('span', 'history-latest-label', 'Backfilled'));
    else if (isLatest) card.append(node('span', 'history-latest-label', 'Latest'));
    const favorite = favoriteButton(favorites, evaluationTarget(run), `evaluation ${shortSha(run.headSha)}`);
    favorite.classList.add('favorite-overlay');
    shell.append(card, favorite);
    return shell;
  };
  const rail = progressiveList({
    items: history.runs,
    total: history.runs.length,
    previewSize,
    identity: (run) => run.runId ?? `${run.repository.id}:${run.headSha}:${run.evaluatedAt}`,
    renderItem: renderRun,
    itemsClassName: 'history-rail',
    itemLabel: 'evaluations',
  });
  rail.querySelector('.progressive-list-items')?.setAttribute('role', 'list');
  panel.append(rail);
  return panel;
}

function pullRequestRow(
  activity: PullRequestActivityV1,
  state: ActivityUrlState,
  loadHistory: (repositoryId: number, pullRequestNumber: number) => Promise<PullRequestHistoryResponseV1>,
  favorites: FavoriteStore,
  onFavoriteChange: () => void,
  previewSize: PreviewSize,
): HTMLElement {
  const latest = activity.latest;
  const wrapper = node('div', 'pull-request-activity');
  wrapper.dataset.testid = `pull-request-${latest.repository.id}-${latest.pullRequest.number}`;

  const row = node('div', 'evaluation-row');
  const level = node('span', attentionClass(latest.attention), latest.attention);

  const link = node('a', 'evaluation-main-link') as HTMLAnchorElement;
  const activitySearch = serializeActivityState(state);
  link.href = `/app/repositories/${latest.repository.id}/pulls/${latest.pullRequest.number}${activitySearch ? `?${activitySearch}` : ''}`;
  link.dataset.routerLink = 'true';
  link.dataset.testid = `evaluation-${latest.repository.id}-${shortSha(latest.headSha)}`;
  link.setAttribute('aria-label', `Open pull request ${latest.pullRequest.number}: ${latest.pullRequest.title}`);
  const body = node('span', 'evaluation-body');
  body.append(node('strong', 'evaluation-title', latest.pullRequest.title));
  const compact = node('span', 'evaluation-compact');
  compact.append(node('span', undefined, [
    latest.repository.name,
    `#${latest.pullRequest.number}`,
    changeLabel(latest.changeSummary.files, latest.changeSummary.additions, latest.changeSummary.deletions)
  ].join(' · ')));
  const signal = latest.sensitiveSurfaces[0] ?? evidenceLabel(latest.evidenceSummary);
  compact.append(node('span', 'evaluation-signal', signal));
  body.append(compact);
  if (activity.history.runCount > 1) body.append(node('span', 'evaluation-history-mix', historyMix(activity)));
  link.append(body);

  const meta = node('div', 'evaluation-meta');
  const time = node('time', 'evaluation-time', relativeTime(latest.evaluatedAt));
  time.dateTime = latest.evaluatedAt;
  const historyButton = node('button', 'history-toggle', String(activity.history.runCount)) as HTMLButtonElement;
  historyButton.type = 'button';
  historyButton.classList.toggle('is-singular', activity.history.runCount === 1);
  historyButton.dataset.testid = `history-toggle-${latest.repository.id}-${latest.pullRequest.number}`;
  historyButton.setAttribute('aria-expanded', 'false');
  historyButton.setAttribute('aria-label', `Show ${activity.history.runCount} evaluations for pull request ${latest.pullRequest.number}`);
  const actions = node('div', 'evaluation-row-actions');
  actions.append(
    favoriteButton(
      favorites,
      { kind: 'pull-request', repositoryId: latest.repository.id, pullRequestNumber: latest.pullRequest.number },
      `pull request #${latest.pullRequest.number}`,
      onFavoriteChange,
    ),
    historyButton,
  );
  meta.append(time, actions);
  row.append(level, link, meta);
  wrapper.append(row);

  let panel: HTMLElement | undefined;
  let loading = false;
  historyButton.addEventListener('click', async () => {
    if (panel) {
      const opening = panel.hidden;
      panel.hidden = !opening;
      historyButton.setAttribute('aria-expanded', opening ? 'true' : 'false');
      return;
    }
    if (loading) return;
    loading = true;
    historyButton.disabled = true;
    const original = historyButton.textContent;
    historyButton.textContent = '…';
    try {
      const history = await loadHistory(latest.repository.id, latest.pullRequest.number);
      const newest = history.runs[0] ?? latest;
      panel = renderHistoryPanel(history, newest, state, favorites, previewSize);
      wrapper.append(panel);
      historyButton.setAttribute('aria-expanded', 'true');
    } catch {
      panel = node('div', 'pr-history-panel history-error', 'Evaluation history could not be loaded.');
      wrapper.append(panel);
      historyButton.setAttribute('aria-expanded', 'true');
    } finally {
      historyButton.textContent = original;
      historyButton.disabled = false;
      loading = false;
    }
  });

  return wrapper;
}

export interface ActivityHandlers {
  setWindow(value: ActivityUrlState['window']): void;
  setAttention(value: AttentionFilterV1): void;
  setRepository(value: number | null): void;
  showAllAttention(): void;
  setClientFilters(query: string, favoritesOnly: boolean): void;
  loadMore(cursor: string): Promise<ActivityResponseV1>;
  loadHistory(repositoryId: number, pullRequestNumber: number): Promise<PullRequestHistoryResponseV1>;
  favorites: FavoriteStore;
  previewSize?: PreviewSize;
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
    const option = node('option', undefined, `${repository.owner}/${repository.name} (${repository.pullRequestCount})`) as HTMLOptionElement;
    option.value = String(repository.id);
    option.selected = state.repositoryId === repository.id;
    select.append(option);
  }
  select.addEventListener('change', () => handlers.setRepository(select.value ? Number(select.value) : null));
  repositoryField.append(select);
  main.append(repositoryField);

  let query = state.query ?? '';
  let favoritesOnly = state.favoritesOnly ?? false;
  const previewSize = handlers.previewSize ?? DEFAULT_PREVIEW_SIZE;
  const clientFilters = node('div', 'client-filters');
  const searchField = node('label', 'search-filter');
  searchField.append(node('span', 'filter-label', 'Search'));
  const search = node('input', 'search-input') as HTMLInputElement;
  search.type = 'search';
  search.placeholder = 'Title, repository, PR, SHA, reason…';
  search.value = query;
  search.dataset.testid = 'activity-search';
  searchField.append(search);
  const favoriteFilter = button('★ Favorites', () => {
    favoritesOnly = !favoritesOnly;
    favoriteFilter.classList.toggle('is-active', favoritesOnly);
    favoriteFilter.setAttribute('aria-pressed', favoritesOnly ? 'true' : 'false');
    handlers.setClientFilters(query, favoritesOnly);
  }, { active: favoritesOnly, testId: 'favorites-only' });
  favoriteFilter.classList.add('favorites-filter');
  clientFilters.append(searchField, favoriteFilter);
  main.append(clientFilters);

  const section = node('section', 'activity-section');
  const sectionLabel = node('div', 'section-label');
  const results = node('div', 'activity-results');
  section.append(sectionLabel, results);
  main.append(section);

  function paintRows(): void {
    const total = response.total ?? response.pullRequests.length;
    sectionLabel.textContent = `Recent pull requests · ${total}`;
    results.replaceChildren();

    if (response.pullRequests.length > 0) {
      const rowState: ActivityUrlState = { ...state, query: query.trim() || undefined, favoritesOnly };
      const list = progressiveList({
        items: response.pullRequests,
        total,
        nextCursor: response.pagination.nextCursor,
        previewSize,
        identity: (activity) => `${activity.repository.id}:${activity.pullRequest.number}`,
        renderItem: (activity) => pullRequestRow(
          activity,
          rowState,
          handlers.loadHistory,
          handlers.favorites,
          () => { if (favoritesOnly) handlers.setClientFilters(query, favoritesOnly); },
          previewSize,
        ),
        loadMore: async (cursor) => {
          const page = await handlers.loadMore(cursor);
          return {
            items: page.pullRequests,
            nextCursor: page.pagination.nextCursor,
            total: page.total ?? total,
          };
        },
        className: 'evaluation-list',
        testId: 'activity-progressive-list',
        itemLabel: 'pull requests',
      });
      results.append(list);
      return;
    }

    const empty = node('div', 'empty-state');
    empty.dataset.testid = 'empty-result';
    if (query || favoritesOnly) {
      empty.append(
        node('h2', undefined, 'No pull requests match these filters.'),
        node('p', 'state-copy', favoritesOnly ? 'Try clearing search or showing all pull requests. Favorited evaluations also keep their pull request in this view.' : 'Try a different title, repository, PR number, SHA, or reason.'),
      );
      const reset = node('button', 'secondary-button', 'Clear search and favorites filter');
      reset.type = 'button';
      reset.addEventListener('click', () => {
        query = '';
        favoritesOnly = false;
        search.value = '';
        favoriteFilter.classList.remove('is-active');
        favoriteFilter.setAttribute('aria-pressed', 'false');
        handlers.setClientFilters(query, favoritesOnly);
      });
      empty.append(reset);
    } else if (response.repositories.length === 0) {
      empty.append(node('h2', undefined, "Spark hasn't observed any pull requests yet."), node('p', 'state-copy', 'Pull requests will appear here after Spark evaluates them.'));
    } else {
      empty.append(node('h2', undefined, `No ${state.attention === 'ALL' ? '' : `${state.attention} `}pull requests in this view.`), node('p', 'state-copy', 'Try a broader time window, another repository, or all attention levels.'));
      if (state.attention !== 'ALL') {
        const reset = node('button', 'secondary-button', 'Show all attention');
        reset.type = 'button';
        reset.addEventListener('click', handlers.showAllAttention);
        empty.append(reset);
      }
    }
    results.append(empty);
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener('input', () => {
    query = search.value.slice(0, 100);
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => handlers.setClientFilters(query, favoritesOnly), 250);
  });
  paintRows();
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

function availableDetail(detail: EvaluationDetailV1, activitySearch: string, favorites: FavoriteStore): HTMLElement {
  const fragment = node('div', 'detail-content');
  // R7.4: reserve the back-link slot in the base view (run/evaluation detail is
  // PR-backed) so the async PR-context enhancement never flips the label/href.
  const back = node('a', 'back-link', `← PR #${detail.pullRequest.number}`) as HTMLAnchorElement;
  back.href = pullRequestHref(detail.repository.id, detail.pullRequest.number, activitySearch);
  back.dataset.routerLink = 'true';
  fragment.append(back);

  const header = node('header', 'detail-header');
  header.append(node('span', attentionClass(detail.attention), detail.attention));
  const identity = node('div', 'detail-identity');
  identity.append(node('p', 'detail-repo', `${detail.repository.owner}/${detail.repository.name} · PR #${detail.pullRequest.number}`), node('h1', undefined, detail.pullRequest.title));
  header.append(identity, favoriteButton(favorites, evaluationTarget(detail), `evaluation ${shortSha(detail.headSha)}`));
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
  if (detail.observationSource === 'BACKFILL') evaluated.append(node('p', 'muted', 'Historical observation reconstructed from Spark\'s previously retained latest-per-SHA record.'));
  fragment.append(evaluated);

  const actions = node('div', 'detail-actions');
  actions.append(safeExternalLink('Open GitHub PR', detail.pullRequest.url, 'primary-link'), safeExternalLink('Open full Spark Check', detail.githubCheckUrl, 'secondary-link'));
  fragment.append(actions);
  return fragment;
}

export function renderEvaluation(viewer: ViewerV1, response: EvaluationDetailResponseV1, activitySearch: string, favorites: FavoriteStore): HTMLElement {
  const { root, main } = shell(viewer);
  main.dataset.testid = 'evaluation-detail';

  if (response.status === 'available') {
    main.append(availableDetail(response.detail, activitySearch, favorites));
    return root;
  }

  // R7.4: reserve the back-link slot (PR target) so the async PR-context enhancement
  // never flips the label/href on the unavailable detail state.
  const back = node('a', 'back-link', `← PR #${response.summary.pullRequest.number}`) as HTMLAnchorElement;
  back.href = pullRequestHref(response.summary.repository.id, response.summary.pullRequest.number, activitySearch);
  back.dataset.routerLink = 'true';
  const unavailable = node('section', 'status-state unavailable-state');
  unavailable.dataset.testid = 'detail-unavailable';
  const sourceNote = response.summary.observationSource === 'BACKFILL'
    ? ' This record was reconstructed from Spark\'s previously retained latest-per-SHA history.'
    : '';
  const unavailableTop = node('div', 'unavailable-top');
  unavailableTop.append(
    node('span', attentionClass(response.summary.attention), response.summary.attention),
    favoriteButton(favorites, evaluationTarget(response.summary), `evaluation ${shortSha(response.summary.headSha)}`),
  );
  unavailable.append(unavailableTop, node('h1', undefined, 'Historical detail unavailable'), node('p', 'state-copy', `This evaluation predates Spark's detailed dashboard history. Attention and PR identity were retained, but the full normalized evaluation was not stored.${sourceNote}`), node('p', 'muted', `${response.summary.repository.owner}/${response.summary.repository.name} · PR #${response.summary.pullRequest.number} · ${shortSha(response.summary.headSha)}`), safeExternalLink('Open GitHub PR', response.summary.pullRequest.url, 'primary-link'));
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
