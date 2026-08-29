import type { ActivityWindowV1, NotableTransitionKindV1 } from '@spark/dashboard-contracts';
import type { NotableTransitionInsightsV1 } from './overview-api';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export interface TimePoint {
  bucketStart: string;
}

export interface NamedValue {
  label: string;
  value: number;
  tone?: string;
}

export interface StatePoint {
  at: string;
  state: string;
  label?: string;
}

export interface LineChartOptions {
  dualScale?: boolean;
}

function bucketLabel(value: string, hourly: boolean): string {
  const date = new Date(value);
  if (hourly) return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function shell(title: string, detail: string, kind: string): { figure: HTMLElement; body: HTMLElement } {
  const figure = node('figure', 'insight-chart');
  figure.dataset.chartKind = kind;
  const caption = node('figcaption', 'insight-chart-caption');
  caption.append(node('strong', undefined, title), node('span', undefined, detail));
  const body = node('div', 'insight-chart-body');
  figure.append(caption, body);
  return { figure, body };
}

export function timeBarChart<T extends TimePoint>(
  points: T[],
  title: string,
  read: (point: T) => number,
  window: ActivityWindowV1,
): HTMLElement {
  const { figure, body } = shell(title, window === '24h' ? 'Hourly' : 'Daily', 'bar');
  const values = points.map(read);
  const max = Math.max(1, ...values);
  const bars = node('div', 'insight-time-bars');
  bars.setAttribute('role', 'img');
  bars.setAttribute('aria-label', `${title} over the selected ${window} window`);
  const labelEvery = points.length > 16 ? Math.ceil(points.length / 8) : 1;

  points.forEach((point, index) => {
    const value = values[index];
    const cell = node('div', 'insight-time-cell');
    const barWrap = node('div', 'insight-time-bar-wrap');
    const bar = node('div', 'insight-time-bar');
    bar.style.height = `${Math.max(value > 0 ? 6 : 1, (value / max) * 100)}%`;
    const formattedBucket = bucketLabel(point.bucketStart, window === '24h');
    cell.title = `${formattedBucket}: ${value}`;
    cell.setAttribute('aria-label', `${formattedBucket}: ${value}`);
    barWrap.append(bar);
    cell.append(barWrap);
    if (index % labelEvery === 0 || index === points.length - 1) cell.append(node('span', 'insight-time-axis', formattedBucket));
    else cell.append(node('span', 'insight-time-axis insight-time-axis-empty', ''));
    bars.append(cell);
  });
  body.append(bars);
  return figure;
}

function lineScaleMax(values: number[]): number {
  const max = Math.max(1, ...values);
  const rawStep = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 3 ? 3 : normalized <= 5 ? 5 : 10;
  return Math.max(3, nice * magnitude * 3);
}

function lineAxisLabel(
  svg: SVGSVGElement,
  value: number,
  x: number,
  y: number,
  seriesIndex: number,
  anchor: 'start' | 'end',
): void {
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', String(x));
  label.setAttribute('y', String(y + 3));
  label.setAttribute('text-anchor', anchor);
  label.setAttribute('class', `insight-line-axis series-${seriesIndex + 1}`);
  label.textContent = String(Math.round(value));
  svg.append(label);
}

function lineAxisTitle(
  svg: SVGSVGElement,
  labelText: string,
  x: number,
  seriesIndex: number,
  anchor: 'start' | 'end',
): void {
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', String(x));
  label.setAttribute('y', '10');
  label.setAttribute('text-anchor', anchor);
  label.setAttribute('class', `insight-line-axis-title series-${seriesIndex + 1}`);
  label.textContent = labelText;
  svg.append(label);
}

export function lineChart<T extends TimePoint>(
  points: T[],
  title: string,
  series: Array<{ label: string; read: (point: T) => number }>,
  window: ActivityWindowV1,
  options: LineChartOptions = {},
): HTMLElement {
  const { figure, body } = shell(title, window === '24h' ? 'Hourly trend' : 'Daily trend', 'line');
  const dualScale = options.dualScale === true && series.length === 2;
  const sharedMax = lineScaleMax(series.flatMap((item) => points.map(item.read)));
  const maxima = dualScale
    ? series.map((item) => lineScaleMax(points.map(item.read)))
    : series.map(() => sharedMax);
  const width = 640;
  const height = 180;
  const left = dualScale ? 44 : 12;
  const right = dualScale ? 44 : 12;
  const top = dualScale ? 24 : 12;
  const bottom = 12;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'insight-line-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    dualScale
      ? `${title} over the selected ${window} window. ${series[0].label} scale 0 to ${Math.round(maxima[0])}; ${series[1].label} scale 0 to ${Math.round(maxima[1])}.`
      : `${title} over the selected ${window} window`,
  );
  if (dualScale) figure.dataset.scaleMode = 'dual';

  for (let index = 0; index <= 3; index += 1) {
    const y = top + (plotHeight * index) / 3;
    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    grid.setAttribute('x1', String(left));
    grid.setAttribute('x2', String(width - right));
    grid.setAttribute('y1', String(y));
    grid.setAttribute('y2', String(y));
    grid.setAttribute('class', 'insight-line-grid');
    svg.append(grid);

    if (dualScale) {
      const fraction = (3 - index) / 3;
      lineAxisLabel(svg, maxima[0] * fraction, left - 8, y, 0, 'end');
      lineAxisLabel(svg, maxima[1] * fraction, width - right + 8, y, 1, 'start');
    }
  }

  if (dualScale) {
    lineAxisTitle(svg, series[0].label, left, 0, 'start');
    lineAxisTitle(svg, series[1].label, width - right, 1, 'end');
  }

  series.forEach((item, seriesIndex) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const coords = points.map((point, pointIndex) => {
      const x = points.length <= 1 ? left + plotWidth / 2 : left + (plotWidth * pointIndex) / (points.length - 1);
      const y = height - bottom - (item.read(point) / maxima[seriesIndex]) * plotHeight;
      return `${x},${y}`;
    }).join(' ');
    path.setAttribute('points', coords);
    path.setAttribute('class', `insight-line-series series-${seriesIndex + 1}`);
    svg.append(path);
  });

  const legend = node('div', 'insight-chart-legend');
  series.forEach((item, seriesIndex) => {
    const entry = node('span', 'insight-chart-legend-item');
    entry.append(node('i', `insight-legend-swatch series-${seriesIndex + 1}`), node('span', undefined, item.label));
    legend.append(entry);
  });
  body.append(svg, legend);
  return figure;
}

