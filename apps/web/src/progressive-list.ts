import type { PreviewSize } from '@spark/dashboard-contracts';

export { type PreviewSize } from '@spark/dashboard-contracts';

export const DEFAULT_PREVIEW_SIZE: PreviewSize = 15;

export interface ProgressivePage<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

export interface ProgressiveListOptions<T> {
  items: T[];
  total: number;
  nextCursor?: string | null;
  previewSize: PreviewSize;
  identity(item: T): string;
  renderItem(item: T): HTMLElement;
  loadMore?(cursor: string): Promise<ProgressivePage<T>>;
  className?: string;
  itemsClassName?: string;
  testId?: string;
  itemLabel?: string;
}

let listSequence = 0;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * Shared disclosure for retained client collections and opaque-cursor server pages.
 * Loaded items stay resident when collapsed, so Show less never refetches.
 */
export function progressiveList<T>(options: ProgressiveListOptions<T>): HTMLElement {
  const root = node('div', `progressive-list${options.className ? ` ${options.className}` : ''}`);
  if (options.testId) root.dataset.testid = options.testId;
  const list = node('div', `progressive-list-items${options.itemsClassName ? ` ${options.itemsClassName}` : ''}`);
  list.id = `progressive-list-${++listSequence}`;
  const controls = node('div', 'progressive-list-controls');
  const status = node('span', 'progressive-list-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  controls.append(status);
  root.append(list, controls);

  let items = [...options.items];
  let total = Math.max(options.total, items.length);
  let nextCursor = options.nextCursor ?? null;
  let visibleCount = Math.min(options.previewSize, items.length);
  let loading = false;
  let failedCursor: string | null = null;

  const appendUnique = (incoming: T[]): T[] => {
    const identities = new Set(items.map(options.identity));
    const appended: T[] = [];
    for (const item of incoming) {
      const identity = options.identity(item);
      if (identities.has(identity)) continue;
      identities.add(identity);
      items.push(item);
      appended.push(item);
    }
    return appended;
  };

  const render = (focusIdentity?: string) => {
    list.replaceChildren();
    for (const item of items.slice(0, visibleCount)) {
      const rendered = options.renderItem(item);
      rendered.dataset.progressiveIdentity = options.identity(item);
      list.append(rendered);
    }
    controls.querySelectorAll('button').forEach((button) => button.remove());

    const canRevealLoaded = visibleCount < items.length;
    const canLoad = Boolean(nextCursor && options.loadMore);
    if ((canRevealLoaded || canLoad) && !failedCursor) {
      const amount = Math.min(options.previewSize, Math.max(0, total - visibleCount));
      const more = node('button', 'progressive-list-button', `Show ${amount || options.previewSize} more`) as HTMLButtonElement;
      more.type = 'button';
      more.setAttribute('aria-controls', list.id);
      more.setAttribute('aria-expanded', String(visibleCount > options.previewSize));
      more.disabled = loading;
      more.addEventListener('click', () => void showMore());
      controls.append(more);
    }
    if (visibleCount > options.previewSize) {
      const less = node('button', 'progressive-list-button progressive-list-less', 'Show less') as HTMLButtonElement;
      less.type = 'button';
      less.setAttribute('aria-controls', list.id);
      less.setAttribute('aria-expanded', 'true');
      less.addEventListener('click', () => {
        visibleCount = Math.min(options.previewSize, items.length);
        status.textContent = `Showing ${visibleCount} of ${total} ${options.itemLabel ?? 'items'}.`;
        render();
        controls.querySelector<HTMLButtonElement>('.progressive-list-button')?.focus({ preventScroll: true });
      });
      controls.append(less);
    }
    if (failedCursor) {
      const retry = node('button', 'progressive-list-button progressive-list-retry', 'Retry') as HTMLButtonElement;
      retry.type = 'button';
      retry.addEventListener('click', () => void load(failedCursor!));
      controls.append(retry);
    }
    controls.classList.toggle('has-actions', Boolean(controls.querySelector('button')));
    if (focusIdentity) {
      const target = [...list.children].find((element) => (element as HTMLElement).dataset.progressiveIdentity === focusIdentity) as HTMLElement | undefined;
      if (target) {
        if (!target.matches('a, button, input, select, textarea, [tabindex]')) target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    }
  };

  const load = async (cursor: string) => {
    if (!options.loadMore || loading) return;
    loading = true;
    failedCursor = null;
    status.textContent = `Loading more ${options.itemLabel ?? 'items'}…`;
    render();
    try {
      const page = await options.loadMore(cursor);
      const appended = appendUnique(page.items);
      total = page.total;
      nextCursor = page.nextCursor;
      visibleCount = Math.min(items.length, visibleCount + options.previewSize);
      status.textContent = `Loaded ${appended.length} more. Showing ${visibleCount} of ${total}.`;
      loading = false;
      render(appended[0] ? options.identity(appended[0]) : undefined);
    } catch {
      loading = false;
      failedCursor = cursor;
      status.textContent = `More ${options.itemLabel ?? 'items'} could not be loaded. Existing results are unchanged.`;
      render();
    }
  };

  const showMore = async () => {
    if (visibleCount < items.length) {
      const previous = visibleCount;
      visibleCount = Math.min(items.length, visibleCount + options.previewSize);
      status.textContent = `Showing ${visibleCount} of ${total} ${options.itemLabel ?? 'items'}.`;
      const first = items[previous];
      render(first ? options.identity(first) : undefined);
      return;
    }
    if (nextCursor) await load(nextCursor);
  };

  render();
  return root;
}
