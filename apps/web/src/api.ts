import type {
  AccountV1,
  ActivityQueryV1,
  ActivityResponseV1,
  AttentionLevelV1,
  DashboardFavoriteV1,
  EvaluationDetailResponseV1,
  EvaluationSummaryV1,
  EvidenceHealthV1,
  FavoritesResponseV1,
  PullRequestDetailV1,
  PullRequestHistoryResponseV1,
  PullRequestTransitionV1,
  ViewerV1
} from '@spark/dashboard-contracts';
import { buildFixtureActivity, fixtureViewer, getFixtureEvaluation, getFixturePullRequestHistory } from './fixtures';

export interface DashboardApi {
  getViewer(): Promise<ViewerV1>;
  getAccount(): Promise<AccountV1>;
  getActivity(query: ActivityQueryV1): Promise<ActivityResponseV1>;
  getPullRequest(repositoryId: number, pullRequestNumber: number): Promise<PullRequestDetailV1>;
  getPullRequestHistory(repositoryId: number, pullRequestNumber: number): Promise<PullRequestHistoryResponseV1>;
  getEvaluation(repositoryId: number, headSha: string): Promise<EvaluationDetailResponseV1>;
  getRun(repositoryId: number, runId: string): Promise<EvaluationDetailResponseV1>;
  getFavorites(): Promise<FavoritesResponseV1>;
  addFavorite(favorite: DashboardFavoriteV1): Promise<void>;
  removeFavorite(favorite: DashboardFavoriteV1): Promise<void>;
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

  getPullRequest(repositoryId: number, pullRequestNumber: number): Promise<PullRequestDetailV1> {
    return this.request(`/api/repositories/${repositoryId}/pulls/${pullRequestNumber}`);
  }

  getPullRequestHistory(repositoryId: number, pullRequestNumber: number): Promise<PullRequestHistoryResponseV1> {
    return this.request(`/api/repositories/${repositoryId}/pulls/${pullRequestNumber}/evaluations`);
  }

  getEvaluation(repositoryId: number, headSha: string): Promise<EvaluationDetailResponseV1> {
    return this.request(`/api/evaluations/${repositoryId}/${encodeURIComponent(headSha)}`);
  }

  getRun(repositoryId: number, runId: string): Promise<EvaluationDetailResponseV1> {
    return this.request(`/api/repositories/${repositoryId}/runs/${encodeURIComponent(runId)}`);
  }

  getFavorites(): Promise<FavoritesResponseV1> {
    return this.request('/api/favorites');
  }

  addFavorite(favorite: DashboardFavoriteV1): Promise<void> {
    return this.request('/api/favorites', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(favorite),
    });
  }

  removeFavorite(favorite: DashboardFavoriteV1): Promise<void> {
    return this.request('/api/favorites', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(favorite),
    });
  }

  logout(): Promise<void> {
    return this.request('/auth/logout', { method: 'POST' });
  }
}

export type FixtureMode = 'normal' | 'signed-out' | 'loading' | 'empty' | 'error';

function fixtureEvidenceHealth(summary: EvaluationSummaryV1): EvidenceHealthV1 {
  if (summary.evidenceSummary.failed > 0) return 'FAILED';
  if (summary.evidenceSummary.pending > 0 || summary.evidenceSummary.missing > 0) return 'PENDING_OR_MISSING';
  if (summary.evidenceSummary.unknown > 0 && summary.evidenceSummary.passed === 0) return 'UNKNOWN';
  return 'CLEAR';
}

const attentionRank: Record<AttentionLevelV1, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function identifyFixtureHistory(history: PullRequestHistoryResponseV1): PullRequestHistoryResponseV1 {
  const sameSha = history.repository.id === 101 && history.pullRequest.number === 42
    ? history.runs[0]?.headSha
    : undefined;
  const backfill = history.pullRequest.number === 37;
  return {
    ...history,
    historyCompleteness: backfill ? 'PARTIAL_BACKFILL' : 'COMPLETE',
    runs: history.runs.map((run, index) => ({
      ...run,
      runId: `fixture:${history.repository.id}:${history.pullRequest.number}:${index}`,
      observationSource: backfill ? 'BACKFILL' : 'LIVE',
      ...(sameSha ? { headSha: sameSha } : {}),
    })),
  };
}

