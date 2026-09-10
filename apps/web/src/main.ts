import './styles.css';
import './shell.css';
import './home.css';
import './dashboard.css';
import './overview.css';
import './account.css';
import './pr.css';
import './behavior.css';
import './progressive-list.css';
import './settings.css';
import type { AccountV1, ActivityResponseV1, PreviewSize, ViewerV1 } from '@spark/dashboard-contracts';
import { renderAccountPage } from './account-ui';
import { createDashboardApi, UnauthorizedError, type LoadedDashboardSettings } from './api';
import { createPersistentAppShell } from './app-shell';
import { getBehaviorPatterns, getChangeBehavior } from './behavior-api';
import { enhanceOverviewWithBehaviorPatterns, enhancePullRequestWithBehavior } from './behavior-ui';
import { enhancePullRequestWithSeverityTimeline } from './context-insight-enhancers';
import { DashboardInsightsError, getDashboardInsights, getDashboardRecentActivity, getOperationalDashboard } from './dashboard-api';
import {
  markDashboardMergedUnresolved,
  renderDashboardInsights,
  renderDashboardInsightsError,
  renderDashboardInsightsLoading,
  renderDashboardRecentActivity,
  renderDashboardRecentActivityError,
  renderOperationalDashboard,
} from './dashboard-ui';
import { FavoriteStore } from './favorites';
import { getNotableTransitionInsights, getOverviewDrilldown } from './overview-api';
import { defaultDashboardSettings, resolvePreferences, SETTINGS_FALLBACK_WARNING } from './preferences';
import { renderOverviewDrilldown } from './overview-ui';
import { enhanceEvaluationWithPullRequestContext, renderPullRequest } from './pr-ui';
import { legacyActivityRedirect, navigate, parseRoute } from './router';
import { renderSettings } from './settings-ui';
import { serializeActivityState, withActivityState, type ActivityUrlState } from './state';
import { renderActivity, renderError, renderEvaluation, renderNotFound, renderSignedOut } from './ui';
import { QueryCache, type QueryPolicy } from './query-cache';

const mount = document.querySelector<HTMLElement>('#app')!;
if (!mount) throw new Error('Missing #app mount');

const api = createDashboardApi(window.location.search);
const queryCache = new QueryCache();
const shell = createPersistentAppShell();
mount.replaceChildren(shell.root);

let resolvedViewer: ViewerV1 | undefined;
let routeGeneration = 0;
let routeController: AbortController | undefined;
let backgroundRefreshQueued = false;

const CACHE_POLICIES = {
  account: { freshForMs: 5 * 60_000, maxAgeMs: 30 * 60_000 },
  settings: { freshForMs: 5 * 60_000, maxAgeMs: 30 * 60_000 },
  favorites: { freshForMs: 30_000, maxAgeMs: 5 * 60_000 },
  dashboard: { freshForMs: 30_000, maxAgeMs: 5 * 60_000 },
  activity: { freshForMs: 30_000, maxAgeMs: 5 * 60_000 },
  overview: { freshForMs: 60_000, maxAgeMs: 10 * 60_000 },
  transitions: { freshForMs: 60_000, maxAgeMs: 10 * 60_000 },
  behavior: { freshForMs: 60_000, maxAgeMs: 10 * 60_000 },
  history: { freshForMs: 30_000, maxAgeMs: 5 * 60_000 },
  trajectory: { freshForMs: 60_000, maxAgeMs: 15 * 60_000 },
  detail: { freshForMs: 5 * 60_000, maxAgeMs: 30 * 60_000 },
  immutableDetail: { freshForMs: 10 * 60_000, maxAgeMs: 60 * 60_000 },
} satisfies Record<string, QueryPolicy>;

function stableKey(value: unknown): string {
  return JSON.stringify(value);
}

function queueBackgroundRefresh(generation: number, signal: AbortSignal): void {
  if (backgroundRefreshQueued) return;
  backgroundRefreshQueued = true;
  queueMicrotask(() => {
    backgroundRefreshQueued = false;
    if (!isCurrent(generation, signal)) return;
    void render({ showLoading: false });
  });
}

