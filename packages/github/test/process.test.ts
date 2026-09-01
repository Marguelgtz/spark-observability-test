import { describe, expect, it, vi } from 'vitest';
import {
  acquireGitHubActionsProcess,
  GitHubApiClient,
  normalizeGitHubProcessState,
  type GitHubCheckRun,
  type GitHubWorkflowJob,
  type GitHubWorkflowRun,
} from '../src';
import { ciProcessScenarios } from './fixtures/ci-process-corpus';

function workflowRun(overrides: Partial<GitHubWorkflowRun> = {}): GitHubWorkflowRun {
  return {
    id: 50040,
    workflow_id: 300,
    check_suite_id: 70040,
    name: 'Verify',
    path: '.github/workflows/verify.yml@main',
    head_sha: 'revision-1',
    head_branch: 'feature/process',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    created_at: '2026-08-31T10:00:00Z',
    updated_at: '2026-08-31T10:05:00Z',
    run_started_at: '2026-08-31T10:00:05Z',
    html_url: 'https://github.test/acme/widgets/actions/runs/50040',
    ...overrides,
  };
}

function workflowJob(overrides: Partial<GitHubWorkflowJob> = {}): GitHubWorkflowJob {
  return {
    id: 9041,
    run_id: 50040,
    name: 'verify',
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-08-31T10:00:10Z',
    completed_at: '2026-08-31T10:04:00Z',
    html_url: 'https://github.test/acme/widgets/actions/runs/50040/job/9041',
    check_run_url: 'https://api.github.test/repos/acme/widgets/check-runs/9041',
    steps: [{
      number: 1,
      name: 'Unit tests',
      status: 'completed',
      conclusion: 'success',
      started_at: '2026-08-31T10:01:00Z',
      completed_at: '2026-08-31T10:03:00Z',
    }],
    ...overrides,
  };
}

describe('GitHub Actions source client', () => {
  it('paginates exact-revision runs and reports the provider total', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('head_sha')).toBe('revision-1');
      expect(url.searchParams.get('per_page')).toBe('100');
      const page = Number(url.searchParams.get('page'));
      const count = page === 1 ? 100 : 50;
      return new Response(JSON.stringify({
        total_count: 150,
        workflow_runs: Array.from({ length: count }, (_, index) => workflowRun({ id: page * 1_000 + index })),
      }));
    });
    const client = new GitHubApiClient('not-logged', fetcher as typeof fetch, 'https://api.github.test');

    const result = await client.listWorkflowRunsForRevision('acme', 'widgets', 'revision-1', 3);

    expect(result).toMatchObject({ totalCount: 150, complete: true });
    expect(result.items).toHaveLength(150);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses the attempt-specific jobs endpoint and exposes truncation', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/repos/acme/widgets/actions/runs/50040/attempts/2/jobs');
      return new Response(JSON.stringify({
        total_count: 101,
        jobs: Array.from({ length: 100 }, (_, index) => workflowJob({ id: 10_000 + index })),
      }));
    });
    const client = new GitHubApiClient('not-logged', fetcher as typeof fetch, 'https://api.github.test');

    const result = await client.listWorkflowJobsForAttempt('acme', 'widgets', 50040, 2, 1);

    expect(result).toMatchObject({ totalCount: 101, complete: false });
    expect(result.items).toHaveLength(100);
  });
});