function fixturePullRequestDetail(history: PullRequestHistoryResponseV1): PullRequestDetailV1 {
  const evidenceCounts: PullRequestDetailV1['history']['evidenceCounts'] = { CLEAR: 0, FAILED: 0, PENDING_OR_MISSING: 0, UNKNOWN: 0 };
  const attentionCounts: PullRequestDetailV1['history']['attentionCounts'] = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const run of history.runs) {
    evidenceCounts[fixtureEvidenceHealth(run)] += 1;
    attentionCounts[run.attention] += 1;
  }

  let currentClearStreak = 0;
  let currentFailureStreak = 0;
  for (const run of history.runs) {
    if (fixtureEvidenceHealth(run) === 'CLEAR') currentClearStreak += 1;
    else break;
  }
  for (const run of history.runs) {
    if (fixtureEvidenceHealth(run) === 'FAILED') currentFailureStreak += 1;
    else break;
  }

  const transitions: PullRequestTransitionV1[] = [];
  const chronological = [...history.runs].reverse();
  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    const fromEvidenceHealth = fixtureEvidenceHealth(previous);
    const toEvidenceHealth = fixtureEvidenceHealth(current);
    const base = {
      fromHeadSha: previous.headSha,
      toHeadSha: current.headSha,
      fromAttention: previous.attention,
      toAttention: current.attention,
      fromEvidenceHealth,
      toEvidenceHealth,
      evaluatedAt: current.evaluatedAt,
    };
    if ((fromEvidenceHealth === 'FAILED' || fromEvidenceHealth === 'PENDING_OR_MISSING') && toEvidenceHealth === 'CLEAR') {
      transitions.push({ kind: 'EVIDENCE_RECOVERED', ...base });
    } else if (fromEvidenceHealth === 'CLEAR' && toEvidenceHealth === 'FAILED') {
      transitions.push({ kind: 'EVIDENCE_REGRESSED', ...base });
    }
    if (attentionRank[current.attention] > attentionRank[previous.attention]) transitions.push({ kind: 'ATTENTION_INCREASED', ...base });
    else if (attentionRank[current.attention] < attentionRank[previous.attention]) transitions.push({ kind: 'ATTENTION_DECREASED', ...base });
  }

  const latest = history.runs[0];
  const latestHealth = fixtureEvidenceHealth(latest);
  return {
    version: 1,
    repository: history.repository,
    pullRequest: history.pullRequest,
    latest,
    history: {
      totalRuns: history.totalRunCount,
      evidenceCounts,
      attentionCounts,
      firstEvaluatedAt: history.runs.at(-1)?.evaluatedAt ?? latest.evaluatedAt,
      lastEvaluatedAt: latest.evaluatedAt,
      currentClearStreak,
      currentFailureStreak,
    },
    evidenceIssues: [],
    transitions,
    insights: [
      { kind: latestHealth === 'CLEAR' ? 'CURRENTLY_CLEAR' : latestHealth === 'FAILED' ? 'CURRENTLY_FAILING' : 'CURRENTLY_WAITING', headSha: latest.headSha },
      ...(currentClearStreak > 1 ? [{ kind: 'CLEAR_STREAK' as const, value: currentClearStreak, headSha: latest.headSha }] : []),
      ...(currentFailureStreak > 1 ? [{ kind: 'FAILURE_STREAK' as const, value: currentFailureStreak, headSha: latest.headSha }] : []),
    ],
    runs: history.runs,
    historyCompleteness: history.historyCompleteness,
    truncated: history.truncated,
  };
}

