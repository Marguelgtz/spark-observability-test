import { describe, expect, it } from 'vitest';
import type { EvaluationDetailV1, EvaluationSummaryV1, EvidenceStatusV1 } from '@spark/dashboard-contracts';
import {
  buildTrajectory,
  classifyNotableTransition,
  deriveTransitionDelta,
  sortRunsChronologically,
  type TrajectoryRunInput,
} from '../src/change-trajectory';

const repository = { id: 2, owner: 'acme', name: 'repo', url: 'https://github.com/acme/repo' };
const pullRequest = { number: 13, title: 'Change trajectory', url: 'https://github.com/acme/repo/pull/13' };

function run(
  id: string,
  minute: number,
  attention: EvaluationSummaryV1['attention'],
  status: EvidenceStatusV1,
  patch: Partial<EvaluationDetailV1> = {},
  headSha = id,
): TrajectoryRunInput {
  const evidenceSummary = {
    passed: status === 'PASSED' ? 1 : 0,
    pending: status === 'PENDING' ? 1 : 0,
    failed: status === 'FAILED' ? 1 : 0,
    missing: status === 'MISSING' ? 1 : 0,
    unknown: status === 'UNKNOWN' ? 1 : 0,
  };
  const evaluatedAt = `2026-08-28T10:${String(minute).padStart(2, '0')}:00.000Z`;
  const summary: EvaluationSummaryV1 = {
    runId: id,
    observationSource: 'LIVE',
    repository,
    pullRequest,
    headSha,
    attention,
    topReasons: patch.reasons ?? [],
    changeSummary: { files: patch.changedFiles?.length ?? 1, extensions: [{ extension: '.ts', count: 1 }] },
    sensitiveSurfaces: patch.sensitiveSurfaces ?? [],
    evidenceSummary,
    evaluatedAt,
    githubCheckUrl: `https://github.com/acme/repo/runs/${id}`,
    detailAvailable: true,
  };
  const detail: EvaluationDetailV1 = {
    version: 1,
    runId: id,
    observationSource: 'LIVE',
    repository,
    pullRequest,
    headSha,
    baseSha: 'base',
    evaluatedAt,
    evaluatorVersion: 'test',
    attention,
    reasons: [],
    changeSummary: summary.changeSummary,
    changedFiles: [{ path: 'src/index.ts', status: 'modified' }],
    directAreas: ['api'],
    affectedAreas: [],
    unmappedPaths: [],
    sensitiveSurfaces: [],
    evidence: [{ name: 'verify', status, coverage: 'UNKNOWN' }],
    profile: { state: 'ABSENT', matchedAreas: [] },
    analysisNotes: [],
    githubCheckUrl: summary.githubCheckUrl,
    ...patch,
  };
  return { summary, detail, createdAt: evaluatedAt };
}

