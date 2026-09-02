import { describe, expect, it } from 'vitest';
import type { PullRequestLifecycleV1 } from '@spark/dashboard-contracts';
import type {
  BehaviorMotifKindV1,
  ChangeBehaviorV1,
} from '@spark/dashboard-contracts/behavior';
import { aggregateBehaviorPatterns, readChangePatterns } from '../src/change-patterns';
import type { D1Database } from '../src/d1';

function behavior(input: {
  repositoryId: number;
  pr: number;
  lastEvaluatedAt: string;
  signature?: string;
  motif?: BehaviorMotifKindV1;
  motifEnds?: string[];
  lifecycle?: PullRequestLifecycleV1;
  truncated?: boolean;
}): ChangeBehaviorV1 {
  const repository = {
    id: input.repositoryId,
    owner: 'acme',
    name: `repo-${input.repositoryId}`,
    url: `https://github.com/acme/repo-${input.repositoryId}`,
  };
  const pullRequest = {
    number: input.pr,
    title: `PR ${input.pr}`,
    url: `${repository.url}/pull/${input.pr}`,
  };
  const motifEnds = input.motifEnds ?? [];
  return {
    version: 1,
    behaviorSchemaVersion: 1,
    repository,
    pullRequest,
    startedAt: '2026-01-01T00:00:00.000Z',
    lastEvaluatedAt: input.lastEvaluatedAt,
    initialAttention: 'LOW',
    peakAttention: 'HIGH',
    finalAttention: 'LOW',
    boundaries: [],
    motifs: input.motif
      ? motifEnds.map((endedAt, index) => ({
        id: `${input.motif}:${input.pr}:${index}`,
        kind: input.motif!,
        startedAt: new Date(Date.parse(endedAt) - 60_000).toISOString(),
        endedAt,
        durationMs: 60_000,
        transitionIds: [`t${index}`, `t${index + 1}`],
      }))
      : [],
    archetypes: [{ kind: 'RECOVERED', evidence: ['Peak attention HIGH', 'Final attention LOW'] }],
    features: {
      evaluationCount: 3,
      notableBoundaryCount: 2,
      attentionIncreaseCount: 1,
      attentionDecreaseCount: 1,
      evidenceRegressionCount: 1,
      evidenceRecoveryCount: 1,
      sensitiveSurfaceAdditionCount: 0,
      scopeExpansionCount: 0,
      reachedHigh: true,
      recoveredFromHigh: true,
      regressionThenRecovery: Boolean(input.motif === 'REGRESSION_THEN_RECOVERY'),
      oscillatedAttention: false,
      timeAtHighMs: 60_000,
    },
    signatures: {
      full: input.signature ?? 'v1:EVIDENCE_WORSE>EVIDENCE_BETTER',
      attention: 'v1:LOW>HIGH>LOW',
    },
    ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
    truncated: input.truncated ?? false,
  };
}

const start = '2026-01-10T00:00:00.000Z';
const end = '2026-01-17T00:00:00.000Z';

describe('behavior pattern aggregation', () => {
  it('keeps occurrence count separate from affected PR count and attaches one outcome per PR', () => {
    const resolved = behavior({
      repositoryId: 1,
      pr: 10,
      lastEvaluatedAt: '2026-01-16T12:00:00.000Z',
      motif: 'REGRESSION_THEN_RECOVERY',
      motifEnds: ['2026-01-14T10:00:00.000Z', '2026-01-16T10:00:00.000Z'],
      lifecycle: {
        state: 'MERGED',
        mergedAt: '2026-01-16T13:00:00.000Z',
        unresolvedAtMerge: false,
        lastEventAt: '2026-01-16T13:00:00.000Z',
      },
    });
    const unresolved = behavior({
      repositoryId: 1,
      pr: 11,
      lastEvaluatedAt: '2026-01-15T12:00:00.000Z',
      motif: 'REGRESSION_THEN_RECOVERY',
      motifEnds: ['2026-01-15T10:00:00.000Z'],
      lifecycle: {
        state: 'MERGED',
        mergedAt: '2026-01-15T13:00:00.000Z',
        unresolvedAtMerge: true,
        lastEventAt: '2026-01-15T13:00:00.000Z',
      },
      truncated: true,
    });

    const result = aggregateBehaviorPatterns([resolved, unresolved], {
      window: '7d',
      repositoryId: null,
      start,
      end,
    });
    const motif = result.patterns.find((pattern) => pattern.motifKind === 'REGRESSION_THEN_RECOVERY');

    expect(motif).toMatchObject({
      kind: 'MOTIF',
      occurrences: 3,
      affectedPRs: 2,
      outcomes: {
        resolvedBeforeMerge: 1,
        mergedUnresolved: 1,
        outcomeUnavailable: 0,
        closedWithoutMerge: 0,
        open: 0,
      },
    });
    expect(motif?.repositories).toEqual([
      expect.objectContaining({ occurrences: 3, affectedPRs: 2 }),
    ]);
    expect(motif?.examples.map((example) => [example.pullRequest.number, example.occurrences, example.truncated])).toEqual([
      [10, 2, false],
      [11, 1, true],
    ]);
  });

  it('windows motif occurrences by motif end and exact signatures by latest evaluation', () => {
    const inside = behavior({
      repositoryId: 1,
      pr: 20,
      lastEvaluatedAt: '2026-01-16T12:00:00.000Z',
      motif: 'SCOPE_THEN_REGRESSION',
      motifEnds: ['2026-01-16T10:00:00.000Z', '2026-01-09T10:00:00.000Z'],
    });
    const outsideSignature = behavior({
      repositoryId: 2,
      pr: 21,
      lastEvaluatedAt: '2026-01-09T12:00:00.000Z',
      motif: 'SCOPE_THEN_REGRESSION',
      motifEnds: ['2026-01-08T10:00:00.000Z'],
    });

    const result = aggregateBehaviorPatterns([inside, outsideSignature], {
      window: '7d',
      repositoryId: null,
      start,
      end,
    });
    const motif = result.patterns.find((pattern) => pattern.motifKind === 'SCOPE_THEN_REGRESSION');
    const signature = result.patterns.find((pattern) => pattern.kind === 'SIGNATURE');

    expect(motif).toMatchObject({ occurrences: 1, affectedPRs: 1 });
    expect(signature).toMatchObject({ occurrences: 1, affectedPRs: 1 });
    expect(signature?.examples[0].pullRequest.number).toBe(20);
  });

  it('keeps unknown merge outcome distinct and short-circuits unauthorized repository selection', async () => {
    const unknown = behavior({
      repositoryId: 1,
      pr: 30,
      lastEvaluatedAt: '2026-01-16T12:00:00.000Z',
      lifecycle: {
        state: 'MERGED',
        mergedAt: '2026-01-16T13:00:00.000Z',
        lastEventAt: '2026-01-16T13:00:00.000Z',
      },
    });
    const aggregated = aggregateBehaviorPatterns([unknown], {
      window: '7d',
      repositoryId: 1,
      start,
      end,
    });
    expect(aggregated.patterns.find((pattern) => pattern.kind === 'SIGNATURE')?.outcomes.outcomeUnavailable).toBe(1);

    const db = {
      prepare() {
        throw new Error('DB should not be queried for an unauthorized repository filter');
      },
      async batch() { return []; },
    } as D1Database;
    const empty = await readChangePatterns(db, {
      repositoryIds: [1],
      repositoryId: 999,
      window: '7d',
      now: new Date(end),
    });
    expect(empty.observedPRs).toBe(0);
    expect(empty.patterns).toEqual([]);
  });
});
