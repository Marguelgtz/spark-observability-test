import { describe, expect, it } from 'vitest';
import {
    deriveProcessInsights,
    deriveRecoveryProcessInsights,
    type ClaimSupport,
    type ProcessObservationRecord,
    type RepositoryUnderstanding,
} from '../src';

function support(): ClaimSupport[] {
    return [{
        provenance: { kind: 'WORKFLOW_ANALYZER', source: '.github/workflows/verify.yml' },
        derivation: 'DECLARED', confidence: 'SUPPORTED',
        evidence: [{ kind: 'OBSERVATION', id: 'definition:verify' }],
        completeness: { state: 'COMPLETE' },
    }];
}

function fixture(): RepositoryUnderstanding {
    return {
        observations: {
            snapshot: {
                kind: 'repository-snapshot', id: 'snapshot:head', repositoryId: 'repository:1', revision: 'head',
                source: { kind: 'vcs' },
            },
            change: {
                kind: 'change', id: 'change:1', repositoryId: 'repository:1', baseRevision: 'base', headRevision: 'head',
                artifacts: [{ artifactId: 'artifact:api', status: 'MODIFIED' }], source: { kind: 'vcs' },
            },
            artifacts: [{
                kind: 'artifact', id: 'artifact:api', repositoryId: 'repository:1', revision: 'head',
                path: 'packages/api/index.ts', artifactKind: 'FILE', source: { kind: 'vcs' },
            }],
            pipelineDefinitions: [{
                kind: 'pipeline-definition', id: 'definition:verify', repositoryId: 'repository:1', revision: 'head',
                name: 'Verify', path: '.github/workflows/verify.yml', triggers: [{ event: 'pull_request' }],
                jobs: [{
                    id: 'verify', name: 'Verify',
                    steps: [{ name: 'Run unit tests', execution: { kind: 'COMMAND', command: 'pnpm test', semanticReach: 'DIRECT' } }],
                }],
                source: { kind: 'ci-definition' },
            }],
            pipelineRuns: [{
                kind: 'pipeline-run', id: 'run:1', pipelineDefinitionId: 'definition:verify',
                repositoryId: 'repository:1', revision: 'head', trigger: 'pull_request', source: { kind: 'ci' },
            }],
            pipelineAttempts: [{
                kind: 'pipeline-attempt', id: 'attempt:1', pipelineRunId: 'run:1', attempt: 1,
                lifecycle: 'RUNNING', outcome: 'UNKNOWN', source: { kind: 'ci' },
            }],
            pipelineJobs: [{
                kind: 'pipeline-job', id: 'job:1', pipelineAttemptId: 'attempt:1', logicalJobId: 'verify',
                name: 'Verify', lifecycle: 'RUNNING', outcome: 'UNKNOWN', source: { kind: 'ci' },
            }],
            pipelineSteps: [{
                kind: 'pipeline-step', id: 'step:1', pipelineJobId: 'job:1', sequence: 1, name: 'Run unit tests',
                execution: { kind: 'COMMAND', command: 'pnpm test', semanticReach: 'DIRECT' },
                lifecycle: 'RUNNING', outcome: 'UNKNOWN', source: { kind: 'ci' },
            }],
            evidenceRuns: [{
                kind: 'evidence-run', id: 'evidence:1', repositoryId: 'repository:1', revision: 'head',
                name: 'verify', evidenceKind: 'github-check-run', lifecycle: 'RUNNING', outcome: 'UNKNOWN',
                pipelineRunId: 'run:1', pipelineAttemptId: 'attempt:1', pipelineJobId: 'job:1',
                pipelineStepId: 'step:1', source: { kind: 'ci' }, url: 'https://ci.local/check/1',
            }],
            deployments: [],
            completeness: [{ source: 'github-check-runs', state: 'COMPLETE' }],
        },
        areas: [{ id: 'area:api', label: 'API', roles: ['FUNCTIONAL'], support: support() }],
        memberships: [{
            id: 'membership:api', areaId: 'area:api', target: { kind: 'PATH', path: 'packages/api' }, support: support(),
        }],
        relationships: [],
        boundaries: [{
            id: 'boundary:api', kind: 'PUBLIC_INTERFACE', label: 'API boundary',
            artifactIds: ['artifact:api'], connectedAreaIds: ['area:api'], support: support(),
        }],
        evidenceAttributions: [
            { id: 'attribution:area', evidenceRunId: 'evidence:1', target: { kind: 'AREA', areaId: 'area:api' }, support: support() },
            { id: 'attribution:boundary', evidenceRunId: 'evidence:1', target: { kind: 'BOUNDARY', boundaryId: 'boundary:api' }, support: support() },
        ],
        evidenceExpectations: [{
            id: 'expectation:verify', name: 'verify', target: { kind: 'AREA', areaId: 'area:api' },
            match: { evidenceName: 'verify', pipelineDefinitionId: 'definition:verify', logicalJobId: 'verify' },
            support: support(),
        }],
        completeness: [],
    };
}

