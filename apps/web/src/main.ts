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

const mount = document.querySelector<HTMLElement>('#app')!;
if (!mount) throw new Error('Missing #app mount');

const api = createDashboardApi(window.location.search);
const shell = createPersistentAppShell();
mount.replaceChildren(shell.root);

let viewerPromise: Promise<ViewerV1> | undefined;
let accountPromise: Promise<AccountV1> | undefined;
let favoritesPromise: Promise<FavoriteStore> | undefined;
let settingsPromise: Promise<LoadedDashboardSettings> | undefined;
let resolvedViewer: ViewerV1 | undefined;
let routeGeneration = 0;
let routeController: AbortController | undefined;

function cachedViewer(): Promise<ViewerV1> {
  if (!viewerPromise) {
    viewerPromise = api.getViewer()
      .then((viewer) => {
        resolvedViewer = viewer;
        shell.setViewer(viewer);
        return viewer;
      })
      .catch((error) => {
        viewerPromise = undefined;
        throw error;
      });
  }
  return viewerPromise;
}

function cachedAccount(): Promise<AccountV1> {
  if (!accountPromise) {
    accountPromise = api.getAccount()
      .then((account) => {
        resolvedViewer = account.viewer;
        shell.setViewer(account.viewer);
        return account;
      })
      .catch((error) => {
        accountPromise = undefined;
        throw error;
      });
  }
  return accountPromise;
}

function cachedFavorites(): Promise<FavoriteStore> {
  if (!favoritesPromise) {
    favoritesPromise = api.getFavorites()
      .then((savedFavorites) => new FavoriteStore(savedFavorites.favorites, {
        add: (favorite) => api.addFavorite(favorite),
        remove: (favorite) => api.removeFavorite(favorite),
      }))
      .catch((error) => {
        favoritesPromise = undefined;
        throw error;
      });
  }
  return favoritesPromise;
}

function cachedSettings(force = false): Promise<LoadedDashboardSettings> {
  if (force) settingsPromise = undefined;
  if (!settingsPromise) {
    settingsPromise = api.getSettings().catch((error) => {
      settingsPromise = undefined;
      throw error;
    });
  }
  return settingsPromise;
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

function activityPath(search: string): string {
  return `/app/activity${search ? `?${search}` : ''}`;
}

function pointBackToActivity(view: HTMLElement, activitySearch: string): void {
  const back = view.querySelector<HTMLAnchorElement>('.back-link');
  if (!back || !back.textContent?.includes('Activity')) return;
  back.href = activityPath(activitySearch);
}

function activityView(
  viewer: ViewerV1,
  response: ActivityResponseV1,
  state: ActivityUrlState,
  favorites: FavoriteStore,
  routeBase: '/app' | '/app/activity',
  previewSize: PreviewSize,
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
      const next = withActivityState(state, { repositoryId: value });
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
      return api.getActivity({
        ...state,
        cursor,
        limit: previewSize,
        q: state.query,
        favoritesOnly: state.favoritesOnly,
      });
    },
    loadHistory(repositoryId, pullRequestNumber) {
      return api.getPullRequestHistory(repositoryId, pullRequestNumber);
    },
    favorites,
    previewSize,
  });
}

