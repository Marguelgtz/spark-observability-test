import type {
  DashboardDensityV1,
  DashboardSettingsInputV1,
  ObservedRepositoryV1,
  PreviewSize,
} from '@spark/dashboard-contracts';
import type { LoadedDashboardSettings } from './api';
import { SettingsConflictError, SettingsRequestError } from './api';
import { dashboardRouteHref } from './route-links';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export interface SettingsHandlers {
  save(settings: DashboardSettingsInputV1, etag: string): Promise<LoadedDashboardSettings>;
  reload(): Promise<LoadedDashboardSettings>;
}

export interface SettingsRenderOptions {
  warning?: string;
}

function radioGroup(
  legend: string,
  name: string,
  options: Array<{ value: string; label: string; detail: string }>,
): HTMLFieldSetElement {
  const fieldset = node('fieldset', 'settings-fieldset');
  fieldset.append(node('legend', 'settings-legend', legend));
  const choices = node('div', 'settings-choices');
  for (const option of options) {
    const label = node('label', 'settings-choice');
    const input = node('input') as HTMLInputElement;
    input.type = 'radio';
    input.name = name;
    input.value = option.value;
    input.dataset.testid = `settings-${name}-${option.value.toLowerCase()}`;
    const copy = node('span', 'settings-choice-copy');
    copy.append(node('strong', undefined, option.label), node('span', 'muted', option.detail));
    label.append(input, copy);
    choices.append(label);
  }
  fieldset.append(choices);
  return fieldset;
}

