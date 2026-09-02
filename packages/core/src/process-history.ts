import { canonicalJson } from './process-export';
import { currentEvidenceRuns, evidenceProcessIdentity } from './evidence-matching';
import {
    classifyProcessFailureDomain,
    deriveProcessInsights,
    type FailureDomain,
} from './process-insight';
import {
    normalizeProcessObservation,
    type ProcessObservationRecord,
} from './process-observation';
import type {
    ClaimSupport,
    EvidenceRunObservation,
    PipelineJobObservation,
    ProcessLifecycle,
    ProcessOutcome,
    RepositoryUnderstanding,
} from './understanding';

export interface ProcessHistoryLimits {
    /** Most recent deduplicated records retained for analysis. */
    maxRecords: number;
    /** Maximum subject baselines returned, including the repository-wide baseline. */
    maxBaselines: number;
    /** Minimum terminal executions required before a rate value is published. */
    minimumRateDenominator: number;
    /** Minimum valid durations required before median/p90 values are published. */
    minimumDurationSamples: number;
    maxFlakeRecoveries: number;
    maxFailureFingerprints: number;
    maxProcessRelationships: number;
    maxDriftSignals: number;
}

export const DEFAULT_PROCESS_HISTORY_LIMITS: ProcessHistoryLimits = {
    maxRecords: 10_000,
    maxBaselines: 500,
    minimumRateDenominator: 5,
    minimumDurationSamples: 5,
    maxFlakeRecoveries: 500,
    maxFailureFingerprints: 500,
    maxProcessRelationships: 1_000,
    maxDriftSignals: 500,
};

export interface HistoricalRate {
    count: number;
    denominator: number;
    /** Omitted when the declared minimum denominator is not met. */
    value?: number;
    sufficientHistory: boolean;
}

export interface HistoricalDurationDistribution {
    sampleCount: number;
    excludedCount: number;
    /** Omitted until `minimumDurationSamples` valid durations exist. */
    medianMs?: number;
    /** Nearest-rank p90, omitted until sufficient history exists. */
    p90Ms?: number;
    sufficientHistory: boolean;
}

export interface HistoricalRetryRate {
    retriedRunCount: number;
    runDenominator: number;
    /** Omitted when the declared minimum denominator is not met. */
    value?: number;
    sufficientHistory: boolean;
}

export type RuntimeBaselineSubject =
    | { kind: 'REPOSITORY'; id: string }
    | { kind: 'PIPELINE_DEFINITION'; id: string }
    | { kind: 'LOGICAL_JOB'; id: string; pipelineDefinitionId?: string; logicalJobId: string };

export interface RuntimeBaseline {
    id: string;
    subject: RuntimeBaselineSubject;
    executionCount: number;
    terminalCount: number;
    nonTerminalCount: number;
    success: HistoricalRate;
    failure: HistoricalRate;
    neutral: HistoricalRate;
    skipped: HistoricalRate;
    unclassifiedTerminalCount: number;
    duration: HistoricalDurationDistribution;
    retry: HistoricalRetryRate;
}

export interface ProcessHistoryTruncation {
    collection: string;
    observedCount: number;
    retainedCount: number;
}

export interface ProcessHistoryWindow {
    inputRecordCount: number;
    matchingRepositoryRecordCount: number;
    deduplicatedRecordCount: number;
    droppedDuplicateCount: number;
    retainedRecordCount: number;
    distinctRevisionCount: number;
    oldestObservedAt?: string;
    newestObservedAt?: string;
    invalidObservedAtCount: number;
    incoherentRecordCount: number;
    truncatedPayloadRecordCount: number;
    normalizationIssueCount: number;
}

export interface ProcessRuntimeBaselineReport {
    schemaVersion: 'process-runtime-baselines/v1';
    repositoryId: string;
    window: ProcessHistoryWindow;
    limits: ProcessHistoryLimits;
    baselines: RuntimeBaseline[];
    completeness: 'COMPLETE' | 'PARTIAL';
    truncation: ProcessHistoryTruncation[];
}

