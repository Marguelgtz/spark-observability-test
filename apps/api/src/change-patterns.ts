import type { ActivityWindowV1 } from '@spark/dashboard-contracts';
import type {
  BehaviorMotifKindV1,
  BehaviorOutcomeCountsV1,
  BehaviorOutcomeKindV1,
  BehaviorPatternV1,
  BehaviorPatternsResponseV1,
  ChangeBehaviorV1,
} from '@spark/dashboard-contracts/behavior';
import type { D1Database } from './d1';
import { D1DashboardReader } from './dashboard-reader';
import { deriveChangeBehavior } from './change-behavior';

const REPOSITORY_SCOPE_SQL = 'SELECT CAST(value AS INTEGER) FROM json_each(?)';
const DEFAULT_EXAMPLE_LIMIT = 5;

export interface ChangePatternInput {
  repositoryIds: number[];
  window: ActivityWindowV1;
  repositoryId: number | null;
  now?: Date;
  exampleLimit?: number;
}

interface ActivePullRequestRow {
  repository_id: number;
  pull_request_number: number;
}

interface PerPullRequestPattern {
  behavior: ChangeBehaviorV1;
  occurrences: number;
  latestAt: string;
}

interface PatternAccumulator {
  kind: BehaviorPatternV1['kind'];
  key: string;
  label: string;
  motifKind?: BehaviorMotifKindV1;
  signature?: string;
  occurrences: number;
  pullRequests: Map<string, PerPullRequestPattern>;
}

function windowStart(window: ActivityWindowV1, now: Date): string {
  const duration = window === '24h'
    ? 24 * 60 * 60 * 1000
    : window === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - duration).toISOString();
}

function pullRequestKey(behavior: ChangeBehaviorV1): string {
  return `${behavior.repository.id}:${behavior.pullRequest.number}`;
}

function outcome(behavior: ChangeBehaviorV1): BehaviorOutcomeKindV1 {
  const lifecycle = behavior.lifecycle;
  if (!lifecycle || lifecycle.state === 'OPEN') return 'OPEN';
  if (lifecycle.state === 'CLOSED') return 'CLOSED_WITHOUT_MERGE';
  if (lifecycle.unresolvedAtMerge === false) return 'RESOLVED_BEFORE_MERGE';
  if (lifecycle.unresolvedAtMerge === true) return 'MERGED_UNRESOLVED';
  return 'OUTCOME_UNAVAILABLE';
}

function emptyOutcomes(): BehaviorOutcomeCountsV1 {
  return {
    resolvedBeforeMerge: 0,
    mergedUnresolved: 0,
    outcomeUnavailable: 0,
    closedWithoutMerge: 0,
    open: 0,
  };
}

function addOutcome(counts: BehaviorOutcomeCountsV1, kind: BehaviorOutcomeKindV1): void {
  if (kind === 'RESOLVED_BEFORE_MERGE') counts.resolvedBeforeMerge += 1;
  else if (kind === 'MERGED_UNRESOLVED') counts.mergedUnresolved += 1;
  else if (kind === 'OUTCOME_UNAVAILABLE') counts.outcomeUnavailable += 1;
  else if (kind === 'CLOSED_WITHOUT_MERGE') counts.closedWithoutMerge += 1;
  else counts.open += 1;
}

const MOTIF_LABELS: Record<BehaviorMotifKindV1, string> = {
  REGRESSION_THEN_RECOVERY: 'Evidence regression followed by recovery',
  SCOPE_THEN_REGRESSION: 'Scope expansion followed by evidence regression',
  SURFACE_THEN_ATTENTION_UP: 'Sensitive surface followed by attention increase',
  ATTENTION_OSCILLATION: 'Attention oscillation',
};

function accumulator(
  patterns: Map<string, PatternAccumulator>,
  kind: BehaviorPatternV1['kind'],
  key: string,
  label: string,
  metadata: { motifKind?: BehaviorMotifKindV1; signature?: string } = {},
): PatternAccumulator {
  const existing = patterns.get(key);
  if (existing) return existing;
  const created: PatternAccumulator = {
    kind,
    key,
    label,
    ...metadata,
    occurrences: 0,
    pullRequests: new Map(),
  };
  patterns.set(key, created);
  return created;
}

function addOccurrence(
  pattern: PatternAccumulator,
  behavior: ChangeBehaviorV1,
  occurredAt: string,
): void {
  pattern.occurrences += 1;
  const key = pullRequestKey(behavior);
  const existing = pattern.pullRequests.get(key);
  if (existing) {
    existing.occurrences += 1;
    if (occurredAt > existing.latestAt) existing.latestAt = occurredAt;
    return;
  }
  pattern.pullRequests.set(key, { behavior, occurrences: 1, latestAt: occurredAt });
}

function inWindow(value: string, start: string, end: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= Date.parse(start) && timestamp <= Date.parse(end);
}