type CachedRead<T> = { value: T; stale: boolean };

function cachedRead<T>(
  key: string,
  policy: QueryPolicy,
  signal: AbortSignal,
  generation: number,
  loader: () => Promise<T>,
): Promise<CachedRead<T>> {
  const snapshot = queryCache.read<T>(key, policy);
  if (snapshot.state === 'fresh' && snapshot.value !== undefined) {
    return Promise.resolve({ value: snapshot.value, stale: false });
  }
  if (snapshot.state === 'stale' && snapshot.value !== undefined) {
    const refresh = queryCache.revalidate(key, policy, loader);
    if (refresh) {
      void refresh.then(
        () => {
          if (isCurrent(generation, signal)) queueBackgroundRefresh(generation, signal);
        },
        (error: unknown) => {
          // A route may be superseded while a stale refresh is in flight. If a
          // newer render still owns this key, retry it with the newer signal
          // instead of leaving that render attached to an aborted promise.
          if (!isAbort(error) || !isCurrent(generation, signal)) return;
          queryCache.invalidate(key);
          void abortable(queryCache.load(key, policy, loader), signal).then(
            () => {
              if (isCurrent(generation, signal)) queueBackgroundRefresh(generation, signal);
            },
            () => undefined,
          );
        },
      );
    }
    return Promise.resolve({ value: snapshot.value, stale: true });
  }
  return abortable(queryCache.load(key, policy, loader), signal)
    .catch((error: unknown) => {
      if (!isAbort(error) || !isCurrent(generation, signal)) throw error;
      // If another route owned the shared in-flight promise, its abort must not
      // poison the current route's deduplicated read.
      queryCache.invalidate(key);
      return abortable(queryCache.load(key, policy, loader), signal);
    })
    .then((value) => ({ value, stale: false }));
}

function invalidateActivityDerivedQueries(): void {
  queryCache.invalidate((key) => key.startsWith('dashboard:')
    || key.startsWith('activity:')
    || key.startsWith('overview:')
    || key.startsWith('transitions:')
    || key.startsWith('behavior-patterns:'));
}

function cachedViewer(signal: AbortSignal, generation: number): Promise<ViewerV1> {
  return cachedAccount(signal, generation).then((account) => {
    resolvedViewer = account.viewer;
    shell.setViewer(account.viewer);
    return account.viewer;
  });
}

function cachedAccount(signal: AbortSignal, generation: number): Promise<AccountV1> {
  return cachedRead('account', CACHE_POLICIES.account, signal, generation, () => api.getAccount(signal)).then(({ value }) => {
    resolvedViewer = value.viewer;
    shell.setViewer(value.viewer);
    return value;
  });
}

function cachedFavorites(signal: AbortSignal, generation: number): Promise<FavoriteStore> {
  return cachedRead('favorites', CACHE_POLICIES.favorites, signal, generation, () => api.getFavorites(signal).then((savedFavorites) => new FavoriteStore(savedFavorites.favorites, {
    add: async (favorite) => {
      await api.addFavorite(favorite);
      invalidateActivityDerivedQueries();
    },
    remove: async (favorite) => {
      await api.removeFavorite(favorite);
      invalidateActivityDerivedQueries();
    },
  }))).then(({ value }) => value);
}

function cachedSettings(force: boolean, signal: AbortSignal, generation: number): Promise<LoadedDashboardSettings> {
  if (force) queryCache.invalidate('settings');
  return cachedRead('settings', CACHE_POLICIES.settings, signal, generation, () => api.getSettings(signal)).then(({ value }) => value);
}

function fallbackSettings(): LoadedDashboardSettings {
  return {
    settings: defaultDashboardSettings(),
    etag: '"settings-0"',
  };
}

