import type {
    PipelineRunObservation,
    ProcessLifecycle,
    RepositoryId,
    RepositoryUnderstanding,
    RevisionId,
} from './understanding';
import type { ProcessObservationRecord } from './process-observation';

/**
 * Point-in-time reconstruction of a repository revision's CI/CD process
 * state from retained observation records (CI-604).
 *
 * The reconstruction answers "what did Spark know about this revision as of
 * time T", never "what was true". It is built only from records of the same
 * repository and exact revision with `observedAt <= T`; terminal execution
 * facts (COMPLETED/CANCELLED) are monotonic across records, so a completed
 * execution can never become un-completed, and executions known from older
 * complete acquisitions stay known when a newer partial acquisition misses
 * them.
 */
export interface ProcessStateReconstruction {
    repositoryId: RepositoryId;
    revision: RevisionId;
    /** Query time T. */
    at: string;
    state: 'NO_OBSERVATION' | 'RECONSTRUCTED';
    /** Merged understanding of the revision as known at T. */
    understanding?: RepositoryUnderstanding;
    /** Record supplying the primary (latest) state. */
    supplyingRecordId?: string;
    supplyingObservedAt?: string;
    /** Observation time of the previous candidate, when one exists (the gap before the supply). */
    priorObservedAt?: string;
    /** Observations of this revision made after T; their content is deliberately not used. */
    subsequentObservationCount: number;
    /** Execution ids whose terminal state came from an older record than the primary one. */
    retainedTerminalFacts: string[];
    notes: string[];
}

export interface ProcessStateReconstructionInput {
    repositoryId: string;
    revision: string;
    /** Time T for the reconstruction, ISO-8601. */
    at: string;
}

const TERMINAL_LIFECYCLES = new Set<ProcessLifecycle>(['COMPLETED', 'CANCELLED']);

function isTerminal(lifecycle: ProcessLifecycle): boolean {
    return TERMINAL_LIFECYCLES.has(lifecycle);
}

function timeKey(value: string): number | undefined {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
}

/** Newer observations first; deterministic tie-breaks by ingestion time, then identity. */
function byNewestObservation(
    a: ProcessObservationRecord,
    b: ProcessObservationRecord,
): number {
    const aObserved = timeKey(a.observedAt) ?? Number.NEGATIVE_INFINITY;
    const bObserved = timeKey(b.observedAt) ?? Number.NEGATIVE_INFINITY;
    if (aObserved !== bObserved) return aObserved < bObserved ? 1 : -1;
    const aIngested = timeKey(a.ingestedAt) ?? Number.NEGATIVE_INFINITY;
    const bIngested = timeKey(b.ingestedAt) ?? Number.NEGATIVE_INFINITY;
    if (aIngested !== bIngested) return aIngested < bIngested ? 1 : -1;
    return b.recordId.localeCompare(a.recordId);
}

interface ExecutionLike {
    id: string;
    lifecycle: ProcessLifecycle;
}

/**
 * Ensures the ancestry of `execution` exists in `merged` by transplanting it
 * from the same record's understanding, so a retained terminal fact always
 * arrives with a coherent run/attempt/job/step chain.
 */
function ensureAncestry(
    merged: RepositoryUnderstanding,
    older: RepositoryUnderstanding,
    execution: {
        id: string;
        kind: string;
        pipelineRunId?: string;
        pipelineAttemptId?: string;
        pipelineJobId?: string;
        pipelineStepId?: string;
    },
    retained: Set<string>,
): void {
    const mergedObservations = merged.observations;
    const olderObservations = older.observations;
    const step = execution.pipelineStepId
        ? olderObservations.pipelineSteps.find(candidate => candidate.id === execution.pipelineStepId)
        : undefined;
    const pipelineJobId = execution.pipelineJobId ?? step?.pipelineJobId;
    const job = pipelineJobId
        ? olderObservations.pipelineJobs.find(candidate => candidate.id === pipelineJobId)
        : undefined;
    const pipelineAttemptId = execution.pipelineAttemptId ?? job?.pipelineAttemptId;
    const attempt = pipelineAttemptId
        ? olderObservations.pipelineAttempts.find(candidate => candidate.id === pipelineAttemptId)
        : undefined;
    const pipelineRunId = execution.pipelineRunId ?? attempt?.pipelineRunId;
    const run: PipelineRunObservation | undefined = pipelineRunId
        ? olderObservations.pipelineRuns.find(candidate => candidate.id === pipelineRunId)
        : undefined;

    // Add the complete chain from the root down. An ancestor can still be
    // non-terminal while a child step is terminal, so ancestry retention is
    // deliberately independent from terminal-fact retention.
    if (run && !mergedObservations.pipelineRuns.some(candidate => candidate.id === run.id)) {
        mergedObservations.pipelineRuns.push(structuredClone(run));
    }
    if (attempt && !mergedObservations.pipelineAttempts.some(candidate => candidate.id === attempt.id)) {
        mergedObservations.pipelineAttempts.push(structuredClone(attempt));
        if (isTerminal(attempt.lifecycle)) retained.add(attempt.id);
    }
    if (job && !mergedObservations.pipelineJobs.some(candidate => candidate.id === job.id)) {
        mergedObservations.pipelineJobs.push(structuredClone(job));
        if (isTerminal(job.lifecycle)) retained.add(job.id);
    }
    if (step && !mergedObservations.pipelineSteps.some(candidate => candidate.id === step.id)) {
        mergedObservations.pipelineSteps.push(structuredClone(step));
        if (isTerminal(step.lifecycle)) retained.add(step.id);
    }
}

