import './context-insight-enhancers.css';
import type { AttentionLevelV1, EvaluationSummaryV1, PullRequestTrajectoryV1 } from '@spark/dashboard-contracts';
import { timeBarChart } from './insight-charts';
import type { OverviewDrilldownResponseV1 } from './overview-api';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function enhanceHomeWithEvaluationVolume(
  root: HTMLElement,
  overview: OverviewDrilldownResponseV1 | undefined,
): HTMLElement {
  if (!overview?.trend.length) return root;
  const charts = root.querySelector<HTMLElement>('[data-testid="home-charts"]');
  if (!charts || charts.querySelector('[data-testid="home-evaluation-volume"]')) return root;

  const chart = timeBarChart(
    overview.trend,
    'Evaluation volume',
    (point) => point.evaluations,
    overview.selectedWindow,
  );
  chart.dataset.testid = 'home-evaluation-volume';
  chart.classList.add('context-volume-chart');

  const transitionSlot = charts.querySelector<HTMLElement>('.home-transition-slot');
  if (transitionSlot) transitionSlot.before(chart);
  else charts.append(chart);
  return root;
}

export function enhanceOverviewWithEvaluationVolume(
  root: HTMLElement,
  response: OverviewDrilldownResponseV1,
): HTMLElement {
  if (response.metric !== 'evaluations' || !response.trend.length) return root;
  const charts = root.querySelector<HTMLElement>('[data-testid="overview-charts"]');
  if (!charts || charts.querySelector('[data-testid="overview-evaluation-volume"]')) return root;

  const chart = timeBarChart(
    response.trend,
    'Evaluation volume',
    (point) => point.evaluations,
    response.selectedWindow,
  );
  chart.dataset.testid = 'overview-evaluation-volume';
  chart.classList.add('context-volume-chart');

  const transitionSlot = charts.querySelector<HTMLElement>('.overview-transition-slot');
  if (transitionSlot) transitionSlot.before(chart);
  else charts.append(chart);
  return root;
}

const ATTENTION_RANK: Record<AttentionLevelV1, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function pointTime(run: EvaluationSummaryV1, spanMs: number): string {
  const date = new Date(run.evaluatedAt);
  if (spanMs <= 48 * 60 * 60 * 1000) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function severityTimeline(detail: PullRequestTrajectoryV1): HTMLElement | undefined {
  const runs = [...detail.runs].reverse();
  if (!runs.length) return undefined;

  const figure = node('figure', 'pr-severity-chart');
  figure.dataset.testid = 'pr-severity-timeline';
  const caption = node('figcaption', 'pr-severity-caption');
  caption.append(
    node('strong', undefined, 'Attention severity over time'),
    node('span', undefined, `${runs.length} evaluation${runs.length === 1 ? '' : 's'} · chronological`),
  );
  figure.append(caption);

  const width = 720;
  const height = 210;
  const left = 58;
  const right = 18;
  const top = 20;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const yFor = (attention: AttentionLevelV1) => top + ((2 - ATTENTION_RANK[attention]) * plotHeight) / 2;
  const xFor = (index: number) => runs.length === 1 ? left + plotWidth / 2 : left + (index * plotWidth) / (runs.length - 1);

  const svg = svgElement('svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'pr-severity-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Attention severity over time: ${runs.map(run => run.attention).join(', ')}`);

  for (const attention of ['HIGH', 'MEDIUM', 'LOW'] as const) {
    const y = yFor(attention);
    const grid = svgElement('line');
    grid.setAttribute('x1', String(left));
    grid.setAttribute('x2', String(width - right));
    grid.setAttribute('y1', String(y));
    grid.setAttribute('y2', String(y));
    grid.setAttribute('class', `pr-severity-grid is-${attention.toLowerCase()}`);
    svg.append(grid);

    const label = svgElement('text');
    label.setAttribute('x', String(left - 10));
    label.setAttribute('y', String(y + 4));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', `pr-severity-level is-${attention.toLowerCase()}`);
    label.textContent = attention;
    svg.append(label);
  }

  if (runs.length > 1) {
    let d = `M ${xFor(0)} ${yFor(runs[0].attention)}`;
    for (let index = 1; index < runs.length; index += 1) {
      d += ` H ${xFor(index)} V ${yFor(runs[index].attention)}`;
    }
    const path = svgElement('path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'pr-severity-path');
    svg.append(path);
  }

  const firstAt = Date.parse(runs[0].evaluatedAt);
  const lastAt = Date.parse(runs[runs.length - 1].evaluatedAt);
  const spanMs = Number.isFinite(firstAt) && Number.isFinite(lastAt) ? Math.max(0, lastAt - firstAt) : 0;
  const labelEvery = runs.length > 6 ? Math.ceil(runs.length / 5) : 1;

  runs.forEach((run, index) => {
    const x = xFor(index);
    const y = yFor(run.attention);
    const point = svgElement('circle');
    point.setAttribute('cx', String(x));
    point.setAttribute('cy', String(y));
    point.setAttribute('r', '5');
    point.setAttribute('class', `pr-severity-point is-${run.attention.toLowerCase()}`);
    point.setAttribute('data-attention', run.attention);
    const title = svgElement('title');
    title.textContent = `${pointTime(run, spanMs)} · ${run.attention}`;
    point.append(title);
    svg.append(point);

    if (index % labelEvery === 0 || index === runs.length - 1) {
      const label = svgElement('text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(height - 12));
      label.setAttribute('text-anchor', index === 0 ? 'start' : index === runs.length - 1 ? 'end' : 'middle');
      label.setAttribute('class', 'pr-severity-time');
      label.textContent = pointTime(run, spanMs);
      svg.append(label);
    }
  });

  figure.append(svg, node('p', 'pr-severity-note', 'Each point is an immutable Spark evaluation; vertical moves show attention-level transitions.'));
  return figure;
}

export function enhancePullRequestWithSeverityTimeline(
  root: HTMLElement,
  detail: PullRequestTrajectoryV1,
): HTMLElement {
  if (root.querySelector('[data-testid="pr-severity-timeline"]')) return root;
  const page = root.querySelector<HTMLElement>('[data-testid="pull-request-detail"]');
  if (!page) return root;

  const trajectoryHeading = [...page.querySelectorAll<HTMLHeadingElement>('h2')]
    .find((heading) => heading.textContent?.trim() === 'Trajectory');
  const section = trajectoryHeading?.closest<HTMLElement>('.pr-section');
  if (!section) return root;

  const chart = severityTimeline(detail);
  if (!chart) return root;
  const attentionSummary = section.querySelector<HTMLElement>('.pr-attention-summary');
  if (attentionSummary) attentionSummary.insertAdjacentElement('afterend', chart);
  else section.append(chart);
  return root;
}