function insight(understanding: RepositoryUnderstanding, kind: string) {
    return deriveProcessInsights(understanding).insights.find(item => item.insightKind === kind);
}

function record(recordId: string, observedAt: string, understanding: RepositoryUnderstanding): ProcessObservationRecord {
    return {
        kind: 'process-observation', recordId, repositoryId: 'repository:1', revision: 'head', source: 'LIVE',
        providerEventAt: observedAt, observedAt, ingestedAt: observedAt,
        versions: { understandingModel: 'v1', normalization: 'v1' }, understanding,
        truncation: { truncated: false, fields: [] },
    };
}

describe('deterministic process insights', () => {
    it('reports normal activity without calling partial acquisition regression-free', () => {
        const understanding = fixture();
        const normal = insight(understanding, 'NORMAL_LIFECYCLE');
        expect(normal).toMatchObject({ confidence: 'SUPPORTED', detail: { runningCount: 1, failedCount: 0 } });

        understanding.observations.completeness[0].state = 'PARTIAL';
        expect(insight(understanding, 'NORMAL_LIFECYCLE')).toMatchObject({ confidence: 'UNKNOWN' });

        understanding.observations.pipelineSteps[0].lifecycle = 'COMPLETED';
        understanding.observations.pipelineSteps[0].outcome = 'FAILED';
        expect(insight(understanding, 'NORMAL_LIFECYCLE')).toBeUndefined();
    });

    it('localizes an exact failed step, classifies it conservatively, and emits a checked-in reproduction candidate', () => {
        const understanding = fixture();
        understanding.observations.pipelineAttempts[0].lifecycle = 'COMPLETED';
        understanding.observations.pipelineAttempts[0].outcome = 'FAILED';
        understanding.observations.pipelineJobs[0].lifecycle = 'COMPLETED';
        understanding.observations.pipelineJobs[0].outcome = 'FAILED';
        understanding.observations.pipelineSteps[0].lifecycle = 'COMPLETED';
        understanding.observations.pipelineSteps[0].outcome = 'FAILED';
        understanding.observations.evidenceRuns[0].lifecycle = 'COMPLETED';
        understanding.observations.evidenceRuns[0].outcome = 'FAILED';

        const result = deriveProcessInsights(understanding);
        expect(result.insights.find(item => item.insightKind === 'FAILURE_LOCALIZED')).toMatchObject({
            confidence: 'SUPPORTED', areaIds: ['area:api'], boundaryIds: ['boundary:api'],
            detail: { level: 'STEP', pipelineStepId: 'step:1', providerUrls: ['https://ci.local/check/1'] },
        });
        expect(result.insights.find(item => item.insightKind === 'FAILURE_DOMAIN')).toMatchObject({
            derivation: 'HEURISTIC', confidence: 'TENTATIVE', detail: { domain: 'TEST' },
        });
        expect(result.insights.find(item => item.insightKind === 'REPRODUCTION_CANDIDATE')).toMatchObject({
            detail: { command: 'pnpm test', sourcePath: '.github/workflows/verify.yml' },
        });
    });

    it('does not invent a reproduction command for wrappers or an unmatched failure domain', () => {
        const understanding = fixture();
        const step = understanding.observations.pipelineSteps[0];
        step.name = 'Execute';
        step.execution = { kind: 'COMMAND', command: './ci.sh', semanticReach: 'WRAPPER' };
        step.lifecycle = 'COMPLETED';
        step.outcome = 'FAILED';
        const result = deriveProcessInsights(understanding);
        expect(result.insights.some(item => item.insightKind === 'REPRODUCTION_CANDIDATE')).toBe(false);
        expect(result.insights.find(item => item.insightKind === 'FAILURE_DOMAIN')).toMatchObject({
            confidence: 'UNKNOWN', detail: { domain: 'UNKNOWN' },
        });
    });

    it('explains blocked jobs, preserves matrix dimensions, and labels same-revision retry recovery as a candidate', () => {
        const understanding = fixture();
        understanding.observations.pipelineAttempts = [
            { ...understanding.observations.pipelineAttempts[0], id: 'attempt:1', attempt: 1, lifecycle: 'COMPLETED', outcome: 'FAILED' },
            { ...understanding.observations.pipelineAttempts[0], id: 'attempt:2', attempt: 2, lifecycle: 'COMPLETED', outcome: 'PASSED' },
        ];
        understanding.observations.pipelineJobs = [
            { ...understanding.observations.pipelineJobs[0], id: 'job:failed', pipelineAttemptId: 'attempt:1', matrix: { node: 20 }, lifecycle: 'COMPLETED', outcome: 'FAILED' },
            { ...understanding.observations.pipelineJobs[0], id: 'job:blocked', pipelineAttemptId: 'attempt:1', logicalJobId: 'deploy', name: 'Deploy', blockedByPipelineJobIds: ['job:failed'], lifecycle: 'NOT_OBSERVED', outcome: 'SKIPPED' },
            { ...understanding.observations.pipelineJobs[0], id: 'job:passed', pipelineAttemptId: 'attempt:2', matrix: { node: 20 }, lifecycle: 'COMPLETED', outcome: 'PASSED' },
        ];
        understanding.observations.pipelineSteps = [];
        understanding.observations.evidenceRuns = [];

        const result = deriveProcessInsights(understanding);
        expect(result.insights.find(item => item.insightKind === 'BLOCKED_DOWNSTREAM')).toMatchObject({
            detail: { pipelineJobId: 'job:blocked', blockers: [{ pipelineJobId: 'job:failed', outcome: 'FAILED' }] },
        });
        expect(result.insights.find(item => item.insightKind === 'MATRIX_RESULT')).toMatchObject({
            detail: { executions: [{ matrix: { node: 20 } }, { matrix: { node: 20 } }] },
        });
        expect(result.insights.find(item => item.insightKind === 'FLAKE_CANDIDATE')).toMatchObject({
            confidence: 'TENTATIVE', detail: { failedAttempt: 1, passedAttempt: 2 },
        });

        understanding.observations.pipelineJobs[2].matrix = { node: 22 };
        expect(deriveProcessInsights(understanding).insights.some(item => item.insightKind === 'FLAKE_CANDIDATE')).toBe(false);

        understanding.observations.pipelineJobs[0].outcome = 'PASSED';
        expect(deriveProcessInsights(understanding).insights.some(item => item.insightKind === 'BLOCKED_DOWNSTREAM')).toBe(false);
    });

    it('emits missing expected verification only from supported expectations and complete evidence acquisition', () => {
        const understanding = fixture();
        understanding.observations.evidenceRuns = [];
        expect(insight(understanding, 'MISSING_EXPECTED')).toMatchObject({
            confidence: 'SUPPORTED', areaIds: ['area:api'], detail: { expectationId: 'expectation:verify' },
        });
        understanding.observations.completeness[0].state = 'PARTIAL';
        expect(insight(understanding, 'MISSING_EXPECTED')).toBeUndefined();
        understanding.observations.completeness[0].state = 'COMPLETE';
        understanding.evidenceExpectations[0].support[0].confidence = 'UNKNOWN';
        expect(insight(understanding, 'MISSING_EXPECTED')).toBeUndefined();
    });

    it('reports changed-area and boundary gaps without calling them failures', () => {
        const understanding = fixture();
        understanding.evidenceAttributions = [];
        const gaps = deriveProcessInsights(understanding).insights.filter(item => item.insightKind === 'VERIFICATION_GAP');
        expect(gaps).toHaveLength(2);
        expect(gaps.map(item => item.id)).toEqual([
            'process-insight:verification-gap:area:area:api',
            'process-insight:verification-gap:boundary:boundary:api',
        ]);
        expect(gaps.every(item => item.summary.includes('not a failure'))).toBe(true);

        understanding.observations.completeness[0].state = 'PARTIAL';
        expect(deriveProcessInsights(understanding).insights.some(item => item.insightKind === 'VERIFICATION_GAP')).toBe(false);
    });

    it('is deterministic across input order and reports bounds explicitly', () => {
        const original = fixture();
        const before = structuredClone(original);
        const reordered = structuredClone(original);
        reordered.evidenceAttributions.reverse();
        reordered.observations.completeness.reverse();
        expect(deriveProcessInsights(reordered)).toEqual(deriveProcessInsights(original));
        expect(original).toEqual(before);

        const bounded = deriveProcessInsights(original, {
            maxInsights: 0, maxSupportingObservationIds: 1, maxCompletenessDimensions: 0,
        });
        expect(bounded.insights).toHaveLength(0);
        expect(bounded.completeness.state).toBe('PARTIAL');
        expect(bounded.truncation.map(item => item.collection)).toContain('insights');
    });

    it('derives retry recovery only from two retained point-in-time states of the same revision', () => {
        const earlier = fixture();
        earlier.observations.pipelineAttempts[0].lifecycle = 'COMPLETED';
        earlier.observations.pipelineAttempts[0].outcome = 'FAILED';
        earlier.observations.pipelineJobs[0].lifecycle = 'COMPLETED';
        earlier.observations.pipelineJobs[0].outcome = 'FAILED';
        earlier.observations.pipelineSteps = [];
        earlier.observations.evidenceRuns = [];
        const later = structuredClone(earlier);
        later.observations.pipelineAttempts.push({
            ...later.observations.pipelineAttempts[0], id: 'attempt:2', attempt: 2, lifecycle: 'COMPLETED', outcome: 'PASSED',
        });
        later.observations.pipelineJobs.push({
            ...later.observations.pipelineJobs[0], id: 'job:2', pipelineAttemptId: 'attempt:2', lifecycle: 'COMPLETED', outcome: 'PASSED',
        });
        const records = [
            record('record:1', '2026-09-01T10:00:00Z', earlier),
            record('record:2', '2026-09-01T10:10:00Z', later),
        ];
        const result = deriveRecoveryProcessInsights(records, {
            repositoryId: 'repository:1', revision: 'head',
            previousAt: '2026-09-01T10:05:00Z', currentAt: '2026-09-01T10:15:00Z',
        });
        expect(result.insights).toContainEqual(expect.objectContaining({
            insightKind: 'RECOVERY', detail: expect.objectContaining({
                conditionKind: 'FAILED_JOB', previousObservationId: 'job:1', resolvingObservationId: 'job:2',
            }),
        }));
    });

    it('detects recovery of a previously missing supported expectation', () => {
        const earlier = fixture();
        earlier.observations.evidenceRuns = [];
        const later = fixture();
        const result = deriveRecoveryProcessInsights([
            record('record:1', '2026-09-01T10:00:00Z', earlier),
            record('record:2', '2026-09-01T10:10:00Z', later),
        ], {
            repositoryId: 'repository:1', revision: 'head',
            previousAt: '2026-09-01T10:05:00Z', currentAt: '2026-09-01T10:15:00Z',
        });
        expect(result.insights).toContainEqual(expect.objectContaining({
            insightKind: 'RECOVERY', areaIds: ['area:api'],
            detail: expect.objectContaining({ conditionKind: 'MISSING_EXPECTED', resolvingObservationId: 'evidence:1' }),
        }));
    });
});
