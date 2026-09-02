const SORT_OPTIONS = [
  ['recent', 'Recent'],
  ['attention', 'Attention'],
  ['evaluations', 'Most evaluations'],
  ['repository', 'Repository'],
] as const;

type ActivitySort = typeof SORT_OPTIONS[number][0];
const VALID_SORTS = new Set<ActivitySort>(SORT_OPTIONS.map(([value]) => value));

function selectedSort(): ActivitySort {
  const value = new URLSearchParams(window.location.search).get('sort') as ActivitySort | null;
  return value && VALID_SORTS.has(value) ? value : 'recent';
}

function navigateToSort(sort: ActivitySort): void {
  const url = new URL(window.location.href);
  if (sort === 'recent') url.searchParams.delete('sort');
  else url.searchParams.set('sort', sort);
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function mountActivitySort(): void {
  const view = document.querySelector<HTMLElement>('[data-testid="activity-view"]');
  if (!view) return;
  const filters = view.querySelector<HTMLElement>('.client-filters');
  if (!filters || filters.querySelector('[data-testid="activity-sort"]')) return;

  const field = document.createElement('label');
  field.className = 'activity-sort-filter';
  const label = document.createElement('span');
  label.className = 'filter-label';
  label.textContent = 'Sort';
  const select = document.createElement('select');
  select.className = 'repository-select activity-sort-select';
  select.dataset.testid = 'activity-sort';
  select.setAttribute('aria-label', 'Sort pull requests');

  const current = selectedSort();
  for (const [value, text] of SORT_OPTIONS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    option.selected = current === value;
    select.append(option);
  }
  select.addEventListener('change', () => navigateToSort(select.value as ActivitySort));
  field.append(label, select);

  filters.classList.add('has-activity-sort');
  const favorites = filters.querySelector('.favorites-filter');
  filters.insertBefore(field, favorites);
}

const app = document.getElementById('app');
if (app) {
  const observer = new MutationObserver(mountActivitySort);
  observer.observe(app, { childList: true, subtree: true });
  mountActivitySort();
}
