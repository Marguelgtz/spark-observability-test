import type { ProcessObservationRecord } from './process-observation';

export const PROCESS_OBSERVATION_LOG_SCHEMA = 'process-observation-log/v1';

export interface ProcessObservationExportLimits {
    /** Maximum number of record lines emitted after the manifest. */
    maxRecords: number;
}

export const DEFAULT_PROCESS_OBSERVATION_EXPORT_LIMITS: ProcessObservationExportLimits = {
    maxRecords: 10_000,
};

export interface ProcessObservationExport {
    schemaVersion: string;
    /** Manifest line first, then one canonical-serialized record line each. */
    lines: string[];
    totalRecords: number;
    retainedRecords: number;
    truncated: boolean;
}

/**
 * Canonical JSON: object keys sorted alphabetically, array order preserved,
 * undefined object values omitted. Identical records always serialize to
 * identical bytes, so the export is deterministic and diffable.
 */
export function canonicalJson(value: unknown): string {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return JSON.stringify(value);
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? JSON.stringify(value) : 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map(item => canonicalJson(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
        return `{${entries.join(',')}}`;
    }
    return 'null';
}

function timeKey(value: string): number {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/** Deterministic replay order: observation time, ingestion time, identity. */
function byReplayOrder(a: ProcessObservationRecord, b: ProcessObservationRecord): number {
    const aObserved = timeKey(a.observedAt);
    const bObserved = timeKey(b.observedAt);
    if (aObserved !== bObserved) return aObserved < bObserved ? -1 : 1;
    const aIngested = timeKey(a.ingestedAt);
    const bIngested = timeKey(b.ingestedAt);
    if (aIngested !== bIngested) return aIngested < bIngested ? -1 : 1;
    return a.recordId.localeCompare(b.recordId);
}

/**
 * Serializes process observation records to bounded JSONL (CI-605): a
 * manifest line followed by one canonical-serialized record line each, in
 * deterministic replay order. Parquet/DuckDB and other analytical consumers
 * read this format; no Spark-owned columnar format is introduced.
 */
export function serializeProcessObservationLog(
    records: readonly ProcessObservationRecord[],
    limits: Partial<ProcessObservationExportLimits> = {},
): ProcessObservationExport {
    const maxRecords = limits.maxRecords ?? DEFAULT_PROCESS_OBSERVATION_EXPORT_LIMITS.maxRecords;
    const ordered = [...records].sort(byReplayOrder);
    const retained = ordered.slice(0, Math.max(0, maxRecords));
    const truncated = ordered.length > retained.length;
    const manifest = canonicalJson({
        schemaVersion: PROCESS_OBSERVATION_LOG_SCHEMA,
        recordCount: ordered.length,
        retainedCount: retained.length,
        truncated,
    });
    return {
        schemaVersion: PROCESS_OBSERVATION_LOG_SCHEMA,
        lines: [manifest, ...retained.map(record => canonicalJson(record))],
        totalRecords: ordered.length,
        retainedRecords: retained.length,
        truncated,
    };
}