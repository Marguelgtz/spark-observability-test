import { describe, expect, it, vi } from 'vitest';
import type {
  ActivityQueryV1,
  ActivityResponseV1,
  EvaluationDetailResponseV1,
  PullRequestDetailV1,
  PullRequestHistoryResponseV1,
  ViewerV1
} from '@spark/dashboard-contracts';
import { handleRequest, type Env, type WorkerExecutionContext } from '../src/app';
import type { DashboardAuthorizer } from '../src/dashboard-access';
import type { DashboardFavoriteStore } from '../src/dashboard-favorites';
import type { DashboardReader } from '../src/dashboard-reader';

const viewer: ViewerV1 = { version: 1, id: 7, login: 'marguel', avatarUrl: 'https://avatars.githubusercontent.com/u/7' };

const summary = {
  repository: { id: 2, owner: 'acme', name: 'repo', url: 'https://github.com/acme/repo' },
  pullRequest: { number: 3, title: 'PR #3', url: 'https://github.com/acme/repo/pull/3' },
  headSha: 'sha',
  attention: 'LOW' as const,
  topReasons: [],
  changeSummary: { files: 0, extensions: [] },
  sensitiveSurfaces: [],
  evidenceSummary: { passed: 0, pending: 0, failed: 0, missing: 0, unknown: 0 },
  evaluatedAt: '2026-08-27T12:00:00.000Z',
  githubCheckUrl: 'https://github.com/acme/repo/pull/3/checks',
  detailAvailable: false,
};

const activity: ActivityResponseV1 = {
  version: 1,
  selectedWindow: '7d',
  selectedAttention: 'ALL',
  selectedRepositoryId: null,
  counts: { LOW: 1, MEDIUM: 0, HIGH: 0 },
  repositories: [{ id: 2, owner: 'acme', name: 'repo', url: 'https://github.com/acme/repo', pullRequestCount: 1 }],
  pullRequests: [{
    repository: summary.repository,
    pullRequest: summary.pullRequest,
    latest: summary,
    history: { runCount: 2, attentionCounts: { LOW: 1, MEDIUM: 1, HIGH: 0 } },
  }],
  pagination: { nextCursor: null },
};

const history: PullRequestHistoryResponseV1 = {
  version: 1,
  repository: summary.repository,
  pullRequest: summary.pullRequest,
  totalRunCount: 2,
  runs: [summary],
  truncated: true,
};

const pullRequest: PullRequestDetailV1 = {
  version: 1,
  repository: summary.repository,
  pullRequest: summary.pullRequest,
  latest: summary,
  history: {
    totalRuns: 2,
    evidenceCounts: { CLEAR: 1, FAILED: 0, PENDING_OR_MISSING: 0, UNKNOWN: 0 },
    attentionCounts: { LOW: 1, MEDIUM: 0, HIGH: 0 },
    firstEvaluatedAt: summary.evaluatedAt,
    lastEvaluatedAt: summary.evaluatedAt,
    currentClearStreak: 1,
    currentFailureStreak: 0,
  },
  evidenceIssues: [],
  transitions: [],
  insights: [{ kind: 'CURRENTLY_CLEAR', headSha: summary.headSha }],
  runs: [summary],
  truncated: true,
};

const unavailable: EvaluationDetailResponseV1 = {
  version: 1,
  status: 'unavailable',
  reason: 'LEGACY_RECORD',
  summary,
};

const runUnavailable: EvaluationDetailResponseV1 = {
  version: 1,
  status: 'unavailable',
  reason: 'LEGACY_RECORD',
  summary: { ...summary, runId: 'run:1', observationSource: 'BACKFILL' },
};

const env: Env = {
  DB: {} as Env['DB'],
  GITHUB_APP_ID: '42',
  GITHUB_PRIVATE_KEY: 'unused',
  GITHUB_WEBHOOK_SECRET: 'secret',
  GITHUB_AUTH_CLIENT_ID: 'Ov.test',
  GITHUB_AUTH_CLIENT_SECRET: 'client-secret',
  GITHUB_APP_SLUG: 'spark-observability',
};

const context: WorkerExecutionContext = { waitUntil: () => undefined };

function authorizer(repositoryIds = [2]): DashboardAuthorizer {
  return {
    authorize: async () => ({
      viewer,
      repositoryIds,
      installationIds: [11],
      sessionExpiresAt: '2026-08-27T22:00:00.000Z',
    }),
  };
}

function reader() {
  return {
    activity: vi.fn(async (_query: ActivityQueryV1) => activity),
    pullRequest: vi.fn(async () => pullRequest),
    pullRequestHistory: vi.fn(async () => history),
    evaluation: vi.fn(async () => unavailable),
    run: vi.fn(async () => runUnavailable),
  } satisfies DashboardReader;
}

function favoriteStore() {
  return {
    list: vi.fn(async () => ({ version: 1 as const, favorites: [] })),
    add: vi.fn(async () => true),
    remove: vi.fn(async () => undefined),
  } satisfies DashboardFavoriteStore;
}

