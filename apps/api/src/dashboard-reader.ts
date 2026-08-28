import type {
  ActivityQueryV1,
  ActivityResponseV1,
  AttentionLevelV1,
  ChangeSummaryV1,
  EvaluationDetailResponseV1,
  EvaluationDetailV1,
  EvaluationSummaryV1,
  EvidenceSummaryV1,
  ObservedRepositoryV1,
  PullRequestActivityV1,
  PullRequestDetailV1,
  PullRequestHistoryResponseV1,
  RepositoryRefV1,
} from '@spark/dashboard-contracts';
import type { D1Database } from './d1';
import type { StoredEvaluationDetailV1 } from './evaluation-detail';
import { buildPullRequestDetail } from './pull-request-insights';

const EVAL_TIME_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(d.evaluated_at, e.updated_at))";
const REPOSITORY_SCOPE_SQL = 'SELECT CAST(value AS INTEGER) FROM json_each(?)';
const MAX_HISTORY_RUNS = 100;

interface ActivityRow {
  repository_id: number;
  full_name: string;
  head_sha: string;
  pull_request_number: number;
  attention: AttentionLevelV1;
  evaluated_at: string;
  normalized_json: string | null;
  check_url: string | null;
}

interface PullRequestActivityRow extends ActivityRow {
  run_count: number;
  low_count: number;
  medium_count: number;
  high_count: number;
}

interface HistoryRow extends ActivityRow {
  total_run_count: number;
}

interface RepositoryRow {
  id: number;
  full_name: string;
  pull_request_count: number;
}

interface CountRow {
  attention: AttentionLevelV1;
  count: number;
}

interface CursorV1 {
  t: string;
  r: number;
  p: number;
}

function encodeCursor(cursor: CursorV1): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(value: string | null | undefined): CursorV1 | undefined {
  if (!value) return undefined;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const parsed = JSON.parse(atob(padded)) as Partial<CursorV1>;
    return typeof parsed.t === 'string' && typeof parsed.r === 'number' && typeof parsed.p === 'number'
      ? { t: parsed.t, r: parsed.r, p: parsed.p }
      : undefined;
  } catch {
    return undefined;
  }
}

function windowStart(window: ActivityQueryV1['window'], now: Date): string {
  const duration = window === '24h' ? 24 * 60 * 60 * 1000 : window === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - duration).toISOString();
}

function splitRepository(id: number, fullName: string): RepositoryRefV1 {
  const [owner = '', name = fullName] = fullName.split('/');
  return { id, owner, name, url: `https://github.com/${fullName}` };
}

function pullUrl(fullName: string, number: number): string {
  return `https://github.com/${fullName}/pull/${number}`;
}

function checkUrl(fullName: string, number: number, saved?: string | null): string {
  return saved || `${pullUrl(fullName, number)}/checks`;
}

function parseDetail(value: string | null): StoredEvaluationDetailV1 | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<StoredEvaluationDetailV1>;
    return parsed.version === 1 && typeof parsed.headSha === 'string' && parsed.evaluation?.attention
      ? parsed as StoredEvaluationDetailV1
      : undefined;
  } catch {
    return undefined;
  }
}

function extension(path: string): string {
  const filename = path.split('/').pop() ?? path;
  const index = filename.lastIndexOf('.');
  return index > 0 ? filename.slice(index).toLowerCase() : '(none)';
}

