import type {
  AccountV1,
  ActivityQueryV1,
  ActivityResponseV1,
  AttentionLevelV1,
  DashboardFavoriteV1,
  DashboardSettingsInputV1,
  DashboardSettingsV1,
  EvaluationDetailResponseV1,
  EvaluationSummaryV1,
  EvidenceHealthV1,
  FavoritesResponseV1,
  PullRequestDetailV1,
  PullRequestHistoryResponseV1,
  PullRequestTrajectoryV1,
  PullRequestTransitionV1,
  SaveTrajectoryFeedbackV1,
  TrajectoryFeedbackV1,
  ViewerV1
} from '@spark/dashboard-contracts';
import { DASHBOARD_SETTINGS_DEFAULTS } from '@spark/dashboard-contracts';
import { buildFixtureActivity, fixtureViewer, getFixtureEvaluation, getFixturePullRequestHistory } from './fixtures';

export interface DashboardApi {
  getViewer(): Promise<ViewerV1>;
  getAccount(): Promise<AccountV1>;
  getActivity(query: ActivityQueryV1): Promise<ActivityResponseV1>;
  getPullRequest(repositoryId: number, pullRequestNumber: number): Promise<PullRequestDetailV1>;
  getTrajectory(repositoryId: number, pullRequestNumber: number): Promise<PullRequestTrajectoryV1>;
  saveTrajectoryFeedback(
    repositoryId: number,
    pullRequestNumber: number,
    transitionId: string,
    input: SaveTrajectoryFeedbackV1,
  ): Promise<TrajectoryFeedbackV1>;
  getPullRequestHistory(repositoryId: number, pullRequestNumber: number): Promise<PullRequestHistoryResponseV1>;
  getEvaluation(repositoryId: number, headSha: string): Promise<EvaluationDetailResponseV1>;
  getRun(repositoryId: number, runId: string): Promise<EvaluationDetailResponseV1>;
  getFavorites(): Promise<FavoritesResponseV1>;
  addFavorite(favorite: DashboardFavoriteV1): Promise<void>;
  removeFavorite(favorite: DashboardFavoriteV1): Promise<void>;
  getSettings(): Promise<LoadedDashboardSettings>;
  replaceSettings(settings: DashboardSettingsInputV1, etag: string): Promise<LoadedDashboardSettings>;
  logout(): Promise<void>;
}

export interface LoadedDashboardSettings {
  settings: DashboardSettingsV1;
  etag: string;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export class SettingsConflictError extends Error {
  constructor() {
    super('Settings changed elsewhere');
    this.name = 'SettingsConflictError';
  }
}

export class SettingsRequestError extends Error {
  constructor(readonly status: number, readonly reason?: string) {
    super(`Settings request failed (${status})${reason ? `: ${reason}` : ''}`);
    this.name = 'SettingsRequestError';
  }
}

async function settingsRequestError(response: Response): Promise<SettingsRequestError> {
  try {
    const body = await response.json() as { error?: unknown };
    return new SettingsRequestError(response.status, typeof body.error === 'string' ? body.error : undefined);
  } catch {
    return new SettingsRequestError(response.status);
  }
}

function settingsEtag(response: Response, settings: DashboardSettingsV1): string {
  const header = response.headers.get('etag');
  const revision = header?.match(/settings-(\d+)/)?.[1];
  return `"settings-${revision ?? settings.revision}"`;
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
    if (query.q) params.set('q', query.q);
    if (query.favoritesOnly) params.set('favorites', '1');
    return this.request(`/api/activity?${params.toString()}`);
  }

  getPullRequest(repositoryId: number, pullRequestNumber: number): Promise<PullRequestDetailV1> {
    return this.request(`/api/repositories/${repositoryId}/pulls/${pullRequestNumber}`);
  }

  getTrajectory(repositoryId: number, pullRequestNumber: number): Promise<PullRequestTrajectoryV1> {
    return this.request(`/api/repositories/${repositoryId}/pulls/${pullRequestNumber}/trajectory`);
  }

