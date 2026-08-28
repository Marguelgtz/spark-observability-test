import './context-insight-enhancers.css';
import type { PullRequestTrajectoryV1 } from '@spark/dashboard-contracts';
import { renderPullRequestTrajectoryCanvas } from './insight-canvases';

export function enhancePullRequestWithSeverityTimeline(
  root: HTMLElement,
  detail: PullRequestTrajectoryV1,
): HTMLElement {
  if (root.querySelector('[data-testid="insight-canvas-pr-trajectory"]')) return root;
  const page = root.querySelector<HTMLElement>('[data-testid="pull-request-detail"]');
  if (!page) return root;

  const trajectoryHeading = [...page.querySelectorAll<HTMLHeadingElement>('h2')]
    .find((heading) => heading.textContent?.trim() === 'Trajectory');
  const section = trajectoryHeading?.closest<HTMLElement>('.pr-section');
  if (!section) return root;

  const canvas = renderPullRequestTrajectoryCanvas(detail);
  if (!canvas) return root;
  const attentionSummary = section.querySelector<HTMLElement>('.pr-attention-summary');
  if (attentionSummary) attentionSummary.insertAdjacentElement('afterend', canvas);
  else section.append(canvas);
  return root;
}
