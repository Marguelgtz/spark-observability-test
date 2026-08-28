import type {
  AttentionLevelV1,
  EvaluationDetailV1,
  EvaluationSummaryV1,
  EvidenceHealthV1,
  EvidenceStatusV1,
  PullRequestDetailV1,
  PullRequestEvidenceIssueV1,
  PullRequestInsightV1,
  PullRequestTransitionKindV1,
  PullRequestTransitionV1,
} from '@spark/dashboard-contracts';

export interface PullRequestRunInput {
  summary: EvaluationSummaryV1;
  detail?: EvaluationDetailV1;
}

const ATTENTION_RANK: Record<AttentionLevelV1, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export function evidenceHealth(summary: EvaluationSummaryV1): EvidenceHealthV1 {
  const evidence = summary.evidenceSummary;
  if (evidence.failed > 0) return 'FAILED';
  if (evidence.pending > 0 || evidence.missing > 0) return 'PENDING_OR_MISSING';
  if (evidence.unknown > 0 && evidence.passed === 0) return 'UNKNOWN';
  if (evidence.passed > 0 || evidence.unknown === 0) return 'CLEAR';
  return 'UNKNOWN';
}

function transition(
  kind: PullRequestTransitionKindV1,
  previous: EvaluationSummaryV1,
  current: EvaluationSummaryV1,
): PullRequestTransitionV1 {
  return {
    kind,
    fromHeadSha: previous.headSha,
    toHeadSha: current.headSha,
    fromAttention: previous.attention,
    toAttention: current.attention,
    fromEvidenceHealth: evidenceHealth(previous),
    toEvidenceHealth: evidenceHealth(current),
    evaluatedAt: current.evaluatedAt,
  };
}

function deriveTransitions(runsNewestFirst: PullRequestRunInput[]): PullRequestTransitionV1[] {
  const chronological = [...runsNewestFirst].reverse();
  const transitions: PullRequestTransitionV1[] = [];

  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1].summary;
    const current = chronological[index].summary;
    const before = evidenceHealth(previous);
    const after = evidenceHealth(current);

    if (before !== after) {
      if ((before === 'FAILED' || before === 'PENDING_OR_MISSING') && after === 'CLEAR') {
        transitions.push(transition('EVIDENCE_RECOVERED', previous, current));
      } else if (before === 'CLEAR' && after === 'FAILED') {
        transitions.push(transition('EVIDENCE_REGRESSED', previous, current));
      } else if (after === 'PENDING_OR_MISSING') {
        transitions.push(transition('EVIDENCE_BECAME_PENDING', previous, current));
      } else if (before === 'PENDING_OR_MISSING' && after !== 'PENDING_OR_MISSING') {
        transitions.push(transition('EVIDENCE_RESOLVED', previous, current));
      }
    }

    if (ATTENTION_RANK[current.attention] > ATTENTION_RANK[previous.attention]) {
      transitions.push(transition('ATTENTION_INCREASED', previous, current));
    } else if (ATTENTION_RANK[current.attention] < ATTENTION_RANK[previous.attention]) {
      transitions.push(transition('ATTENTION_DECREASED', previous, current));
    }
  }

  return transitions;
}

function streak(runsNewestFirst: PullRequestRunInput[], target: EvidenceHealthV1): number {
  let count = 0;
  for (const run of runsNewestFirst) {
    if (evidenceHealth(run.summary) !== target) break;
    count += 1;
  }
  return count;
}

function issueStatusRank(status: EvidenceStatusV1): number {
  if (status === 'FAILED') return 4;
  if (status === 'MISSING') return 3;
  if (status === 'PENDING') return 2;
  if (status === 'UNKNOWN') return 1;
  return 0;
}

