export type AttentionLevelV1 = 'LOW' | 'MEDIUM' | 'HIGH';
export type AttentionFilterV1 = 'ALL' | AttentionLevelV1;
export type ActivityWindowV1 = '24h' | '7d' | '30d';
export type EvidenceStatusV1 = 'PASSED' | 'PENDING' | 'FAILED' | 'MISSING' | 'UNKNOWN';
export type EvidenceHealthV1 = 'CLEAR' | 'FAILED' | 'PENDING_OR_MISSING' | 'UNKNOWN';
export type EvaluationObservationSourceV1 = 'LIVE' | 'BACKFILL';
export type HistoryCompletenessV1 = 'COMPLETE' | 'PARTIAL_BACKFILL';

export interface ViewerV1 {
  version: 1;
  id: number;
  login: string;
  avatarUrl: string;
}

export type DashboardFavoriteV1 =
  | { kind: 'pull-request'; repositoryId: number; pullRequestNumber: number }
  | { kind: 'evaluation'; repositoryId: number; pullRequestNumber: number; runId?: string; headSha: string };

export interface FavoritesResponseV1 {
  version: 1;
  favorites: DashboardFavoriteV1[];
}

export interface AccountV1 {
  version: 1;
  viewer: ViewerV1;
  repositoryCount: number;
  installationCount: number;
  sessionExpiresAt: string;
  githubInstallUrl: string;
  githubSettingsUrl: string;
}

export interface RepositoryRefV1 {
  id: number;
  owner: string;
  name: string;
  url: string;
}

export interface PullRequestRefV1 {
  number: number;
  title: string;
  url: string;
}

export interface ChangeSummaryV1 {
  files: number;
  additions?: number;
  deletions?: number;
  extensions: Array<{ extension: string; count: number }>;
}

export interface EvidenceSummaryV1 {
  passed: number;
  pending: number;
  failed: number;
  missing: number;
  unknown: number;
}

export interface ObservedRepositoryV1 extends RepositoryRefV1 {
  pullRequestCount: number;
  /** @deprecated V1 compatibility alias. Prefer pullRequestCount. */
  evaluationCount?: number;
}

export interface EvaluationSummaryV1 {
  /** Immutable observation identity when this summary came from evaluation_runs. */
  runId?: string;
  /** LIVE for fully observed runs, BACKFILL for lossy historical reconstruction. */
  observationSource?: EvaluationObservationSourceV1;
  repository: RepositoryRefV1;
  pullRequest: PullRequestRefV1;
  headSha: string;
  attention: AttentionLevelV1;
  topReasons: string[];
  changeSummary: ChangeSummaryV1;
  sensitiveSurfaces: string[];
  evidenceSummary: EvidenceSummaryV1;
  evaluatedAt: string;
  githubCheckUrl: string;
  detailAvailable: boolean;
}

export interface PullRequestHistorySummaryV1 {
  runCount: number;
  attentionCounts: Record<AttentionLevelV1, number>;
}

export interface PullRequestActivityV1 {
  repository: RepositoryRefV1;
  pullRequest: PullRequestRefV1;
  latest: EvaluationSummaryV1;
  history: PullRequestHistorySummaryV1;
}

export interface PullRequestHistoryResponseV1 {
  version: 1;
  repository: RepositoryRefV1;
  pullRequest: PullRequestRefV1;
  totalRunCount: number;
  runs: EvaluationSummaryV1[];
  historyCompleteness?: HistoryCompletenessV1;
  truncated: boolean;
}

export type PullRequestTransitionKindV1 =
  | 'EVIDENCE_RECOVERED'
  | 'EVIDENCE_REGRESSED'
  | 'EVIDENCE_BECAME_PENDING'
  | 'EVIDENCE_RESOLVED'
  | 'ATTENTION_INCREASED'
  | 'ATTENTION_DECREASED';

export interface PullRequestTransitionV1 {
  kind: PullRequestTransitionKindV1;
  fromHeadSha: string;
  toHeadSha: string;
  fromAttention: AttentionLevelV1;
  toAttention: AttentionLevelV1;
  fromEvidenceHealth: EvidenceHealthV1;
  toEvidenceHealth: EvidenceHealthV1;
  evaluatedAt: string;
}

export interface TransitionEvidenceDeltaV1 {
  name: string;
  from?: EvidenceStatusV1;
  to?: EvidenceStatusV1;
  change: 'ADDED' | 'REMOVED' | 'STATUS_CHANGED';
}

export interface TransitionDeltaV1 {
  fromRunId: string;
  toRunId: string;
  fromHeadSha: string;
  toHeadSha: string;
  evaluatedAt: string;
  timeInPreviousStateMs: number;
  attention?: {
    from: AttentionLevelV1;
    to: AttentionLevelV1;
    direction: 'INCREASED' | 'DECREASED';
  };
  evidenceHealth?: { from: EvidenceHealthV1; to: EvidenceHealthV1 };
  evidence: TransitionEvidenceDeltaV1[];
  areas: {
    directAdded: string[];
    directRemoved: string[];
    affectedAdded: string[];
    affectedRemoved: string[];
  };
  sensitiveSurfaces: { added: string[]; removed: string[] };
  changedFiles: { added: string[]; removed: string[] };
  reasons: { added: string[]; removed: string[] };
  profile?: { changed: boolean; fromSourceSha?: string; toSourceSha?: string };
  detailCompleteness: 'COMPLETE' | 'PARTIAL';
}

