import { describe, expect, it } from 'vitest';
import type {
  AttentionLevelV1,
  EvaluationSummaryV1,
  EvidenceHealthV1,
  NotableTransitionV1,
  PullRequestLifecycleV1,
  PullRequestTrajectoryV1,
} from '@spark/dashboard-contracts';
import {
  deriveChangeStory,
  formatStoryDuration,
  terminalOutcome,
  transitionHeadline,
} from '../src/insights/change-story';

const repository = { id: 101, owner: 'acme', name: 'spark', url: 'https://github.com/acme/spark' };
const pullRequest = { number: 42, title: 'API authentication changes', url: 'https://github.com/acme/spark/pull/42' };

function evidenceSummary(health: EvidenceHealthV1) {
  if (health === 'FAILED') return { passed: 1, pending: 0, failed: 1, missing: 0, unknown: 0 };
  if (health === 'PENDING_OR_MISSING') return { passed: 1, pending: 1, failed: 0, missing: 0, unknown: 0 };
  if (health === 'UNKNOWN') return { passed: 0, pending: 0, failed: 0, missing: 0, unknown: 1 };
  return { passed: 2, pending: 0, failed: 0, missing: 0, unknown: 0 };
}

function run(id: string, evaluatedAt: string, attention: AttentionLevelV1, health: EvidenceHealthV1): EvaluationSummaryV1 {
  return {
    runId: id,
    observationSource: 'LIVE',
    repository,
    pullRequest,
    headSha: `${id.padEnd(40, '0')}`,
    attention,
    topReasons: [`${attention} fixture reason`],
    changeSummary: { files: 2, extensions: [{ extension: '.ts', count: 2 }] },
    sensitiveSurfaces: attention === 'HIGH' ? ['auth/security'] : [],
    evidenceSummary: evidenceSummary(health),
    evaluatedAt,
    githubCheckUrl: `https://github.com/acme/spark/runs/${id}`,
    detailAvailable: true,
  };
}

function transition(
  id: string,
  from: EvaluationSummaryV1,
  to: EvaluationSummaryV1,
  kinds: NotableTransitionV1['kinds'],
  fromHealth: EvidenceHealthV1,
  toHealth: EvidenceHealthV1,
): NotableTransitionV1 {
  return {
    id,
    fromRunId: from.runId!,
    toRunId: to.runId!,
    occurredAt: to.evaluatedAt,
    kinds,
    severity: 'MATERIAL',
    delta: {
      fromRunId: from.runId!,
      toRunId: to.runId!,
      fromHeadSha: from.headSha,
      toHeadSha: to.headSha,
      evaluatedAt: to.evaluatedAt,
      timeInPreviousStateMs: Date.parse(to.evaluatedAt) - Date.parse(from.evaluatedAt),
      ...(from.attention !== to.attention ? {
        attention: {
          from: from.attention,
          to: to.attention,
          direction: to.attention === 'HIGH' ? 'INCREASED' as const : 'DECREASED' as const,
        },
      } : {}),
      evidenceHealth: { from: fromHealth, to: toHealth },
      evidence: [{ name: 'integration-test', from: fromHealth === 'CLEAR' ? 'PASSED' : 'FAILED', to: toHealth === 'FAILED' ? 'FAILED' : 'PENDING', change: 'STATUS_CHANGED' }],
      areas: { directAdded: [], directRemoved: [], affectedAdded: [], affectedRemoved: [] },
      sensitiveSurfaces: { added: to.sensitiveSurfaces.filter((item) => !from.sensitiveSurfaces.includes(item)), removed: [] },
      changedFiles: { added: [], removed: [] },
      reasons: { added: to.topReasons, removed: [] },
      detailCompleteness: 'COMPLETE',
    },
  };
}

function fixtureTrajectory(): PullRequestTrajectoryV1 {
  const initial = run('run-1', '2026-08-28T10:00:00.000Z', 'LOW', 'CLEAR');
  const unchanged = run('run-2', '2026-08-28T10:10:00.000Z', 'LOW', 'CLEAR');
  const high = run('run-3', '2026-08-28T10:20:00.000Z', 'HIGH', 'FAILED');
  const latest = run('run-4', '2026-08-28T10:30:00.000Z', 'MEDIUM', 'PENDING_OR_MISSING');
  const firstTransition = transition(
    'run-2:run-3',
    unchanged,
    high,
    ['ATTENTION_INCREASED', 'EVIDENCE_REGRESSED', 'SENSITIVE_SURFACE_ADDED'],
    'CLEAR',
    'FAILED',
  );
  const secondTransition = transition(
    'run-3:run-4',
    high,
    latest,
    ['ATTENTION_DECREASED', 'EVIDENCE_RESOLVED'],
    'FAILED',
    'PENDING_OR_MISSING',
  );
  return {
    version: 1,
    repository,
    pullRequest,
    current: latest,
    summary: {
      totalRuns: 4,
      analyzedRuns: 4,
      totalTransitions: 2,
      regressions: 1,
      recoveries: 0,
      attentionIncreases: 1,
      attentionDecreases: 1,
      currentClearStreak: 0,
      firstEvaluatedAt: initial.evaluatedAt,
      lastEvaluatedAt: latest.evaluatedAt,
    },
    evidenceIssues: [],
    insights: [],
    notableTransitions: [firstTransition, secondTransition],
    runs: [latest, high, unchanged, initial],
    lifecycle: {
      state: 'MERGED',
      mergedAt: '2026-08-28T10:35:00.000Z',
      preMergeRunId: latest.runId,
      preMergeAttention: latest.attention,
      preMergeEvidenceHealth: 'PENDING_OR_MISSING',
      unresolvedAtMerge: true,
      lastEventAt: '2026-08-28T10:35:00.000Z',
    },
    historyCompleteness: 'COMPLETE',
    truncated: false,
  };
}

