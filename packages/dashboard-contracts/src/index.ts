export type AttentionLevelV1 = 'LOW' | 'MEDIUM' | 'HIGH';
export type AttentionFilterV1 = 'ALL' | AttentionLevelV1;
export type ActivityWindowV1 = '24h' | '7d' | '30d';
export type EvidenceStatusV1 = 'PASSED' | 'PENDING' | 'FAILED' | 'MISSING' | 'UNKNOWN';

export interface ViewerV1 {
  version: 1;
  id: number;
  login: string;
  avatarUrl: string;
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
