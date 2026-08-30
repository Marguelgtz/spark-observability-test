import type {
  BehaviorBoundaryV1,
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

function behaviorEventLabel(value: BehaviorBoundaryV1['kinds'][number]): string {
  const labels: Record<BehaviorBoundaryV1['kinds'][number], string> = {
    ATTENTION_UP: 'Attention increased',
    ATTENTION_DOWN: 'Attention decreased',
    EVIDENCE_WORSE: 'Evidence regressed',
    EVIDENCE_BETTER: 'Evidence recovered',
    SENSITIVE_SURFACE_ADDED: 'Sensitive surface added',
    SCOPE_EXPANDED: 'Change scope expanded',
  };
  return labels[value];
}

function attention(label: string, value: ChangeBehaviorV1['initialAttention']): HTMLElement {
  const item = node('div', 'behavior-attention-state');
  item.append(
    node('span', 'behavior-attention-label', label),
    node('strong', `behavior-attention-value attention-${value.toLowerCase()}`, value),
  );
  return item;
}

function attentionJourney(behavior: ChangeBehaviorV1): HTMLElement {
  const journey = node('div', 'behavior-attention-journey');
  journey.dataset.testid = 'behavior-attention-journey';
  journey.setAttribute(
    'aria-label',
    `Attention started ${behavior.initialAttention}, peaked ${behavior.peakAttention}, and is now ${behavior.finalAttention}`,
  );
  journey.append(
    attention('Initial', behavior.initialAttention),
    node('span', 'behavior-attention-arrow', '→'),
    attention('Peak', behavior.peakAttention),
    node('span', 'behavior-attention-arrow', '→'),
    attention('Latest', behavior.finalAttention),
  );
  return journey;
}

function fact(label: string, value: string, emphasis?: string): HTMLElement {
  const item = node('div', `behavior-fact${emphasis ? ` is-${emphasis}` : ''}`);
  item.append(node('span', 'behavior-fact-label', label), node('strong', undefined, value));
  return item;
}

function boundaryElapsed(previousAt: string, occurredAt: string): string {
  const elapsed = Math.max(0, Date.parse(occurredAt) - Date.parse(previousAt));
  return duration(elapsed);
}

function boundaryRail(behavior: ChangeBehaviorV1): HTMLElement {
  const section = node('div', 'behavior-boundaries');
  section.append(
    node('div', 'behavior-subheading', 'Observed journey'),
    node('p', 'behavior-copy', 'Each marker is one material or informational evaluation boundary. Events observed together stay grouped.'),
  );

  if (!behavior.boundaries.length) {
    section.append(node('div', 'behavior-stable-boundary', 'No notable behavior boundaries were observed in retained history.'));
    return section;
  }

  const rail = node('div', 'behavior-boundary-rail');
  behavior.boundaries.forEach((boundary, index) => {
    const item = node('article', `behavior-boundary is-${boundary.severity.toLowerCase()}`);
    const marker = node('div', 'behavior-boundary-marker', String(index + 1));
    marker.setAttribute('aria-hidden', 'true');

    const body = node('div', 'behavior-boundary-body');
    const meta = node('div', 'behavior-boundary-meta');
    const previousAt = index === 0 ? behavior.startedAt : behavior.boundaries[index - 1].occurredAt;
    meta.append(
      node('span', 'behavior-boundary-severity', boundary.severity === 'MATERIAL' ? 'Material boundary' : 'Informational boundary'),
      node('span', 'behavior-boundary-elapsed', `+${boundaryElapsed(previousAt, boundary.occurredAt)}`),
    );

    const events = node('div', 'behavior-boundary-events');
    for (const kind of boundary.kinds) {
      events.append(node('span', `behavior-event behavior-event-${kind.toLowerCase().replaceAll('_', '-')}`, behaviorEventLabel(kind)));
    }
    body.append(meta, events);
    item.append(marker, body);
    rail.append(item);
  });
  section.append(rail);
  return section;
}

function archetypeCards(behavior: ChangeBehaviorV1): HTMLElement | undefined {
  if (!behavior.archetypes.length) return undefined;
  const section = node('div', 'behavior-archetype-section');
  section.append(node('div', 'behavior-subheading', 'Behavior shape'));
  const cards = node('div', 'behavior-archetypes');
  for (const archetype of behavior.archetypes) {
    const card = node('div', `behavior-archetype is-${archetype.kind.toLowerCase()}`);
    card.append(node('strong', undefined, humanize(archetype.kind)));
    if (archetype.evidence.length) {
      const evidence = node('ul', 'behavior-archetype-evidence');
      for (const item of archetype.evidence) evidence.append(node('li', undefined, item));
      card.append(evidence);
    }
    cards.append(card);
  }
  section.append(cards);
  return section;
}

function motifs(behavior: ChangeBehaviorV1): HTMLElement | undefined {
  if (!behavior.motifs.length) return undefined;
  const section = node('div', 'behavior-motifs');
  section.append(node('div', 'behavior-subheading', 'Behavior motifs'));
  for (const motif of behavior.motifs) {
    const row = node('div', 'behavior-motif');
    const copy = node('div');
    copy.append(
      node('strong', undefined, humanize(motif.kind)),
      node('span', undefined, `${motif.transitionIds.length} observed boundaries`),
    );
    row.append(copy, node('span', 'behavior-motif-duration', duration(motif.durationMs)));
    section.append(row);
  }
  return section;
}

function behaviorPanel(behavior: ChangeBehaviorV1): HTMLElement {
  const section = node('details', 'behavior-panel pr-depth-disclosure') as HTMLDetailsElement;
  section.dataset.testid = 'change-behavior';

  const disclosureSummary = node('summary', 'behavior-disclosure-summary');
  const heading = node('div', 'behavior-heading');
  const headingCopy = node('div');
  headingCopy.append(
    node('p', 'eyebrow', 'CHANGE BEHAVIOR'),
    node('h3', undefined, 'Observed behavior'),
    node('p', 'behavior-copy', 'Inspect the deterministic journey, patterns, and retained-history diagnostics.'),
  );
  heading.append(headingCopy);
  if (behavior.truncated || behavior.historyCompleteness === 'PARTIAL_BACKFILL') {
    heading.append(node('span', 'behavior-completeness', behavior.truncated ? 'Partial retained history' : 'Backfilled history'));
  }
  disclosureSummary.append(heading, node('span', 'behavior-disclosure-action', 'Show behavior details'));
  section.addEventListener('toggle', () => {
    const action = section.querySelector<HTMLElement>('.behavior-disclosure-action');
    if (action) action.textContent = section.open ? 'Hide behavior details' : 'Show behavior details';
  });
  const disclosureBody = node('div', 'behavior-disclosure-body');
  disclosureBody.append(attentionJourney(behavior));

  const layout = node('div', 'behavior-layout');
  const primary = node('div', 'behavior-layout-primary');
  primary.append(boundaryRail(behavior));

  const secondary = node('aside', 'behavior-layout-secondary');
  const facts = node('div', 'behavior-facts');
  facts.append(
    fact('Evaluations', String(behavior.features.evaluationCount)),
    fact('Notable boundaries', String(behavior.features.notableBoundaryCount)),
    fact('Regressions', String(behavior.features.evidenceRegressionCount), behavior.features.evidenceRegressionCount > 0 ? 'negative' : undefined),
    fact('Recoveries', String(behavior.features.evidenceRecoveryCount), behavior.features.evidenceRecoveryCount > 0 ? 'positive' : undefined),
    fact('Observed time HIGH', duration(behavior.features.timeAtHighMs), behavior.features.timeAtHighMs > 0 ? 'negative' : undefined),
    fact('Scope expansions', String(behavior.features.scopeExpansionCount)),
  );
  secondary.append(facts);

  const shape = archetypeCards(behavior);
  if (shape) secondary.append(shape);
  const motifSection = motifs(behavior);
  if (motifSection) secondary.append(motifSection);

  layout.append(primary, secondary);
  disclosureBody.append(layout);

  const signatures = node('details', 'behavior-signatures');
  const summary = node('summary', undefined, 'Inspect deterministic signatures');
  const body = node('div', 'behavior-signature-body');
  body.append(
    node('span', undefined, 'Full behavior'),
    node('code', undefined, behavior.signatures.full),
    node('span', undefined, 'Attention path'),
    node('code', undefined, behavior.signatures.attention),
  );
  signatures.append(summary, body);
  disclosureBody.append(signatures);
  section.append(disclosureSummary, disclosureBody);
  return section;
}

export function enhancePullRequestWithBehavior(root: HTMLElement, behavior: ChangeBehaviorV1): HTMLElement {
  if (root.querySelector('[data-testid="change-behavior"]')) return root;
  const page = root.querySelector<HTMLElement>('[data-testid="pull-request-detail"]');
  if (!page) return root;
  const panel = behaviorPanel(behavior);
  const forensics = page.querySelector<HTMLElement>('[data-testid="pr-forensics"]');
  if (forensics) forensics.insertAdjacentElement('beforebegin', panel);
  else page.append(panel);
  return root;
}

function totalOutcomes(outcomes: BehaviorOutcomeCountsV1): number {
  return outcomes.resolvedBeforeMerge
    + outcomes.mergedUnresolved
    + outcomes.outcomeUnavailable
    + outcomes.closedWithoutMerge
    + outcomes.open;
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

function outcomeBar(outcomes: BehaviorOutcomeCountsV1): HTMLElement {
  const bar = node('div', 'behavior-outcome-bar');
  const total = Math.max(1, totalOutcomes(outcomes));
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', outcomeText(outcomes));
  const segments: Array<[string, number, string]> = [
    ['resolved', outcomes.resolvedBeforeMerge, 'Resolved before merge'],
    ['unresolved', outcomes.mergedUnresolved, 'Merged unresolved'],
    ['unavailable', outcomes.outcomeUnavailable, 'Outcome unavailable'],
    ['open', outcomes.open, 'Open'],
    ['closed', outcomes.closedWithoutMerge, 'Closed without merge'],
  ];
  for (const [kind, count, label] of segments) {
    if (!count) continue;
    const segment = node('span', `behavior-outcome-segment is-${kind}`);
    segment.style.width = `${Math.max(3, (count / total) * 100)}%`;
    segment.title = `${label}: ${count}`;
    bar.append(segment);
  }
  return bar;
}

function exampleHref(pattern: BehaviorPatternV1, index: number, state: ActivityUrlState): string {
  const example = pattern.examples[index];
  const search = serializeActivityState({ ...state, attention: 'ALL', query: undefined, favoritesOnly: false, cursor: null });
  const path = `/app/repositories/${example.repository.id}/pulls/${example.pullRequest.number}`;
  return `${path}${search ? `?${search}` : ''}`;
}

function exampleOutcome(outcome: BehaviorPatternV1['examples'][number]['outcome']): string {
  const labels: Record<BehaviorPatternV1['examples'][number]['outcome'], string> = {
    RESOLVED_BEFORE_MERGE: 'resolved',
    MERGED_UNRESOLVED: 'unresolved',
    OUTCOME_UNAVAILABLE: 'outcome unavailable',
    CLOSED_WITHOUT_MERGE: 'closed',
    OPEN: 'open',
  };
  return labels[outcome];
}

function patternRow(pattern: BehaviorPatternV1, state: ActivityUrlState, observedPRs: number): HTMLElement {
  const row = node('article', 'behavior-pattern');
  row.dataset.patternKind = pattern.kind;

  const top = node('div', 'behavior-pattern-top');
  const copy = node('div');
  copy.append(
    node('strong', 'behavior-pattern-title', pattern.label),
    node('span', 'behavior-pattern-frequency', `${pattern.occurrences} occurrence${pattern.occurrences === 1 ? '' : 's'} across ${pattern.affectedPRs} PR${pattern.affectedPRs === 1 ? '' : 's'}`),
  );
  top.append(copy, node('span', 'behavior-pattern-kind', pattern.kind === 'MOTIF' ? 'Motif' : 'Exact signature'));
  row.append(top);

  const prevalence = node('div', 'behavior-prevalence');
  const percent = observedPRs ? Math.round((pattern.affectedPRs / observedPRs) * 100) : 0;
  const prevalenceCopy = node('div', 'behavior-prevalence-copy');
  prevalenceCopy.append(node('span', undefined, 'Observed PR prevalence'), node('strong', undefined, `${percent}%`));
  const meter = node('div', 'behavior-prevalence-meter');
  const fill = node('span', 'behavior-prevalence-fill');
  fill.style.width = `${Math.min(100, percent)}%`;
  meter.append(fill);
  prevalence.append(prevalenceCopy, meter);
  row.append(prevalence, outcomeBar(pattern.outcomes), node('p', 'behavior-pattern-outcomes', outcomeText(pattern.outcomes)));

  if (pattern.repositories.length > 1) {
    const repositories = node('div', 'behavior-pattern-repositories');
    repositories.append(node('span', 'behavior-example-label', 'Repository spread'));
    for (const item of pattern.repositories.slice(0, 3)) {
      repositories.append(node('span', 'behavior-repository-chip', `${item.repository.owner}/${item.repository.name} · ${item.affectedPRs} PR${item.affectedPRs === 1 ? '' : 's'}`));
    }
    row.append(repositories);
  }

  if (pattern.examples.length) {
    const examples = node('div', 'behavior-pattern-examples');
    examples.append(node('span', 'behavior-example-label', 'Examples'));
    pattern.examples.forEach((example, index) => {
      const link = node('a', 'behavior-example-link') as HTMLAnchorElement;
      link.href = exampleHref(pattern, index, state);
      link.dataset.routerLink = 'true';
      if (example.truncated) link.title = 'Example has partial retained history';
      link.append(
        node('strong', undefined, `${example.repository.owner}/${example.repository.name} #${example.pullRequest.number}`),
        node('span', undefined, `${example.occurrences}× · ${exampleOutcome(example.outcome)}`),
      );
      examples.append(link);
    });
    row.append(examples);
  }

  if (pattern.signature) {
    const signature = node('details', 'behavior-pattern-signature');
    signature.append(node('summary', undefined, 'Inspect exact signature'), node('code', undefined, pattern.signature));
    row.append(signature);
  }
  return row;
}

function patternSummary(response: BehaviorPatternsResponseV1): HTMLElement {
  const motifs = response.patterns.filter((pattern) => pattern.kind === 'MOTIF');
  const signatures = response.patterns.filter((pattern) => pattern.kind === 'SIGNATURE');
  const affected = new Set(response.patterns.flatMap((pattern) => pattern.examples.map((example) => `${example.repository.id}:${example.pullRequest.number}`)));
  const strip = node('div', 'behavior-pattern-summary');
  strip.append(
    fact('Observed PRs', String(response.observedPRs)),
    fact('Recurring motifs', String(motifs.length)),
    fact('Exact signatures', String(signatures.length)),
    fact('Example PRs', String(affected.size)),
  );
  return strip;
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
    node('p', 'eyebrow', 'CHANGE BEHAVIOR'),
    node('h2', undefined, 'Recurring behaviors'),
    node('p', 'behavior-copy', `Behavior shapes observed across ${response.observedPRs} pull request${response.observedPRs === 1 ? '' : 's'} in the selected ${response.selectedWindow} window.`),
  );
  section.append(heading, patternSummary(response));

  const motifs = response.patterns.filter((pattern) => pattern.kind === 'MOTIF');
  const signatures = response.patterns.filter((pattern) => pattern.kind === 'SIGNATURE');
  if (!motifs.length && !signatures.length) {
    section.append(node('p', 'behavior-empty', 'No recurring behavior patterns were observed in this window.'));
    root.append(section);
    return root;
  }

  if (motifs.length) {
    const motifHeading = node('div', 'behavior-pattern-group-heading');
    motifHeading.append(node('h3', undefined, 'Recurring motifs'), node('span', undefined, `${motifs.length} observed`));
    section.append(motifHeading);
    const list = node('div', 'behavior-pattern-list');
    for (const pattern of motifs) list.append(patternRow(pattern, state, response.observedPRs));
    section.append(list);
  }

  if (signatures.length) {
    const details = node('details', 'behavior-exact-signatures');
    details.append(node('summary', undefined, `Exact trajectory signatures (${signatures.length})`));
    const explanation = node('p', 'behavior-copy', 'Exact signatures preserve the complete grouped boundary sequence and are useful for forensic comparison.');
    const signatureList = node('div', 'behavior-pattern-list');
    for (const pattern of signatures) signatureList.append(patternRow(pattern, state, response.observedPRs));
    details.append(explanation, signatureList);
    section.append(details);
  }
  root.append(section);
  return root;
}
