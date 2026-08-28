import type {
  AccountV1,
  ActivityQueryV1,
  ActivityResponseV1,
  AttentionLevelV1,
  EvaluationDetailResponseV1,
  EvaluationSummaryV1,
  EvidenceHealthV1,
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
    truncated: history.truncated,
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
    return fixturePullRequestDetail(getFixturePullRequestHistory(repositoryId, pullRequestNumber));
  }

  async getPullRequestHistory(repositoryId: number, pullRequestNumber: number): Promise<PullRequestHistoryResponseV1> {
    if (this.mode === 'loading') return new Promise<PullRequestHistoryResponseV1>(() => undefined);
    if (this.mode === 'error') throw new Error('Synthetic fixture failure');
    return getFixturePullRequestHistory(repositoryId, pullRequestNumber);
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
