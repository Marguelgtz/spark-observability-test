import { describe, expect, it, vi } from 'vitest';
import {
  buildGitHubUserAuthorizationUrl,
  exchangeGitHubUserCode,
  GitHubUserClient,
} from '../src';

describe('GitHub OAuth authorization utilities', () => {
  it('builds an authorization URL with state and PKCE S256', () => {
    const url = new URL(buildGitHubUserAuthorizationUrl({
      clientId: 'Ov.test',
      redirectUri: 'https://spark.test/auth/github/callback',
      state: 'state-value',
      codeChallenge: 'challenge-value',
    }));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('Ov.test');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBeNull();
  });

  it('exchanges an OAuth App authorization code without logging tokens', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin === 'https://github.com' && url.pathname === '/login/oauth/access_token') {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get('client_id')).toBe('Ov.test');
        expect(body.get('client_secret')).toBe('secret');
        expect(body.get('code')).toBe('temporary-code');
        expect(body.get('code_verifier')).toBe('verifier');
        return new Response(JSON.stringify({
          access_token: 'gho_ephemeral',
          expires_in: 28800,
          refresh_token: 'ghr_refresh',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });

    const token = await exchangeGitHubUserCode({
      clientId: 'Ov.test',
      clientSecret: 'secret',
      code: 'temporary-code',
      redirectUri: 'https://spark.test/auth/github/callback',
      codeVerifier: 'verifier',
    }, fetcher as typeof fetch);

    expect(token.access_token).toBe('gho_ephemeral');
    expect(info).toHaveBeenCalledWith(JSON.stringify({
      githubOAuthTokenType: 'oauth-app-user',
      configuredGitHubClientId: 'Ov.test',
      tokenHasExpiry: true,
      tokenHasRefreshToken: true,
    }));
    expect(info.mock.calls.flat().join(' ')).not.toContain('gho_ephemeral');
    expect(info.mock.calls.flat().join(' ')).not.toContain('ghr_refresh');
    info.mockRestore();
  });

  it('includes GitHub response details when a user API call fails', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      message: 'Resource not accessible by integration',
      documentation_url: 'https://docs.github.com/rest/apps/installations',
    }), {
      status: 403,
      headers: {
        'content-type': 'application/json',
        'x-accepted-github-permissions': 'metadata=read',
      },
    }));

    await expect(new GitHubUserClient(
      'ghu_ephemeral',
      fetcher as typeof fetch,
      'https://api.test',
    ).listInstallations()).rejects.toThrow(
      /Resource not accessible by integration.*accepted permissions: metadata=read/,
    );
  });

  it('retains the GitHub App user-token intersection helper for compatibility', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/user') {
        return new Response(JSON.stringify({ id: 7, login: 'marguel', avatar_url: 'https://avatars.example/7' }));
      }
      if (url.pathname === '/user/installations') {
        return new Response(JSON.stringify({ total_count: 2, installations: [{ id: 11 }, { id: 12 }] }));
      }
      if (url.pathname === '/user/installations/11/repositories') {
        return new Response(JSON.stringify({ total_count: 2, repositories: [
          { id: 101, full_name: 'acme/one', name: 'one', owner: { login: 'acme' } },
          { id: 102, full_name: 'acme/two', name: 'two', owner: { login: 'acme' } },
        ] }));
      }
      if (url.pathname === '/user/installations/12/repositories') {
        return new Response(JSON.stringify({ total_count: 1, repositories: [
          { id: 102, full_name: 'acme/two', name: 'two', owner: { login: 'acme' } },
        ] }));
      }
      return new Response('not found', { status: 404 });
    });

    const snapshot = await new GitHubUserClient('ghu_ephemeral', fetcher as typeof fetch, 'https://api.test').accessSnapshot();
    expect(snapshot.user.login).toBe('marguel');
    expect(snapshot.installationIds).toEqual([11, 12]);
    expect(snapshot.repositories.map(repository => repository.id)).toEqual([101, 102]);
  });
});