function deriveEvidenceIssues(runsNewestFirst: PullRequestRunInput[]): PullRequestEvidenceIssueV1[] {
  const issues = new Map<string, PullRequestEvidenceIssueV1>();

  for (const run of runsNewestFirst) {
    for (const evidence of run.detail?.evidence ?? []) {
      let issue = issues.get(evidence.name);
      if (!issue) {
        issue = {
          name: evidence.name,
          failedRuns: 0,
          pendingRuns: 0,
          missingRuns: 0,
          unknownRuns: 0,
          latestStatus: evidence.status,
        };
        issues.set(evidence.name, issue);
      }

      if (evidence.status === 'FAILED') issue.failedRuns += 1;
      else if (evidence.status === 'PENDING') issue.pendingRuns += 1;
      else if (evidence.status === 'MISSING') issue.missingRuns += 1;
      else if (evidence.status === 'UNKNOWN') issue.unknownRuns += 1;

      if (
        !issue.lastProblemAt &&
        (evidence.status === 'FAILED' || evidence.status === 'PENDING' || evidence.status === 'MISSING' || evidence.status === 'UNKNOWN')
      ) {
        issue.lastProblemAt = run.summary.evaluatedAt;
        issue.lastProblemHeadSha = run.summary.headSha;
      }
    }
  }

  return [...issues.values()]
    .filter(issue => issue.failedRuns + issue.pendingRuns + issue.missingRuns + issue.unknownRuns > 0)
    .sort((a, b) => {
      const aProblems = a.failedRuns + a.pendingRuns + a.missingRuns + a.unknownRuns;
      const bProblems = b.failedRuns + b.pendingRuns + b.missingRuns + b.unknownRuns;
      if (bProblems !== aProblems) return bProblems - aProblems;
      if (issueStatusRank(b.latestStatus) !== issueStatusRank(a.latestStatus)) {
        return issueStatusRank(b.latestStatus) - issueStatusRank(a.latestStatus);
      }
      return a.name.localeCompare(b.name);
    });
}

function deriveInsights(
  runsNewestFirst: PullRequestRunInput[],
  transitions: PullRequestTransitionV1[],
): PullRequestInsightV1[] {
  const latest = runsNewestFirst[0]?.summary;
  if (!latest) return [];
  const insights: PullRequestInsightV1[] = [];
  const currentHealth = evidenceHealth(latest);

  if (currentHealth === 'CLEAR') insights.push({ kind: 'CURRENTLY_CLEAR', headSha: latest.headSha });
  else if (currentHealth === 'FAILED') insights.push({ kind: 'CURRENTLY_FAILING', headSha: latest.headSha });
  else if (currentHealth === 'PENDING_OR_MISSING') insights.push({ kind: 'CURRENTLY_WAITING', headSha: latest.headSha });

  const clearStreak = streak(runsNewestFirst, 'CLEAR');
  const failureStreak = streak(runsNewestFirst, 'FAILED');
  if (clearStreak > 1) insights.push({ kind: 'CLEAR_STREAK', value: clearStreak, headSha: latest.headSha });
  if (failureStreak > 1) insights.push({ kind: 'FAILURE_STREAK', value: failureStreak, headSha: latest.headSha });

  const insightFromTransition = (
    transitionKind: PullRequestTransitionKindV1,
    insightKind: PullRequestInsightV1['kind'],
  ) => {
    const matches = transitions.filter(item => item.kind === transitionKind);
    const last = matches.at(-1);
    if (last) insights.push({ kind: insightKind, value: matches.length, headSha: last.toHeadSha });
  };

  insightFromTransition('EVIDENCE_RECOVERED', 'EVIDENCE_RECOVERED');
  insightFromTransition('EVIDENCE_REGRESSED', 'EVIDENCE_REGRESSED');
  insightFromTransition('ATTENTION_INCREASED', 'ATTENTION_INCREASED');
  insightFromTransition('ATTENTION_DECREASED', 'ATTENTION_DECREASED');

  return insights;
}

export function buildPullRequestDetail(
  runsNewestFirst: PullRequestRunInput[],
  totalRunCount = runsNewestFirst.length,
): PullRequestDetailV1 | undefined {
  if (!runsNewestFirst.length) return undefined;
  const runs = runsNewestFirst.map(run => run.summary);
  const latest = runs[0];
  const oldest = runs[runs.length - 1];
  const evidenceCounts: PullRequestDetailV1['history']['evidenceCounts'] = {
    CLEAR: 0,
    FAILED: 0,
    PENDING_OR_MISSING: 0,
    UNKNOWN: 0,
  };
  const attentionCounts: PullRequestDetailV1['history']['attentionCounts'] = { LOW: 0, MEDIUM: 0, HIGH: 0 };

  for (const run of runs) {
    evidenceCounts[evidenceHealth(run)] += 1;
    attentionCounts[run.attention] += 1;
  }

  const transitions = deriveTransitions(runsNewestFirst);
  return {
    version: 1,
    repository: latest.repository,
    pullRequest: latest.pullRequest,
    latest,
    history: {
      totalRuns: totalRunCount,
      evidenceCounts,
      attentionCounts,
      firstEvaluatedAt: oldest.evaluatedAt,
      lastEvaluatedAt: latest.evaluatedAt,
      currentClearStreak: streak(runsNewestFirst, 'CLEAR'),
      currentFailureStreak: streak(runsNewestFirst, 'FAILED'),
    },
    evidenceIssues: deriveEvidenceIssues(runsNewestFirst),
    transitions,
    insights: deriveInsights(runsNewestFirst, transitions),
    runs,
    truncated: totalRunCount > runs.length,
  };
}
