import { describe, expect, it } from 'vitest';
import type { D1Database } from '../src/d1';
import { readOutcomeOverview } from '../src/outcome-overview';

function fakeDb(): D1Database {
  const mergeRows = [
    {
      repository_id: 101,
      full_name: 'acme/spark',
      pull_request_number: 10,
      merged_at: '2026-08-28T10:00:00.000Z',
      merge_sha: 'merge-10',
      pre_merge_attention: 'LOW',
      pre_merge_evidence_health: 'CLEAR',
      unresolved_at_merge: 0,
    },
    {
      repository_id: 101,
      full_name: 'acme/spark',
      pull_request_number: 11,
      merged_at: '2026-08-28T11:00:00.000Z',
      merge_sha: 'merge-11',
      pre_merge_attention: 'HIGH',
      pre_merge_evidence_health: 'FAILED',
      unresolved_at_merge: 1,
    },
    {
      repository_id: 101,
      full_name: 'acme/spark',
      pull_request_number: 12,
      merged_at: '2026-08-28T12:00:00.000Z',
      merge_sha: 'merge-12',
      pre_merge_attention: null,
      pre_merge_evidence_health: null,
      unresolved_at_merge: null,
    },
  ];

  const transitionRows = [
    {
      repository_id: 101,
      full_name: 'acme/spark',
      head_sha: '1111111',
      pull_request_number: 11,
      attention: 'LOW',
      evaluated_at: '2026-08-28T08:00:00.000Z',
      normalized_json: null,
      check_url: null,
      run_id: 'run-1',
      observation_source: 'LIVE',
      evidence_health: 'CLEAR',
      created_at: '2026-08-28T08:00:01.000Z',
    },
    {
      repository_id: 101,
      full_name: 'acme/spark',
      head_sha: '2222222',
      pull_request_number: 11,
      attention: 'HIGH',
      evaluated_at: '2026-08-28T09:00:00.000Z',
      normalized_json: null,
      check_url: null,
      run_id: 'run-2',
      observation_source: 'LIVE',
      evidence_health: 'FAILED',
      created_at: '2026-08-28T09:00:01.000Z',
    },
    {
      repository_id: 101,
      full_name: 'acme/spark',
      head_sha: '3333333',
      pull_request_number: 11,
      attention: 'LOW',
      evaluated_at: '2026-08-28T09:30:00.000Z',
      normalized_json: null,
      check_url: null,
      run_id: 'run-3',
      observation_source: 'LIVE',
      evidence_health: 'CLEAR',
      created_at: '2026-08-28T09:30:01.000Z',
    },
  ];

  const feedbackRows = [
    {
      repository_id: 101,
      pull_request_number: 11,
      transition_id: 'run-1:run-2',
      classification: 'USEFUL',
    },
    {
      repository_id: 101,
      pull_request_number: 99,
      transition_id: 'old:transition',
      classification: 'FALSE_POSITIVE',
    },
  ];

  return {
    prepare(query: string) {
      const statement = {
        bind(..._values: unknown[]) { return statement; },
        async all() {
          if (query.includes('FROM pull_request_lifecycle pl')) return { results: mergeRows };
          if (query.includes('FROM evaluation_runs er')) return { results: transitionRows };
          if (query.includes('FROM trajectory_feedback tf')) return { results: feedbackRows };
          return { results: [] };
        },
        async first() { return null; },
        async run() { return { meta: { changes: 0 } }; },
      };
      return statement;
    },
    async batch() { return []; },
  } as unknown as D1Database;
}

describe('Phase 4 outcome overview', () => {
  it('keeps merge denominators explicit and only counts feedback for material transitions in the window', async () => {
    const outcome = await readOutcomeOverview(fakeDb(), {
      repositoryIds: [101],
      repositoryId: null,
      githubUserId: 17017482,
      start: '2026-08-28T00:00:00.000Z',
      now: new Date('2026-08-28T23:59:59.000Z'),
      window: '24h',
    });

    expect(outcome.merges).toEqual({ total: 3, resolved: 1, unresolved: 1, unavailable: 1 });
    expect(outcome.preMergeAttention).toEqual({ LOW: 1, MEDIUM: 0, HIGH: 1, UNKNOWN: 1 });
    expect(outcome.preMergeEvidence).toEqual({
      CLEAR: 1,
      FAILED: 1,
      PENDING_OR_MISSING: 0,
      UNKNOWN: 0,
      UNAVAILABLE: 1,
    });
    expect(outcome.unresolved).toHaveLength(1);
    expect(outcome.unresolved[0]).toMatchObject({
      pullRequest: { number: 11 },
      preMergeAttention: 'HIGH',
      preMergeEvidenceHealth: 'FAILED',
    });

    expect(outcome.stabilization.attentionIncreases).toBe(1);
    expect(outcome.stabilization.attentionDecreases).toBe(1);
    expect(outcome.stabilization.oscillatingPRs).toBe(1);
    expect(outcome.feedback.materialTransitions).toBe(2);
    expect(outcome.feedback.classifiedTransitions).toBe(1);
    expect(outcome.feedback.classifications.USEFUL).toBe(1);
    expect(outcome.feedback.classifications.FALSE_POSITIVE).toBe(0);
  });

  it('returns truthful zero denominators when the viewer has no authorized repositories', async () => {
    const outcome = await readOutcomeOverview(fakeDb(), {
      repositoryIds: [],
      repositoryId: null,
      githubUserId: 17017482,
      start: '2026-08-28T00:00:00.000Z',
      now: new Date('2026-08-28T23:59:59.000Z'),
      window: '24h',
    });

    expect(outcome.merges).toEqual({ total: 0, resolved: 0, unresolved: 0, unavailable: 0 });
    expect(outcome.feedback).toMatchObject({ materialTransitions: 0, classifiedTransitions: 0 });
    expect(outcome.unresolved).toEqual([]);
  });
});