export function horizontalBarChart(title: string, detail: string, input: NamedValue[]): HTMLElement {
  const { figure, body } = shell(title, detail, 'horizontal-bar');
  const values = [...input].sort((left, right) => right.value - left.value);
  const max = Math.max(1, ...values.map((item) => item.value));
  const rows = node('div', 'insight-horizontal-bars');
  rows.setAttribute('role', 'img');
  rows.setAttribute('aria-label', title);
  for (const item of values) {
    const row = node('div', 'insight-horizontal-row');
    const label = node('span', 'insight-horizontal-label', item.label);
    const track = node('span', 'insight-horizontal-track');
    const bar = node('span', `insight-horizontal-fill${item.tone ? ` is-${item.tone}` : ''}`);
    bar.style.width = `${item.value === 0 ? 0 : Math.max(4, (item.value / max) * 100)}%`;
    track.append(bar);
    row.append(label, track, node('strong', 'insight-horizontal-value', String(item.value)));
    rows.append(row);
  }
  if (!values.length) rows.append(node('p', 'insight-chart-empty', 'No data in this window.'));
  body.append(rows);
  return figure;
}

export function histogramChart(title: string, detail: string, input: NamedValue[]): HTMLElement {
  const chart = horizontalBarChart(title, detail, input);
  chart.dataset.chartKind = 'histogram';
  chart.classList.add('insight-histogram');
  return chart;
}

