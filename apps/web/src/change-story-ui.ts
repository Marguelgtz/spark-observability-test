import type {
  EvaluationSummaryV1,
  NotableTransitionV1,
  PullRequestTrajectoryV1,
  SaveTrajectoryFeedbackV1,
  TrajectoryFeedbackClassificationV1,
  TrajectoryFeedbackV1,
} from '@spark/dashboard-contracts';
import { evidenceLabel, relativeTime, shortSha } from './format';
import {
  deriveChangeStory,
  formatStoryDuration,
  type ChangeStoryNode,
  type ChangeStoryTerminalNode,
  type ChangeStoryTransitionNode,
} from './insights/change-story';
import './change-story.css';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export type SaveStoryFeedback = (
  transitionId: string,
  input: SaveTrajectoryFeedbackV1,
) => Promise<TrajectoryFeedbackV1>;

export interface ChangeStoryRenderOptions {
  observationHref(run: EvaluationSummaryV1): string;
  saveFeedback?: SaveStoryFeedback;
}

const FEEDBACK_OPTIONS: Array<{ value: TrajectoryFeedbackClassificationV1; label: string }> = [
  { value: 'USEFUL', label: 'Useful' },
  { value: 'EXPECTED', label: 'Expected' },
  { value: 'FALSE_POSITIVE', label: 'False positive' },
  { value: 'FIXED_BECAUSE_SPARK', label: 'Fixed because of Spark' },
];

function attentionBadge(attention: string | undefined): HTMLElement | undefined {
  if (!attention) return undefined;
  return node('span', `attention attention-${attention.toLowerCase()}`, attention);
}

function healthLabel(health: ChangeStoryNode['evidenceHealth']): string | undefined {
  if (!health) return undefined;
  if (health === 'CLEAR') return 'Evidence clear';
  if (health === 'FAILED') return 'Evidence failed';
  if (health === 'PENDING_OR_MISSING') return 'Evidence pending / missing';
  return 'Evidence unknown';
}

function momentKindLabel(item: ChangeStoryNode): string {
  if (item.kind === 'TERMINAL') return item.lifecycle.state === 'MERGED' ? 'Merge outcome' : 'Close outcome';
  if (item.kind === 'TRANSITION') return item.latest ? 'Latest change' : 'Change';
  if (item.kind === 'LATEST') return 'Latest';
  return 'Initial';
}

function connector(item: ChangeStoryNode): HTMLElement | undefined {
  if (item.kind === 'INITIAL' || item.elapsedMs <= 0) return undefined;
  const row = node('div', 'change-story-connector');
  row.setAttribute('aria-label', `${formatStoryDuration(item.elapsedMs)} later`);
  row.append(node('span', 'change-story-connector-line'), node('span', 'change-story-connector-time', formatStoryDuration(item.elapsedMs)));
  return row;
}

function runLink(run: EvaluationSummaryV1, href: string): HTMLAnchorElement {
  const link = node('a', 'change-story-run-link', shortSha(run.headSha)) as HTMLAnchorElement;
  link.href = href;
  link.dataset.routerLink = 'true';
  link.setAttribute('aria-label', `Open evaluation ${shortSha(run.headSha)}`);
  link.title = `Open evaluation ${shortSha(run.headSha)}`;
  return link;
}

function feedbackTriggerState(button: HTMLButtonElement, saved: TrajectoryFeedbackV1 | undefined): void {
  const savedState = Boolean(saved);
  button.classList.toggle('is-saved', savedState);
  button.textContent = savedState ? '✓' : '✎';
  const label = savedState ? 'Edit Spark feedback on this transition' : 'Give Spark feedback on this transition';
  button.setAttribute('aria-label', label);
  button.dataset.tooltip = label;
}

