import type { EvidenceRunObservation, SourceCompleteness } from '@spark/core';
import { normalizeGitHubProcessState, type GitHubActionsRunCrosswalk } from './process';
import type { GitHubCheckRun } from './types';

export type GitHubEvidenceObservationIssueCode = 'REVISION_MISMATCH' | 'AMBIGUOUS_PROCESS_LINK';

export interface GitHubEvidenceObservationIssue {
  code: GitHubEvidenceObservationIssueCode;
  checkRunId: number;
  detail: string;
}

export interface ObserveGitHubEvidenceRunsInput {
  checkRuns: readonly GitHubCheckRun[];
  repositoryId: string;
  revision: string;
  crosswalks?: readonly GitHubActionsRunCrosswalk[];
  sparkAppId?: number;
  /** False only when the caller knows the Checks response was truncated. */
  sourceComplete?: boolean;
  /** Provider total when known; defaults to the supplied non-Spark Check Run count. */
  expectedCount?: number;
}

export interface GitHubEvidenceObservationResult {
  evidenceRuns: EvidenceRunObservation[];
  completeness: SourceCompleteness;
  issues: GitHubEvidenceObservationIssue[];
}

function isSparkCheck(check: GitHubCheckRun, sparkAppId: number | undefined): boolean {
  return check.name === 'Spark Observability' && (sparkAppId === undefined || check.app?.id === sparkAppId);
}

function sourceId(check: GitHubCheckRun): string {
  const app = check.app?.slug ?? check.app?.name ?? (check.app?.id !== undefined ? String(check.app.id) : 'unknown-app');
  return `github-check-run:${check.id}:app:${app}`;
}

export function observeGitHubEvidenceRuns(input: ObserveGitHubEvidenceRunsInput): GitHubEvidenceObservationResult {
  const relevantChecks = input.checkRuns.filter(check => !isSparkCheck(check, input.sparkAppId));
  const issues: GitHubEvidenceObservationIssue[] = [];
  const jobLinks = new Map<number, Array<{ pipelineRunId: string; pipelineAttemptId: string; pipelineJobId: string }>>();
  const suiteLinks = new Map<number, string[]>();

  for (const crosswalk of input.crosswalks ?? []) {
    const suites = suiteLinks.get(crosswalk.providerCheckSuiteId) ?? [];
    suites.push(crosswalk.pipelineRunId);
    suiteLinks.set(crosswalk.providerCheckSuiteId, suites);
    for (const attempt of crosswalk.attempts) {
      for (const job of attempt.jobs) {
        if (job.providerCheckRunId === undefined) continue;
        const links = jobLinks.get(job.providerCheckRunId) ?? [];
        links.push({
          pipelineRunId: crosswalk.pipelineRunId,
          pipelineAttemptId: attempt.pipelineAttemptId,
          pipelineJobId: job.pipelineJobId,
        });
        jobLinks.set(job.providerCheckRunId, links);
      }
    }
  }

  const evidenceRuns = relevantChecks.flatMap(check => {
    if (check.head_sha !== input.revision) {
      issues.push({
        code: 'REVISION_MISMATCH', checkRunId: check.id,
        detail: `omitted Check Run for revision ${check.head_sha}; evaluated revision is ${input.revision}`,
      });
      return [];
    }
    const links = jobLinks.get(check.id) ?? [];
    let processLink: { pipelineRunId?: string; pipelineAttemptId?: string; pipelineJobId?: string } = {};
    if (links.length === 1) {
      processLink = links[0];
    } else if (links.length > 1) {
      issues.push({
        code: 'AMBIGUOUS_PROCESS_LINK', checkRunId: check.id,
        detail: 'retained Check Run without a process link because multiple Actions jobs referenced it',
      });
    } else if (check.check_suite?.id !== undefined) {
      const runIds = [...new Set(suiteLinks.get(check.check_suite.id) ?? [])];
      if (runIds.length === 1) processLink = { pipelineRunId: runIds[0] };
      else if (runIds.length > 1) {
        issues.push({
          code: 'AMBIGUOUS_PROCESS_LINK', checkRunId: check.id,
          detail: 'retained Check Run without a process link because its Check Suite matched multiple Actions runs',
        });
      }
    }
    return [{
      kind: 'evidence-run' as const,
      id: `evidence-run:github-checks:${check.id}`,
      repositoryId: input.repositoryId,
      revision: input.revision,
      name: check.name,
      evidenceKind: 'github-check-run',
      ...normalizeGitHubProcessState(check.status, check.conclusion),
      ...processLink,
      source: { kind: 'ci', id: sourceId(check) },
      ...(check.details_url ?? check.html_url ? { url: check.details_url ?? check.html_url } : {}),
    }];
  });

  const expectedCount = input.expectedCount ?? relevantChecks.length;
  const complete = input.sourceComplete !== false
    && evidenceRuns.length === relevantChecks.length
    && relevantChecks.length >= expectedCount;
  return {
    evidenceRuns,
    issues,
    completeness: {
      source: 'github-check-runs',
      state: complete ? 'COMPLETE' : 'PARTIAL',
      observedCount: evidenceRuns.length,
      expectedCount,
      ...(!complete ? { reason: 'Check Run acquisition was truncated or contained a revision mismatch' } : {}),
    },
  };
}
