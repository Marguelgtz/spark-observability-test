import { describe, expect, it } from 'vitest';
import type {
    Area,
    AreaMembership,
    AreaRelationship,
    Boundary,
    ClaimSupport,
    EvidenceAttribution,
    EvidenceExpectation,
} from '../src/understanding';

const support: ClaimSupport = {
    provenance: { kind: 'ECOSYSTEM_ADAPTER', source: 'workspace-manifest', version: '1' },
    derivation: 'DETERMINISTIC',
    confidence: 'SUPPORTED',
    evidence: [{ kind: 'ARTIFACT', id: 'artifact:package.json' }],
    completeness: { state: 'PARTIAL', reason: 'one optional manifest was unavailable' },
};

describe('repository understanding claims', () => {
    it('keeps provenance, derivation, confidence, references, and completeness independent', () => {
        expect(support).toEqual({
            provenance: { kind: 'ECOSYSTEM_ADAPTER', source: 'workspace-manifest', version: '1' },
            derivation: 'DETERMINISTIC',
            confidence: 'SUPPORTED',
            evidence: [{ kind: 'ARTIFACT', id: 'artifact:package.json' }],
            completeness: { state: 'PARTIAL', reason: 'one optional manifest was unavailable' },
        });
    });

    it('represents hierarchy, overlapping memberships, typed edges, and unconnected boundaries', () => {
        const areas: Area[] = [
            { id: 'area:repo', label: 'Repository', roles: ['STRUCTURAL'], support: [support] },
            {
                id: 'area:api',
                label: 'API',
                roles: ['PROJECT', { extension: 'RUNTIME' }],
                parentAreaId: 'area:repo',
                support: [support],
            },
            { id: 'area:payments', label: 'Payments', roles: ['FUNCTIONAL'], support: [support] },
        ];
        const memberships: AreaMembership[] = [
            {
                id: 'membership:api:index',
                areaId: 'area:api',
                target: { kind: 'ARTIFACT', artifactId: 'artifact:apps/api/index.ts' },
                view: 'workspace',
                support: [support],
            },
            {
                id: 'membership:payments:index',
                areaId: 'area:payments',
                target: { kind: 'ARTIFACT', artifactId: 'artifact:apps/api/index.ts' },
                view: 'functional',
                support: [support],
            },
        ];
        const relationships: AreaRelationship[] = [{
            id: 'relationship:web:api',
            sourceAreaId: 'area:web',
            targetAreaId: 'area:api',
            type: 'DEPENDS_ON',
            support: [support],
        }];
        const boundaries: Boundary[] = [{
            id: 'boundary:workflow',
            kind: 'CI',
            label: 'CI/CD',
            artifactIds: ['artifact:.github/workflows/test.yml'],
            connectedAreaIds: [],
            support: [support],
        }];

        expect(memberships.map(item => item.areaId)).toEqual(['area:api', 'area:payments']);
        expect(areas[1].parentAreaId).toBe('area:repo');
        expect(relationships[0].type).toBe('DEPENDS_ON');
        expect(boundaries[0].connectedAreaIds).toEqual([]);
    });

    it('keeps evidence attribution and expectation separate from execution', () => {
        const attribution: EvidenceAttribution = {
            id: 'attribution:verify:api',
            evidenceRunId: 'run:verify',
            target: { kind: 'AREA', areaId: 'area:api' },
            support: [support],
        };
        const expectation: EvidenceExpectation = {
            id: 'expectation:verify:api',
            name: 'verify',
            target: { kind: 'AREA', areaId: 'area:api' },
            support: [{
                ...support,
                provenance: { kind: 'PROFILE', source: '.spark/profile.json' },
                derivation: 'DECLARED',
            }],
        };

        expect(attribution.evidenceRunId).toBe('run:verify');
        expect(expectation).not.toHaveProperty('status');
    });
});
