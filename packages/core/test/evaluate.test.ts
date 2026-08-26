import { describe, it, expect } from 'vitest';
import { evaluateChange } from '../src/evaluate';
import { SparkInput, Project } from '../src/types';

describe('Spark V0 Core Evaluation Engine', () => {

    const baseProjects: Project[] = [
        { name: 'apps/web', path: 'apps/web', dependencies: ['packages/core-types'] },
        { name: 'apps/api', path: 'apps/api', dependencies: ['packages/core-types'] },
        { name: 'apps/workers', path: 'apps/workers', dependencies: ['packages/core-types'] },
        { name: 'packages/core-types', path: 'packages/core-types', dependencies: [] },
        { name: 'packages/logger', path: 'packages/logger', dependencies: [] },
    ];

    const generateHighFanoutProjects = () => {
        const projs: Project[] = [...baseProjects];
        for (let i = 0; i < 55; i++) {
            projs.push({
                name: `apps/microservice-${i}`,
                path: `apps/microservice-${i}`,
                dependencies: ['packages/logger']
            });
        }
        return projs;
    };

    it('A. Localized UI change', () => {
        const input: SparkInput = {
            change: { id: 'sha1', files: [{ path: 'apps/web/src/components/Button.tsx', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [
                { name: 'web-test', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['apps/web'] }
            ]
        };
        const result = evaluateChange(input);

        expect(result.changeId).toBe('sha1');
        expect(result.attention).toBe('LOW');
        expect(result.directAreas).toEqual(['apps/web']);
        expect(result.affectedAreas).toEqual([]);
        expect(result.sensitiveSurfaces).toEqual([]);
        expect(result.reasons).toContain('Routine localized change with passing evidence');
    });

    it('B. Shared contract with downstream fan-out (Incomplete/Unknown coverage)', () => {
        const input: SparkInput = {
            change: { id: 'sha2', files: [{ path: 'packages/core-types/src/index.ts', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [
                { name: 'types-build', kind: 'build', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['packages/core-types', 'apps/api', 'apps/web'] },
                // Notice 'apps/workers' is missing from explicit coverage
            ]
        };
        const result = evaluateChange(input);

        expect(result.changeId).toBe('sha2');
        expect(result.attention).toBe('HIGH'); // Missing coverage for 'apps/workers'
        expect(result.directAreas).toEqual(['packages/core-types']);
        expect(result.affectedAreas).toContain('apps/workers');
        expect(result.sensitiveSurfaces).toContain('shared contract');
        expect(result.reasons).toContain('Expected evidence explicitly missing for affected area');
    });

    it('C. CI workflow change', () => {
        const input: SparkInput = {
            change: { id: 'sha3', files: [{ path: '.github/workflows/deploy.yml', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [
                { name: 'lint', kind: 'lint', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['CI/CD', 'Repository-wide'] }
            ]
        };
        const result = evaluateChange(input);

        expect(result.attention).toBe('HIGH');
        expect(result.directAreas).toEqual(['CI/CD']);
        expect(result.affectedAreas).toEqual(['Repository-wide']);
        expect(result.sensitiveSurfaces).toContain('CI/CD');
    });

    it('D. Deployment configuration change', () => {
        const input: SparkInput = {
            change: { id: 'sha4', files: [{ path: 'k8s/production/deployment.yaml', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [
                { name: 'helm-lint', kind: 'lint', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['Infrastructure'] }
            ]
        };
        const result = evaluateChange(input);

        expect(result.attention).toBe('HIGH');
        expect(result.directAreas).toEqual(['Infrastructure']);
        expect(result.sensitiveSurfaces).toContain('deployment');
    });

    it('E. Isolated backend change', () => {
        const input: SparkInput = {
            change: { id: 'sha5', files: [{ path: 'apps/api/src/utils/format.ts', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [
                { name: 'api-test', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['apps/api'] }
            ]
        };
        const result = evaluateChange(input);

        expect(result.attention).toBe('LOW');
        expect(result.directAreas).toEqual(['apps/api']);
    });

    it('F. Dependency manifest change', () => {
        const input: SparkInput = {
            change: { id: 'sha6', files: [{ path: 'package.json', status: 'modified' }, { path: 'pnpm-lock.yaml', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [
                { name: 'global-ci', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['Dependency Management', 'Repository-wide'] }
            ]
        };
        const result = evaluateChange(input);

        expect(result.attention).toBe('MEDIUM');
        expect(result.directAreas).toEqual(['Dependency Management']);
        expect(result.affectedAreas).toEqual(['Repository-wide']);
        expect(result.sensitiveSurfaces).toContain('dependency manifest');
    });

    it('G. Failed CI evidence', () => {
        const input: SparkInput = {
            change: { id: 'sha7', files: [{ path: 'apps/web/src/utils.ts', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [
                { name: 'web-test', kind: 'test', status: 'FAILED', source: 'github', knowledge: 'observed', coverage: ['apps/web'] }
            ]
        };
        const result = evaluateChange(input);

        expect(result.attention).toBe('HIGH');
        expect(result.reasons).toContain('Critical evidence failed');
    });

    it('H. Unsupported/unknown repo structure', () => {
        const input: SparkInput = {
            change: { id: 'sha8', files: [{ path: 'src/main.rs', status: 'modified' }] },
            context: { projects: [] },
            evidence: []
        };
        const result = evaluateChange(input);

        expect(result.attention).toBe('MEDIUM');
        expect(result.directAreas).toEqual(['Repository root']);
        expect(result.reasons).toContain('Structural uncertainty; repository topology could not be deeply analyzed');
    });

    it('I. New commit on already evaluated PR (evidence pending)', () => {
        const input: SparkInput = {
            change: { id: 'sha9', files: [{ path: 'apps/web/src/components/Input.tsx', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [
                { name: 'web-test', kind: 'test', status: 'PENDING', source: 'github', knowledge: 'observed', coverage: ['apps/web'] }
            ]
        };
        const result = evaluateChange(input);

        expect(result.attention).toBe('MEDIUM');
        expect(result.reasons).toContain('Evidence is missing or currently pending');
    });

    it('J. CI evidence transitions from pending to passed', () => {
        const input: SparkInput = {
            change: { id: 'sha10', files: [{ path: 'apps/web/src/components/Input.tsx', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [
                { name: 'web-test', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['apps/web'] }
            ]
        };
        const result = evaluateChange(input);

        expect(result.attention).toBe('LOW');
    });

    it('K. Application code and CI definition changed in same PR', () => {
        const input: SparkInput = {
            change: { id: 'sha11', files: [{ path: 'apps/api/src/routes.ts', status: 'modified' }, { path: '.github/workflows/test.yml', status: 'modified' }] },
            context: { projects: baseProjects },
            evidence: [
                { name: 'api-test', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['apps/api', 'CI/CD'] },
            ]
        };
        const result = evaluateChange(input);

        expect(result.attention).toBe('HIGH');
        expect(result.directAreas).toContain('apps/api');
        expect(result.directAreas).toContain('CI/CD');
    });

    it('L. Small diff to a high-fanout shared dependency', () => {
        const input: SparkInput = {
            change: { id: 'sha12', files: [{ path: 'packages/logger/index.ts', status: 'modified' }] },
            context: { projects: generateHighFanoutProjects() },
            evidence: [
                { name: 'global-test', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: 'UNKNOWN' }
            ]
        };
        const result = evaluateChange(input);

        expect(result.attention).toBe('HIGH');
        expect(result.reasons).toContain('Massive downstream fan-out');
        expect(result.reasons).toContain('Evidence coverage is unknown or incomplete for affected project');
        expect(result.affectedAreas.length).toBeGreaterThan(50);
    });
});

describe('Adversarial Edge Cases', () => {
    it('does not report LOW when no verification evidence was observed', () => {
        const input: SparkInput = {
            change: { id: 'no-evidence', files: [{ path: 'apps/web/index.ts', status: 'modified' }] },
            context: { projects: [{ name: 'web', path: 'apps/web', dependencies: [] }] },
            evidence: []
        };
        const result = evaluateChange(input);
        expect(result.attention).toBe('MEDIUM');
        expect(result.reasons).toContain('No verification evidence observed for this change');
    });

    it('treats auth and Terraform changes as critical sensitive surfaces', () => {
        const input: SparkInput = {
            change: { id: 'critical', files: [
                { path: 'src/auth/permissions.ts', status: 'modified' },
                { path: 'infra/terraform/main.tf', status: 'modified' }
            ] },
            context: { projects: [] },
            evidence: [{ name: 'CI', kind: 'check-run', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: 'UNKNOWN' }]
        };
        const result = evaluateChange(input);
        expect(result.attention).toBe('HIGH');
        expect(result.sensitiveSurfaces).toContain('auth/security');
        expect(result.sensitiveSurfaces).toContain('infrastructure');
    });

    it('escalates incomplete changed-file analysis and exposes the limitation', () => {
        const result = evaluateChange({
            change: { id: 'partial', files: [{ path: 'apps/web/index.ts', status: 'modified' }] },
            context: { projects: [{ name: 'web', path: 'apps/web', dependencies: [] }] },
            evidence: [{ name: 'CI', kind: 'check-run', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: 'UNKNOWN' }],
            analysis: { changedFiles: 'incomplete', repositoryContext: 'derived', notes: ['partial list'] }
        });
        expect(result.attention).toBe('MEDIUM');
        expect(result.reasons).toContain('Changed-file analysis is incomplete');
    });

    it('handles cyclic project dependencies', () => {
        const cyclicProjects: Project[] = [
            { name: 'proj-A', path: 'proj-A', dependencies: ['proj-B'] },
            { name: 'proj-B', path: 'proj-B', dependencies: ['proj-A'] },
        ];
        const input: SparkInput = {
            change: { id: 'cyc1', files: [{ path: 'proj-A/index.ts', status: 'modified' }] },
            context: { projects: cyclicProjects },
            evidence: [
                { name: 'proj-A', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['proj-A', 'proj-B'] }
            ]
        };
        const result = evaluateChange(input);
        expect(result.affectedAreas).toContain('proj-B');
    });

    it('empty change should result in LOW with no areas', () => {
        const input: SparkInput = {
            change: { id: 'empty', files: [] },
            context: { projects: [] },
            evidence: []
        };
        const result = evaluateChange(input);

        expect(result.attention).toBe('LOW');
        expect(result.directAreas).toEqual([]);
        expect(result.reasons).toContain('No changed files observed');
    });

    it('nested project paths match the most specific longest-prefix', () => {
        const nestedProjects: Project[] = [
            { name: 'foo', path: 'packages/foo', dependencies: [] },
            { name: 'foo-sub', path: 'packages/foo/subproject', dependencies: [] }
        ];
        const input: SparkInput = {
            change: { id: 'nest1', files: [{ path: 'packages/foo/subproject/src/index.ts', status: 'modified' }] },
            context: { projects: nestedProjects },
            evidence: [
                { name: 'sub', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['foo-sub'] }
            ]
        };
        const result = evaluateChange(input);
        expect(result.directAreas).toEqual(['foo-sub']); // Not 'foo'
    });

    it('unmatched file in otherwise known project graph', () => {
        const knownProjects: Project[] = [
            { name: 'web', path: 'apps/web', dependencies: [] }
        ];
        const input: SparkInput = {
            change: { id: 'unmatched1', files: [{ path: 'apps/unknown/src/index.ts', status: 'modified' }] },
            context: { projects: knownProjects },
            evidence: []
        };
        const result = evaluateChange(input);

        expect(result.directAreas).toEqual(['Unmapped area']);
        expect(result.reasons).toContain('Structural uncertainty; unmapped files outside known projects');
    });

    it('duplicate changed files and duplicate evidence handled cleanly', () => {
        const projects: Project[] = [
            { name: 'web', path: 'apps/web', dependencies: [] }
        ];
        const input: SparkInput = {
            change: { id: 'dup1', files: [
                { path: 'apps/web/index.ts', status: 'modified' },
                { path: 'apps/web/index.ts', status: 'modified' }
            ]},
            context: { projects },
            evidence: [
                { name: 'web-test', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['web'] },
                { name: 'web-test', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['web'] }
            ]
        };
        const result = evaluateChange(input);
        expect(result.directAreas).toEqual(['web']);
        expect(result.attention).toBe('LOW');
    });

    it('one file matching multiple surfaces', () => {
        const projects: Project[] = [
            { name: 'infra', path: 'infra', dependencies: [] }
        ];
        // file path that hits 'CI/CD' (.github/workflows) and 'deployment' (deployment.yaml)
        const input: SparkInput = {
            change: { id: 'multi1', files: [{ path: '.github/workflows/production-deployment.yaml', status: 'modified' }] },
            context: { projects },
            evidence: [
                { name: 'check', kind: 'lint', status: 'PASSED', source: 'github', knowledge: 'observed', coverage: ['CI/CD', 'infra'] }
            ]
        };
        const result = evaluateChange(input);
        expect(result.directAreas).toContain('CI/CD');
        expect(result.sensitiveSurfaces).toContain('CI/CD');
        expect(result.sensitiveSurfaces).toContain('deployment');
    });
});
