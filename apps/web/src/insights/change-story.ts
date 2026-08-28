import type {
  AttentionLevelV1,
  EvaluationSummaryV1,
  EvidenceHealthV1,
  NotableTransitionV1,
  PullRequestLifecycleV1,
  PullRequestTrajectoryV1,
} from '@spark/dashboard-contracts';

export type ChangeStoryNodeKind = 'INITIAL' | 'TRANSITION' | 'LATEST' | 'TERMINAL';

interface ChangeStoryNodeBase {
  id: string;
  kind: ChangeStoryNodeKind;
  at: string;
  elapsedMs: number;
  attention?: AttentionLevelV1;
  evidenceHealth?: EvidenceHealthV1;
}

export interface ChangeStoryObservationNode extends ChangeStoryNodeBase {
  kind: 'INITIAL' | 'LATEST';
  run: EvaluationSummaryV1;
  headline: string;
  detail: string;
}

export interface ChangeStoryTransitionNode extends ChangeStoryNodeBase {
  kind: 'TRANSITION';
  transition: NotableTransitionV1;
  run?: EvaluationSummaryV1;
  headline: string;
  causes: string[];
  latest: boolean;
}

export interface ChangeStoryTerminalNode extends ChangeStoryNodeBase {
  kind: 'TERMINAL';
  lifecycle: PullRequestLifecycleV1;
  headline: 'Resolved before merge' | 'Merged with unresolved attention' | 'Merge outcome unavailable' | 'Closed without merge';
  detail: string;
}

export type ChangeStoryNode = ChangeStoryObservationNode | ChangeStoryTransitionNode | ChangeStoryTerminalNode;

export interface ChangeStory {
  nodes: ChangeStoryNode[];
  retainedEvaluations: number;
  collapsedEvaluations: number;
  partialHistory: boolean;
  truncated: boolean;
}

function evidenceHealth(summary: EvaluationSummaryV1): EvidenceHealthV1 {
  const evidence = summary.evidenceSummary;
  if (evidence.failed > 0) return 'FAILED';
  if (evidence.pending > 0 || evidence.missing > 0) return 'PENDING_OR_MISSING';
  if (evidence.unknown > 0 && evidence.passed === 0) return 'UNKNOWN';
  return 'CLEAR';
}

function evidenceHealthCopy(health: EvidenceHealthV1): string {
  if (health === 'CLEAR') return 'clear evidence';
  if (health === 'FAILED') return 'failed evidence';
  if (health === 'PENDING_OR_MISSING') return 'pending or missing evidence';
  return 'unknown evidence';
}

function evidenceStatusCopy(status: string | undefined): string {
  if (!status) return 'not present';
  return status.toLowerCase().replaceAll('_', ' ');
}

function runIdentity(run: EvaluationSummaryV1): string {
  return run.runId ?? `${run.headSha}:${run.evaluatedAt}`;
}

function transitionTargetRun(transition: NotableTransitionV1, runs: EvaluationSummaryV1[]): EvaluationSummaryV1 | undefined {
  return runs.find((run) => run.runId === transition.toRunId)
    ?? runs.find((run) => run.headSha === transition.delta.toHeadSha && run.evaluatedAt === transition.occurredAt)
    ?? runs.find((run) => run.headSha === transition.delta.toHeadSha);
}

export function transitionHeadline(transition: NotableTransitionV1): string {
  const attention = transition.delta.attention;
  if (attention) {
    return attention.direction === 'INCREASED'
      ? `Attention increased to ${attention.to}`
      : `Attention decreased to ${attention.to}`;
  }

  if (transition.kinds.includes('EVIDENCE_REGRESSED')) return 'Evidence regressed';
  if (transition.kinds.includes('EVIDENCE_RECOVERED')) return 'Evidence recovered';
  if (transition.kinds.includes('EVIDENCE_BECAME_PENDING')) return 'Evidence became pending or missing';
  if (transition.kinds.includes('EVIDENCE_RESOLVED')) return 'Evidence issue resolved';
  if (transition.kinds.includes('SENSITIVE_SURFACE_ADDED')) return 'Sensitive surface added';
  if (transition.kinds.includes('CHANGE_SCOPE_EXPANDED')) return 'Change scope expanded';
  return 'Notable change observed';
}

export function transitionCauses(transition: NotableTransitionV1): string[] {
  const { delta } = transition;
  const causes: string[] = [];

  for (const item of delta.evidence) {
    if (item.change === 'ADDED') causes.push(`${item.name} added as ${evidenceStatusCopy(item.to)}`);
    else if (item.change === 'REMOVED') causes.push(`${item.name} removed`);
    else causes.push(`${item.name}: ${evidenceStatusCopy(item.from)} → ${evidenceStatusCopy(item.to)}`);
  }

  if (delta.sensitiveSurfaces.added.length) causes.push(`Sensitive surface added: ${delta.sensitiveSurfaces.added.join(', ')}`);
  if (delta.areas.directAdded.length) causes.push(`Direct area added: ${delta.areas.directAdded.join(', ')}`);
  if (delta.areas.affectedAdded.length) causes.push(`Affected area added: ${delta.areas.affectedAdded.join(', ')}`);
  if (delta.changedFiles.added.length) causes.push(`Change scope added ${delta.changedFiles.added.length} file${delta.changedFiles.added.length === 1 ? '' : 's'}`);
  for (const reason of delta.reasons.added.slice(0, 2)) causes.push(reason);
  if (delta.detailCompleteness === 'PARTIAL') causes.push('Structured detail is incomplete for this boundary');

  return [...new Set(causes)];
}

