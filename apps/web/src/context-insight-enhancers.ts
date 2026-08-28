import type { EvaluationSummaryV1, PullRequestTrajectoryV1 } from '@spark/dashboard-contracts';
import { renderChangeStory, type SaveStoryFeedback } from './change-story-ui';
import { renderPullRequestTrajectoryCanvas } from './insight-canvases';

function observationHref(run: EvaluationSummaryV1, activitySearch: string): string {
  const base = run.runId
    ? `/app/repositories/${run.repository.id}/runs/${encodeURIComponent(run.runId)}`
    : `/app/evaluations/${run.repository.id}/${run.headSha}`;
  return activitySearch ? `${base}?${activitySearch}` : base;
}

function sectionByHeading(page: HTMLElement, headingText: string): HTMLElement | undefined {
  const heading = [...page.querySelectorAll<HTMLHeadingElement>('h2')]
    .find((item) => item.textContent?.trim() === headingText);
  return heading?.closest<HTMLElement>('.pr-section') ?? undefined;
}

function moveForensicsBelowTrajectory(page: HTMLElement, trajectorySection: HTMLElement): void {
  if (page.querySelector('.pr-forensics')) return;

  const sections = [
    sectionByHeading(page, 'Observations'),
    sectionByHeading(page, 'Evidence issues'),
    sectionByHeading(page, 'Evaluation history'),
  ].filter((item): item is HTMLElement => Boolean(item));
  if (!sections.length) return;

  const details = document.createElement('details');
  details.className = 'pr-forensics';
  details.dataset.testid = 'pr-forensics';
  const summary = document.createElement('summary');
  summary.textContent = 'Forensic details';
  const body = document.createElement('div');
  body.className = 'pr-forensics-body';
  body.append(...sections);
  details.append(summary, body);
  trajectorySection.insertAdjacentElement('afterend', details);
}

export function enhancePullRequestWithSeverityTimeline(
  root: HTMLElement,
  detail: PullRequestTrajectoryV1,
  activitySearch = '',
  saveFeedback?: SaveStoryFeedback,
): HTMLElement {
  const page = root.querySelector<HTMLElement>('[data-testid="pull-request-detail"]');
  if (!page) return root;

  const trajectoryHeading = [...page.querySelectorAll<HTMLHeadingElement>('h2')]
    .find((heading) => heading.textContent?.trim() === 'Trajectory');
  const trajectorySection = trajectoryHeading?.closest<HTMLElement>('.pr-section');
  if (!trajectorySection) return root;

  if (!root.querySelector('[data-testid="key-moments"]')) {
    const moments = renderChangeStory(detail, {
      observationHref: (run) => observationHref(run, activitySearch),
      ...(saveFeedback ? { saveFeedback } : {}),
    });
    trajectorySection.insertAdjacentElement('beforebegin', moments);
  }

  if (!root.querySelector('[data-testid="insight-canvas-pr-trajectory"]')) {
    const canvas = renderPullRequestTrajectoryCanvas(detail);
    if (canvas) {
      const attentionSummary = trajectorySection.querySelector<HTMLElement>('.pr-attention-summary');
      if (attentionSummary) attentionSummary.insertAdjacentElement('afterend', canvas);
      else trajectorySection.append(canvas);
    }
  }

  // Key moments own the compact lifecycle/transition sequence. Remove the old
  // duplicate terminal and transition list while retaining all run-level
  // evidence and observations under progressive disclosure.
  page.querySelector<HTMLElement>('.pr-terminal')?.remove();
  page.querySelector<HTMLElement>('.pr-transition-list')?.remove();
  moveForensicsBelowTrajectory(page, trajectorySection);
  return root;
}