describe('dashboard read API', () => {
  it('denies dashboard API requests without a valid session', async () => {
    const response = await handleRequest(new Request('https://spark.test/api/me'), env, context);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('returns the authorized viewer identity and account summary', async () => {
    const dependencies = { dashboardAuthorizer: authorizer([2, 4]) };
    const viewerResponse = await handleRequest(new Request('https://spark.test/api/me'), env, context, dependencies);
    expect(viewerResponse.status).toBe(200);
    expect(await viewerResponse.json()).toEqual(viewer);

    const accountResponse = await handleRequest(new Request('https://spark.test/api/account'), env, context, dependencies);
    expect(accountResponse.status).toBe(200);
    expect(await accountResponse.json()).toMatchObject({
      version: 1,
      viewer,
      repositoryCount: 2,
      installationCount: 1,
      sessionExpiresAt: '2026-08-27T22:00:00.000Z',
      githubInstallUrl: 'https://github.com/apps/spark-observability/installations/new',
    });
  });

  it('lists favorites for the authenticated viewer and current repository scope', async () => {
    const dashboardFavoriteStore = favoriteStore();
    const response = await handleRequest(
      new Request('https://spark.test/api/favorites'), env, context,
      { dashboardAuthorizer: authorizer([2, 4]), dashboardFavoriteStore },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 1, favorites: [] });
    expect(dashboardFavoriteStore.list).toHaveBeenCalledWith(7, [2, 4]);
  });

  it('adds and removes viewer-scoped favorites with same-origin protection', async () => {
    const dashboardFavoriteStore = favoriteStore();
    const favorite = { kind: 'evaluation', repositoryId: 2, pullRequestNumber: 3, runId: 'run:1', headSha: 'abc1234' };
    const allowed = await handleRequest(new Request('https://spark.test/api/favorites', {
      method: 'PUT',
      headers: { origin: 'https://spark.test', 'content-type': 'application/json' },
      body: JSON.stringify(favorite),
    }), env, context, { dashboardAuthorizer: authorizer([2]), dashboardFavoriteStore });
    expect(allowed.status).toBe(200);
    expect(dashboardFavoriteStore.add).toHaveBeenCalledWith(7, favorite);

    const removed = await handleRequest(new Request('https://spark.test/api/favorites', {
      method: 'DELETE',
      headers: { origin: 'https://spark.test', 'content-type': 'application/json' },
      body: JSON.stringify(favorite),
    }), env, context, { dashboardAuthorizer: authorizer([2]), dashboardFavoriteStore });
    expect(removed.status).toBe(204);
    expect(dashboardFavoriteStore.remove).toHaveBeenCalledWith(7, favorite);

    const crossOrigin = await handleRequest(new Request('https://spark.test/api/favorites', {
      method: 'PUT',
      headers: { origin: 'https://evil.test', 'content-type': 'application/json' },
      body: JSON.stringify(favorite),
    }), env, context, { dashboardAuthorizer: authorizer([2]), dashboardFavoriteStore });
    expect(crossOrigin.status).toBe(403);
  });

  it('rejects invalid and out-of-scope favorite targets', async () => {
    const dashboardFavoriteStore = favoriteStore();
    const outOfScope = await handleRequest(new Request('https://spark.test/api/favorites', {
      method: 'PUT',
      headers: { origin: 'https://spark.test', 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'pull-request', repositoryId: 99, pullRequestNumber: 3 }),
    }), env, context, { dashboardAuthorizer: authorizer([2]), dashboardFavoriteStore });
    expect(outOfScope.status).toBe(404);

    const invalid = await handleRequest(new Request('https://spark.test/api/favorites', {
      method: 'PUT',
      headers: { origin: 'https://spark.test', 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'evaluation', repositoryId: 2, pullRequestNumber: 3 }),
    }), env, context, { dashboardAuthorizer: authorizer([2]), dashboardFavoriteStore });
    expect(invalid.status).toBe(400);
    expect(dashboardFavoriteStore.add).not.toHaveBeenCalled();
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

  it('returns pull request observability only inside the authorized repository scope', async () => {
    const dashboardReader = reader();
    const allowed = await handleRequest(
      new Request('https://spark.test/api/repositories/2/pulls/3'),
      env,
      context,
      { dashboardAuthorizer: authorizer([2]), dashboardReader },
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual(pullRequest);
    expect(dashboardReader.pullRequest).toHaveBeenCalledWith(2, 3);

    const denied = await handleRequest(
      new Request('https://spark.test/api/repositories/3/pulls/3'),
      env,
      context,
      { dashboardAuthorizer: authorizer([2]), dashboardReader },
    );
    expect(denied.status).toBe(404);
    expect(dashboardReader.pullRequest).toHaveBeenCalledTimes(1);
  });

  it('returns pull request history only inside the authorized repository scope', async () => {
    const dashboardReader = reader();
    const allowed = await handleRequest(
      new Request('https://spark.test/api/repositories/2/pulls/3/evaluations'),
      env,
      context,
      { dashboardAuthorizer: authorizer([2]), dashboardReader },
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual(history);
    expect(dashboardReader.pullRequestHistory).toHaveBeenCalledWith(2, 3);

    const denied = await handleRequest(
      new Request('https://spark.test/api/repositories/3/pulls/3/evaluations'),
      env,
      context,
      { dashboardAuthorizer: authorizer([2]), dashboardReader },
    );
    expect(denied.status).toBe(404);
  });

  it('returns an immutable run only inside the authorized repository scope', async () => {
    const dashboardReader = reader();
    const allowed = await handleRequest(
      new Request('https://spark.test/api/repositories/2/runs/run%3A1'),
      env,
      context,
      { dashboardAuthorizer: authorizer([2]), dashboardReader },
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual(runUnavailable);
    expect(dashboardReader.run).toHaveBeenCalledWith(2, 'run:1');

    const denied = await handleRequest(
      new Request('https://spark.test/api/repositories/3/runs/run%3A1'),
      env,
      context,
      { dashboardAuthorizer: authorizer([2]), dashboardReader },
    );
    expect(denied.status).toBe(404);
    expect(dashboardReader.run).toHaveBeenCalledTimes(1);
  });

  it('keeps the SHA evaluation route as repository-scoped latest-by-SHA compatibility', async () => {
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