function openFeedbackDrawer(
  host: HTMLElement,
  item: ChangeStoryTransitionNode,
  saved: TrajectoryFeedbackV1 | undefined,
  saveFeedback: SaveStoryFeedback,
  trigger: HTMLButtonElement,
  onSaved: (result: TrajectoryFeedbackV1) => void,
): void {
  host.querySelector<HTMLElement>('.change-story-feedback-layer')?.remove();

  const layer = node('div', 'change-story-feedback-layer');
  const backdrop = node('div', 'change-story-feedback-backdrop');
  backdrop.setAttribute('aria-hidden', 'true');
  const drawer = node('aside', 'change-story-feedback-drawer');
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-labelledby', 'transition-feedback-title');
  drawer.dataset.testid = 'transition-feedback-drawer';

  const header = node('div', 'change-story-feedback-header');
  const heading = node('div');
  heading.append(node('span', 'change-story-kind', 'TRANSITION FEEDBACK'));
  const title = node('h2', undefined, 'Feedback on this transition');
  title.id = 'transition-feedback-title';
  heading.append(title);
  const closeButton = node('button', 'change-story-feedback-close', '×') as HTMLButtonElement;
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close feedback drawer');
  header.append(heading, closeButton);

  const context = node('div', 'change-story-feedback-summary');
  const contextTop = node('div', 'change-story-feedback-summary-top');
  contextTop.append(node('strong', undefined, item.headline));
  const attention = attentionBadge(item.attention);
  if (attention) contextTop.append(attention);
  context.append(contextTop);
  if (item.causes.length) context.append(node('p', undefined, item.causes.slice(0, 2).join(' · ')));

  const question = node('p', 'change-story-feedback-question', 'How would you classify this transition?');
  const options = node('div', 'change-story-feedback-options');
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', 'Transition feedback classification');
  const buttons: HTMLButtonElement[] = [];
  let selected = saved?.classification;

  const syncSelection = () => {
    for (const button of buttons) {
      const active = button.dataset.classification === selected;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
  };

  for (const option of FEEDBACK_OPTIONS) {
    const button = node('button', 'change-story-feedback-option', option.label) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.classification = option.value;
    button.addEventListener('click', () => {
      selected = option.value;
      syncSelection();
      saveButton.disabled = false;
    });
    buttons.push(button);
    options.append(button);
  }
  syncSelection();

  const noteLabel = node('label', 'change-story-feedback-note-label', 'Optional context');
  const note = node('textarea', 'change-story-feedback-note') as HTMLTextAreaElement;
  note.maxLength = 500;
  note.rows = 4;
  note.placeholder = 'What made this useful, expected, or inaccurate?';
  note.setAttribute('aria-label', 'Optional feedback context');
  note.value = saved?.note ?? '';
  noteLabel.append(note);

  const footer = node('div', 'change-story-feedback-footer');
  const status = node('span', 'change-story-feedback-status', saved ? 'Feedback saved' : '');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const saveButton = node('button', 'change-story-feedback-save', 'Save feedback') as HTMLButtonElement;
  saveButton.type = 'button';
  saveButton.disabled = !selected;
  footer.append(status, saveButton);

  drawer.append(header, context, question, options, noteLabel, footer);
  layer.append(backdrop, drawer);
  host.append(layer);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    layer.remove();
    trigger.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeyDown);
  backdrop.addEventListener('click', close);
  closeButton.addEventListener('click', close);

  saveButton.addEventListener('click', () => {
    if (!selected) return;
    const noteValue = note.value.trim();
    saveButton.disabled = true;
    for (const button of buttons) button.disabled = true;
    status.textContent = 'Saving feedback…';
    void saveFeedback(item.transition.id, {
      classification: selected,
      ...(noteValue ? { note: noteValue } : {}),
    }).then((result) => {
      selected = result.classification;
      note.value = result.note ?? '';
      syncSelection();
      status.textContent = `Saved as ${FEEDBACK_OPTIONS.find((option) => option.value === result.classification)?.label ?? 'feedback'}`;
      onSaved(result);
    }).catch(() => {
      status.textContent = 'Feedback could not be saved. Try again.';
    }).finally(() => {
      for (const button of buttons) button.disabled = false;
      saveButton.disabled = !selected;
    });
  });

  closeButton.focus();
}

function feedbackTrigger(
  host: HTMLElement,
  item: ChangeStoryTransitionNode,
  detail: PullRequestTrajectoryV1,
  saveFeedback: SaveStoryFeedback,
): HTMLButtonElement {
  let saved = detail.feedback?.find((feedback) => feedback.transitionId === item.transition.id);
  const button = node('button', 'change-story-feedback-trigger') as HTMLButtonElement;
  button.type = 'button';
  button.dataset.testid = 'transition-feedback-trigger';
  button.dataset.transitionId = item.transition.id;
  button.setAttribute('aria-haspopup', 'dialog');
  feedbackTriggerState(button, saved);
  button.addEventListener('click', () => {
    openFeedbackDrawer(host, item, saved, saveFeedback, button, (result) => {
      saved = result;
      feedbackTriggerState(button, saved);
    });
  });
  return button;
}

function compactCauses(causes: string[]): HTMLElement | undefined {
  if (!causes.length) return undefined;
  const wrapper = node('div', 'change-story-causes');
  wrapper.append(node('p', undefined, causes.slice(0, 2).join(' · ')));
  if (causes.length > 2) {
    const details = node('details', 'change-story-more');
    details.append(node('summary', undefined, `+${causes.length - 2} more`));
    const list = node('ul');
    for (const cause of causes.slice(2)) list.append(node('li', undefined, cause));
    details.append(list);
    wrapper.append(details);
  }
  return wrapper;
}

function momentShell(item: ChangeStoryNode): { row: HTMLElement; body: HTMLElement; meta: HTMLElement; actions: HTMLElement } {
  const row = node('article', `change-story-moment change-story-moment-${item.kind.toLowerCase()}`);
  const marker = node('span', 'change-story-marker');
  marker.setAttribute('aria-hidden', 'true');
  const body = node('div', 'change-story-moment-body');
  const meta = node('div', 'change-story-moment-meta');
  meta.append(node('span', 'change-story-kind', momentKindLabel(item)));
  const attention = attentionBadge(item.attention);
  if (attention) meta.append(attention);
  const health = healthLabel(item.evidenceHealth);
  if (health) meta.append(node('span', 'change-story-health', health));
  const actions = node('div', 'change-story-moment-actions');
  const time = node('time', 'change-story-time', `${relativeTime(item.at)} ago`);
  time.dateTime = item.at;
  actions.append(time);
  row.append(marker, body, actions);
  return { row, body, meta, actions };
}