interface RetainedRecord {
    record: ProcessObservationRecord;
    observedTime?: number;
    normalizationIssueCount: number;
}

interface HistoricalJobSample {
    id: string;
    recordId: string;
    observedAt: string;
    observedTime?: number;
    revision: string;
    pipelineRunId: string;
    pipelineDefinitionId?: string;
    pipelineAttemptId: string;
    attempt: number;
    logicalJobId?: string;
    name: string;
    matrix?: Record<string, string | number | boolean>;
    lifecycle: ProcessLifecycle;
    outcome: ProcessOutcome;
    startedAt?: string;
    completedAt?: string;
}

interface HistoricalWindowData {
    records: RetainedRecord[];
    jobs: HistoricalJobSample[];
    window: ProcessHistoryWindow;
    truncation: ProcessHistoryTruncation[];
}

function parseTime(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function recordOrder(a: ProcessObservationRecord, b: ProcessObservationRecord): number {
    const aObserved = parseTime(a.observedAt) ?? Number.NEGATIVE_INFINITY;
    const bObserved = parseTime(b.observedAt) ?? Number.NEGATIVE_INFINITY;
    if (aObserved !== bObserved) return aObserved - bObserved;
    const aIngested = parseTime(a.ingestedAt) ?? Number.NEGATIVE_INFINITY;
    const bIngested = parseTime(b.ingestedAt) ?? Number.NEGATIVE_INFINITY;
    if (aIngested !== bIngested) return aIngested - bIngested;
    return a.recordId.localeCompare(b.recordId);
}

/**
 * Selects one copy per record identity without depending on caller order.
 * The earliest durable ingestion is the retained first arrival; canonical
 * bytes break malformed same-time ties deterministically.
 */
function deduplicateRecords(records: readonly ProcessObservationRecord[]): {
    records: ProcessObservationRecord[];
    droppedCount: number;
} {
    const grouped = new Map<string, ProcessObservationRecord[]>();
    for (const record of records) grouped.set(record.recordId, [...(grouped.get(record.recordId) ?? []), record]);
    const retained = [...grouped.values()].map(copies => copies.sort((a, b) => {
        const aIngested = parseTime(a.ingestedAt) ?? Number.POSITIVE_INFINITY;
        const bIngested = parseTime(b.ingestedAt) ?? Number.POSITIVE_INFINITY;
        if (aIngested !== bIngested) return aIngested - bIngested;
        return canonicalJson(a).localeCompare(canonicalJson(b));
    })[0]);
    return { records: retained.sort(recordOrder), droppedCount: records.length - retained.length };
}

function coherentEnvelope(record: ProcessObservationRecord, understanding: RepositoryUnderstanding): boolean {
    const change = understanding.observations.change;
    return change.repositoryId === record.repositoryId && change.headRevision === record.revision;
}

function terminal(lifecycle: ProcessLifecycle): boolean {
    return lifecycle === 'COMPLETED' || lifecycle === 'CANCELLED';
}

function chooseJobSample(
    current: HistoricalJobSample | undefined,
    candidate: HistoricalJobSample,
): HistoricalJobSample {
    if (!current) return candidate;
    if (terminal(candidate.lifecycle) && !terminal(current.lifecycle)) return candidate;
    if (terminal(current.lifecycle) && !terminal(candidate.lifecycle)) return current;
    const currentTime = current.observedTime ?? Number.NEGATIVE_INFINITY;
    const candidateTime = candidate.observedTime ?? Number.NEGATIVE_INFINITY;
    if (candidateTime !== currentTime) return candidateTime > currentTime ? candidate : current;
    return candidate.recordId.localeCompare(current.recordId) > 0 ? candidate : current;
}

function jobSamples(records: readonly RetainedRecord[]): HistoricalJobSample[] {
    const samples = new Map<string, HistoricalJobSample>();
    for (const retained of records) {
        const { record } = retained;
        const observations = record.understanding.observations;
        const runs = new Map(observations.pipelineRuns.map(run => [run.id, run]));
        const attempts = new Map(observations.pipelineAttempts.map(attempt => [attempt.id, attempt]));
        for (const job of observations.pipelineJobs) {
            const attempt = attempts.get(job.pipelineAttemptId);
            const run = attempt ? runs.get(attempt.pipelineRunId) : undefined;
            if (!attempt || !run || run.repositoryId !== record.repositoryId || run.revision !== record.revision) continue;
            const candidate: HistoricalJobSample = {
                id: job.id,
                recordId: record.recordId,
                observedAt: record.observedAt,
                observedTime: retained.observedTime,
                revision: record.revision,
                pipelineRunId: run.id,
                pipelineDefinitionId: run.pipelineDefinitionId,
                pipelineAttemptId: attempt.id,
                attempt: attempt.attempt,
                logicalJobId: job.logicalJobId,
                name: job.name,
                matrix: job.matrix ? { ...job.matrix } : undefined,
                lifecycle: job.lifecycle,
                outcome: job.outcome,
                startedAt: job.startedAt,
                completedAt: job.completedAt,
            };
            samples.set(job.id, chooseJobSample(samples.get(job.id), candidate));
        }
    }
    return [...samples.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function buildHistoricalWindow(
    input: readonly ProcessObservationRecord[],
    repositoryId: string,
    limits: ProcessHistoryLimits,
): HistoricalWindowData {
    const matching = input.filter(record => record.repositoryId === repositoryId);
    const deduplicated = deduplicateRecords(matching);
    const maxRecords = Math.max(0, limits.maxRecords);
    const selected = deduplicated.records.slice(Math.max(0, deduplicated.records.length - maxRecords));
    const truncation: ProcessHistoryTruncation[] = [];
    if (selected.length < deduplicated.records.length) truncation.push({
        collection: 'records', observedCount: deduplicated.records.length, retainedCount: selected.length,
    });
    let incoherentRecordCount = 0;
    let normalizationIssueCount = 0;
    const records: RetainedRecord[] = [];
    for (const raw of selected) {
        const normalized = normalizeProcessObservation(raw);
        const issueCount = normalized.issues.length + normalized.payloadIssues.length;
        normalizationIssueCount += issueCount;
        if (!coherentEnvelope(normalized.record, normalized.record.understanding)) {
            incoherentRecordCount += 1;
            continue;
        }
        records.push({ record: normalized.record, observedTime: parseTime(normalized.record.observedAt), normalizationIssueCount: issueCount });
    }
    const validObserved = records.filter(item => item.observedTime !== undefined);
    return {
        records,
        jobs: jobSamples(records),
        truncation,
        window: {
            inputRecordCount: input.length,
            matchingRepositoryRecordCount: matching.length,
            deduplicatedRecordCount: deduplicated.records.length,
            droppedDuplicateCount: deduplicated.droppedCount,
            retainedRecordCount: records.length,
            distinctRevisionCount: new Set(records.map(item => item.record.revision)).size,
            oldestObservedAt: validObserved[0]?.record.observedAt,
            newestObservedAt: validObserved.at(-1)?.record.observedAt,
            invalidObservedAtCount: records.length - validObserved.length,
            incoherentRecordCount,
            truncatedPayloadRecordCount: records.filter(item => item.record.truncation.truncated).length,
            normalizationIssueCount,
        },
    };
}

function rate(count: number, denominator: number, minimum: number): HistoricalRate {
    const sufficientHistory = denominator >= minimum;
    return {
        count,
        denominator,
        ...(sufficientHistory && denominator > 0 ? { value: count / denominator } : {}),
        sufficientHistory,
    };
}

function median(sorted: readonly number[]): number {
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function durationDistribution(
    jobs: readonly HistoricalJobSample[],
    minimum: number,
): HistoricalDurationDistribution {
    const terminalJobs = jobs.filter(job => terminal(job.lifecycle));
    const durations = terminalJobs.flatMap(job => {
        const started = parseTime(job.startedAt);
        const completed = parseTime(job.completedAt);
        return started !== undefined && completed !== undefined && completed >= started ? [completed - started] : [];
    }).sort((a, b) => a - b);
    const sufficientHistory = durations.length >= minimum;
    return {
        sampleCount: durations.length,
        excludedCount: terminalJobs.length - durations.length,
        ...(sufficientHistory ? {
            medianMs: median(durations),
            p90Ms: durations[Math.max(0, Math.ceil(0.9 * durations.length) - 1)],
        } : {}),
        sufficientHistory,
    };
}

function retryRate(jobs: readonly HistoricalJobSample[], minimum: number): HistoricalRetryRate {
    const attemptsByRun = new Map<string, Set<number>>();
    for (const job of jobs) {
        const attempts = attemptsByRun.get(job.pipelineRunId) ?? new Set<number>();
        attempts.add(job.attempt);
        attemptsByRun.set(job.pipelineRunId, attempts);
    }
    const runDenominator = attemptsByRun.size;
    const retriedRunCount = [...attemptsByRun.values()].filter(attempts => attempts.size > 1).length;
    const sufficientHistory = runDenominator >= minimum;
    return {
        retriedRunCount,
        runDenominator,
        ...(sufficientHistory && runDenominator > 0 ? { value: retriedRunCount / runDenominator } : {}),
        sufficientHistory,
    };
}

function baseline(
    id: string,
    subject: RuntimeBaselineSubject,
    jobs: readonly HistoricalJobSample[],
    limits: ProcessHistoryLimits,
): RuntimeBaseline {
    const terminalJobs = jobs.filter(job => terminal(job.lifecycle));
    const denominator = terminalJobs.length;
    const outcomeCount = (outcome: ProcessOutcome) => terminalJobs.filter(job => job.outcome === outcome).length;
    const classified = ['PASSED', 'FAILED', 'NEUTRAL', 'SKIPPED']
        .reduce((count, outcome) => count + outcomeCount(outcome as ProcessOutcome), 0);
    return {
        id,
        subject,
        executionCount: jobs.length,
        terminalCount: denominator,
        nonTerminalCount: jobs.length - denominator,
        success: rate(outcomeCount('PASSED'), denominator, limits.minimumRateDenominator),
        failure: rate(outcomeCount('FAILED'), denominator, limits.minimumRateDenominator),
        neutral: rate(outcomeCount('NEUTRAL'), denominator, limits.minimumRateDenominator),
        skipped: rate(outcomeCount('SKIPPED'), denominator, limits.minimumRateDenominator),
        unclassifiedTerminalCount: denominator - classified,
        duration: durationDistribution(jobs, limits.minimumDurationSamples),
        retry: retryRate(jobs, limits.minimumRateDenominator),
    };
}

function runtimeBaselines(
    repositoryId: string,
    jobs: readonly HistoricalJobSample[],
    limits: ProcessHistoryLimits,
): RuntimeBaseline[] {
    const baselines: RuntimeBaseline[] = [baseline(
        `runtime-baseline:repository:${repositoryId}`,
        { kind: 'REPOSITORY', id: repositoryId },
        jobs,
        limits,
    )];
    const byDefinition = new Map<string, HistoricalJobSample[]>();
    const byLogicalJob = new Map<string, HistoricalJobSample[]>();
    for (const job of jobs) {
        if (job.pipelineDefinitionId) {
            byDefinition.set(job.pipelineDefinitionId, [...(byDefinition.get(job.pipelineDefinitionId) ?? []), job]);
        }
        if (job.logicalJobId) {
            const key = `${job.pipelineDefinitionId ?? 'unknown'}\u0000${job.logicalJobId}`;
            byLogicalJob.set(key, [...(byLogicalJob.get(key) ?? []), job]);
        }
    }
    for (const [definitionId, samples] of [...byDefinition.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        baselines.push(baseline(
            `runtime-baseline:pipeline-definition:${definitionId}`,
            { kind: 'PIPELINE_DEFINITION', id: definitionId },
            samples,
            limits,
        ));
    }
    for (const [key, samples] of [...byLogicalJob.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const separator = key.indexOf('\u0000');
        const definitionId = key.slice(0, separator);
        const logicalJobId = key.slice(separator + 1);
        baselines.push(baseline(
            `runtime-baseline:logical-job:${definitionId}:${logicalJobId}`,
            {
                kind: 'LOGICAL_JOB', id: `${definitionId}:${logicalJobId}`,
                ...(definitionId !== 'unknown' ? { pipelineDefinitionId: definitionId } : {}),
                logicalJobId,
            },
            samples,
            limits,
        ));
    }
    return baselines;
}

/** CI-801 — bounded, denominator-bearing runtime baselines. */
export function deriveProcessRuntimeBaselines(
    records: readonly ProcessObservationRecord[],
    repositoryId: string,
    partialLimits: Partial<ProcessHistoryLimits> = {},
): ProcessRuntimeBaselineReport {
    const limits = { ...DEFAULT_PROCESS_HISTORY_LIMITS, ...partialLimits };
    const historical = buildHistoricalWindow(records, repositoryId, limits);
    const allBaselines = runtimeBaselines(repositoryId, historical.jobs, limits);
    const baselines = allBaselines.slice(0, Math.max(0, limits.maxBaselines));
    if (baselines.length < allBaselines.length) historical.truncation.push({
        collection: 'baselines', observedCount: allBaselines.length, retainedCount: baselines.length,
    });
    const partial = historical.truncation.length > 0
        || historical.window.incoherentRecordCount > 0
        || historical.window.truncatedPayloadRecordCount > 0
        || historical.window.normalizationIssueCount > 0;
    return {
        schemaVersion: 'process-runtime-baselines/v1',
        repositoryId,
        window: historical.window,
        limits,
        baselines,
        completeness: partial ? 'PARTIAL' : 'COMPLETE',
        truncation: historical.truncation.sort((a, b) => a.collection.localeCompare(b.collection)),
    };
}

export interface HistoricalFlakeRecovery {
    id: string;
    revision: string;
    pipelineRunId: string;
    pipelineDefinitionId?: string;
    logicalJobId: string;
    matrix: Record<string, string | number | boolean>;
    failedPipelineJobId: string;
    failedAttempt: number;
    passedPipelineJobId: string;
    passedAttempt: number;
    classification: 'SAME_REVISION_RETRY_RECOVERY';
    caveat: string;
}

export interface ProcessFlakeEvidenceReport {
    schemaVersion: 'process-flake-evidence/v1';
    repositoryId: string;
    window: ProcessHistoryWindow;
    eligibleRetrySequenceCount: number;
    recoveryCount: number;
    recoveryRate: HistoricalRate;
    recoveries: HistoricalFlakeRecovery[];
    completeness: 'COMPLETE' | 'PARTIAL';
    truncation: ProcessHistoryTruncation[];
}

function historyIsPartial(historical: HistoricalWindowData): boolean {
    return historical.truncation.length > 0
        || historical.window.incoherentRecordCount > 0
        || historical.window.truncatedPayloadRecordCount > 0
        || historical.window.normalizationIssueCount > 0;
}

/** CI-802 — measured same-revision retry recovery with an eligible-sequence denominator. */
export function deriveProcessFlakeEvidence(
    records: readonly ProcessObservationRecord[],
    repositoryId: string,
    partialLimits: Partial<ProcessHistoryLimits> = {},
): ProcessFlakeEvidenceReport {
    const limits = { ...DEFAULT_PROCESS_HISTORY_LIMITS, ...partialLimits };
    const historical = buildHistoricalWindow(records, repositoryId, limits);
    const groups = new Map<string, HistoricalJobSample[]>();
    for (const job of historical.jobs) {
        if (!job.logicalJobId) continue;
        const key = [
            job.revision,
            job.pipelineRunId,
            job.pipelineDefinitionId ?? 'unknown',
            job.logicalJobId,
            canonicalJson(job.matrix ?? {}),
        ].join('\u0000');
        groups.set(key, [...(groups.get(key) ?? []), job]);
    }
    const eligible = [...groups.values()].filter(samples =>
        new Set(samples.map(sample => sample.attempt)).size > 1);
    const allRecoveries: HistoricalFlakeRecovery[] = [];
    for (const samples of eligible) {
        const ordered = [...samples].sort((a, b) => a.attempt - b.attempt || a.id.localeCompare(b.id));
        const failure = ordered.find(sample => terminal(sample.lifecycle) && sample.outcome === 'FAILED');
        const recovery = failure
            ? ordered.find(sample => sample.attempt > failure.attempt
                && sample.lifecycle === 'COMPLETED' && sample.outcome === 'PASSED')
            : undefined;
        if (!failure || !recovery || !failure.logicalJobId) continue;
        allRecoveries.push({
            id: `flake-recovery:${failure.id}:${recovery.id}`,
            revision: failure.revision,
            pipelineRunId: failure.pipelineRunId,
            pipelineDefinitionId: failure.pipelineDefinitionId,
            logicalJobId: failure.logicalJobId,
            matrix: { ...(failure.matrix ?? {}) },
            failedPipelineJobId: failure.id,
            failedAttempt: failure.attempt,
            passedPipelineJobId: recovery.id,
            passedAttempt: recovery.attempt,
            classification: 'SAME_REVISION_RETRY_RECOVERY',
            caveat: 'Measured retry recovery does not prove intrinsic flakiness; environment and external dependencies remain possible causes.',
        });
    }
    allRecoveries.sort((a, b) => a.id.localeCompare(b.id));
    const recoveries = allRecoveries.slice(0, Math.max(0, limits.maxFlakeRecoveries));
    if (recoveries.length < allRecoveries.length) historical.truncation.push({
        collection: 'flakeRecoveries', observedCount: allRecoveries.length, retainedCount: recoveries.length,
    });
    return {
        schemaVersion: 'process-flake-evidence/v1',
        repositoryId,
        window: historical.window,
        eligibleRetrySequenceCount: eligible.length,
        recoveryCount: allRecoveries.length,
        recoveryRate: rate(allRecoveries.length, eligible.length, limits.minimumRateDenominator),
        recoveries,
        completeness: historyIsPartial(historical) ? 'PARTIAL' : 'COMPLETE',
        truncation: historical.truncation.sort((a, b) => a.collection.localeCompare(b.collection)),
    };
}

export interface FailureFingerprintIdentity {
    level: 'STEP' | 'JOB';
    pipelineDefinitionId?: string;
    logicalJobId?: string;
    jobName: string;
    stepName?: string;
    domain: FailureDomain;
}

export interface HistoricalFailureFingerprint {
    id: string;
    identity: FailureFingerprintIdentity;
    occurrenceCount: number;
    failureDenominator: number;
    share: HistoricalRate;
    distinctRevisionCount: number;
    firstObservedAt: string;
    lastObservedAt: string;
    recurrence: 'OBSERVED_ONCE' | 'RECURRING';
    occurrenceIds: string[];
}

export interface ProcessFailureFingerprintReport {
    schemaVersion: 'process-failure-fingerprints/v1';
    repositoryId: string;
    window: ProcessHistoryWindow;
    failureOccurrenceCount: number;
    fingerprints: HistoricalFailureFingerprint[];
    completeness: 'COMPLETE' | 'PARTIAL';
    truncation: ProcessHistoryTruncation[];
}

interface FailureOccurrence {
    id: string;
    revision: string;
    observedAt: string;
    identity: FailureFingerprintIdentity;
}

function failureOccurrences(historical: HistoricalWindowData): FailureOccurrence[] {
    const occurrences: FailureOccurrence[] = [];
    for (const job of historical.jobs.filter(sample => terminal(sample.lifecycle) && sample.outcome === 'FAILED')) {
        const failedSteps = new Map<string, { id: string; name: string }>();
        for (const retained of historical.records) {
            for (const step of retained.record.understanding.observations.pipelineSteps) {
                if (step.pipelineJobId === job.id && terminal(step.lifecycle) && step.outcome === 'FAILED') {
                    failedSteps.set(step.id, { id: step.id, name: step.name });
                }
            }
        }
        if (failedSteps.size > 0) {
            for (const step of [...failedSteps.values()].sort((a, b) => a.id.localeCompare(b.id))) {
                const classification = classifyProcessFailureDomain([step.name, job.name]);
                occurrences.push({
                    id: step.id,
                    revision: job.revision,
                    observedAt: job.observedAt,
                    identity: {
                        level: 'STEP',
                        pipelineDefinitionId: job.pipelineDefinitionId,
                        logicalJobId: job.logicalJobId,
                        jobName: job.name,
                        stepName: step.name,
                        domain: classification.domain,
                    },
                });
            }
        } else {
            const classification = classifyProcessFailureDomain([job.name]);
            occurrences.push({
                id: job.id,
                revision: job.revision,
                observedAt: job.observedAt,
                identity: {
                    level: 'JOB',
                    pipelineDefinitionId: job.pipelineDefinitionId,
                    logicalJobId: job.logicalJobId,
                    jobName: job.name,
                    domain: classification.domain,
                },
            });
        }
    }
    return occurrences.sort((a, b) => a.id.localeCompare(b.id));
}

function fingerprintKey(identity: FailureFingerprintIdentity): string {
    return canonicalJson(identity);
}

/** CI-803 — recurrence of structured failure identities without log parsing. */
export function deriveProcessFailureFingerprints(
    records: readonly ProcessObservationRecord[],
    repositoryId: string,
    partialLimits: Partial<ProcessHistoryLimits> = {},
): ProcessFailureFingerprintReport {
    const limits = { ...DEFAULT_PROCESS_HISTORY_LIMITS, ...partialLimits };
    const historical = buildHistoricalWindow(records, repositoryId, limits);
    const occurrences = failureOccurrences(historical);
    const grouped = new Map<string, FailureOccurrence[]>();
    for (const occurrence of occurrences) {
        const key = fingerprintKey(occurrence.identity);
        grouped.set(key, [...(grouped.get(key) ?? []), occurrence]);
    }
    const allFingerprints: HistoricalFailureFingerprint[] = [...grouped.entries()].map(([key, items]) => {
        const ordered = [...items].sort((a, b) => {
            const aTime = parseTime(a.observedAt) ?? Number.NEGATIVE_INFINITY;
            const bTime = parseTime(b.observedAt) ?? Number.NEGATIVE_INFINITY;
            return aTime - bTime || a.id.localeCompare(b.id);
        });
        const identity = ordered[0].identity;
        const stableSubject = [
            identity.pipelineDefinitionId ?? 'unknown',
            identity.logicalJobId ?? identity.jobName,
            identity.level,
            identity.stepName ?? identity.jobName,
            identity.domain,
        ].join(':');
        return {
            id: `failure-fingerprint:${stableSubject}`,
            identity,
            occurrenceCount: ordered.length,
            failureDenominator: occurrences.length,
            share: rate(ordered.length, occurrences.length, limits.minimumRateDenominator),
            distinctRevisionCount: new Set(ordered.map(item => item.revision)).size,
            firstObservedAt: ordered[0].observedAt,
            lastObservedAt: ordered.at(-1)!.observedAt,
            recurrence: ordered.length > 1 ? 'RECURRING' as const : 'OBSERVED_ONCE' as const,
            occurrenceIds: ordered.map(item => item.id).sort(),
            _sortKey: key,
        };
    }).sort((a, b) => b.occurrenceCount - a.occurrenceCount
        || a.id.localeCompare(b.id))
        .map(({ _sortKey: _, ...item }) => item);
    const fingerprints = allFingerprints.slice(0, Math.max(0, limits.maxFailureFingerprints));
    if (fingerprints.length < allFingerprints.length) historical.truncation.push({
        collection: 'failureFingerprints', observedCount: allFingerprints.length, retainedCount: fingerprints.length,
    });
    return {
        schemaVersion: 'process-failure-fingerprints/v1',
        repositoryId,
        window: historical.window,
        failureOccurrenceCount: occurrences.length,
        fingerprints,
        completeness: historyIsPartial(historical) ? 'PARTIAL' : 'COMPLETE',
        truncation: historical.truncation.sort((a, b) => a.collection.localeCompare(b.collection)),
    };
}
