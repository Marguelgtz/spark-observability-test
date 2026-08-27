import { createPrivateKey } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { GitHubAppUserAccessResolver, type GitHubAppRepositoryCandidate } from '../src';

async function privateKeyPem(): Promise<string> {
  const keys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
  return createPrivateKey({ key: Buffer.from(pkcs8), format: 'der', type: 'pkcs8' })
    .export({ format: 'pem', type: 'pkcs1' }).toString();
}

describe('GitHub App user repository authorization', () => {
  it('intersects the OAuth identity with Spark-installed repositories', async () => {
    const pem = await privateKeyPem();
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/app/installations/11/access_tokens') {
        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({ token: 'installation-11' }));
      }
      if (url.pathname === '/app/installations/12/access_tokens') {
        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({ token: 'installation-12' }));
      }
      if (url.pathname === '/repos/acme/one/collaborators/marguel/permission') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer installation-11');
        return new Response(JSON.stringify({ permission: 'read', role_name: 'read' }));
      }
      if (url.pathname === '/repos/acme/two/collaborators/marguel/permission') {
        return new Response('not found', { status: 404 });
      }
      return new Response('not found', { status: 404 });
    });

    const candidates: GitHubAppRepositoryCandidate[] = [
      { id: 101, installationId: 11, fullName: 'acme/one', accountId: 99, accountLogin: 'acme' },
      { id: 102, installationId: 11, fullName: 'acme/two', accountId: 99, accountLogin: 'acme' },
      { id: 103, installationId: 12, fullName: 'marguel/private', accountId: 7, accountLogin: 'marguel' },
    ];

    const access = await new GitHubAppUserAccessResolver(
      '123',
      pem,
      fetcher as typeof fetch,
      'https://api.test',
    ).resolve(
      { id: 7, login: 'marguel', avatar_url: 'https://avatars.example/7' },
      candidates,
    );

    expect(access).toEqual({ installationIds: [11, 12], repositoryIds: [101, 103] });
  });

  it('fails closed when a repository permission check fails unexpectedly', async () => {
    const pem = await privateKeyPem();
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/app/installations/11/access_tokens') {
        return new Response(JSON.stringify({ token: 'installation-11' }));
      }
      if (url.pathname.includes('/collaborators/')) {
        return new Response(JSON.stringify({ message: 'rate limited' }), { status: 429 });
      }
      return new Response('not found', { status: 404 });
    });

    await expect(new GitHubAppUserAccessResolver(
      '123',
      pem,
      fetcher as typeof fetch,
      'https://api.test',
    ).resolve(
      { id: 7, login: 'marguel', avatar_url: 'https://avatars.example/7' },
      [{ id: 101, installationId: 11, fullName: 'acme/one', accountId: 99, accountLogin: 'acme' }],
    )).rejects.toThrow(/permission check failed.*429/);
  });
});
