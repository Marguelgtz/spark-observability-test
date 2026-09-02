import { canonicalJson } from './process-export';
import {
    currentEvidenceRuns,
    evidenceAcquisitionIsComplete,
    evidenceProcessIdentity,
} from './evidence-matching';
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
    maxFingerprintOccurrenceIds: number;
    maxProcessRelationships: number;
    maxRelationshipEvidenceIds: number;
    maxDriftSignals: number;
    maxDriftSupportingObservationIds: number;
}

export const DEFAULT_PROCESS_HISTORY_LIMITS: ProcessHistoryLimits = {
    maxRecords: 10_000,
    maxBaselines: 500,
    minimumRateDenominator: 5,
    minimumDurationSamples: 5,
    maxFlakeRecoveries: 500,
    maxFailureFingerprints: 500,
    maxFingerprintOccurrenceIds: 100,
    maxProcessRelationships: 1_000,
    maxRelationshipEvidenceIds: 100,
    maxDriftSignals: 500,
    maxDriftSupportingObservationIds: 100,
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
        const id = `failure-fingerprint:${stableSubject}`;
        const allOccurrenceIds = ordered.map(item => item.id).sort();
        const occurrenceIds = allOccurrenceIds.slice(0, Math.max(0, limits.maxFingerprintOccurrenceIds));
        if (occurrenceIds.length < allOccurrenceIds.length) historical.truncation.push({
            collection: `failureFingerprints.${id}.occurrenceIds`,
            observedCount: allOccurrenceIds.length,
            retainedCount: occurrenceIds.length,
        });
        return {
            id,
            identity,
            occurrenceCount: ordered.length,
            failureDenominator: occurrences.length,
            share: rate(ordered.length, occurrences.length, limits.minimumRateDenominator),
            distinctRevisionCount: new Set(ordered.map(item => item.revision)).size,
            firstObservedAt: ordered[0].observedAt,
            lastObservedAt: ordered.at(-1)!.observedAt,
            recurrence: ordered.length > 1 ? 'RECURRING' as const : 'OBSERVED_ONCE' as const,
            occurrenceIds,
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

export type HistoricalRelationshipTarget =
    | { kind: 'AREA'; id: string; label: string }
    | { kind: 'BOUNDARY'; id: string; label: string };

export type HistoricalRelationshipProcess =
    | { kind: 'PIPELINE_DEFINITION'; id: string }
    | { kind: 'LOGICAL_JOB'; id: string }
    | { kind: 'EVIDENCE_NAME'; id: string };

export interface HistoricalProcessRelationship {
    id: string;
    target: HistoricalRelationshipTarget;
    process: HistoricalRelationshipProcess;
    attributedObservationCount: number;
    attributedRevisionCount: number;
    attributedChangedRevisionCount: number;
    eligibleChangedRevisionDenominator: number;
    excludedIncompleteChangedRevisionCount: number;
    changedRevisionCoverage: HistoricalRate;
    evidenceRunIds: string[];
}

export interface ProcessRelationshipReport {
    schemaVersion: 'process-relationships/v1';
    repositoryId: string;
    window: ProcessHistoryWindow;
    relationships: HistoricalProcessRelationship[];
    completeness: 'COMPLETE' | 'PARTIAL';
    truncation: ProcessHistoryTruncation[];
}

function supportedClaim(support: readonly ClaimSupport[]): ClaimSupport | undefined {
    return support.find(item => item.confidence === 'SUPPORTED'
        && item.completeness.state === 'COMPLETE'
        && (item.derivation === 'DECLARED' || item.derivation === 'DETERMINISTIC'));
}

function latestRevisionRecords(historical: HistoricalWindowData): RetainedRecord[] {
    const byRevision = new Map<string, RetainedRecord>();
    for (const retained of historical.records) {
        const current = byRevision.get(retained.record.revision);
        if (!current || recordOrder(current.record, retained.record) <= 0) {
            byRevision.set(retained.record.revision, retained);
        }
    }
    return [...byRevision.values()].sort((a, b) => recordOrder(a.record, b.record));
}

function pathContains(root: string, path: string): boolean {
    const normalized = root.replace(/\/+$/, '');
    return path === normalized || path.startsWith(`${normalized}/`);
}

function changedTargets(understanding: RepositoryUnderstanding): Set<string> {
    const changedIds = new Set(understanding.observations.change.artifacts.map(item => item.artifactId));
    const changedArtifacts = understanding.observations.artifacts.filter(item => changedIds.has(item.id));
    const targets = new Set<string>();
    const changedAreas = new Set<string>();
    for (const membership of understanding.memberships) {
        if (!supportedClaim(membership.support)) continue;
        const target = membership.target;
        const changed = target.kind === 'ARTIFACT'
            ? changedIds.has(target.artifactId)
            : changedArtifacts.some(artifact => pathContains(target.path, artifact.path));
        if (changed) {
            changedAreas.add(membership.areaId);
            targets.add(`AREA\u0000${membership.areaId}`);
        }
    }
    for (const boundary of understanding.boundaries) {
        if (!supportedClaim(boundary.support)) continue;
        if (boundary.artifactIds.some(id => changedIds.has(id))
            || boundary.connectedAreaIds.some(id => changedAreas.has(id))) {
            targets.add(`BOUNDARY\u0000${boundary.id}`);
        }
    }
    return targets;
}

function attributionTargets(
    understanding: RepositoryUnderstanding,
    target: RepositoryUnderstanding['evidenceAttributions'][number]['target'],
): HistoricalRelationshipTarget[] {
    if (target.kind === 'AREA') {
        const area = understanding.areas.find(item => item.id === target.areaId);
        return area ? [{ kind: 'AREA', id: area.id, label: area.label }] : [];
    }
    if (target.kind === 'BOUNDARY') {
        const boundary = understanding.boundaries.find(item => item.id === target.boundaryId);
        return boundary ? [{ kind: 'BOUNDARY', id: boundary.id, label: boundary.label }] : [];
    }
    if (target.kind !== 'ARTIFACT') return [];
    const artifact = understanding.observations.artifacts.find(item => item.id === target.artifactId);
    const targets: HistoricalRelationshipTarget[] = [];
    for (const membership of understanding.memberships) {
        if (!supportedClaim(membership.support)) continue;
        const matches = (membership.target.kind === 'ARTIFACT' && membership.target.artifactId === target.artifactId)
            || (membership.target.kind === 'PATH' && artifact && pathContains(membership.target.path, artifact.path));
        if (!matches) continue;
        const area = understanding.areas.find(item => item.id === membership.areaId);
        if (area) targets.push({ kind: 'AREA', id: area.id, label: area.label });
    }
    for (const boundary of understanding.boundaries) {
        if (supportedClaim(boundary.support) && boundary.artifactIds.includes(target.artifactId)) {
            targets.push({ kind: 'BOUNDARY', id: boundary.id, label: boundary.label });
        }
    }
    return [...new Map(targets.map(item => [`${item.kind}\u0000${item.id}`, item])).values()]
        .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

function relationshipProcesses(
    evidence: EvidenceRunObservation,
    understanding: RepositoryUnderstanding,
): HistoricalRelationshipProcess[] {
    const identity = evidenceProcessIdentity(evidence, understanding);
    const processes: HistoricalRelationshipProcess[] = [{ kind: 'EVIDENCE_NAME', id: evidence.name }];
    if (identity.pipelineDefinitionId) processes.push({ kind: 'PIPELINE_DEFINITION', id: identity.pipelineDefinitionId });
    if (identity.logicalJobId) processes.push({
        kind: 'LOGICAL_JOB',
        id: `${identity.pipelineDefinitionId ?? 'unknown'}:${identity.logicalJobId}`,
    });
    return processes.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

interface RelationshipAccumulator {
    target: HistoricalRelationshipTarget;
    process: HistoricalRelationshipProcess;
    revisions: Set<string>;
    changedRevisions: Set<string>;
    evidenceRunIds: Set<string>;
}

/** CI-804 — measured target/process relationships over latest per-revision state. */
export function deriveHistoricalProcessRelationships(
    records: readonly ProcessObservationRecord[],
    repositoryId: string,
    partialLimits: Partial<ProcessHistoryLimits> = {},
): ProcessRelationshipReport {
    const limits = { ...DEFAULT_PROCESS_HISTORY_LIMITS, ...partialLimits };
    const historical = buildHistoricalWindow(records, repositoryId, limits);
    const revisions = latestRevisionRecords(historical);
    const changedByTarget = new Map<string, Set<string>>();
    const eligibleChangedByTarget = new Map<string, Set<string>>();
    for (const retained of revisions) {
        const understanding = retained.record.understanding;
        for (const target of changedTargets(understanding)) {
            const changed = changedByTarget.get(target) ?? new Set<string>();
            changed.add(retained.record.revision);
            changedByTarget.set(target, changed);
            if (evidenceAcquisitionIsComplete(understanding)) {
                const eligible = eligibleChangedByTarget.get(target) ?? new Set<string>();
                eligible.add(retained.record.revision);
                eligibleChangedByTarget.set(target, eligible);
            }
        }
    }
    const grouped = new Map<string, RelationshipAccumulator>();
    for (const retained of revisions) {
        const understanding = retained.record.understanding;
        const evidence = new Map(currentEvidenceRuns(understanding).map(item => [item.id, item]));
        const changed = changedTargets(understanding);
        for (const attribution of understanding.evidenceAttributions) {
            if (!supportedClaim(attribution.support)) continue;
            const run = evidence.get(attribution.evidenceRunId);
            if (!run) continue;
            for (const target of attributionTargets(understanding, attribution.target)) {
                for (const process of relationshipProcesses(run, understanding)) {
                    const targetKey = `${target.kind}\u0000${target.id}`;
                    const key = `${targetKey}\u0000${process.kind}\u0000${process.id}`;
                    const accumulator = grouped.get(key) ?? {
                        target, process, revisions: new Set<string>(), changedRevisions: new Set<string>(),
                        evidenceRunIds: new Set<string>(),
                    };
                    accumulator.revisions.add(retained.record.revision);
                    accumulator.evidenceRunIds.add(run.id);
                    if (changed.has(targetKey) && evidenceAcquisitionIsComplete(understanding)) {
                        accumulator.changedRevisions.add(retained.record.revision);
                    }
                    grouped.set(key, accumulator);
                }
            }
        }
    }
    const allRelationships: HistoricalProcessRelationship[] = [...grouped.values()].map(item => {
        const targetKey = `${item.target.kind}\u0000${item.target.id}`;
        const changed = changedByTarget.get(targetKey)?.size ?? 0;
        const eligible = eligibleChangedByTarget.get(targetKey)?.size ?? 0;
        const allEvidenceIds = [...item.evidenceRunIds].sort();
        const evidenceRunIds = allEvidenceIds.slice(0, Math.max(0, limits.maxRelationshipEvidenceIds));
        const id = `process-relationship:${item.target.kind.toLowerCase()}:${item.target.id}:${item.process.kind.toLowerCase()}:${item.process.id}`;
        if (evidenceRunIds.length < allEvidenceIds.length) historical.truncation.push({
            collection: `relationships.${id}.evidenceRunIds`,
            observedCount: allEvidenceIds.length,
            retainedCount: evidenceRunIds.length,
        });
        return {
            id,
            target: item.target,
            process: item.process,
            attributedObservationCount: allEvidenceIds.length,
            attributedRevisionCount: item.revisions.size,
            attributedChangedRevisionCount: item.changedRevisions.size,
            eligibleChangedRevisionDenominator: eligible,
            excludedIncompleteChangedRevisionCount: changed - eligible,
            changedRevisionCoverage: rate(item.changedRevisions.size, eligible, limits.minimumRateDenominator),
            evidenceRunIds,
        };
    }).sort((a, b) => a.id.localeCompare(b.id));
    const relationships = allRelationships.slice(0, Math.max(0, limits.maxProcessRelationships));
    if (relationships.length < allRelationships.length) historical.truncation.push({
        collection: 'relationships', observedCount: allRelationships.length, retainedCount: relationships.length,
    });
    const hasIncompleteChangedRevision = [...changedByTarget.entries()].some(([target, changed]) =>
        changed.size > (eligibleChangedByTarget.get(target)?.size ?? 0));
    return {
        schemaVersion: 'process-relationships/v1',
        repositoryId,
        window: historical.window,
        relationships,
        completeness: historyIsPartial(historical) || hasIncompleteChangedRevision ? 'PARTIAL' : 'COMPLETE',
        truncation: historical.truncation.sort((a, b) => a.collection.localeCompare(b.collection)),
    };
}

export type ProcessDriftKind =
    | 'WORKFLOW_ABSENT'
    | 'JOB_SLOWER'
    | 'NEW_MATRIX_DIMENSION'
    | 'NEW_DEPENDENCY'
    | 'NEW_VERIFICATION_GAP';

export interface ProcessDriftSignal {
    id: string;
    driftKind: ProcessDriftKind;
    repositoryId: string;
    revision: string;
    summary: string;
    confidence: 'SUPPORTED' | 'TENTATIVE';
    supportingObservationIds: string[];
    detail:
        | {
            driftKind: 'WORKFLOW_ABSENT';
            pipelineDefinitionId: string;
            previousRevision: string;
        }
        | {
            driftKind: 'JOB_SLOWER';
            pipelineJobId: string;
            logicalJobId: string;
            matrix: Record<string, string | number | boolean>;
            durationMs: number;
            baselineP90Ms: number;
            baselineSampleCount: number;
        }
        | {
            driftKind: 'NEW_MATRIX_DIMENSION';
            pipelineJobId: string;
            logicalJobId: string;
            dimension: string;
            priorExecutionCount: number;
        }
        | {
            driftKind: 'NEW_DEPENDENCY';
            pipelineDefinitionId: string;
            logicalJobId: string;
            dependencyLogicalJobId: string;
            priorDefinitionCount: number;
        }
        | {
            driftKind: 'NEW_VERIFICATION_GAP';
            verificationGapInsightId: string;
            areaIds: string[];
            boundaryIds: string[];
            previousRevision: string;
        };
}

export interface ProcessDriftCoverage {
    historicalRevisionCount: number;
    previousRevision?: string;
    currentRevision?: string;
    workflowComparisonEligible: boolean;
    gapComparisonEligible: boolean;
    durationSubjectsEvaluated: number;
    durationSubjectsExcludedInsufficientHistory: number;
}

export interface ProcessDriftReport {
    schemaVersion: 'process-drift/v1';
    repositoryId: string;
    window: ProcessHistoryWindow;
    coverage: ProcessDriftCoverage;
    signals: ProcessDriftSignal[];
    completeness: 'COMPLETE' | 'PARTIAL';
    truncation: ProcessHistoryTruncation[];
}

function sourceComplete(understanding: RepositoryUnderstanding, source: string): boolean {
    return understanding.observations.completeness.some(item => item.source === source && item.state === 'COMPLETE');
}

function jobSubjectKey(job: HistoricalJobSample): string | undefined {
    return job.logicalJobId
        ? `${job.pipelineDefinitionId ?? 'unknown'}\u0000${job.logicalJobId}\u0000${canonicalJson(job.matrix ?? {})}`
        : undefined;
}

function jobDuration(job: HistoricalJobSample): number | undefined {
    const started = parseTime(job.startedAt);
    const completed = parseTime(job.completedAt);
    return started !== undefined && completed !== undefined && completed >= started ? completed - started : undefined;
}

function p90(values: readonly number[]): number {
    const ordered = [...values].sort((a, b) => a - b);
    return ordered[Math.max(0, Math.ceil(0.9 * ordered.length) - 1)];
}

function definitionDependencies(understanding: RepositoryUnderstanding): Map<string, Set<string>> {
    const dependencies = new Map<string, Set<string>>();
    for (const definition of understanding.observations.pipelineDefinitions) {
        for (const job of definition.jobs) {
            dependencies.set(
                `${definition.id}\u0000${job.id}`,
                new Set(job.needs ?? []),
            );
        }
    }
    return dependencies;
}

/** CI-805 — bounded, abstention-aware process drift over retained revisions. */
export function deriveProcessDrift(
    records: readonly ProcessObservationRecord[],
    repositoryId: string,
    partialLimits: Partial<ProcessHistoryLimits> = {},
): ProcessDriftReport {
    const limits = { ...DEFAULT_PROCESS_HISTORY_LIMITS, ...partialLimits };
    const historical = buildHistoricalWindow(records, repositoryId, limits);
    const revisions = latestRevisionRecords(historical);
    const current = revisions.at(-1);
    const previous = revisions.at(-2);
    const coverage: ProcessDriftCoverage = {
        historicalRevisionCount: revisions.length,
        previousRevision: previous?.record.revision,
        currentRevision: current?.record.revision,
        workflowComparisonEligible: false,
        gapComparisonEligible: false,
        durationSubjectsEvaluated: 0,
        durationSubjectsExcludedInsufficientHistory: 0,
    };
    const signals: ProcessDriftSignal[] = [];
    if (current) {
        const currentUnderstanding = current.record.understanding;
        const currentRevision = current.record.revision;
        if (previous) {
            const previousUnderstanding = previous.record.understanding;
            coverage.workflowComparisonEligible = sourceComplete(currentUnderstanding, 'github-workflow-files')
                && sourceComplete(previousUnderstanding, 'github-workflow-files');
            if (coverage.workflowComparisonEligible) {
                const currentDefinitions = new Set(currentUnderstanding.observations.pipelineDefinitions.map(item => item.id));
                for (const definition of previousUnderstanding.observations.pipelineDefinitions) {
                    if (currentDefinitions.has(definition.id)) continue;
                    signals.push({
                        id: `process-drift:workflow-absent:${currentRevision}:${definition.id}`,
                        driftKind: 'WORKFLOW_ABSENT', repositoryId, revision: currentRevision,
                        summary: `${definition.name} was present at ${previous.record.revision} and is absent from the complete workflow acquisition at ${currentRevision}`,
                        confidence: 'SUPPORTED', supportingObservationIds: [definition.id, current.record.recordId, previous.record.recordId],
                        detail: {
                            driftKind: 'WORKFLOW_ABSENT', pipelineDefinitionId: definition.id,
                            previousRevision: previous.record.revision,
                        },
                    });
                }
            }

            coverage.gapComparisonEligible = evidenceAcquisitionIsComplete(currentUnderstanding)
                && evidenceAcquisitionIsComplete(previousUnderstanding);
            if (coverage.gapComparisonEligible) {
                const previousGaps = new Set(deriveProcessInsights(previousUnderstanding).insights
                    .filter(item => item.insightKind === 'VERIFICATION_GAP').map(item => item.id));
                for (const gap of deriveProcessInsights(currentUnderstanding).insights
                    .filter(item => item.insightKind === 'VERIFICATION_GAP')) {
                    if (previousGaps.has(gap.id)) continue;
                    signals.push({
                        id: `process-drift:new-gap:${currentRevision}:${gap.id}`,
                        driftKind: 'NEW_VERIFICATION_GAP', repositoryId, revision: currentRevision,
                        summary: `verification gap ${gap.id} is newly observed at ${currentRevision}`,
                        confidence: 'SUPPORTED',
                        supportingObservationIds: [current.record.recordId, ...gap.supportingObservationIds].sort(),
                        detail: {
                            driftKind: 'NEW_VERIFICATION_GAP', verificationGapInsightId: gap.id,
                            areaIds: [...gap.areaIds], boundaryIds: [...gap.boundaryIds],
                            previousRevision: previous.record.revision,
                        },
                    });
                }
            }
        }

        const currentJobs = historical.jobs.filter(job => job.revision === currentRevision);
        const priorJobs = historical.jobs.filter(job => job.revision !== currentRevision);
        const priorBySubject = new Map<string, HistoricalJobSample[]>();
        for (const job of priorJobs) {
            const key = jobSubjectKey(job);
            if (key) priorBySubject.set(key, [...(priorBySubject.get(key) ?? []), job]);
        }
        for (const job of currentJobs) {
            const key = jobSubjectKey(job);
            if (!key || !job.logicalJobId) continue;
            const baselineJobs = priorBySubject.get(key) ?? [];
            const durations = baselineJobs.flatMap(sample => {
                const duration = jobDuration(sample);
                return duration === undefined ? [] : [duration];
            });
            const duration = jobDuration(job);
            if (duration !== undefined) {
                if (durations.length >= limits.minimumDurationSamples) {
                    coverage.durationSubjectsEvaluated += 1;
                    const baselineP90Ms = p90(durations);
                    if (duration > baselineP90Ms) signals.push({
                        id: `process-drift:job-slower:${currentRevision}:${job.id}`,
                        driftKind: 'JOB_SLOWER', repositoryId, revision: currentRevision,
                        summary: `${job.name} took ${String(duration)}ms, above its ${String(durations.length)}-sample historical p90 of ${String(baselineP90Ms)}ms`,
                        confidence: 'SUPPORTED',
                        supportingObservationIds: [job.id, ...baselineJobs.map(item => item.id)].sort(),
                        detail: {
                            driftKind: 'JOB_SLOWER', pipelineJobId: job.id, logicalJobId: job.logicalJobId,
                            matrix: { ...(job.matrix ?? {}) }, durationMs: duration, baselineP90Ms,
                            baselineSampleCount: durations.length,
                        },
                    });
                } else {
                    coverage.durationSubjectsExcludedInsufficientHistory += 1;
                }
            } else {
                coverage.durationSubjectsExcludedInsufficientHistory += 1;
            }

            const comparablePrior = priorJobs.filter(sample =>
                sample.pipelineDefinitionId === job.pipelineDefinitionId && sample.logicalJobId === job.logicalJobId);
            if (comparablePrior.length > 0) {
                const priorDimensions = new Set(comparablePrior.flatMap(sample => Object.keys(sample.matrix ?? {})));
                for (const dimension of Object.keys(job.matrix ?? {}).sort()) {
                    if (priorDimensions.has(dimension)) continue;
                    signals.push({
                        id: `process-drift:new-matrix-dimension:${currentRevision}:${job.id}:${dimension}`,
                        driftKind: 'NEW_MATRIX_DIMENSION', repositoryId, revision: currentRevision,
                        summary: `${job.name} introduced matrix dimension ${dimension} after ${String(comparablePrior.length)} prior execution(s)`,
                        confidence: 'SUPPORTED',
                        supportingObservationIds: [job.id, ...comparablePrior.map(item => item.id)].sort(),
                        detail: {
                            driftKind: 'NEW_MATRIX_DIMENSION', pipelineJobId: job.id,
                            logicalJobId: job.logicalJobId, dimension, priorExecutionCount: comparablePrior.length,
                        },
                    });
                }
            }
        }

        const currentDependencies = definitionDependencies(currentUnderstanding);
        const priorDependencyMaps = revisions.slice(0, -1).map(item => definitionDependencies(item.record.understanding));
        for (const [subject, needs] of [...currentDependencies.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            const priorSets = priorDependencyMaps.flatMap(map => map.has(subject) ? [map.get(subject)!] : []);
            if (priorSets.length === 0) continue;
            const priorNeeds = new Set(priorSets.flatMap(item => [...item]));
            const separator = subject.indexOf('\u0000');
            const definitionId = subject.slice(0, separator);
            const logicalJobId = subject.slice(separator + 1);
            for (const dependency of [...needs].sort()) {
                if (priorNeeds.has(dependency)) continue;
                signals.push({
                    id: `process-drift:new-dependency:${currentRevision}:${definitionId}:${logicalJobId}:${dependency}`,
                    driftKind: 'NEW_DEPENDENCY', repositoryId, revision: currentRevision,
                    summary: `${logicalJobId} newly depends on ${dependency} after ${String(priorSets.length)} prior definition(s)`,
                    confidence: 'SUPPORTED', supportingObservationIds: [definitionId, current.record.recordId],
                    detail: {
                        driftKind: 'NEW_DEPENDENCY', pipelineDefinitionId: definitionId, logicalJobId,
                        dependencyLogicalJobId: dependency, priorDefinitionCount: priorSets.length,
                    },
                });
            }
        }
    }
    signals.sort((a, b) => a.id.localeCompare(b.id));
    const retainedSignals = signals.slice(0, Math.max(0, limits.maxDriftSignals));
    if (retainedSignals.length < signals.length) historical.truncation.push({
        collection: 'driftSignals', observedCount: signals.length, retainedCount: retainedSignals.length,
    });
    const boundedSignals = retainedSignals.map(signal => {
        const allSupportingObservationIds = [...new Set(signal.supportingObservationIds)].sort();
        const supportingObservationIds = allSupportingObservationIds
            .slice(0, Math.max(0, limits.maxDriftSupportingObservationIds));
        if (supportingObservationIds.length < allSupportingObservationIds.length) historical.truncation.push({
            collection: `driftSignals.${signal.id}.supportingObservationIds`,
            observedCount: allSupportingObservationIds.length,
            retainedCount: supportingObservationIds.length,
        });
        return { ...signal, supportingObservationIds };
    });
    const abstained = !current || !previous
        || !coverage.workflowComparisonEligible || !coverage.gapComparisonEligible
        || coverage.durationSubjectsExcludedInsufficientHistory > 0;
    return {
        schemaVersion: 'process-drift/v1', repositoryId, window: historical.window, coverage,
        signals: boundedSignals,
        completeness: historyIsPartial(historical) || abstained ? 'PARTIAL' : 'COMPLETE',
        truncation: historical.truncation.sort((a, b) => a.collection.localeCompare(b.collection)),
    };
}
