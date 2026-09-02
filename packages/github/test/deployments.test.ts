import { describe, expect, it, vi } from 'vitest';
import {
  acquireGitHubDeployments,
  deriveDeploymentApprovalState,
  GitHubApiClient,
  normalizeGitHubDeploymentState,
  type AcquireGitHubDeploymentsInput,
  type GitHubDeployment,
  type GitHubDeploymentStatus,
  type GitHubEnvironmentPendingDeployments,
} from '../src';
import { ciProcessScenarios } from './fixtures/ci-process-corpus';

function deployment(overrides: Partial<GitHubDeployment> = {}): GitHubDeployment {
  return {
    id: 6001,
    sha: 'b4c5d6e7f8a9',
    ref: 'feature/deploy',
    environment: 'production',
    created_at: '2026-08-31T15:00:00Z',
    ...overrides,
  };
}

function status(overrides: Partial<GitHubDeploymentStatus> = {}): GitHubDeploymentStatus {
  return {
    id: 6101,
    deployment_id: 6001,
    state: 'pending',
    environment: 'production',
    created_at: '2026-08-31T15:00:01Z',
    ...overrides,
  };
}

function pendingEnvironment(reviewers = 1): GitHubEnvironmentPendingDeployments {
  return {
    deployments: [{ id: 6001, environment: 'production', status: { id: 6101, state: 'pending' } }],
    reviewers: Array.from({ length: reviewers }, () => ({ type: 'Team' as const })),
  };
}

interface FakeDeploymentClient {
  deployments?: GitHubDeployment[];
  deploymentCount?: number;
  deploymentComplete?: boolean;
  statuses?: Map<number, GitHubDeploymentStatus[]>;
  statusComplete?: boolean;
  /** Environments known to the fake; absent names simulate an unknown environment (404). */
  environments?: Map<string, GitHubEnvironmentPendingDeployments>;
}

function fakeClient(options: FakeDeploymentClient = {}): GitHubApiClient {
  return {
    listDeploymentsForRevision: async () => ({
      items: options.deployments ?? [],
      totalCount: options.deploymentCount ?? (options.deployments?.length ?? 0),
      complete: options.deploymentComplete ?? true,
    }),
    listDeploymentStatuses: async (_owner: string, _repo: string, id: number) => {
      const items = options.statuses?.get(id) ?? [];
      return { items, totalCount: items.length, complete: options.statusComplete ?? true };
    },
    getEnvironmentPendingDeployments: async (_owner: string, _repo: string, environment: string) =>
      options.environments?.get(environment),
  } as unknown as GitHubApiClient;
}

function acquire(client: GitHubApiClient, revision = 'b4c5d6e7f8a9', limits?: AcquireGitHubDeploymentsInput['limits']) {
  return acquireGitHubDeployments({
    client, owner: 'acme', repo: 'widgets', repositoryId: 'repository:acme/widgets', revision, limits,
  });
}

