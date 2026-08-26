import { evaluateChange, type SparkEvaluation } from '@spark/core';
import {
  buildSparkInputFromPullRequest,
  formatSparkCheck,
  GitHubApiClient,
  type GitHubEventRequest,
} from '@spark/github';
import type { SparkStore } from './contracts';

export interface OrchestratorDependencies {
  store: SparkStore;
  createClient(installationId: number): Promise<GitHubApiClient>;
  sparkAppId: number;
}

export interface OrchestratorResult {
  status: 'ignored' | 'stored' | 'evaluated' | 'stale';
  evaluation?: SparkEvaluation;
  checkRunId?: number;
}

export class SparkOrchestrator {
  constructor(private readonly dependencies: OrchestratorDependencies) {}

  async handle(request: GitHubEventRequest): Promise<OrchestratorResult> {
    if (request.kind === 'ignore') return { status: 'ignored' };
    if (request.kind === 'installation' || request.kind === 'installation_repositories') {
      await this.dependencies.store.saveInstallationEvent(request);
      return { status: 'stored' };
    }
    const { installationId, repositoryFullName, pullRequestNumber, headSha } = request;
    if (!installationId || !repositoryFullName || !pullRequestNumber || !headSha) {
      throw new Error('GitHub evaluation event is missing required immutable identifiers');
    }
    const client = await this.dependencies.createClient(installationId);
    const source = await buildSparkInputFromPullRequest(
      client, installationId, repositoryFullName, pullRequestNumber, headSha, this.dependencies.sparkAppId,
    );
    if (!source) return { status: 'stale' };
    await this.dependencies.store.saveRepository(installationId, source.repository);
    const evaluation = evaluateChange(source.input);
    const existing = await this.dependencies.store.findEvaluation(source.repository.id, headSha);
    const existingCheckRunId = existing?.checkRunId ?? source.existingSparkCheckRunId;
    const [owner, repo] = source.repository.full_name.split('/');
    const payload = formatSparkCheck(evaluation);
    const checkRun = existingCheckRunId
      ? await client.updateCheckRun(owner, repo, existingCheckRunId, payload)
      : await client.createCheckRun(owner, repo, { ...payload, head_sha: headSha });
    await this.dependencies.store.saveEvaluation({
      repositoryId: source.repository.id,
      installationId,
      headSha,
      pullRequestNumber,
      checkRunId: checkRun.id,
      attention: evaluation.attention,
    });
    return { status: 'evaluated', evaluation, checkRunId: checkRun.id };
  }
}
