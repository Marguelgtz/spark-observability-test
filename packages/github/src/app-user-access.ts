import { createInstallationToken } from './auth';
import type { GitHubUserIdentity } from './user-auth';

export interface GitHubAppRepositoryCandidate {
  id: number;
  installationId: number;
  fullName: string;
  accountId: number;
  accountLogin: string;
}

export interface GitHubAppUserAccessSnapshot {
  installationIds: number[];
  repositoryIds: number[];
}

interface GitHubRepositoryPermission {
  permission?: string;
}

function repositoryParts(fullName: string): { owner: string; repo: string } {
  const separator = fullName.indexOf('/');
  if (separator <= 0 || separator === fullName.length - 1) {
    throw new Error(`Invalid GitHub repository full name: ${fullName}`);
  }
  return {
    owner: fullName.slice(0, separator),
    repo: fullName.slice(separator + 1),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      output[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

/**
 * Resolves the intersection between a GitHub OAuth identity and repositories
 * where the Spark GitHub App is installed.
 *
 * The OAuth token is intentionally not used for repository authorization.
 * Each candidate repository is checked using the Spark installation token,
 * so access is granted only when both Spark and the GitHub user can access it.
 */
export class GitHubAppUserAccessResolver {
  constructor(
    private readonly appId: string,
    private readonly privateKey: string,
    private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
    private readonly apiBase = 'https://api.github.com',
  ) {}

  private async hasRepositoryAccess(
    token: string,
    candidate: GitHubAppRepositoryCandidate,
    user: GitHubUserIdentity,
  ): Promise<boolean> {
    if (candidate.accountId === user.id) return true;

    const { owner, repo } = repositoryParts(candidate.fullName);
    const response = await this.fetcher(
      `${this.apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(user.login)}/permission`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'user-agent': 'spark-observability',
          'x-github-api-version': '2026-03-10',
        },
      },
    );

    if (response.status === 404) return false;
    if (!response.ok) {
      const body = (await response.text()).trim().replace(/\s+/g, ' ').slice(0, 500);
      throw new Error(
        `GitHub App repository permission check failed for ${candidate.fullName} (${response.status})${body ? `: ${body}` : ''}`,
      );
    }

    const permission = await response.json() as GitHubRepositoryPermission;
    return Boolean(permission.permission && permission.permission !== 'none');
  }

  async resolve(
    user: GitHubUserIdentity,
    candidates: GitHubAppRepositoryCandidate[],
  ): Promise<GitHubAppUserAccessSnapshot> {
    const byInstallation = new Map<number, GitHubAppRepositoryCandidate[]>();
    for (const candidate of candidates) {
      const current = byInstallation.get(candidate.installationId) ?? [];
      current.push(candidate);
      byInstallation.set(candidate.installationId, current);
    }

    const installationIds: number[] = [];
    const repositoryIds: number[] = [];

    for (const [installationId, repositories] of byInstallation) {
      const ownerInstallation = repositories.every(repository => repository.accountId === user.id);
      if (ownerInstallation) {
        installationIds.push(installationId);
        repositoryIds.push(...repositories.map(repository => repository.id));
        continue;
      }

      let token: string;
      try {
        token = await createInstallationToken(this.appId, this.privateKey, installationId, this.fetcher);
      } catch (error) {
        if (error instanceof Error && error.message.endsWith('(404)')) continue;
        throw error;
      }

      const allowed = await mapWithConcurrency(repositories, 12, repository =>
        this.hasRepositoryAccess(token, repository, user),
      );
      let installationAllowed = false;
      for (let index = 0; index < repositories.length; index += 1) {
        if (!allowed[index]) continue;
        installationAllowed = true;
        repositoryIds.push(repositories[index].id);
      }
      if (installationAllowed) installationIds.push(installationId);
    }

    installationIds.sort((a, b) => a - b);
    repositoryIds.sort((a, b) => a - b);
    return { installationIds, repositoryIds };
  }
}
