import { describe, expect, it } from 'vitest';
import { resolveStructuralRegions } from '../src/structural-regions';
import { genericStructuralAnalyzer } from '../src/structural-regions';
import { analyzeRepository } from '../src/analyzers';
import type { ArtifactObservation } from '../src/understanding';

function artifacts(paths: string[]): ArtifactObservation[] {
    return paths.map((path, index) => ({
        kind: 'artifact',
        id: `artifact:${String(index).padStart(3, '0')}:${path}`,
        repositoryId: 'repository:fixture',
        revision: 'head',
        path,
        artifactKind: 'FILE',
        source: { kind: 'vcs' },
    }));
}

describe('generic structural-region decision', () => {
    it('resolves Spark workspace-shaped paths without treating source directories as areas', () => {
        const changed = artifacts(['apps/api/src/orchestrator.ts', 'packages/core/src/types.ts']);

        expect(resolveStructuralRegions(changed, changed).map(region => region.path)).toEqual(['apps/api', 'packages/core']);
    });

    it('resolves the real Stint provider path to a useful nested structural region', () => {
        const changed = artifacts(['internal/provider/vast/instance.go', 'internal/provider/vast/instance_test.go']);

        expect(resolveStructuralRegions(changed, changed)).toEqual([{
            path: 'internal/provider/vast',
            label: 'internal/provider/vast',
            artifactIds: changed.map(item => item.id),
        }]);
    });

    it('uses an observed Python package marker to expose a bounded Django subsystem', () => {
        const changed = artifacts(['django/db/models/sql/compiler.py', 'tests/queries/test_qs_combinators.py']);
        const snapshot = [...changed, ...artifacts(['django/__init__.py'])];

        expect(resolveStructuralRegions(changed, snapshot).map(region => region.path)).toEqual(['django/db', 'tests/queries']);
    });

    it('keeps a flat service as one repository region instead of inventing src children', () => {
        const changed = artifacts(['src/http/routes.ts', 'src/domain/user.ts', 'README.md']);

        expect(resolveStructuralRegions(changed, changed).map(region => region.path)).toEqual(['', 'src']);
    });

    it('emits provenance-bearing structural claims with source-scoped completeness', () => {
        const observedArtifacts = artifacts(['internal/provider/vast/instance.go', 'internal/provider/vast/instance_test.go']);
        const result = analyzeRepository({
            snapshot: { kind: 'repository-snapshot', id: 'snapshot', repositoryId: 'repository:fixture', revision: 'head', source: { kind: 'vcs' } },
            change: {
                kind: 'change', id: 'change', repositoryId: 'repository:fixture', baseRevision: 'base', headRevision: 'head',
                artifacts: observedArtifacts.map(artifact => ({ artifactId: artifact.id, status: 'MODIFIED' })), source: { kind: 'vcs' },
            },
            artifacts: observedArtifacts,
            pipelineDefinitions: [],
            pipelineRuns: [],
            pipelineAttempts: [],
            pipelineJobs: [],
            pipelineSteps: [],
            evidenceRuns: [],
            completeness: [
                { source: 'changed-files', state: 'COMPLETE' },
                { source: 'repository-tree', state: 'PARTIAL', reason: 'tree truncated' },
            ],
        }, [genericStructuralAnalyzer]);

        expect(result.understanding.areas).toEqual([expect.objectContaining({
            id: 'area:structural:internal/provider/vast',
            label: 'internal/provider/vast',
            roles: ['STRUCTURAL'],
            support: [expect.objectContaining({
                provenance: { kind: 'GENERIC_ANALYZER', source: 'generic-structure', version: '1' },
                derivation: 'HEURISTIC',
                confidence: 'TENTATIVE',
                completeness: { state: 'PARTIAL', reason: 'tree truncated' },
            })],
        })]);
        expect(result.understanding.memberships[0]).toMatchObject({
            areaId: 'area:structural:internal/provider/vast',
            target: { kind: 'PATH', path: 'internal/provider/vast' },
        });
        expect(result.understanding.completeness[0]).toMatchObject({
            dimension: 'analyzer:generic-structure', state: 'PARTIAL', reason: 'tree truncated',
        });
    });
});
