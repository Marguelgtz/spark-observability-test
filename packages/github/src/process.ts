import type {
  PipelineAttemptObservation,
  PipelineJobObservation,
  PipelineRunObservation,
  PipelineStepObservation,
  ProcessLifecycle,
  ProcessOutcome,
  SourceCompleteness,
} from '@spark/core';
import type { GitHubApiClient } from './client';
import type { GitHubCheckRun, GitHubWorkflowJob, GitHubWorkflowRun } from './types';

export interface GitHubActionsAcquisitionLimits {
  /** Each page contains at most 100 workflow runs for the exact revision. */
  maxRunPages: number;
  /** Most-recent logical workflow runs retained from the exact-revision result. */
  maxRuns: number;
  /** Most-recent attempts retained for each logical run. */
  maxAttemptsPerRun: number;
  /** Each page contains at most 100 jobs for one attempt; steps are embedded in jobs. */
  maxJobPagesPerAttempt: number;
}

export const DEFAULT_GITHUB_ACTIONS_LIMITS: GitHubActionsAcquisitionLimits = {
  maxRunPages: 1,
  maxRuns: 10,
  maxAttemptsPerRun: 3,
  maxJobPagesPerAttempt: 1,
};

export interface GitHubActionsJobCrosswalk {
  pipelineJobId: string;
  providerJobId: number;
  providerCheckRunId?: number;
}

export interface GitHubActionsAttemptCrosswalk {
  pipelineAttemptId: string;
  attempt: number;
  jobs: GitHubActionsJobCrosswalk[];
}

export interface GitHubActionsRunCrosswalk {
  pipelineRunId: string;
  pipelineDefinitionId: string;
  providerWorkflowId: number;
  providerWorkflowPath?: string;
  providerRunId: number;
  providerCheckSuiteId: number;
  /** Check runs supplied by the caller that belong to this workflow run's suite. */
  providerCheckRunIds: number[];
  attempts: GitHubActionsAttemptCrosswalk[];
}

export interface GitHubActionsProcessResult {
  pipelineRuns: PipelineRunObservation[];
  pipelineAttempts: PipelineAttemptObservation[];
  pipelineJobs: PipelineJobObservation[];
  pipelineSteps: PipelineStepObservation[];
  crosswalks: GitHubActionsRunCrosswalk[];
  completeness: SourceCompleteness[];
}

export interface AcquireGitHubActionsProcessInput {
  client: GitHubApiClient;
  owner: string;
  repo: string;
  repositoryId: string;
  revision: string;
  /** Optional supplemental Checks data. Actions remains canonical for hierarchy. */
  checkRuns?: GitHubCheckRun[];
  limits?: Partial<GitHubActionsAcquisitionLimits>;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

function acquisitionLimits(overrides?: Partial<GitHubActionsAcquisitionLimits>): GitHubActionsAcquisitionLimits {
  return {
    maxRunPages: positiveInteger(overrides?.maxRunPages, DEFAULT_GITHUB_ACTIONS_LIMITS.maxRunPages),
    maxRuns: positiveInteger(overrides?.maxRuns, DEFAULT_GITHUB_ACTIONS_LIMITS.maxRuns),
    maxAttemptsPerRun: positiveInteger(overrides?.maxAttemptsPerRun, DEFAULT_GITHUB_ACTIONS_LIMITS.maxAttemptsPerRun),
    maxJobPagesPerAttempt: positiveInteger(
      overrides?.maxJobPagesPerAttempt,
      DEFAULT_GITHUB_ACTIONS_LIMITS.maxJobPagesPerAttempt,
    ),
  };
}

export function normalizeGitHubProcessState(
  status: string,
  conclusion: string | null,
): { lifecycle: ProcessLifecycle; outcome: ProcessOutcome } {
  if (status === 'queued' || status === 'requested' || status === 'waiting' || status === 'pending') {
    return { lifecycle: 'QUEUED', outcome: 'UNKNOWN' };
  }
  if (status === 'in_progress') return { lifecycle: 'RUNNING', outcome: 'UNKNOWN' };
  if (status !== 'completed') return { lifecycle: 'UNKNOWN', outcome: 'UNKNOWN' };
  if (conclusion === 'cancelled') return { lifecycle: 'CANCELLED', outcome: 'UNKNOWN' };
  if (conclusion === 'success') return { lifecycle: 'COMPLETED', outcome: 'PASSED' };
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') {
    return { lifecycle: 'COMPLETED', outcome: 'FAILED' };
  }
  if (conclusion === 'neutral') return { lifecycle: 'COMPLETED', outcome: 'NEUTRAL' };
  if (conclusion === 'skipped') return { lifecycle: 'COMPLETED', outcome: 'SKIPPED' };
  return { lifecycle: 'COMPLETED', outcome: 'UNKNOWN' };
}

