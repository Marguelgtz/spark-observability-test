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
  RepositoryRefV1,
} from '@spark/dashboard-contracts';
import type { D1Database } from './d1';
import type { StoredEvaluationDetailV1 } from './evaluation-detail';

const EVAL_TIME_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(d.evaluated_at, e.updated_at))";
const REPOSITORY_SCOPE_SQL = 'SELECT CAST(value AS INTEGER) FROM json_each(?)';

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

interface RepositoryRow {
  id: number;
  full_name: string;
  evaluation_count: number;
}

interface CountRow {
  attention: AttentionLevelV1;
  count: number;
}

interface CursorV1 {
  t: string;
  r: number;
  s: string;
}

function encodeCursor(cursor: CursorV1): string {
  return btoa(JSON.stringify(cursor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(value: string | null | undefined): CursorV1 | undefined {
  if (!value) return undefined;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const parsed = JSON.parse(atob(padded)) as Partial<CursorV1>;
    return typeof parsed.t === 'string' && typeof parsed.r === 'number' && typeof parsed.s === 'string'
      ? { t: parsed.t, r: parsed.r, s: parsed.s }
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

export interface DashboardReader {
  activity(query: ActivityQueryV1, repositoryIds: number[], now?: Date): Promise<ActivityResponseV1>;
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
        evaluations: [],
        pagination: { nextCursor: null },
      };
    }
    const start = windowStart(query.window, now);
    const repositoryScope = JSON.stringify(repositoryIds);
    const repositoryResult = await this.db.prepare(
      `SELECT r.id, r.full_name,
              SUM(CASE WHEN datetime(COALESCE(d.evaluated_at, e.updated_at)) >= datetime(?) THEN 1 ELSE 0 END) AS evaluation_count
       FROM repositories r
       JOIN evaluations e ON e.repository_id = r.id
       LEFT JOIN evaluation_details d ON d.repository_id = e.repository_id AND d.head_sha = e.head_sha
       WHERE r.id IN (${REPOSITORY_SCOPE_SQL})
       GROUP BY r.id, r.full_name
       ORDER BY r.full_name ASC`,
    ).bind(start, repositoryScope).all<RepositoryRow>();
    const repositories: ObservedRepositoryV1[] = (repositoryResult.results ?? []).map(row => ({
      ...splitRepository(row.id, row.full_name),
      evaluationCount: Number(row.evaluation_count ?? 0),
    }));

    const countWhere = [`e.repository_id IN (${REPOSITORY_SCOPE_SQL})`, 'datetime(COALESCE(d.evaluated_at, e.updated_at)) >= datetime(?)'];
    const countBindings: unknown[] = [repositoryScope, start];
    if (query.repositoryId !== null) {
      countWhere.push('e.repository_id = ?');
      countBindings.push(query.repositoryId);
    }
    const countResult = await this.db.prepare(
      `SELECT e.attention, COUNT(*) AS count
       FROM evaluations e
       LEFT JOIN evaluation_details d ON d.repository_id = e.repository_id AND d.head_sha = e.head_sha
       WHERE ${countWhere.join(' AND ')}
       GROUP BY e.attention`,
    ).bind(...countBindings).all<CountRow>();
    const counts: Record<AttentionLevelV1, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const row of countResult.results ?? []) counts[row.attention] = Number(row.count ?? 0);

    const where = [`e.repository_id IN (${REPOSITORY_SCOPE_SQL})`, 'datetime(COALESCE(d.evaluated_at, e.updated_at)) >= datetime(?)'];
    const bindings: unknown[] = [repositoryScope, start];
    if (query.repositoryId !== null) {
      where.push('e.repository_id = ?');
      bindings.push(query.repositoryId);
    }
    if (query.attention !== 'ALL') {
      where.push('e.attention = ?');
      bindings.push(query.attention);
    }
    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      where.push(`(${EVAL_TIME_SQL} < ? OR (${EVAL_TIME_SQL} = ? AND e.repository_id < ?) OR (${EVAL_TIME_SQL} = ? AND e.repository_id = ? AND e.head_sha < ?))`);
      bindings.push(cursor.t, cursor.t, cursor.r, cursor.t, cursor.r, cursor.s);
    }
    const limit = Math.max(1, Math.min(query.limit ?? 50, 100));
    const activityResult = await this.db.prepare(
      `SELECT e.repository_id, r.full_name, e.head_sha, e.pull_request_number, e.attention,
              ${EVAL_TIME_SQL} AS evaluated_at, d.normalized_json, d.check_url
       FROM evaluations e
       JOIN repositories r ON r.id = e.repository_id
       LEFT JOIN evaluation_details d ON d.repository_id = e.repository_id AND d.head_sha = e.head_sha
       WHERE ${where.join(' AND ')}
       ORDER BY ${EVAL_TIME_SQL} DESC, e.repository_id DESC, e.head_sha DESC
       LIMIT ?`,
    ).bind(...bindings, limit + 1).all<ActivityRow>();
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
      evaluations: page.map(summaryFromRow),
      pagination: {
        nextCursor: rows.length > limit && last ? encodeCursor({ t: last.evaluated_at, r: last.repository_id, s: last.head_sha }) : null,
      },
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
