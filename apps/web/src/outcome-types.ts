import type { OutcomeOverviewV1, OutcomeUnresolvedItemV1 } from '@spark/dashboard-contracts/outcome';
import type { NotableTransitionInsightsV1, OverviewDrilldownResponseV1 } from './overview-api';
import type { ActivityUrlState } from './state';

export type { OutcomeOverviewV1 } from '@spark/dashboard-contracts/outcome';

type OutcomeEnhancedResponse = OverviewDrilldownResponseV1 & { outcomes?: OutcomeOverviewV1 };

function transitionCount(transitions: NotableTransitionInsightsV1, kind: string): number {
  return transitions.byKind.find((item) => item.kind === kind)?.count ?? 0;
}

export function outcomeOverview(
  response: OverviewDrilldownResponseV1,
  transitions: NotableTransitionInsightsV1,
  state: ActivityUrlState,
): { data: OutcomeOverviewV1; complete: boolean } {
  const complete = (response as OutcomeEnhancedResponse).outcomes;
  if (complete) return { data: complete, complete: true };

  const preMergeAttention: OutcomeOverviewV1['preMergeAttention'] = { LOW: 0, MEDIUM: 0, HIGH: 0, UNKNOWN: 0 };
  const preMergeEvidence: OutcomeOverviewV1['preMergeEvidence'] = {
    CLEAR: 0,
    FAILED: 0,
    PENDING_OR_MISSING: 0,
    UNKNOWN: 0,
    UNAVAILABLE: 0,
  };
  const unresolved: OutcomeUnresolvedItemV1[] = [];
  for (const item of response.items) {
    if (item.kind !== 'merge') continue;
    const attention = item.lifecycle.preMergeAttention;
    if (attention) preMergeAttention[attention] += 1;
    else preMergeAttention.UNKNOWN += 1;
    const evidence = item.lifecycle.preMergeEvidenceHealth;
    if (evidence) preMergeEvidence[evidence] += 1;
    else preMergeEvidence.UNAVAILABLE += 1;
    unresolved.push({
      repository: item.repository,
      pullRequest: item.pullRequest,
      mergedAt: item.lifecycle.mergedAt ?? item.lifecycle.lastEventAt,
      ...(item.lifecycle.mergeSha ? { mergeSha: item.lifecycle.mergeSha } : {}),
      ...(attention ? { preMergeAttention: attention } : {}),
      ...(evidence ? { preMergeEvidenceHealth: evidence } : {}),
    });
  }

  return {
    complete: false,
    data: {
      version: 1,
      selectedWindow: state.window,
      selectedRepositoryId: state.repositoryId,
      merges: { total: response.total, resolved: 0, unresolved: response.total, unavailable: 0 },
      preMergeAttention,
      preMergeEvidence,
      stabilization: {
        regressedPRs: 0,
        recoveredPRs: 0,
        recoveredAfterRegressionPRs: 0,
        oscillatingPRs: 0,
        attentionIncreases: transitionCount(transitions, 'ATTENTION_INCREASED'),
        attentionDecreases: transitionCount(transitions, 'ATTENTION_DECREASED'),
        regressions: transitionCount(transitions, 'EVIDENCE_REGRESSED'),
        recoveries: transitionCount(transitions, 'EVIDENCE_RECOVERED'),
      },
      feedback: {
        materialTransitions: transitions.material,
        classifiedTransitions: 0,
        classifications: { USEFUL: 0, EXPECTED: 0, FALSE_POSITIVE: 0, FIXED_BECAUSE_SPARK: 0 },
      },
      timeline: response.trend.map((point) => ({
        bucketStart: point.bucketStart,
        resolved: 0,
        unresolved: point.mergedUnresolved,
        unavailable: 0,
      })),
      transitionTrend: transitions.trend.map((point) => ({
        bucketStart: point.bucketStart,
        regressions: point.regressions,
        recoveries: point.recoveries,
        attentionIncreases: point.attentionIncreases,
        attentionDecreases: point.attentionDecreases,
      })),
      unresolved,
      unresolvedTruncated: response.truncated,
    },
  };
}