describe('GitHub Actions process normalization', () => {
  it.each([
    ['queued', null, 'QUEUED', 'UNKNOWN'],
    ['in_progress', null, 'RUNNING', 'UNKNOWN'],
    ['completed', 'success', 'COMPLETED', 'PASSED'],
    ['completed', 'failure', 'COMPLETED', 'FAILED'],
    ['completed', 'timed_out', 'COMPLETED', 'FAILED'],
    ['completed', 'neutral', 'COMPLETED', 'NEUTRAL'],
    ['completed', 'skipped', 'COMPLETED', 'SKIPPED'],
    ['completed', 'cancelled', 'CANCELLED', 'UNKNOWN'],
    ['future_status', 'success', 'UNKNOWN', 'UNKNOWN'],
  ])('maps %s/%s to %s/%s', (status, conclusion, lifecycle, outcome) => {
    expect(normalizeGitHubProcessState(status, conclusion)).toEqual({ lifecycle, outcome });
  });

  it('keeps one logical run with separately fetched failed and passed attempts', async () => {
    const scenario = ciProcessScenarios.find(item => item.id === 'same-sha-rerun')!;
    const [firstRaw, latestRaw] = scenario.raw.actionsRuns!;
    const latest = workflowRun({ ...latestRaw, workflow_id: 300, html_url: 'https://github.test/acme/widgets/actions/runs/50040' });
    const first = workflowRun({
      ...firstRaw, workflow_id: 300, updated_at: '2026-08-31T10:02:00Z',
      html_url: 'https://github.test/acme/widgets/actions/runs/50040',
    });
    const [firstJob, latestJob] = scenario.raw.jobs!;
    const jobs = new Map<number, GitHubWorkflowJob[]>([
      [1, [workflowJob({ ...firstJob, check_run_url: 'https://api.github.test/repos/acme/widgets/check-runs/9040' })]],
      [2, [workflowJob({ ...latestJob })]],
    ]);
    const client = {
      listWorkflowRunsForRevision: async () => ({ items: [latest], totalCount: 1, complete: true }),
      getWorkflowRunAttempt: async (_owner: string, _repo: string, _runId: number, attempt: number) => {
        expect(attempt).toBe(1);
        return first;
      },
      listWorkflowJobsForAttempt: async (_owner: string, _repo: string, _runId: number, attempt: number) => ({
        items: jobs.get(attempt)!, totalCount: 1, complete: true,
      }),
    } as unknown as GitHubApiClient;
    const checkRuns: GitHubCheckRun[] = scenario.raw.checkRuns;

    const result = await acquireGitHubActionsProcess({
      client, owner: 'acme', repo: 'widgets', repositoryId: 'repository:acme/widgets', revision: scenario.revision, checkRuns,
    });

    expect(result.pipelineRuns).toHaveLength(1);
    expect(result.pipelineRuns[0]).toMatchObject({
      id: 'pipeline-run:github-actions:50040',
      pipelineDefinitionId: 'pipeline-definition:github-actions:300',
    });
    expect(result.pipelineAttempts.map(item => [item.attempt, item.lifecycle, item.outcome])).toEqual([
      [1, 'COMPLETED', 'FAILED'],
      [2, 'COMPLETED', 'PASSED'],
    ]);
    expect(result.pipelineAttempts.every(item => item.completedAt === undefined)).toBe(true);
    expect(result.pipelineJobs.map(item => [item.id, item.pipelineAttemptId, item.outcome])).toEqual([
      ['pipeline-job:github-actions:9040', 'pipeline-attempt:github-actions:50040:1', 'FAILED'],
      ['pipeline-job:github-actions:9041', 'pipeline-attempt:github-actions:50040:2', 'PASSED'],
    ]);
    expect(result.pipelineSteps).toHaveLength(2);
    expect(result.crosswalks[0]).toMatchObject({
      providerWorkflowId: 300,
      providerRunId: 50040,
      providerCheckSuiteId: 70040,
      providerCheckRunIds: [9041],
      attempts: [
        { attempt: 1, jobs: [{ providerJobId: 9040, providerCheckRunId: 9040 }] },
        { attempt: 2, jobs: [{ providerJobId: 9041, providerCheckRunId: 9041 }] },
      ],
    });
    expect(result.completeness.map(item => item.state)).toEqual(['COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE']);
  });

  it('preserves distinct matrix-like display executions and skipped jobs without inventing structure', async () => {
    const matrixJobs = [
      workflowJob({ id: 9081, name: 'test (linux, node 20)' }),
      workflowJob({ id: 9082, name: 'test (linux, node 22)' }),
      workflowJob({ id: 9083, name: 'test (windows, node 20)' }),
      workflowJob({ id: 9084, name: 'integration', conclusion: 'skipped' }),
    ];
    const client = {
      listWorkflowRunsForRevision: async () => ({ items: [workflowRun()], totalCount: 1, complete: true }),
      listWorkflowJobsForAttempt: async () => ({ items: matrixJobs, totalCount: 4, complete: true }),
    } as unknown as GitHubApiClient;

    const result = await acquireGitHubActionsProcess({
      client, owner: 'acme', repo: 'widgets', repositoryId: 'repository:acme/widgets', revision: 'revision-1',
    });

    expect(result.pipelineJobs.map(job => [job.id, job.name, job.outcome])).toEqual([
      ['pipeline-job:github-actions:9081', 'test (linux, node 20)', 'PASSED'],
      ['pipeline-job:github-actions:9082', 'test (linux, node 22)', 'PASSED'],
      ['pipeline-job:github-actions:9083', 'test (windows, node 20)', 'PASSED'],
      ['pipeline-job:github-actions:9084', 'integration', 'SKIPPED'],
    ]);
    expect(result.pipelineJobs.every(job => job.matrix === undefined && job.needs === undefined)).toBe(true);
  });

  it('retains the newest bounded attempt window and reports partial completeness', async () => {
    const latest = workflowRun({ run_attempt: 12 });
    const client = {
      listWorkflowRunsForRevision: async () => ({ items: [latest], totalCount: 1, complete: true }),
      getWorkflowRunAttempt: async (_owner: string, _repo: string, _runId: number, attempt: number) => workflowRun({ run_attempt: attempt }),
      listWorkflowJobsForAttempt: async (_owner: string, _repo: string, _runId: number, attempt: number) => ({
        items: [workflowJob({ id: 10_000 + attempt })], totalCount: 1, complete: true,
      }),
    } as unknown as GitHubApiClient;

    const result = await acquireGitHubActionsProcess({
      client, owner: 'acme', repo: 'widgets', repositoryId: 'repository:acme/widgets', revision: 'revision-1',
      limits: { maxAttemptsPerRun: 2 },
    });

    expect(result.pipelineAttempts.map(item => item.attempt)).toEqual([11, 12]);
    expect(result.completeness.find(item => item.source === 'github-actions-attempts')).toMatchObject({
      state: 'PARTIAL', observedCount: 2, expectedCount: 12,
    });
  });

  it('bounds logical-run expansion even when the run-list page itself is complete', async () => {
    const client = {
      listWorkflowRunsForRevision: async () => ({
        items: [workflowRun({ id: 1 }), workflowRun({ id: 2 })], totalCount: 2, complete: true,
      }),
      listWorkflowJobsForAttempt: async () => ({ items: [], totalCount: 0, complete: true }),
    } as unknown as GitHubApiClient;

    const result = await acquireGitHubActionsProcess({
      client, owner: 'acme', repo: 'widgets', repositoryId: 'repository:acme/widgets', revision: 'revision-1',
      limits: { maxRuns: 1 },
    });

    expect(result.pipelineRuns.map(run => run.id)).toEqual(['pipeline-run:github-actions:1']);
    expect(result.completeness.find(item => item.source === 'github-actions-runs')).toMatchObject({
      state: 'PARTIAL', observedCount: 1, expectedCount: 2,
    });
  });

  it('distinguishes a corrective new revision through revision and logical-run identity', async () => {
    const clientFor = (run: GitHubWorkflowRun) => ({
      listWorkflowRunsForRevision: async () => ({ items: [run], totalCount: 1, complete: true }),
      listWorkflowJobsForAttempt: async () => ({ items: [], totalCount: 0, complete: true }),
    }) as unknown as GitHubApiClient;
    const failed = await acquireGitHubActionsProcess({
      client: clientFor(workflowRun({ id: 70, head_sha: 'revision-a', conclusion: 'failure' })),
      owner: 'acme', repo: 'widgets', repositoryId: 'repository:acme/widgets', revision: 'revision-a',
    });
    const corrected = await acquireGitHubActionsProcess({
      client: clientFor(workflowRun({ id: 71, head_sha: 'revision-b', conclusion: 'success' })),
      owner: 'acme', repo: 'widgets', repositoryId: 'repository:acme/widgets', revision: 'revision-b',
    });

    expect(failed.pipelineRuns[0]).toMatchObject({ id: 'pipeline-run:github-actions:70', revision: 'revision-a' });
    expect(corrected.pipelineRuns[0]).toMatchObject({ id: 'pipeline-run:github-actions:71', revision: 'revision-b' });
    expect(failed.pipelineAttempts[0].outcome).toBe('FAILED');
    expect(corrected.pipelineAttempts[0].outcome).toBe('PASSED');
  });
});
