import type {
  ActivityWindowV1,
  AttentionLevelV1,
  EvidenceHealthV1,
  PullRequestRefV1,
  RepositoryRefV1,
  TrajectoryFeedbackClassificationV1,
} from './index';

export interface OutcomeTimelinePointV1 {
  bucketStart: string;
  resolved: number;
  unresolved: number;
  unavailable: number;
}

export interface OutcomeTransitionTrendPointV1 {
  bucketStart: string;
  regressions: number;
  recoveries: number;
  attentionIncreases: number;
  attentionDecreases: number;
}

export interface OutcomeUnresolvedItemV1 {
  repository: RepositoryRefV1;
  pullRequest: PullRequestRefV1;
  mergedAt: string;
  mergeSha?: string;
  preMergeAttention?: AttentionLevelV1;
  preMergeEvidenceHealth?: EvidenceHealthV1;
}

export interface OutcomeOverviewV1 {
  version: 1;
  selectedWindow: ActivityWindowV1;
  selectedRepositoryId: number | null;
  merges: { total: number; resolved: number; unresolved: number; unavailable: number };
  preMergeAttention: Record<AttentionLevelV1, number> & { UNKNOWN: number };
  preMergeEvidence: Record<EvidenceHealthV1, number> & { UNAVAILABLE: number };
  stabilization: {
    regressedPRs: number;
    recoveredPRs: number;
    recoveredAfterRegressionPRs: number;
    oscillatingPRs: number;
    attentionIncreases: number;
    attentionDecreases: number;
    regressions: number;
    recoveries: number;
  };
  feedback: {
    materialTransitions: number;
    classifiedTransitions: number;
    classifications: Record<TrajectoryFeedbackClassificationV1, number>;
  };
  timeline: OutcomeTimelinePointV1[];
  transitionTrend: OutcomeTransitionTrendPointV1[];
  unresolved: OutcomeUnresolvedItemV1[];
  unresolvedTruncated: boolean;
}