function fixtureRun(repositoryId: number, runId: string): EvaluationDetailResponseV1 {
  const match = /^fixture:(\d+):(\d+):(\d+)$/.exec(runId);
  if (!match || Number(match[1]) !== repositoryId) throw new Error('Run not found');
  const pullRequestNumber = Number(match[2]);
  const index = Number(match[3]);
  const rawHistory = getFixturePullRequestHistory(repositoryId, pullRequestNumber);
  const history = identifyFixtureHistory(rawHistory);
  const rawRun = rawHistory.runs[index];
  const run = history.runs[index];
  if (!rawRun || !run) throw new Error('Run not found');
  const response = getFixtureEvaluation(repositoryId, rawRun.headSha);
  if (response.status === 'unavailable') {
    return { ...response, summary: run };
  }
  return {
    ...response,
    detail: {
      ...response.detail,
      runId,
      observationSource: run.observationSource,
      headSha: run.headSha,
      attention: run.attention,
      reasons: run.topReasons,
      changeSummary: run.changeSummary,
      evaluatedAt: run.evaluatedAt,
      githubCheckUrl: run.githubCheckUrl,
      evidence: response.detail.evidence.map((item, evidenceIndex) => evidenceIndex === 0 ? {
        ...item,
        status: run.evidenceSummary.failed ? 'FAILED'
          : run.evidenceSummary.pending ? 'PENDING'
            : run.evidenceSummary.missing ? 'MISSING'
              : 'PASSED',
      } : item),
    },
  };
}

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
        pullRequests: [],
        pagination: { nextCursor: null }
      };
    }
    return buildFixtureActivity(query);
  }

  async getPullRequest(repositoryId: number, pullRequestNumber: number): Promise<PullRequestDetailV1> {
    if (this.mode === 'loading') return new Promise<PullRequestDetailV1>(() => undefined);
    if (this.mode === 'error') throw new Error('Synthetic fixture failure');
    return fixturePullRequestDetail(identifyFixtureHistory(getFixturePullRequestHistory(repositoryId, pullRequestNumber)));
  }

  async getPullRequestHistory(repositoryId: number, pullRequestNumber: number): Promise<PullRequestHistoryResponseV1> {
    if (this.mode === 'loading') return new Promise<PullRequestHistoryResponseV1>(() => undefined);
    if (this.mode === 'error') throw new Error('Synthetic fixture failure');
    return identifyFixtureHistory(getFixturePullRequestHistory(repositoryId, pullRequestNumber));
  }

  async getEvaluation(repositoryId: number, headSha: string): Promise<EvaluationDetailResponseV1> {
    if (this.mode === 'loading') return new Promise<EvaluationDetailResponseV1>(() => undefined);
    if (this.mode === 'error') throw new Error('Synthetic fixture failure');
    return getFixtureEvaluation(repositoryId, headSha);
  }

  async getRun(repositoryId: number, runId: string): Promise<EvaluationDetailResponseV1> {
    if (this.mode === 'loading') return new Promise<EvaluationDetailResponseV1>(() => undefined);
    if (this.mode === 'error') throw new Error('Synthetic fixture failure');
    return fixtureRun(repositoryId, runId);
  }

  async getFavorites(): Promise<FavoritesResponseV1> {
    return { version: 1, favorites: this.readFavorites() };
  }

  async addFavorite(favorite: DashboardFavoriteV1): Promise<void> {
    const favorites = this.readFavorites();
    const key = JSON.stringify(favorite);
    if (!favorites.some((item) => JSON.stringify(item) === key)) favorites.push(favorite);
    this.writeFavorites(favorites);
  }

  async removeFavorite(favorite: DashboardFavoriteV1): Promise<void> {
    const key = JSON.stringify(favorite);
    this.writeFavorites(this.readFavorites().filter((item) => JSON.stringify(item) !== key));
  }

  async logout(): Promise<void> {
    return undefined;
  }

  private readFavorites(): DashboardFavoriteV1[] {
    try {
      const raw = globalThis.localStorage?.getItem(`spark:fixture:favorites:v1:${fixtureViewer.id}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed as DashboardFavoriteV1[] : [];
    } catch {
      return [];
    }
  }

  private writeFavorites(favorites: DashboardFavoriteV1[]): void {
    try {
      globalThis.localStorage?.setItem(`spark:fixture:favorites:v1:${fixtureViewer.id}`, JSON.stringify(favorites));
    } catch {
      // Fixture persistence is best effort when browser storage is unavailable.
    }
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