describe('change story derivation', () => {
  it('keeps attention changes first-class and groups unchanged-attention evaluations', () => {
    const story = deriveChangeStory(fixtureTrajectory());
    expect(story.nodes.map((item) => item.kind)).toEqual(['INITIAL', 'STABLE', 'TRANSITION', 'TRANSITION', 'TERMINAL']);
    expect(story.collapsedEvaluations).toBe(1);
    expect(story.nodes[1]).toMatchObject({ headline: '1 evaluation stayed LOW', attention: 'LOW', latest: false });
    if (story.nodes[1].kind !== 'STABLE') throw new Error('Expected stable attention group');
    expect(story.nodes[1].evaluations.map((item) => item.run.runId)).toEqual(['run-2']);
    expect(story.nodes[2]).toMatchObject({ headline: 'Attention increased to HIGH', attention: 'HIGH' });
    expect(story.nodes[3]).toMatchObject({ headline: 'Attention decreased to MEDIUM', attention: 'MEDIUM', latest: true });
    expect(story.nodes[4]).toMatchObject({ headline: 'Merged with unresolved attention' });
  });

  it('keeps attention-neutral notable transitions inside the stable evaluation group', () => {
    const trajectory = fixtureTrajectory();
    const initial = trajectory.runs.find((item) => item.runId === 'run-1')!;
    const unchanged = trajectory.runs.find((item) => item.runId === 'run-2')!;
    const neutral = transition(
      'run-1:run-2',
      initial,
      unchanged,
      ['EVIDENCE_BECAME_PENDING'],
      'CLEAR',
      'PENDING_OR_MISSING',
    );
    trajectory.notableTransitions = [neutral, ...trajectory.notableTransitions];
    trajectory.summary.totalTransitions = 3;

    const story = deriveChangeStory(trajectory);
    const stable = story.nodes.find((item) => item.kind === 'STABLE');
    expect(stable?.kind).toBe('STABLE');
    if (!stable || stable.kind !== 'STABLE') throw new Error('Expected stable attention group');
    expect(stable.evaluations[0].transitions).toHaveLength(1);
    expect(stable.evaluations[0].transitions[0].headline).toBe('Evidence became pending or missing');
  });

  it('prioritizes attention changes over other causes for the transition headline', () => {
    const trajectory = fixtureTrajectory();
    expect(transitionHeadline(trajectory.notableTransitions[0])).toBe('Attention increased to HIGH');
    expect(trajectory.notableTransitions[0].kinds).toContain('SENSITIVE_SURFACE_ADDED');
  });

  it('uses exact terminal outcome language', () => {
    const mergedResolved: PullRequestLifecycleV1 = { state: 'MERGED', unresolvedAtMerge: false, lastEventAt: '2026-08-28T10:00:00.000Z' };
    const mergedUnresolved: PullRequestLifecycleV1 = { state: 'MERGED', unresolvedAtMerge: true, lastEventAt: '2026-08-28T10:00:00.000Z' };
    const mergedUnavailable: PullRequestLifecycleV1 = { state: 'MERGED', lastEventAt: '2026-08-28T10:00:00.000Z' };
    const closed: PullRequestLifecycleV1 = { state: 'CLOSED', lastEventAt: '2026-08-28T10:00:00.000Z' };
    expect(terminalOutcome(mergedResolved)).toBe('Resolved before merge');
    expect(terminalOutcome(mergedUnresolved)).toBe('Merged with unresolved attention');
    expect(terminalOutcome(mergedUnavailable)).toBe('Merge outcome unavailable');
    expect(terminalOutcome(closed)).toBe('Closed without merge');
  });

  it('formats elapsed time compactly for story connectors', () => {
    expect(formatStoryDuration(30_000)).toBe('<1m');
    expect(formatStoryDuration(31 * 60_000)).toBe('31m');
    expect(formatStoryDuration((2 * 60 + 14) * 60_000)).toBe('2h 14m');
  });
});
