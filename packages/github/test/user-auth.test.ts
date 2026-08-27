import { describe, expect, it, vi } from 'vitest';
import {
  buildGitHubUserAuthorizationUrl,
  exchangeGitHubUserCode,
  GitHubUserClient,
} from '../src';

describe('GitHub App user authorization', () => {
  it('builds an authorization URL with state and PKCE S256', () => {
    const url = new URL(buildGitHubUserAuthorizationUrl({
      clientId: 'Iv1.test',
      redirectUri: 'https://spark.test/auth/github/callback',
      state: 'state-value',
      codeChallenge: 'challenge-value',
    }));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('Iv1.test');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBeNull();
  });

  it('exchanges an authorization code and safely inspects the owning app', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin === 'https://github.com' && url.pathname === '/login/oauth/access_token') {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get('client_id')).toBe('Iv1.test');
        expect(body.get('client_secret')).toBe('secret');
        expect(body.get('code')).toBe('temporary-code');
        expect(body.get('code_verifier')).toBe('verifier');
        return new Response(JSON.stringify({
          access_token: 'ghu_ephemeral',
          expires_in: 28800,
          refresh_token: 'ghr_refresh',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.origin === 'https://api.github.com' && url.pathname === '/applications/Iv1.test/token') {
        expect(init?.method).toBe('POST');
        expect(String(new Headers(init?.headers).get('authorization'))).toMatch(/^Basic /);
        expect(JSON.parse(String(init?.body))).toEqual({ access_token: 'ghu_ephemeral' });
        return new Response(JSON.stringify({
          app: { name: 'Spark Observability', client_id: 'Iv1.test' },
          scopes: [],
          expires_at: '2026-08-28T06:00:00Z',
          token: 'ghu_ephemeral',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });

    const token = await exchangeGitHubUserCode({
      clientId: 'Iv1.test',
      clientSecret: 'secret',
      code: 'temporary-code',
      redirectUri: 'https://spark.test/auth/github/callback',
      codeVerifier: 'verifier',
    }, fetcher as typeof fetch);

    expect(token.access_token).toBe('ghu_ephemeral');
    expect(info).toHaveBeenCalledWith(JSON.stringify({
      githubOAuthTokenType: 'github-app-user',
      configuredGitHubClientId: 'Iv1.test',
      tokenHasExpiry: true,
      tokenHasRefreshToken: true,
    }));
    expect(info).toHaveBeenCalledWith(JSON.stringify({
      githubOAuthTokenInspectionStatus: 200,
      configuredGitHubClientId: 'Iv1.test',
      tokenOwnerAppName: 'Spark Observability',
      tokenOwnerClientId: 'Iv1.test',
      tokenScopes: [],
      tokenExpiresAt: '2026-08-28T06:00:00Z',
    }));
    expect(info.mock.calls.flat().join(' ')).not.toContain('ghu_ephemeral');
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

  it('derives the repository intersection exposed by the user access token', async () => {
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