function checkRunId(checkRunUrl: string | undefined): number | undefined {
  const match = checkRunUrl?.match(/\/check-runs\/(\d+)(?:\?.*)?$/);
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : undefined;
}

export function normalizeGitHubWorkflowPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const match = path.match(/(?:^|\/)(\.github\/workflows\/[^@]+\.ya?ml)(?:@.*)?$/i);
  return match?.[1];
}

export function githubWorkflowDefinitionId(repositoryId: string, path: string | undefined, workflowId?: number): string {
  const normalizedPath = normalizeGitHubWorkflowPath(path);
  return normalizedPath
    ? `pipeline-definition:${repositoryId}:${normalizedPath}`
    : `pipeline-definition:github-actions:${workflowId ?? 'unknown'}`;
}

function runId(providerRunId: number): string {
  return `pipeline-run:github-actions:${providerRunId}`;
}

function attemptId(providerRunId: number, attempt: number): string {
  return `pipeline-attempt:github-actions:${providerRunId}:${attempt}`;
}

function jobId(providerJobId: number): string {
  return `pipeline-job:github-actions:${providerJobId}`;
}

function stepId(providerJobId: number, sequence: number): string {
  return `pipeline-step:github-actions:${providerJobId}:${sequence}`;
}

function attemptObservation(run: GitHubWorkflowRun): PipelineAttemptObservation {
  const state = normalizeGitHubProcessState(run.status, run.conclusion);
  return {
    kind: 'pipeline-attempt',
    id: attemptId(run.id, run.run_attempt),
    pipelineRunId: runId(run.id),
    attempt: run.run_attempt,
    ...state,
    ...(run.run_started_at ? { startedAt: run.run_started_at } : {}),
    source: { kind: 'ci', id: `github-actions:run:${run.id}:attempt:${run.run_attempt}` },
    url: run.html_url,
  };
}

function jobObservation(job: GitHubWorkflowJob, providerRunId: number, attempt: number): PipelineJobObservation {
  const state = normalizeGitHubProcessState(job.status, job.conclusion);
  return {
    kind: 'pipeline-job',
    id: jobId(job.id),
    pipelineAttemptId: attemptId(providerRunId, attempt),
    name: job.name,
    ...(job.labels?.includes('self-hosted') ? { runnerClass: 'SELF_HOSTED' } : {}),
    ...state,
    ...(job.started_at ? { startedAt: job.started_at } : {}),
    ...(job.completed_at ? { completedAt: job.completed_at } : {}),
    source: { kind: 'ci', id: `github-actions:job:${job.id}` },
    url: job.html_url,
  };
}

function stepObservations(job: GitHubWorkflowJob): PipelineStepObservation[] {
  return (job.steps ?? []).map(step => ({
    kind: 'pipeline-step',
    id: stepId(job.id, step.number),
    pipelineJobId: jobId(job.id),
    sequence: step.number,
    name: step.name,
    ...normalizeGitHubProcessState(step.status, step.conclusion),
    ...(step.started_at ? { startedAt: step.started_at } : {}),
    ...(step.completed_at ? { completedAt: step.completed_at } : {}),
    source: { kind: 'ci', id: `github-actions:job:${job.id}:step:${step.number}` },
  }));
}

function completeness(
  source: string,
  complete: boolean,
  observedCount: number,
  expectedCount: number,
  reason: string,
): SourceCompleteness {
  return {
    source,
    state: complete ? 'COMPLETE' : 'PARTIAL',
    observedCount,
    expectedCount,
    ...(!complete ? { reason } : {}),
  };
}

