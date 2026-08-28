import type { AttentionLevelV1, EvidenceHealthV1 } from '@spark/dashboard-contracts';
import type { GitHubEventRequest, GitHubRepository } from '@spark/github';
import type { StoredEvaluationDetailV1 } from './evaluation-detail';

export interface StoredEvaluation {
  repositoryId: number;
  headSha: string;
  pullRequestNumber: number;
  checkRunId: number;
  attention: string;
}

export interface EvaluationRecord extends StoredEvaluation {
  installationId: number;
}

export interface EvaluationDetailRecord {
  repositoryId: number;
  headSha: string;
  schemaVersion: number;
  baseSha: string;
  pullRequestTitle: string;
  pullRequestUrl: string;
  evaluatorVersion: string;
  evaluatedAt: string;
  checkUrl?: string;
  normalized: StoredEvaluationDetailV1;
  truncated: boolean;
}

export type EvaluationRunObservationSource = 'LIVE' | 'BACKFILL';

export interface EvaluationRunTrigger {
  event: string;
  action: string;
  deliveryId?: string;
}

export interface EvaluationRunRecord {
  id: string;
  idempotencyKey: string;
  repositoryId: number;
  installationId: number;
  pullRequestNumber: number;
  headSha: string;
  baseSha?: string;
  checkRunId: number;
  trigger: EvaluationRunTrigger;
  observationSource: EvaluationRunObservationSource;
  schemaVersion?: number;
  evaluatorVersion?: string;
  evaluatedAt: string;
  attention: AttentionLevelV1;
  evidenceHealth: EvidenceHealthV1;
  normalized?: StoredEvaluationDetailV1;
  truncated: boolean;
}

export interface EvaluationObservationRecord {
  run: EvaluationRunRecord;
  evaluation: EvaluationRecord;
  detail: EvaluationDetailRecord;
}

export interface PullRequestLifecycleRecord {
  repositoryId: number;
  installationId: number;
  repositoryFullName: string;
  pullRequestNumber: number;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  openedAt?: string;
  closedAt?: string;
  mergedAt?: string;
  mergeSha?: string;
  occurredAt: string;
}

export interface SparkStore {
  claimDelivery(deliveryId: string, event: string): Promise<boolean>;
  releaseDelivery(deliveryId: string): Promise<void>;
  saveInstallationEvent(request: GitHubEventRequest): Promise<void>;
  saveRepository(installationId: number, repository: GitHubRepository): Promise<void>;
  findEvaluation(repositoryId: number, headSha: string): Promise<StoredEvaluation | undefined>;
  saveEvaluation(record: EvaluationRecord): Promise<void>;
  saveEvaluationDetail(record: EvaluationDetailRecord): Promise<void>;
  saveEvaluationObservation(record: EvaluationObservationRecord): Promise<void>;
  savePullRequestLifecycle(record: PullRequestLifecycleRecord): Promise<void>;
}