function changeSummary(detail: StoredEvaluationDetailV1): ChangeSummaryV1 {
  const counts = new Map<string, number>();
  for (const file of detail.input.change.files) {
    const ext = extension(file.path);
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return {
    files: detail.input.change.files.length,
    extensions: [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([extensionName, count]) => ({ extension: extensionName, count })),
  };
}

function evidenceSummary(detail?: StoredEvaluationDetailV1): EvidenceSummaryV1 {
  const summary: EvidenceSummaryV1 = { passed: 0, pending: 0, failed: 0, missing: 0, unknown: 0 };
  for (const evidence of detail?.evaluation.evidence ?? []) {
    if (evidence.status === 'PASSED') summary.passed += 1;
    else if (evidence.status === 'PENDING') summary.pending += 1;
    else if (evidence.status === 'FAILED') summary.failed += 1;
    else if (evidence.status === 'MISSING') summary.missing += 1;
    else summary.unknown += 1;
  }
  return summary;
}

export function summaryFromRow(row: ActivityRow): EvaluationSummaryV1 {
  const detail = parseDetail(row.normalized_json);
  const repository = detail
    ? { id: detail.repository.id, owner: detail.repository.owner, name: detail.repository.name, url: detail.repository.url }
    : splitRepository(row.repository_id, row.full_name);
  const prUrl = detail?.pullRequest.url ?? pullUrl(row.full_name, row.pull_request_number);
  return {
    repository,
    pullRequest: {
      number: row.pull_request_number,
      title: detail?.pullRequest.title ?? `PR #${row.pull_request_number}`,
      url: prUrl,
    },
    headSha: row.head_sha,
    attention: row.attention,
    topReasons: detail?.evaluation.reasons.slice(0, 3) ?? [],
    changeSummary: detail ? changeSummary(detail) : { files: 0, extensions: [] },
    sensitiveSurfaces: detail?.evaluation.sensitiveSurfaces ?? [],
    evidenceSummary: evidenceSummary(detail),
    evaluatedAt: row.evaluated_at,
    githubCheckUrl: checkUrl(row.full_name, row.pull_request_number, detail?.check.url ?? row.check_url),
    detailAvailable: Boolean(detail),
  };
}

function pullRequestActivityFromRow(row: PullRequestActivityRow): PullRequestActivityV1 {
  const latest = summaryFromRow(row);
  return {
    repository: latest.repository,
    pullRequest: latest.pullRequest,
    latest,
    history: {
      runCount: Number(row.run_count ?? 0),
      attentionCounts: {
        LOW: Number(row.low_count ?? 0),
        MEDIUM: Number(row.medium_count ?? 0),
        HIGH: Number(row.high_count ?? 0),
      },
    },
  };
}

export function detailFromRow(row: ActivityRow): EvaluationDetailResponseV1 {
  const summary = summaryFromRow(row);
  const detail = parseDetail(row.normalized_json);
  if (!detail) return { version: 1, status: 'unavailable', reason: 'LEGACY_RECORD', summary };
  const unmapped = detail.evaluation.directAreas.some(area => area === 'Repository root' || area === 'Unmapped area')
    ? detail.input.change.files.map(file => file.path)
    : [];
  const response: EvaluationDetailV1 = {
    version: 1,
    repository: summary.repository,
    pullRequest: summary.pullRequest,
    headSha: detail.headSha,
    baseSha: detail.baseSha,
    evaluatedAt: detail.evaluatedAt,
    evaluatorVersion: detail.evaluatorVersion,
    attention: detail.evaluation.attention,
    reasons: detail.evaluation.reasons,
    changeSummary: summary.changeSummary,
    changedFiles: detail.input.change.files.map(file => ({
      path: file.path,
      status: file.status === 'deleted' ? 'removed' : file.status,
    })),
    directAreas: detail.evaluation.directAreas,
    affectedAreas: detail.evaluation.affectedAreas,
    unmappedPaths: unmapped,
    sensitiveSurfaces: detail.evaluation.sensitiveSurfaces,
    evidence: detail.evaluation.evidence.map(item => ({
      name: item.name,
      status: item.status,
      coverage: item.coverage ?? 'UNKNOWN',
      ...(item.url ? { url: item.url } : {}),
    })),
    profile: detail.profileProvenance
      ? { state: 'ACTIVE', sourceSha: detail.profileProvenance.sourceSha, version: detail.profileProvenance.version, matchedAreas: [] }
      : { state: 'ABSENT', matchedAreas: [] },
    analysisNotes: detail.evaluation.analysis?.notes ?? detail.input.analysis?.notes ?? [],
    githubCheckUrl: summary.githubCheckUrl,
  };
  return { version: 1, status: 'available', detail: response };
}

function runInputFromRow(row: ActivityRow) {
  const response = detailFromRow(row);
  return {
    summary: response.status === 'available' ? summaryFromRow(row) : response.summary,
    ...(response.status === 'available' ? { detail: response.detail } : {}),
  };
}

export interface DashboardReader {
  activity(query: ActivityQueryV1, repositoryIds: number[], now?: Date): Promise<ActivityResponseV1>;
  pullRequest(repositoryId: number, pullRequestNumber: number): Promise<PullRequestDetailV1 | undefined>;
  pullRequestHistory(repositoryId: number, pullRequestNumber: number): Promise<PullRequestHistoryResponseV1 | undefined>;
  evaluation(repositoryId: number, headSha: string): Promise<EvaluationDetailResponseV1 | undefined>;
}

export class D1DashboardReader implements DashboardReader {
  constructor(private readonly db: D1Database) {}

  async activity(query: ActivityQueryV1, repositoryIds: number[], now = new Date()): Promise<ActivityResponseV1> {
    if (repositoryIds.length === 0) {
      return {
        version: 1,
        selectedWindow: query.window,
        selectedAttention: query.attention,
        selectedRepositoryId: query.repositoryId,
        counts: { LOW: 0, MEDIUM: 0, HIGH: 0 },
        repositories: [],
        pullRequests: [],
        pagination: { nextCursor: null },
      };
    }

    const start = windowStart(query.window, now);
    const repositoryScope = JSON.stringify(repositoryIds);
    const rankedSql = `
      SELECT e.repository_id, r.full_name, e.head_sha, e.pull_request_number, e.attention,
             ${EVAL_TIME_SQL} AS evaluated_at, d.normalized_json, d.check_url,
             ROW_NUMBER() OVER (
               PARTITION BY e.repository_id, e.pull_request_number
               ORDER BY datetime(COALESCE(d.evaluated_at, e.updated_at)) DESC, e.head_sha DESC
             ) AS row_number
      FROM evaluations e
      JOIN repositories r ON r.id = e.repository_id
      LEFT JOIN evaluation_details d ON d.repository_id = e.repository_id AND d.head_sha = e.head_sha
      WHERE e.repository_id IN (${REPOSITORY_SCOPE_SQL})`;

    const repositoryResult = await this.db.prepare(
      `WITH ranked AS (${rankedSql})
       SELECT repository_id AS id, full_name,
              SUM(CASE WHEN row_number = 1 AND datetime(evaluated_at) >= datetime(?) THEN 1 ELSE 0 END) AS pull_request_count
       FROM ranked
       GROUP BY repository_id, full_name
       ORDER BY full_name ASC`,
    ).bind(repositoryScope, start).all<RepositoryRow>();
    const repositories: ObservedRepositoryV1[] = (repositoryResult.results ?? []).map(row => ({
      ...splitRepository(row.id, row.full_name),
      pullRequestCount: Number(row.pull_request_count ?? 0),
    }));

    const countWhere = ['row_number = 1', 'datetime(evaluated_at) >= datetime(?)'];
    const countBindings: unknown[] = [repositoryScope, start];
    if (query.repositoryId !== null) {
      countWhere.push('repository_id = ?');
      countBindings.push(query.repositoryId);
    }
    const countResult = await this.db.prepare(
      `WITH ranked AS (${rankedSql})
       SELECT attention, COUNT(*) AS count
       FROM ranked
       WHERE ${countWhere.join(' AND ')}
       GROUP BY attention`,
    ).bind(...countBindings).all<CountRow>();
    const counts: Record<AttentionLevelV1, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const row of countResult.results ?? []) counts[row.attention] = Number(row.count ?? 0);

    const where = ['l.row_number = 1', 'datetime(l.evaluated_at) >= datetime(?)'];
    const bindings: unknown[] = [repositoryScope, start];
    if (query.repositoryId !== null) {
      where.push('l.repository_id = ?');
      bindings.push(query.repositoryId);
    }
    if (query.attention !== 'ALL') {
      where.push('l.attention = ?');
      bindings.push(query.attention);
    }
    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      where.push('(l.evaluated_at < ? OR (l.evaluated_at = ? AND l.repository_id < ?) OR (l.evaluated_at = ? AND l.repository_id = ? AND l.pull_request_number < ?))');
      bindings.push(cursor.t, cursor.t, cursor.r, cursor.t, cursor.r, cursor.p);
    }
    const limit = Math.max(1, Math.min(query.limit ?? 50, 100));
    const activityResult = await this.db.prepare(
      `WITH ranked AS (${rankedSql}),
       history AS (
         SELECT repository_id, pull_request_number,
                COUNT(*) AS run_count,
                SUM(CASE WHEN attention = 'LOW' THEN 1 ELSE 0 END) AS low_count,
                SUM(CASE WHEN attention = 'MEDIUM' THEN 1 ELSE 0 END) AS medium_count,
                SUM(CASE WHEN attention = 'HIGH' THEN 1 ELSE 0 END) AS high_count
         FROM ranked
         GROUP BY repository_id, pull_request_number
       )
       SELECT l.repository_id, l.full_name, l.head_sha, l.pull_request_number, l.attention,
              l.evaluated_at, l.normalized_json, l.check_url,
              h.run_count, h.low_count, h.medium_count, h.high_count
       FROM ranked l
       JOIN history h
         ON h.repository_id = l.repository_id AND h.pull_request_number = l.pull_request_number
       WHERE ${where.join(' AND ')}
       ORDER BY l.evaluated_at DESC, l.repository_id DESC, l.pull_request_number DESC
       LIMIT ?`,
    ).bind(...bindings, limit + 1).all<PullRequestActivityRow>();
    const rows = activityResult.results ?? [];
    const page = rows.slice(0, limit);
    const last = page.at(-1);

    return {
      version: 1,
      selectedWindow: query.window,
      selectedAttention: query.attention,
      selectedRepositoryId: query.repositoryId,
      counts,
      repositories,
      pullRequests: page.map(pullRequestActivityFromRow),
      pagination: {
        nextCursor: rows.length > limit && last
          ? encodeCursor({ t: last.evaluated_at, r: last.repository_id, p: last.pull_request_number })
          : null,
      },
    };
  }

  private async pullRequestRows(repositoryId: number, pullRequestNumber: number): Promise<HistoryRow[]> {
    const result = await this.db.prepare(
      `SELECT e.repository_id, r.full_name, e.head_sha, e.pull_request_number, e.attention,
              ${EVAL_TIME_SQL} AS evaluated_at, d.normalized_json, d.check_url,
              COUNT(*) OVER () AS total_run_count
       FROM evaluations e
       JOIN repositories r ON r.id = e.repository_id
       LEFT JOIN evaluation_details d ON d.repository_id = e.repository_id AND d.head_sha = e.head_sha
       WHERE e.repository_id = ? AND e.pull_request_number = ?
       ORDER BY datetime(COALESCE(d.evaluated_at, e.updated_at)) DESC, e.head_sha DESC
       LIMIT ?`,
    ).bind(repositoryId, pullRequestNumber, MAX_HISTORY_RUNS).all<HistoryRow>();
    return result.results ?? [];
  }

  async pullRequest(repositoryId: number, pullRequestNumber: number): Promise<PullRequestDetailV1 | undefined> {
    const rows = await this.pullRequestRows(repositoryId, pullRequestNumber);
    if (!rows.length) return undefined;
    const totalRunCount = Number(rows[0].total_run_count ?? rows.length);
    return buildPullRequestDetail(rows.map(runInputFromRow), totalRunCount);
  }

  async pullRequestHistory(repositoryId: number, pullRequestNumber: number): Promise<PullRequestHistoryResponseV1 | undefined> {
    const rows = await this.pullRequestRows(repositoryId, pullRequestNumber);
    if (!rows.length) return undefined;
    const runs = rows.map(summaryFromRow);
    const latest = runs[0];
    const totalRunCount = Number(rows[0].total_run_count ?? runs.length);
    return {
      version: 1,
      repository: latest.repository,
      pullRequest: latest.pullRequest,
      totalRunCount,
      runs,
      truncated: totalRunCount > runs.length,
    };
  }

  async evaluation(repositoryId: number, headSha: string): Promise<EvaluationDetailResponseV1 | undefined> {
    const row = await this.db.prepare(
      `SELECT e.repository_id, r.full_name, e.head_sha, e.pull_request_number, e.attention,
              ${EVAL_TIME_SQL} AS evaluated_at, d.normalized_json, d.check_url
       FROM evaluations e
       JOIN repositories r ON r.id = e.repository_id
       LEFT JOIN evaluation_details d ON d.repository_id = e.repository_id AND d.head_sha = e.head_sha
       WHERE e.repository_id = ? AND e.head_sha = ?`,
    ).bind(repositoryId, headSha).first<ActivityRow>();
    return row ? detailFromRow(row) : undefined;
  }
}
