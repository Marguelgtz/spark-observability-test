import type {
  BehaviorOutcomeCountsV1,
  BehaviorPatternV1,
  BehaviorPatternsResponseV1,
  ChangeBehaviorV1,
} from '@spark/dashboard-contracts/behavior';
import type { ActivityUrlState } from './state';
import { serializeActivityState } from './state';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function duration(ms: number | undefined): string {
  if (ms === undefined) return 'Unavailable';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function humanize(value: string): string {
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function fact(label: string, value: string): HTMLElement {
  const item = node('div', 'behavior-fact');
  item.append(node('span', 'behavior-fact-label', label), node('strong', undefined, value));
  return item;
}

function behaviorPanel(behavior: ChangeBehaviorV1): HTMLElement {
  const section = node('section', 'behavior-panel');
  section.dataset.testid = 'change-behavior';
  const heading = node('div', 'behavior-heading');
  heading.append(
    node('div', undefined, ''),
  );
  heading.firstElementChild?.append(
    node('p', 'eyebrow', 'BEHAVIOR'),
    node('h3', undefined, 'Observed behavior'),
    node('p', 'behavior-copy', 'Deterministic descriptors derived from this pull request’s retained trajectory.'),
  );
  if (behavior.truncated || behavior.historyCompleteness === 'PARTIAL_BACKFILL') {
    heading.append(node('span', 'behavior-completeness', behavior.truncated ? 'Partial retained history' : 'Backfilled history'));
  }
  section.append(heading);

  const archetypes = node('div', 'behavior-archetypes');
  for (const archetype of behavior.archetypes) {
    const chip = node('span', 'behavior-archetype', humanize(archetype.kind));
    chip.title = archetype.evidence.join(' · ');
    archetypes.append(chip);
  }
  if (archetypes.childElementCount) section.append(archetypes);

  const facts = node('div', 'behavior-facts');
  facts.append(
    fact('Evaluations', String(behavior.features.evaluationCount)),
    fact('Peak attention', behavior.peakAttention),
    fact('Evidence regressions', String(behavior.features.evidenceRegressionCount)),
    fact('Recoveries', String(behavior.features.evidenceRecoveryCount)),
    fact('Observed time HIGH', duration(behavior.features.timeAtHighMs)),
    fact('Notable boundaries', String(behavior.features.notableBoundaryCount)),
  );
  section.append(facts);

  if (behavior.motifs.length) {
    const motifs = node('div', 'behavior-motifs');
    motifs.append(node('h4', undefined, 'Behavior motifs'));
    for (const motif of behavior.motifs) {
      const row = node('div', 'behavior-motif');
      row.append(
        node('strong', undefined, humanize(motif.kind)),
        node('span', undefined, `${duration(motif.durationMs)} · ${motif.transitionIds.length} transition boundaries`),
      );
      motifs.append(row);
    }
    section.append(motifs);
  }

  const signatures = node('details', 'behavior-signatures');
  const summary = node('summary', undefined, 'Behavior signatures');
  const body = node('div', 'behavior-signature-body');
  body.append(
    node('span', undefined, 'Full'),
    node('code', undefined, behavior.signatures.full),
    node('span', undefined, 'Attention'),
    node('code', undefined, behavior.signatures.attention),
  );
  signatures.append(summary, body);
  section.append(signatures);
  return section;
}

export function enhancePullRequestWithBehavior(root: HTMLElement, behavior: ChangeBehaviorV1): HTMLElement {
  if (root.querySelector('[data-testid="change-behavior"]')) return root;
  const trajectoryHeading = [...root.querySelectorAll<HTMLHeadingElement>('h2')]
    .find((heading) => heading.textContent?.trim() === 'Trajectory');
  const trajectorySection = trajectoryHeading?.closest<HTMLElement>('.pr-section');
  if (!trajectorySection) return root;
  const panel = behaviorPanel(behavior);
  const canvas = trajectorySection.querySelector<HTMLElement>('[data-testid="insight-canvas-pr-trajectory"]');
  if (canvas) canvas.insertAdjacentElement('afterend', panel);
  else trajectorySection.append(panel);
  return root;
}

function outcomeText(outcomes: BehaviorOutcomeCountsV1): string {
  const known = outcomes.resolvedBeforeMerge + outcomes.mergedUnresolved;
  const parts = [
    `${known} known merge outcome${known === 1 ? '' : 's'}`,
    `${outcomes.resolvedBeforeMerge} resolved`,
    `${outcomes.mergedUnresolved} unresolved`,
  ];
  if (outcomes.outcomeUnavailable) parts.push(`${outcomes.outcomeUnavailable} unavailable`);
  if (outcomes.open) parts.push(`${outcomes.open} open`);
  if (outcomes.closedWithoutMerge) parts.push(`${outcomes.closedWithoutMerge} closed`);
  return parts.join(' · ');
}

function exampleHref(pattern: BehaviorPatternV1, index: number, state: ActivityUrlState): string {
  const example = pattern.examples[index];
  const search = serializeActivityState({ ...state, attention: 'ALL', query: undefined, favoritesOnly: false, cursor: null });
  const path = `/app/repositories/${example.repository.id}/pulls/${example.pullRequest.number}`;
  return `${path}${search ? `?${search}` : ''}`;
}

function patternRow(pattern: BehaviorPatternV1, state: ActivityUrlState): HTMLElement {
  const row = node('article', 'behavior-pattern');
  row.dataset.patternKind = pattern.kind;
  const top = node('div', 'behavior-pattern-top');
  const copy = node('div');
  copy.append(
    node('strong', 'behavior-pattern-title', pattern.label),
    node('span', 'behavior-pattern-frequency', `${pattern.occurrences} occurrence${pattern.occurrences === 1 ? '' : 's'} across ${pattern.affectedPRs} PR${pattern.affectedPRs === 1 ? '' : 's'}`),
  );
  top.append(copy, node('span', 'behavior-pattern-kind', pattern.kind === 'MOTIF' ? 'Motif' : 'Exact signature'));
  row.append(top, node('p', 'behavior-pattern-outcomes', outcomeText(pattern.outcomes)));

  if (pattern.examples.length) {
    const examples = node('div', 'behavior-pattern-examples');
    examples.append(node('span', 'behavior-example-label', 'Examples'));
    pattern.examples.forEach((example, index) => {
      const link = node('a', 'behavior-example-link', `${example.repository.owner}/${example.repository.name} #${example.pullRequest.number}`) as HTMLAnchorElement;
      link.href = exampleHref(pattern, index, state);
      link.dataset.routerLink = 'true';
      if (example.truncated) link.title = 'Example has partial retained history';
      examples.append(link);
    });
    row.append(examples);
  }
  return row;
}

export function enhanceOverviewWithBehaviorPatterns(
  root: HTMLElement,
  response: BehaviorPatternsResponseV1,
  state: ActivityUrlState,
): HTMLElement {
  if (root.querySelector('[data-testid="recurring-behaviors"]')) return root;
  const section = node('section', 'behavior-patterns');
  section.dataset.testid = 'recurring-behaviors';
  const heading = node('div', 'behavior-patterns-heading');
  heading.append(
    node('p', 'eyebrow', 'BEHAVIOR MVP'),
    node('h2', undefined, 'Recurring behaviors'),
    node('p', 'behavior-copy', `Deterministic motifs and exact trajectory signatures across ${response.observedPRs} observed PR${response.observedPRs === 1 ? '' : 's'}.`),
  );
  section.append(heading);

  const motifs = response.patterns.filter((pattern) => pattern.kind === 'MOTIF');
  const signatures = response.patterns.filter((pattern) => pattern.kind === 'SIGNATURE');
  if (!motifs.length && !signatures.length) {
    section.append(node('p', 'behavior-empty', 'No behavior patterns were observed in this window.'));
    root.append(section);
    return root;
  }

  const list = node('div', 'behavior-pattern-list');
  for (const pattern of motifs) list.append(patternRow(pattern, state));
  section.append(list);

  if (signatures.length) {
    const details = node('details', 'behavior-exact-signatures');
    details.append(node('summary', undefined, `Exact signatures (${signatures.length})`));
    const signatureList = node('div', 'behavior-pattern-list');
    for (const pattern of signatures) signatureList.append(patternRow(pattern, state));
    details.append(signatureList);
    section.append(details);
  }
  root.append(section);
  return root;
}
