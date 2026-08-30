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
});