function finalizePattern(pattern: PatternAccumulator, exampleLimit: number): BehaviorPatternV1 {
  const pullRequests = [...pattern.pullRequests.values()];
  const outcomes = emptyOutcomes();
  for (const entry of pullRequests) addOutcome(outcomes, outcome(entry.behavior));

  const repositories = new Map<number, { behavior: ChangeBehaviorV1; occurrences: number; pullRequests: Set<string> }>();
  for (const entry of pullRequests) {
    const repositoryId = entry.behavior.repository.id;
    const current = repositories.get(repositoryId) ?? {
      behavior: entry.behavior,
      occurrences: 0,
      pullRequests: new Set<string>(),
    };
    current.occurrences += entry.occurrences;
    current.pullRequests.add(pullRequestKey(entry.behavior));
    repositories.set(repositoryId, current);
  }

  return {
    kind: pattern.kind,
    key: pattern.key,
    label: pattern.label,
    ...(pattern.motifKind ? { motifKind: pattern.motifKind } : {}),
    ...(pattern.signature ? { signature: pattern.signature } : {}),
    occurrences: pattern.occurrences,
    affectedPRs: pullRequests.length,
    outcomes,
    repositories: [...repositories.values()]
      .map((entry) => ({
        repository: entry.behavior.repository,
        occurrences: entry.occurrences,
        affectedPRs: entry.pullRequests.size,
      }))
      .sort((left, right) => right.affectedPRs - left.affectedPRs || left.repository.id - right.repository.id),
    examples: pullRequests
      .sort((left, right) => right.latestAt.localeCompare(left.latestAt))
      .slice(0, exampleLimit)
      .map((entry) => ({
        repository: entry.behavior.repository,
        pullRequest: entry.behavior.pullRequest,
        latestAt: entry.latestAt,
        outcome: outcome(entry.behavior),
        occurrences: entry.occurrences,
        truncated: entry.behavior.truncated,
      })),
  };
}

export function aggregateBehaviorPatterns(
  behaviors: ChangeBehaviorV1[],
  input: {
    window: ActivityWindowV1;
    repositoryId: number | null;
    start: string;
    end: string;
    exampleLimit?: number;
  },
): BehaviorPatternsResponseV1 {
  const patterns = new Map<string, PatternAccumulator>();
  const exampleLimit = Math.max(1, input.exampleLimit ?? DEFAULT_EXAMPLE_LIMIT);

  for (const behavior of behaviors) {
    for (const motif of behavior.motifs) {
      if (!inWindow(motif.endedAt, input.start, input.end)) continue;
      const key = `motif:v1:${motif.kind}`;
      const pattern = accumulator(patterns, 'MOTIF', key, MOTIF_LABELS[motif.kind], { motifKind: motif.kind });
      addOccurrence(pattern, behavior, motif.endedAt);
    }

    if (inWindow(behavior.lastEvaluatedAt, input.start, input.end)) {
      const signature = behavior.signatures.full;
      const key = `signature:${signature}`;
      const pattern = accumulator(patterns, 'SIGNATURE', key, signature, { signature });
      addOccurrence(pattern, behavior, behavior.lastEvaluatedAt);
    }
  }

  return {
    version: 1,
    behaviorSchemaVersion: 1,
    selectedWindow: input.window,
    selectedRepositoryId: input.repositoryId,
    observedPRs: behaviors.length,
    patterns: [...patterns.values()]
      .map((pattern) => finalizePattern(pattern, exampleLimit))
      .sort((left, right) =>
        right.affectedPRs - left.affectedPRs
        || right.occurrences - left.occurrences
        || left.key.localeCompare(right.key)),
  };
}

export async function readChangePatterns(
  db: D1Database,
  input: ChangePatternInput,
): Promise<BehaviorPatternsResponseV1> {
  const now = input.now ?? new Date();
  const start = windowStart(input.window, now);
  const end = now.toISOString();
  const scopedRepositoryIds = input.repositoryId === null
    ? [...new Set(input.repositoryIds)]
    : input.repositoryIds.includes(input.repositoryId)
      ? [input.repositoryId]
      : [];

  if (!scopedRepositoryIds.length) {
    return aggregateBehaviorPatterns([], {
      window: input.window,
      repositoryId: input.repositoryId,
      start,
      end,
      exampleLimit: input.exampleLimit,
    });
  }

  const scope = JSON.stringify(scopedRepositoryIds);
  const rows = await db.prepare(
    `SELECT DISTINCT er.repository_id, er.pull_request_number
     FROM evaluation_runs er
     WHERE er.repository_id IN (${REPOSITORY_SCOPE_SQL})
       AND datetime(er.evaluated_at) >= datetime(?)
       AND datetime(er.evaluated_at) <= datetime(?)
     ORDER BY er.repository_id ASC, er.pull_request_number ASC`,
  ).bind(scope, start, end).all<ActivePullRequestRow>();

  const reader = new D1DashboardReader(db);
  const behaviors: ChangeBehaviorV1[] = [];
  for (const row of rows.results ?? []) {
    const trajectory = await reader.trajectory(row.repository_id, row.pull_request_number);
    if (trajectory) behaviors.push(deriveChangeBehavior(trajectory));
  }

  return aggregateBehaviorPatterns(behaviors, {
    window: input.window,
    repositoryId: input.repositoryId,
    start,
    end,
    exampleLimit: input.exampleLimit,
  });
}
