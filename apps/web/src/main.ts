import './styles.css';
import './account.css';
import { renderAccountPage } from './account-ui';
import { createDashboardApi, UnauthorizedError } from './api';
import { navigate, parseRoute } from './router';
import { parseActivityState, serializeActivityState, withActivityState } from './state';
import { renderActivity, renderError, renderEvaluation, renderLoading, renderNotFound, renderSignedOut } from './ui';

const mount = document.querySelector<HTMLElement>('#app')!;
if (!mount) throw new Error('Missing #app mount');

function wireViewerAccount(): void {
  const identity = mount.querySelector<HTMLElement>('.viewer');
  if (!identity || identity instanceof HTMLAnchorElement) return;
  identity.classList.add('viewer-link');
  identity.tabIndex = 0;
  identity.setAttribute('role', 'link');
  identity.setAttribute('aria-label', 'Open account settings');
  const open = () => navigate('/app/account');
  identity.addEventListener('click', open);
  identity.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
}

function replace(view: HTMLElement): void {
  mount.replaceChildren(view);
  wireViewerAccount();
}

function currentActivitySearch(): string {
  return serializeActivityState(parseActivityState(window.location.search));
}

function showSignedOut(): void {
  replace(renderSignedOut());
  const note = mount.querySelector<HTMLElement>('.phase-note');
  if (note) note.textContent = 'Sign in with GitHub to view Spark activity for repositories your account can access.';
  const button = mount.querySelector<HTMLButtonElement>('[data-testid="sign-in"]');
  button?.addEventListener('click', () => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/auth/github?return_to=${encodeURIComponent(returnTo)}`);
  });
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
        },
        loadHistory(repositoryId, pullRequestNumber) {
          return api.getPullRequestHistory(repositoryId, pullRequestNumber);
        }
      }));
      return;
    }

    if (route.kind === 'account') {
      const account = await api.getAccount();
      replace(renderAccountPage(account, () => {
        void api.logout().then(() => {
          window.location.assign('/app');
        });
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
      showSignedOut();
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
