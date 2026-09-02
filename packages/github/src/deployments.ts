import type {
  DeploymentApprovalState,
  DeploymentObservation,
  ProcessLifecycle,
  ProcessOutcome,
  SourceCompleteness,
} from '@spark/core';
import { githubActionsRunId } from './process';
import type { GitHubApiClient } from './client';
import type { GitHubDeployment, GitHubDeploymentStatus, GitHubEnvironmentPendingDeployments } from './types';

export interface GitHubDeploymentAcquisitionLimits {
  /** Each page contains at most 100 deployments for the exact revision. */
  maxDeploymentPages: number;
  /** Most deployments retained for the exact revision. */
  maxDeployments: number;
  /** Each page contains at most 100 statuses (newest first) for one deployment. */
  maxStatusPagesPerDeployment: number;
  /** Most-recent statuses retained per deployment. */
  maxStatusesPerDeployment: number;
}

export const DEFAULT_GITHUB_DEPLOYMENT_LIMITS: GitHubDeploymentAcquisitionLimits = {
  maxDeploymentPages: 1,
  maxDeployments: 10,
  maxStatusPagesPerDeployment: 1,
  maxStatusesPerDeployment: 5,
};

export interface GitHubDeploymentCrosswalk {
  deploymentId: string;
  providerDeploymentId: number;
  providerStatusId?: number;
  /** Provider workflow-run id when the provider directly identifies the originating run. */
  providerTaskId?: number;
}

export interface GitHubDeploymentProcessResult {
  deployments: DeploymentObservation[];
  crosswalks: GitHubDeploymentCrosswalk[];
  completeness: SourceCompleteness[];
}