export function stackedBarChart<T extends TimePoint>(
  points: T[],
  title: string,
  series: Array<{ label: string; read: (point: T) => number; tone: string }>,
  window: ActivityWindowV1,
): HTMLElement {
  const { figure, body } = shell(title, window === '24h' ? 'Hourly composition' : 'Daily composition', 'stacked-bar');
  const totals = points.map((point) => series.reduce((sum, item) => sum + item.read(point), 0));
  const max = Math.max(1, ...totals);
  const bars = node('div', 'insight-stacked-bars');
  bars.setAttribute('role', 'img');
  bars.setAttribute('aria-label', `${title} over the selected ${window} window`);
  const labelEvery = points.length > 16 ? Math.ceil(points.length / 8) : 1;

  points.forEach((point, index) => {
    const cell = node('div', 'insight-stacked-cell');
    const stack = node('div', 'insight-stacked-track');
    stack.style.height = `${Math.max(totals[index] > 0 ? 6 : 1, (totals[index] / max) * 100)}%`;
    for (const item of series) {
      const value = item.read(point);
      if (value <= 0 || totals[index] <= 0) continue;
      const segment = node('span', `insight-stacked-segment is-${item.tone}`);
      segment.style.height = `${(value / totals[index]) * 100}%`;
      stack.append(segment);
    }
    const formattedBucket = bucketLabel(point.bucketStart, window === '24h');
    cell.title = `${formattedBucket}: ${series.map((item) => `${item.label} ${item.read(point)}`).join(', ')}`;
    cell.append(stack);
    if (index % labelEvery === 0 || index === points.length - 1) cell.append(node('span', 'insight-time-axis', formattedBucket));
    else cell.append(node('span', 'insight-time-axis insight-time-axis-empty', ''));
    bars.append(cell);
  });

  const legend = node('div', 'insight-chart-legend');
  for (const item of series) {
    const entry = node('span', 'insight-chart-legend-item');
    entry.append(node('i', `insight-stack-swatch is-${item.tone}`), node('span', undefined, item.label));
    legend.append(entry);
  }
  body.append(bars, legend);
  return figure;
}

