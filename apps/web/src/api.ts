import type { AccountV1, ActivityQueryV1, ActivityResponseV1, EvaluationDetailResponseV1, ViewerV1 } from '@spark/dashboard-contracts';
import { buildFixtureActivity, fixtureViewer, getFixtureEvaluation } from './fixtures';

export interface DashboardApi {
  getViewer(): Promise<ViewerV1>;
  getAccount(): Promise<AccountV1>;
  getActivity(query: ActivityQueryV1): Promise<ActivityResponseV1>;
  getEvaluation(repositoryId: number, headSha: string): Promise<EvaluationDetailResponseV1>;
  logout(): Promise<void>;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export class HttpDashboardApi implements DashboardApi {
  constructor(private readonly baseUrl = '') {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: { accept: 'application/json', ...init?.headers },
    });
    if (response.status === 401) throw new UnauthorizedError();
    if (!response.ok) throw new Error(`Dashboard API request failed (${response.status})`);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  getViewer(): Promise<ViewerV1> {
    return this.request('/api/me');
  }

  getAccount(): Promise<AccountV1> {
    return this.request('/api/account');
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

  logout(): Promise<void> {
    return this.request('/auth/logout', { method: 'POST' });
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

  async getAccount(): Promise<AccountV1> {
    if (this.mode === 'signed-out') throw new UnauthorizedError();
    return {
      version: 1,
      viewer: fixtureViewer,
      repositoryCount: 3,
      installationCount: 1,
      sessionExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      githubInstallUrl: 'https://github.com/apps/spark-observability/installations/new',
      githubSettingsUrl: 'https://github.com/settings/installations',
    };
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

  async logout(): Promise<void> {
    return undefined;
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
