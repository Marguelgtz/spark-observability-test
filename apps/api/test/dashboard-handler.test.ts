import { describe, expect, it, vi } from 'vitest';
import type { ActivityResponseV1, ViewerV1 } from '@spark/dashboard-contracts';
import type { ActiveChangesV1 } from '@spark/dashboard-contracts/dashboard';
import type { Env } from '../src/app';
import type { DashboardAuthorizer } from '../src/dashboard-access';
import { handleOperationalDashboardRequest } from '../src/dashboard-handler';
import type { DashboardReader } from '../src/dashboard-reader';

const viewer: ViewerV1 = { version: 1, id: 7, login: 'marguel', avatarUrl: 'https://avatars.githubusercontent.com/u/7' };
const latest = {
  repository: { id: 2, owner: 'acme', name: 'repo', url: 'https://github.com/acme/repo' },
  pullRequest: { number: 3, title: 'Tighten auth checks', url: 'https://github.com/acme/repo/pull/3' },
  headSha: 'abc123',
  attention: 'HIGH' as const,
  topReasons: ['Integration evidence failed'],
  changeSummary: { files: 2, extensions: [{ extension: '.ts', count: 2 }] },
  sensitiveSurfaces: ['auth/security'],
  evidenceSummary: { passed: 1, pending: 0, failed: 1, missing: 0, unknown: 0 },
  evaluatedAt: '2026-08-29T11:00:00.000Z',
  githubCheckUrl: 'https://github.com/acme/repo/pull/3/checks',
  detailAvailable: true,
};
const pr = {
  repository: latest.repository,
  pullRequest: latest.pullRequest,
  latest,
  history: { runCount: 2, attentionCounts: { LOW: 1, MEDIUM: 0, HIGH: 1 } },
};

const activity: ActivityResponseV1 = {
  version: 1,
  selectedWindow: '24h',
  selectedAttention: 'ALL',
  selectedRepositoryId: 2,
  counts: { LOW: 0, MEDIUM: 0, HIGH: 1 },
  repositories: [{ ...latest.repository, pullRequestCount: 1 }],
  pullRequests: [pr],
  overview: {
    observedPRs: 1,
    totalEvaluations: 2,
    activePRsNeedingAttention: 1,
    mergedUnresolved: 0,
    recovery: { recoveredPRs: 1, failedToClearEvents: 0, waitingToClearEvents: 0 },
  },
  needsAttention: { total: 1, preview: [pr] },
  hasObservedHistory: true,
  pagination: { nextCursor: null },
};

const activeChanges: ActiveChangesV1 = { total: 1, preview: [pr] };
const env = { DB: {} } as Env;

function authorizer(repositoryIds = [2, 4]): DashboardAuthorizer {
  return {
    authorize: async () => ({
      viewer,
      repositoryIds,
      installationIds: [11],
      sessionExpiresAt: '2026-08-29T20:00:00.000Z',
    }),
  };
}

function reader(): DashboardReader {
  return {
    activity: vi.fn(async () => activity),
    pullRequest: vi.fn(async () => undefined),
    pullRequestHistory: vi.fn(async () => undefined),
    trajectory: vi.fn(async () => undefined),
    evaluation: vi.fn(async () => undefined),
    run: vi.fn(async () => undefined),
  };
}

describe('operational dashboard API', () => {
  it('returns scoped operational summary and active changes', async () => {
    const dashboardReader = reader();
    const activeChangesReader = vi.fn(async () => activeChanges);
    const now = new Date('2026-08-29T12:00:00.000Z');
    const response = await handleOperationalDashboardRequest(
      new Request('https://spark.test/api/dashboard?window=24h&repositoryId=2'),
      env,
      { authorizer: authorizer(), reader: dashboardReader, activeChangesReader, now: () => now },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      version: 1,
      selectedWindow: '24h',
      selectedRepositoryId: 2,
      overview: { activePRsNeedingAttention: 1, recovery: { recoveredPRs: 1 } },
      needsAttention: { total: 1 },
      activeChanges: { total: 1 },
      hasObservedHistory: true,
    });
    expect(dashboardReader.activity).toHaveBeenCalledWith({
      window: '24h', attention: 'ALL', repositoryId: 2, cursor: null, limit: 1,
    }, [2, 4], now);
    expect(activeChangesReader).toHaveBeenCalledWith(env.DB, {
      repositoryIds: [2, 4], repositoryId: 2, start: '2026-08-28T12:00:00.000Z', limit: 5,
    });
  });

  it('fails closed for repository filters outside the authorized scope', async () => {
    const dashboardReader = reader();
    const activeChangesReader = vi.fn(async () => activeChanges);
    const response = await handleOperationalDashboardRequest(
      new Request('https://spark.test/api/dashboard?repositoryId=99'),
      env,
      { authorizer: authorizer([2]), reader: dashboardReader, activeChangesReader },
    );
    expect(response.status).toBe(404);
    expect(dashboardReader.activity).not.toHaveBeenCalled();
    expect(activeChangesReader).not.toHaveBeenCalled();
  });

  it('rejects malformed dashboard queries and missing sessions', async () => {
    const invalid = await handleOperationalDashboardRequest(
      new Request('https://spark.test/api/dashboard?window=forever'),
      env,
      { authorizer: authorizer() },
    );
    expect(invalid.status).toBe(400);

    const unauthorized: DashboardAuthorizer = { authorize: async () => undefined };
    const denied = await handleOperationalDashboardRequest(
      new Request('https://spark.test/api/dashboard'),
      env,
      { authorizer: unauthorized },
    );
    expect(denied.status).toBe(401);
  });
});
