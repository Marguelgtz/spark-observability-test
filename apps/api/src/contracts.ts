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

export interface SparkStore {
  claimDelivery(deliveryId: string, event: string): Promise<boolean>;
  releaseDelivery(deliveryId: string): Promise<void>;
  saveInstallationEvent(request: GitHubEventRequest): Promise<void>;
  saveRepository(installationId: number, repository: GitHubRepository): Promise<void>;
  findEvaluation(repositoryId: number, headSha: string): Promise<StoredEvaluation | undefined>;
  saveEvaluation(record: EvaluationRecord): Promise<void>;
  saveEvaluationDetail(record: EvaluationDetailRecord): Promise<void>;
}
