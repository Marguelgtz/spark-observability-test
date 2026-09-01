import { normalizeRepositoryUnderstanding, type UnderstandingNormalizationIssue } from './understanding-normalize';
import type {
    RepositoryId,
    RepositoryUnderstanding,
    RevisionId,
} from './understanding';

/** How Spark obtained the observation. */
export type ProcessObservationSource = 'LIVE' | 'BACKFILL' | 'UNKNOWN';

/** Model provenance retained with every persisted record. */
export interface ProcessModelVersions {
    /** Understanding observation/claim vocabulary version, such as `understanding-model/v1`. */
    understandingModel: string;
    /** Normalization/validation vocabulary version, such as `normalization/v1`. */
    normalization: string;
    /** Provider adapter or legacy source version, when the payload was produced by one. */
    adapter?: string;
    /** Evaluator version, when the record also carries an evaluation. */
    evaluator?: string;
}

export interface ProcessObservationTruncation {
    truncated: boolean;
    fields: string[];
}

/**
 * One bounded, store-agnostic observation record.
 *
 * The payload is the normalized `RepositoryUnderstanding`; projections, the
 * verification graph, and insights are re-derived from it, never stored
 * alongside as a second source of truth (CI-601 boundary).
 */
export interface ProcessObservationRecord {
    kind: 'process-observation';
    /** Stable logical identity; re-ingesting the same identity is a dedup, not a new observation. */
    recordId: string;
    repositoryId: RepositoryId;
    /** Exact head revision the observation evaluated. */
    revision: RevisionId;
    baseRevision?: RevisionId;
    source: ProcessObservationSource;
    /** Provider event time (delivery/trigger time). */
    providerEventAt: string;
    /** Spark observation/evaluation time. */
    observedAt: string;
    /** Durable storage time; equals observedAt on the live path. */
    ingestedAt: string;
    versions: ProcessModelVersions;
    understanding: RepositoryUnderstanding;
    truncation: ProcessObservationTruncation;
}

export type ProcessObservationIssueCode =
    | 'INVALID_PROCESS_OBSERVATION_SOURCE'
    | 'INVALID_PROCESS_OBSERVATION_TIMESTAMP'
    | 'INVALID_PROCESS_OBSERVATION_TIME_ORDER'
    | 'MISSING_PROCESS_OBSERVATION_VERSION';

export interface ProcessObservationIssue {
    code: ProcessObservationIssueCode;
    path: string;
    detail: string;
}

export interface NormalizedProcessObservation {
    record: ProcessObservationRecord;
    issues: ProcessObservationIssue[];
    /** Issues reported while re-validating the embedded understanding payload. */
    payloadIssues: UnderstandingNormalizationIssue[];
}

const observationSources = new Set<ProcessObservationSource>(['LIVE', 'BACKFILL', 'UNKNOWN']);