export async function acquireGitHubActionsProcess(
  input: AcquireGitHubActionsProcessInput,
): Promise<GitHubActionsProcessResult> {
  const limits = acquisitionLimits(input.limits);
  const runPage = await input.client.listWorkflowRunsForRevision(
    input.owner,
    input.repo,
    input.revision,
    limits.maxRunPages,
  );
  const uniqueRuns = [...new Map(runPage.items.map(run => [run.id, run])).values()];
  const runs = uniqueRuns.slice(0, limits.maxRuns).sort((left, right) => left.id - right.id);
  const pipelineRuns: PipelineRunObservation[] = [];
  const pipelineAttempts: PipelineAttemptObservation[] = [];
  const pipelineJobs: PipelineJobObservation[] = [];
  const pipelineSteps: PipelineStepObservation[] = [];
  const crosswalks: GitHubActionsRunCrosswalk[] = [];
  let expectedAttempts = 0;
  let expectedJobs = 0;
  let allJobsComplete = true;

  for (const run of runs) {
    const canonicalRunId = runId(run.id);
    const canonicalDefinitionId = githubWorkflowDefinitionId(input.repositoryId, run.path, run.workflow_id);
    pipelineRuns.push({
      kind: 'pipeline-run',
      id: canonicalRunId,
      pipelineDefinitionId: canonicalDefinitionId,
      repositoryId: input.repositoryId,
      revision: input.revision,
      trigger: run.event,
      ...(run.head_branch ? { ref: run.head_branch } : {}),
      createdAt: run.created_at,
      source: { kind: 'ci', id: `github-actions:run:${run.id}` },
      url: run.html_url,
    });

    expectedAttempts += run.run_attempt;
    const firstAttempt = Math.max(1, run.run_attempt - limits.maxAttemptsPerRun + 1);
    const attemptCrosswalks: GitHubActionsAttemptCrosswalk[] = [];
    for (let attempt = firstAttempt; attempt <= run.run_attempt; attempt += 1) {
      const attemptRun = attempt === run.run_attempt
        ? run
        : await input.client.getWorkflowRunAttempt(input.owner, input.repo, run.id, attempt);
      if (attemptRun.id !== run.id || attemptRun.run_attempt !== attempt || attemptRun.head_sha !== input.revision) {
        throw new Error(`GitHub Actions attempt identity mismatch for run ${run.id} attempt ${attempt}`);
      }
      pipelineAttempts.push(attemptObservation(attemptRun));
      const jobPage = await input.client.listWorkflowJobsForAttempt(
        input.owner,
        input.repo,
        run.id,
        attempt,
        limits.maxJobPagesPerAttempt,
      );
      expectedJobs += jobPage.totalCount;
      allJobsComplete &&= jobPage.complete;
      const jobs = jobPage.items.filter(job => job.run_id === run.id).sort((left, right) => left.id - right.id);
      const jobCrosswalks: GitHubActionsJobCrosswalk[] = [];
      for (const job of jobs) {
        pipelineJobs.push(jobObservation(job, run.id, attempt));
        pipelineSteps.push(...stepObservations(job));
        const providerCheckRunId = checkRunId(job.check_run_url);
        jobCrosswalks.push({
          pipelineJobId: jobId(job.id),
          providerJobId: job.id,
          ...(providerCheckRunId !== undefined ? { providerCheckRunId } : {}),
        });
      }
      attemptCrosswalks.push({ pipelineAttemptId: attemptId(run.id, attempt), attempt, jobs: jobCrosswalks });
    }
    crosswalks.push({
      pipelineRunId: canonicalRunId,
      pipelineDefinitionId: canonicalDefinitionId,
      providerWorkflowId: run.workflow_id,
      ...(normalizeGitHubWorkflowPath(run.path) ? { providerWorkflowPath: normalizeGitHubWorkflowPath(run.path) } : {}),
      providerRunId: run.id,
      providerCheckSuiteId: run.check_suite_id,
      providerCheckRunIds: (input.checkRuns ?? [])
        .filter(check => check.check_suite?.id === run.check_suite_id)
        .map(check => check.id)
        .sort((left, right) => left - right),
      attempts: attemptCrosswalks,
    });
  }

  const runsComplete = runPage.complete && uniqueRuns.length <= limits.maxRuns;
  const attemptsComplete = pipelineAttempts.length === expectedAttempts;
  const jobsComplete = allJobsComplete && pipelineJobs.length === expectedJobs;
  return {
    pipelineRuns,
    pipelineAttempts,
    pipelineJobs,
    pipelineSteps,
    crosswalks,
    completeness: [
      completeness(
        'github-actions-runs',
        runsComplete,
        runs.length,
        runPage.totalCount,
        `bounded to ${limits.maxRuns} runs from at most ${limits.maxRunPages * 100} workflow-run results for the revision`,
      ),
      completeness(
        'github-actions-attempts',
        attemptsComplete,
        pipelineAttempts.length,
        expectedAttempts,
        `bounded to the ${limits.maxAttemptsPerRun} most recent attempts per run`,
      ),
      completeness(
        'github-actions-jobs',
        jobsComplete,
        pipelineJobs.length,
        expectedJobs,
        `bounded to ${limits.maxJobPagesPerAttempt * 100} jobs per attempt`,
      ),
      {
        source: 'github-actions-steps',
        state: jobsComplete ? 'COMPLETE' : 'PARTIAL',
        observedCount: pipelineSteps.length,
        ...(!jobsComplete ? { reason: 'steps are embedded in a truncated job response' } : {}),
      },
    ],
  };
}
