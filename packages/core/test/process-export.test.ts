import { describe, expect, it } from 'vitest';
import {
    canonicalJson,
    PROCESS_OBSERVATION_LOG_SCHEMA,
    serializeProcessObservationLog,
    type ProcessObservationRecord,
} from '../src';

function record(overrides: Partial<ProcessObservationRecord>): ProcessObservationRecord {
    return {
        kind: 'process-observation',
        recordId: 'live:1',
        repositoryId: 'repository:1',
        revision: 'head',
        source: 'LIVE',
        providerEventAt: '2026-09-01T10:00:00Z',
        observedAt: '2026-09-01T10:00:05Z',
        ingestedAt: '2026-09-01T10:00:06Z',
        versions: { understandingModel: 'understanding-model/v1', normalization: 'normalization/v1' },
        understanding: {
            observations: {
                snapshot: {
                    kind: 'repository-snapshot', id: 'snapshot:head', repositoryId: 'repository:1', revision: 'head',
                    source: { kind: 'vcs' },
                },
                change: {
                    kind: 'change', id: 'change:1', repositoryId: 'repository:1', baseRevision: 'base', headRevision: 'head',
                    artifacts: [], source: { kind: 'vcs' },
                },
                artifacts: [],
                pipelineDefinitions: [],
                pipelineRuns: [],
                pipelineAttempts: [],
                pipelineJobs: [],
                pipelineSteps: [],
                evidenceRuns: [],
                deployments: [],
                completeness: [{ source: 'github-actions', state: 'COMPLETE' }],
            },
            areas: [],
            memberships: [],
            relationships: [],
            boundaries: [],
            evidenceAttributions: [],
            evidenceExpectations: [],
            completeness: [],
        },
        truncation: { truncated: false, fields: [] },
        ...overrides,
    };
}

describe('process observation JSONL export', () => {
    it('emits a manifest line followed by one line per record, each parseable as JSON', () => {
        const export_ = serializeProcessObservationLog([
            record({ recordId: 'live:1', observedAt: '2026-09-01T10:00:05Z' }),
            record({ recordId: 'live:2', observedAt: '2026-09-01T10:05:05Z' }),
        ]);
        expect(export_.lines).toHaveLength(3);
        const manifest = JSON.parse(export_.lines[0]);
        expect(manifest.schemaVersion).toBe(PROCESS_OBSERVATION_LOG_SCHEMA);
        expect(manifest.recordCount).toBe(2);
        expect(manifest.retainedCount).toBe(2);
        expect(manifest.truncated).toBe(false);
        const first = JSON.parse(export_.lines[1]);
        expect(first.recordId).toBe('live:1');
        expect(JSON.parse(export_.lines[2]).recordId).toBe('live:2');
    });

    it('orders lines in deterministic replay order regardless of input order', () => {
        const a = record({ recordId: 'a', observedAt: '2026-09-01T10:00:00Z' });
        const b = record({ recordId: 'b', observedAt: '2026-09-01T10:05:00Z' });
        const c = record({ recordId: 'c', observedAt: '2026-09-01T10:05:00Z' });
        const left = serializeProcessObservationLog([a, b, c]);
        const right = serializeProcessObservationLog([c, a, b]);
        expect(left.lines).toEqual(right.lines);
        expect(left.lines.slice(1).map(line => JSON.parse(line).recordId)).toEqual(['a', 'b', 'c']);
    });

    it('serializes records with canonical key order', () => {
        const line = serializeProcessObservationLog([record({})]).lines[1];
        expect(line).toBe(canonicalJson(record({})));
        const keys = Object.keys(JSON.parse(line));
        expect(keys).toEqual([...keys].sort());
        expect(line.startsWith('{"ingestedAt":')).toBe(true);
    });

    it('reports explicit truncation when the record bound is exceeded', () => {
        const export_ = serializeProcessObservationLog([
            record({ recordId: 'a', observedAt: '2026-09-01T10:00:00Z' }),
            record({ recordId: 'b', observedAt: '2026-09-01T10:01:00Z' }),
            record({ recordId: 'c', observedAt: '2026-09-01T10:02:00Z' }),
        ], { maxRecords: 2 });
        expect(export_.lines).toHaveLength(3);
        expect(export_.truncated).toBe(true);
        const manifest = JSON.parse(export_.lines[0]);
        expect(manifest.recordCount).toBe(3);
        expect(manifest.retainedCount).toBe(2);
        expect(manifest.truncated).toBe(true);
        expect(JSON.parse(export_.lines[2]).recordId).toBe('b');
    });

    it('produces byte-identical output across runs for the same records', () => {
        const records = [
            record({ recordId: 'x', observedAt: '2026-09-01T10:00:00Z' }),
            record({ recordId: 'y', observedAt: '2026-09-01T10:01:00Z' }),
        ];
        expect(serializeProcessObservationLog(records).lines)
            .toEqual(serializeProcessObservationLog([...records].reverse()).lines);
    });

    it('serializes undefined fields as absent and non-finite numbers as null', () => {
        expect(canonicalJson({ b: 1, a: undefined })).toBe('{"b":1}');
        expect(canonicalJson({ n: Number.NaN })).toBe('{"n":null}');
        expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    });
});