describe('GitHub deployment source client', () => {
  it('paginates exact-revision deployments across pages', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('sha')).toBe('revision-1');
      expect(url.searchParams.get('per_page')).toBe('100');
      const page = Number(url.searchParams.get('page'));
      const count = page === 1 ? 100 : 20;
      return new Response(JSON.stringify({
        total_count: 120,
        deployments: Array.from({ length: count }, (_, index) => ({
          id: page * 1000 + index, sha: 'revision-1',
          ref: 'main', environment: 'production', created_at: '2026-08-31T15:00:00Z',
        })),
      }));
    });
    const client = new GitHubApiClient('not-logged', fetcher as typeof fetch, 'https://api.github.test');

    const result = await client.listDeploymentsForRevision('acme', 'widgets', 'revision-1', 2);

    expect(result).toMatchObject({ totalCount: 120, complete: true });
    expect(result.items).toHaveLength(120);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('drops provider results for other revisions and reports partial completeness', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get('page'));
      const count = page === 1 ? 100 : 20;
      return new Response(JSON.stringify({
        total_count: 120,
        deployments: Array.from({ length: count }, (_, index) => ({
          id: page * 1000 + index, sha: page === 2 ? 'other-revision' : 'revision-1',
          ref: 'main', environment: 'production', created_at: '2026-08-31T15:00:00Z',
        })),
      }));
    });
    const client = new GitHubApiClient('not-logged', fetcher as typeof fetch, 'https://api.github.test');

    const result = await client.listDeploymentsForRevision('acme', 'widgets', 'revision-1', 2);

    expect(result.totalCount).toBe(120);
    expect(result.complete).toBe(false);
    expect(result.items).toHaveLength(100);
    expect(result.items.every(item => item.sha === 'revision-1')).toBe(true);
  });

  it('exposes status truncation for one deployment', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/repos/acme/widgets/deployments/6001/statuses');
      return new Response(JSON.stringify({
        total_count: 101,
        statuses: Array.from({ length: 100 }, (_, index) => ({
          id: 9000 + index, deployment_id: 6001, state: 'success', environment: 'production',
          created_at: '2026-08-31T15:00:00Z',
        })),
      }));
    });
    const client = new GitHubApiClient('not-logged', fetcher as typeof fetch, 'https://api.github.test');

    const result = await client.listDeploymentStatuses('acme', 'widgets', 6001, 1);

    expect(result).toMatchObject({ totalCount: 101, complete: false });
    expect(result.items).toHaveLength(100);
  });

  it('treats a missing environment as unknown rather than an error', async () => {
    const fetcher = vi.fn(async () => new Response('not found', { status: 404 }));
    const client = new GitHubApiClient('not-logged', fetcher as typeof fetch, 'https://api.github.test');

    await expect(client.getEnvironmentPendingDeployments('acme', 'widgets', 'staging')).resolves.toBeUndefined();
  });
});describe('deployment state normalization', () => {
  it.each([
    ['pending', undefined, 'QUEUED', 'UNKNOWN'],
    ['queued', undefined, 'QUEUED', 'UNKNOWN'],
    ['in_progress', undefined, 'RUNNING', 'UNKNOWN'],
    ['success', null, 'COMPLETED', 'PASSED'],
    ['success', 'ok', 'COMPLETED', 'PASSED'],
    ['success', 'error', 'COMPLETED', 'FAILED'],
    ['success', 'inactive', 'COMPLETED', 'UNKNOWN'],
    ['failure', 'ok', 'COMPLETED', 'FAILED'],
    ['future_state', null, 'UNKNOWN', 'UNKNOWN'],
  ])('maps %s / guidance %s to %s / %s', (state, guidance, lifecycle, outcome) => {
    expect(normalizeGitHubDeploymentState(state, guidance)).toEqual({ lifecycle, outcome });
  });
});

