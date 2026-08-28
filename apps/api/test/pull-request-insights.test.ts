import { describe, expect, it } from 'vitest';
import type { EvaluationDetailV1, EvaluationSummaryV1 } from '@spark/dashboard-contracts';
import { buildPullRequestDetail, evidenceHealth } from '../src/pull-request-insights';

const repository = { id: 2, owner: 'acme', name: 'repo', url: 'https://github.com/acme/repo' };
const pullRequest = { number: 13, title: 'Dashboard phase three', url: 'https://github.com/acme/repo/pull/13' };

function summary(
  headSha: string,
  attention: EvaluationSummaryV1['attention'],
  evidence: Partial<EvaluationSummaryV1['evidenceSummary']>,
  minute: number,
): EvaluationSummaryV1 {
  return {
    repository,
    pullRequest,
    headSha,
    attention,
    topReasons: [],
    changeSummary: { files: 1, extensions: [{ extension: '.ts', count: 1 }] },
    sensitiveSurfaces: [],
    evidenceSummary: { passed: 0, pending: 0, failed: 0, missing: 0, unknown: 0, ...evidence },
    evaluatedAt: `2026-08-28T00:${String(minute).padStart(2, '0')}:00.000Z`,
    githubCheckUrl: `https://github.com/acme/repo/runs/${headSha}`,
    detailAvailable: true,
  };
}

function detail(run: EvaluationSummaryV1, status: EvaluationDetailV1['evidence'][number]['status']): EvaluationDetailV1 {
  return {
    version: 1,
    repository,
    pullRequest,
    headSha: run.headSha,
    baseSha: `base-${run.headSha}`,
    evaluatedAt: run.evaluatedAt,
    evaluatorVersion: 'test',
    attention: run.attention,
    reasons: [],
    changeSummary: run.changeSummary,
    changedFiles: [],
    directAreas: [],
    affectedAreas: [],
    unmappedPaths: [],
    sensitiveSurfaces: [],
    evidence: [{ name: 'browser-acceptance', status, coverage: 'UNKNOWN' }],
    profile: { state: 'ABSENT', matchedAreas: [] },
    analysisNotes: [],
    githubCheckUrl: run.githubCheckUrl,
  };
}

describe('pull request observability insights', () => {
  it('keeps evidence health independent from attention', () => {
    expect(evidenceHealth(summary('high-clear', 'HIGH', { passed: 14 }, 1))).toBe('CLEAR');
    expect(evidenceHealth(summary('low-failed', 'LOW', { failed: 1 }, 2))).toBe('FAILED');
    expect(evidenceHealth(summary('pending', 'MEDIUM', { passed: 4, pending: 1 }, 3))).toBe('PENDING_OR_MISSING');
  });

  it('derives recovery, regression, attention changes, streaks and evidence issue frequency', () => {
    const oldest = summary('aaaaaaa', 'HIGH', { pending: 1 }, 1);
    const failed = summary('bbbbbbb', 'HIGH', { failed: 1 }, 2);
    const clear = summary('ccccccc', 'MEDIUM', { passed: 2 }, 3);
    const regressed = summary('ddddddd', 'MEDIUM', { failed: 1 }, 4);
    const recovered = summary('eeeeeee', 'LOW', { passed: 3 }, 5);
    const latest = summary('fffffff', 'LOW', { passed: 4 }, 6);

    const result = buildPullRequestDetail([
      { summary: latest, detail: detail(latest, 'PASSED') },
      { summary: recovered, detail: detail(recovered, 'PASSED') },
      { summary: regressed, detail: detail(regressed, 'FAILED') },
      { summary: clear, detail: detail(clear, 'PASSED') },
      { summary: failed, detail: detail(failed, 'FAILED') },
      { summary: oldest, detail: detail(oldest, 'PENDING') },
    ]);

    expect(result).toBeDefined();
    expect(result!.history).toMatchObject({
      totalRuns: 6,
      currentClearStreak: 2,
      currentFailureStreak: 0,
      evidenceCounts: { CLEAR: 3, FAILED: 2, PENDING_OR_MISSING: 1, UNKNOWN: 0 },
      attentionCounts: { LOW: 2, MEDIUM: 2, HIGH: 2 },
    });
    expect(result!.transitions.map(item => item.kind)).toEqual(expect.arrayContaining([
      'EVIDENCE_RECOVERED',
      'EVIDENCE_REGRESSED',
      'ATTENTION_DECREASED',
    ]));
    expect(result!.insights).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'CURRENTLY_CLEAR' }),
      expect.objectContaining({ kind: 'CLEAR_STREAK', value: 2 }),
      expect.objectContaining({ kind: 'EVIDENCE_REGRESSED', value: 1 }),
      expect.objectContaining({ kind: 'EVIDENCE_RECOVERED', value: 2 }),
    ]));
    expect(result!.evidenceIssues[0]).toMatchObject({
      name: 'browser-acceptance',
      failedRuns: 2,
      pendingRuns: 1,
      latestStatus: 'PASSED',
      lastProblemHeadSha: 'ddddddd',
    });
  });

  it('marks truncated histories without changing observed counts', () => {
    const latest = summary('latest1', 'LOW', { passed: 1 }, 8);
    const older = summary('older11', 'LOW', { passed: 1 }, 7);
    const result = buildPullRequestDetail([{ summary: latest }, { summary: older }], 44)!;
    expect(result.history.totalRuns).toBe(44);
    expect(result.history.evidenceCounts.CLEAR).toBe(2);
    expect(result.truncated).toBe(true);
  });
});
