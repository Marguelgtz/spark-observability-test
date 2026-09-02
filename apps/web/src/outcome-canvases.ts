import { insightCanvas } from './insight-canvas';
import { donutChart, horizontalBarChart, lineChart, stackedBarChart, type NamedValue } from './insight-charts';
import type { NotableTransitionInsightsV1, OverviewDrilldownResponseV1 } from './overview-api';
import { outcomeOverview } from './outcome-types';
import type { ActivityUrlState } from './state';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function mergeComposition(resolved: number, unresolved: number, unavailable: number): NamedValue[] {
  return [
    { label: 'Resolved', value: resolved, tone: 'clear' },
    { label: 'Unresolved', value: unresolved, tone: 'high' },
    { label: 'Unavailable', value: unavailable, tone: 'unknown' },
  ].filter((item) => item.value > 0);
}

function attentionComposition(values: { LOW: number; MEDIUM: number; HIGH: number; UNKNOWN: number }): NamedValue[] {
  return [
    { label: 'HIGH', value: values.HIGH, tone: 'high' },
    { label: 'MEDIUM', value: values.MEDIUM, tone: 'medium' },
    { label: 'LOW', value: values.LOW, tone: 'low' },
    { label: 'Unknown', value: values.UNKNOWN, tone: 'unknown' },
  ].filter((item) => item.value > 0);
}

function evidenceComposition(values: {
  CLEAR: number;
  FAILED: number;
  PENDING_OR_MISSING: number;
  UNKNOWN: number;
  UNAVAILABLE: number;
}): NamedValue[] {
  return [
    { label: 'Failed', value: values.FAILED, tone: 'failed' },
    { label: 'Pending / missing', value: values.PENDING_OR_MISSING, tone: 'waiting' },
    { label: 'Clear', value: values.CLEAR, tone: 'clear' },
    { label: 'Unknown', value: values.UNKNOWN, tone: 'unknown' },
    { label: 'Unavailable', value: values.UNAVAILABLE, tone: 'unknown' },
  ].filter((item) => item.value > 0);
}

function stabilizationComposition(values: {
  regressedPRs: number;
  recoveredPRs: number;
  recoveredAfterRegressionPRs: number;
  oscillatingPRs: number;
}): NamedValue[] {
  return [
    { label: 'PRs with regression', value: values.regressedPRs },
    { label: 'PRs with recovery', value: values.recoveredPRs },
    { label: 'Recovered after regression', value: values.recoveredAfterRegressionPRs },
    { label: 'Attention oscillation', value: values.oscillatingPRs },
  ].filter((item) => item.value > 0);
}

function feedbackComposition(values: {
  USEFUL: number;
  EXPECTED: number;
  FALSE_POSITIVE: number;
  FIXED_BECAUSE_SPARK: number;
}): NamedValue[] {
  return [
    { label: 'Useful', value: values.USEFUL },
    { label: 'Expected', value: values.EXPECTED },
    { label: 'False positive', value: values.FALSE_POSITIVE },
    { label: 'Fixed because of Spark', value: values.FIXED_BECAUSE_SPARK },
  ].filter((item) => item.value > 0);
}

function mergeInterpretation(resolved: number, unresolved: number, unavailable: number): string {
  const known = resolved + unresolved;
  if (!known && unavailable > 0) return `${unavailable} merge outcome${unavailable === 1 ? '' : 's'} unavailable.`;
  if (!known) return 'No merge outcomes observed in this window.';
  const rate = Math.round((resolved / known) * 100);
  return `${resolved} of ${known} known merge outcome${known === 1 ? '' : 's'} resolved before merge (${rate}%).${unavailable ? ` ${unavailable} unavailable.` : ''}`;
}

function feedbackInterpretation(material: number, classified: number): string {
  if (!material) return 'No material transitions observed in this window.';
  const coverage = Math.round((classified / material) * 100);
  return `${classified} of ${material} material transition${material === 1 ? '' : 's'} have feedback (${coverage}% coverage).`;
}

