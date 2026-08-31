import { describe, expect, it } from 'vitest';
import type { RepositoryObservations } from '../src/understanding';

describe('repository observations', () => {
    it('keeps provider facts, duplicate runs, and acquisition completeness separate', () => {
        const observations: RepositoryObservations = {
            snapshot: {
                kind: 'repository-snapshot',
                id: 'snapshot:head',
                repositoryId: 'repository:1',
                revision: 'head',
                source: { kind: 'vcs', id: 'provider:repository:1' },
            },
            change: {
                kind: 'change',
                id: 'change:13',
                repositoryId: 'repository:1',
                baseRevision: 'base',
                headRevision: 'head',
                artifacts: [{ artifactId: 'artifact:src/index.ts', status: 'MODIFIED' }],
                source: { kind: 'vcs' },
            },
            artifacts: [{
                kind: 'artifact',
                id: 'artifact:src/index.ts',
                repositoryId: 'repository:1',
                revision: 'head',
                path: 'src/index.ts',
                artifactKind: 'FILE',
                source: { kind: 'vcs' },
            }],
            evidenceRuns: [
                {
                    kind: 'evidence-run',
                    id: 'run:1',
                    repositoryId: 'repository:1',
                    revision: 'head',
                    name: 'verify',
                    evidenceKind: 'check-run',
                    status: 'PENDING',
                    source: { kind: 'ci', id: 'provider:7' },
                },
                {
                    kind: 'evidence-run',
                    id: 'run:2',
                    repositoryId: 'repository:1',
                    revision: 'head',
                    name: 'verify',
                    evidenceKind: 'check-run',
                    status: 'PASSED',
                    source: { kind: 'ci', id: 'provider:7' },
                },
            ],
            completeness: [
                { source: 'changed-files', state: 'COMPLETE', observedCount: 1, expectedCount: 1 },
                { source: 'repository-tree', state: 'PARTIAL', reason: 'provider response was truncated' },
                { source: 'workflow-files', state: 'UNAVAILABLE', reason: 'not requested' },
            ],
        };

        expect(observations.evidenceRuns.map(run => [run.id, run.status])).toEqual([
            ['run:1', 'PENDING'],
            ['run:2', 'PASSED'],
        ]);
        expect(observations.completeness.map(item => item.state)).toEqual(['COMPLETE', 'PARTIAL', 'UNAVAILABLE']);
        expect(observations).not.toHaveProperty('areas');
    });
});
