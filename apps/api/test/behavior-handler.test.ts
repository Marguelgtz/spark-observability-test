import { describe, expect, it, vi } from 'vitest';
import type { PullRequestTrajectoryV1 } from '@spark/dashboard-contracts';
import type { BehaviorPatternsResponseV1 } from '@spark/dashboard-contracts/behavior';
import { handleBehaviorRequest, isBehaviorRequest } from '../src/behavior-handler';
import type { Env } from '../src/app';

const env = {
  DB: {} as Env['DB'],
  GITHUB_APP_ID: '1',
  GITHUB_PRIVATE_KEY: 'unused',
  GITHUB_WEBHOOK_SECRET: 'unused',
} as Env;

const repository = { id: 2, owner: 'acme', name: 'repo', url: 'https://github.com/acme/repo' };
const pullRequest = { number: 3, title: 'Behavior', url: 'https://github.com/acme/repo/pull/3' };
const run = {
  runId: 'r1', repository, pullRequest, headSha: 'sha', attention: 'LOW' as const,
  topReasons: [], changeSummary: { files: 1, extensions: [] }, sensitiveSurfaces: [],
  evidenceSummary: { passed: 1, pending: 0, failed: 0, missing: 0, unknown: 0 },
  evaluatedAt: '2026-08-28T12:00:00.000Z', githubCheckUrl: `${pullRequest.url}/checks`, detailAvailable: true,
};
const trajectory: PullRequestTrajectoryV1 = {
  version: 1,
  repository,
  pullRequest,
  current: run,
  summary: {
    totalRuns: 1, analyzedRuns: 1, totalTransitions: 0, regressions: 0, recoveries: 0,
    attentionIncreases: 0, attentionDecreases: 0, currentClearStreak: 1,
    firstEvaluatedAt: run.evaluatedAt, lastEvaluatedAt: run.evaluatedAt,
  },
  evidenceIssues: [], insights: [], notableTransitions: [], runs: [run], truncated: false,
};

const principal = {
  viewer: { version: 1 as const, id: 7, login: 'user', avatarUrl: 'https://example.test/avatar' },
  repositoryIds: [2],
  installationIds: [9],
  sessionExpiresAt: '2026-08-29T00:00:00.000Z',
};

describe('behavior explorer API', () => {
  it('recognizes only behavior GET routes', () => {
    expect(isBehaviorRequest(new Request('https://spark.test/api/behavior/patterns'))).toBe(true);
    expect(isBehaviorRequest(new Request('https://spark.test/api/repositories/2/pulls/3/behavior'))).toBe(true);
    expect(isBehaviorRequest(new Request('https://spark.test/api/behavior/patterns', { method: 'POST' }))).toBe(false);
  });

  it('returns one-PR behavior only inside repository scope', async () => {
    const readTrajectory = vi.fn(async () => trajectory);
    const allowed = await handleBehaviorRequest(
      new Request('https://spark.test/api/repositories/2/pulls/3/behavior'), env,
      { authorize: async () => principal, trajectory: readTrajectory },
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({
      version: 1,
      behaviorSchemaVersion: 1,
      initialAttention: 'LOW',
      finalAttention: 'LOW',
      archetypes: [{ kind: 'STABLE' }],
    });
    expect(readTrajectory).toHaveBeenCalledWith(2, 3);

    const denied = await handleBehaviorRequest(
      new Request('https://spark.test/api/repositories/99/pulls/3/behavior'), env,
      { authorize: async () => principal, trajectory: readTrajectory },
    );
    expect(denied.status).toBe(404);
    expect(readTrajectory).toHaveBeenCalledTimes(1);
  });

  it('passes authorized window and repository scope to pattern aggregation', async () => {
    const patterns: BehaviorPatternsResponseV1 = {
      version: 1,
      behaviorSchemaVersion: 1,
      selectedWindow: '30d',
      selectedRepositoryId: 2,
      observedPRs: 4,
      patterns: [],
    };
    const readPatterns = vi.fn(async () => patterns);
    const response = await handleBehaviorRequest(
      new Request('https://spark.test/api/behavior/patterns?window=30d&repositoryId=2'), env,
      { authorize: async () => principal, patterns: readPatterns },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(patterns);
    expect(readPatterns).toHaveBeenCalledWith({ repositoryIds: [2], repositoryId: 2, window: '30d' });

    const denied = await handleBehaviorRequest(
      new Request('https://spark.test/api/behavior/patterns?repositoryId=99'), env,
      { authorize: async () => principal, patterns: readPatterns },
    );
    expect(denied.status).toBe(404);
    expect(readPatterns).toHaveBeenCalledTimes(1);
  });
});
