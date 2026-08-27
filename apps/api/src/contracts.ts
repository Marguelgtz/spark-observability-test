import type { GitHubEventRequest, GitHubRepository } from '@spark/github';

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

export interface SparkStore {
  claimDelivery(deliveryId: string, event: string): Promise<boolean>;
  releaseDelivery(deliveryId: string): Promise<void>;
  saveInstallationEvent(request: GitHubEventRequest): Promise<void>;
  saveRepository(installationId: number, repository: GitHubRepository): Promise<void>;
  findEvaluation(repositoryId: number, headSha: string): Promise<StoredEvaluation | undefined>;
  saveEvaluation(record: EvaluationRecord): Promise<void>;
}

// Profile stress fixture: this exact path is a shared contract.
