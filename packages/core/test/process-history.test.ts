import { describe, expect, it } from 'vitest';
import {
    deriveProcessRuntimeBaselines,
    type ProcessLifecycle,
    type ProcessObservationRecord,
    type ProcessOutcome,
    type RepositoryUnderstanding,
} from '../src';

interface JobInput {
    id: string;
    attemptId: string;
    logicalJobId?: string;
    lifecycle: ProcessLifecycle;
    outcome: ProcessOutcome;
    startedAt?: string;
    completedAt?: string;
}

interface AttemptInput {
    id: string;
    attempt: number;
}

function understanding(
    revision: string,
    runId: string,
    attempts: AttemptInput[],
    jobs: JobInput[],
): RepositoryUnderstanding {
    return {
        observations: {
            snapshot: {
                kind: 'repository-snapshot', id: `snapshot:${revision}`, repositoryId: 'repository:1', revision,
                source: { kind: 'vcs' },
            },
            change: {
                kind: 'change', id: `change:${revision}`, repositoryId: 'repository:1',
                baseRevision: `base:${revision}`, headRevision: revision, artifacts: [], source: { kind: 'vcs' },
            },
            artifacts: [],
            pipelineDefinitions: [{
                kind: 'pipeline-definition', id: 'definition:verify', repositoryId: 'repository:1', revision,
                name: 'Verify', path: '.github/workflows/verify.yml', triggers: [{ event: 'pull_request' }],
                jobs: [{ id: 'test', name: 'Test' }], source: { kind: 'ci-definition' },
            }],
            pipelineRuns: [{
                kind: 'pipeline-run', id: runId, pipelineDefinitionId: 'definition:verify',
                repositoryId: 'repository:1', revision, trigger: 'pull_request', source: { kind: 'ci' },
            }],
            pipelineAttempts: attempts.map(item => ({
                kind: 'pipeline-attempt' as const, id: item.id, pipelineRunId: runId, attempt: item.attempt,
                lifecycle: 'COMPLETED' as const, outcome: 'PASSED' as const, source: { kind: 'ci' },
            })),
            pipelineJobs: jobs.map(item => ({
                kind: 'pipeline-job' as const, id: item.id, pipelineAttemptId: item.attemptId,
                logicalJobId: item.logicalJobId ?? 'test', name: 'Test', lifecycle: item.lifecycle,
                outcome: item.outcome, startedAt: item.startedAt, completedAt: item.completedAt,
                source: { kind: 'ci' },
            })),
            pipelineSteps: [], evidenceRuns: [],
            completeness: [
                { source: 'github-actions-runs', state: 'COMPLETE' },
                { source: 'github-actions-jobs', state: 'COMPLETE' },
            ],
        },
        areas: [], memberships: [], relationships: [], boundaries: [],
        evidenceAttributions: [], evidenceExpectations: [], completeness: [],
    };
}

function record(
    index: number,
    payload: RepositoryUnderstanding,
    overrides: Partial<ProcessObservationRecord> = {},
): ProcessObservationRecord {
    const observedAt = `2026-09-${String(index).padStart(2, '0')}T10:00:00Z`;
    return {
        kind: 'process-observation', recordId: `record:${index}`, repositoryId: 'repository:1',
        revision: payload.observations.change.headRevision, source: 'LIVE', providerEventAt: observedAt,
        observedAt, ingestedAt: observedAt, versions: { understandingModel: 'v1', normalization: 'v1' },
        understanding: payload, truncation: { truncated: false, fields: [] }, ...overrides,
    };
}

function completedRecord(index: number, outcome: ProcessOutcome, durationSeconds: number): ProcessObservationRecord {
    const revision = `revision:${index}`;
    const startedAt = `2026-09-${String(index).padStart(2, '0')}T09:00:00Z`;
    const completedAt = new Date(Date.parse(startedAt) + durationSeconds * 1_000).toISOString();
    return record(index, understanding(
        revision,
        `run:${index}`,
        [{ id: `attempt:${index}:1`, attempt: 1 }],
        [{
            id: `job:${index}:1`, attemptId: `attempt:${index}:1`, lifecycle: 'COMPLETED', outcome,
            startedAt, completedAt,
        }],
    ));
}

