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

function feedbackControls(
  transition: NotableTransitionV1,
  saved: TrajectoryFeedbackV1 | undefined,
  saveFeedback: SaveStoryFeedback,
): HTMLElement {
  const controls = node('div', 'pr-feedback');
  controls.dataset.testid = 'transition-feedback';
  controls.append(node('span', 'pr-feedback-question', 'Was this useful?'));

  const options = node('div', 'pr-feedback-options');
  const buttons: HTMLButtonElement[] = [];
  for (const option of FEEDBACK_OPTIONS) {
    const button = node('button', 'pr-feedback-option', option.label) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.classification = option.value;
    button.setAttribute('aria-pressed', String(saved?.classification === option.value));
    if (saved?.classification === option.value) button.classList.add('is-selected');
    buttons.push(button);
    options.append(button);
  }
  controls.append(options);

  const context = node('details', 'pr-feedback-context');
  context.append(node('summary', undefined, saved?.note ? 'Edit optional context' : 'Add optional context'));
  const note = node('textarea') as HTMLTextAreaElement;
  note.maxLength = 500;
  note.rows = 2;
  note.placeholder = 'What made this useful or inaccurate? (500 characters max)';
  note.setAttribute('aria-label', 'Optional feedback context');
  note.value = saved?.note ?? '';
  context.append(note);
  controls.append(context);

  const status = node('span', 'pr-feedback-status', saved ? 'Feedback saved' : '');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  controls.append(status);

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const classification = button.dataset.classification as TrajectoryFeedbackClassificationV1;
      const noteValue = note.value.trim();
      for (const item of buttons) item.disabled = true;
      status.textContent = 'Saving feedback…';
      void saveFeedback(transition.id, {
        classification,
        ...(noteValue ? { note: noteValue } : {}),
      }).then((result) => {
        for (const item of buttons) {
          const selected = item.dataset.classification === result.classification;
          item.classList.toggle('is-selected', selected);
          item.setAttribute('aria-pressed', String(selected));
        }
        note.value = result.note ?? '';
        status.textContent = `Saved as ${FEEDBACK_OPTIONS.find(item => item.value === result.classification)?.label ?? 'feedback'}`;
      }).catch(() => {
        status.textContent = 'Feedback could not be saved. Try again.';
      }).finally(() => {
        for (const item of buttons) item.disabled = false;
      });
    });
  }
  return controls;
}

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

function storyKindLabel(item: ChangeStoryNode): string {
  if (item.kind === 'INITIAL') return 'Initial';
  if (item.kind === 'LATEST') return 'Latest';
  if (item.kind === 'TRANSITION') return item.latest ? 'Notable transition · Latest' : 'Notable transition';
  return item.lifecycle.state === 'MERGED' ? 'Merge outcome' : 'Close outcome';
}

function connector(item: ChangeStoryNode): HTMLElement | undefined {
  if (item.kind === 'INITIAL' || item.elapsedMs <= 0) return undefined;
  const row = node('div', 'change-story-connector');
  row.setAttribute('aria-label', `${formatStoryDuration(item.elapsedMs)} later`);
  row.append(node('span', 'change-story-connector-line'), node('span', 'change-story-connector-time', `${formatStoryDuration(item.elapsedMs)} later`));
  return row;
}

function runLink(run: EvaluationSummaryV1, href: string): HTMLAnchorElement {
  const link = node('a', 'change-story-run-link', `Open evaluation ${shortSha(run.headSha)}`) as HTMLAnchorElement;
  link.href = href;
  link.dataset.routerLink = 'true';
  return link;
}

function transitionCard(
  item: ChangeStoryTransitionNode,
  detail: PullRequestTrajectoryV1,
  options: ChangeStoryRenderOptions,
): HTMLElement {
  const card = node('article', `change-story-card change-story-transition change-story-${item.transition.severity.toLowerCase()}`);
  card.dataset.testid = 'notable-transition';
  card.dataset.transitionId = item.transition.id;

  const top = node('div', 'change-story-card-top');
  const meta = node('div', 'change-story-card-meta');
  meta.append(node('span', 'change-story-kind', storyKindLabel(item)));
  const attention = attentionBadge(item.attention);
  if (attention) meta.append(attention);
  const health = healthLabel(item.evidenceHealth);
  if (health) meta.append(node('span', 'change-story-health', health));
  const time = node('time', 'change-story-time', `${relativeTime(item.at)} ago`);
  time.dateTime = item.at;
  top.append(meta, time);
  card.append(top, node('h3', undefined, item.headline));

  if (item.causes.length) {
    const causes = node('ul', 'change-story-causes');
    for (const cause of item.causes) causes.append(node('li', undefined, cause));
    card.append(causes);
  }

  if (item.run) card.append(runLink(item.run, options.observationHref(item.run)));
  if (item.transition.severity === 'MATERIAL' && options.saveFeedback) {
    card.append(feedbackControls(
      item.transition,
      detail.feedback?.find((feedback) => feedback.transitionId === item.transition.id),
      options.saveFeedback,
    ));
  }
  return card;
}