export type NotableTransitionKindV1 =
  | 'ATTENTION_INCREASED'
  | 'ATTENTION_DECREASED'
  | 'EVIDENCE_REGRESSED'
  | 'EVIDENCE_RECOVERED'
  | 'EVIDENCE_BECAME_PENDING'
  | 'EVIDENCE_RESOLVED'
  | 'SENSITIVE_SURFACE_ADDED'
  | 'CHANGE_SCOPE_EXPANDED';

export interface NotableTransitionV1 {
  id: string;
  fromRunId: string;
  toRunId: string;
  occurredAt: string;
  kinds: NotableTransitionKindV1[];
  severity: 'INFO' | 'MATERIAL';
  delta: TransitionDeltaV1;
}

export type PullRequestInsightKindV1 =
  | 'CURRENTLY_CLEAR'
  | 'CURRENTLY_FAILING'
  | 'CURRENTLY_WAITING'
  | 'CLEAR_STREAK'
  | 'FAILURE_STREAK'
  | 'EVIDENCE_RECOVERED'
  | 'EVIDENCE_REGRESSED'
  | 'ATTENTION_INCREASED'
  | 'ATTENTION_DECREASED';

export interface PullRequestInsightV1 {
  kind: PullRequestInsightKindV1;
  value?: number;
  headSha?: string;
}

export interface PullRequestEvidenceIssueV1 {
  name: string;
  failedRuns: number;
  pendingRuns: number;
  missingRuns: number;
  unknownRuns: number;
  latestStatus: EvidenceStatusV1;
  lastProblemHeadSha?: string;
  lastProblemAt?: string;
}

export interface PullRequestDetailV1 {
  version: 1;
  repository: RepositoryRefV1;
  pullRequest: PullRequestRefV1;
  latest: EvaluationSummaryV1;
  history: {
    totalRuns: number;
    evidenceCounts: Record<EvidenceHealthV1, number>;
    attentionCounts: Record<AttentionLevelV1, number>;
    firstEvaluatedAt: string;
    lastEvaluatedAt: string;
    currentClearStreak: number;
    currentFailureStreak: number;
  };
  evidenceIssues: PullRequestEvidenceIssueV1[];
  transitions: PullRequestTransitionV1[];
  insights: PullRequestInsightV1[];
  runs: EvaluationSummaryV1[];
  historyCompleteness?: HistoryCompletenessV1;
  truncated: boolean;
}

export interface PullRequestTrajectoryV1 {
  version: 1;
  repository: RepositoryRefV1;
  pullRequest: PullRequestRefV1;
  current: EvaluationSummaryV1;
  summary: {
    totalRuns: number;
    analyzedRuns: number;
    totalTransitions: number;
    regressions: number;
    recoveries: number;
    attentionIncreases: number;
    attentionDecreases: number;
    currentClearStreak: number;
    firstEvaluatedAt: string;
    lastEvaluatedAt: string;
  };
  evidenceIssues: PullRequestEvidenceIssueV1[];
  insights: PullRequestInsightV1[];
  notableTransitions: NotableTransitionV1[];
  runs: EvaluationSummaryV1[];
  historyCompleteness?: HistoryCompletenessV1;
  truncated: boolean;
}

export interface ActivityResponseV1 {
  version: 1;
  selectedWindow: ActivityWindowV1;
  selectedAttention: AttentionFilterV1;
  selectedRepositoryId: number | null;
  counts: Record<AttentionLevelV1, number>;
  repositories: ObservedRepositoryV1[];
  pullRequests: PullRequestActivityV1[];
  /** @deprecated V1 compatibility alias containing the latest evaluation for each returned PR. */
  evaluations?: EvaluationSummaryV1[];
  pagination: { nextCursor: string | null };
}

export interface ActivityQueryV1 {
  window: ActivityWindowV1;
  attention: AttentionFilterV1;
  repositoryId: number | null;
  cursor?: string | null;
  limit?: number;
}

export interface ChangedFileV1 {
  path: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions?: number;
  deletions?: number;
  previousPath?: string;
}

export interface EvidenceV1 {
  name: string;
  status: EvidenceStatusV1;
  coverage: string[] | 'UNKNOWN';
  url?: string;
}

export interface ProfileAreaV1 {
  id: string;
  criticality?: 'low' | 'medium' | 'high';
  owners: string[];
  expectedEvidence: string[];
}

export interface ProfileContextV1 {
  state: 'ACTIVE' | 'ABSENT' | 'INVALID';
  sourceSha?: string;
  version?: number;
  matchedAreas: ProfileAreaV1[];
}

export interface EvaluationDetailV1 {
  version: 1;
  runId?: string;
  observationSource?: EvaluationObservationSourceV1;
  repository: RepositoryRefV1;
  pullRequest: PullRequestRefV1;
  headSha: string;
  baseSha: string;
  evaluatedAt: string;
  evaluatorVersion: string;
  attention: AttentionLevelV1;
  reasons: string[];
  changeSummary: ChangeSummaryV1;
  changedFiles: ChangedFileV1[];
  directAreas: string[];
  affectedAreas: string[];
  unmappedPaths: string[];
  sensitiveSurfaces: string[];
  evidence: EvidenceV1[];
  profile: ProfileContextV1;
  analysisNotes: string[];
  githubCheckUrl: string;
}

export type EvaluationDetailResponseV1 =
  | { version: 1; status: 'available'; detail: EvaluationDetailV1 }
  | { version: 1; status: 'unavailable'; reason: 'LEGACY_RECORD'; summary: EvaluationSummaryV1 };
