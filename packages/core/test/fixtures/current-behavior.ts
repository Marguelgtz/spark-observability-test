import type { SparkEvaluation, SparkInput, Project } from '../../src/types';

export interface CurrentBehaviorScenario {
    name: string;
    input: SparkInput;
    expected: Pick<
        SparkEvaluation,
        'changeId' | 'attention' | 'reasons' | 'directAreas' | 'affectedAreas' | 'sensitiveSurfaces' | 'analysis'
    >;
}

const baseProjects: Project[] = [
    { name: 'apps/web', path: 'apps/web', dependencies: ['packages/core-types'] },
    { name: 'apps/api', path: 'apps/api', dependencies: ['packages/core-types'] },
    { name: 'apps/workers', path: 'apps/workers', dependencies: ['packages/core-types'] },
    { name: 'packages/core-types', path: 'packages/core-types', dependencies: [] },
];

export const currentBehaviorScenarios: CurrentBehaviorScenario[] = [
    {
        name: 'localized workspace change with explicit passing coverage',
        input: {
            change: { id: 'characterization-local', files: [{ path: 'apps/web/src/button.ts', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [{
                name: 'web-test', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['apps/web'],
            }],
        },
        expected: {
            changeId: 'characterization-local',
            attention: 'LOW',
            reasons: ['Routine localized change with passing evidence'],
            directAreas: ['apps/web'],
            affectedAreas: [],
            sensitiveSurfaces: [],
            analysis: undefined,
        },
    },
    {
        name: 'downstream fan-out with unknown evidence coverage',
        input: {
            change: { id: 'characterization-fanout', files: [{ path: 'packages/core-types/src/index.ts', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [{
                name: 'workspace-test', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: 'UNKNOWN',
            }],
        },
        expected: {
            changeId: 'characterization-fanout',
            attention: 'HIGH',
            reasons: [
                'Shared contract changed',
                'Downstream projects affected',
                'Evidence coverage is unknown or incomplete for affected project',
            ],
            directAreas: ['packages/core-types'],
            affectedAreas: ['apps/api', 'apps/web', 'apps/workers'],
            sensitiveSurfaces: ['shared contract'],
            analysis: undefined,
        },
    },
    {
        name: 'generic repository root fallback without evidence',
        input: {
            change: { id: 'characterization-root', files: [{ path: 'src/main.rs', status: 'modified' }] },
            context: { projects: [] },
            evidence: [],
        },
        expected: {
            changeId: 'characterization-root',
            attention: 'MEDIUM',
            reasons: [
                'No verification evidence observed for this change',
                'Structural uncertainty; repository topology could not be deeply analyzed',
            ],
            directAreas: ['Repository root'],
            affectedAreas: [],
            sensitiveSurfaces: [],
            analysis: undefined,
        },
    },
    {
        name: 'unmapped path within a known project graph',
        input: {
            change: { id: 'characterization-unmapped', files: [{ path: 'tools/release.ts', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [{
                name: 'release-test', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['Unmapped area'],
            }],
        },
        expected: {
            changeId: 'characterization-unmapped',
            attention: 'MEDIUM',
            reasons: ['Structural uncertainty; unmapped files outside known projects'],
            directAreas: ['Unmapped area'],
            affectedAreas: [],
            sensitiveSurfaces: [],
            analysis: undefined,
        },
    },
    {
        name: 'critical sensitive paths in an unknown repository',
        input: {
            change: {
                id: 'characterization-sensitive',
                files: [
                    { path: 'src/auth/permissions.ts', status: 'modified' },
                    { path: 'infra/terraform/main.tf', status: 'modified' },
                ],
            },
            context: { projects: [] },
            evidence: [{
                name: 'ci', kind: 'check-run', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: 'UNKNOWN',
            }],
        },
        expected: {
            changeId: 'characterization-sensitive',
            attention: 'HIGH',
            reasons: [
                'Sensitive surface touched: auth/security',
                'Sensitive surface touched: infrastructure',
                'Structural uncertainty; repository topology could not be deeply analyzed',
            ],
            directAreas: ['Repository root'],
            affectedAreas: [],
            sensitiveSurfaces: ['auth/security', 'infrastructure'],
            analysis: undefined,
        },
    },
    {
        name: 'incomplete changed-file observation',
        input: {
            change: { id: 'characterization-incomplete', files: [{ path: 'apps/web/index.ts', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [{
                name: 'web-test', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['apps/web'],
            }],
            analysis: { changedFiles: 'incomplete', repositoryContext: 'derived', notes: ['partial changed-file list'] },
        },
        expected: {
            changeId: 'characterization-incomplete',
            attention: 'MEDIUM',
            reasons: ['Routine localized change with passing evidence', 'Changed-file analysis is incomplete'],
            directAreas: ['apps/web'],
            affectedAreas: [],
            sensitiveSurfaces: [],
            analysis: { changedFiles: 'incomplete', repositoryContext: 'derived', notes: ['partial changed-file list'] },
        },
    },
    {
        name: 'pending evidence on a known project',
        input: {
            change: { id: 'characterization-pending', files: [{ path: 'apps/api/index.ts', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [{
                name: 'api-test', kind: 'test', status: 'PENDING', source: 'github', knowledge: 'observed', coverage: ['apps/api'],
            }],
        },
        expected: {
            changeId: 'characterization-pending',
            attention: 'MEDIUM',
            reasons: ['Evidence is missing or currently pending'],
            directAreas: ['apps/api'],
            affectedAreas: [],
            sensitiveSurfaces: [],
            analysis: undefined,
        },
    },
];