function observationCard(item: Extract<ChangeStoryNode, { kind: 'INITIAL' | 'LATEST' }>, options: ChangeStoryRenderOptions): HTMLElement {
  const card = node('article', `change-story-card change-story-observation change-story-${item.kind.toLowerCase()}`);
  const top = node('div', 'change-story-card-top');
  const meta = node('div', 'change-story-card-meta');
  meta.append(node('span', 'change-story-kind', storyKindLabel(item)));
  const attention = attentionBadge(item.attention);
  if (attention) meta.append(attention);
  const health = healthLabel(item.evidenceHealth);
  if (health) meta.append(node('span', 'change-story-health', health));
  const time = node('time', 'change-story-time', `${relativeTime(item.at)} ago`);
  time.dateTime = item.at;
  top.append(meta, time);
  card.append(top, node('h3', undefined, item.headline));

  const detail = node('p', 'change-story-copy', item.detail);
  const evidence = evidenceLabel(item.run.evidenceSummary);
  if (evidence && evidence !== item.detail) detail.append(document.createTextNode(` · ${evidence}`));
  card.append(detail, runLink(item.run, options.observationHref(item.run)));
  return card;
}

function terminalCard(item: ChangeStoryTerminalNode): HTMLElement {
  const card = node('article', `change-story-card change-story-terminal change-story-terminal-${item.lifecycle.state.toLowerCase()}`);
  card.dataset.testid = 'lifecycle-terminal';

  const top = node('div', 'change-story-card-top');
  const meta = node('div', 'change-story-card-meta');
  meta.append(node('span', 'change-story-kind', storyKindLabel(item)));
  if (item.lifecycle.state === 'MERGED') {
    meta.append(node('strong', 'change-story-lifecycle-state', `Merged${item.attention ? ` · ${item.attention}` : ''}`));
  } else {
    meta.append(node('strong', 'change-story-lifecycle-state', 'Closed'));
  }
  const time = node('time', 'change-story-time', `${relativeTime(item.at)} ago`);
  time.dateTime = item.at;
  top.append(meta, time);
  card.append(top, node('h3', undefined, item.headline), node('p', 'change-story-copy', item.detail));

  if (item.lifecycle.state === 'MERGED' && item.lifecycle.unresolvedAtMerge !== undefined) {
    card.append(node(
      'span',
      item.lifecycle.unresolvedAtMerge ? 'pr-terminal-status is-unresolved' : 'pr-terminal-status is-resolved',
      item.lifecycle.unresolvedAtMerge ? 'Unresolved at merge' : 'Clear at merge',
    ));
  }
  return card;
}

function storyCard(item: ChangeStoryNode, detail: PullRequestTrajectoryV1, options: ChangeStoryRenderOptions): HTMLElement {
  if (item.kind === 'TRANSITION') return transitionCard(item, detail, options);
  if (item.kind === 'TERMINAL') return terminalCard(item);
  return observationCard(item, options);
}

export function renderChangeStory(detail: PullRequestTrajectoryV1, options: ChangeStoryRenderOptions): HTMLElement {
  const story = deriveChangeStory(detail);
  const section = node('section', 'change-story');
  section.dataset.testid = 'change-story';

  const heading = node('div', 'change-story-heading');
  const copy = node('div');
  copy.append(node('p', 'pr-section-kicker', 'CHANGE STORY'), node('h2', undefined, 'Change story'));
  const summary = node('p', 'change-story-summary');
  summary.append(document.createTextNode(`${story.retainedEvaluations} evaluation${story.retainedEvaluations === 1 ? '' : 's'} · ${detail.summary.totalTransitions} notable transition${detail.summary.totalTransitions === 1 ? '' : 's'}`));
  if (story.collapsedEvaluations > 0) summary.append(document.createTextNode(` · ${story.collapsedEvaluations} unchanged evaluation${story.collapsedEvaluations === 1 ? '' : 's'} collapsed`));
  copy.append(summary);
  heading.append(copy);

  if (story.partialHistory || story.truncated) {
    const history = story.truncated
      ? 'Story is based on the retained trajectory window; older evaluations are not shown.'
      : 'Story includes reconstructed historical evaluations where full transition detail is unavailable.';
    heading.append(node('span', 'change-story-history-note', history));
  }
  section.append(heading);

  const list = node('ol', 'change-story-list');
  list.setAttribute('aria-label', 'Pull request change story');
  for (const item of story.nodes) {
    const listItem = node('li', `change-story-item change-story-item-${item.kind.toLowerCase()}`);
    listItem.dataset.storyKind = item.kind;
    const gap = connector(item);
    if (gap) listItem.append(gap);
    listItem.append(storyCard(item, detail, options));
    list.append(listItem);
  }
  section.append(list);
  return section;
}
