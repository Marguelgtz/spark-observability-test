import { describe, expect, it } from 'vitest';
import { analyzeRepository, type RepositoryAnalyzer } from '../src/analyzers';
import type { RepositoryObservations } from '../src/understanding';

const observations: RepositoryObservations = {
    snapshot: { kind: 'repository-snapshot', id: 'snapshot', repositoryId: 'repo', revision: 'head', source: { kind: 'vcs' } },
    change: {
        kind: 'change', id: 'change', repositoryId: 'repo', baseRevision: 'base', headRevision: 'head',
        artifacts: [{ artifactId: 'artifact:a', status: 'MODIFIED' }], source: { kind: 'vcs' },
    },
    artifacts: [{
        kind: 'artifact', id: 'artifact:a', repositoryId: 'repo', revision: 'head', path: 'src/a.ts', artifactKind: 'FILE', source: { kind: 'vcs' },
    }],
    pipelineDefinitions: [],
    pipelineRuns: [],
    pipelineAttempts: [],
    pipelineJobs: [],
    pipelineSteps: [],
    evidenceRuns: [],
    completeness: [{ source: 'repository-tree', state: 'COMPLETE' }],
};

const structural: RepositoryAnalyzer = {
    id: 'generic-structure',
    provenanceKind: 'GENERIC_ANALYZER',
    analyze: () => ({
        areas: [{ id: 'area:src', label: 'src', roles: ['STRUCTURAL'], support: [] }],
        memberships: [{
            id: 'membership:src', areaId: 'area:src', target: { kind: 'PATH', path: 'src' }, support: [],
        }],
    }),
};

const boundary: RepositoryAnalyzer = {
    id: 'generic-boundaries',
    provenanceKind: 'GENERIC_ANALYZER',
    analyze: () => ({
        boundaries: [{
            id: 'boundary:a', kind: 'PUBLIC_INTERFACE', label: 'shared contract', artifactIds: ['artifact:a'], connectedAreaIds: [], support: [],
        }],
    }),
};

describe('repository analyzer orchestration', () => {
    it('merges multiple contributions deterministically regardless of analyzer order', () => {
        const forward = analyzeRepository(observations, [structural, boundary]);
        const reverse = analyzeRepository(observations, [boundary, structural]);

        expect(reverse).toEqual(forward);
        expect(forward.understanding.areas.map(item => item.id)).toEqual(['area:src']);
        expect(forward.understanding.boundaries.map(item => item.id)).toEqual(['boundary:a']);
    });

    it('keeps failures source-scoped while retaining successful contributions', () => {
        const failing: RepositoryAnalyzer = {
            id: 'broken-adapter',
            version: '2',
            provenanceKind: 'ECOSYSTEM_ADAPTER',
            analyze: () => { throw new Error('manifest parse failed'); },
        };

        const result = analyzeRepository(observations, [structural, failing]);

        expect(result.understanding.areas.map(item => item.id)).toEqual(['area:src']);
        expect(result.analyzerIssues).toEqual([{ analyzerId: 'broken-adapter', code: 'ANALYZER_FAILED', detail: 'manifest parse failed' }]);
        expect(result.understanding.completeness).toEqual([
            expect.objectContaining({ dimension: 'analyzer:broken-adapter', state: 'UNAVAILABLE', reason: 'manifest parse failed' }),
        ]);
    });
});
