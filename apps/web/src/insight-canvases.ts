import type { ActivityResponseV1, AttentionLevelV1, PullRequestTrajectoryV1 } from '@spark/dashboard-contracts';
import { insightCanvas } from './insight-canvas';
import {
  donutChart,
  histogramChart,
  horizontalBarChart,
  lineChart,
  stackedBarChart,
  steppedStateChart,
  timeBarChart,
  type NamedValue,
} from './insight-charts';
import { currentAttentionMix, evaluationAttentionMix, evaluationAttentionTrend } from './insights/attention';
import { deriveIterationInsight, iterationInterpretation } from './insights/throughput';
import { transitionInterpretation, transitionMix } from './insights/transitions';
import type { NotableTransitionInsightsV1, OverviewDrilldownResponseV1 } from './overview-api';
import { renderOutcomeInsightCanvases } from './outcome-canvases';
import type { ActivityUrlState } from './state';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function repositoryDistribution(response: OverviewDrilldownResponseV1): NamedValue[] {
  const counts = new Map<string, number>();
  for (const item of response.items) {
    const repository = item.kind === 'pull-request'
      ? item.activity.repository
      : item.kind === 'evaluation'
        ? item.evaluation.repository
        : item.repository;
    const label = `${repository.owner}/${repository.name}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
}

function attentionMix(response: OverviewDrilldownResponseV1, preMerge = false): NamedValue[] {
  const counts: Record<AttentionLevelV1, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const item of response.items) {
    let attention: AttentionLevelV1 | undefined;
    if (preMerge && item.kind === 'merge') attention = item.lifecycle.preMergeAttention;
    else if (item.kind === 'pull-request') attention = item.activity.latest.attention;
    else if (item.kind === 'evaluation') attention = item.evaluation.attention;
    else attention = item.latest?.attention;
    if (attention) counts[attention] += 1;
  }
  return [
    { label: 'HIGH', value: counts.HIGH, tone: 'high' },
    { label: 'MEDIUM', value: counts.MEDIUM, tone: 'medium' },
    { label: 'LOW', value: counts.LOW, tone: 'low' },
  ].filter((item) => item.value > 0);
}

function mergeEvidenceMix(response: OverviewDrilldownResponseV1): NamedValue[] {
  const counts = new Map<string, number>();
  for (const item of response.items) {
    if (item.kind !== 'merge') continue;
    const health = item.lifecycle.preMergeEvidenceHealth ?? 'UNKNOWN';
    counts.set(health, (counts.get(health) ?? 0) + 1);
  }
  const tone = (label: string): string => {
    if (label === 'FAILED') return 'failed';
    if (label === 'PENDING_OR_MISSING') return 'waiting';
    if (label === 'CLEAR') return 'clear';
    return 'unknown';
  };
  return [...counts.entries()].map(([label, value]) => ({ label: label.replaceAll('_', ' '), value, tone: tone(label) }));
}

function canvasStack(testid: string): HTMLElement {
  const stack = node('section', 'insight-canvas-stack');
  stack.dataset.testid = testid;
  return stack;
}

export function renderHomeInsightCanvases(
  activity: ActivityResponseV1,
  evaluations: OverviewDrilldownResponseV1,
  transitions: NotableTransitionInsightsV1,
  state: ActivityUrlState,
): HTMLElement {
  const stack = canvasStack('home-charts');
  const overview = activity.overview;
  const iteration = deriveIterationInsight(evaluations, overview ? {
    observedPRs: overview.observedPRs,
    totalEvaluations: overview.totalEvaluations,
  } : undefined);

  const volume = timeBarChart(evaluations.trend, 'Evaluation volume', (point) => point.evaluations, state.window);
  volume.dataset.testid = 'home-evaluation-volume';
  const histogram = histogramChart('Evaluations per PR', 'Iteration distribution', iteration.histogram);
  histogram.dataset.testid = 'iteration-density-histogram';
  stack.append(insightCanvas({
    id: 'throughput-iteration',
    title: 'Throughput & iteration',
    description: 'How much evaluation activity each observed change generated.',
    primary: volume,
    secondary: histogram,
    interpretation: iterationInterpretation(iteration),
    ...(iteration.sampled ? { footnote: 'Distribution uses the latest 100 evaluations; the headline totals remain exact.' } : {}),
  }));

  const severity = stackedBarChart(
    evaluationAttentionTrend(evaluations),
    'Evaluation severity mix',
    [
      { label: 'LOW', read: (point) => point.low, tone: 'low' },
      { label: 'MEDIUM', read: (point) => point.medium, tone: 'medium' },
      { label: 'HIGH', read: (point) => point.high, tone: 'high' },
    ],
    state.window,
  );
  const current = donutChart('Current attention', 'Latest observed PR state', currentAttentionMix(activity));
  stack.append(insightCanvas({
    id: 'attention-health',
    title: 'Attention health',
    description: 'Evaluation severity through the window alongside the current PR snapshot.',
    primary: severity,
    secondary: current,
    interpretation: `${evaluations.trend.reduce((sum, point) => sum + point.attentionEvaluations, 0)} attention evaluations observed in ${state.window}.`,
    ...(evaluations.truncated ? { footnote: 'Severity composition is based on the latest 100 evaluation rows in the window.' } : {}),
  }));

  const transitionChart = horizontalBarChart('Notable transition mix', 'Deterministic change behavior', transitionMix(transitions, 6));
  transitionChart.dataset.testid = 'notable-transition-mix';
  stack.append(insightCanvas({
    id: 'notable-behavior',
    title: 'Notable change behavior',
    description: 'What kinds of material movement occurred as pull requests evolved.',
    primary: transitionChart,
    interpretation: transitionInterpretation(transitions),
    compact: true,
  }));
  return stack;
}

export function renderOverviewInsightCanvases(
  response: OverviewDrilldownResponseV1,
  transitions: NotableTransitionInsightsV1,
  state: ActivityUrlState,
  companion?: OverviewDrilldownResponseV1,
): HTMLElement {
  if (response.metric === 'merged-unresolved') {
    return renderOutcomeInsightCanvases(response, transitions, state);
  }

  const stack = canvasStack('overview-charts');

  if (response.metric === 'pull-requests') {
    stack.append(insightCanvas({
      id: 'portfolio-shape',
      title: 'Observed change shape',
      description: 'Where changes are concentrated and their latest attention state.',
      primary: horizontalBarChart('PRs by repository', 'Observed changes', repositoryDistribution(response)),
      secondary: donutChart('Latest attention', 'Current observed PR state', attentionMix(response)),
      interpretation: `${response.total} pull request${response.total === 1 ? '' : 's'} observed in ${state.window}.`,
    }));
    const transitionChart = horizontalBarChart('Notable transition mix', 'Across observed changes', transitionMix(transitions));
    transitionChart.dataset.testid = 'notable-transition-mix';
    stack.append(insightCanvas({ id: 'change-behavior', title: 'Change behavior', primary: transitionChart, interpretation: transitionInterpretation(transitions), compact: true }));
    return stack;
  }

  if (response.metric === 'evaluations') {
    const iteration = deriveIterationInsight(response, undefined, companion?.total);
    const flow = lineChart(response.trend, 'Evaluation flow', [
      { label: 'Evaluations', read: (point) => point.evaluations },
      { label: 'PRs observed', read: (point) => point.observedPRs },
    ], state.window, { dualScale: true });
    flow.dataset.testid = 'evaluation-flow-trend';
    const volume = timeBarChart(response.trend, 'Evaluation volume', (point) => point.evaluations, state.window);
    volume.dataset.testid = 'overview-evaluation-volume';
    stack.append(insightCanvas({
      id: 'evaluation-flow',
      title: 'Evaluation flow',
      description: 'Trend and cadence of evaluation activity.',
      primary: flow,
      secondary: volume,
      interpretation: iterationInterpretation(iteration),
    }));
    const histogram = histogramChart('Evaluations per PR', 'Iteration distribution', iteration.histogram);
    histogram.dataset.testid = 'iteration-density-histogram';
    stack.append(insightCanvas({
      id: 'iteration-density',
      title: 'Iteration density',
      description: 'How evaluation activity is distributed across changes.',
      primary: histogram,
      interpretation: iterationInterpretation(iteration),
      ...(iteration.sampled ? { footnote: 'Distribution uses the latest 100 evaluations; the evaluations/PR headline uses the full window totals.' } : {}),
      compact: true,
    }));
    stack.append(insightCanvas({
      id: 'evaluation-attention',
      title: 'Attention health',
      description: 'Severity composition over time and across individual evaluation events.',
      primary: stackedBarChart(evaluationAttentionTrend(response), 'Severity composition', [
        { label: 'LOW', read: (point) => point.low, tone: 'low' },
        { label: 'MEDIUM', read: (point) => point.medium, tone: 'medium' },
        { label: 'HIGH', read: (point) => point.high, tone: 'high' },
      ], state.window),
      secondary: donutChart('Evaluation attention', 'Latest rows in this window', evaluationAttentionMix(response)),
      ...(response.truncated ? { footnote: 'Composition uses the latest 100 evaluation rows.' } : {}),
    }));
    const transitionChart = horizontalBarChart('Notable transition mix', 'Across evaluated changes', transitionMix(transitions));
    transitionChart.dataset.testid = 'notable-transition-mix';
    stack.append(insightCanvas({ id: 'evaluation-transitions', title: 'Notable change behavior', primary: transitionChart, interpretation: transitionInterpretation(transitions), compact: true }));
    return stack;
  }

  if (response.metric === 'attention') {
    stack.append(insightCanvas({
      id: 'current-attention',
      title: 'Current attention queue',
      description: 'Severity and repository concentration of active HIGH/MEDIUM changes.',
      primary: donutChart('HIGH vs MEDIUM', 'Open PRs needing attention', attentionMix(response)),
      secondary: horizontalBarChart('Attention by repository', 'Current concentration', repositoryDistribution(response)),
      interpretation: `${response.total} open pull request${response.total === 1 ? '' : 's'} currently need attention.`,
    }));
    const recovery = lineChart(transitions.trend, 'Regression vs recovery', [
      { label: 'Regressions', read: (point) => point.regressions },
      { label: 'Recoveries', read: (point) => point.recoveries },
    ], state.window);
    recovery.dataset.testid = 'regression-recovery-chart';
    const movement = lineChart(transitions.trend, 'Attention movement', [
      { label: 'Increased', read: (point) => point.attentionIncreases },
      { label: 'Decreased', read: (point) => point.attentionDecreases },
    ], state.window);
    movement.dataset.testid = 'attention-transition-chart';
    stack.append(insightCanvas({
      id: 'recovery-behavior',
      title: 'Recovery behavior',
      description: 'Whether observed transitions are deteriorating or stabilizing.',
      primary: recovery,
      secondary: movement,
      interpretation: transitionInterpretation(transitions),
    }));
    return stack;
  }

  stack.append(insightCanvas({
    id: 'merge-quality',
    title: 'Merge quality',
    description: 'When unresolved merges occurred and the attention state immediately before merge.',
    primary: timeBarChart(response.trend, 'Unresolved merge timing', (point) => point.mergedUnresolved, state.window),
    secondary: donutChart('Pre-merge attention', 'Selected observation before merge', attentionMix(response, true)),
    interpretation: `${response.total} unresolved merge${response.total === 1 ? '' : 's'} observed in ${state.window}.`,
  }));
  stack.append(insightCanvas({
    id: 'merge-evidence',
    title: 'Evidence at merge',
    description: 'Evidence health on the selected pre-merge observation.',
    primary: horizontalBarChart('Pre-merge evidence', 'Evidence health at merge', mergeEvidenceMix(response)),
    compact: true,
  }));
  return stack;
}

export function renderPullRequestTrajectoryCanvas(detail: PullRequestTrajectoryV1): HTMLElement | undefined {
  const runs = [...detail.runs].reverse();
  if (!runs.length) return undefined;
  const severity = steppedStateChart(
    runs.map((run) => ({ at: run.evaluatedAt, state: run.attention })),
    'Attention severity over time',
    ['LOW', 'MEDIUM', 'HIGH'],
  );
  severity.dataset.testid = 'pr-severity-timeline';

  const counts = new Map<string, number>();
  for (const transition of detail.notableTransitions) {
    for (const kind of transition.kinds) {
      const label = kind.toLowerCase().replaceAll('_', ' ');
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const transitionSummary = horizontalBarChart(
    'Transition causes',
    'Notable trajectory movement',
    [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
  );
  transitionSummary.dataset.testid = 'pr-transition-summary';

  return insightCanvas({
    id: 'pr-trajectory',
    title: 'Change trajectory',
    description: 'Severity evolution paired with the transition types that moved the change.',
    primary: severity,
    secondary: transitionSummary,
    interpretation: `${detail.summary.totalRuns} evaluations · ${detail.summary.totalTransitions} notable transitions · peak ${runs.some((run) => run.attention === 'HIGH') ? 'HIGH' : runs.some((run) => run.attention === 'MEDIUM') ? 'MEDIUM' : 'LOW'} attention`,
  });
}