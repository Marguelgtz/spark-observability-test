import type { ViewerV1 } from '@spark/dashboard-contracts';
import type { DashboardRoute } from './router';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function routeLabel(kind: DashboardRoute['kind']): string {
  if (kind === 'pull-request') return 'Pull request';
  if (kind === 'run' || kind === 'evaluation') return 'Evaluation';
  if (kind === 'account') return 'Account';
  if (kind === 'not-found') return 'Spark';
  return 'Activity';
}

function loadingContent(kind: DashboardRoute['kind']): HTMLElement {
  const wrap = node('div', `route-loading route-loading-${kind}`);
  wrap.dataset.testid = 'loading';

  if (kind === 'pull-request') {
    const heading = node('div', 'route-loading-heading');
    heading.append(node('div', 'skeleton route-skeleton-kicker'), node('div', 'skeleton route-skeleton-title'));
    wrap.append(heading);
    for (let index = 0; index < 4; index += 1) {
      const row = node('div', 'route-story-skeleton');
      row.append(node('span', 'skeleton route-skeleton-dot'), node('span', 'skeleton route-skeleton-copy'));
      wrap.append(row);
    }
    return wrap;
  }

  if (kind === 'run' || kind === 'evaluation') {
    wrap.append(node('div', 'skeleton route-skeleton-kicker'), node('div', 'skeleton route-skeleton-title'));
    const card = node('div', 'route-card-skeleton');
    card.append(node('div', 'skeleton route-skeleton-line'), node('div', 'skeleton route-skeleton-line short'));
    wrap.append(card);
    return wrap;
  }

  if (kind === 'account') {
    wrap.append(node('div', 'skeleton route-skeleton-title'));
    for (let index = 0; index < 3; index += 1) wrap.append(node('div', 'skeleton route-skeleton-line'));
    return wrap;
  }

  const title = node('div', 'page-heading');
  title.append(node('div', undefined, routeLabel(kind)));
  wrap.append(title);
  const list = node('div', 'loading-list');
  for (let index = 0; index < 5; index += 1) {
    const row = node('div', 'loading-row');
    row.append(node('div', 'skeleton skeleton-attention'), node('div', 'skeleton skeleton-main'), node('div', 'skeleton skeleton-meta'));
    list.append(row);
  }
  wrap.append(list);
  return wrap;
}

export interface PersistentAppShell {
  root: HTMLElement;
  outlet: HTMLElement;
  setViewer(viewer?: ViewerV1): void;
  show(view: HTMLElement): void;
  showLoading(kind: DashboardRoute['kind']): void;
}

export function createPersistentAppShell(): PersistentAppShell {
  const root = node('div', 'app-shell persistent-app-shell');
  root.dataset.testid = 'app-shell';

  const header = node('header', 'topbar persistent-topbar');
  const left = node('div', 'shell-left');
  const brand = node('a', 'brand', 'Spark');
  brand.href = '/app';
  brand.dataset.routerLink = 'true';

  const nav = node('nav', 'shell-nav');
  nav.setAttribute('aria-label', 'Primary');
  const home = node('a', 'shell-nav-link', 'Home');
  home.href = '/app';
  home.dataset.routerLink = 'true';
  nav.append(home);
  left.append(brand, nav);

  const identitySlot = node('div', 'shell-identity-slot');
  header.append(left, identitySlot);

  const outlet = node('main', 'main-column route-outlet');
  root.append(header, outlet);

  function setViewer(viewer?: ViewerV1): void {
    identitySlot.replaceChildren();
    if (!viewer) return;
    const identity = node('a', 'viewer viewer-link');
    identity.href = '/app/account';
    identity.dataset.routerLink = 'true';
    identity.setAttribute('aria-label', `Open account settings for ${viewer.login}`);
    const avatar = node('img', 'viewer-avatar') as HTMLImageElement;
    avatar.src = viewer.avatarUrl;
    avatar.alt = '';
    avatar.width = 24;
    avatar.height = 24;
    identity.append(avatar, node('span', 'viewer-login', viewer.login));
    identitySlot.append(identity);
  }

  function syncOutletAttributes(source?: HTMLElement): void {
    for (const attribute of Array.from(outlet.attributes)) {
      if (attribute.name !== 'class') outlet.removeAttribute(attribute.name);
    }

    const sourceClasses = source
      ? [...source.classList].filter((name) => name !== 'main-column' && name !== 'route-outlet')
      : [];
    outlet.className = ['main-column', 'route-outlet', ...sourceClasses].join(' ');

    if (!source) return;
    for (const attribute of Array.from(source.attributes)) {
      if (attribute.name === 'class') continue;
      outlet.setAttribute(attribute.name, attribute.value);
    }
  }

  function show(view: HTMLElement): void {
    const source = view.matches('main') ? view : view.querySelector<HTMLElement>('main');
    const content = source ?? view;
    syncOutletAttributes(source ?? undefined);
    outlet.replaceChildren(...Array.from(content.childNodes));
  }

  function showLoading(kind: DashboardRoute['kind']): void {
    syncOutletAttributes();
    outlet.setAttribute('aria-busy', 'true');
    outlet.setAttribute('aria-live', 'polite');
    outlet.replaceChildren(loadingContent(kind));
  }

  return { root, outlet, setViewer, show, showLoading };
}
