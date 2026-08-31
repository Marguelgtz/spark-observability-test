import './insight-charts.css';
import './insight-canvas.css';
import './insight-chart-extras.css';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export interface InsightCanvasConfig {
  id: string;
  title: string;
  description?: string;
  primary: HTMLElement;
  secondary?: HTMLElement;
  interpretation?: string;
  footnote?: string;
  compact?: boolean;
}

export function insightCanvas(config: InsightCanvasConfig): HTMLElement {
  const section = node('section', `insight-canvas${config.compact ? ' is-compact' : ''}`);
  section.id = config.id;
  section.dataset.testid = `insight-canvas-${config.id}`;

  const heading = node('div', 'insight-canvas-heading');
  const copy = node('div');
  copy.append(node('h3', undefined, config.title));
  if (config.description) copy.append(node('p', undefined, config.description));
  heading.append(copy);
  section.append(heading);

  const plots = node('div', `insight-canvas-plots${config.secondary ? ' has-secondary' : ''}`);
  const primary = node('div', 'insight-canvas-primary');
  primary.append(config.primary);
  plots.append(primary);
  if (config.secondary) {
    const secondary = node('div', 'insight-canvas-secondary');
    secondary.append(config.secondary);
    plots.append(secondary);
  }
  section.append(plots);

  if (config.interpretation) section.append(node('p', 'insight-canvas-interpretation', config.interpretation));
  if (config.footnote) section.append(node('p', 'insight-canvas-footnote', config.footnote));
  return section;
}
