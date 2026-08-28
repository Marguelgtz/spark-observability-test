import './styles.css';
import './shell.css';
import './account.css';
import './pr.css';
import type { ViewerV1 } from '@spark/dashboard-contracts';
import { renderAccountPage } from './account-ui';
import { createDashboardApi, UnauthorizedError } from './api';
import { createPersistentAppShell } from './app-shell';
import { FavoriteStore } from './favorites';
import { enhanceEvaluationWithPullRequestContext, renderPullRequest } from './pr-ui';
import { navigate, parseRoute } from './router';
import { parseActivityState, serializeActivityState, withActivityState } from './state';
import { renderActivity, renderError, renderEvaluation, renderNotFound, renderSignedOut } from './ui';

const mount = document.querySelector<HTMLElement>('#app')!;
if (!mount) throw new Error('Missing #app mount');

const api = createDashboardApi(window.location.search);
const shell = createPersistentAppShell();
mount.replaceChildren(shell.root);

let viewerPromise: Promise<ViewerV1> | undefined;
let favoritesPromise: Promise<FavoriteStore> | undefined;
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

function currentActivitySearch(): string {
  return serializeActivityState(parseActivityState(window.location.search));
}

function showSignedOut(): void {
  shell.setViewer(undefined);
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
  const route = parseRoute(window.location.pathname);

  shell.showLoading(route.kind);

  const viewerTask = abortable(cachedViewer(), signal);
  const favoritesTask = abortable(cachedFavorites(), signal);

  try {
    if (route.kind === 'activity') {
      const state = parseActivityState(window.location.search);
      const activityTask = abortable(api.getActivity(state), signal);
      const [viewer, favorites, activity] = await Promise.all([viewerTask, favoritesTask, activityTask]);
      if (generation !== routeGeneration || signal.aborted) return;

      shell.show(renderActivity(viewer, activity, state, {
        setWindow(value) {
          const next = withActivityState(state, { window: value });
          navigate(`/app?${serializeActivityState(next)}`);
        },
        setAttention(value) {
          const next = withActivityState(state, { attention: value });
          navigate(`/app?${serializeActivityState(next)}`);
        },
        setRepository(value) {
          const next = withActivityState(state, { repositoryId: value });
          navigate(`/app?${serializeActivityState(next)}`);
        },
        showAllAttention() {
          const next = withActivityState(state, { attention: 'ALL' });
          navigate(`/app?${serializeActivityState(next)}`);
        },
        setClientFilters(query, favoritesOnly) {
          const next = withActivityState(state, { query: query.trim() || undefined, favoritesOnly });
          const search = serializeActivityState(next);
          window.history.replaceState(null, '', `/app${search ? `?${search}` : ''}`);
        },
        loadHistory(repositoryId, pullRequestNumber) {
          return api.getPullRequestHistory(repositoryId, pullRequestNumber);
        },
        favorites,
      }));
      return;
    }

    if (route.kind === 'account') {
      const accountTask = abortable(api.getAccount(), signal);
      const [viewer, , account] = await Promise.all([viewerTask, favoritesTask, accountTask]);
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
      const [viewer, favorites, trajectory] = await Promise.all([viewerTask, favoritesTask, trajectoryTask]);
      if (generation !== routeGeneration || signal.aborted) return;
      shell.show(renderPullRequest(
        viewer,
        trajectory,
        currentActivitySearch(),
        favorites,
        (transitionId, input) => api.saveTrajectoryFeedback(
          route.repositoryId,
          route.pullRequestNumber,
          transitionId,
          input,
        ),
      ));
      return;
    }

    if (route.kind === 'run') {
      const runTask = abortable(api.getRun(route.repositoryId, route.runId), signal);
      const [viewer, favorites, response] = await Promise.all([viewerTask, favoritesTask, runTask]);
      if (generation !== routeGeneration || signal.aborted) return;
      shell.show(renderEvaluation(viewer, response, currentActivitySearch(), favorites));
      const summary = response.status === 'available' ? response.detail : response.summary;
      void abortable(api.getPullRequest(route.repositoryId, summary.pullRequest.number), signal)
        .then((pullRequest) => {
          if (generation !== routeGeneration || signal.aborted) return;
          enhanceEvaluationWithPullRequestContext(
            shell.root,
            pullRequest,
            { headSha: summary.headSha, runId: route.runId },
            currentActivitySearch(),
          );
        })
        .catch(() => undefined);
      return;
    }

    if (route.kind === 'evaluation') {
      const evaluationTask = abortable(api.getEvaluation(route.repositoryId, route.headSha), signal);
      const [viewer, favorites, response] = await Promise.all([viewerTask, favoritesTask, evaluationTask]);
      if (generation !== routeGeneration || signal.aborted) return;
      shell.show(renderEvaluation(viewer, response, currentActivitySearch(), favorites));
      const summary = response.status === 'available' ? response.detail : response.summary;
      void abortable(api.getPullRequest(route.repositoryId, summary.pullRequest.number), signal)
        .then((pullRequest) => {
          if (generation !== routeGeneration || signal.aborted) return;
          enhanceEvaluationWithPullRequestContext(shell.root, pullRequest, { headSha: route.headSha }, currentActivitySearch());
        })
        .catch(() => undefined);
      return;
    }

    const [viewer] = await Promise.all([viewerTask, favoritesTask]);
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
