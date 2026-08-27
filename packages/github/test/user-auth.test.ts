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

  it('exchanges an authorization code with the original PKCE verifier', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('client_id')).toBe('Iv1.test');
      expect(body.get('client_secret')).toBe('secret');
      expect(body.get('code')).toBe('temporary-code');
      expect(body.get('code_verifier')).toBe('verifier');
      return new Response(JSON.stringify({ access_token: 'ghu_ephemeral', expires_in: 28800 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const token = await exchangeGitHubUserCode({
      clientId: 'Iv1.test',
      clientSecret: 'secret',
      code: 'temporary-code',
      redirectUri: 'https://spark.test/auth/github/callback',
      codeVerifier: 'verifier',
    }, fetcher as typeof fetch);
    expect(token.access_token).toBe('ghu_ephemeral');
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