function parseTime(value: string): number | undefined {
    if (typeof value !== 'string' || value.length === 0) return undefined;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Re-validates a record: repairs the source vocabulary, reports invalid or
 * out-of-order time axes, and re-normalizes the embedded understanding so a
 * persisted record can never smuggle in structurally invalid facts.
 */
export function normalizeProcessObservation(record: ProcessObservationRecord): NormalizedProcessObservation {
    const issues: ProcessObservationIssue[] = [];
    const normalized: ProcessObservationRecord = {
        ...record,
        versions: { ...record.versions },
        truncation: { ...record.truncation, fields: [...record.truncation.fields] },
    };
    if (!observationSources.has(normalized.source)) {
        issues.push({
            code: 'INVALID_PROCESS_OBSERVATION_SOURCE',
            path: 'source',
            detail: `replaced ${String(normalized.source)} with UNKNOWN`,
        });
        normalized.source = 'UNKNOWN';
    }
    const times = {
        providerEventAt: parseTime(normalized.providerEventAt),
        observedAt: parseTime(normalized.observedAt),
        ingestedAt: parseTime(normalized.ingestedAt),
    };
    for (const [field, value] of Object.entries(times)) {
        if (value === undefined) {
            issues.push({
                code: 'INVALID_PROCESS_OBSERVATION_TIMESTAMP',
                path: field,
                detail: `invalid or missing timestamp ${String((record as unknown as Record<string, unknown>)[field])}`,
            });
        }
    }
    if (times.providerEventAt !== undefined && times.observedAt !== undefined
        && times.providerEventAt > times.observedAt) {
        issues.push({
            code: 'INVALID_PROCESS_OBSERVATION_TIME_ORDER',
            path: 'providerEventAt',
            detail: 'provider event time is after the Spark observation time',
        });
    }
    if (times.observedAt !== undefined && times.ingestedAt !== undefined
        && times.observedAt > times.ingestedAt) {
        issues.push({
            code: 'INVALID_PROCESS_OBSERVATION_TIME_ORDER',
            path: 'ingestedAt',
            detail: 'observation time is after the durable ingestion time',
        });
    }
    if (normalized.versions.understandingModel.trim().length === 0) {
        issues.push({ code: 'MISSING_PROCESS_OBSERVATION_VERSION', path: 'versions.understandingModel', detail: 'empty model version retained as-is' });
    }
    if (normalized.versions.normalization.trim().length === 0) {
        issues.push({ code: 'MISSING_PROCESS_OBSERVATION_VERSION', path: 'versions.normalization', detail: 'empty normalization version retained as-is' });
    }
    const payload = normalizeRepositoryUnderstanding(normalized.understanding);
    normalized.understanding = payload.understanding;
    return { record: normalized, issues, payloadIssues: payload.issues };
}

/** Re-validates every record; record order is preserved for the caller to arrange. */
export function normalizeProcessObservationRecords(
    records: readonly ProcessObservationRecord[],
): NormalizedProcessObservation[] {
    return records.map(record => normalizeProcessObservation(record));
}

export interface ProcessObservationDuplicate {
    recordId: string;
    occurrences: number;
}

/**
 * An idempotent observation log: exactly one record per logical identity.
 * Delivery-level deduplication of provider retries lives in the API layer
 * (`webhook_deliveries`); this is the record-level half of CI-603.
 */
export interface ProcessObservationLog {
    records: ProcessObservationRecord[];
    duplicates: ProcessObservationDuplicate[];
    /** Number of dropped duplicate records. */
    droppedCount: number;
}

function timeKey(value: string): number {
    const parsed = parseTime(value);
    return parsed ?? Number.NEGATIVE_INFINITY;
}

function compareRecords(a: ProcessObservationRecord, b: ProcessObservationRecord): number {
    const aObserved = timeKey(a.observedAt);
    const bObserved = timeKey(b.observedAt);
    if (aObserved !== bObserved) return aObserved < bObserved ? -1 : 1;
    const aIngested = timeKey(a.ingestedAt);
    const bIngested = timeKey(b.ingestedAt);
    if (aIngested !== bIngested) return aIngested < bIngested ? -1 : 1;
    return a.recordId.localeCompare(b.recordId);
}

/**
 * Reduces raw ingested records to an idempotent log.
 *
 * The first arrival per `recordId` (input order is arrival order) is kept;
 * every later arrival with the same identity is reported as a duplicate and
 * dropped. The returned log is in deterministic replay order: observation
 * time, then ingestion time, then record identity.
 */
export function deduplicateProcessObservations(
    records: readonly ProcessObservationRecord[],
): ProcessObservationLog {
    const kept = new Map<string, ProcessObservationRecord>();
    const counts = new Map<string, number>();
    for (const record of records) {
        counts.set(record.recordId, (counts.get(record.recordId) ?? 0) + 1);
        if (!kept.has(record.recordId)) kept.set(record.recordId, record);
    }
    const duplicates: ProcessObservationDuplicate[] = [...counts.entries()]
        .filter(([, occurrences]) => occurrences > 1)
        .map(([recordId, occurrences]) => ({ recordId, occurrences }))
        .sort((a, b) => a.recordId.localeCompare(b.recordId));
    return {
        records: [...kept.values()].sort(compareRecords),
        duplicates,
        droppedCount: records.length - kept.size,
    };
}