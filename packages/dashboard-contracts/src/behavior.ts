import type {
  ActivityWindowV1,
  AttentionLevelV1,
  HistoryCompletenessV1,
  NotableTransitionKindV1,
  PullRequestLifecycleV1,
  PullRequestRefV1,
  RepositoryRefV1,
} from './index';

export type BehaviorEventKindV1 =
  | 'ATTENTION_UP'
  | 'ATTENTION_DOWN'
  | 'EVIDENCE_WORSE'
  | 'EVIDENCE_BETTER'
  | 'SENSITIVE_SURFACE_ADDED'
  | 'SCOPE_EXPANDED';

export interface BehaviorBoundaryV1 {
  transitionId: string;
  occurredAt: string;
  kinds: BehaviorEventKindV1[];
  sourceKinds: NotableTransitionKindV1[];
  severity: 'INFO' | 'MATERIAL';
}

export type BehaviorMotifKindV1 =
  | 'REGRESSION_THEN_RECOVERY'
  | 'SCOPE_THEN_REGRESSION'
  | 'SURFACE_THEN_ATTENTION_UP'
  | 'ATTENTION_OSCILLATION';

export interface BehaviorMotifOccurrenceV1 {
  id: string;
  kind: BehaviorMotifKindV1;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  transitionIds: string[];
}

export type BehaviorArchetypeKindV1 =
  | 'STABLE'
  | 'DETERIORATING'
  | 'RECOVERED'
  | 'OSCILLATING';

export interface BehaviorArchetypeV1 {
  kind: BehaviorArchetypeKindV1;
  evidence: string[];
}

export interface ChangeBehaviorFeaturesV1 {
  evaluationCount: number;
  notableBoundaryCount: number;
  attentionIncreaseCount: number;
  attentionDecreaseCount: number;
  evidenceRegressionCount: number;
  evidenceRecoveryCount: number;
  sensitiveSurfaceAdditionCount: number;
  scopeExpansionCount: number;
  reachedHigh: boolean;
  recoveredFromHigh: boolean;
  regressionThenRecovery: boolean;
  oscillatedAttention: boolean;
  timeAtHighMs: number;
  timeToFirstRegressionMs?: number;
  timeToFirstRecoveryAfterRegressionMs?: number;
}

export interface BehaviorSignaturesV1 {
  full: string;
  attention: string;
}

export interface ChangeBehaviorV1 {
  version: 1;
  behaviorSchemaVersion: 1;
  repository: RepositoryRefV1;
  pullRequest: PullRequestRefV1;
  startedAt: string;
  lastEvaluatedAt: string;
  initialAttention: AttentionLevelV1;
  peakAttention: AttentionLevelV1;
  finalAttention: AttentionLevelV1;
  boundaries: BehaviorBoundaryV1[];
  motifs: BehaviorMotifOccurrenceV1[];
  archetypes: BehaviorArchetypeV1[];
  features: ChangeBehaviorFeaturesV1;
  signatures: BehaviorSignaturesV1;
  lifecycle?: PullRequestLifecycleV1;
  historyCompleteness?: HistoryCompletenessV1;
  truncated: boolean;
}

export type BehaviorOutcomeKindV1 =
  | 'RESOLVED_BEFORE_MERGE'
  | 'MERGED_UNRESOLVED'
  | 'OUTCOME_UNAVAILABLE'
  | 'CLOSED_WITHOUT_MERGE'
  | 'OPEN';

export interface BehaviorOutcomeCountsV1 {
  resolvedBeforeMerge: number;
  mergedUnresolved: number;
  outcomeUnavailable: number;
  closedWithoutMerge: number;
  open: number;
}

export interface BehaviorPatternExampleV1 {
  repository: RepositoryRefV1;
  pullRequest: PullRequestRefV1;
  latestAt: string;
  outcome: BehaviorOutcomeKindV1;
  occurrences: number;
  truncated: boolean;
}

export interface BehaviorPatternRepositoryCountV1 {
  repository: RepositoryRefV1;
  occurrences: number;
  affectedPRs: number;
}

export type BehaviorPatternKindV1 = 'MOTIF' | 'SIGNATURE';

export interface BehaviorPatternV1 {
  kind: BehaviorPatternKindV1;
  key: string;
  label: string;
  motifKind?: BehaviorMotifKindV1;
  signature?: string;
  occurrences: number;
  affectedPRs: number;
  outcomes: BehaviorOutcomeCountsV1;
  repositories: BehaviorPatternRepositoryCountV1[];
  examples: BehaviorPatternExampleV1[];
}

export interface BehaviorPatternsResponseV1 {
  version: 1;
  behaviorSchemaVersion: 1;
  selectedWindow: ActivityWindowV1;
  selectedRepositoryId: number | null;
  observedPRs: number;
  patterns: BehaviorPatternV1[];
}