export function terminalOutcome(lifecycle: PullRequestLifecycleV1): ChangeStoryTerminalNode['headline'] {
  if (lifecycle.state === 'CLOSED') return 'Closed without merge';
  if (lifecycle.state !== 'MERGED') return 'Merge outcome unavailable';
  if (lifecycle.unresolvedAtMerge === false) return 'Resolved before merge';
  if (lifecycle.unresolvedAtMerge === true) return 'Merged with unresolved attention';
  return 'Merge outcome unavailable';
}

function terminalDetail(lifecycle: PullRequestLifecycleV1): string {
  if (lifecycle.state === 'CLOSED') return 'The pull request closed without a recorded merge.';
  if (!lifecycle.preMergeRunId || !lifecycle.preMergeEvidenceHealth) {
    return 'No Spark evaluation was available at or before merge.';
  }
  return `Selected pre-merge observation was ${lifecycle.preMergeAttention ?? 'unknown attention'} with ${evidenceHealthCopy(lifecycle.preMergeEvidenceHealth)}.`;
}

function terminalAt(lifecycle: PullRequestLifecycleV1): string {
  return lifecycle.mergedAt ?? lifecycle.closedAt ?? lifecycle.lastEventAt;
}

function elapsedBetween(previousAt: string | undefined, currentAt: string): number {
  if (!previousAt) return 0;
  const previous = Date.parse(previousAt);
  const current = Date.parse(currentAt);
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return 0;
  return Math.max(0, current - previous);
}

export function formatStoryDuration(ms: number): string {
  if (ms < 60_000) return '<1m';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d${hours ? ` ${hours}h` : ''}`;
  if (hours > 0) return `${hours}h${minutes ? ` ${minutes}m` : ''}`;
  return `${minutes}m`;
}

export function deriveChangeStory(detail: PullRequestTrajectoryV1): ChangeStory {
  const runs = [...detail.runs].sort((a, b) => {
    const byTime = Date.parse(a.evaluatedAt) - Date.parse(b.evaluatedAt);
    if (byTime !== 0) return byTime;
    return runIdentity(a).localeCompare(runIdentity(b));
  });
  if (!runs.length) runs.push(detail.current);

  const oldest = runs[0];
  const newest = runs[runs.length - 1];
  const nodes: ChangeStoryNode[] = [];
  const representedRuns = new Set<string>();

  nodes.push({
    id: `initial:${runIdentity(oldest)}`,
    kind: 'INITIAL',
    at: oldest.evaluatedAt,
    elapsedMs: 0,
    attention: oldest.attention,
    evidenceHealth: evidenceHealth(oldest),
    run: oldest,
    headline: 'Initial Spark evaluation',
    detail: oldest.topReasons[0] ?? evidenceHealthCopy(evidenceHealth(oldest)),
  });
  representedRuns.add(runIdentity(oldest));

  const transitions = [...detail.notableTransitions].sort((a, b) => {
    const byTime = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });

  let previousAt = oldest.evaluatedAt;
  for (const transition of transitions) {
    const run = transitionTargetRun(transition, runs);
    const attention = transition.delta.attention?.to ?? run?.attention;
    const health = transition.delta.evidenceHealth?.to ?? (run ? evidenceHealth(run) : undefined);
    const node: ChangeStoryTransitionNode = {
      id: `transition:${transition.id}`,
      kind: 'TRANSITION',
      at: transition.occurredAt,
      elapsedMs: transition.delta.timeInPreviousStateMs || elapsedBetween(previousAt, transition.occurredAt),
      ...(attention ? { attention } : {}),
      ...(health ? { evidenceHealth: health } : {}),
      transition,
      ...(run ? { run } : {}),
      headline: transitionHeadline(transition),
      causes: transitionCauses(transition),
      latest: Boolean(run && runIdentity(run) === runIdentity(newest)),
    };
    nodes.push(node);
    if (run) representedRuns.add(runIdentity(run));
    previousAt = transition.occurredAt;
  }

  if (!representedRuns.has(runIdentity(newest))) {
    nodes.push({
      id: `latest:${runIdentity(newest)}`,
      kind: 'LATEST',
      at: newest.evaluatedAt,
      elapsedMs: elapsedBetween(previousAt, newest.evaluatedAt),
      attention: newest.attention,
      evidenceHealth: evidenceHealth(newest),
      run: newest,
      headline: 'Latest observed state',
      detail: newest.topReasons[0] ?? evidenceHealthCopy(evidenceHealth(newest)),
    });
    representedRuns.add(runIdentity(newest));
    previousAt = newest.evaluatedAt;
  }

  const lifecycle = detail.lifecycle;
  if (lifecycle && lifecycle.state !== 'OPEN') {
    const at = terminalAt(lifecycle);
    nodes.push({
      id: `terminal:${lifecycle.state}:${at}`,
      kind: 'TERMINAL',
      at,
      elapsedMs: elapsedBetween(previousAt, at),
      ...(lifecycle.preMergeAttention ? { attention: lifecycle.preMergeAttention } : {}),
      ...(lifecycle.preMergeEvidenceHealth ? { evidenceHealth: lifecycle.preMergeEvidenceHealth } : {}),
      lifecycle,
      headline: terminalOutcome(lifecycle),
      detail: terminalDetail(lifecycle),
    });
  }

  return {
    nodes,
    retainedEvaluations: detail.runs.length,
    collapsedEvaluations: Math.max(0, detail.runs.length - representedRuns.size),
    partialHistory: detail.historyCompleteness === 'PARTIAL_BACKFILL',
    truncated: detail.truncated,
  };
}
