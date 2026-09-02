import type {
  GitHubCheckRun,
  GitHubDeployment,
  GitHubDeploymentStatus,
  GitHubEnvironmentPendingDeployments,
  GitHubPageResult,
  GitHubPullRequest,
  GitHubPullRequestFile,
  GitHubRepository,
  GitHubWorkflowJob,
  GitHubWorkflowRun,
} from './types';

export class GitHubApiClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
    private readonly apiBase = 'https://api.github.com',
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.apiBase}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        'user-agent': 'spark-observability',
        'x-github-api-version': '2026-03-10',
        ...init?.headers,
      },
    });
    if (!response.ok) throw new Error(`GitHub API ${init?.method ?? 'GET'} ${path} failed (${response.status})`);
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }

  getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    return this.request(`/repos/${owner}/${repo}`);
  }

  getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequest> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  async listPullRequestFiles(owner: string, repo: string, number: number, expectedCount: number): Promise<{ files: GitHubPullRequestFile[]; complete: boolean }> {
    const files: GitHubPullRequestFile[] = [];
    for (let page = 1; page <= 30; page += 1) {
      const batch = await this.request<GitHubPullRequestFile[]>(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
      files.push(...batch);
      if (batch.length < 100) break;
    }
    return { files, complete: files.length >= expectedCount };
  }

  async listCheckRuns(owner: string, repo: string, sha: string): Promise<GitHubCheckRun[]> {
    return (await this.listCheckRunsForRevision(owner, repo, sha)).items;
  }

  async listCheckRunsForRevision(
    owner: string,
    repo: string,
    sha: string,
    maxPages = 100,
  ): Promise<GitHubPageResult<GitHubCheckRun>> {
    const checks: GitHubCheckRun[] = [];
    let totalCount = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const body = await this.request<{ total_count: number; check_runs: GitHubCheckRun[] }>(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`);
      totalCount = body.total_count;
      checks.push(...body.check_runs.filter(check => check.head_sha === sha));
      if (checks.length >= body.total_count || body.check_runs.length < 100) break;
    }
    return { items: checks, totalCount, complete: checks.length >= totalCount };
  }

  async listWorkflowRunsForRevision(
    owner: string,
    repo: string,
    sha: string,
    maxPages: number,
  ): Promise<GitHubPageResult<GitHubWorkflowRun>> {
    const runs: GitHubWorkflowRun[] = [];
    let totalCount = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const body = await this.request<{ total_count: number; workflow_runs: GitHubWorkflowRun[] }>(
        `/repos/${owner}/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=100&page=${page}`,
      );
      totalCount = body.total_count;
      runs.push(...body.workflow_runs.filter(run => run.head_sha === sha));
      if (body.workflow_runs.length < 100 || runs.length >= totalCount) break;
    }
    return { items: runs, totalCount, complete: runs.length >= totalCount };
  }

  getWorkflowRunAttempt(
    owner: string,
    repo: string,
    runId: number,
    attempt: number,
  ): Promise<GitHubWorkflowRun> {
    return this.request(`/repos/${owner}/${repo}/actions/runs/${runId}/attempts/${attempt}`);
  }

  async listWorkflowJobsForAttempt(
    owner: string,
    repo: string,
    runId: number,
    attempt: number,
    maxPages: number,
  ): Promise<GitHubPageResult<GitHubWorkflowJob>> {
    const jobs: GitHubWorkflowJob[] = [];
    let totalCount = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const body = await this.request<{ total_count: number; jobs: GitHubWorkflowJob[] }>(
        `/repos/${owner}/${repo}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100&page=${page}`,
      );
      totalCount = body.total_count;
      jobs.push(...body.jobs);
      if (body.jobs.length < 100 || jobs.length >= totalCount) break;
    }
    return { items: jobs, totalCount, complete: jobs.length >= totalCount };
  }

  async listDeploymentsForRevision(
    owner: string,
    repo: string,
    sha: string,
    maxPages: number,
  ): Promise<GitHubPageResult<GitHubDeployment>> {
    const deployments: GitHubDeployment[] = [];
    let totalCount = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const body = await this.request<{ total_count: number; deployments: GitHubDeployment[] }>(
        `/repos/${owner}/${repo}/deployments?sha=${encodeURIComponent(sha)}&per_page=100&page=${page}`,
      );
      totalCount = body.total_count;
      deployments.push(...body.deployments.filter(item => item.sha === sha));
      if (body.deployments.length < 100 || deployments.length >= totalCount) break;
    }
    return { items: deployments, totalCount, complete: deployments.length >= totalCount };
  }

  async listDeploymentStatuses(
    owner: string,
    repo: string,
    deploymentId: number,
    maxPages: number,
  ): Promise<GitHubPageResult<GitHubDeploymentStatus>> {
    const statuses: GitHubDeploymentStatus[] = [];
    let totalCount = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const body = await this.request<{ total_count: number; statuses: GitHubDeploymentStatus[] }>(
        `/repos/${owner}/${repo}/deployments/${deploymentId}/statuses?per_page=100&page=${page}`,
      );
      totalCount = body.total_count;
      statuses.push(...body.statuses);
      if (body.statuses.length < 100 || statuses.length >= totalCount) break;
    }
    return { items: statuses, totalCount, complete: statuses.length >= totalCount };
  }

  async getEnvironmentPendingDeployments(
    owner: string,
    repo: string,
    environment: string,
  ): Promise<GitHubEnvironmentPendingDeployments | undefined> {
    try {
      return await this.request<GitHubEnvironmentPendingDeployments>(
        `/repos/${owner}/${repo}/environments/${encodeURIComponent(environment)}/pending-deployments`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.endsWith('(404)')) return undefined;
      throw error;
    }
  }

  async getTree(owner: string, repo: string, sha: string): Promise<{ paths: string[]; complete: boolean }> {
    const body = await this.request<{ truncated: boolean; tree: Array<{ path: string; type: string }> }>(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);
    return { paths: body.tree.filter(item => item.type === 'blob').map(item => item.path), complete: !body.truncated };
  }

  async getTextFile(owner: string, repo: string, path: string, ref: string): Promise<string | undefined> {
    try {
      const body = await this.request<{ content?: string; encoding?: string }>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(ref)}`);
      if (body.encoding !== 'base64' || !body.content) return undefined;
      const binary = atob(body.content.replace(/\s/g, ''));
      return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
    } catch (error) {
      if (error instanceof Error && error.message.endsWith('(404)')) return undefined;
      throw error;
    }
  }

  createCheckRun(owner: string, repo: string, payload: object): Promise<GitHubCheckRun> {
    return this.request(`/repos/${owner}/${repo}/check-runs`, { method: 'POST', body: JSON.stringify(payload) });
  }

  updateCheckRun(owner: string, repo: string, checkRunId: number, payload: object): Promise<GitHubCheckRun> {
    return this.request(`/repos/${owner}/${repo}/check-runs/${checkRunId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  }
}
