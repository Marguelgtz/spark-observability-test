import { describe, expect, it } from 'vitest';
import type {
  AttentionLevelV1,
  EvaluationSummaryV1,
  NotableTransitionKindV1,
  NotableTransitionV1,
  PullRequestTrajectoryV1,
} from '@spark/dashboard-contracts';
import { deriveChangeBehavior } from '../src/change-behavior';

const repository = { id: 1, owner: 'acme', name: 'repo', url: 'https://github.com/acme/repo' };
const pullRequest = { number: 42, title: 'Behavior test', url: 'https://github.com/acme/repo/pull/42' };

function run(id: string, attention: AttentionLevelV1, evaluatedAt: string): EvaluationSummaryV1 {
  return {
    runId: id,
    repository,
    pullRequest,
    headSha: id,
    attention,
    topReasons: [],
    changeSummary: { files: 1, extensions: [{ extension: '.ts', count: 1 }] },
    sensitiveSurfaces: [],
    evidenceSummary: { passed: 1, pending: 0, failed: 0, missing: 0, unknown: 0 },
    evaluatedAt,
    githubCheckUrl: `${pullRequest.url}/checks`,
    detailAvailable: true,
  };
}

function transition(
  id: string,
  fromRunId: string,
  toRunId: string,
  occurredAt: string,
  kinds: NotableTransitionKindV1[],
): NotableTransitionV1 {
  return {
    id,
    fromRunId,
    toRunId,
    occurredAt,
    kinds,
    severity: 'MATERIAL',
    delta: {
      fromRunId,
      toRunId,
      fromHeadSha: fromRunId,
      toHeadSha: toRunId,
      evaluatedAt: occurredAt,
      timeInPreviousStateMs: 60 * 60 * 1000,
      evidence: [],
      areas: { directAdded: [], directRemoved: [], affectedAdded: [], affectedRemoved: [] },
      sensitiveSurfaces: { added: [], removed: [] },
      changedFiles: { added: [], removed: [] },
      reasons: { added: [], removed: [] },
      detailCompleteness: 'COMPLETE',
    },
  };
}

function trajectory(
  runs: EvaluationSummaryV1[],
  notableTransitions: NotableTransitionV1[],
  mergedAt?: string,
): PullRequestTrajectoryV1 {
  const chronological = [...runs].sort((left, right) => left.evaluatedAt.localeCompare(right.evaluatedAt));
  const newestFirst = [...chronological].reverse();
  return {
    version: 1,
    repository,
    pullRequest,
    current: newestFirst[0],
    summary: {
      totalRuns: runs.length,
      analyzedRuns: runs.length,
      totalTransitions: notableTransitions.length,
      regressions: notableTransitions.filter((item) => item.kinds.includes('EVIDENCE_REGRESSED')).length,
      recoveries: notableTransitions.filter((item) => item.kinds.includes('EVIDENCE_RECOVERED')).length,
      attentionIncreases: notableTransitions.filter((item) => item.kinds.includes('ATTENTION_INCREASED')).length,
      attentionDecreases: notableTransitions.filter((item) => item.kinds.includes('ATTENTION_DECREASED')).length,
      currentClearStreak: 0,
      firstEvaluatedAt: chronological[0].evaluatedAt,
      lastEvaluatedAt: newestFirst[0].evaluatedAt,
    },
    evidenceIssues: [],
    insights: [],
    notableTransitions,
    runs: newestFirst,
    ...(mergedAt ? {
      lifecycle: {
        state: 'MERGED',
        mergedAt,
        lastEventAt: mergedAt,
      },
    } : {}),
    historyCompleteness: 'COMPLETE',
    truncated: false,
  };
}

