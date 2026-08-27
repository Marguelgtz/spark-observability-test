import './styles.css';
import { createDashboardApi, UnauthorizedError } from './api';
import { navigate, parseRoute } from './router';
import { parseActivityState, serializeActivityState, withActivityState } from './state';
import { renderActivity, renderError, renderEvaluation, renderLoading, renderNotFound, renderSignedOut } from './ui';

const mount = document.querySelector<HTMLElement>('#app')!;
if (!mount) throw new Error('Missing #app mount');

function replace(view: HTMLElement): void {
  mount.replaceChildren(view);
}

function currentActivitySearch(): string {
  return serializeActivityState(parseActivityState(window.location.search));
}

async function render(): Promise<void> {
  const api = createDashboardApi(window.location.search);
  const route = parseRoute(window.location.pathname);
  replace(renderLoading());

  try {
    const viewer = await api.getViewer();
    replace(renderLoading(viewer));

    if (route.kind === 'activity') {
      const state = parseActivityState(window.location.search);
      const activity = await api.getActivity(state);
      replace(renderActivity(viewer, activity, state, {
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
        }
      }));
      return;
    }

    if (route.kind === 'evaluation') {
      const detail = await api.getEvaluation(route.repositoryId, route.headSha);
      replace(renderEvaluation(viewer, detail, currentActivitySearch()));
      return;
    }

    replace(renderNotFound(viewer));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      replace(renderSignedOut());
      return;
    }
    replace(renderError(undefined, () => void render()));
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
