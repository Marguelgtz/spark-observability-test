import { describe, expect, it } from 'vitest';
import type { RepositoryObservations } from '../src/understanding';

describe('repository observations', () => {
    it('keeps process identity, lifecycle, outcome, and acquisition completeness separate', () => {
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
            pipelineDefinitions: [{
                kind: 'pipeline-definition',
                id: 'definition:verify',
                repositoryId: 'repository:1',
                revision: 'head',
                name: 'Verify',
                path: '.automation/verify.yml',
                triggers: [{ event: 'proposed-change', paths: { include: ['src/**'] } }],
                jobs: [{
                    id: 'test',
                    matrix: { runtime: ['20', '22'] },
                    steps: [{ name: 'test', execution: { kind: 'COMMAND', command: 'pnpm test' } }],
                }],
                source: { kind: 'ci-definition', id: 'provider:definition:verify' },
            }],
            pipelineRuns: [{
                kind: 'pipeline-run',
                id: 'pipeline-run:7',
                pipelineDefinitionId: 'definition:verify',
                repositoryId: 'repository:1',
                revision: 'head',
                trigger: 'proposed-change',
                source: { kind: 'ci', id: 'provider:run:7' },
            }],
            pipelineAttempts: [
                {
                    kind: 'pipeline-attempt', id: 'attempt:7:1', pipelineRunId: 'pipeline-run:7', attempt: 1,
                    lifecycle: 'COMPLETED', outcome: 'FAILED', source: { kind: 'ci', id: 'provider:run:7:attempt:1' },
                },
                {
                    kind: 'pipeline-attempt', id: 'attempt:7:2', pipelineRunId: 'pipeline-run:7', attempt: 2,
                    lifecycle: 'COMPLETED', outcome: 'PASSED', source: { kind: 'ci', id: 'provider:run:7:attempt:2' },
                },
            ],
            pipelineJobs: [{
                kind: 'pipeline-job', id: 'job:72', pipelineAttemptId: 'attempt:7:2', logicalJobId: 'test', name: 'test (22)',
                matrix: { runtime: '22' }, lifecycle: 'COMPLETED', outcome: 'PASSED', source: { kind: 'ci', id: 'provider:job:72' },
            }],
            pipelineSteps: [{
                kind: 'pipeline-step', id: 'step:72:1', pipelineJobId: 'job:72', sequence: 1, name: 'test',
                execution: { kind: 'COMMAND', command: 'pnpm test' }, lifecycle: 'COMPLETED', outcome: 'PASSED',
                source: { kind: 'ci', id: 'provider:job:72:step:1' },
            }],
            evidenceRuns: [
                {
                    kind: 'evidence-run',
                    id: 'run:1',
                    repositoryId: 'repository:1',
                    revision: 'head',
                    name: 'verify',
                    evidenceKind: 'check-run',
                    lifecycle: 'COMPLETED',
                    outcome: 'FAILED',
                    pipelineAttemptId: 'attempt:7:1',
                    source: { kind: 'ci', id: 'provider:7' },
                },
                {
                    kind: 'evidence-run',
                    id: 'run:2',
                    repositoryId: 'repository:1',
                    revision: 'head',
                    name: 'verify',
                    evidenceKind: 'check-run',
                    lifecycle: 'COMPLETED',
                    outcome: 'PASSED',
                    pipelineAttemptId: 'attempt:7:2',
                    pipelineJobId: 'job:72',
                    source: { kind: 'ci', id: 'provider:7' },
                },
            ],
            completeness: [
                { source: 'changed-files', state: 'COMPLETE', observedCount: 1, expectedCount: 1 },
                { source: 'repository-tree', state: 'PARTIAL', reason: 'provider response was truncated' },
                { source: 'workflow-files', state: 'UNAVAILABLE', reason: 'not requested' },
            ],
        };

        expect(observations.pipelineRuns.map(run => run.id)).toEqual(['pipeline-run:7']);
        expect(observations.pipelineAttempts.map(attempt => [attempt.id, attempt.attempt, attempt.outcome])).toEqual([
            ['attempt:7:1', 1, 'FAILED'],
            ['attempt:7:2', 2, 'PASSED'],
        ]);
        expect(observations.evidenceRuns.map(run => [run.id, run.lifecycle, run.outcome])).toEqual([
            ['run:1', 'COMPLETED', 'FAILED'],
            ['run:2', 'COMPLETED', 'PASSED'],
        ]);
        expect(observations.completeness.map(item => item.state)).toEqual(['COMPLETE', 'PARTIAL', 'UNAVAILABLE']);
        expect(observations).not.toHaveProperty('areas');
    });
});
