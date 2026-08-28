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

export function lineChart<T extends TimePoint>(
  points: T[],
  title: string,
  series: Array<{ label: string; read: (point: T) => number }>,
  window: ActivityWindowV1,
): HTMLElement {
  const { figure, body } = shell(title, window === '24h' ? 'Hourly trend' : 'Daily trend', 'line');
  const values = series.flatMap((item) => points.map(item.read));
  const max = Math.max(1, ...values);
  const width = 640;
  const height = 180;
  const padX = 12;
  const padY = 12;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'insight-line-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${title} over the selected ${window} window`);

  for (let index = 0; index <= 3; index += 1) {
    const y = padY + ((height - padY * 2) * index) / 3;
    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    grid.setAttribute('x1', String(padX));
    grid.setAttribute('x2', String(width - padX));
    grid.setAttribute('y1', String(y));
    grid.setAttribute('y2', String(y));
    grid.setAttribute('class', 'insight-line-grid');
    svg.append(grid);
  }

  series.forEach((item, seriesIndex) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const coords = points.map((point, pointIndex) => {
      const x = points.length <= 1 ? width / 2 : padX + ((width - padX * 2) * pointIndex) / (points.length - 1);
      const y = height - padY - (item.read(point) / max) * (height - padY * 2);
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
