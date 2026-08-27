import { describe, expect, it, vi } from 'vitest';
import type { ActivityQueryV1, ActivityResponseV1, EvaluationDetailResponseV1, ViewerV1 } from '@spark/dashboard-contracts';
import { handleRequest, type Env, type WorkerExecutionContext } from '../src/app';
import type { DashboardAuthorizer } from '../src/dashboard-access';
import type { DashboardReader } from '../src/dashboard-reader';

const viewer: ViewerV1 = { version: 1, id: 7, login: 'marguel', avatarUrl: 'https://avatars.githubusercontent.com/u/7' };

const activity: ActivityResponseV1 = {
  version: 1,
  selectedWindow: '7d',
  selectedAttention: 'ALL',
  selectedRepositoryId: null,
  counts: { LOW: 1, MEDIUM: 0, HIGH: 0 },
  repositories: [{ id: 2, owner: 'acme', name: 'repo', url: 'https://github.com/acme/repo', evaluationCount: 1 }],
  evaluations: [],
  pagination: { nextCursor: null },
};

const unavailable: EvaluationDetailResponseV1 = {
  version: 1,
  status: 'unavailable',
  reason: 'LEGACY_RECORD',
  summary: {
    repository: { id: 2, owner: 'acme', name: 'repo', url: 'https://github.com/acme/repo' },
    pullRequest: { number: 3, title: 'PR #3', url: 'https://github.com/acme/repo/pull/3' },
    headSha: 'sha',
    attention: 'LOW',
    topReasons: [],
    changeSummary: { files: 0, extensions: [] },
    sensitiveSurfaces: [],
    evidenceSummary: { passed: 0, pending: 0, failed: 0, missing: 0, unknown: 0 },
    evaluatedAt: '2026-08-27T12:00:00.000Z',
    githubCheckUrl: 'https://github.com/acme/repo/pull/3/checks',
    detailAvailable: false,
  },
};

const env: Env = {
  DB: {} as Env['DB'],
  GITHUB_APP_ID: '42',
  GITHUB_PRIVATE_KEY: 'unused',
  GITHUB_WEBHOOK_SECRET: 'secret',
};

const context: WorkerExecutionContext = { waitUntil: () => undefined };

function authorizer(repositoryIds = [2]): DashboardAuthorizer {
  return { authorize: async () => ({ viewer, repositoryIds }) };
}

function reader() {
  return {
    activity: vi.fn(async (_query: ActivityQueryV1) => activity),
    evaluation: vi.fn(async () => unavailable),
  } satisfies DashboardReader;
}

describe('dashboard read API', () => {
  it('denies dashboard API requests by default until authentication is implemented', async () => {
    const response = await handleRequest(new Request('https://spark.test/api/me'), env, context);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('returns the authorized viewer identity', async () => {
    const response = await handleRequest(new Request('https://spark.test/api/me'), env, context, {
      dashboardAuthorizer: authorizer(),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(viewer);
  });

  it('parses activity filters and passes only authorized repositories to the reader', async () => {
    const dashboardReader = reader();
    const response = await handleRequest(
      new Request('https://spark.test/api/activity?window=24h&attention=HIGH&repositoryId=2&limit=25&cursor=abc'),
      env,
      context,
      { dashboardAuthorizer: authorizer([2, 4]), dashboardReader },
    );
    expect(response.status).toBe(200);
    expect(dashboardReader.activity).toHaveBeenCalledWith({
      window: '24h', attention: 'HIGH', repositoryId: 2, limit: 25, cursor: 'abc',
    }, [2, 4]);
  });

  it('fails closed for repository filters outside the authorized scope', async () => {
    const dashboardReader = reader();
    const response = await handleRequest(
      new Request('https://spark.test/api/activity?repositoryId=99'),
      env,
      context,
      { dashboardAuthorizer: authorizer([2]), dashboardReader },
    );
    expect(response.status).toBe(404);
    expect(dashboardReader.activity).not.toHaveBeenCalled();
  });

  it('rejects malformed activity query values', async () => {
    const response = await handleRequest(
      new Request('https://spark.test/api/activity?window=forever&attention=URGENT'),
      env,
      context,
      { dashboardAuthorizer: authorizer() },
    );
    expect(response.status).toBe(400);
  });

  it('returns a stored evaluation only inside the authorized repository scope', async () => {
    const dashboardReader = reader();
    const allowed = await handleRequest(
      new Request('https://spark.test/api/evaluations/2/sha'),
      env,
      context,
      { dashboardAuthorizer: authorizer([2]), dashboardReader },
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual(unavailable);
    expect(dashboardReader.evaluation).toHaveBeenCalledWith(2, 'sha');

    const denied = await handleRequest(
      new Request('https://spark.test/api/evaluations/3/sha'),
      env,
      context,
      { dashboardAuthorizer: authorizer([2]), dashboardReader },
    );
    expect(denied.status).toBe(404);
  });
});
