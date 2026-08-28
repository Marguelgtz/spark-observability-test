import { evaluateChange, type SparkEvaluation } from '@spark/core';
import {
  buildSparkInputFromPullRequest,
  formatSparkCheck,
  GitHubApiClient,
  type GitHubEventRequest,
} from '@spark/github';
import type { EvidenceHealthV1 } from '@spark/dashboard-contracts';
import type { EvaluationRunTrigger, SparkStore } from './contracts';
import { buildStoredEvaluationDetail } from './evaluation-detail';

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

type EvaluationStage =
  | 'installation_auth'
  | 'persist_lifecycle'
  | 'fetch_github_input'
  | 'persist_repository'
  | 'evaluate_core'
  | 'lookup_evaluation'
  | 'create_check'
  | 'update_check'
  | 'persist_observation';

interface EvaluationLogContext {
  installationId: number;
  repository: string;
  repositoryId?: number;
  pullRequestNumber: number;
  headSha: string;
}

function evidenceHealth(evaluation: SparkEvaluation): EvidenceHealthV1 {
  if (evaluation.evidence.some(item => item.status === 'FAILED')) return 'FAILED';
  if (evaluation.evidence.some(item => item.status === 'PENDING' || item.status === 'MISSING')) return 'PENDING_OR_MISSING';
  if (evaluation.evidence.length > 0 && evaluation.evidence.every(item => item.status === 'UNKNOWN')) return 'UNKNOWN';
  return 'CLEAR';
}

export class SparkOrchestrator {
  constructor(private readonly dependencies: OrchestratorDependencies) {}

  private log(stage: EvaluationStage, outcome: 'started' | 'completed' | 'failed', context: EvaluationLogContext, error?: unknown): void {
    const message = error instanceof Error ? error.message : error === undefined ? undefined : 'unknown error';
    const statusMatch = message?.match(/\((\d{3})\)$/);
    const entry = {
      event: 'spark_evaluation', stage, outcome,
      installationId: context.installationId,
      repository: context.repository,
      repositoryId: context.repositoryId,
      pr: context.pullRequestNumber,
      sha: context.headSha,
      ...(statusMatch ? { githubStatus: Number(statusMatch[1]) } : {}),
      ...(message ? { error: message } : {}),
    };
    (outcome === 'failed' ? console.error : console.info)(JSON.stringify(entry));
  }

  private async runStage<T>(stage: EvaluationStage, context: EvaluationLogContext, operation: () => Promise<T> | T): Promise<T> {
    this.log(stage, 'started', context);
    try {
      const result = await operation();
      this.log(stage, 'completed', context);
      return result;
    } catch (error) {
      this.log(stage, 'failed', context, error);
      throw error;
    }
  }