export function renderSettings(
  loaded: LoadedDashboardSettings,
  repositories: ObservedRepositoryV1[],
  handlers: SettingsHandlers,
  options: SettingsRenderOptions = {},
): HTMLElement {
  const main = node('main', 'settings-page');
  main.dataset.testid = 'settings-view';

  // R8.2: give settings the same back-link affordance as the other top-level pages.
  const back = node('a', 'back-link', '← Dashboard') as HTMLAnchorElement;
  back.href = dashboardRouteHref();
  back.dataset.routerLink = 'true';
  main.append(back);

  const heading = node('header', 'settings-heading');
  heading.append(
    node('p', 'eyebrow', 'SETTINGS'),
    node('h1', undefined, 'Dashboard preferences'),
    node('p', 'state-copy', 'Choose how Spark should open by default. Account identity and GitHub repository access remain under your avatar.'),
  );
  main.append(heading);

  if (options.warning) {
    const warning = node('div', 'settings-warning', options.warning);
    warning.setAttribute('role', 'status');
    warning.dataset.testid = 'settings-warning';
    main.append(warning);
  }

  const form = node('form', 'settings-form') as HTMLFormElement;
  form.noValidate = true;

  const windowGroup = radioGroup('Default time window', 'default-window', [
    { value: '24h', label: '24 hours', detail: 'Focus on changes from the last day.' },
    { value: '7d', label: '7 days', detail: 'A balanced operational view.' },
    { value: '30d', label: '30 days', detail: 'Include slower-moving changes.' },
  ]);
  const previewGroup = radioGroup('Default list preview', 'preview-size', [
    { value: '5', label: '5 items', detail: 'The calmest initial view.' },
    { value: '10', label: '10 items', detail: 'A moderate initial batch.' },
    { value: '15', label: '15 items', detail: 'More changes visible at once.' },
  ]);
  const densityGroup = radioGroup('Density', 'density', [
    { value: 'COMFORTABLE', label: 'Comfortable', detail: 'More spacing between changes.' },
    { value: 'COMPACT', label: 'Compact', detail: 'Fit more operational context on screen.' },
  ]);

  const secondary = node('label', 'settings-toggle');
  const secondaryInput = node('input') as HTMLInputElement;
  secondaryInput.type = 'checkbox';
  secondaryInput.name = 'collapse-secondary-sections';
  secondaryInput.dataset.testid = 'settings-collapse-secondary';
  const secondaryCopy = node('span', 'settings-choice-copy');
  secondaryCopy.append(
    node('strong', undefined, 'Collapse recent activity by default'),
    node('span', 'muted', 'Keep the historical activity list out of the initial operational scan.'),
  );
  secondary.append(secondaryInput, secondaryCopy);

  const repositoryField = node('label', 'settings-select-field');
  repositoryField.append(
    node('strong', undefined, 'Default repository'),
    node('span', 'muted', 'Use All repositories or begin with one observed repository.'),
  );
  const repository = node('select', 'settings-select') as HTMLSelectElement;
  repository.name = 'default-repository';
  repository.dataset.testid = 'settings-default-repository';
  const all = node('option', undefined, 'All repositories') as HTMLOptionElement;
  all.value = '';
  repository.append(all);
  for (const item of repositories) {
    const option = node('option', undefined, `${item.owner}/${item.name}`) as HTMLOptionElement;
    option.value = String(item.id);
    repository.append(option);
  }
  repositoryField.append(repository);

  const actions = node('div', 'settings-actions');
  const save = node('button', 'primary-button', 'Save preferences') as HTMLButtonElement;
  save.type = 'submit';
  save.dataset.testid = 'settings-save';
  const status = node('span', 'settings-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  actions.append(save, status);

  form.append(windowGroup, previewGroup, densityGroup, secondary, repositoryField, actions);
  main.append(form);

  let current = loaded;
  const setChecked = (name: string, value: string) => {
    const input = form.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  };
  const apply = (next: LoadedDashboardSettings) => {
    current = next;
    setChecked('default-window', next.settings.defaultWindow);
    setChecked('preview-size', String(next.settings.previewSize));
    setChecked('density', next.settings.density);
    secondaryInput.checked = next.settings.collapseSecondarySections;
    const repositoryValue = next.settings.defaultRepositoryId === null ? '' : String(next.settings.defaultRepositoryId);
    if (repositoryValue && ![...repository.options].some((option) => option.value === repositoryValue)) {
      const unavailable = node('option', undefined, `Repository ${repositoryValue}`) as HTMLOptionElement;
      unavailable.value = repositoryValue;
      repository.append(unavailable);
    }
    repository.value = repositoryValue;
  };
  apply(loaded);

  const selected = (name: string): string => form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input: DashboardSettingsInputV1 = {
      defaultWindow: selected('default-window') as DashboardSettingsInputV1['defaultWindow'],
      previewSize: Number(selected('preview-size')) as PreviewSize,
      density: selected('density') as DashboardDensityV1,
      collapseSecondarySections: secondaryInput.checked,
      defaultRepositoryId: repository.value ? Number(repository.value) : null,
    };
    save.disabled = true;
    status.className = 'settings-status';
    status.textContent = 'Saving…';
    void handlers.save(input, current.etag).then((saved) => {
      apply(saved);
      status.classList.add('is-success');
      status.textContent = 'Preferences saved.';
    }).catch(async (error) => {
      if (error instanceof SettingsConflictError) {
        status.textContent = 'Settings changed elsewhere. Loading the latest values…';
        try {
          const latest = await handlers.reload();
          apply(latest);
          status.classList.add('is-warning');
          status.textContent = 'Settings changed elsewhere. The latest saved values are shown; review and reapply your changes.';
        } catch {
          status.classList.add('is-error');
          status.textContent = 'Settings changed elsewhere, but the latest values could not be loaded. Try again.';
        }
        return;
      }
      status.classList.add('is-error');
      if (error instanceof SettingsRequestError && error.status === 403) {
        status.textContent = 'Preferences were rejected by the deployment origin check. Reload Spark from its published URL and try again. Your form values are unchanged.';
      } else if (error instanceof SettingsRequestError && error.status === 404) {
        status.textContent = 'The selected default repository is no longer available to this session. Choose All observed repositories and try again.';
      } else if (error instanceof SettingsRequestError && error.status === 400) {
        status.textContent = `Preferences were rejected by settings validation${error.reason ? ` (${error.reason})` : ''}. Reload the page and try again. Your form values are unchanged.`;
      } else if (error instanceof SettingsRequestError) {
        status.textContent = `Preferences could not be saved because the settings service returned ${error.status}. Your form values are unchanged.`;
      } else {
        status.textContent = 'Preferences could not be saved because the settings service could not be reached. Your form values are unchanged.';
      }
    }).finally(() => {
      save.disabled = false;
    });
  });

  return main;
}
