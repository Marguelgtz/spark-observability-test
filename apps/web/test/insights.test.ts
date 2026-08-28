import { describe, expect, it } from 'vitest';
import type { AttentionLevelV1, EvaluationSummaryV1 } from '@spark/dashboard-contracts';
import { evaluationAttentionTrend } from '../src/insights/attention';
import { deriveIterationInsight } from '../src/insights/throughput';
import type { OverviewDrilldownResponseV1 } from '../src/overview-api';

function evaluation(pullRequestNumber: number, attention: AttentionLevelV1, evaluatedAt: string): EvaluationSummaryV1 {
  return {
    runId: `run-${pullRequestNumber}-${evaluatedAt}`,
    repository: { id: 101, owner: 'spark', name: 'demo', url: 'https://github.com/spark/demo' },
    pullRequest: { number: pullRequestNumber, title: `PR ${pullRequestNumber}`, url: `https://github.com/spark/demo/pull/${pullRequestNumber}` },
    headSha: `${pullRequestNumber}`.padEnd(40, 'a'),
    attention,
    topReasons: [],
    changeSummary: { files: 1, extensions: [{ extension: '.ts', count: 1 }] },
    sensitiveSurfaces: [],
    evidenceSummary: { passed: 1, pending: 0, failed: 0, missing: 0, unknown: 0 },
    evaluatedAt,
    githubCheckUrl: 'https://github.com/spark/demo/checks/1',
    detailAvailable: true,
  };
}

function response(items: EvaluationSummaryV1[]): OverviewDrilldownResponseV1 {
  return {
    version: 1,
    metric: 'evaluations',
    selectedWindow: '7d',
    selectedRepositoryId: null,
    total: items.length,
    trend: [
      { bucketStart: '2026-08-27T00:00:00Z', observedPRs: 2, evaluations: 2, attentionEvaluations: 1, mergedUnresolved: 0 },
      { bucketStart: '2026-08-28T00:00:00Z', observedPRs: 1, evaluations: 2, attentionEvaluations: 2, mergedUnresolved: 0 },
    ],
    items: items.map((item) => ({ kind: 'evaluation' as const, evaluation: item })),
    truncated: false,
  };
}

describe('iteration insight', () => {
  it('derives evaluations-per-PR and a PR-level distribution', () => {
    const insight = deriveIterationInsight(response([
      evaluation(42, 'LOW', '2026-08-27T10:00:00Z'),
      evaluation(42, 'MEDIUM', '2026-08-27T12:00:00Z'),
      evaluation(42, 'HIGH', '2026-08-28T08:00:00Z'),
      evaluation(43, 'LOW', '2026-08-28T09:00:00Z'),
    ]), undefined, 2);

    expect(insight.totalEvaluations).toBe(4);
    expect(insight.observedPRs).toBe(2);
    expect(insight.evaluationsPerPR).toBe(2);
    expect(insight.histogram.find((item) => item.label === '1')?.value).toBe(1);
    expect(insight.histogram.find((item) => item.label === '2–3')?.value).toBe(1);
  });
});

describe('attention insight', () => {
  it('buckets evaluation severity independently from chart rendering', () => {
    const trend = evaluationAttentionTrend(response([
      evaluation(42, 'LOW', '2026-08-27T10:00:00Z'),
      evaluation(42, 'MEDIUM', '2026-08-27T12:00:00Z'),
      evaluation(42, 'HIGH', '2026-08-28T08:00:00Z'),
      evaluation(43, 'MEDIUM', '2026-08-28T09:00:00Z'),
    ]));

    expect(trend).toEqual([
      { bucketStart: '2026-08-27T00:00:00Z', low: 1, medium: 1, high: 0 },
      { bucketStart: '2026-08-28T00:00:00Z', low: 0, medium: 1, high: 1 },
    ]);
  });
});
