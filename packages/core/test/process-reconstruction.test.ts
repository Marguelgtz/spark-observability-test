import { describe, expect, it } from 'vitest';
import {
    reconstructProcessState,
    type ProcessObservationRecord,
    type RepositoryUnderstanding,
} from '../src';

type Lifecycle = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
type Outcome = 'PASSED' | 'FAILED' | 'NEUTRAL' | 'SKIPPED' | 'UNKNOWN' | 'NOT_APPLICABLE';

interface ChainOptions {
    attempts?: Array<{ id: string; pipelineRunId: string; attempt: number; lifecycle: Lifecycle; outcome?: Outcome }>;
    jobs?: Array<{ id: string; pipelineAttemptId: string; name: string; lifecycle: Lifecycle; outcome?: Outcome }>;
    steps?: Array<{ id: string; pipelineJobId: string; sequence: number; lifecycle: Lifecycle }>;
    evidenceRuns?: Array<{ id: string; name: string; lifecycle: Lifecycle; outcome?: Outcome; pipelineRunId?: string; pipelineAttemptId?: string; pipelineJobId?: string; pipelineStepId?: string }>;
    completeness?: Array<{ source: string; state: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' }>;
}

const outcomeFor = (lifecycle: Lifecycle, explicit?: Outcome): Outcome =>
    explicit ?? (lifecycle === 'COMPLETED' ? 'PASSED' : lifecycle === 'CANCELLED' ? 'NEUTRAL' : 'UNKNOWN');

function understanding(options: ChainOptions = {}): RepositoryUnderstanding {
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
            pipelineRuns: [{
                kind: 'pipeline-run', id: 'pipeline-run:1', repositoryId: 'repository:1', revision: 'head',
                trigger: 'pull_request', source: { kind: 'ci' },
            }],
            pipelineAttempts: (options.attempts ?? []).map(item => ({
                kind: 'pipeline-attempt' as const, id: item.id, pipelineRunId: item.pipelineRunId, attempt: item.attempt,
                lifecycle: item.lifecycle, outcome: outcomeFor(item.lifecycle, item.outcome), source: { kind: 'ci' },
            })),
            pipelineJobs: (options.jobs ?? []).map(item => ({
                kind: 'pipeline-job' as const, id: item.id, pipelineAttemptId: item.pipelineAttemptId, name: item.name,
                lifecycle: item.lifecycle, outcome: outcomeFor(item.lifecycle, item.outcome), source: { kind: 'ci' },
            })),
            pipelineSteps: (options.steps ?? []).map(item => ({
                kind: 'pipeline-step' as const, id: item.id, pipelineJobId: item.pipelineJobId, sequence: item.sequence,
                name: item.id, lifecycle: item.lifecycle, outcome: outcomeFor(item.lifecycle), source: { kind: 'ci' },
            })),
            evidenceRuns: (options.evidenceRuns ?? []).map(item => ({
                kind: 'evidence-run' as const, id: item.id, repositoryId: 'repository:1', revision: 'head', name: item.name,
                evidenceKind: 'github-check-run', lifecycle: item.lifecycle, outcome: outcomeFor(item.lifecycle, item.outcome),
                pipelineRunId: item.pipelineRunId, pipelineAttemptId: item.pipelineAttemptId,
                pipelineJobId: item.pipelineJobId, pipelineStepId: item.pipelineStepId, source: { kind: 'ci' },
            })),
            completeness: options.completeness ?? [{ source: 'github-actions', state: 'COMPLETE' }],
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

function record(options: {
    recordId: string;
    observedAt: string;
    ingestedAt?: string;
    revision?: string;
    repositoryId?: string;
    truncation?: boolean;
    fields?: string[];
    understanding?: RepositoryUnderstanding;
}): ProcessObservationRecord {
    return {
        kind: 'process-observation',
        recordId: options.recordId,
        repositoryId: options.repositoryId ?? 'repository:1',
        revision: options.revision ?? 'head',
        source: 'LIVE',
        providerEventAt: options.observedAt,
        observedAt: options.observedAt,
        ingestedAt: options.ingestedAt ?? options.observedAt,
        versions: { understandingModel: 'understanding-model/v1', normalization: 'normalization/v1' },
        understanding: options.understanding ?? understanding(),
        truncation: { truncated: options.truncation ?? false, fields: options.fields ?? [] },
    };
}

const COMPLETE = understanding({
    attempts: [{ id: 'attempt:1', pipelineRunId: 'pipeline-run:1', attempt: 1, lifecycle: 'COMPLETED' }],
    jobs: [
        { id: 'job:build', pipelineAttemptId: 'attempt:1', name: 'build', lifecycle: 'COMPLETED' },
        { id: 'job:test', pipelineAttemptId: 'attempt:1', name: 'test', lifecycle: 'COMPLETED' },
    ],
    steps: [{ id: 'step:test:1', pipelineJobId: 'job:test', sequence: 1, lifecycle: 'COMPLETED' }],
    evidenceRuns: [{
        id: 'evidence:ci', name: 'verify', lifecycle: 'COMPLETED',
        pipelineRunId: 'pipeline-run:1', pipelineAttemptId: 'attempt:1', pipelineJobId: 'job:test', pipelineStepId: 'step:test:1',
    }],
});

const PARTIAL = understanding({
    attempts: [],
    jobs: [{ id: 'job:test', pipelineAttemptId: 'attempt:1', name: 'test', lifecycle: 'RUNNING' }],
    completeness: [{ source: 'github-actions', state: 'PARTIAL' }],
});

const OLDER = record({ recordId: 'live:1', observedAt: '2026-09-01T10:00:00Z', understanding: COMPLETE });
const NEWER = record({ recordId: 'live:2', observedAt: '2026-09-01T10:05:00Z', understanding: PARTIAL });

describe('process state reconstruction', () => {
    it('reconstructs the single observation at and after its observation time', () => {
        const result = reconstructProcessState([OLDER], {
            repositoryId: 'repository:1', revision: 'head', at: '2026-09-01T10:00:00Z',
        });
        expect(result.state).toBe('RECONSTRUCTED');
        expect(result.supplyingRecordId).toBe('live:1');
        expect(result.priorObservedAt).toBeUndefined();
        expect(result.subsequentObservationCount).toBe(0);
        expect(result.retainedTerminalFacts).toEqual([]);
        expect(result.understanding?.observations.pipelineJobs.map(job => [job.id, job.lifecycle]))
            .toEqual([['job:build', 'COMPLETED'], ['job:test', 'COMPLETED']]);
    });

    it('reports NO_OBSERVATION before the first observation of the revision', () => {
        const result = reconstructProcessState([OLDER], {
            repositoryId: 'repository:1', revision: 'head', at: '2026-08-31T23:59:00Z',
        });
        expect(result.state).toBe('NO_OBSERVATION');
        expect(result.understanding).toBeUndefined();
        expect(result.notes).toEqual(['no observation of this repository revision at or before the query time']);
    });

    it('uses the latest observation at T and counts later observations without using them', () => {
        const result = reconstructProcessState([OLDER, NEWER], {
            repositoryId: 'repository:1', revision: 'head', at: '2026-09-01T10:00:30Z',
        });
        expect(result.state).toBe('RECONSTRUCTED');
        expect(result.supplyingRecordId).toBe('live:1');
        expect(result.subsequentObservationCount).toBe(1);
        expect(result.notes).toContain('1 later observation(s) exist and are not used by this reconstruction');
        expect(result.understanding?.observations.pipelineJobs.map(job => job.id)).toEqual(['job:build', 'job:test']);
    });

    it('keeps terminal facts from an older complete acquisition when the newer acquisition is partial', () => {
        const result = reconstructProcessState([OLDER, NEWER], {
            repositoryId: 'repository:1', revision: 'head', at: '2026-09-01T10:06:00Z',
        });
        expect(result.state).toBe('RECONSTRUCTED');
        expect(result.supplyingRecordId).toBe('live:2');
        expect(result.priorObservedAt).toBe('2026-09-01T10:00:00Z');
        expect(result.retainedTerminalFacts).toEqual([
            'attempt:1', 'evidence:ci', 'job:build', 'job:test', 'step:test:1',
        ]);
        const observations = result.understanding?.observations;
        expect(observations?.pipelineAttempts.map(item => [item.id, item.lifecycle]))
            .toEqual([['attempt:1', 'COMPLETED']]);
        expect(observations?.pipelineJobs.map(item => [item.id, item.lifecycle]))
            .toEqual([['job:test', 'COMPLETED'], ['job:build', 'COMPLETED']]);
        expect(observations?.pipelineSteps.map(item => [item.id, item.lifecycle]))
            .toEqual([['step:test:1', 'COMPLETED']]);
        expect(observations?.evidenceRuns.map(item => [item.id, item.lifecycle]))
            .toEqual([['evidence:ci', 'COMPLETED']]);
    });

    it('lets a terminal older state supersede a stale non-terminal newer snapshot', () => {
        const result = reconstructProcessState([OLDER, NEWER], {
            repositoryId: 'repository:1', revision: 'head', at: '2026-09-01T10:05:00Z',
        });
        const job = result.understanding?.observations.pipelineJobs.find(item => item.id === 'job:test');
        expect(job?.lifecycle).toBe('COMPLETED');
        expect(job?.outcome).toBe('PASSED');
    });

    it('transplants the ancestry of a retained execution so links stay coherent', () => {
        const stripped = understanding({
            attempts: [{ id: 'attempt:1', pipelineRunId: 'pipeline-run:1', attempt: 1, lifecycle: 'COMPLETED' }],
            jobs: [],
        });
        const older = record({ recordId: 'live:1', observedAt: '2026-09-01T10:00:00Z', understanding: COMPLETE });
        const newer = record({ recordId: 'live:2', observedAt: '2026-09-01T10:05:00Z', understanding: stripped });
        const result = reconstructProcessState([older, newer], {
            repositoryId: 'repository:1', revision: 'head', at: '2026-09-01T10:06:00Z',
        });
        const observations = result.understanding?.observations;
        expect(observations?.pipelineRuns.map(item => item.id)).toEqual(['pipeline-run:1']);
        expect(observations?.pipelineJobs.map(item => [item.id, item.pipelineAttemptId, item.lifecycle]))
            .toEqual([['job:build', 'attempt:1', 'COMPLETED'], ['job:test', 'attempt:1', 'COMPLETED']]);
        const evidence = observations?.evidenceRuns[0];
        expect([evidence?.pipelineRunId, evidence?.pipelineAttemptId, evidence?.pipelineJobId, evidence?.pipelineStepId])
            .toEqual(['pipeline-run:1', 'attempt:1', 'job:test', 'step:test:1']);
    });

    it('retains non-terminal ancestors needed by a terminal step', () => {
        const olderUnderstanding = understanding({
            attempts: [{ id: 'attempt:1', pipelineRunId: 'pipeline-run:1', attempt: 1, lifecycle: 'RUNNING' }],
            jobs: [{ id: 'job:test', pipelineAttemptId: 'attempt:1', name: 'test', lifecycle: 'RUNNING' }],
            steps: [{ id: 'step:test:1', pipelineJobId: 'job:test', sequence: 1, lifecycle: 'COMPLETED' }],
        });
        const newerUnderstanding = understanding();
        const older = record({
            recordId: 'live:1', observedAt: '2026-09-01T10:00:00Z', understanding: olderUnderstanding,
        });
        const newer = record({
            recordId: 'live:2', observedAt: '2026-09-01T10:05:00Z', understanding: newerUnderstanding,
        });

        const result = reconstructProcessState([older, newer], {
            repositoryId: 'repository:1', revision: 'head', at: '2026-09-01T10:06:00Z',
        });

        const observations = result.understanding?.observations;
        expect(observations?.pipelineRuns.map(item => item.id)).toEqual(['pipeline-run:1']);
        expect(observations?.pipelineAttempts.map(item => [item.id, item.lifecycle]))
            .toEqual([['attempt:1', 'RUNNING']]);
        expect(observations?.pipelineJobs.map(item => [item.id, item.lifecycle]))
            .toEqual([['job:test', 'RUNNING']]);
        expect(observations?.pipelineSteps.map(item => [item.id, item.lifecycle]))
            .toEqual([['step:test:1', 'COMPLETED']]);
        expect(result.retainedTerminalFacts).toEqual(['step:test:1']);
    });

    it('never mixes revisions: other revisions are excluded from the state', () => {
        const other = record({
            recordId: 'live:3', observedAt: '2026-09-01T10:07:00Z', revision: 'other',
            understanding: understanding({ attempts: [] }),
        });
        const result = reconstructProcessState([OLDER, other], {
            repositoryId: 'repository:1', revision: 'head', at: '2026-09-01T10:08:00Z',
        });
        expect(result.supplyingRecordId).toBe('live:1');
        expect(result.subsequentObservationCount).toBe(0);
        expect(result.understanding?.observations.pipelineJobs).toHaveLength(2);
    });

    it('breaks ties on ingestion time, then identity, when observation times match', () => {
        const a = record({ recordId: 'a', observedAt: '2026-09-01T10:05:00Z', ingestedAt: '2026-09-01T10:05:01Z' });
        const b = record({ recordId: 'b', observedAt: '2026-09-01T10:05:00Z', ingestedAt: '2026-09-01T10:05:02Z' });
        const result = reconstructProcessState([a, b, OLDER], {
            repositoryId: 'repository:1', revision: 'head', at: '2026-09-01T10:05:00Z',
        });
        expect(result.supplyingRecordId).toBe('b');
        expect(result.priorObservedAt).toBe('2026-09-01T10:05:00Z');
    });

    it('records a truncated primary payload without hiding the state', () => {
        const newer = record({
            recordId: 'live:2', observedAt: '2026-09-01T10:05:00Z',
            truncation: true, fields: ['pipelineJobs'],
            understanding: PARTIAL,
        });
        const result = reconstructProcessState([OLDER, newer], {
            repositoryId: 'repository:1', revision: 'head', at: '2026-09-01T10:06:00Z',
        });
        expect(result.state).toBe('RECONSTRUCTED');
        expect(result.notes).toContain('primary observation payload was truncated: pipelineJobs');
    });

    it('cannot bound an unparseable query time', () => {
        const result = reconstructProcessState([OLDER], {
            repositoryId: 'repository:1', revision: 'head', at: 'not-a-time',
        });
        expect(result.state).toBe('NO_OBSERVATION');
        expect(result.notes).toEqual(['query time is not parseable; no observation can be bounded by it']);
    });
});
