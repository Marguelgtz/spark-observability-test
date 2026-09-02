import type { ProcessLifecycle, ProcessOutcome, Project, SparkInput } from '@spark/core';

export interface GitHubRepository {
  id: number;
  full_name: string;
  default_branch: string;
  owner: { login: string };
  name: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  html_url: string;
  state: string;
  changed_files: number;
  head: { sha: string };
  base: { sha: string };
}

export interface GitHubPullRequestFile {
  filename: string;
  status: string;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  html_url?: string;
  details_url?: string;
  check_suite?: { id: number };
  app?: { id?: number; slug?: string; name?: string } | null;
  pull_requests?: Array<{ number: number }>;
}

export interface GitHubWorkflowRun {
  id: number;
  workflow_id: number;
  check_suite_id: number;
  name: string;
  path?: string;
  head_sha: string;
  head_branch: string | null;
  event: string;
  status: string;
  conclusion: string | null;
  run_attempt: number;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  html_url: string;
}

export interface GitHubWorkflowStep {
  number: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at?: string;
  completed_at?: string;
}

export interface GitHubWorkflowJob {
  id: number;
  run_id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at?: string;
  completed_at?: string;
  html_url: string;
  check_run_url?: string;
  labels?: string[];
  steps?: GitHubWorkflowStep[];
}

export interface GitHubDeployment {
  id: number;
  sha: string;
  ref: string | null;
  /** Workflow run that triggered the deployment, when the provider identifies one. */
  task_id?: number;
  environment: string;
  created_at: string;
  updated_at?: string;
  html_url?: string;
}

export interface GitHubDeploymentStatus {
  id: number;
  deployment_id: number;
  state: string;
  environment: string | null;
  environment_guidance?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface GitHubEnvironmentPendingDeployments {
  deployments: Array<{
    id: number;
    environment: string;
    status: { id: number; state: string };
  }>;
  reviewers: Array<{ type: 'User' | 'Team' }>;
}

export interface GitHubPageResult<T> {
  items: T[];
  totalCount: number;
  complete: boolean;
}

export interface RepositoryContextResult {
  projects: Project[];
  knowledge: 'derived' | 'unknown';
  notes: string[];
}

export interface GitHubEvaluationSource {
  installationId: number;
  repository: GitHubRepository;
  pullRequest: GitHubPullRequest;
  input: SparkInput;
  existingSparkCheckRunId?: number;
}

export interface GitHubEventRequest {
  kind: 'installation' | 'installation_repositories' | 'pull_request_lifecycle' | 'deployment' | 'evaluate' | 'ignore';
  action: string;
  installationId?: number;
  repositoryId?: number;
  repositoryFullName?: string;
  pullRequestNumber?: number;
  headSha?: string;
  lifecycle?: {
    state: 'OPEN' | 'CLOSED' | 'MERGED';
    openedAt?: string;
    closedAt?: string;
    mergedAt?: string;
    mergeSha?: string;
    occurredAt: string;
    evaluate: boolean;
  };
  deployment?: {
    providerDeploymentId?: string;
    providerStatusId?: string;
    providerTaskId?: number;
    environment?: string;
    revision: string;
    lifecycle: ProcessLifecycle;
    outcome: ProcessOutcome;
  };
  payload: Record<string, unknown>;
}

export interface CheckRunPayload {
  name: string;
  head_sha?: string;
  status: 'completed';
  conclusion: 'neutral';
  output: {
    title: string;
    summary: string;
  };
}
