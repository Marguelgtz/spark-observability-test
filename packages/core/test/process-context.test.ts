import { describe, expect, it } from 'vitest';
import {
    buildSteeringStateV0,
    deriveProcessContextV0,
    evaluateProcessContextUsefulness,
    type ClaimSupport,
    type ProcessInsightSet,
    type RepositoryUnderstanding,
} from '../src';

function support(): ClaimSupport[] {
    return [{
        provenance: { kind: 'WORKFLOW_ANALYZER', source: '.github/workflows/verify.yml' },
        derivation: 'DECLARED',
        confidence: 'SUPPORTED',
        evidence: [{ kind: 'OBSERVATION', id: 'definition:verify' }],
        completeness: { state: 'COMPLETE' },
    }];
}

function fixture(revision = 'head'): RepositoryUnderstanding {
    return {
        observations: {
            snapshot: {
                kind: 'repository-snapshot', id: `snapshot:${revision}`, repositoryId: 'repository:1', revision,
                source: { kind: 'vcs' },
            },
            change: {
                kind: 'change', id: `change:${revision}`, repositoryId: 'repository:1',
                baseRevision: `base:${revision}`, headRevision: revision,
                artifacts: [{ artifactId: 'artifact:api', status: 'MODIFIED' }], source: { kind: 'vcs' },
            },
            artifacts: [{
                kind: 'artifact', id: 'artifact:api', repositoryId: 'repository:1', revision,
                path: 'packages/api/index.ts', artifactKind: 'FILE', source: { kind: 'vcs' },
            }],
            pipelineDefinitions: [{
                kind: 'pipeline-definition', id: 'definition:verify', repositoryId: 'repository:1', revision,
                name: 'Verify', path: '.github/workflows/verify.yml', triggers: [{ event: 'pull_request' }],
                jobs: [{
                    id: 'verify', name: 'Verify',
                    steps: [{
                        name: 'Run unit tests',
                        execution: { kind: 'COMMAND', command: 'pnpm test', semanticReach: 'DIRECT' },
                    }],
                }],
                source: { kind: 'ci-definition' },
            }],
            pipelineRuns: [{
                kind: 'pipeline-run', id: 'run:1', pipelineDefinitionId: 'definition:verify',
                repositoryId: 'repository:1', revision, trigger: 'pull_request', source: { kind: 'ci' },
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
                kind: 'pipeline-step', id: 'step:1', pipelineJobId: 'job:1', sequence: 1,
                name: 'Run unit tests',
                execution: { kind: 'COMMAND', command: 'pnpm test', semanticReach: 'DIRECT' },
                lifecycle: 'RUNNING', outcome: 'UNKNOWN', source: { kind: 'ci' },
            }],
            evidenceRuns: [{
                kind: 'evidence-run', id: 'evidence:1', repositoryId: 'repository:1', revision,
                name: 'verify', evidenceKind: 'github-check-run', lifecycle: 'RUNNING', outcome: 'UNKNOWN',
                pipelineRunId: 'run:1', pipelineAttemptId: 'attempt:1', pipelineJobId: 'job:1',
                pipelineStepId: 'step:1', source: { kind: 'ci' }, url: 'https://ci.local/check/1',
            }],
            deployments: [],
            completeness: [{ source: 'github-check-runs', state: 'COMPLETE' }],
        },
        areas: [{ id: 'area:api', label: 'API', roles: ['FUNCTIONAL'], support: support() }],
        memberships: [{
            id: 'membership:api', areaId: 'area:api', target: { kind: 'PATH', path: 'packages/api' },
            support: support(),
        }],
        relationships: [],
        boundaries: [{
            id: 'boundary:api', kind: 'PUBLIC_INTERFACE', label: 'API boundary',
            artifactIds: ['artifact:api'], connectedAreaIds: ['area:api'], support: support(),
        }],
        evidenceAttributions: [
            {
                id: 'attribution:area', evidenceRunId: 'evidence:1',
                target: { kind: 'AREA', areaId: 'area:api' }, support: support(),
            },
            {
                id: 'attribution:boundary', evidenceRunId: 'evidence:1',
                target: { kind: 'BOUNDARY', boundaryId: 'boundary:api' }, support: support(),
            },
        ],
        evidenceExpectations: [{
            id: 'expectation:verify', name: 'verify', target: { kind: 'AREA', areaId: 'area:api' },
            match: { evidenceName: 'verify', pipelineDefinitionId: 'definition:verify', logicalJobId: 'verify' },
            support: support(),
        }],
        completeness: [],
    };
}

function failedFixture(revision = 'head'): RepositoryUnderstanding {
    const understanding = fixture(revision);
    for (const item of [
        understanding.observations.pipelineAttempts[0],
        understanding.observations.pipelineJobs[0],
        understanding.observations.pipelineSteps[0],
        understanding.observations.evidenceRuns[0],
    ]) {
        item.lifecycle = 'COMPLETED';
        item.outcome = 'FAILED';
    }
    return understanding;
}