describe('deployment approval state derivation', () => {
  it('keeps approval UNKNOWN when the environment configuration is unreadable', () => {
    expect(deriveDeploymentApprovalState('pending', undefined)).toBe('UNKNOWN');
    expect(deriveDeploymentApprovalState('success', undefined)).toBe('UNKNOWN');
  });

  it('keeps approval UNKNOWN when no status has been observed yet', () => {
    expect(deriveDeploymentApprovalState(undefined, pendingEnvironment(1))).toBe('UNKNOWN');
    expect(deriveDeploymentApprovalState(undefined, pendingEnvironment(0))).toBe('UNKNOWN');
  });

  it('reports waiting for approval in a review environment without failing it', () => {
    expect(deriveDeploymentApprovalState('pending', pendingEnvironment(1))).toBe('WAITING');
    expect(deriveDeploymentApprovalState('queued', pendingEnvironment(1))).toBe('WAITING');
    expect(deriveDeploymentApprovalState('pending', pendingEnvironment(0))).toBe('NOT_REQUIRED');
  });

  it('reports approval only after the deployment passed a review gate', () => {
    expect(deriveDeploymentApprovalState('in_progress', pendingEnvironment(1))).toBe('APPROVED');
    expect(deriveDeploymentApprovalState('success', pendingEnvironment(1))).toBe('APPROVED');
    expect(deriveDeploymentApprovalState('failure', pendingEnvironment(1))).toBe('APPROVED');
    expect(deriveDeploymentApprovalState('failure', pendingEnvironment(0))).toBe('NOT_REQUIRED');
    expect(deriveDeploymentApprovalState('future_state', pendingEnvironment(1))).toBe('UNKNOWN');
  });
});describe('GitHub deployment acquisition', () => {
  it('reconstructs the awaiting-approval scenario from the G0 corpus', async () => {
    const scenario = ciProcessScenarios.find(item => item.id === 'deployment-awaiting-approval')!;
    const raw = scenario.raw.deployment!;
    const truth = scenario.truth.find(unit => unit.subject === 'deployment:production')!;
    const client = fakeClient({
      deployments: [raw.deployment as unknown as GitHubDeployment],
      statuses: new Map([[raw.deployment.id, raw.statuses as unknown as GitHubDeploymentStatus[]]]),
      environments: new Map([[raw.deployment.environment, pendingEnvironment(1)]]),
    });

    const result = await acquire(client, scenario.revision);

    expect(result.deployments).toHaveLength(1);
    const observation = result.deployments[0];
    expect(observation.repositoryId).toBe('repository:acme/widgets');
    expect(observation.revision).toBe(scenario.revision);
    expect(observation.environment).toBe('production');
    expect(observation.lifecycle).toBe(truth.lifecycle);
    expect(observation.outcome).toBe(truth.outcome);
    expect(observation.approvalState).toBe('WAITING');
    expect(result.completeness.map(item => item.state)).toEqual(['COMPLETE', 'COMPLETE', 'COMPLETE']);
    expect(result.crosswalks).toEqual([expect.objectContaining({
      deploymentId: `deployment:github-actions:${raw.deployment.id}`,
      providerDeploymentId: raw.deployment.id,
      providerStatusId: raw.statuses[0].id,
    })]);
  });

  it('reconstructs the failure-after-green-CI scenario with an unknown approval gate', async () => {
    const scenario = ciProcessScenarios.find(item => item.id === 'deployment-failure-after-green-ci')!;
    const raw = scenario.raw.deployment!;
    const truth = scenario.truth.find(unit => unit.subject === 'deployment:production')!;
    const client = fakeClient({
      deployments: [raw.deployment as unknown as GitHubDeployment],
      statuses: new Map([[raw.deployment.id, raw.statuses as unknown as GitHubDeploymentStatus[]]]),
    });

    const result = await acquire(client, scenario.revision);

    const observation = result.deployments[0];
    expect(observation.lifecycle).toBe(truth.lifecycle);
    expect(observation.outcome).toBe(truth.outcome);
    expect(observation.approvalState).toBe('UNKNOWN');
    expect(observation.completedAt).toBe(raw.statuses[0].updated_at);
    const environmentCompleteness = result.completeness.find(item => item.source === 'github-deployment-environments')!;
    expect(environmentCompleteness.state).toBe('PARTIAL');
  });

  it('excludes deployments of another exact revision', async () => {
    const client = fakeClient({
      deployments: [deployment(), deployment({ id: 6002, sha: 'other-revision' })],
      statuses: new Map([
        [6001, [status()]],
        [6002, [status({ id: 6102, deployment_id: 6002 })]],
      ]),
    });

    const result = await acquire(client);

    expect(result.deployments.map(item => item.id)).toEqual(['deployment:github-actions:6001']);
  });  it('links a deployment to its workflow run only when the provider identifies one', async () => {
    const client = fakeClient({
      deployments: [deployment({ task_id: 50040, html_url: 'https://github.test/acme/widgets/deployments/6001' })],
      statuses: new Map([[6001, [status({ state: 'success' })]]]),
      environments: new Map([['production', pendingEnvironment(0)]]),
    });

    const result = await acquire(client);

    expect(result.deployments[0].pipelineRunId).toBe('pipeline-run:github-actions:50040');
    expect(result.deployments[0].url).toBe('https://github.test/acme/widgets/deployments/6001');
    expect(result.crosswalks[0].providerTaskId).toBe(50040);
  });

  it('reports queued/unknown when no status has been observed', async () => {
    const client = fakeClient({
      deployments: [deployment()],
      environments: new Map([['production', pendingEnvironment(1)]]),
    });

    const result = await acquire(client);

    const observation = result.deployments[0];
    expect(observation.lifecycle).toBe('QUEUED');
    expect(observation.outcome).toBe('UNKNOWN');
    expect(observation.approvalState).toBe('UNKNOWN');
    expect(observation.providerStatusId).toBeUndefined();
  });

  it('does not count a completed deployment as successful when the environment reports an error', async () => {
    const client = fakeClient({
      deployments: [deployment()],
      statuses: new Map([[6001, [status({ state: 'success', environment_guidance: 'error' })]]]),
      environments: new Map([['production', pendingEnvironment(0)]]),
    });

    const result = await acquire(client);

    expect(result.deployments[0].lifecycle).toBe('COMPLETED');
    expect(result.deployments[0].outcome).toBe('FAILED');
  });

  it('derives start and completion from the status sequence in provider order', async () => {
    const client = fakeClient({
      deployments: [deployment()],
      statuses: new Map([[6001, [
        status({ id: 6103, state: 'success', created_at: '2026-08-31T15:20:00Z', updated_at: '2026-08-31T15:20:30Z' }),
        status({ id: 6102, state: 'in_progress', created_at: '2026-08-31T15:10:00Z' }),
        status({ id: 6101, state: 'pending', created_at: '2026-08-31T15:00:01Z' }),
      ]]]),
      environments: new Map([['production', pendingEnvironment(1)]]),
    });

    const result = await acquire(client);

    const observation = result.deployments[0];
    expect(observation.lifecycle).toBe('COMPLETED');
    expect(observation.outcome).toBe('PASSED');
    expect(observation.approvalState).toBe('APPROVED');
    expect(observation.startedAt).toBe('2026-08-31T15:10:00Z');
    expect(observation.completedAt).toBe('2026-08-31T15:20:30Z');
    expect(observation.providerStatusId).toBe('6103');
  });

  it('orders deployments deterministically and reports list truncation', async () => {
    const client = fakeClient({
      deployments: [deployment({ id: 6003 }), deployment()],
      deploymentComplete: true,
    });

    const truncated = await acquire(client, 'b4c5d6e7f8a9', { maxDeployments: 1 });
    expect(truncated.deployments.map(item => item.id)).toEqual(['deployment:github-actions:6001']);
    expect(truncated.completeness.find(item => item.source === 'github-deployments')).toMatchObject({
      state: 'PARTIAL', observedCount: 1, expectedCount: 2,
    });

    const complete = await acquire(client);
    expect(complete.deployments.map(item => item.id)).toEqual([
      'deployment:github-actions:6001',
      'deployment:github-actions:6003',
    ]);
  });

  it('reports NOT_REQUIRED for environments without a review gate', async () => {
    const client = fakeClient({
      deployments: [deployment()],
      statuses: new Map([[6001, [status()]]]),
      environments: new Map([['production', pendingEnvironment(0)]]),
    });

    const result = await acquire(client);

    expect(result.deployments[0].approvalState).toBe('NOT_REQUIRED');
    expect(result.completeness.every(item => item.state === 'COMPLETE')).toBe(true);
  });
});