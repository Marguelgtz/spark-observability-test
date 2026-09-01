import { describe, expect, it } from 'vitest';
import {
    normalizeProcessObservation,
    normalizeProcessObservationRecords,
    type ProcessObservationRecord,
    type RepositoryUnderstanding,
} from '../src';

function understanding(): RepositoryUnderstanding {
    return {
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
            completeness: [{ source: 'github-check-runs', state: 'COMPLETE' }],
        },
        areas: [],
        memberships: [],
        relationships: [],
        boundaries: [],
        evidenceAttributions: [],
        evidenceExpectations: [],
        completeness: [],
    };
}

function record(overrides: Partial<ProcessObservationRecord> = {}): ProcessObservationRecord {
    return {
        kind: 'process-observation',
        recordId: 'live:delivery-1',
        repositoryId: 'repository:1',
        revision: 'head',
        source: 'LIVE',
        providerEventAt: '2026-09-01T10:00:00Z',
        observedAt: '2026-09-01T10:00:05Z',
        ingestedAt: '2026-09-01T10:00:06Z',
        versions: { understandingModel: 'understanding-model/v1', normalization: 'normalization/v1', adapter: 'github-actions/v1' },
        understanding: understanding(),
        truncation: { truncated: false, fields: [] },
        ...overrides,
    };
}

describe('process observation records', () => {
    it('accepts a well-formed live record without issues', () => {
        const result = normalizeProcessObservation(record());
        expect(result.issues).toEqual([]);
        expect(result.payloadIssues).toEqual([]);
        expect(result.record.recordId).toBe('live:delivery-1');
    });

    it('accepts a backfill where ingestion follows observation by the backfill delay', () => {
        const result = normalizeProcessObservation(record({
            recordId: 'backfill:repository:1:head',
            source: 'BACKFILL',
            providerEventAt: '2026-07-01T08:00:00Z',
            observedAt: '2026-09-01T12:00:00Z',
            ingestedAt: '2026-09-01T12:00:01Z',
        }));
        expect(result.issues).toEqual([]);
    });

    it('reports a provider event that postdates the Spark observation', () => {
        const result = normalizeProcessObservation(record({
            providerEventAt: '2026-09-01T10:00:09Z',
            observedAt: '2026-09-01T10:00:05Z',
        }));
        expect(result.issues).toContainEqual(expect.objectContaining({
            code: 'INVALID_PROCESS_OBSERVATION_TIME_ORDER', path: 'providerEventAt',
        }));
    });

    it('reports ingestion that precedes the observation', () => {
        const result = normalizeProcessObservation(record({
            observedAt: '2026-09-01T10:00:09Z',
            ingestedAt: '2026-09-01T10:00:06Z',
        }));
        expect(result.issues).toContainEqual(expect.objectContaining({
            code: 'INVALID_PROCESS_OBSERVATION_TIME_ORDER', path: 'ingestedAt',
        }));
    });

    it('reports unparseable timestamps without inventing values', () => {
        const result = normalizeProcessObservation(record({ providerEventAt: 'not-a-time' }));
        expect(result.issues).toContainEqual(expect.objectContaining({
            code: 'INVALID_PROCESS_OBSERVATION_TIMESTAMP', path: 'providerEventAt',
        }));
        expect(result.record.providerEventAt).toBe('not-a-time');
    });

    it('replaces an unknown acquisition source with UNKNOWN', () => {
        const result = normalizeProcessObservation(record({ source: 'SIDELOAD' as ProcessObservationRecord['source'] }));
        expect(result.record.source).toBe('UNKNOWN');
        expect(result.issues.map(issue => issue.code)).toEqual(['INVALID_PROCESS_OBSERVATION_SOURCE']);
    });

    it('reports empty model versions', () => {
        const result = normalizeProcessObservation(record({ versions: { understandingModel: '', normalization: 'normalization/v1' } }));
        expect(result.issues).toContainEqual(expect.objectContaining({
            code: 'MISSING_PROCESS_OBSERVATION_VERSION', path: 'versions.understandingModel',
        }));
    });

    it('re-normalizes the embedded payload so invalid facts are repaired with issues', () => {
        const payload = understanding();
        payload.observations.evidenceRuns.push({
            kind: 'evidence-run', id: 'evidence:1', repositoryId: 'repository:1', revision: 'head',
            name: 'verify', evidenceKind: 'github-check-run', lifecycle: 'COMPLETED', outcome: 'PASSED',
            pipelineRunId: 'pipeline-run:missing', source: { kind: 'ci' },
        });
        const result = normalizeProcessObservation(record({ understanding: payload }));
        expect(result.payloadIssues.map(issue => issue.code)).toEqual(['DANGLING_REFERENCE']);
        expect(result.record.understanding.observations.evidenceRuns[0]).not.toHaveProperty('pipelineRunId');
    });

    it('normalizes records independently while preserving order', () => {
        const results = normalizeProcessObservationRecords([
            record({ recordId: 'a', observedAt: '2026-09-01T10:00:05Z' }),
            record({ recordId: 'b', observedAt: 'bad' }),
        ]);
        expect(results.map(item => item.record.recordId)).toEqual(['a', 'b']);
        expect(results[0].issues).toEqual([]);
        expect(results[1].issues.map(issue => issue.code)).toContain('INVALID_PROCESS_OBSERVATION_TIMESTAMP');
    });
});