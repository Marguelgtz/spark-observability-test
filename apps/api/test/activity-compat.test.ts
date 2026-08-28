import { describe, expect, it } from 'vitest';
import type { EvaluationSummaryV1 } from '@spark/dashboard-contracts';
import { normalizeActivityV1 } from '../src/index';

const evaluation: EvaluationSummaryV1 = {
  repository: { id: 2, owner: 'acme', name: 'repo', url: 'https://github.com/acme/repo' },
  pullRequest: { number: 13, title: 'Dashboard phase three', url: 'https://github.com/acme/repo/pull/13' },
  headSha: 'abc123',
  attention: 'LOW',
  topReasons: [],
  changeSummary: { files: 2, extensions: [] },
  sensitiveSurfaces: [],
  evidenceSummary: { passed: 2, pending: 0, failed: 0, missing: 0, unknown: 0 },
  evaluatedAt: '2026-08-28T00:00:00.000Z',
  githubCheckUrl: 'https://github.com/acme/repo/pull/13/checks',
  detailAvailable: true,
};

describe('activity V1 compatibility', () => {
  it('adds the legacy evaluations alias to PR-centric activity', () => {
    const body = normalizeActivityV1({
      version: 1,
      pullRequests: [{
        repository: evaluation.repository,
        pullRequest: evaluation.pullRequest,
        latest: evaluation,
        history: { runCount: 4, attentionCounts: { LOW: 2, MEDIUM: 1, HIGH: 1 } },
      }],
      repositories: [{ ...evaluation.repository, pullRequestCount: 1 }],
    });

    expect(body.evaluations).toEqual([evaluation]);
    expect(body.repositories?.[0]).toMatchObject({ pullRequestCount: 1, evaluationCount: 1 });
  });

  it('can lift a legacy evaluation list for a newer cached client', () => {
    const body = normalizeActivityV1({
      version: 1,
      evaluations: [evaluation],
      repositories: [{ ...evaluation.repository, evaluationCount: 1 }],
    });

    expect(body.pullRequests).toHaveLength(1);
    expect(body.pullRequests?.[0]).toMatchObject({
      latest: evaluation,
      history: { runCount: 1, attentionCounts: { LOW: 1, MEDIUM: 0, HIGH: 0 } },
    });
    expect(body.repositories?.[0]).toMatchObject({ pullRequestCount: 1, evaluationCount: 1 });
  });
});
