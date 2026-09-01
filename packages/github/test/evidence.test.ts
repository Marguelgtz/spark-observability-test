import { describe, expect, it } from 'vitest';
import {
  observeGitHubEvidenceRuns,
  type GitHubActionsRunCrosswalk,
  type GitHubCheckRun,
} from '../src';

const crosswalk: GitHubActionsRunCrosswalk = {
  pipelineRunId: 'pipeline-run:1',
  pipelineDefinitionId: 'pipeline-definition:1',
  providerWorkflowId: 10,
  providerRunId: 20,
  providerCheckSuiteId: 30,
  providerCheckRunIds: [40, 41],
  attempts: [{
    pipelineAttemptId: 'pipeline-attempt:1',
    attempt: 1,
    jobs: [{ pipelineJobId: 'pipeline-job:1', providerJobId: 50, providerCheckRunId: 40 }],
  }],
};

function check(id: number, overrides: Partial<GitHubCheckRun> = {}): GitHubCheckRun {
  return {
    id,
    name: 'verify',
    head_sha: 'head',
    status: 'completed',
    conclusion: 'success',
    check_suite: { id: 30 },
    app: { id: 100, slug: 'github-actions' },
    details_url: `https://github.test/checks/${id}`,
    ...overrides,
  };
}

describe('GitHub Check Run evidence observations', () => {
  it('retains duplicate names by provider ID and crosswalks exact process identities', () => {
    const result = observeGitHubEvidenceRuns({
      checkRuns: [check(40), check(41, { status: 'in_progress', conclusion: null })],
      repositoryId: 'repository:1',
      revision: 'head',
      crosswalks: [crosswalk],
    });

    expect(result.evidenceRuns).toEqual([
      expect.objectContaining({
        id: 'evidence-run:github-checks:40', revision: 'head', lifecycle: 'COMPLETED', outcome: 'PASSED',
        pipelineRunId: 'pipeline-run:1', pipelineAttemptId: 'pipeline-attempt:1', pipelineJobId: 'pipeline-job:1',
        source: { kind: 'ci', id: 'github-check-run:40:app:github-actions' },
      }),
      expect.objectContaining({
        id: 'evidence-run:github-checks:41', name: 'verify', lifecycle: 'RUNNING', outcome: 'UNKNOWN',
        pipelineRunId: 'pipeline-run:1',
      }),
    ]);
    expect(result.completeness).toMatchObject({ state: 'COMPLETE', observedCount: 2, expectedCount: 2 });
    expect(result.issues).toEqual([]);
  });

  it('excludes Spark self-observation and refuses stale Check Runs', () => {
    const result = observeGitHubEvidenceRuns({
      checkRuns: [
        check(40, { head_sha: 'old' }),
        check(99, { name: 'Spark Observability', app: { id: 999, slug: 'spark' } }),
      ],
      repositoryId: 'repository:1',
      revision: 'head',
      sparkAppId: 999,
    });

    expect(result.evidenceRuns).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'REVISION_MISMATCH', checkRunId: 40 }),
    ]);
    expect(result.completeness.state).toBe('PARTIAL');
  });

  it('retains an execution fact but omits an ambiguous process link', () => {
    const result = observeGitHubEvidenceRuns({
      checkRuns: [check(40)],
      repositoryId: 'repository:1',
      revision: 'head',
      crosswalks: [crosswalk, {
        ...crosswalk,
        pipelineRunId: 'pipeline-run:2',
        attempts: [{
          pipelineAttemptId: 'pipeline-attempt:2', attempt: 1,
          jobs: [{ pipelineJobId: 'pipeline-job:2', providerJobId: 60, providerCheckRunId: 40 }],
        }],
      }],
    });

    expect(result.evidenceRuns[0]).not.toHaveProperty('pipelineRunId');
    expect(result.evidenceRuns[0]).not.toHaveProperty('pipelineJobId');
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'AMBIGUOUS_PROCESS_LINK', checkRunId: 40 }),
    ]);
  });
});