function transitionMoment(
  host: HTMLElement,
  item: ChangeStoryTransitionNode,
  detail: PullRequestTrajectoryV1,
  options: ChangeStoryRenderOptions,
): HTMLElement {
  const { row, body, meta, actions } = momentShell(item);
  row.classList.add(`change-story-${item.transition.severity.toLowerCase()}`);
  row.dataset.testid = 'notable-transition';
  row.dataset.transitionId = item.transition.id;
  body.append(meta, node('h3', undefined, item.headline));
  const causes = compactCauses(item.causes);
  if (causes) body.append(causes);
  if (item.run) actions.append(runLink(item.run, options.observationHref(item.run)));
  if (item.transition.severity === 'MATERIAL' && options.saveFeedback) {
    actions.append(feedbackTrigger(host, item, detail, options.saveFeedback));
  }
  return row;
}

function observationMoment(
  item: Extract<ChangeStoryNode, { kind: 'INITIAL' | 'LATEST' }>,
  options: ChangeStoryRenderOptions,
): HTMLElement {
  const { row, body, meta, actions } = momentShell(item);
  body.append(meta, node('h3', undefined, item.kind === 'INITIAL' ? 'Initial state' : item.headline));
  const copy = node('p', 'change-story-copy', item.detail);
  const evidence = evidenceLabel(item.run.evidenceSummary);
  if (evidence && evidence !== item.detail) copy.append(document.createTextNode(` · ${evidence}`));
  body.append(copy);
  actions.append(runLink(item.run, options.observationHref(item.run)));
  return row;
}

function terminalMoment(item: ChangeStoryTerminalNode): HTMLElement {
  const { row, body, meta, actions } = momentShell(item);
  row.classList.add(`change-story-terminal-${item.lifecycle.state.toLowerCase()}`);
  row.dataset.testid = 'lifecycle-terminal';
  if (item.lifecycle.state === 'MERGED') {
    meta.append(node('strong', 'change-story-lifecycle-state', `Merged${item.attention ? ` · ${item.attention}` : ''}`));
  } else {
    meta.append(node('strong', 'change-story-lifecycle-state', 'Closed'));
  }
  body.append(meta, node('h3', undefined, item.headline), node('p', 'change-story-copy', item.detail));
  if (item.lifecycle.state === 'MERGED' && item.lifecycle.unresolvedAtMerge !== undefined) {
    actions.append(node(
      'span',
      item.lifecycle.unresolvedAtMerge ? 'pr-terminal-status is-unresolved' : 'pr-terminal-status is-resolved',
      item.lifecycle.unresolvedAtMerge ? 'Unresolved at merge' : 'Clear at merge',
    ));
  }
  return row;
}

function renderMoment(
  host: HTMLElement,
  item: ChangeStoryNode,
  detail: PullRequestTrajectoryV1,
  options: ChangeStoryRenderOptions,
): HTMLElement {
  if (item.kind === 'TRANSITION') return transitionMoment(host, item, detail, options);
  if (item.kind === 'TERMINAL') return terminalMoment(item);
  return observationMoment(item, options);
}

export function renderChangeStory(detail: PullRequestTrajectoryV1, options: ChangeStoryRenderOptions): HTMLElement {
  const story = deriveChangeStory(detail);
  const section = node('section', 'change-story');
  section.dataset.testid = 'key-moments';

  const heading = node('div', 'change-story-heading');
  const copy = node('div');
  copy.append(
    node('p', 'pr-section-kicker', 'CHANGE EVOLUTION'),
    node('h2', undefined, 'Key moments'),
    node('p', 'change-story-intro', 'Material changes Spark observed while this pull request evolved.'),
  );
  const summary = node('p', 'change-story-summary');
  summary.append(document.createTextNode(`${story.retainedEvaluations} evaluation${story.retainedEvaluations === 1 ? '' : 's'} · ${detail.summary.totalTransitions} notable transition${detail.summary.totalTransitions === 1 ? '' : 's'}`));
  if (story.collapsedEvaluations > 0) summary.append(document.createTextNode(` · ${story.collapsedEvaluations} unchanged collapsed`));
  copy.append(summary);
  heading.append(copy);

  if (story.partialHistory || story.truncated) {
    const history = story.truncated
      ? 'Based on the retained trajectory window; older evaluations are not shown.'
      : 'Includes reconstructed historical evaluations where full transition detail is unavailable.';
    heading.append(node('span', 'change-story-history-note', history));
  }
  section.append(heading);

  const list = node('ol', 'change-story-list');
  list.setAttribute('aria-label', 'Pull request key moments');
  for (const item of story.nodes) {
    const listItem = node('li', `change-story-item change-story-item-${item.kind.toLowerCase()}`);
    listItem.dataset.storyKind = item.kind;
    const gap = connector(item);
    if (gap) listItem.append(gap);
    listItem.append(renderMoment(section, item, detail, options));
    list.append(listItem);
  }
  section.append(list);
  return section;
}