export interface AcquireGitHubDeploymentsInput {
  client: GitHubApiClient;
  owner: string;
  repo: string;
  repositoryId: string;
  revision: string;
  limits?: Partial<GitHubDeploymentAcquisitionLimits>;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

function acquisitionLimits(overrides?: Partial<GitHubDeploymentAcquisitionLimits>): GitHubDeploymentAcquisitionLimits {
  return {
    maxDeploymentPages: positiveInteger(overrides?.maxDeploymentPages, DEFAULT_GITHUB_DEPLOYMENT_LIMITS.maxDeploymentPages),
    maxDeployments: positiveInteger(overrides?.maxDeployments, DEFAULT_GITHUB_DEPLOYMENT_LIMITS.maxDeployments),
    maxStatusPagesPerDeployment: positiveInteger(
      overrides?.maxStatusPagesPerDeployment,
      DEFAULT_GITHUB_DEPLOYMENT_LIMITS.maxStatusPagesPerDeployment,
    ),
    maxStatusesPerDeployment: positiveInteger(
      overrides?.maxStatusesPerDeployment,
      DEFAULT_GITHUB_DEPLOYMENT_LIMITS.maxStatusesPerDeployment,
    ),
  };
}

/**
 * Maps a deployment status to independent lifecycle and outcome.
 *
 * A pending or in-progress deployment has no result yet; `waiting for
 * approval` is therefore never a failure. A completed deployment is only
 * `PASSED` when the provider says both the deployment succeeded and the
 * environment reports no error; an erroring environment downgrades success
 * to `FAILED`, and an inactive environment leaves the outcome `UNKNOWN`.
 */
export function normalizeGitHubDeploymentState(
  state: string,
  environmentGuidance: string | null | undefined,
): { lifecycle: ProcessLifecycle; outcome: ProcessOutcome } {
  if (state === 'pending' || state === 'queued') return { lifecycle: 'QUEUED', outcome: 'UNKNOWN' };
  if (state === 'in_progress') return { lifecycle: 'RUNNING', outcome: 'UNKNOWN' };
  if (state === 'success') {
    if (environmentGuidance === 'error') return { lifecycle: 'COMPLETED', outcome: 'FAILED' };
    if (environmentGuidance === 'inactive') return { lifecycle: 'COMPLETED', outcome: 'UNKNOWN' };
    return { lifecycle: 'COMPLETED', outcome: 'PASSED' };
  }
  if (state === 'failure') return { lifecycle: 'COMPLETED', outcome: 'FAILED' };
  return { lifecycle: 'UNKNOWN', outcome: 'UNKNOWN' };
}

/**
 * Derives the approval state from the environment's pending-deployments
 * response, which is the provider's statement of whether the environment
 * requires human review.
 *
 * `undefined` means the environment configuration could not be read, which
 * yields `UNKNOWN` rather than an invented answer. A deployment that is no
 * longer pending in a review environment has passed the approval gate.
 * `REJECTED` is not produced by this adapter: the deployments API surface
 * used here exposes no explicit reviewer-rejection signal.
 */
export function deriveDeploymentApprovalState(
  latestState: string | undefined,
  pending: GitHubEnvironmentPendingDeployments | undefined,
): DeploymentApprovalState {
  if (pending === undefined) return 'UNKNOWN';
  if (latestState === undefined) return 'UNKNOWN';
  const requiresReview = pending.reviewers.length > 0;
  if (latestState === 'pending' || latestState === 'queued') {
    return requiresReview ? 'WAITING' : 'NOT_REQUIRED';
  }
  if (latestState === 'in_progress' || latestState === 'success' || latestState === 'failure') {
    return requiresReview ? 'APPROVED' : 'NOT_REQUIRED';
  }
  return 'UNKNOWN';
}

function deploymentId(providerDeploymentId: number): string {
  return `deployment:github-actions:${providerDeploymentId}`;
}

function byCreatedAt(left: GitHubDeploymentStatus, right: GitHubDeploymentStatus): number {
  const leftTime = Date.parse(left.created_at) || 0;
  const rightTime = Date.parse(right.created_at) || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.id - right.id;
}

function completeness(
  source: string,
  complete: boolean,
  observedCount: number,
  expectedCount: number,
  reason: string,
): SourceCompleteness {
  return {
    source,
    state: complete ? 'COMPLETE' : 'PARTIAL',
    observedCount,
    expectedCount,
    ...(!complete ? { reason } : {}),
  };
}

export async function acquireGitHubDeployments(
  input: AcquireGitHubDeploymentsInput,
): Promise<GitHubDeploymentProcessResult> {
  const limits = acquisitionLimits(input.limits);
  const page = await input.client.listDeploymentsForRevision(
    input.owner,
    input.repo,
    input.revision,
    limits.maxDeploymentPages,
  );
  const unique = [...new Map(page.items.map(item => [item.id, item])).values()];
  const deployments = unique
    .filter(item => item.sha === input.revision)
    .sort((left, right) => left.id - right.id)
    .slice(0, limits.maxDeployments);

  const environmentCache = new Map<string, GitHubEnvironmentPendingDeployments | undefined>();
  let allStatusesComplete = true;
  let allEnvironmentsKnown = true;

  const results = await Promise.all(deployments.map(async deployment => {
    const statusPage = await input.client.listDeploymentStatuses(
      input.owner,
      input.repo,
      deployment.id,
      limits.maxStatusPagesPerDeployment,
    );
    const statuses = statusPage.items
      .filter(status => status.deployment_id === deployment.id)
      .slice(0, limits.maxStatusesPerDeployment)
      .sort(byCreatedAt);
    allStatusesComplete &&= statusPage.complete;
    if (deployment.environment && !environmentCache.has(deployment.environment)) {
      environmentCache.set(
        deployment.environment,
        await input.client.getEnvironmentPendingDeployments(input.owner, input.repo, deployment.environment),
      );
    }
    const pending = deployment.environment
      ? environmentCache.get(deployment.environment)
      : undefined;
    if (deployment.environment && pending === undefined) allEnvironmentsKnown = false;

    const latest = statuses.length > 0 ? statuses[statuses.length - 1] : undefined;
    const state = latest
      ? normalizeGitHubDeploymentState(latest.state, latest.environment_guidance)
      : { lifecycle: 'QUEUED' as ProcessLifecycle, outcome: 'UNKNOWN' as ProcessOutcome };
    const started = statuses.find(status =>
      status.state === 'in_progress' || status.state === 'success' || status.state === 'failure',
    );
    const observation: DeploymentObservation = {
      kind: 'deployment',
      id: deploymentId(deployment.id),
      repositoryId: input.repositoryId,
      revision: input.revision,
      environment: deployment.environment,
      ...(deployment.ref ? { ref: deployment.ref } : {}),
      ...state,
      approvalState: deriveDeploymentApprovalState(latest?.state, pending),
      ...(deployment.task_id !== undefined
        ? { pipelineRunId: githubActionsRunId(deployment.task_id) }
        : {}),
      ...(latest ? { providerStatusId: String(latest.id) } : {}),
      ...(deployment.created_at ? { createdAt: deployment.created_at } : {}),
      ...(started?.created_at ? { startedAt: started.created_at } : {}),
      ...(state.lifecycle === 'COMPLETED' && latest
        ? { completedAt: latest.updated_at ?? latest.created_at }
        : {}),
      source: { kind: 'ci', id: `github-actions:deployment:${deployment.id}` },
      ...(deployment.html_url ? { url: deployment.html_url } : {}),
    };
    const crosswalk: GitHubDeploymentCrosswalk = {
      deploymentId: observation.id,
      providerDeploymentId: deployment.id,
      ...(latest ? { providerStatusId: latest.id } : {}),
      ...(deployment.task_id !== undefined ? { providerTaskId: deployment.task_id } : {}),
    };
    return { observation, crosswalk };
  }));

  const listComplete = page.complete && unique.length <= limits.maxDeployments;
  return {
    deployments: results.map(item => item.observation),
    crosswalks: results.map(item => item.crosswalk),
    completeness: [
      completeness(
        'github-deployments',
        listComplete,
        deployments.length,
        page.totalCount,
        `bounded to ${limits.maxDeployments} deployments from at most ${limits.maxDeploymentPages * 100} results for the revision`,
      ),
      {
        source: 'github-deployment-statuses',
        state: allStatusesComplete ? 'COMPLETE' : 'PARTIAL',
        observedCount: results.length,
        expectedCount: deployments.length,
        ...(!allStatusesComplete ? { reason: 'bounded to the most recent statuses per deployment' } : {}),
      },
      {
        source: 'github-deployment-environments',
        state: allEnvironmentsKnown ? 'COMPLETE' : 'PARTIAL',
        observedCount: deployments.length,
        expectedCount: deployments.length,
        ...(!allEnvironmentsKnown ? { reason: 'environment approval configuration unavailable; approval states stay UNKNOWN' } : {}),
      },
    ],
  };
}
