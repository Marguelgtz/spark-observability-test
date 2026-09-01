import { describe, expect, it } from 'vitest';
import { normalizeRepositoryUnderstanding } from '../src/understanding-normalize';
import type { ClaimSupport, RepositoryUnderstanding } from '../src/understanding';

const support: ClaimSupport = {
    provenance: { kind: 'GENERIC_ANALYZER', source: 'test' },
    derivation: 'HEURISTIC',
    confidence: 'TENTATIVE',
    evidence: [],
    completeness: { state: 'COMPLETE' },
};

function fixture(): RepositoryUnderstanding {
    return {
        observations: {
            snapshot: {
                kind: 'repository-snapshot', id: 'snapshot', repositoryId: 'repo', revision: 'head', source: { kind: 'vcs' },
            },
            change: {
                kind: 'change', id: 'change', repositoryId: 'repo', baseRevision: 'base', headRevision: 'head',
                artifacts: [{ artifactId: 'artifact:z', status: 'MODIFIED' }, { artifactId: 'artifact:a', status: 'ADDED' }],
                source: { kind: 'vcs' },
            },
            artifacts: [
                { kind: 'artifact', id: 'artifact:z', repositoryId: 'repo', revision: 'head', path: 'z.ts', artifactKind: 'FILE', source: { kind: 'vcs' } },
                { kind: 'artifact', id: 'artifact:a', repositoryId: 'repo', revision: 'head', path: 'a.ts', artifactKind: 'FILE', source: { kind: 'vcs' } },
            ],
            pipelineDefinitions: [],
            pipelineRuns: [],
            pipelineAttempts: [],
            pipelineJobs: [],
            pipelineSteps: [],
            evidenceRuns: [],
            completeness: [{ source: 'tree', state: 'COMPLETE' }, { source: 'changes', state: 'COMPLETE' }],
        },
        areas: [
            { id: 'area:z', label: 'Z', roles: ['PROJECT'], support: [support] },
            { id: 'area:a', label: 'A', roles: ['PROJECT'], support: [support] },
        ],
        memberships: [],
        relationships: [],
        boundaries: [],
        evidenceAttributions: [],
        evidenceExpectations: [],
        completeness: [],
    };
}