function abortedError(): DOMException {
  return new DOMException('Route request superseded', 'AbortError');
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortedError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortedError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        if (signal.aborted) reject(abortedError());
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

// R7.1: single source of truth for "is this effect still bound to the current route?".
// A stale route (superseded by a newer render) or an aborted controller means the
// in-flight work must be dropped. Bundling the guard here keeps every effect callback
// (dashboard fillers, detail enhancers, error handlers) consistent.
function isCurrent(generation: number, signal: AbortSignal): boolean {
  return generation === routeGeneration && !signal.aborted;
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
}

function activateSettings(result: Settled<LoadedDashboardSettings>, showWarning: boolean): LoadedDashboardSettings {
  const loaded = result.ok ? result.value : fallbackSettings();
  shell.setDensity(loaded.settings.density);
  shell.setPreferenceWarning(!result.ok && showWarning ? SETTINGS_FALLBACK_WARNING : undefined);
  return loaded;
}

function activityView(
  viewer: ViewerV1,
  response: ActivityResponseV1,
  state: ActivityUrlState,
  favorites: FavoriteStore,
  routeBase: '/app' | '/app/activity',
  previewSize: PreviewSize,
  signal: AbortSignal,
  generation: number,
): HTMLElement {
  return renderActivity(viewer, response, state, {
    setWindow(value) {
      const next = withActivityState(state, { window: value });
      navigate(`${routeBase}?${serializeActivityState(next)}`);
    },
    setAttention(value) {
      const next = withActivityState(state, { attention: value });
      navigate(`${routeBase}?${serializeActivityState(next)}`);
    },
    setRepository(value) {
      const next = withActivityState(state, { repositorySelection: value == null ? { kind: 'all' } : { kind: 'repository', id: value } });
      navigate(`${routeBase}?${serializeActivityState(next)}`);
    },
    showAllAttention() {
      const next = withActivityState(state, { attention: 'ALL' });
      navigate(`${routeBase}?${serializeActivityState(next)}`);
    },
    setClientFilters(query, favoritesOnly) {
      const next = withActivityState(state, { query: query.trim() || undefined, favoritesOnly });
      const search = serializeActivityState(next);
      navigate(`${routeBase}${search ? `?${search}` : ''}`);
    },
    loadMore(cursor) {
      const query = {
        ...state,
        cursor,
        limit: previewSize,
        q: state.query,
        favoritesOnly: state.favoritesOnly,
      };
      return cachedRead(
        `activity:${stableKey(query)}`,
        CACHE_POLICIES.activity,
        signal,
        generation,
        () => api.getActivity(query, signal),
      ).then(({ value }) => value);
    },
    loadHistory(repositoryId, pullRequestNumber) {
      return cachedRead(
        `history:${repositoryId}:${pullRequestNumber}`,
        CACHE_POLICIES.history,
        signal,
        generation,
        () => api.getPullRequestHistory(repositoryId, pullRequestNumber, signal),
      ).then(({ value }) => value);
    },
    favorites,
    previewSize,
  });
}

function showSignedOut(): void {
  queryCache.clear();
  shell.setViewer(undefined);
  shell.setPreferenceWarning(undefined);
  shell.setDensity('COMFORTABLE');
  shell.show(renderSignedOut());
  const note = shell.outlet.querySelector<HTMLElement>('.phase-note');
  if (note) note.textContent = 'Sign in with GitHub to view Spark activity for repositories your account can access.';
  const button = shell.outlet.querySelector<HTMLButtonElement>('[data-testid="sign-in"]');
  button?.addEventListener('click', () => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/auth/github?return_to=${encodeURIComponent(returnTo)}`);
  });
}

async function render(options: { showLoading?: boolean } = {}): Promise<void> {
  const showLoading = options.showLoading ?? true;
  const generation = ++routeGeneration;
  routeController?.abort();
  const controller = new AbortController();
  routeController = controller;
  const { signal } = controller;

  const redirect = legacyActivityRedirect(window.location.pathname, window.location.search);
  if (redirect) window.history.replaceState(null, '', redirect);

  const route = parseRoute(window.location.pathname);
  shell.setRoute(route.kind);
  if (showLoading) shell.showLoading(route.kind);

  const viewerTask = cachedViewer(signal, generation);
  const accountTask = cachedAccount(signal, generation);
  const favoritesTask = () => cachedFavorites(signal, generation);
  const settingsTask = settle(cachedSettings(false, signal, generation));

  try {
    const settingsResult = await settingsTask;
    if (!isCurrent(generation, signal)) return;
    const loadedSettings = activateSettings(settingsResult, route.kind !== 'settings');
    const { settings: preferences, state } = resolvePreferences(window.location.search, loadedSettings.settings);

    if (route.kind === 'dashboard') {
      const dashboardTask = cachedRead(
        `dashboard:${stableKey({ state })}`,
        CACHE_POLICIES.dashboard,
        signal,
        generation,
        () => getOperationalDashboard(state, signal),
      ).then(({ value }) => value);

      const [viewer, account, dashboard] = await Promise.all([
        viewerTask,
        accountTask,
        dashboardTask,
      ]);
      if (!isCurrent(generation, signal)) return;

      shell.setViewer(viewer);
      const dashboardView = renderOperationalDashboard(account, dashboard, state, {
        // R4.1: patch-only via the shared withActivityState applier so the dashboard
        // mutates list state identically to the activity route. Changing the window or
        // repository no longer silently resets attention/query/favorites (parity).
        setWindow(value) {
          const next = withActivityState(state, { window: value });
          navigate(`/app?${serializeActivityState(next)}`);
        },
        setRepository(value) {
          const next = withActivityState(state, { repositorySelection: value == null ? { kind: 'all' } : { kind: 'repository', id: value } });
          navigate(`/app?${serializeActivityState(next)}`);
        },
      }, preferences.previewSize, preferences.collapseSecondarySections);
      shell.show(dashboardView.root);

      // R7.3: in the empty (no repositories / no history) states the dashboard renders
      // no recent/signals sections, so the recent/insights/merged filler requests are
      // skipped entirely (no wasted calls).
      if (dashboardView.recentContent === null || dashboardView.signalsContent === null) return;
      // R7.2: hand each filler its exact target node from the view handle instead of
      // re-querying the outlet by data-testid.
      const recentContent = dashboardView.recentContent;
      const recentCount = dashboardView.recentCount;
      const signalsContent = dashboardView.signalsContent;

      let insightsLoaded = false;
      let insightsLoading = false;
      const loadInsights = () => {
        if (insightsLoaded || insightsLoading || signal.aborted) return;
        insightsLoading = true;
        renderDashboardInsightsLoading(signalsContent);
        void cachedRead(
          `dashboard-insights:${stableKey({ state })}`,
          CACHE_POLICIES.overview,
          signal,
          generation,
          () => getDashboardInsights(state, signal),
        )
          .then((insights) => {
            if (!isCurrent(generation, signal)) return;
            insightsLoaded = true;
            renderDashboardInsights(signalsContent, dashboard, insights.value, state);
          })
          .catch((error: unknown) => {
            if (!isCurrent(generation, signal) || isAbort(error)) return;
            const source = error instanceof DashboardInsightsError ? error.source : 'evaluation trends';
            renderDashboardInsightsError(signalsContent, source, loadInsights);
          })
          .finally(() => {
            insightsLoading = false;
          });
      };
      loadInsights();

      const recentTask = settle(cachedRead(
        `activity:dashboard-recent:${stableKey({ state, limit: 5 })}`,
        CACHE_POLICIES.activity,
        signal,
        generation,
        () => getDashboardRecentActivity(api, state, signal),
      ).then(({ value }) => value));
      const mergeOverviewTask = settle(cachedRead(
        `overview:merged-unresolved:${stableKey({ state, cursor: null, limit: 15 })}`,
        CACHE_POLICIES.overview,
        signal,
        generation,
        () => getOverviewDrilldown('merged-unresolved', state, undefined, 15, signal),
      ).then(({ value }) => value));
      void recentTask.then(async (result) => {
        if (!isCurrent(generation, signal)) return;
        if (!result.ok) {
          if (!isAbort(result.error)) renderDashboardRecentActivityError(recentContent);
          return;
        }
        renderDashboardRecentActivity(recentContent, recentCount, result.value, state);
        const mergeResult = await mergeOverviewTask;
        if (!isCurrent(generation, signal)) return;
        if (mergeResult.ok) markDashboardMergedUnresolved(recentContent, mergeResult.value);
      });

      return;
    }

    if (route.kind === 'activity') {
      const activityQuery = {
        ...state,
        cursor: null,
        limit: preferences.previewSize,
        q: state.query,
        favoritesOnly: state.favoritesOnly,
      };
      const activityTask = cachedRead(
        `activity:${stableKey(activityQuery)}`,
        CACHE_POLICIES.activity,
        signal,
        generation,
        () => api.getActivity(activityQuery, signal),
      ).then(({ value }) => value);
      const [viewer, , favorites, activity] = await Promise.all([
        viewerTask,
        accountTask,
        favoritesTask(),
        activityTask,
      ]);
      if (!isCurrent(generation, signal)) return;
      shell.show(activityView(viewer, activity, state, favorites, '/app/activity', preferences.previewSize, signal, generation));
      return;
    }

    if (route.kind === 'overview') {
      const overviewTask = cachedRead(
        `overview:${route.metric}:${stableKey({ state, cursor: null, limit: preferences.previewSize })}`,
        CACHE_POLICIES.overview,
        signal,
        generation,
        () => getOverviewDrilldown(route.metric, state, undefined, preferences.previewSize, signal),
      ).then(({ value }) => value);
      const transitionsTask = cachedRead(
        `transitions:${stableKey({ state })}`,
        CACHE_POLICIES.transitions,
        signal,
        generation,
        () => getNotableTransitionInsights(state, signal),
      ).then(({ value }) => value);
      const companionMetric = route.metric === 'evaluations'
        ? 'pull-requests'
        : route.metric === 'pull-requests'
          ? 'evaluations'
          : undefined;
      const companionTask = companionMetric
        ? cachedRead(
          `overview:${companionMetric}:${stableKey({ state, cursor: null, limit: preferences.previewSize })}`,
          CACHE_POLICIES.overview,
          signal,
          generation,
          () => getOverviewDrilldown(companionMetric, state, undefined, preferences.previewSize, signal),
        ).then(({ value }) => value)
        : Promise.resolve(undefined);
      const behaviorPatternsTask = route.metric === 'merged-unresolved'
        ? cachedRead(
          `behavior-patterns:${stableKey({ state })}`,
          CACHE_POLICIES.behavior,
          signal,
          generation,
          () => getBehaviorPatterns(state, window.location.search, signal),
        ).then(({ value }) => value).catch(() => undefined)
        : Promise.resolve(undefined);
      const [viewer, , , overview, transitions, companion, behaviorPatterns] = await Promise.all([
        viewerTask,
        accountTask,
        favoritesTask(),
        overviewTask,
        transitionsTask,
        companionTask,
        behaviorPatternsTask,
      ]);
      if (!isCurrent(generation, signal)) return;
      const overviewView = renderOverviewDrilldown(
        viewer,
        overview,
        state,
        (value) => {
          const next = withActivityState(state, { window: value, attention: 'ALL' });
          navigate(`/app/overview/${route.metric}?${serializeActivityState(next)}`);
        },
        transitions,
        companion,
        (cursor) => cachedRead(
          `overview:${route.metric}:${stableKey({ state, cursor, limit: preferences.previewSize })}`,
          CACHE_POLICIES.overview,
          signal,
          generation,
          () => getOverviewDrilldown(route.metric, state, cursor, preferences.previewSize, signal),
        ).then(({ value }) => value),
        preferences.previewSize,
      );
      if (behaviorPatterns) enhanceOverviewWithBehaviorPatterns(overviewView, behaviorPatterns, state);
      shell.show(overviewView);
      if (window.location.hash) {
        const targetId = decodeURIComponent(window.location.hash.slice(1));
        requestAnimationFrame(() => shell.outlet.querySelector<HTMLElement>(`#${CSS.escape(targetId)}`)?.scrollIntoView({ block: 'start' }));
      }
      return;
    }

    if (route.kind === 'settings') {
      const repositoriesTask = settle(cachedRead(`activity:settings-repositories:${stableKey({ window: '30d', attention: 'ALL', repositoryId: null, cursor: null, limit: 1 })}`, CACHE_POLICIES.activity, signal, generation, () => api.getActivity({
        window: '30d',
        attention: 'ALL',
        repositoryId: null,
        cursor: null,
        limit: 1,
      }, signal)).then(({ value }) => value));
      void accountTask.catch(() => undefined);
      const [viewer, repositoryMetadata] = await Promise.all([
        viewerTask,
        repositoriesTask,
      ]);
      if (!isCurrent(generation, signal)) return;
      shell.setViewer(viewer);
      const warnings: string[] = [];
      if (!settingsResult.ok) warnings.push('Saved preferences could not be loaded. Safe defaults are shown for now.');
      if (!repositoryMetadata.ok) warnings.push('Repository choices could not be loaded. You can still save the other preferences.');
      shell.show(renderSettings(
        loadedSettings,
        repositoryMetadata.ok ? repositoryMetadata.value.repositories : [],
        {
          save(input, etag) {
            return api.replaceSettings(input, etag).then((saved) => {
              queryCache.set('settings', saved, CACHE_POLICIES.settings);
              invalidateActivityDerivedQueries();
              shell.setDensity(saved.settings.density);
              shell.setPreferenceWarning(undefined);
              return saved;
            });
          },
          reload() {
            return cachedSettings(true, signal, generation);
          },
        },
        warnings.length ? { warning: warnings.join(' ') } : {},
      ));
      return;
    }

    if (route.kind === 'account') {
      const [viewer, account] = await Promise.all([viewerTask, accountTask]);
      if (!isCurrent(generation, signal)) return;
      shell.setViewer(viewer);
      shell.show(renderAccountPage(account, () => {
        void api.logout().then(() => {
          queryCache.clear();
          window.location.assign('/app');
        });
      }));
      return;
    }

    if (route.kind === 'pull-request') {
      const trajectoryTask = cachedRead(
        `trajectory:${route.repositoryId}:${route.pullRequestNumber}`,
        CACHE_POLICIES.trajectory,
        signal,
        generation,
        () => api.getTrajectory(route.repositoryId, route.pullRequestNumber, signal),
      ).then(({ value }) => value);
      const behaviorTask = cachedRead(
        `behavior:${route.repositoryId}:${route.pullRequestNumber}`,
        CACHE_POLICIES.behavior,
        signal,
        generation,
        () => getChangeBehavior(route.repositoryId, route.pullRequestNumber, window.location.search, signal),
      ).then(({ value }) => value).catch(() => undefined);
      const [viewer, , favorites, trajectory, behavior] = await Promise.all([
        viewerTask,
        accountTask,
        favoritesTask(),
        trajectoryTask,
        behaviorTask,
      ]);
      if (!isCurrent(generation, signal)) return;
      const activitySearch = serializeActivityState(state);
      const saveFeedback = (transitionId: string, input: Parameters<typeof api.saveTrajectoryFeedback>[3]) => api.saveTrajectoryFeedback(
        route.repositoryId,
        route.pullRequestNumber,
        transitionId,
        input,
      ).then((feedback) => {
        queryCache.invalidate(`trajectory:${route.repositoryId}:${route.pullRequestNumber}`);
        queryCache.invalidate(`behavior:${route.repositoryId}:${route.pullRequestNumber}`);
        return feedback;
      });
      const pullRequestView = renderPullRequest(
        viewer,
        trajectory,
        activitySearch,
        favorites,
        saveFeedback,
        preferences.previewSize,
      );
      enhancePullRequestWithSeverityTimeline(pullRequestView, trajectory, activitySearch, saveFeedback);
      if (behavior) enhancePullRequestWithBehavior(pullRequestView, behavior);
      shell.show(pullRequestView);
      return;
    }

    if (route.kind === 'run') {
      const runTask = cachedRead(
        `run:${route.repositoryId}:${route.runId}`,
        CACHE_POLICIES.immutableDetail,
        signal,
        generation,
        () => api.getRun(route.repositoryId, route.runId, signal),
      ).then(({ value }) => value);
      const [viewer, , favorites, response] = await Promise.all([viewerTask, accountTask, favoritesTask(), runTask]);
      if (!isCurrent(generation, signal)) return;
      const activitySearch = serializeActivityState(state);
      const evaluationView = renderEvaluation(viewer, response, activitySearch, favorites);
      shell.show(evaluationView);
      const summary = response.status === 'available' ? response.detail : response.summary;
      void cachedRead(
        `pull-request:${route.repositoryId}:${summary.pullRequest.number}`,
        CACHE_POLICIES.detail,
        signal,
        generation,
        () => api.getPullRequest(route.repositoryId, summary.pullRequest.number, signal),
      ).then(({ value: pullRequest }) => {
          if (!isCurrent(generation, signal)) return;
          enhanceEvaluationWithPullRequestContext(
            shell.root,
            pullRequest,
            { headSha: summary.headSha, runId: route.runId },
            activitySearch,
          );
        })
        .catch(() => undefined);
      return;
    }

    if (route.kind === 'evaluation') {
      const evaluationTask = cachedRead(
        `evaluation:${route.repositoryId}:${route.headSha}`,
        CACHE_POLICIES.immutableDetail,
        signal,
        generation,
        () => api.getEvaluation(route.repositoryId, route.headSha, signal),
      ).then(({ value }) => value);
      const [viewer, , favorites, response] = await Promise.all([viewerTask, accountTask, favoritesTask(), evaluationTask]);
      if (!isCurrent(generation, signal)) return;
      const activitySearch = serializeActivityState(state);
      const evaluationView = renderEvaluation(viewer, response, activitySearch, favorites);
      shell.show(evaluationView);
      const summary = response.status === 'available' ? response.detail : response.summary;
      void cachedRead(
        `pull-request:${route.repositoryId}:${summary.pullRequest.number}`,
        CACHE_POLICIES.detail,
        signal,
        generation,
        () => api.getPullRequest(route.repositoryId, summary.pullRequest.number, signal),
      ).then(({ value: pullRequest }) => {
          if (!isCurrent(generation, signal)) return;
          enhanceEvaluationWithPullRequestContext(shell.root, pullRequest, { headSha: route.headSha }, activitySearch);
        })
        .catch(() => undefined);
      return;
    }

    const [viewer] = await Promise.all([viewerTask, accountTask]);
    if (!isCurrent(generation, signal)) return;
    shell.show(renderNotFound(viewer));
  } catch (error) {
    if (!isCurrent(generation, signal) || isAbort(error)) return;
    if (error instanceof UnauthorizedError) {
      showSignedOut();
      return;
    }
    shell.show(renderError(resolvedViewer, () => void render()));
  }
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-router-link="true"]') : null;
  if (!target || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(target.href, window.location.origin);
  if (url.origin !== window.location.origin) return;
  event.preventDefault();
  navigate(`${url.pathname}${url.search}${url.hash}`);
});

window.addEventListener('popstate', () => void render());
let lastFocusRefresh = 0;
function refreshOnFocusOrVisibility(): void {
  if (document.visibilityState === 'hidden') return;
  const now = Date.now();
  if (now - lastFocusRefresh < 1_000) return;
  lastFocusRefresh = now;
  // Re-rendering from the private cache is intentionally skeleton-free.  Fresh
  // entries resolve synchronously; stale entries paint first and schedule one
  // background refresh through cachedRead().
  void render({ showLoading: false });
}
window.addEventListener('focus', refreshOnFocusOrVisibility);
document.addEventListener('visibilitychange', refreshOnFocusOrVisibility);
void render();
