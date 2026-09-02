import type {
  BehaviorBoundaryV1,
  BehaviorEventKindV1,
  BehaviorMotifKindV1,
  BehaviorMotifOccurrenceV1,
} from '@spark/dashboard-contracts/behavior';

function has(boundary: BehaviorBoundaryV1, kind: BehaviorEventKindV1): boolean {
  return boundary.kinds.includes(kind);
}

function durationMs(startedAt: string, endedAt: string): number {
  const duration = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}

function occurrence(
  kind: BehaviorMotifKindV1,
  boundaries: BehaviorBoundaryV1[],
): BehaviorMotifOccurrenceV1 {
  const transitionIds = boundaries.map((boundary) => boundary.transitionId);
  const startedAt = boundaries[0].occurredAt;
  const endedAt = boundaries[boundaries.length - 1].occurredAt;
  return {
    id: `${kind}:${transitionIds.join(':')}`,
    kind,
    startedAt,
    endedAt,
    durationMs: durationMs(startedAt, endedAt),
    transitionIds,
  };
}

function pairedUntilNext(
  boundaries: BehaviorBoundaryV1[],
  startKind: BehaviorEventKindV1,
  endKind: BehaviorEventKindV1,
  motifKind: BehaviorMotifKindV1,
): BehaviorMotifOccurrenceV1[] {
  const matches: BehaviorMotifOccurrenceV1[] = [];
  for (let index = 0; index < boundaries.length; index += 1) {
    if (!has(boundaries[index], startKind)) continue;
    for (let next = index + 1; next < boundaries.length; next += 1) {
      if (has(boundaries[next], endKind)) {
        matches.push(occurrence(motifKind, [boundaries[index], boundaries[next]]));
        break;
      }
      if (has(boundaries[next], startKind)) break;
    }
  }
  return matches;
}

function attentionOscillations(boundaries: BehaviorBoundaryV1[]): BehaviorMotifOccurrenceV1[] {
  const attention = boundaries.filter((boundary) =>
    has(boundary, 'ATTENTION_UP') || has(boundary, 'ATTENTION_DOWN'));
  const matches: BehaviorMotifOccurrenceV1[] = [];
  for (let index = 0; index + 2 < attention.length; index += 1) {
    const directions = attention.slice(index, index + 3).map((boundary) =>
      has(boundary, 'ATTENTION_UP') ? 'UP' : 'DOWN');
    if (directions[0] !== directions[1] && directions[1] !== directions[2]) {
      matches.push(occurrence('ATTENTION_OSCILLATION', attention.slice(index, index + 3)));
    }
  }
  return matches;
}

export function deriveBehaviorMotifs(boundaries: BehaviorBoundaryV1[]): BehaviorMotifOccurrenceV1[] {
  return [
    ...pairedUntilNext(
      boundaries,
      'EVIDENCE_WORSE',
      'EVIDENCE_BETTER',
      'REGRESSION_THEN_RECOVERY',
    ),
    ...pairedUntilNext(
      boundaries,
      'SCOPE_EXPANDED',
      'EVIDENCE_WORSE',
      'SCOPE_THEN_REGRESSION',
    ),
    ...pairedUntilNext(
      boundaries,
      'SENSITIVE_SURFACE_ADDED',
      'ATTENTION_UP',
      'SURFACE_THEN_ATTENTION_UP',
    ),
    ...attentionOscillations(boundaries),
  ].sort((left, right) => {
    const time = left.startedAt.localeCompare(right.startedAt);
    return time !== 0 ? time : left.id.localeCompare(right.id);
  });
}