describe('repository understanding normalization', () => {
    it('sorts canonical collections without mutating input', () => {
        const input = fixture();
        const result = normalizeRepositoryUnderstanding(input);

        expect(result.understanding.observations.artifacts.map(item => item.id)).toEqual(['artifact:a', 'artifact:z']);
        expect(result.understanding.observations.change.artifacts.map(item => item.artifactId)).toEqual(['artifact:a', 'artifact:z']);
        expect(result.understanding.observations.completeness.map(item => item.source)).toEqual(['changes', 'tree']);
        expect(result.understanding.areas.map(item => item.id)).toEqual(['area:a', 'area:z']);
        expect(input.observations.artifacts.map(item => item.id)).toEqual(['artifact:z', 'artifact:a']);
        expect(result.issues).toEqual([]);
    });

    it('retains the first duplicate and removes structurally dangling claims', () => {
        const input = fixture();
        input.areas.push({ id: 'area:a', label: 'Duplicate', roles: ['FUNCTIONAL'], support: [support] });
        input.memberships.push(
            { id: 'membership:valid', areaId: 'area:a', target: { kind: 'ARTIFACT', artifactId: 'artifact:a' }, support: [support] },
            { id: 'membership:dangling', areaId: 'area:missing', target: { kind: 'PATH', path: 'src' }, support: [support] },
        );
        input.relationships.push({
            id: 'relationship:dangling', sourceAreaId: 'area:a', targetAreaId: 'area:missing', type: 'DEPENDS_ON', support: [support],
        });

        const result = normalizeRepositoryUnderstanding(input);

        expect(result.understanding.areas.find(area => area.id === 'area:a')?.label).toBe('A');
        expect(result.understanding.memberships.map(item => item.id)).toEqual(['membership:valid']);
        expect(result.understanding.relationships).toEqual([]);
        expect(result.issues.map(issue => issue.code)).toEqual(['DUPLICATE_ID', 'DANGLING_REFERENCE', 'DANGLING_REFERENCE']);
    });

    it('falls back from invalid runtime states and removes dangling support references', () => {
        const input = fixture();
        input.areas[0].support[0] = {
            ...support,
            confidence: 'CERTAIN' as ClaimSupport['confidence'],
            completeness: { state: 'FULL' as ClaimSupport['completeness']['state'] },
            evidence: [{ kind: 'EVIDENCE_RUN', id: 'run:missing' }],
        };
        input.observations.completeness[0].state = 'TRUNCATED' as typeof input.observations.completeness[number]['state'];

        const result = normalizeRepositoryUnderstanding(input);
        const normalizedSupport = result.understanding.areas.find(area => area.id === 'area:z')!.support[0];

        expect(normalizedSupport).toMatchObject({ confidence: 'UNKNOWN', completeness: { state: 'UNAVAILABLE' }, evidence: [] });
        expect(result.understanding.observations.completeness.find(item => item.source === 'tree')?.state).toBe('UNAVAILABLE');
        expect(result.issues.map(issue => issue.code)).toEqual([
            'INVALID_CONFIDENCE',
            'DANGLING_REFERENCE',
            'INVALID_COMPLETENESS',
            'INVALID_COMPLETENESS',
        ]);
    });

    it('normalizes the process hierarchy and removes dangling descendants and evidence links', () => {
        const input = fixture();
        input.observations.pipelineDefinitions.push({
            kind: 'pipeline-definition', id: 'definition:verify', repositoryId: 'repo', revision: 'head', name: 'Verify',
            path: '.automation/verify.yml', triggers: [{ event: 'proposed-change' }], jobs: [{ id: 'test' }],
            source: { kind: 'ci-definition' },
        });
        input.observations.pipelineRuns.push(
            {
                kind: 'pipeline-run', id: 'pipeline-run:7', pipelineDefinitionId: 'definition:verify', repositoryId: 'repo',
                revision: 'head', trigger: 'proposed-change', source: { kind: 'ci' },
            },
            {
                kind: 'pipeline-run', id: 'pipeline-run:without-definition', pipelineDefinitionId: 'definition:missing', repositoryId: 'repo',
                revision: 'head', trigger: 'proposed-change', source: { kind: 'ci' },
            },
        );
        input.observations.pipelineAttempts.push(
            {
                kind: 'pipeline-attempt', id: 'attempt:7:1', pipelineRunId: 'pipeline-run:7', attempt: 1,
                lifecycle: 'DONE' as never, outcome: 'SUCCESS' as never, source: { kind: 'ci' },
            },
            {
                kind: 'pipeline-attempt', id: 'attempt:dangling', pipelineRunId: 'pipeline-run:missing', attempt: 1,
                lifecycle: 'COMPLETED', outcome: 'FAILED', source: { kind: 'ci' },
            },
        );
        input.observations.pipelineJobs.push({
            kind: 'pipeline-job', id: 'job:1', pipelineAttemptId: 'attempt:7:1', name: 'test',
            lifecycle: 'COMPLETED', outcome: 'PASSED', blockedByPipelineJobIds: ['job:missing'], source: { kind: 'ci' },
        });
        input.observations.pipelineSteps.push({
            kind: 'pipeline-step', id: 'step:1', pipelineJobId: 'job:1', sequence: 1, name: 'test',
            lifecycle: 'COMPLETED', outcome: 'PASSED', source: { kind: 'ci' },
        });
        input.observations.evidenceRuns.push({
            kind: 'evidence-run', id: 'evidence:1', repositoryId: 'repo', revision: 'head', name: 'test', evidenceKind: 'test',
            lifecycle: 'COMPLETED', outcome: 'PASSED', pipelineRunId: 'pipeline-run:7',
            pipelineAttemptId: 'attempt:7:1', pipelineJobId: 'job:missing',
            pipelineStepId: 'step:1', source: { kind: 'ci' },
        });

        const result = normalizeRepositoryUnderstanding(input);

        expect(result.understanding.observations.pipelineRuns.map(item => item.id)).toEqual([
            'pipeline-run:7', 'pipeline-run:without-definition',
        ]);
        expect(result.understanding.observations.pipelineRuns[1]).toHaveProperty('pipelineDefinitionId', 'definition:missing');
        expect(result.understanding.observations.pipelineAttempts).toEqual([
            expect.objectContaining({ id: 'attempt:7:1', lifecycle: 'UNKNOWN', outcome: 'UNKNOWN' }),
        ]);
        expect(result.understanding.observations.pipelineJobs.map(item => item.id)).toEqual(['job:1']);
        expect(result.understanding.observations.pipelineJobs[0]).not.toHaveProperty('blockedByPipelineJobIds');
        expect(result.understanding.observations.pipelineSteps.map(item => item.id)).toEqual(['step:1']);
        expect(result.understanding.observations.evidenceRuns[0]).toMatchObject({
            pipelineRunId: 'pipeline-run:7', pipelineAttemptId: 'attempt:7:1', pipelineStepId: 'step:1',
        });
        expect(result.understanding.observations.evidenceRuns[0]).not.toHaveProperty('pipelineJobId');
        expect(result.issues.map(issue => issue.code)).toEqual([
            'DANGLING_REFERENCE',
            'INVALID_PROCESS_LIFECYCLE',
            'INVALID_PROCESS_OUTCOME',
            'DANGLING_REFERENCE',
            'DANGLING_REFERENCE',
        ]);
    });

    it('removes process links whose ancestry belongs to another revision', () => {
        const input = fixture();
        input.observations.pipelineRuns.push({
            kind: 'pipeline-run', id: 'pipeline-run:old', repositoryId: 'repo', revision: 'old',
            trigger: 'pull_request', source: { kind: 'ci' },
        });
        input.observations.pipelineAttempts.push({
            kind: 'pipeline-attempt', id: 'attempt:old', pipelineRunId: 'pipeline-run:old', attempt: 1,
            lifecycle: 'COMPLETED', outcome: 'PASSED', source: { kind: 'ci' },
        });
        input.observations.pipelineJobs.push({
            kind: 'pipeline-job', id: 'job:old', pipelineAttemptId: 'attempt:old', name: 'verify',
            lifecycle: 'COMPLETED', outcome: 'PASSED', source: { kind: 'ci' },
        });
        input.observations.pipelineSteps.push({
            kind: 'pipeline-step', id: 'step:old', pipelineJobId: 'job:old', sequence: 1, name: 'test',
            lifecycle: 'COMPLETED', outcome: 'PASSED', source: { kind: 'ci' },
        });
        input.observations.evidenceRuns.push({
            kind: 'evidence-run', id: 'evidence:head', repositoryId: 'repo', revision: 'head', name: 'verify',
            evidenceKind: 'test', lifecycle: 'COMPLETED', outcome: 'PASSED',
            pipelineRunId: 'pipeline-run:old', pipelineAttemptId: 'attempt:old', pipelineJobId: 'job:old',
            pipelineStepId: 'step:old', source: { kind: 'ci' },
        });

        const result = normalizeRepositoryUnderstanding(input);

        expect(result.understanding.observations.evidenceRuns[0]).not.toHaveProperty('pipelineRunId');
        expect(result.understanding.observations.evidenceRuns[0]).not.toHaveProperty('pipelineAttemptId');
        expect(result.understanding.observations.evidenceRuns[0]).not.toHaveProperty('pipelineJobId');
        expect(result.understanding.observations.evidenceRuns[0]).not.toHaveProperty('pipelineStepId');
        expect(result.issues.map(issue => issue.code)).toEqual([
            'DANGLING_REFERENCE', 'DANGLING_REFERENCE', 'DANGLING_REFERENCE', 'DANGLING_REFERENCE',
        ]);
    });
});
