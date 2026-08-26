import { describe, expect, it, vi } from 'vitest';
import { createPrivateKey } from 'node:crypto';
import {
  buildSparkInputFromPullRequest,
  createGitHubAppJwt,
  createInstallationToken,
  formatSparkCheck,
  GitHubApiClient,
  normalizeChangedFiles,
  normalizeCheckRuns,
  normalizeCheckStatus,
  resolveRepositoryContext,
  routeGitHubEvent,
  verifyWebhookSignature,
  type GitHubCheckRun,
} from '../src';

async function signature(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return `sha256=${[...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

describe('GitHub webhook security and routing', () => {
  it('accepts only a valid sha256 signature', async () => {
    const body = '{"action":"opened"}';
    expect(await verifyWebhookSignature(new TextEncoder().encode(body), await signature(body, 'secret'), 'secret')).toBe(true);
    expect(await verifyWebhookSignature(new TextEncoder().encode(body), 'sha256=' + '00'.repeat(32), 'secret')).toBe(false);
    expect(await verifyWebhookSignature(new TextEncoder().encode(body), 'malformed', 'secret')).toBe(false);
  });

  it('preserves the exact pull request head SHA', () => {
    const routed = routeGitHubEvent('pull_request', {
      action: 'synchronize',
      installation: { id: 7 },
      repository: { id: 8, full_name: 'acme/widgets' },
      pull_request: { number: 9, head: { sha: 'exact-sha' } },
    });
    expect(routed).toMatchObject({ kind: 'evaluate', action: 'synchronize', headSha: 'exact-sha', pullRequestNumber: 9 });
  });

  it('routes external completed checks for reevaluation and ignores Spark itself', () => {
    const base = {
      installation: { id: 7 }, repository: { id: 8, full_name: 'acme/widgets' },
      check_run: { name: 'unit', head_sha: 'sha', app: { id: 99 }, pull_requests: [{ number: 9 }] },
    };
    expect(routeGitHubEvent('check_run', { ...base, action: 'completed' }, 42).kind).toBe('evaluate');
    expect(routeGitHubEvent('check_run', {
      ...base, action: 'completed', check_run: { ...base.check_run, name: 'Spark Observability', app: { id: 42 } },
    }, 42).kind).toBe('ignore');
  });
});

describe('GitHub normalization', () => {
  it('normalizes file statuses without losing paths', () => {
    expect(normalizeChangedFiles([
      { filename: 'new.ts', status: 'added' },
      { filename: 'old.ts', status: 'removed' },
      { filename: 'renamed.ts', status: 'renamed' },
    ])).toEqual([
      { path: 'new.ts', status: 'added' },
      { path: 'old.ts', status: 'deleted' },
      { path: 'renamed.ts', status: 'modified' },
    ]);
  });

  it.each([
    [{ status: 'queued', conclusion: null }, 'PENDING'],
    [{ status: 'in_progress', conclusion: null }, 'PENDING'],
    [{ status: 'completed', conclusion: 'success' }, 'PASSED'],
    [{ status: 'completed', conclusion: 'failure' }, 'FAILED'],
    [{ status: 'completed', conclusion: 'timed_out' }, 'FAILED'],
    [{ status: 'completed', conclusion: 'skipped' }, 'UNKNOWN'],
    [{ status: 'completed', conclusion: 'new-future-value' }, 'UNKNOWN'],
  ])('maps check status %j to %s', (check, expected) => {
    expect(normalizeCheckStatus(check)).toBe(expected);
  });

  it('keeps generic checks useful while making project coverage unknown', () => {
    const evidence = normalizeCheckRuns([{
      id: 1, name: 'CI', head_sha: 'sha', status: 'completed', conclusion: 'success', app: { slug: 'github-actions' },
    }]);
    expect(evidence[0]).toMatchObject({ name: 'CI', status: 'PASSED', source: 'github-actions', knowledge: 'observed', coverage: 'UNKNOWN' });
  });

});

describe('GitHub API pagination', () => {
  it('invokes the Cloudflare-style default fetch with the platform receiver', async () => {
    const platformFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(new Response(JSON.stringify({
        id: 2, full_name: 'acme/widgets', default_branch: 'main', owner: { login: 'acme' }, name: 'widgets',
      })));
    });
    try {
      const client = new GitHubApiClient('not-logged');
      expect((await client.getRepository('acme', 'widgets')).full_name).toBe('acme/widgets');
    } finally {
      platformFetch.mockRestore();
    }
  });

  it('fetches every pull-request file page and reports completeness', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const page = Number(new URL(url).searchParams.get('page'));
      const count = page === 1 ? 100 : 1;
      return new Response(JSON.stringify(Array.from({ length: count }, (_, index) => ({ filename: `p${page}-${index}`, status: 'modified' }))));
    });
    const client = new GitHubApiClient('not-logged', fetcher as typeof fetch, 'https://example.test');
    const result = await client.listPullRequestFiles('acme', 'widgets', 3, 101);
    expect(result.files).toHaveLength(101);
    expect(result.complete).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reports GitHub hard-limit truncation instead of silently accepting it', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ filename: `f-${index}`, status: 'modified' })))));
    const client = new GitHubApiClient('not-logged', fetcher as typeof fetch, 'https://example.test');
    const result = await client.listPullRequestFiles('acme', 'widgets', 3, 3_001);
    expect(result.files).toHaveLength(3_000);
    expect(result.complete).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(30);
  });
});

describe('repository context and Spark input', () => {
  it('derives a small pnpm workspace graph from observed manifests', async () => {
    const files: Record<string, string | undefined> = {
      'package.json': '{}',
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
      'apps/web/package.json': JSON.stringify({ name: '@acme/web', dependencies: { '@acme/types': 'workspace:*' } }),
      'packages/types/package.json': JSON.stringify({ name: '@acme/types' }),
    };
    const client = {
      getTree: async () => ({ paths: ['package.json', 'pnpm-workspace.yaml', 'apps/web/package.json', 'packages/types/package.json'], complete: true }),
      getTextFile: async (_owner: string, _repo: string, path: string) => files[path],
    } as unknown as GitHubApiClient;
    const result = await resolveRepositoryContext(client, 'acme', 'repo', 'sha');
    expect(result.knowledge).toBe('derived');
    expect(result.projects).toContainEqual({ name: 'apps/web', path: 'apps/web', dependencies: ['packages/types'] });
  });

  it('produces a truthful generic input for unsupported repositories', async () => {
    const check: GitHubCheckRun = { id: 1, name: 'build', head_sha: 'sha', status: 'completed', conclusion: 'success' };
    const client = {
      getRepository: async () => ({ id: 2, full_name: 'acme/rust', default_branch: 'main', owner: { login: 'acme' }, name: 'rust' }),
      getPullRequest: async () => ({ number: 3, state: 'open', changed_files: 1, head: { sha: 'sha' }, base: { sha: 'base' } }),
      listPullRequestFiles: async () => ({ files: [{ filename: 'src/main.rs', status: 'modified' }], complete: true }),
      listCheckRuns: async () => [check],
      getTree: async () => ({ paths: ['src/main.rs'], complete: true }),
      getTextFile: async () => undefined,
    } as unknown as GitHubApiClient;
    const source = await buildSparkInputFromPullRequest(client, 1, 'acme/rust', 3, 'sha', 42);
    expect(source?.input.change.id).toBe('sha');
    expect(source?.input.context.projects).toEqual([]);
    expect(source?.input.analysis?.repositoryContext).toBe('unknown');
    expect(source?.input.evidence[0]).toMatchObject({ name: 'build', coverage: 'UNKNOWN' });
  });

  it('rejects a stale event when the current PR head no longer matches', async () => {
    const client = {
      getRepository: async () => ({ id: 2 }),
      getPullRequest: async () => ({ head: { sha: 'newer-sha' } }),
    } as unknown as GitHubApiClient;
    expect(await buildSparkInputFromPullRequest(client, 1, 'acme/repo', 3, 'stale-sha')).toBeUndefined();
  });

  it('carries an incomplete changed-file result into provider-neutral analysis metadata', async () => {
    const client = {
      getRepository: async () => ({ id: 2, full_name: 'acme/repo', default_branch: 'main', owner: { login: 'acme' }, name: 'repo' }),
      getPullRequest: async () => ({ number: 3, state: 'open', changed_files: 3_001, head: { sha: 'sha' }, base: { sha: 'base' } }),
      listPullRequestFiles: async () => ({ files: [{ filename: 'src/index.ts', status: 'modified' }], complete: false }),
      listCheckRuns: async () => [],
      getTree: async () => ({ paths: ['src/index.ts'], complete: true }),
      getTextFile: async () => undefined,
    } as unknown as GitHubApiClient;
    const source = await buildSparkInputFromPullRequest(client, 1, 'acme/repo', 3, 'sha');
    expect(source?.input.analysis?.changedFiles).toBe('incomplete');
    expect(source?.input.analysis?.notes).toContain('GitHub exposed 1 of 3001 changed files');
  });

  it('recovers the existing Spark Check identity from GitHub when persistence is missing', async () => {
    const client = {
      getRepository: async () => ({ id: 2, full_name: 'acme/repo', default_branch: 'main', owner: { login: 'acme' }, name: 'repo' }),
      getPullRequest: async () => ({ number: 3, state: 'open', changed_files: 1, head: { sha: 'sha' }, base: { sha: 'base' } }),
      listPullRequestFiles: async () => ({ files: [{ filename: 'src/index.ts', status: 'modified' }], complete: true }),
      listCheckRuns: async () => [{ id: 777, name: 'Spark Observability', head_sha: 'sha', status: 'completed', conclusion: 'neutral', app: { id: 42 } }],
      getTree: async () => ({ paths: ['src/index.ts'], complete: true }),
      getTextFile: async () => undefined,
    } as unknown as GitHubApiClient;
    const source = await buildSparkInputFromPullRequest(client, 1, 'acme/repo', 3, 'sha', 42);
    expect(source?.existingSparkCheckRunId).toBe(777);
    expect(source?.input.evidence).toEqual([]);
  });
});

describe('GitHub Check output and authentication', () => {
  it('always publishes Observe mode as a neutral GitHub conclusion', () => {
    const payload = formatSparkCheck({
      changeId: 'sha', attention: 'HIGH', reasons: ['Critical evidence failed'], directAreas: ['apps/api'],
      affectedAreas: [], sensitiveSurfaces: [], evidence: [],
    });
    expect(payload).toMatchObject({ name: 'Spark Observability', status: 'completed', conclusion: 'neutral' });
    expect(payload.output.summary).toContain('Attention: HIGH');
    expect(payload.output.summary).toContain('does not block merging');
  });

  it('creates a signed app JWT and exchanges it without exposing credentials', async () => {
    const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
    const pem = createPrivateKey({ key: Buffer.from(pkcs8), format: 'der', type: 'pkcs8' })
      .export({ format: 'pem', type: 'pkcs1' }).toString();
    expect(pem).toContain('BEGIN RSA PRIVATE KEY');
    const jwt = await createGitHubAppJwt('123', pem, 1_700_000_000_000);
    expect(jwt.split('.')).toHaveLength(3);
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/);
      return new Response(JSON.stringify({ token: 'installation-token' }));
    });
    expect(await createInstallationToken('123', pem, 456, fetcher as typeof fetch)).toBe('installation-token');
  });

  it('uses the platform receiver for default installation-token fetches', async () => {
    const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
    const pem = createPrivateKey({ key: Buffer.from(pkcs8), format: 'der', type: 'pkcs8' })
      .export({ format: 'pem', type: 'pkcs1' }).toString();
    const platformFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(new Response(JSON.stringify({ token: 'installation-token' })));
    });
    try {
      expect(await createInstallationToken('123', pem, 456)).toBe('installation-token');
    } finally {
      platformFetch.mockRestore();
    }
  });
});
