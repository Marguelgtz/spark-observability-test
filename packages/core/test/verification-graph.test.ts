import { describe, expect, it } from 'vitest';
import {
    buildVerificationGraph,
    inspectVerificationGraph,
    serializeVerificationGraphInspection,
    type ClaimSupport,
    type RepositoryUnderstanding,
} from '../src';

function support(evidence: ClaimSupport['evidence'] = []): ClaimSupport[] {
    return [{
        provenance: { kind: 'WORKFLOW_ANALYZER', source: '.github/workflows/verify.yml', version: '1' },
        derivation: 'DECLARED',
        confidence: 'SUPPORTED',
        evidence,
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
            artifacts: [
                {
                    kind: 'artifact', id: 'artifact:api', repositoryId: 'repository:1', revision: 'head',
                    path: 'packages/api/index.ts', artifactKind: 'FILE', source: { kind: 'vcs' },
                },
                {
                    kind: 'artifact', id: 'artifact:docs', repositoryId: 'repository:1', revision: 'head',
                    path: 'docs/readme.md', artifactKind: 'FILE', source: { kind: 'vcs' },
                },
            ],
            pipelineDefinitions: [{
                kind: 'pipeline-definition', id: 'definition:verify', repositoryId: 'repository:1', revision: 'head',
                name: 'Verify', path: '.github/workflows/verify.yml', triggers: [{ event: 'pull_request' }],
                jobs: [{ id: 'verify', steps: [{ name: 'test', execution: { kind: 'COMMAND', command: 'pnpm test' } }] }],
                source: { kind: 'ci-definition' },
            }],
            pipelineRuns: [{
                kind: 'pipeline-run', id: 'pipeline-run:1', pipelineDefinitionId: 'definition:verify',
                repositoryId: 'repository:1', revision: 'head', trigger: 'pull_request', source: { kind: 'ci' },
            }],
            pipelineAttempts: [{
                kind: 'pipeline-attempt', id: 'pipeline-attempt:1', pipelineRunId: 'pipeline-run:1', attempt: 1,
                lifecycle: 'COMPLETED', outcome: 'PASSED', source: { kind: 'ci' },
            }],
            pipelineJobs: [{
                kind: 'pipeline-job', id: 'pipeline-job:1', pipelineAttemptId: 'pipeline-attempt:1',
                logicalJobId: 'verify', name: 'verify', lifecycle: 'COMPLETED', outcome: 'PASSED', source: { kind: 'ci' },
            }],
            pipelineSteps: [{
                kind: 'pipeline-step', id: 'pipeline-step:1', pipelineJobId: 'pipeline-job:1', sequence: 1,
                name: 'test', lifecycle: 'COMPLETED', outcome: 'PASSED', source: { kind: 'ci' },
            }],
            evidenceRuns: [{
                kind: 'evidence-run', id: 'evidence-run:1', repositoryId: 'repository:1', revision: 'head',
                name: 'verify', evidenceKind: 'github-check-run', lifecycle: 'COMPLETED', outcome: 'PASSED',
                pipelineRunId: 'pipeline-run:1', pipelineAttemptId: 'pipeline-attempt:1', pipelineJobId: 'pipeline-job:1',
                source: { kind: 'ci', id: 'github-check-run:1' },
            }],
            completeness: [
                { source: 'github-check-runs', state: 'COMPLETE', observedCount: 1, expectedCount: 1 },
                { source: 'github-actions-runs', state: 'COMPLETE' },
            ],
        },
        areas: [
            { id: 'area:api', label: 'API', roles: ['PROJECT'], support: support() },
            { id: 'area:docs', label: 'Docs', roles: ['FUNCTIONAL'], support: support() },
        ],
        memberships: [
            { id: 'membership:api', areaId: 'area:api', target: { kind: 'PATH', path: 'packages/api' }, support: support() },
            { id: 'membership:docs', areaId: 'area:docs', target: { kind: 'PATH', path: 'docs' }, support: support() },
        ],
        relationships: [{
            id: 'relationship:api-docs', sourceAreaId: 'area:api', targetAreaId: 'area:docs', type: 'DEPENDS_ON',
            support: support(),
        }],
        boundaries: [{
            id: 'boundary:api', kind: 'PUBLIC_INTERFACE', label: 'public API', artifactIds: ['artifact:api'],
            connectedAreaIds: ['area:api'], support: support(),
        }],
        evidenceAttributions: [{
            id: 'attribution:api', evidenceRunId: 'evidence-run:1', target: { kind: 'AREA', areaId: 'area:api' },
            support: support([{ kind: 'EVIDENCE_RUN', id: 'evidence-run:1' }]),
        }],
        evidenceExpectations: [{
            id: 'expectation:verify', name: 'verify', target: { kind: 'AREA', areaId: 'area:api' },
            match: {
                evidenceName: 'verify', evidenceKind: 'github-check-run',
                pipelineDefinitionId: 'definition:verify', logicalJobId: 'verify',
            },
            support: support([{ kind: 'OBSERVATION', id: 'definition:verify' }]),
        }],
        completeness: [{
            id: 'completeness:semantic', dimension: 'ci-process:semantic-attribution', state: 'COMPLETE',
            support: support(),
        }],
    };
}