describe('change behavior projection', () => {
  it('normalizes transition boundaries, extracts motifs, and keeps signatures deterministic', () => {
    const runs = [
      run('r1', 'LOW', '2026-01-01T00:00:00.000Z'),
      run('r2', 'MEDIUM', '2026-01-01T01:00:00.000Z'),
      run('r3', 'HIGH', '2026-01-01T02:00:00.000Z'),
      run('r4', 'MEDIUM', '2026-01-01T03:00:00.000Z'),
      run('r5', 'HIGH', '2026-01-01T04:00:00.000Z'),
    ];
    const transitions = [
      transition('t1', 'r1', 'r2', runs[1].evaluatedAt, ['CHANGE_SCOPE_EXPANDED', 'SENSITIVE_SURFACE_ADDED', 'ATTENTION_INCREASED']),
      transition('t2', 'r2', 'r3', runs[2].evaluatedAt, ['EVIDENCE_BECAME_PENDING', 'EVIDENCE_REGRESSED', 'ATTENTION_INCREASED']),
      transition('t3', 'r3', 'r4', runs[3].evaluatedAt, ['EVIDENCE_RECOVERED', 'ATTENTION_DECREASED']),
      transition('t4', 'r4', 'r5', runs[4].evaluatedAt, ['ATTENTION_INCREASED']),
    ];

    const behavior = deriveChangeBehavior(trajectory(runs, transitions, '2026-01-01T05:00:00.000Z'));

    expect(behavior.boundaries.map((boundary) => boundary.kinds)).toEqual([
      ['SCOPE_EXPANDED', 'SENSITIVE_SURFACE_ADDED', 'ATTENTION_UP'],
      ['EVIDENCE_WORSE', 'ATTENTION_UP'],
      ['EVIDENCE_BETTER', 'ATTENTION_DOWN'],
      ['ATTENTION_UP'],
    ]);
    expect(behavior.motifs.map((motif) => motif.kind)).toEqual([
      'SCOPE_THEN_REGRESSION',
      'SURFACE_THEN_ATTENTION_UP',
      'ATTENTION_OSCILLATION',
      'REGRESSION_THEN_RECOVERY',
    ]);
    expect(behavior.signatures.full).toBe(
      'v1:SCOPE_EXPANDED+SENSITIVE_SURFACE_ADDED+ATTENTION_UP>EVIDENCE_WORSE+ATTENTION_UP>EVIDENCE_BETTER+ATTENTION_DOWN>ATTENTION_UP',
    );
    expect(behavior.signatures.attention).toBe('v1:LOW>MEDIUM>HIGH>MEDIUM>HIGH');
    expect(behavior.features).toMatchObject({
      evaluationCount: 5,
      attentionIncreaseCount: 3,
      attentionDecreaseCount: 1,
      evidenceRegressionCount: 1,
      evidenceRecoveryCount: 1,
      reachedHigh: true,
      recoveredFromHigh: true,
      regressionThenRecovery: true,
      oscillatedAttention: true,
      timeAtHighMs: 2 * 60 * 60 * 1000,
      timeToFirstRegressionMs: 2 * 60 * 60 * 1000,
      timeToFirstRecoveryAfterRegressionMs: 60 * 60 * 1000,
    });
    expect(behavior.archetypes.map((item) => item.kind)).toEqual(['DETERIORATING', 'OSCILLATING']);
  });

  it('describes a recovered trajectory without inventing a score', () => {
    const runs = [
      run('r1', 'LOW', '2026-01-01T00:00:00.000Z'),
      run('r2', 'HIGH', '2026-01-01T01:00:00.000Z'),
      run('r3', 'LOW', '2026-01-01T02:00:00.000Z'),
    ];
    const transitions = [
      transition('t1', 'r1', 'r2', runs[1].evaluatedAt, ['ATTENTION_INCREASED']),
      transition('t2', 'r2', 'r3', runs[2].evaluatedAt, ['ATTENTION_DECREASED']),
    ];
    const behavior = deriveChangeBehavior(trajectory(runs, transitions));

    expect(behavior.peakAttention).toBe('HIGH');
    expect(behavior.finalAttention).toBe('LOW');
    expect(behavior.archetypes).toEqual([
      {
        kind: 'RECOVERED',
        evidence: ['Peak attention HIGH', 'Final attention LOW', '1 attention decrease'],
      },
    ]);
  });

  it('marks attention-stable changes explicitly and preserves completeness metadata', () => {
    const runs = [
      run('r1', 'MEDIUM', '2026-01-01T00:00:00.000Z'),
      run('r2', 'MEDIUM', '2026-01-01T01:00:00.000Z'),
    ];
    const value = trajectory(runs, []);
    value.historyCompleteness = 'PARTIAL_BACKFILL';
    value.truncated = true;

    const behavior = deriveChangeBehavior(value);

    expect(behavior.signatures.full).toBe('v1:NO_NOTABLE_BOUNDARIES');
    expect(behavior.signatures.attention).toBe('v1:MEDIUM');
    expect(behavior.archetypes).toEqual([{ kind: 'STABLE', evidence: ['Attention remained MEDIUM'] }]);
    expect(behavior.historyCompleteness).toBe('PARTIAL_BACKFILL');
    expect(behavior.truncated).toBe(true);
  });
});
