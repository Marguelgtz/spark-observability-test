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

function collectForensics(page: HTMLElement): HTMLElement | undefined {
  const existing = page.querySelector<HTMLElement>('.pr-forensics');
  if (existing) return existing;

  const sections = [
    sectionByHeading(page, 'Observations'),
    sectionByHeading(page, 'Evidence issues'),
    sectionByHeading(page, 'Evaluation history'),
  ].filter((item): item is HTMLElement => Boolean(item));
  if (!sections.length) return undefined;

  const forensics = document.createElement('section');
  forensics.className = 'pr-forensics';
  forensics.dataset.testid = 'pr-forensics';

  const heading = document.createElement('div');
  heading.className = 'pr-forensics-heading';
  const title = document.createElement('h2');
  title.textContent = 'Forensic details';
  const description = document.createElement('p');
  description.textContent = 'Underlying observations, evidence issues, and complete evaluation history.';
  heading.append(title, description);

  const body = document.createElement('div');
  body.className = 'pr-forensics-body';
  body.append(...sections);
  forensics.append(heading, body);
  return forensics;
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

  if (!root.querySelector('[data-testid="insight-canvas-pr-trajectory"]')) {
    const canvas = renderPullRequestTrajectoryCanvas(detail);
    if (canvas) {
      const attentionSummary = trajectorySection.querySelector<HTMLElement>('.pr-attention-summary');
      if (attentionSummary) attentionSummary.insertAdjacentElement('afterend', canvas);
      else trajectorySection.append(canvas);
    }
  }

  page.querySelector<HTMLElement>('.pr-terminal')?.remove();
  page.querySelector<HTMLElement>('.pr-transition-list')?.remove();
  const forensics = collectForensics(page);

  let moments = root.querySelector<HTMLElement>('[data-testid="key-moments"]');
  if (!moments) {
    moments = renderChangeStory(detail, {
      observationHref: (run) => observationHref(run, activitySearch),
      ...(saveFeedback ? { saveFeedback } : {}),
    });
  }
  page.append(moments);
  if (forensics) page.append(forensics);
  return root;
}