export function renderOutcomeInsightCanvases(
  response: OverviewDrilldownResponseV1,
  transitions: NotableTransitionInsightsV1,
  state: ActivityUrlState,
): HTMLElement {
  const stack = node('section', 'insight-canvas-stack');
  stack.dataset.testid = 'outcome-charts';
  const { data, complete } = outcomeOverview(response, transitions, state);

  stack.append(insightCanvas({
    id: 'outcome-merge-quality',
    title: 'Merge quality',
    description: 'Whether observed merge outcomes were resolved, unresolved, or unavailable.',
    primary: stackedBarChart(data.timeline, 'Merge outcomes over time', [
      { label: 'Resolved', read: (point) => point.resolved, tone: 'clear' },
      { label: 'Unresolved', read: (point) => point.unresolved, tone: 'high' },
      { label: 'Unavailable', read: (point) => point.unavailable, tone: 'unknown' },
    ], state.window),
    secondary: donutChart('Merge outcome', 'Current window composition', mergeComposition(
      data.merges.resolved,
      data.merges.unresolved,
      data.merges.unavailable,
    )),
    interpretation: mergeInterpretation(data.merges.resolved, data.merges.unresolved, data.merges.unavailable),
    ...(!complete ? { footnote: 'Full resolved/unavailable merge denominators require the Phase 4 outcome endpoint; this view is showing unresolved-only compatibility data.' } : {}),
  }));

  stack.append(insightCanvas({
    id: 'outcome-pre-merge-state',
    title: 'Pre-merge state',
    description: 'The selected Spark observation immediately before merge.',
    primary: donutChart('Pre-merge attention', 'Attention at merge boundary', attentionComposition(data.preMergeAttention)),
    secondary: horizontalBarChart('Pre-merge evidence', 'Evidence health at merge boundary', evidenceComposition(data.preMergeEvidence)),
    interpretation: `${data.merges.total} merge${data.merges.total === 1 ? '' : 's'} observed in ${state.window}.`,
  }));

  stack.append(insightCanvas({
    id: 'outcome-stabilization',
    title: 'Trajectory stabilization',
    description: 'Whether observed changes regressed, recovered, or repeatedly moved between attention states.',
    primary: lineChart(data.transitionTrend, 'Regression vs recovery', [
      { label: 'Regressions', read: (point) => point.regressions },
      { label: 'Recoveries', read: (point) => point.recoveries },
    ], state.window),
    secondary: horizontalBarChart('PR trajectory behavior', 'Distinct PR patterns', stabilizationComposition(data.stabilization)),
    interpretation: `${data.stabilization.regressions} regression${data.stabilization.regressions === 1 ? '' : 's'} · ${data.stabilization.recoveries} recover${data.stabilization.recoveries === 1 ? 'y' : 'ies'} · ${data.stabilization.oscillatingPRs} oscillating PR${data.stabilization.oscillatingPRs === 1 ? '' : 's'}.`,
    ...(!complete ? { footnote: 'Distinct-PR stabilization counts require the Phase 4 aggregate response; transition-event counts remain available.' } : {}),
  }));

  const unclassified = Math.max(0, data.feedback.materialTransitions - data.feedback.classifiedTransitions);
  stack.append(insightCanvas({
    id: 'outcome-feedback',
    title: 'Feedback signal',
    description: 'Measured viewer feedback on material Spark transitions. Feedback does not alter evaluation behavior.',
    primary: donutChart('Feedback coverage', 'Material transition denominator', [
      { label: 'Classified', value: data.feedback.classifiedTransitions },
      { label: 'No feedback', value: unclassified },
    ].filter((item) => item.value > 0)),
    secondary: horizontalBarChart('Feedback classification', 'Only classified material transitions', feedbackComposition(data.feedback.classifications)),
    interpretation: feedbackInterpretation(data.feedback.materialTransitions, data.feedback.classifiedTransitions),
    ...(!complete ? { footnote: 'Feedback classification aggregates are unavailable from older overview responses.' } : {}),
  }));

  return stack;
}