describe('Change Trajectory engine', () => {
  it('sorts by evaluated time, created time, and stable run ID without mutating input', () => {
    const laterId = run('run:b', 1, 'LOW', 'PASSED');
    const earlierId = run('run:a', 1, 'LOW', 'PASSED');
    const oldest = run('run:0', 0, 'LOW', 'PASSED');
    const input = [laterId, oldest, earlierId];

    expect(sortRunsChronologically(input).map(item => item.summary.runId)).toEqual(['run:0', 'run:a', 'run:b']);
    expect(input.map(item => item.summary.runId)).toEqual(['run:b', 'run:0', 'run:a']);
  });

  it('combines simultaneous attention, evidence, surface, scope, reason, and profile causes', () => {
    const previous = run('run:1', 1, 'LOW', 'PASSED', {
      reasons: ['Routine change'],
      changedFiles: [{ path: 'src/index.ts', status: 'modified' }],
      profile: { state: 'ACTIVE', sourceSha: 'profile-1', matchedAreas: [] },
    });
    const current = run('run:2', 2, 'HIGH', 'FAILED', {
      reasons: ['Integration evidence failed'],
      changedFiles: [{ path: 'src/index.ts', status: 'modified' }, { path: 'src/auth.ts', status: 'added' }],
      directAreas: ['api', 'auth'],
      affectedAreas: ['checkout'],
      sensitiveSurfaces: ['auth/security'],
      profile: { state: 'ACTIVE', sourceSha: 'profile-2', matchedAreas: [] },
    });

    const delta = deriveTransitionDelta(previous, current);
    expect(delta).toMatchObject({
      attention: { from: 'LOW', to: 'HIGH', direction: 'INCREASED' },
      evidenceHealth: { from: 'CLEAR', to: 'FAILED' },
      evidence: [{ name: 'verify', from: 'PASSED', to: 'FAILED', change: 'STATUS_CHANGED' }],
      areas: { directAdded: ['auth'], affectedAdded: ['checkout'] },
      sensitiveSurfaces: { added: ['auth/security'] },
      changedFiles: { added: ['src/auth.ts'] },
      reasons: { added: ['Integration evidence failed'], removed: ['Routine change'] },
      profile: { changed: true, fromSourceSha: 'profile-1', toSourceSha: 'profile-2' },
      detailCompleteness: 'COMPLETE',
    });
    expect(classifyNotableTransition(delta)).toMatchObject({
      kinds: ['ATTENTION_INCREASED', 'EVIDENCE_REGRESSED', 'SENSITIVE_SURFACE_ADDED', 'CHANGE_SCOPE_EXPANDED'],
      severity: 'MATERIAL',
    });
  });

  it('preserves same-SHA pending, failed, and passed boundaries as two explained transitions', () => {
    const trajectory = buildTrajectory([
      run('run:3', 3, 'LOW', 'PASSED', {}, 'same-sha'),
      run('run:1', 1, 'MEDIUM', 'PENDING', {}, 'same-sha'),
      run('run:2', 2, 'HIGH', 'FAILED', {}, 'same-sha'),
    ])!;

    expect(trajectory.runs.map(item => item.runId)).toEqual(['run:3', 'run:2', 'run:1']);
    expect(trajectory.notableTransitions).toHaveLength(2);
    expect(trajectory.notableTransitions[0].kinds).toEqual(expect.arrayContaining(['ATTENTION_INCREASED', 'EVIDENCE_REGRESSED']));
    expect(trajectory.notableTransitions[1].kinds).toEqual(expect.arrayContaining(['ATTENTION_DECREASED', 'EVIDENCE_RECOVERED']));
    expect(trajectory.notableTransitions.map(item => item.delta.evidence[0])).toEqual([
      expect.objectContaining({ from: 'PENDING', to: 'FAILED' }),
      expect.objectContaining({ from: 'FAILED', to: 'PASSED' }),
    ]);
  });

  it('does not emit a notable transition for identical state on a different SHA', () => {
    const trajectory = buildTrajectory([
      run('run:1', 1, 'LOW', 'PASSED', {}, 'sha-1'),
      run('run:2', 2, 'LOW', 'PASSED', {}, 'sha-2'),
    ])!;
    expect(trajectory.notableTransitions).toEqual([]);
    expect(trajectory.summary.totalTransitions).toBe(0);
  });

  it.each([
    ['MISSING', 'PASSED', ['EVIDENCE_RESOLVED']],
    ['PASSED', 'MISSING', ['EVIDENCE_BECAME_PENDING']],
    ['FAILED', 'PASSED', ['EVIDENCE_RECOVERED']],
    ['PASSED', 'FAILED', ['EVIDENCE_REGRESSED']],
  ] as const)('classifies %s → %s evidence', (from, to, kinds) => {
    const delta = deriveTransitionDelta(run('run:1', 1, 'MEDIUM', from), run('run:2', 2, 'MEDIUM', to));
    expect(classifyNotableTransition(delta)?.kinds).toEqual(expect.arrayContaining([...kinds]));
  });

  it('degrades legacy detail comparisons explicitly and keeps aggregate attention causes', () => {
    const previous = run('run:1', 1, 'LOW', 'UNKNOWN');
    delete previous.detail;
    const current = run('run:2', 2, 'HIGH', 'UNKNOWN');
    const delta = deriveTransitionDelta(previous, current);
    expect(delta.detailCompleteness).toBe('PARTIAL');
    expect(delta.evidence).toEqual([]);
    expect(classifyNotableTransition(delta)?.kinds).toContain('ATTENTION_INCREASED');
  });

  it('reports bounded analysis separately from full retained run count', () => {
    const trajectory = buildTrajectory(
      [run('run:2', 2, 'LOW', 'PASSED'), run('run:1', 1, 'LOW', 'PASSED')],
      {
        totalRuns: 44,
        firstEvaluatedAt: '2026-08-01T00:00:00.000Z',
        lastEvaluatedAt: '2026-08-28T10:02:00.000Z',
        historyCompleteness: 'PARTIAL_BACKFILL',
      },
    )!;
    expect(trajectory.summary).toMatchObject({ totalRuns: 44, analyzedRuns: 2 });
    expect(trajectory.historyCompleteness).toBe('PARTIAL_BACKFILL');
    expect(trajectory.truncated).toBe(true);
  });

  it('carries lifecycle facts without deriving or rewriting merge state', () => {
    const lifecycle = {
      state: 'MERGED' as const,
      mergedAt: '2026-08-28T10:05:00.000Z',
      mergeSha: 'merge-sha',
      preMergeRunId: 'run:1',
      preMergeAttention: 'HIGH' as const,
      preMergeEvidenceHealth: 'FAILED' as const,
      unresolvedAtMerge: true,
      lastEventAt: '2026-08-28T10:05:00.000Z',
    };
    expect(buildTrajectory([run('run:1', 1, 'HIGH', 'FAILED')], { lifecycle })?.lifecycle).toEqual(lifecycle);
  });
});
