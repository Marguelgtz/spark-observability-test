import type { AccountV1 } from '@spark/dashboard-contracts';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function githubLink(label: string, href: string, className: string): HTMLAnchorElement {
  const link = node('a', className, label);
  const url = new URL(href);
  if (url.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(url.hostname)) throw new Error('Invalid GitHub account URL');
  link.href = url.toString();
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  return link;
}

export function renderAccountPage(account: AccountV1, onLogout: () => void): HTMLElement {
  const root = node('div', 'app-shell');
  const header = node('header', 'topbar');
  const brand = node('a', 'brand', 'Spark');
  brand.href = '/app';
  brand.dataset.routerLink = 'true';

  const identity = node('a', 'viewer viewer-link');
  identity.href = '/app/account';
  identity.dataset.routerLink = 'true';
  const avatar = node('img', 'viewer-avatar') as HTMLImageElement;
  avatar.src = account.viewer.avatarUrl;
  avatar.alt = '';
  avatar.width = 24;
  avatar.height = 24;
  identity.append(avatar, node('span', 'viewer-login', account.viewer.login));
  header.append(brand, identity);

  const main = node('main', 'main-column account-page');
  const back = node('a', 'back-link', '← Activity');
  back.href = '/app';
  back.dataset.routerLink = 'true';
  main.append(back);

  const heading = node('div', 'account-heading');
  heading.append(node('p', 'eyebrow', 'ACCOUNT'), node('h1', undefined, `@${account.viewer.login}`));
  main.append(heading);

  const summary = node('section', 'account-section');
  summary.append(node('h2', undefined, 'GitHub access'));
  const rows: Array<[string, string]> = [
    ['Accessible repositories', String(account.repositoryCount)],
    ['App installations', String(account.installationCount)],
    ['Session expires', new Date(account.sessionExpiresAt).toLocaleString()],
  ];
  for (const [label, value] of rows) {
    const row = node('div', 'account-row');
    row.append(node('span', 'muted', label), node('strong', undefined, value));
    summary.append(row);
  }
  summary.append(node('p', 'account-note', 'Spark uses GitHub to determine which installed repositories your account can access. GitHub user tokens are not retained after sign-in.'));
  main.append(summary);

  const actions = node('section', 'account-section');
  actions.append(node('h2', undefined, 'Manage'));
  const actionRow = node('div', 'account-actions');
  const refresh = node('a', 'primary-link', 'Refresh GitHub access');
  refresh.href = '/auth/github?return_to=%2Fapp%2Faccount';
  actionRow.append(
    refresh,
    githubLink('Install or add repositories', account.githubInstallUrl, 'secondary-link'),
    githubLink('GitHub app settings', account.githubSettingsUrl, 'secondary-link'),
  );
  const logout = node('button', 'secondary-button account-logout', 'Sign out');
  logout.type = 'button';
  logout.addEventListener('click', onLogout);
  actionRow.append(logout);
  actions.append(actionRow);
  main.append(actions);

  root.append(header, main);
  return root;
}
