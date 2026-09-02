import { describe, expect, it } from 'vitest';
import { evaluateChange } from '../src/evaluate';
import type { Evidence, Project } from '../src/types';

const projects: Project[] = [
    { name: 'apps/web', path: 'apps/web', dependencies: ['packages/shared'] },
    { name: 'apps/api', path: 'apps/api', dependencies: ['packages/shared'] },
    { name: 'packages/shared', path: 'packages/shared', dependencies: [] },
];

describe('legacy compatibility semantics', () => {
    it('sorts and deduplicates area and surface labels while retaining repository-wide scope', () => {
        const evaluation = evaluateChange({
            change: {
                id: 'compatibility-labels',
                files: [
                    { path: 'packages/shared/src/index.ts', status: 'modified' },
                    { path: 'packages/shared/src/index.ts', status: 'modified' },
                    { path: 'package.json', status: 'modified' },
                    { path: 'package.json', status: 'modified' },
                    { path: '.github/workflows/test.yml', status: 'modified' },
                ],
            },
            context: { projects },
            evidence: [],
        });

        expect(evaluation.directAreas).toEqual(['CI/CD', 'Dependency Management', 'packages/shared']);
        expect(evaluation.affectedAreas).toEqual(['Repository-wide', 'apps/api', 'apps/web']);
        expect(evaluation.sensitiveSurfaces).toEqual(['CI/CD', 'dependency manifest']);
    });

    it('preserves duplicate evidence observations and their input order', () => {
        const evidence: Evidence[] = [
            {
                name: 'verify',
                kind: 'check-run',
                status: 'PENDING',
                source: 'github',
                knowledge: 'observed',
                coverage: 'UNKNOWN',
            },
            {
                name: 'verify',
                kind: 'check-run',
                status: 'PASSED',
                source: 'github',
                knowledge: 'observed',
                coverage: ['apps/web'],
            },
        ];

        const evaluation = evaluateChange({
            change: { id: 'compatibility-evidence', files: [{ path: 'apps/web/index.ts', status: 'modified' }] },
            context: { projects },
            evidence,
        });

        expect(evaluation.evidence).toEqual(evidence);
        expect(evaluation.evidence).toHaveLength(2);
    });
});
