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
      evaluations: [],
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

  it('maps a 401 response to the signed-out control flow', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })));
    const api = new HttpDashboardApi('https://spark.test');
    await expect(api.getViewer()).rejects.toBeInstanceOf(UnauthorizedError);
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
});