describe('historical process runtime baselines', () => {
    it('reports duration quantiles and outcome rates with exact denominators', () => {
        const report = deriveProcessRuntimeBaselines([
            completedRecord(1, 'PASSED', 10),
            completedRecord(2, 'PASSED', 20),
            completedRecord(3, 'FAILED', 30),
            completedRecord(4, 'PASSED', 40),
            completedRecord(5, 'FAILED', 50),
        ], 'repository:1');
        const baseline = report.baselines[0];

        expect(report.window).toMatchObject({ retainedRecordCount: 5, distinctRevisionCount: 5 });
        expect(baseline).toMatchObject({
            executionCount: 5,
            terminalCount: 5,
            success: { count: 3, denominator: 5, value: 0.6, sufficientHistory: true },
            failure: { count: 2, denominator: 5, value: 0.4, sufficientHistory: true },
            duration: { sampleCount: 5, excludedCount: 0, medianMs: 30_000, p90Ms: 50_000, sufficientHistory: true },
        });
    });

    it('collapses repeated snapshots to one stable job execution and keeps its terminal fact', () => {
        const revision = 'revision:1';
        const running = understanding(revision, 'run:1', [{ id: 'attempt:1', attempt: 1 }], [{
            id: 'job:1', attemptId: 'attempt:1', lifecycle: 'RUNNING', outcome: 'UNKNOWN',
            startedAt: '2026-09-01T09:00:00Z',
        }]);
        const completed = structuredClone(running);
        completed.observations.pipelineJobs[0].lifecycle = 'COMPLETED';
        completed.observations.pipelineJobs[0].outcome = 'PASSED';
        completed.observations.pipelineJobs[0].completedAt = '2026-09-01T09:00:10Z';

        const report = deriveProcessRuntimeBaselines([
            record(1, running, { recordId: 'record:running', observedAt: '2026-09-01T09:00:05Z', ingestedAt: '2026-09-01T09:00:05Z' }),
            record(1, completed, { recordId: 'record:completed', observedAt: '2026-09-01T09:00:11Z', ingestedAt: '2026-09-01T09:00:11Z' }),
        ], 'repository:1', { minimumRateDenominator: 1, minimumDurationSamples: 1 });

        expect(report.baselines[0]).toMatchObject({
            executionCount: 1, terminalCount: 1,
            success: { count: 1, denominator: 1, value: 1 },
            duration: { sampleCount: 1, medianMs: 10_000, p90Ms: 10_000 },
        });
    });

    it('omits percentages and quantiles when declared minimum history is not met', () => {
        const report = deriveProcessRuntimeBaselines([completedRecord(1, 'PASSED', 10)], 'repository:1');
        const baseline = report.baselines[0];
        expect(baseline.success).toEqual({ count: 1, denominator: 1, sufficientHistory: false });
        expect(baseline.duration).toEqual({ sampleCount: 1, excludedCount: 0, sufficientHistory: false });
        expect(baseline.retry).toEqual({ retriedRunCount: 0, runDenominator: 1, sufficientHistory: false });
    });

    it('uses distinct runs as the retry-rate denominator', () => {
        const records = [1, 2, 3, 4].map(index => completedRecord(index, 'PASSED', 10));
        const retryPayload = understanding('revision:5', 'run:5', [
            { id: 'attempt:5:1', attempt: 1 }, { id: 'attempt:5:2', attempt: 2 },
        ], [
            { id: 'job:5:1', attemptId: 'attempt:5:1', lifecycle: 'COMPLETED', outcome: 'FAILED' },
            { id: 'job:5:2', attemptId: 'attempt:5:2', lifecycle: 'COMPLETED', outcome: 'PASSED' },
        ]);
        records.push(record(5, retryPayload));

        const report = deriveProcessRuntimeBaselines(records, 'repository:1');
        expect(report.baselines[0].retry).toEqual({
            retriedRunCount: 1, runDenominator: 5, value: 0.2, sufficientHistory: true,
        });
    });

    it('deduplicates record identities deterministically across caller order', () => {
        const original = completedRecord(1, 'PASSED', 10);
        const laterCopy = structuredClone(original);
        laterCopy.ingestedAt = '2026-09-01T10:00:01Z';
        laterCopy.understanding.observations.pipelineJobs[0].outcome = 'FAILED';
        const left = deriveProcessRuntimeBaselines([laterCopy, original], 'repository:1', { minimumRateDenominator: 1 });
        const right = deriveProcessRuntimeBaselines([original, laterCopy], 'repository:1', { minimumRateDenominator: 1 });

        expect(left).toEqual(right);
        expect(left.window.droppedDuplicateCount).toBe(1);
        expect(left.baselines[0].success.value).toBe(1);
    });

    it('retains the newest bounded history and reports record truncation', () => {
        const report = deriveProcessRuntimeBaselines([
            completedRecord(1, 'FAILED', 10), completedRecord(2, 'FAILED', 10), completedRecord(3, 'PASSED', 10),
        ], 'repository:1', { maxRecords: 2, minimumRateDenominator: 1 });

        expect(report.window).toMatchObject({ deduplicatedRecordCount: 3, retainedRecordCount: 2 });
        expect(report.baselines[0].success).toMatchObject({ count: 1, denominator: 2, value: 0.5 });
        expect(report.truncation).toContainEqual({ collection: 'records', observedCount: 3, retainedCount: 2 });
        expect(report.completeness).toBe('PARTIAL');
    });

    it('excludes invalid durations and incoherent record envelopes explicitly', () => {
        const invalidDuration = completedRecord(1, 'PASSED', 10);
        invalidDuration.understanding.observations.pipelineJobs[0].completedAt = '2026-09-01T08:00:00Z';
        const incoherent = completedRecord(2, 'PASSED', 10);
        incoherent.revision = 'different-envelope-revision';
        const report = deriveProcessRuntimeBaselines([invalidDuration, incoherent], 'repository:1', {
            minimumRateDenominator: 1, minimumDurationSamples: 1,
        });

        expect(report.window.incoherentRecordCount).toBe(1);
        expect(report.baselines[0].duration).toEqual({
            sampleCount: 0, excludedCount: 1, sufficientHistory: false,
        });
        expect(report.completeness).toBe('PARTIAL');
    });

    it('bounds subject baselines independently from retained execution facts', () => {
        const report = deriveProcessRuntimeBaselines([completedRecord(1, 'PASSED', 10)], 'repository:1', {
            maxBaselines: 1,
        });
        expect(report.baselines).toHaveLength(1);
        expect(report.truncation).toContainEqual({ collection: 'baselines', observedCount: 3, retainedCount: 1 });
    });
});