/**
 * Terminal monotonicity merge for one execution: if the merged state does
 * not know the execution, the terminal fact from the older record is added
 * (sticky knowledge); if it knows the execution only non-terminally, the
 * older terminal state supersedes the stale snapshot. Terminal entries
 * already present in the merged state are left untouched.
 */
function mergeTerminalExecution<T extends ExecutionLike>(
    mergedCollection: T[],
    olderEntry: T,
    merged: RepositoryUnderstanding,
    older: RepositoryUnderstanding,
    ref: TerminalExecutionRef,
    retained: Set<string>,
): void {
    if (!isTerminal(olderEntry.lifecycle)) return;
    const existing = mergedCollection.find(candidate => candidate.id === olderEntry.id);
    if (existing === undefined) {
        mergedCollection.push(structuredClone(olderEntry));
        retained.add(olderEntry.id);
    } else if (!isTerminal(existing.lifecycle)) {
        const index = mergedCollection.findIndex(candidate => candidate.id === olderEntry.id);
        mergedCollection[index] = structuredClone(olderEntry);
        retained.add(olderEntry.id);
    }
    ensureAncestry(merged, older, ref, retained);
}

interface TerminalExecutionRef {
    id: string;
    kind: string;
    pipelineRunId?: string;
    pipelineAttemptId?: string;
    pipelineJobId?: string;
    pipelineStepId?: string;
}

/**
 * Reconstructs the process state of one revision at one time.
 *
 * Records are expected to be the deduplicated log of one repository (or a
 * larger log; repository and exact revision are filtered here). The primary
 * state comes from the latest observation at or before T; older observations
 * contribute only terminal execution facts, which are monotonic and sticky.
 */
export function reconstructProcessState(
    records: readonly ProcessObservationRecord[],
    input: ProcessStateReconstructionInput,
): ProcessStateReconstruction {
    const at = timeKey(input.at);
    const revisionRecords = records.filter(
        record => record.repositoryId === input.repositoryId && record.revision === input.revision,
    );
    const candidates = at === undefined
        ? []
        : revisionRecords
            .filter(record => (timeKey(record.observedAt) ?? Number.POSITIVE_INFINITY) <= at)
            .sort(byNewestObservation);
    const subsequentObservationCount = at === undefined
        ? 0
        : revisionRecords.filter(record => {
            const observed = timeKey(record.observedAt);
            return observed !== undefined && observed > at;
        }).length;

    const base: ProcessStateReconstruction = {
        repositoryId: input.repositoryId,
        revision: input.revision,
        at: input.at,
        state: 'NO_OBSERVATION',
        subsequentObservationCount,
        retainedTerminalFacts: [],
        notes: [],
    };
    if (at === undefined) {
        base.notes.push('query time is not parseable; no observation can be bounded by it');
        return base;
    }
    if (candidates.length === 0) {
        base.notes.push('no observation of this repository revision at or before the query time');
        return base;
    }

    const [primary, ...olderRecords] = candidates;
    const merged: RepositoryUnderstanding = structuredClone(primary.understanding);
    const retained = new Set<string>();
    for (const older of olderRecords) {
        const olderUnderstanding = older.understanding;
        for (const attempt of olderUnderstanding.observations.pipelineAttempts) {
            mergeTerminalExecution(merged.observations.pipelineAttempts, attempt, merged, olderUnderstanding,
                { id: attempt.id, kind: 'pipeline-attempt', pipelineRunId: attempt.pipelineRunId }, retained);
        }
        for (const job of olderUnderstanding.observations.pipelineJobs) {
            mergeTerminalExecution(merged.observations.pipelineJobs, job, merged, olderUnderstanding,
                { id: job.id, kind: 'pipeline-job', pipelineAttemptId: job.pipelineAttemptId }, retained);
        }
        for (const step of olderUnderstanding.observations.pipelineSteps) {
            mergeTerminalExecution(merged.observations.pipelineSteps, step, merged, olderUnderstanding,
                { id: step.id, kind: 'pipeline-step', pipelineJobId: step.pipelineJobId }, retained);
        }
        for (const evidenceRun of olderUnderstanding.observations.evidenceRuns) {
            mergeTerminalExecution(merged.observations.evidenceRuns, evidenceRun, merged, olderUnderstanding, {
                id: evidenceRun.id,
                kind: 'evidence-run',
                pipelineRunId: evidenceRun.pipelineRunId,
                pipelineAttemptId: evidenceRun.pipelineAttemptId,
                pipelineJobId: evidenceRun.pipelineJobId,
                pipelineStepId: evidenceRun.pipelineStepId,
            }, retained);
        }
    }

    const result: ProcessStateReconstruction = {
        ...base,
        state: 'RECONSTRUCTED',
        understanding: merged,
        supplyingRecordId: primary.recordId,
        supplyingObservedAt: primary.observedAt,
        priorObservedAt: olderRecords.length > 0 ? olderRecords[0].observedAt : undefined,
        retainedTerminalFacts: [...retained].sort(),
        notes: [],
    };
    if (primary.truncation.truncated) {
        result.notes.push(`primary observation payload was truncated: ${primary.truncation.fields.join(', ')}`);
    }
    if (olderRecords.length > 0) {
        result.notes.push(`${String(olderRecords.length)} older observation(s) contributed retained terminal facts`);
    }
    if (subsequentObservationCount > 0) {
        result.notes.push(`${String(subsequentObservationCount)} later observation(s) exist and are not used by this reconstruction`);
    }
    return result;
}