  async handle(request: GitHubEventRequest, trigger?: EvaluationRunTrigger): Promise<OrchestratorResult> {
    if (request.kind === 'ignore') return { status: 'ignored' };
    if (request.kind === 'installation' || request.kind === 'installation_repositories') {
      await this.dependencies.store.saveInstallationEvent(request);
      return { status: 'stored' };
    }
    const { installationId, repositoryFullName, pullRequestNumber, headSha } = request;
    if (!installationId || !repositoryFullName || !pullRequestNumber || !headSha) {
      throw new Error('GitHub evaluation event is missing required immutable identifiers');
    }
    const logContext: EvaluationLogContext = {
      installationId, repository: repositoryFullName, repositoryId: request.repositoryId,
      pullRequestNumber, headSha,
    };
    if (request.kind === 'pull_request_lifecycle') {
      const lifecycle = request.lifecycle;
      if (!request.repositoryId || !lifecycle?.occurredAt || (lifecycle.state === 'MERGED' && !lifecycle.mergedAt)) {
        throw new Error('GitHub lifecycle event is missing required immutable identifiers');
      }
      await this.runStage('persist_lifecycle', logContext, () => this.dependencies.store.savePullRequestLifecycle({
        repositoryId: request.repositoryId!,
        installationId,
        repositoryFullName,
        pullRequestNumber,
        state: lifecycle.state,
        ...(lifecycle.openedAt ? { openedAt: lifecycle.openedAt } : {}),
        ...(lifecycle.closedAt ? { closedAt: lifecycle.closedAt } : {}),
        ...(lifecycle.mergedAt ? { mergedAt: lifecycle.mergedAt } : {}),
        ...(lifecycle.mergeSha ? { mergeSha: lifecycle.mergeSha } : {}),
        occurredAt: lifecycle.occurredAt,
      }));
      if (!lifecycle.evaluate) return { status: 'stored' };
    }
    const client = await this.runStage('installation_auth', logContext, () => this.dependencies.createClient(installationId));
    const source = await this.runStage('fetch_github_input', logContext, () => buildSparkInputFromPullRequest(
      client, installationId, repositoryFullName, pullRequestNumber, headSha, this.dependencies.sparkAppId,
    ));
    if (!source) return { status: 'stale' };
    logContext.repositoryId = source.repository.id;
    await this.runStage('persist_repository', logContext, () => this.dependencies.store.saveRepository(installationId, source.repository));
    const evaluation = await this.runStage('evaluate_core', logContext, () => evaluateChange(source.input));
    const existing = await this.runStage('lookup_evaluation', logContext, () => this.dependencies.store.findEvaluation(source.repository.id, headSha));
    const existingCheckRunId = existing?.checkRunId ?? source.existingSparkCheckRunId;
    const [owner, repo] = source.repository.full_name.split('/');
    const payload = formatSparkCheck(evaluation);
    const checkRun = existingCheckRunId
      ? await this.runStage('update_check', logContext, () => client.updateCheckRun(owner, repo, existingCheckRunId, payload))
      : await this.runStage('create_check', logContext, () => client.createCheckRun(owner, repo, { ...payload, head_sha: headSha }));

    const detail = buildStoredEvaluationDetail(source, evaluation, { id: checkRun.id, url: checkRun.html_url });
    const runId = crypto.randomUUID();
    const effectiveTrigger: EvaluationRunTrigger = trigger ?? { event: 'manual', action: request.action };
    const idempotencyKey = effectiveTrigger.deliveryId ? `github:${effectiveTrigger.deliveryId}` : `manual:${runId}`;
    const currentEvaluation = {
      repositoryId: source.repository.id,
      installationId,
      headSha,
      pullRequestNumber,
      checkRunId: checkRun.id,
      attention: evaluation.attention,
    };
    const currentDetail = {
      repositoryId: source.repository.id,
      headSha,
      schemaVersion: detail.version,
      baseSha: detail.baseSha,
      pullRequestTitle: detail.pullRequest.title,
      pullRequestUrl: detail.pullRequest.url,
      evaluatorVersion: detail.evaluatorVersion,
      evaluatedAt: detail.evaluatedAt,
      checkUrl: detail.check.url,
      normalized: detail,
      truncated: detail.truncation.truncated,
    };

    await this.runStage('persist_observation', logContext, () => this.dependencies.store.saveEvaluationObservation({
      run: {
        id: runId,
        idempotencyKey,
        repositoryId: source.repository.id,
        installationId,
        pullRequestNumber,
        headSha,
        baseSha: detail.baseSha,
        checkRunId: checkRun.id,
        trigger: effectiveTrigger,
        observationSource: 'LIVE',
        schemaVersion: detail.version,
        evaluatorVersion: detail.evaluatorVersion,
        evaluatedAt: detail.evaluatedAt,
        attention: evaluation.attention,
        evidenceHealth: evidenceHealth(evaluation),
        normalized: detail,
        truncated: detail.truncation.truncated,
      },
      evaluation: currentEvaluation,
      detail: currentDetail,
    }));

    return { status: 'evaluated', evaluation, checkRunId: checkRun.id };
  }
}
