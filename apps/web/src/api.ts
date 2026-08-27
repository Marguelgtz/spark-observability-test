import type { ActivityQueryV1, ActivityResponseV1, EvaluationDetailResponseV1, ViewerV1 } from '@spark/dashboard-contracts';
import { buildFixtureActivity, fixtureViewer, getFixtureEvaluation } from './fixtures';

export interface DashboardApi {
  getViewer(): Promise<ViewerV1>;
  getActivity(query: ActivityQueryV1): Promise<ActivityResponseV1>;
  getEvaluation(repositoryId: number, headSha: string): Promise<EvaluationDetailResponseV1>;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export class HttpDashboardApi implements DashboardApi {
  constructor(private readonly baseUrl = '') {}

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (response.status === 401) throw new UnauthorizedError();
    if (!response.ok) throw new Error(`Dashboard API request failed (${response.status})`);
    return response.json() as Promise<T>;
  }

  getViewer(): Promise<ViewerV1> {
    return this.request('/api/me');
  }

  getActivity(query: ActivityQueryV1): Promise<ActivityResponseV1> {
    const params = new URLSearchParams({ window: query.window, attention: query.attention });
    if (query.repositoryId !== null) params.set('repositoryId', String(query.repositoryId));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    return this.request(`/api/activity?${params.toString()}`);
  }

  getEvaluation(repositoryId: number, headSha: string): Promise<EvaluationDetailResponseV1> {
    return this.request(`/api/evaluations/${repositoryId}/${encodeURIComponent(headSha)}`);
  }
}

export type FixtureMode = 'normal' | 'signed-out' | 'loading' | 'empty' | 'error';

export class FixtureDashboardApi implements DashboardApi {
  constructor(private readonly mode: FixtureMode = 'normal') {}

  async getViewer(): Promise<ViewerV1> {
    if (this.mode === 'signed-out') throw new UnauthorizedError();
    if (this.mode === 'error') throw new Error('Synthetic fixture failure');
    return fixtureViewer;
  }

  async getActivity(query: ActivityQueryV1): Promise<ActivityResponseV1> {
    if (this.mode === 'loading') return new Promise<ActivityResponseV1>(() => undefined);
    if (this.mode === 'error') throw new Error('Synthetic fixture failure');
    if (this.mode === 'empty') {
      return {
        version: 1,
        selectedWindow: query.window,
        selectedAttention: query.attention,
        selectedRepositoryId: query.repositoryId,
        counts: { LOW: 0, MEDIUM: 0, HIGH: 0 },
        repositories: [],
        evaluations: [],
        pagination: { nextCursor: null }
      };
    }
    return buildFixtureActivity(query);
  }

  async getEvaluation(repositoryId: number, headSha: string): Promise<EvaluationDetailResponseV1> {
    if (this.mode === 'loading') return new Promise<EvaluationDetailResponseV1>(() => undefined);
    if (this.mode === 'error') throw new Error('Synthetic fixture failure');
    return getFixtureEvaluation(repositoryId, headSha);
  }
}

export function fixtureModeFromSearch(search: string): FixtureMode {
  const value = new URLSearchParams(search).get('fixture');
  return value === 'signed-out' || value === 'loading' || value === 'empty' || value === 'error' ? value : 'normal';
}

export function createDashboardApi(search: string): DashboardApi {
  if (__SPARK_FIXTURE_API__) return new FixtureDashboardApi(fixtureModeFromSearch(search));
  return new HttpDashboardApi();
}