function recoverySet(revision = 'head'): ProcessInsightSet {
    return {
        schemaVersion: 'process-insights/v1',
        repositoryId: 'repository:1',
        revision,
        insights: [{
            kind: 'process-insight',
            id: 'process-insight:recovery:job:job:old:job:new',
            insightKind: 'RECOVERY',
            repositoryId: 'repository:1',
            revision,
            derivation: 'DETERMINISTIC',
            confidence: 'SUPPORTED',
            summary: 'verify recovered on a later same-revision attempt',
            supportingObservationIds: ['job:new', 'job:old'],
            areaIds: [],
            boundaryIds: [],
            completeness: [{ source: 'github-check-runs', state: 'COMPLETE' }],
            detail: {
                insightKind: 'RECOVERY', conditionKind: 'FAILED_JOB',
                previousAt: '2026-09-01T10:00:00Z', currentAt: '2026-09-01T10:10:00Z',
                previousSupplyingRecordId: 'record:old', currentSupplyingRecordId: 'record:new',
                previousObservationId: 'job:old', resolvingObservationId: 'job:new',
            },
        }],
        completeness: { state: 'COMPLETE', normalizationIssueCount: 0 },
        truncation: [],
    };
}

describe('agent-facing CI/CD process context', () => {
    it('wraps grounded G7 insights with a formal subject, lifecycle, and reproduction candidate', () => {
        const context = deriveProcessContextV0(failedFixture(), { contextId: 'failure-1' });
        const localized = context.insights.find(item => item.insightKind === 'FAILURE_LOCALIZED');

        expect(context).toMatchObject({
            schemaVersion: 'process-context/v0', resolutionAuthority: 'COMPLETE',
            recoveryAssessment: 'NOT_PROVIDED', shadowOnly: true, prescriptive: false,
        });
        expect(localized).toMatchObject({
            schemaVersion: 'process-insight/v0', state: 'ACTIVE', carriedForward: false,
            subject: { kind: 'PIPELINE_STEP', id: 'step:1' },
            areaIds: ['area:api'], boundaryIds: ['boundary:api'],
            reproductionCandidate: {
                pipelineStepId: 'step:1', command: 'pnpm test', sourcePath: '.github/workflows/verify.yml',
            },
        });
        expect(localized?.id).toBe(`${localized?.stableInsightId}:context:failure-1`);
    });

    it('links repeated stable conditions through supersedes without mutating either input', () => {
        const understanding = failedFixture();
        const before = structuredClone(understanding);
        const first = deriveProcessContextV0(understanding, { contextId: 'failure-1' });
        const firstBefore = structuredClone(first);
        const second = deriveProcessContextV0(understanding, { contextId: 'failure-2', previous: first });
        const earlier = first.insights.find(item => item.insightKind === 'FAILURE_LOCALIZED');
        const current = second.insights.find(item => item.insightKind === 'FAILURE_LOCALIZED');

        expect(current).toMatchObject({ state: 'ACTIVE', supersedes: [earlier?.id], carriedForward: false });
        expect(understanding).toEqual(before);
        expect(first).toEqual(firstBefore);
        expect(deriveProcessContextV0(understanding, { contextId: 'failure-2', previous: first })).toEqual(second);
    });

    it('resolves a disappeared same-revision condition only under complete observation', () => {
        const previous = deriveProcessContextV0(failedFixture(), { contextId: 'failure' });
        const context = deriveProcessContextV0(fixture(), { contextId: 'healthy', previous });
        const resolved = context.insights.find(item => item.insightKind === 'FAILURE_LOCALIZED');

        expect(resolved).toMatchObject({
            state: 'RESOLVED', resolutionReason: 'CONDITION_ABSENT_IN_COMPLETE_OBSERVATION',
            resolvedBy: 'process-context:healthy', carriedForward: false,
        });
    });

    it('carries a disappeared condition forward when current acquisition is partial', () => {
        const previous = deriveProcessContextV0(failedFixture(), { contextId: 'failure' });
        const partial = fixture();
        partial.observations.completeness[0].state = 'PARTIAL';
        const context = deriveProcessContextV0(partial, { contextId: 'partial', previous });
        const carried = context.insights.find(item => item.insightKind === 'FAILURE_LOCALIZED');

        expect(context).toMatchObject({ resolutionAuthority: 'PARTIAL', completeness: 'PARTIAL' });
        expect(carried).toMatchObject({ state: 'ACTIVE', carriedForward: true, supersedes: [
            previous.insights.find(item => item.insightKind === 'FAILURE_LOCALIZED')?.id,
        ] });
        expect(carried?.resolutionReason).toBeUndefined();
        expect(carried?.resolvedBy).toBeUndefined();
    });

    it('marks old-revision conditions obsolete without claiming that they were fixed', () => {
        const previous = deriveProcessContextV0(failedFixture('revision:1'), { contextId: 'revision-1' });
        const current = fixture('revision:2');
        current.observations.completeness[0].state = 'PARTIAL';
        const context = deriveProcessContextV0(current, { contextId: 'revision-2', previous });
        const obsolete = context.insights.find(item => item.insightKind === 'FAILURE_LOCALIZED');

        expect(obsolete).toMatchObject({ state: 'RESOLVED', resolutionReason: 'REVISION_SUPERSEDED' });
    });

    it('bounds retained active and resolved lifecycle history with explicit truncation', () => {
        const failed = deriveProcessContextV0(failedFixture(), { contextId: 'failure' });
        const context = deriveProcessContextV0(fixture(), {
            contextId: 'healthy', previous: failed, recoveryInsights: recoverySet(),
            limits: { maxActiveInsights: 1, maxResolvedInsights: 1 },
        });

        expect(context.insights.filter(item => item.state === 'ACTIVE')).toHaveLength(1);
        expect(context.insights.filter(item => item.state === 'RESOLVED')).toHaveLength(1);
        expect(context.truncation.map(item => item.collection).sort()).toEqual(['activeInsights', 'resolvedInsights']);
        expect(context.completeness).toBe('PARTIAL');
    });

    it('keeps CI/CD as a cloned, neutral steering-state input with no decision or action', () => {
        const context = deriveProcessContextV0(fixture(), { contextId: 'normal' });
        const state = buildSteeringStateV0(context);

        expect(state).toMatchObject({
            schemaVersion: 'steering-state/v0', inputKinds: ['CI_CD_PROCESS_CONTEXT'],
            shadowOnly: true, prescriptive: false, automaticSteering: false,
        });
        expect(Object.keys(state.inputs)).toEqual(['ciCdProcess']);
        expect(state).not.toHaveProperty('decision');
        expect(state).not.toHaveProperty('action');
        context.insights[0].summary = 'mutated after construction';
        expect(state.inputs.ciCdProcess.insights[0].summary).not.toBe('mutated after construction');
    });

    it('uses an explicit six-question denominator and abstains on unassessed recovery', () => {
        const study = evaluateProcessContextUsefulness([
            deriveProcessContextV0(fixture(), { contextId: 'normal' }),
        ]);

        expect(study).toMatchObject({
            contextCount: 1, caseDenominator: 6, answeredCount: 5,
            supportedAnswerCount: 5, tentativeAnswerCount: 0, unknownCount: 1, truncated: false,
        });
        expect(study.cases.find(item => item.question === 'RECOVERED')).toMatchObject({
            status: 'UNKNOWN', confidence: 'UNKNOWN', supportingInsightIds: [],
        });
        expect(study.cases.find(item => item.question === 'FAILED')?.answer)
            .toContain('No failed condition was observed');
    });

    it('answers recovery only when a complete two-state recovery assessment is supplied', () => {
        const context = deriveProcessContextV0(fixture(), {
            contextId: 'recovered', recoveryInsights: recoverySet(),
        });
        const recovery = context.insights.find(item => item.insightKind === 'RECOVERY');
        const study = evaluateProcessContextUsefulness([context]);

        expect(context.recoveryAssessment).toBe('COMPLETE');
        expect(recovery).toMatchObject({ state: 'ACTIVE', subject: { kind: 'OBSERVATION', id: 'job:new' } });
        expect(study).toMatchObject({ caseDenominator: 6, answeredCount: 6, unknownCount: 0 });
        expect(study.cases.find(item => item.question === 'RECOVERED')).toMatchObject({
            status: 'ANSWERED', supportingInsightIds: [recovery?.id],
        });
    });

    it('does not resolve or negatively answer recovery when its comparison is omitted', () => {
        const first = deriveProcessContextV0(fixture(), {
            contextId: 'with-recovery', recoveryInsights: recoverySet(),
        });
        const next = deriveProcessContextV0(fixture(), { contextId: 'without-recovery', previous: first });
        const recovery = next.insights.find(item => item.insightKind === 'RECOVERY');

        expect(recovery).toMatchObject({ state: 'ACTIVE', carriedForward: true });
        expect(evaluateProcessContextUsefulness([next]).cases.find(item => item.question === 'RECOVERED'))
            .toMatchObject({ status: 'ANSWERED', supportingInsightIds: [recovery?.id] });
    });

    it('reports all questions unknown under partial current and absent recovery assessment', () => {
        const partial = fixture();
        partial.observations.completeness[0].state = 'PARTIAL';
        const study = evaluateProcessContextUsefulness([
            deriveProcessContextV0(partial, { contextId: 'partial' }),
        ], { maxUsefulnessCases: 2 });

        expect(study).toMatchObject({
            caseDenominator: 6, answeredCount: 0, unknownCount: 6, truncated: true,
        });
        expect(study.cases).toHaveLength(2);
    });
});