  saveTrajectoryFeedback(
    repositoryId: number,
    pullRequestNumber: number,
    transitionId: string,
    input: SaveTrajectoryFeedbackV1,
  ): Promise<TrajectoryFeedbackV1> {
    return this.request(
      `/api/repositories/${repositoryId}/pulls/${pullRequestNumber}/trajectory/${encodeURIComponent(transitionId)}/feedback`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
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

  async getSettings(): Promise<LoadedDashboardSettings> {
    const response = await fetch(`${this.baseUrl}/api/settings`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (response.status === 401) throw new UnauthorizedError();
    if (!response.ok) throw await settingsRequestError(response);
    const settings = await response.json() as DashboardSettingsV1;
    return { settings, etag: settingsEtag(response, settings) };
  }

  async replaceSettings(settings: DashboardSettingsInputV1, etag: string): Promise<LoadedDashboardSettings> {
    const response = await fetch(`${this.baseUrl}/api/settings`, {
      method: 'PUT',
      credentials: 'include',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'if-match': etag },
      body: JSON.stringify(settings),
    });
    if (response.status === 401) throw new UnauthorizedError();
    if (response.status === 412) throw new SettingsConflictError();
    if (!response.ok) {
      const error = await settingsRequestError(response);
      if (error.status === 400 && error.reason === 'invalid If-Match') throw new SettingsConflictError();
      throw error;
    }
    const saved = await response.json() as DashboardSettingsV1;
    return { settings: saved, etag: settingsEtag(response, saved) };
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

function fixtureEvidenceStatus(summary: EvaluationSummaryV1) {
  if (summary.evidenceSummary.failed) return 'FAILED' as const;
  if (summary.evidenceSummary.missing) return 'MISSING' as const;
  if (summary.evidenceSummary.pending) return 'PENDING' as const;
  if (summary.evidenceSummary.passed) return 'PASSED' as const;
  return 'UNKNOWN' as const;
}

function fixturePullRequestTrajectory(history: PullRequestHistoryResponseV1): PullRequestTrajectoryV1 {
  const detail = fixturePullRequestDetail(history);
  const chronological = [...history.runs].reverse();
  const notableTransitions: PullRequestTrajectoryV1['notableTransitions'] = [];
  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    const from = fixtureEvidenceStatus(previous);
    const to = fixtureEvidenceStatus(current);
    const attentionChanged = previous.attention !== current.attention;
    const kinds: PullRequestTrajectoryV1['notableTransitions'][number]['kinds'] = [];
    if (attentionChanged) kinds.push(attentionRank[current.attention] > attentionRank[previous.attention] ? 'ATTENTION_INCREASED' : 'ATTENTION_DECREASED');
    if (to === 'FAILED' && from !== 'FAILED') kinds.push('EVIDENCE_REGRESSED');
    if (from === 'FAILED' && to === 'PASSED') kinds.push('EVIDENCE_RECOVERED');
    if ((to === 'PENDING' || to === 'MISSING') && from !== to) kinds.push('EVIDENCE_BECAME_PENDING');
    if ((from === 'PENDING' || from === 'MISSING') && to === 'PASSED') kinds.push('EVIDENCE_RESOLVED');
    const addedSurfaces = current.sensitiveSurfaces.filter(item => !previous.sensitiveSurfaces.includes(item));
    if (addedSurfaces.length) kinds.push('SENSITIVE_SURFACE_ADDED');
    if (!kinds.length) continue;
    const fromRunId = previous.runId ?? `fixture:${index - 1}`;
    const toRunId = current.runId ?? `fixture:${index}`;
    notableTransitions.push({
      id: `${fromRunId}:${toRunId}`,
      fromRunId,
      toRunId,
      occurredAt: current.evaluatedAt,
      kinds,
      severity: 'MATERIAL',
      delta: {
        fromRunId,
        toRunId,
        fromHeadSha: previous.headSha,
        toHeadSha: current.headSha,
        evaluatedAt: current.evaluatedAt,
        timeInPreviousStateMs: Math.max(0, Date.parse(current.evaluatedAt) - Date.parse(previous.evaluatedAt)),
        ...(attentionChanged ? { attention: {
          from: previous.attention,
          to: current.attention,
          direction: attentionRank[current.attention] > attentionRank[previous.attention] ? 'INCREASED' as const : 'DECREASED' as const,
        } } : {}),
        ...(fixtureEvidenceHealth(previous) !== fixtureEvidenceHealth(current) ? {
          evidenceHealth: { from: fixtureEvidenceHealth(previous), to: fixtureEvidenceHealth(current) },
        } : {}),
        evidence: [{ name: 'integration-test', from, to, change: 'STATUS_CHANGED' }],
        areas: { directAdded: [], directRemoved: [], affectedAdded: [], affectedRemoved: [] },
        sensitiveSurfaces: { added: addedSurfaces, removed: [] },
        changedFiles: { added: [], removed: [] },
        reasons: { added: current.topReasons.filter(item => !previous.topReasons.includes(item)), removed: [] },
        detailCompleteness: 'COMPLETE',
      },
    });
  }
  const current = history.runs[0];
  const mergedFixture = history.repository.id === 101 && history.pullRequest.number === 42;
  return {
    version: 1,
    repository: history.repository,
    pullRequest: history.pullRequest,
    current,
    summary: {
      totalRuns: history.totalRunCount,
      analyzedRuns: history.runs.length,
      totalTransitions: notableTransitions.length,
      regressions: notableTransitions.filter(item => item.kinds.includes('EVIDENCE_REGRESSED')).length,
      recoveries: notableTransitions.filter(item => item.kinds.includes('EVIDENCE_RECOVERED')).length,
      attentionIncreases: notableTransitions.filter(item => item.kinds.includes('ATTENTION_INCREASED')).length,
      attentionDecreases: notableTransitions.filter(item => item.kinds.includes('ATTENTION_DECREASED')).length,
      currentClearStreak: detail.history.currentClearStreak,
      firstEvaluatedAt: detail.history.firstEvaluatedAt,
      lastEvaluatedAt: detail.history.lastEvaluatedAt,
    },
    evidenceIssues: detail.evidenceIssues,
    insights: detail.insights,
    notableTransitions,
    runs: history.runs,
    ...(mergedFixture ? {
      lifecycle: {
        state: 'MERGED' as const,
        openedAt: history.runs.at(-1)?.evaluatedAt,
        mergedAt: new Date(Date.parse(current.evaluatedAt) + 5 * 60 * 1000).toISOString(),
        mergeSha: 'f1938a2d53c2499fb08ea40f829c28d67fc66f90',
        preMergeRunId: current.runId,
        preMergeAttention: current.attention,
        preMergeEvidenceHealth: fixtureEvidenceHealth(current),
        unresolvedAtMerge: current.attention !== 'LOW' || fixtureEvidenceHealth(current) !== 'CLEAR',
        lastEventAt: new Date(Date.parse(current.evaluatedAt) + 5 * 60 * 1000).toISOString(),
      },
    } : {}),
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
    const favoritePullRequestKeys = query.favoritesOnly
      ? [...new Set(this.readFavorites().map((favorite) => `${favorite.repositoryId}:${favorite.pullRequestNumber}`))]
      : undefined;
    return buildFixtureActivity({ ...query, ...(favoritePullRequestKeys ? { favoritePullRequestKeys } : {}) });
  }

  async getPullRequest(repositoryId: number, pullRequestNumber: number): Promise<PullRequestDetailV1> {
    if (this.mode === 'loading') return new Promise<PullRequestDetailV1>(() => undefined);
    if (this.mode === 'error') throw new Error('Synthetic fixture failure');
    return fixturePullRequestDetail(identifyFixtureHistory(getFixturePullRequestHistory(repositoryId, pullRequestNumber)));
  }

  async getTrajectory(repositoryId: number, pullRequestNumber: number): Promise<PullRequestTrajectoryV1> {
    if (this.mode === 'loading') return new Promise<PullRequestTrajectoryV1>(() => undefined);
    if (this.mode === 'error') throw new Error('Synthetic fixture failure');
    const trajectory = fixturePullRequestTrajectory(identifyFixtureHistory(getFixturePullRequestHistory(repositoryId, pullRequestNumber)));
    return { ...trajectory, feedback: this.readTrajectoryFeedback(repositoryId, pullRequestNumber) };
  }

  async saveTrajectoryFeedback(
    repositoryId: number,
    pullRequestNumber: number,
    transitionId: string,
    input: SaveTrajectoryFeedbackV1,
  ): Promise<TrajectoryFeedbackV1> {
    const feedback = this.readTrajectoryFeedback(repositoryId, pullRequestNumber);
    const previous = feedback.find(item => item.transitionId === transitionId);
    const timestamp = new Date().toISOString();
    const saved: TrajectoryFeedbackV1 = {
      transitionId,
      classification: input.classification,
      ...(input.note ? { note: input.note } : {}),
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.writeTrajectoryFeedback(
      repositoryId,
      pullRequestNumber,
      [...feedback.filter(item => item.transitionId !== transitionId), saved],
    );
    return saved;
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

  async getSettings(): Promise<LoadedDashboardSettings> {
    if (new URLSearchParams(globalThis.location?.search ?? '').get('settingsFailure') === 'load') {
      throw new Error('Synthetic settings load failure');
    }
    const settings = this.readSettings() ?? {
      version: 1 as const,
      revision: 0,
      ...DASHBOARD_SETTINGS_DEFAULTS,
      updatedAt: null,
    };
    return { settings, etag: `"settings-${settings.revision}"` };
  }

  async replaceSettings(input: DashboardSettingsInputV1, etag: string): Promise<LoadedDashboardSettings> {
    if (new URLSearchParams(globalThis.location?.search ?? '').get('settingsFailure') === 'save') {
      throw new Error('Synthetic settings save failure');
    }
    const current = this.readSettings();
    const revision = current?.revision ?? 0;
    if (etag !== `"settings-${revision}"`) throw new SettingsConflictError();
    const settings: DashboardSettingsV1 = {
      version: 1,
      revision: revision + 1,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.writeSettings(settings);
    return { settings, etag: `"settings-${settings.revision}"` };
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

  private settingsKey(): string {
    return `spark:fixture:settings:v1:${fixtureViewer.id}`;
  }

  private readSettings(): DashboardSettingsV1 | undefined {
    try {
      const raw = globalThis.localStorage?.getItem(this.settingsKey());
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as DashboardSettingsV1;
      return parsed?.version === 1 && Number.isSafeInteger(parsed.revision) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private writeSettings(settings: DashboardSettingsV1): void {
    try {
      globalThis.localStorage?.setItem(this.settingsKey(), JSON.stringify(settings));
    } catch {
      // Fixture persistence is best effort when browser storage is unavailable.
    }
  }

  private trajectoryFeedbackKey(repositoryId: number, pullRequestNumber: number): string {
    return `spark:fixture:trajectory-feedback:v1:${fixtureViewer.id}:${repositoryId}:${pullRequestNumber}`;
  }

  private readTrajectoryFeedback(repositoryId: number, pullRequestNumber: number): TrajectoryFeedbackV1[] {
    try {
      const raw = globalThis.localStorage?.getItem(this.trajectoryFeedbackKey(repositoryId, pullRequestNumber));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed as TrajectoryFeedbackV1[] : [];
    } catch {
      return [];
    }
  }

  private writeTrajectoryFeedback(repositoryId: number, pullRequestNumber: number, feedback: TrajectoryFeedbackV1[]): void {
    try {
      globalThis.localStorage?.setItem(this.trajectoryFeedbackKey(repositoryId, pullRequestNumber), JSON.stringify(feedback));
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
