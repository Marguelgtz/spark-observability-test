import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpDashboardApi, UnauthorizedError } from '../src/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpDashboardApi', () => {
  it('serializes activity filters against the versioned API', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      selectedWindow: '24h',
      selectedAttention: 'HIGH',
      selectedRepositoryId: 2,
      counts: { LOW: 0, MEDIUM: 0, HIGH: 1 },
      repositories: [],
      pullRequests: [],
      pagination: { nextCursor: null },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const api = new HttpDashboardApi('https://spark.test');

    await api.getActivity({ window: '24h', attention: 'HIGH', repositoryId: 2, cursor: 'cursor', limit: 25 });

    expect(fetcher).toHaveBeenCalledWith(
      'https://spark.test/api/activity?window=24h&attention=HIGH&repositoryId=2&cursor=cursor&limit=25',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads pull request observability from the scoped PR endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      repository: {},
      pullRequest: {},
      latest: {},
      history: {},
      evidenceIssues: [],
      transitions: [],
      insights: [],
      runs: [],
      truncated: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const api = new HttpDashboardApi('https://spark.test');

    await api.getPullRequest(2, 13);

    expect(fetcher).toHaveBeenCalledWith(
      'https://spark.test/api/repositories/2/pulls/13',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads Change Trajectory from the dedicated scoped endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      repository: {},
      pullRequest: {},
      current: {},
      summary: {},
      evidenceIssues: [],
      insights: [],
      notableTransitions: [],
      runs: [],
      truncated: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const api = new HttpDashboardApi('https://spark.test');

    await api.getTrajectory(2, 13);

    expect(fetcher).toHaveBeenCalledWith(
      'https://spark.test/api/repositories/2/pulls/13/trajectory',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('encodes transition identity and saves feedback with credentials', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      transitionId: 'run:1/run:2',
      classification: 'USEFUL',
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const api = new HttpDashboardApi('https://spark.test');
    const input = { classification: 'USEFUL' as const, note: 'Helped find the failure.' };

    await api.saveTrajectoryFeedback(2, 13, 'run:1/run:2', input);

    expect(fetcher).toHaveBeenCalledWith(
      'https://spark.test/api/repositories/2/pulls/13/trajectory/run%3A1%2Frun%3A2/feedback',
      expect.objectContaining({
        method: 'PUT', credentials: 'include', body: JSON.stringify(input),
      }),
    );
  });

  it('loads pull request history from the scoped history endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      repository: {},
      pullRequest: {},
      totalRunCount: 3,
      runs: [],
      truncated: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const api = new HttpDashboardApi('https://spark.test');

    await api.getPullRequestHistory(2, 13);

    expect(fetcher).toHaveBeenCalledWith(
      'https://spark.test/api/repositories/2/pulls/13/evaluations',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('maps a 401 response to the signed-out control flow', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })));
    const api = new HttpDashboardApi('https://spark.test');
    await expect(api.getViewer()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('reads account state and logs out with a credentialed POST', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/account')) {
        return new Response(JSON.stringify({ version: 1, viewer: {}, repositoryCount: 2, installationCount: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetcher);
    const api = new HttpDashboardApi('https://spark.test');

    await api.getAccount();
    await api.logout();

    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://spark.test/api/account', expect.objectContaining({ credentials: 'include' }));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://spark.test/auth/logout', expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });

  it('encodes evaluation SHA route segments', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      status: 'unavailable',
      reason: 'LEGACY_RECORD',
      summary: {},
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const api = new HttpDashboardApi('https://spark.test');

    await api.getEvaluation(2, 'sha/with space');

    expect(fetcher).toHaveBeenCalledWith(
      'https://spark.test/api/evaluations/2/sha%2Fwith%20space',
      expect.any(Object),
    );
  });

  it('encodes immutable run IDs on the repository-scoped run endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      status: 'unavailable',
      reason: 'LEGACY_RECORD',
      summary: {},
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const api = new HttpDashboardApi('https://spark.test');

    await api.getRun(2, 'run:with/slash and space');

    expect(fetcher).toHaveBeenCalledWith(
      'https://spark.test/api/repositories/2/runs/run%3Awith%2Fslash%20and%20space',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads and mutates database-backed favorites', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/favorites') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ version: 1, favorites: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetcher);
    const api = new HttpDashboardApi('https://spark.test');
    const favorite = { kind: 'evaluation' as const, repositoryId: 2, pullRequestNumber: 13, runId: 'run:1', headSha: 'abc1234' };

    await api.getFavorites();
    await api.addFavorite(favorite);
    await api.removeFavorite(favorite);

    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://spark.test/api/favorites', expect.objectContaining({ credentials: 'include' }));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://spark.test/api/favorites', expect.objectContaining({
      method: 'PUT', credentials: 'include', body: JSON.stringify(favorite),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(3, 'https://spark.test/api/favorites', expect.objectContaining({
      method: 'DELETE', credentials: 'include', body: JSON.stringify(favorite),
    }));
  });
});