function showSignedOut(): void {
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

async function render(): Promise<void> {
  const generation = ++routeGeneration;
  routeController?.abort();
  const controller = new AbortController();
  routeController = controller;
  const { signal } = controller;

  const redirect = legacyActivityRedirect(window.location.pathname, window.location.search);
  if (redirect) window.history.replaceState(null, '', redirect);

  const route = parseRoute(window.location.pathname);
  shell.setRoute(route.kind);
  shell.showLoading(route.kind);

  const viewerTask = abortable(cachedViewer(), signal);
  const accountTask = abortable(cachedAccount(), signal);
  const favoritesTask = abortable(cachedFavorites(), signal);
  const settingsTask = settle(abortable(cachedSettings(), signal));

  try {
    const settingsResult = await settingsTask;
    if (generation !== routeGeneration || signal.aborted) return;
    const loadedSettings = activateSettings(settingsResult, route.kind !== 'settings');
    const { settings: preferences, state } = resolvePreferences(window.location.search, loadedSettings.settings);

    if (route.kind === 'dashboard') {
      const dashboardTask = abortable(getOperationalDashboard(state), signal);
      const recentTask = settle(abortable(getDashboardRecentActivity(api, state), signal));
      const mergeOverviewTask = settle(abortable(getOverviewDrilldown('merged-unresolved', state), signal));
      void favoritesTask.catch(() => undefined);

      const [viewer, account, dashboard] = await Promise.all([
        viewerTask,
        accountTask,
        dashboardTask,
      ]);
      if (generation !== routeGeneration || signal.aborted) return;

      shell.setViewer(viewer);
      const view = renderOperationalDashboard(account, dashboard, state, {
        setWindow(value) {
          const next = withActivityState(state, { window: value, attention: 'ALL', cursor: null, query: undefined, favoritesOnly: false });
          navigate(`/app?${serializeActivityState(next)}`);
        },
        setRepository(value) {
          const next = withActivityState(state, { repositoryId: value, attention: 'ALL', cursor: null, query: undefined, favoritesOnly: false });
          navigate(`/app?${serializeActivityState(next)}`);
        },
      }, preferences.previewSize, preferences.collapseSecondarySections);
      shell.show(view);

      const insightsDisclosure = shell.outlet.querySelector<HTMLDetailsElement>('[data-testid="dashboard-insights"]');
      let insightsLoaded = false;
      let insightsLoading = false;
      const loadInsights = () => {
        if (!insightsDisclosure?.open || insightsLoaded || insightsLoading || signal.aborted) return;
        insightsLoading = true;
        renderDashboardInsightsLoading(shell.outlet);
        void abortable(getDashboardInsights(state), signal)
          .then((insights) => {
            if (generation !== routeGeneration || signal.aborted) return;
            insightsLoaded = true;
            renderDashboardInsights(shell.outlet, dashboard, insights, state);
          })
          .catch((error: unknown) => {
            if (generation !== routeGeneration || signal.aborted || isAbort(error)) return;
            const source = error instanceof DashboardInsightsError ? error.source : 'evaluation trends';
            renderDashboardInsightsError(shell.outlet, source, loadInsights);
          })
          .finally(() => {
            insightsLoading = false;
          });
      };
      insightsDisclosure?.addEventListener('toggle', loadInsights);
      loadInsights();

      void recentTask.then(async (result) => {
        if (generation !== routeGeneration || signal.aborted) return;
        if (!result.ok) {
          if (!isAbort(result.error)) renderDashboardRecentActivityError(shell.outlet);
          return;
        }
        renderDashboardRecentActivity(shell.outlet, result.value, state);
        const mergeResult = await mergeOverviewTask;
        if (generation !== routeGeneration || signal.aborted) return;
        if (mergeResult.ok) markDashboardMergedUnresolved(shell.outlet, mergeResult.value);
      });

      return;
    }

    if (route.kind === 'activity') {
      const activityTask = abortable(api.getActivity({
        ...state,
        cursor: null,
        limit: preferences.previewSize,
        q: state.query,
        favoritesOnly: state.favoritesOnly,
      }), signal);
      const [viewer, , favorites, activity] = await Promise.all([
        viewerTask,
        accountTask,
        favoritesTask,
        activityTask,
      ]);
      if (generation !== routeGeneration || signal.aborted) return;
      shell.show(activityView(viewer, activity, state, favorites, '/app/activity', preferences.previewSize));
      return;
    }

    if (route.kind === 'overview') {
      const overviewTask = abortable(getOverviewDrilldown(route.metric, state, undefined, preferences.previewSize), signal);
      const transitionsTask = abortable(getNotableTransitionInsights(state), signal);
      const companionMetric = route.metric === 'evaluations'
        ? 'pull-requests'
        : route.metric === 'pull-requests'
          ? 'evaluations'
          : undefined;
      const companionTask = companionMetric
        ? abortable(getOverviewDrilldown(companionMetric, state, undefined, preferences.previewSize), signal)
        : Promise.resolve(undefined);
      const behaviorPatternsTask = route.metric === 'merged-unresolved'
        ? abortable(getBehaviorPatterns(state), signal).catch(() => undefined)
        : Promise.resolve(undefined);
      const [viewer, , , overview, transitions, companion, behaviorPatterns] = await Promise.all([
        viewerTask,
        accountTask,
        favoritesTask,
        overviewTask,
        transitionsTask,
        companionTask,
        behaviorPatternsTask,
      ]);
      if (generation !== routeGeneration || signal.aborted) return;
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
        (cursor) => getOverviewDrilldown(route.metric, state, cursor, preferences.previewSize),
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
      const repositoriesTask = settle(abortable(api.getActivity({
        window: '30d',
        attention: 'ALL',
        repositoryId: null,
        cursor: null,
        limit: 1,
      }), signal));
      void accountTask.catch(() => undefined);
      void favoritesTask.catch(() => undefined);
      const [viewer, repositoryMetadata] = await Promise.all([
        viewerTask,
        repositoriesTask,
      ]);
      if (generation !== routeGeneration || signal.aborted) return;
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
              settingsPromise = Promise.resolve(saved);
              shell.setDensity(saved.settings.density);
              shell.setPreferenceWarning(undefined);
              return saved;
            });
          },
          reload() {
            return cachedSettings(true);
          },
        },
        warnings.length ? { warning: warnings.join(' ') } : {},
      ));
      return;
    }

    if (route.kind === 'account') {
      const [viewer, account] = await Promise.all([viewerTask, accountTask, favoritesTask]);
      if (generation !== routeGeneration || signal.aborted) return;
      shell.setViewer(viewer);
      shell.show(renderAccountPage(account, () => {
        void api.logout().then(() => {
          window.location.assign('/app');
        });
      }));
      return;
    }

    if (route.kind === 'pull-request') {
      const trajectoryTask = abortable(api.getTrajectory(route.repositoryId, route.pullRequestNumber), signal);
      const behaviorTask = abortable(getChangeBehavior(route.repositoryId, route.pullRequestNumber), signal).catch(() => undefined);
      const [viewer, , favorites, trajectory, behavior] = await Promise.all([
        viewerTask,
        accountTask,
        favoritesTask,
        trajectoryTask,
        behaviorTask,
      ]);
      if (generation !== routeGeneration || signal.aborted) return;
      const activitySearch = serializeActivityState(state);
      const saveFeedback = (transitionId: string, input: Parameters<typeof api.saveTrajectoryFeedback>[3]) => api.saveTrajectoryFeedback(
        route.repositoryId,
        route.pullRequestNumber,
        transitionId,
        input,
      );
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
      pointBackToActivity(pullRequestView, activitySearch);
      shell.show(pullRequestView);
      return;
    }

    if (route.kind === 'run') {
      const runTask = abortable(api.getRun(route.repositoryId, route.runId), signal);
      const [viewer, , favorites, response] = await Promise.all([viewerTask, accountTask, favoritesTask, runTask]);
      if (generation !== routeGeneration || signal.aborted) return;
      const activitySearch = serializeActivityState(state);
      const evaluationView = renderEvaluation(viewer, response, activitySearch, favorites);
      pointBackToActivity(evaluationView, activitySearch);
      shell.show(evaluationView);
      const summary = response.status === 'available' ? response.detail : response.summary;
      void abortable(api.getPullRequest(route.repositoryId, summary.pullRequest.number), signal)
        .then((pullRequest) => {
          if (generation !== routeGeneration || signal.aborted) return;
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
      const evaluationTask = abortable(api.getEvaluation(route.repositoryId, route.headSha), signal);
      const [viewer, , favorites, response] = await Promise.all([viewerTask, accountTask, favoritesTask, evaluationTask]);
      if (generation !== routeGeneration || signal.aborted) return;
      const activitySearch = serializeActivityState(state);
      const evaluationView = renderEvaluation(viewer, response, activitySearch, favorites);
      pointBackToActivity(evaluationView, activitySearch);
      shell.show(evaluationView);
      const summary = response.status === 'available' ? response.detail : response.summary;
      void abortable(api.getPullRequest(route.repositoryId, summary.pullRequest.number), signal)
        .then((pullRequest) => {
          if (generation !== routeGeneration || signal.aborted) return;
          enhanceEvaluationWithPullRequestContext(shell.root, pullRequest, { headSha: route.headSha }, activitySearch);
        })
        .catch(() => undefined);
      return;
    }

    const [viewer] = await Promise.all([viewerTask, accountTask, favoritesTask]);
    if (generation !== routeGeneration || signal.aborted) return;
    shell.show(renderNotFound(viewer));
  } catch (error) {
    if (generation !== routeGeneration || signal.aborted || isAbort(error)) return;
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
void render();