export function steppedStateChart(
  points: StatePoint[],
  title: string,
  orderedStates: string[],
): HTMLElement {
  const { figure, body } = shell(title, `${points.length} observation${points.length === 1 ? '' : 's'} · chronological`, 'stepped-line');
  const width = 720;
  const height = 210;
  const left = 64;
  const right = 18;
  const top = 20;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const rank = new Map(orderedStates.map((state, index) => [state, index]));
  const yFor = (state: string) => {
    const index = rank.get(state) ?? 0;
    const denominator = Math.max(1, orderedStates.length - 1);
    return top + ((orderedStates.length - 1 - index) * plotHeight) / denominator;
  };
  const xFor = (index: number) => points.length === 1 ? left + plotWidth / 2 : left + (index * plotWidth) / Math.max(1, points.length - 1);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'insight-step-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${title}: ${points.map((point) => point.state).join(', ')}`);

  for (const state of [...orderedStates].reverse()) {
    const y = yFor(state);
    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    grid.setAttribute('x1', String(left));
    grid.setAttribute('x2', String(width - right));
    grid.setAttribute('y1', String(y));
    grid.setAttribute('y2', String(y));
    grid.setAttribute('class', 'insight-step-grid');
    svg.append(grid);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(left - 10));
    label.setAttribute('y', String(y + 4));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', `insight-step-level is-${state.toLowerCase()}`);
    label.textContent = state;
    svg.append(label);
  }

  if (points.length > 1) {
    let d = `M ${xFor(0)} ${yFor(points[0].state)}`;
    for (let index = 1; index < points.length; index += 1) d += ` H ${xFor(index)} V ${yFor(points[index].state)}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'insight-step-path');
    svg.append(path);
  }

  const firstAt = points[0] ? Date.parse(points[0].at) : 0;
  const lastAt = points.at(-1) ? Date.parse(points.at(-1)!.at) : firstAt;
  const hourly = Number.isFinite(firstAt) && Number.isFinite(lastAt) && lastAt - firstAt <= 48 * 60 * 60 * 1000;
  const labelEvery = points.length > 6 ? Math.ceil(points.length / 5) : 1;
  points.forEach((point, index) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(xFor(index)));
    circle.setAttribute('cy', String(yFor(point.state)));
    circle.setAttribute('r', '5');
    circle.setAttribute('class', `insight-step-point is-${point.state.toLowerCase()}`);
    const titleNode = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleNode.textContent = `${point.label ?? bucketLabel(point.at, hourly)} · ${point.state}`;
    circle.append(titleNode);
    svg.append(circle);
    if (index % labelEvery === 0 || index === points.length - 1) {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(xFor(index)));
      label.setAttribute('y', String(height - 12));
      label.setAttribute('text-anchor', index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle');
      label.setAttribute('class', 'insight-step-time');
      label.textContent = point.label ?? bucketLabel(point.at, hourly);
      svg.append(label);
    }
  });
  body.append(svg);
  return figure;
}

export function donutChart(title: string, detail: string, values: NamedValue[]): HTMLElement {
  const { figure, body } = shell(title, detail, 'donut');
  const total = values.reduce((sum, item) => sum + item.value, 0);
  const wrap = node('div', 'insight-donut-wrap');
  const donut = node('div', 'insight-donut');
  donut.setAttribute('role', 'img');
  donut.setAttribute('aria-label', `${title}: ${values.map((item) => `${item.label} ${item.value}`).join(', ')}`);

  let cursor = 0;
  const stops: string[] = [];
  values.forEach((item, index) => {
    const share = total > 0 ? (item.value / total) * 100 : 0;
    const next = cursor + share;
    stops.push(`var(--insight-segment-${index + 1}) ${cursor}% ${next}%`);
    cursor = next;
  });
  donut.style.background = total > 0 ? `conic-gradient(${stops.join(', ')})` : 'var(--insight-chart-empty)';
  const center = node('div', 'insight-donut-center');
  center.append(node('strong', undefined, String(total)), node('span', undefined, 'total'));
  donut.append(center);

  const legend = node('div', 'insight-donut-legend');
  values.forEach((item, index) => {
    const entry = node('div', 'insight-donut-legend-row');
    entry.append(node('i', `insight-donut-swatch segment-${index + 1}`), node('span', undefined, item.label), node('strong', undefined, String(item.value)));
    legend.append(entry);
  });
  wrap.append(donut, legend);
  body.append(wrap);
  return figure;
}

const TRANSITION_LABELS: Record<NotableTransitionKindV1, string> = {
  ATTENTION_INCREASED: 'Attention increased',
  ATTENTION_DECREASED: 'Attention decreased',
  EVIDENCE_REGRESSED: 'Evidence regressed',
  EVIDENCE_RECOVERED: 'Evidence recovered',
  EVIDENCE_BECAME_PENDING: 'Evidence pending / missing',
  EVIDENCE_RESOLVED: 'Evidence resolved',
  SENSITIVE_SURFACE_ADDED: 'Sensitive surface added',
  CHANGE_SCOPE_EXPANDED: 'Scope expanded',
};

export function transitionMixChart(insights: NotableTransitionInsightsV1, compact = false): HTMLElement {
  const values = insights.byKind
    .filter((item) => item.count > 0)
    .map((item) => ({ label: TRANSITION_LABELS[item.kind], value: item.count }))
    .sort((left, right) => right.value - left.value)
    .slice(0, compact ? 5 : 8);
  const chart = horizontalBarChart(
    'Notable transition mix',
    `${insights.total} transitions across ${insights.affectedPRs} PR${insights.affectedPRs === 1 ? '' : 's'}`,
    values,
  );
  chart.dataset.testid = 'notable-transition-mix';
  return chart;
}

export function regressionRecoveryChart(insights: NotableTransitionInsightsV1, window: ActivityWindowV1): HTMLElement {
  const chart = lineChart(
    insights.trend,
    'Regression vs recovery',
    [
      { label: 'Regressions', read: (point) => point.regressions },
      { label: 'Recoveries', read: (point) => point.recoveries },
    ],
    window,
  );
  chart.dataset.testid = 'regression-recovery-chart';
  return chart;
}

export function attentionTransitionChart(insights: NotableTransitionInsightsV1, window: ActivityWindowV1): HTMLElement {
  const chart = lineChart(
    insights.trend,
    'Attention movement',
    [
      { label: 'Increased', read: (point) => point.attentionIncreases },
      { label: 'Decreased', read: (point) => point.attentionDecreases },
    ],
    window,
  );
  chart.dataset.testid = 'attention-transition-chart';
  return chart;
}