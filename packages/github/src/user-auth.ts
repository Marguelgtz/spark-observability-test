export interface GitHubOAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

export interface GitHubUserIdentity {
  id: number;
  login: string;
  avatar_url: string;
}

export interface GitHubUserInstallation {
  id: number;
  account?: { login?: string } | null;
}

export interface GitHubUserRepository {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
}

export interface GitHubUserAccessSnapshot {
  user: GitHubUserIdentity;
  installationIds: number[];
  repositories: GitHubUserRepository[];
}

function classifyGitHubUserToken(accessToken: string): 'github-app-user' | 'oauth-app-user' | 'unknown' {
  if (accessToken.startsWith('ghu_')) return 'github-app-user';
  if (accessToken.startsWith('gho_')) return 'oauth-app-user';
  return 'unknown';
}

export function buildGitHubUserAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeGitHubUserCode(
  input: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  },
  fetcher: typeof fetch = (request, init) => globalThis.fetch(request, init),
): Promise<GitHubOAuthTokenResponse> {
  const response = await fetcher('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'spark-observability',
    },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }).toString(),
  });
  if (!response.ok) throw new Error(`GitHub OAuth token exchange failed (${response.status})`);
  const body = await response.json() as Partial<GitHubOAuthTokenResponse> & { error?: string };
  if (body.error || !body.access_token) throw new Error(`GitHub OAuth token exchange failed${body.error ? `: ${body.error}` : ''}`);

  console.info(JSON.stringify({
    githubOAuthTokenType: classifyGitHubUserToken(body.access_token),
  }));

  return body as GitHubOAuthTokenResponse;
}

export class GitHubUserClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = (request, init) => globalThis.fetch(request, init),
    private readonly apiBase = 'https://api.github.com',
  ) {}

  private async request<T>(path: string): Promise<T> {
    const response = await this.fetcher(`${this.apiBase}${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'user-agent': 'spark-observability',
        'x-github-api-version': '2026-03-10',
      },
    });
    if (!response.ok) {
      const body = (await response.text()).trim().replace(/\s+/g, ' ').slice(0, 1_000);
      const acceptedPermissions = response.headers.get('x-accepted-github-permissions');
      const detail = body ? `: ${body}` : '';
      const permissionDetail = acceptedPermissions ? `; accepted permissions: ${acceptedPermissions}` : '';
      throw new Error(`GitHub user API GET ${path} failed (${response.status})${detail}${permissionDetail}`);
    }
    return response.json() as Promise<T>;
  }

  getUser(): Promise<GitHubUserIdentity> {
    return this.request('/user');
  }

  async listInstallations(): Promise<GitHubUserInstallation[]> {
    const installations: GitHubUserInstallation[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const body = await this.request<{ total_count: number; installations: GitHubUserInstallation[] }>(
        `/user/installations?per_page=100&page=${page}`,
      );
      installations.push(...body.installations);
      if (installations.length >= body.total_count || body.installations.length < 100) break;
    }
    return installations;
  }

  async listInstallationRepositories(installationId: number): Promise<GitHubUserRepository[]> {
    const repositories: GitHubUserRepository[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const body = await this.request<{ total_count: number; repositories: GitHubUserRepository[] }>(
        `/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
      );
      repositories.push(...body.repositories);
      if (repositories.length >= body.total_count || body.repositories.length < 100) break;
    }
    return repositories;
  }

  async accessSnapshot(): Promise<GitHubUserAccessSnapshot> {
    const [user, installations] = await Promise.all([this.getUser(), this.listInstallations()]);
    const repositories = new Map<number, GitHubUserRepository>();
    for (const installation of installations) {
      for (const repository of await this.listInstallationRepositories(installation.id)) {
        repositories.set(repository.id, repository);
      }
    }
    return {
      user,
      installationIds: installations.map(installation => installation.id),
      repositories: [...repositories.values()],
    };
  }
}
