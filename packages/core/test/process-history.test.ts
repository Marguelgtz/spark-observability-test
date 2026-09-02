import { describe, expect, it } from 'vitest';
import {
    deriveProcessRuntimeBaselines,
    deriveProcessFlakeEvidence,
    deriveProcessFailureFingerprints,
    deriveHistoricalProcessRelationships,
    deriveProcessDrift,
    type ClaimSupport,
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

function claimSupport(): ClaimSupport[] {
    return [{
        provenance: { kind: 'WORKFLOW_ANALYZER', source: 'test' }, derivation: 'DECLARED',
        confidence: 'SUPPORTED', evidence: [], completeness: { state: 'COMPLETE' },
    }];
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
            pipelineSteps: [], evidenceRuns: [], deployments: [],
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

    it('measures same-revision retry recovery with eligible sequences as the denominator', () => {
        const recovered = understanding('revision:1', 'run:1', [
            { id: 'attempt:1:1', attempt: 1 }, { id: 'attempt:1:2', attempt: 2 },
        ], [
            { id: 'job:1:1', attemptId: 'attempt:1:1', lifecycle: 'COMPLETED', outcome: 'FAILED' },
            { id: 'job:1:2', attemptId: 'attempt:1:2', lifecycle: 'COMPLETED', outcome: 'PASSED' },
        ]);
        recovered.observations.pipelineJobs.forEach(job => { job.matrix = { node: 20 }; });
        const notRecovered = understanding('revision:2', 'run:2', [
            { id: 'attempt:2:1', attempt: 1 }, { id: 'attempt:2:2', attempt: 2 },
        ], [
            { id: 'job:2:1', attemptId: 'attempt:2:1', lifecycle: 'COMPLETED', outcome: 'FAILED' },
            { id: 'job:2:2', attemptId: 'attempt:2:2', lifecycle: 'COMPLETED', outcome: 'FAILED' },
        ]);
        notRecovered.observations.pipelineJobs.forEach(job => { job.matrix = { node: 20 }; });

        const report = deriveProcessFlakeEvidence([record(1, recovered), record(2, notRecovered)], 'repository:1', {
            minimumRateDenominator: 1,
        });
        expect(report).toMatchObject({
            eligibleRetrySequenceCount: 2,
            recoveryCount: 1,
            recoveryRate: { count: 1, denominator: 2, value: 0.5, sufficientHistory: true },
        });
        expect(report.recoveries[0]).toMatchObject({
            revision: 'revision:1', matrix: { node: 20 }, failedAttempt: 1, passedAttempt: 2,
            classification: 'SAME_REVISION_RETRY_RECOVERY',
        });
    });

    it('does not collapse different matrix coordinates into flake evidence', () => {
        const payload = understanding('revision:1', 'run:1', [
            { id: 'attempt:1:1', attempt: 1 }, { id: 'attempt:1:2', attempt: 2 },
        ], [
            { id: 'job:1:1', attemptId: 'attempt:1:1', lifecycle: 'COMPLETED', outcome: 'FAILED' },
            { id: 'job:1:2', attemptId: 'attempt:1:2', lifecycle: 'COMPLETED', outcome: 'PASSED' },
        ]);
        payload.observations.pipelineJobs[0].matrix = { node: 20 };
        payload.observations.pipelineJobs[1].matrix = { node: 22 };

        const report = deriveProcessFlakeEvidence([record(1, payload)], 'repository:1', {
            minimumRateDenominator: 1,
        });
        expect(report.eligibleRetrySequenceCount).toBe(0);
        expect(report.recoveryCount).toBe(0);
        expect(report.recoveries).toEqual([]);
    });

    it('tracks recurring structured failure fingerprints without double-counting snapshots', () => {
        const failedWithStep = (index: number, stepName: string) => {
            const payload = understanding(`revision:${index}`, `run:${index}`, [
                { id: `attempt:${index}:1`, attempt: 1 },
            ], [{
                id: `job:${index}:1`, attemptId: `attempt:${index}:1`, lifecycle: 'COMPLETED', outcome: 'FAILED',
            }]);
            payload.observations.pipelineSteps.push({
                kind: 'pipeline-step', id: `step:${index}:1`, pipelineJobId: `job:${index}:1`, sequence: 1,
                name: stepName, lifecycle: 'COMPLETED', outcome: 'FAILED', source: { kind: 'ci' },
            });
            return record(index, payload);
        };
        const first = failedWithStep(1, 'Typecheck');
        const repeatedSnapshot = structuredClone(first);
        repeatedSnapshot.recordId = 'record:1:later-snapshot';
        repeatedSnapshot.observedAt = '2026-09-01T10:05:00Z';
        repeatedSnapshot.ingestedAt = '2026-09-01T10:05:00Z';
        const report = deriveProcessFailureFingerprints([
            first,
            repeatedSnapshot,
            failedWithStep(2, 'Typecheck'),
            failedWithStep(3, 'Run unit tests'),
        ], 'repository:1', { minimumRateDenominator: 1 });

        expect(report.failureOccurrenceCount).toBe(3);
        expect(report.fingerprints[0]).toMatchObject({
            identity: { level: 'STEP', stepName: 'Typecheck', domain: 'STATIC_ANALYSIS' },
            occurrenceCount: 2,
            failureDenominator: 3,
            share: { count: 2, denominator: 3, value: 2 / 3 },
            distinctRevisionCount: 2,
            recurrence: 'RECURRING',
            occurrenceIds: ['step:1:1', 'step:2:1'],
        });
        expect(report.fingerprints[1]).toMatchObject({
            identity: { stepName: 'Run unit tests', domain: 'TEST' }, recurrence: 'OBSERVED_ONCE',
        });

        const bounded = deriveProcessFailureFingerprints([first, failedWithStep(3, 'Run unit tests')], 'repository:1', {
            maxFailureFingerprints: 1,
        });
        expect(bounded.truncation).toContainEqual({
            collection: 'failureFingerprints', observedCount: 2, retainedCount: 1,
        });
    });

    it('measures area/workflow and boundary/evidence relationships with eligible changed revisions', () => {
        const attributedRevision = (index: number, includeAttribution: boolean, complete = true) => {
            const payload = understanding(`revision:${index}`, `run:${index}`, [
                { id: `attempt:${index}:1`, attempt: 1 },
            ], [{
                id: `job:${index}:1`, attemptId: `attempt:${index}:1`, lifecycle: 'COMPLETED', outcome: 'PASSED',
            }]);
            payload.observations.change.artifacts = [{ artifactId: `artifact:${index}`, status: 'MODIFIED' }];
            payload.observations.artifacts = [{
                kind: 'artifact', id: `artifact:${index}`, repositoryId: 'repository:1', revision: `revision:${index}`,
                path: 'packages/api/index.ts', artifactKind: 'FILE', source: { kind: 'vcs' },
            }];
            payload.areas = [{ id: 'area:api', label: 'API', roles: ['FUNCTIONAL'], support: claimSupport() }];
            payload.memberships = [{
                id: 'membership:api', areaId: 'area:api', target: { kind: 'PATH', path: 'packages/api' },
                support: claimSupport(),
            }];
            payload.boundaries = [{
                id: 'boundary:api', kind: 'PUBLIC_INTERFACE', label: 'API boundary',
                artifactIds: [`artifact:${index}`], connectedAreaIds: ['area:api'], support: claimSupport(),
            }];
            payload.observations.evidenceRuns = [{
                kind: 'evidence-run', id: `evidence:${index}`, repositoryId: 'repository:1', revision: `revision:${index}`,
                name: 'verify', evidenceKind: 'github-check-run', lifecycle: 'COMPLETED', outcome: 'PASSED',
                pipelineRunId: `run:${index}`, pipelineAttemptId: `attempt:${index}:1`, pipelineJobId: `job:${index}:1`,
                source: { kind: 'ci' },
            }];
            payload.observations.completeness.push({
                source: 'github-check-runs', state: complete ? 'COMPLETE' : 'PARTIAL',
            });
            if (includeAttribution) payload.evidenceAttributions = [
                {
                    id: `attribution:area:${index}`, evidenceRunId: `evidence:${index}`,
                    target: { kind: 'AREA', areaId: 'area:api' }, support: claimSupport(),
                },
                {
                    id: `attribution:boundary:${index}`, evidenceRunId: `evidence:${index}`,
                    target: { kind: 'BOUNDARY', boundaryId: 'boundary:api' }, support: claimSupport(),
                },
            ];
            return record(index, payload);
        };

        const report = deriveHistoricalProcessRelationships([
            attributedRevision(1, true), attributedRevision(2, false),
        ], 'repository:1', { minimumRateDenominator: 1 });
        const areaWorkflow = report.relationships.find(item =>
            item.target.kind === 'AREA' && item.process.kind === 'PIPELINE_DEFINITION');
        expect(areaWorkflow).toMatchObject({
            target: { id: 'area:api' }, process: { id: 'definition:verify' },
            attributedObservationCount: 1, attributedRevisionCount: 1,
            attributedChangedRevisionCount: 1, eligibleChangedRevisionDenominator: 2,
            excludedIncompleteChangedRevisionCount: 0,
            changedRevisionCoverage: { count: 1, denominator: 2, value: 0.5 },
            evidenceRunIds: ['evidence:1'],
        });
        expect(report.relationships).toContainEqual(expect.objectContaining({
            target: expect.objectContaining({ kind: 'BOUNDARY', id: 'boundary:api' }),
            process: { kind: 'EVIDENCE_NAME', id: 'verify' },
        }));

        const partial = deriveHistoricalProcessRelationships([
            attributedRevision(1, true), attributedRevision(2, false, false),
        ], 'repository:1', { minimumRateDenominator: 1 });
        expect(partial.relationships.find(item =>
            item.target.kind === 'AREA' && item.process.kind === 'PIPELINE_DEFINITION')).toMatchObject({
            eligibleChangedRevisionDenominator: 1,
            excludedIncompleteChangedRevisionCount: 1,
            changedRevisionCoverage: { count: 1, denominator: 1, value: 1 },
        });
        expect(partial.completeness).toBe('PARTIAL');
    });

    it('detects observable workflow, duration, matrix, and dependency drift with baselines', () => {
        const prior = [1, 2, 3, 4, 5].map(index => {
            const item = completedRecord(index, 'PASSED', index * 10);
            item.understanding.observations.pipelineJobs[0].matrix = { node: 20 };
            item.understanding.observations.pipelineJobs.push({
                ...item.understanding.observations.pipelineJobs[0],
                id: `job:${index}:matrix`, logicalJobId: 'matrix-test', matrix: { node: 20 },
            });
            item.understanding.observations.pipelineDefinitions.push({
                kind: 'pipeline-definition', id: 'definition:legacy', repositoryId: 'repository:1',
                revision: `revision:${index}`, name: 'Legacy', path: '.github/workflows/legacy.yml',
                triggers: [{ event: 'pull_request' }], jobs: [], source: { kind: 'ci-definition' },
            });
            item.understanding.observations.completeness.push(
                { source: 'github-workflow-files', state: 'COMPLETE' },
                { source: 'github-check-runs', state: 'COMPLETE' },
            );
            return item;
        });
        const current = completedRecord(6, 'PASSED', 60);
        current.understanding.observations.pipelineJobs[0].matrix = { node: 20 };
        current.understanding.observations.pipelineJobs.push({
            ...current.understanding.observations.pipelineJobs[0],
            id: 'job:6:matrix', logicalJobId: 'matrix-test', matrix: { node: 20, os: 'linux' },
        });
        current.understanding.observations.pipelineDefinitions[0].jobs[0].needs = ['build'];
        current.understanding.observations.pipelineDefinitions[0].jobs.push({ id: 'build', name: 'Build' });
        current.understanding.observations.completeness.push(
            { source: 'github-workflow-files', state: 'COMPLETE' },
            { source: 'github-check-runs', state: 'COMPLETE' },
        );

        const report = deriveProcessDrift([...prior, current], 'repository:1');
        expect(report.coverage).toMatchObject({
            historicalRevisionCount: 6, previousRevision: 'revision:5', currentRevision: 'revision:6',
            workflowComparisonEligible: true, gapComparisonEligible: true, durationSubjectsEvaluated: 1,
        });
        expect(report.signals).toEqual(expect.arrayContaining([
            expect.objectContaining({
                driftKind: 'WORKFLOW_ABSENT', detail: expect.objectContaining({ pipelineDefinitionId: 'definition:legacy' }),
            }),
            expect.objectContaining({
                driftKind: 'JOB_SLOWER', detail: expect.objectContaining({
                    pipelineJobId: 'job:6:1', durationMs: 60_000, baselineP90Ms: 50_000, baselineSampleCount: 5,
                }),
            }),
            expect.objectContaining({
                driftKind: 'NEW_MATRIX_DIMENSION', detail: expect.objectContaining({
                    pipelineJobId: 'job:6:matrix', dimension: 'os', priorExecutionCount: 5,
                }),
            }),
            expect.objectContaining({
                driftKind: 'NEW_DEPENDENCY', detail: expect.objectContaining({
                    logicalJobId: 'test', dependencyLogicalJobId: 'build', priorDefinitionCount: 5,
                }),
            }),
        ]));
    });

    it('detects a newly observed verification gap only across complete acquisitions', () => {
        const gapRecord = (index: number, attributed: boolean, complete = true) => {
            const item = completedRecord(index, 'PASSED', 10);
            const payload = item.understanding;
            payload.observations.change.artifacts = [{ artifactId: `artifact:${index}`, status: 'MODIFIED' }];
            payload.observations.artifacts = [{
                kind: 'artifact', id: `artifact:${index}`, repositoryId: 'repository:1', revision: `revision:${index}`,
                path: 'packages/api/index.ts', artifactKind: 'FILE', source: { kind: 'vcs' },
            }];
            payload.areas = [{ id: 'area:api', label: 'API', roles: ['FUNCTIONAL'], support: claimSupport() }];
            payload.memberships = [{
                id: 'membership:api', areaId: 'area:api', target: { kind: 'PATH', path: 'packages/api' },
                support: claimSupport(),
            }];
            payload.observations.evidenceRuns = [{
                kind: 'evidence-run', id: `evidence:${index}`, repositoryId: 'repository:1', revision: `revision:${index}`,
                name: 'verify', evidenceKind: 'github-check-run', lifecycle: 'COMPLETED', outcome: 'PASSED',
                pipelineRunId: `run:${index}`, pipelineAttemptId: `attempt:${index}:1`, pipelineJobId: `job:${index}:1`,
                source: { kind: 'ci' },
            }];
            payload.observations.completeness.push(
                { source: 'github-check-runs', state: complete ? 'COMPLETE' : 'PARTIAL' },
                { source: 'github-workflow-files', state: 'COMPLETE' },
            );
            if (attributed) payload.evidenceAttributions = [{
                id: `attribution:${index}`, evidenceRunId: `evidence:${index}`,
                target: { kind: 'AREA', areaId: 'area:api' }, support: claimSupport(),
            }];
            return item;
        };
        const previous = gapRecord(1, true);
        const current = gapRecord(2, false);
        const report = deriveProcessDrift([previous, current], 'repository:1', {
            minimumDurationSamples: 1,
        });
        expect(report.signals).toContainEqual(expect.objectContaining({
            driftKind: 'NEW_VERIFICATION_GAP',
            detail: expect.objectContaining({ areaIds: ['area:api'], previousRevision: 'revision:1' }),
        }));

        const partialCurrent = gapRecord(2, false, false);
        const abstained = deriveProcessDrift([previous, partialCurrent], 'repository:1', {
            minimumDurationSamples: 1,
        });
        expect(abstained.coverage.gapComparisonEligible).toBe(false);
        expect(abstained.signals.some(item => item.driftKind === 'NEW_VERIFICATION_GAP')).toBe(false);
        expect(abstained.completeness).toBe('PARTIAL');
    });

    it('keeps every historical projection deterministic across caller order', () => {
        const ordered = [completedRecord(1, 'FAILED', 10), completedRecord(2, 'PASSED', 20)];
        const reversed = [...ordered].reverse();
        expect(deriveProcessRuntimeBaselines(reversed, 'repository:1'))
            .toEqual(deriveProcessRuntimeBaselines(ordered, 'repository:1'));
        expect(deriveProcessFlakeEvidence(reversed, 'repository:1'))
            .toEqual(deriveProcessFlakeEvidence(ordered, 'repository:1'));
        expect(deriveProcessFailureFingerprints(reversed, 'repository:1'))
            .toEqual(deriveProcessFailureFingerprints(ordered, 'repository:1'));
        expect(deriveHistoricalProcessRelationships(reversed, 'repository:1'))
            .toEqual(deriveHistoricalProcessRelationships(ordered, 'repository:1'));
        expect(deriveProcessDrift(reversed, 'repository:1'))
            .toEqual(deriveProcessDrift(ordered, 'repository:1'));
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