describe('verification graph projection', () => {
    it('connects a changed area through expectation, job, step, and result with canonical traceability', () => {
        const understanding = fixture();
        const before = structuredClone(understanding);
        const graph = buildVerificationGraph(understanding);
        const node = (kind: string, canonicalId: string) => graph.nodes.find(item =>
            item.kind === kind && item.canonicalId === canonicalId)?.id;
        const change = node('CHANGE', 'change:1')!;
        const area = node('AREA', 'area:api')!;
        const expectation = node('EXPECTATION', 'expectation:verify')!;
        const job = node('PIPELINE_JOB', 'pipeline-job:1')!;
        const step = node('PIPELINE_STEP', 'pipeline-step:1')!;
        const stepResult = graph.nodes.find(item => item.kind === 'RESULT'
            && item.canonicalId === 'pipeline-step:1' && item.sourceKind === 'PROCESS')!.id;

        expect(graph.nodes.find(item => item.id === expectation)?.expectationState).toBe('OBSERVED');
        expect(graph.edges).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: 'CHANGE_TOUCHES_AREA', from: change, to: area, claimId: 'membership:api' }),
            expect.objectContaining({ kind: 'TARGET_EXPECTS_EVIDENCE', from: area, to: expectation, claimId: 'expectation:verify' }),
            expect.objectContaining({ kind: 'EXPECTATION_OBSERVED_BY', from: expectation, to: job }),
            expect.objectContaining({ kind: 'PIPELINE_JOB_STEP', from: job, to: step }),
            expect.objectContaining({ kind: 'PROCESS_RESULT', from: step, to: stepResult }),
            expect.objectContaining({ kind: 'ATTRIBUTED_RESULT', from: area, claimId: 'attribution:api' }),
        ]));
        expect(graph.completeness.state).toBe('COMPLETE');
        expect(understanding).toEqual(before);
    });

    it('distinguishes supported missing evidence from unknown acquisition', () => {
        const missing = fixture();
        missing.observations.evidenceRuns = [];
        const missingGraph = buildVerificationGraph(missing);
        expect(missingGraph.nodes).toContainEqual(expect.objectContaining({
            kind: 'EXPECTATION', canonicalId: 'expectation:verify', expectationState: 'NOT_OBSERVED',
        }));
        expect(missingGraph.nodes).toContainEqual(expect.objectContaining({
            kind: 'RESULT', canonicalId: 'expectation:verify', lifecycle: 'NOT_OBSERVED', sourceKind: 'EXPECTATION',
        }));

        missing.observations.completeness[0].state = 'PARTIAL';
        const unknownGraph = buildVerificationGraph(missing);
        expect(unknownGraph.nodes).toContainEqual(expect.objectContaining({
            kind: 'EXPECTATION', canonicalId: 'expectation:verify', expectationState: 'UNKNOWN',
        }));
        expect(unknownGraph.nodes).toContainEqual(expect.objectContaining({
            kind: 'RESULT', canonicalId: 'expectation:verify', lifecycle: 'UNKNOWN', sourceKind: 'EXPECTATION',
        }));
    });

    it('does not call an unsupported expectation observed merely because its label matches evidence', () => {
        const understanding = fixture();
        understanding.evidenceExpectations[0].support[0].confidence = 'UNKNOWN';
        understanding.evidenceExpectations[0].support[0].completeness = { state: 'PARTIAL' };

        const graph = buildVerificationGraph(understanding);

        expect(graph.nodes).toContainEqual(expect.objectContaining({
            kind: 'EXPECTATION', canonicalId: 'expectation:verify', expectationState: 'UNKNOWN',
        }));
        expect(graph.edges.some(edge => edge.kind === 'EXPECTATION_OBSERVED_BY')).toBe(false);
    });

    it('serializes observations, claims, provenance, completeness, and relationships deterministically', () => {
        const original = fixture();
        const reordered = structuredClone(original);
        reordered.observations.artifacts.reverse();
        reordered.observations.pipelineDefinitions.reverse();
        reordered.observations.pipelineRuns.reverse();
        reordered.observations.pipelineAttempts.reverse();
        reordered.observations.pipelineJobs.reverse();
        reordered.observations.pipelineSteps.reverse();
        reordered.observations.evidenceRuns.reverse();
        reordered.observations.completeness.reverse();
        reordered.areas.reverse();
        reordered.memberships.reverse();
        reordered.relationships.reverse();
        reordered.boundaries.reverse();
        reordered.evidenceAttributions.reverse();
        reordered.evidenceExpectations.reverse();
        reordered.completeness.reverse();

        const left = serializeVerificationGraphInspection(inspectVerificationGraph(original));
        const right = serializeVerificationGraphInspection(inspectVerificationGraph(reordered));

        expect(right).toBe(left);
        const inspection = JSON.parse(left);
        expect(inspection.schemaVersion).toBe('verification-graph-inspection/v1');
        expect(inspection.observations.evidenceRuns[0]).toMatchObject({ id: 'evidence-run:1', outcome: 'PASSED' });
        expect(inspection.claims.evidenceAttributions[0]).toMatchObject({
            id: 'attribution:api', target: { kind: 'AREA', areaId: 'area:api' },
            support: [expect.objectContaining({ provenance: expect.objectContaining({ kind: 'WORKFLOW_ANALYZER' }) })],
        });
        expect(inspection.claims.relationships[0].id).toBe('relationship:api-docs');
        expect(inspection.claimCompleteness[0]).toMatchObject({ dimension: 'ci-process:semantic-attribution' });
    });

    it('reports every graph and inspection bound explicitly', () => {
        const inspection = inspectVerificationGraph(fixture(), {
            maxNodes: 3,
            maxEdges: 2,
            maxInspectionItemsPerCollection: 1,
            maxSupportsPerClaim: 1,
            maxEvidenceReferencesPerSupport: 1,
        });

        expect(inspection.graph.nodes).toHaveLength(3);
        expect(inspection.graph.nodes[0]).toMatchObject({ kind: 'CHANGE', canonicalId: 'change:1' });
        expect(inspection.graph.completeness.state).toBe('PARTIAL');
        expect(inspection.truncation.map(item => item.collection)).toEqual(expect.arrayContaining([
            'graph.nodes', 'graph.edges', 'observations.artifacts', 'claims.areas',
        ]));
    });
});
