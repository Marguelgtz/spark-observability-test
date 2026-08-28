import type { Project, SparkInput } from '@spark/core';

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
  app?: { id?: number; slug?: string; name?: string } | null;
  pull_requests?: Array<{ number: number }>;
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
  kind: 'installation' | 'installation_repositories' | 'pull_request_lifecycle' | 'evaluate' | 'ignore';
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
