import { describe, expect, it } from 'vitest';
import { projectRepositoryUnderstanding, type RepositoryUnderstanding } from '@spark/core';
import { deriveGitHubWorkflowEvidence } from '../src';

function fixture(): RepositoryUnderstanding {
  return {
    observations: {
      snapshot: {
        kind: 'repository-snapshot', id: 'snapshot:head', repositoryId: 'repository:1', revision: 'head',
        source: { kind: 'vcs' },
      },
      change: {
        kind: 'change', id: 'change:1', repositoryId: 'repository:1', baseRevision: 'base', headRevision: 'head',
        artifacts: [
          { artifactId: 'artifact:api', status: 'MODIFIED' },
          { artifactId: 'artifact:docs', status: 'MODIFIED' },
        ],
        source: { kind: 'vcs' },
      },
      artifacts: [
        {
          kind: 'artifact', id: 'artifact:api', repositoryId: 'repository:1', revision: 'head',
          path: 'packages/api/src/index.ts', artifactKind: 'FILE', source: { kind: 'vcs' },
        },
        {
          kind: 'artifact', id: 'artifact:docs', repositoryId: 'repository:1', revision: 'head',
          path: 'docs/readme.md', artifactKind: 'FILE', source: { kind: 'vcs' },
        },
      ],
      pipelineDefinitions: [{
        kind: 'pipeline-definition', id: 'definition:verify', repositoryId: 'repository:1', revision: 'head',
        name: 'Verify', path: '.github/workflows/verify.yml',
        triggers: [{ event: 'pull_request', paths: { include: ['packages/api/**'] } }],
        jobs: [{ id: 'verify', steps: [{ execution: { kind: 'COMMAND', command: 'pnpm test' } }] }],
        source: { kind: 'ci-definition' },
      }],
      pipelineRuns: [{
        kind: 'pipeline-run', id: 'pipeline-run:1', pipelineDefinitionId: 'definition:verify',
        repositoryId: 'repository:1', revision: 'head', trigger: 'pull_request', source: { kind: 'ci' },
      }],
      pipelineAttempts: [{
        kind: 'pipeline-attempt', id: 'pipeline-attempt:1', pipelineRunId: 'pipeline-run:1', attempt: 1,
        lifecycle: 'COMPLETED', outcome: 'PASSED', source: { kind: 'ci' },
      }],
      pipelineJobs: [{
        kind: 'pipeline-job', id: 'pipeline-job:1', pipelineAttemptId: 'pipeline-attempt:1', logicalJobId: 'verify',
        name: 'verify', lifecycle: 'COMPLETED', outcome: 'PASSED', source: { kind: 'ci' },
      }],
      pipelineSteps: [],
      evidenceRuns: [{
        kind: 'evidence-run', id: 'evidence-run:1', repositoryId: 'repository:1', revision: 'head',
        name: 'verify', evidenceKind: 'github-check-run', lifecycle: 'COMPLETED', outcome: 'PASSED',
        pipelineRunId: 'pipeline-run:1', pipelineAttemptId: 'pipeline-attempt:1', pipelineJobId: 'pipeline-job:1',
        source: { kind: 'ci' },
      }],
      deployments: [],
      completeness: [
        { source: 'github-check-runs', state: 'COMPLETE' },
        { source: 'github-workflow-files', state: 'COMPLETE' },
        { source: 'github-workflow-semantics', state: 'COMPLETE' },
        { source: 'github-actions-runs', state: 'COMPLETE' },
        { source: 'github-actions-jobs', state: 'COMPLETE' },
        { source: 'github-actions-steps', state: 'COMPLETE' },
        { source: 'github-workflow-runtime-correlation', state: 'COMPLETE' },
      ],
    },
    areas: [{
      id: 'area:api', label: 'API', roles: ['PROJECT'],
      support: [],
    }],
    memberships: [{
      id: 'membership:api', areaId: 'area:api', target: { kind: 'PATH', path: 'packages/api' }, support: [],
    }],
    relationships: [{
      id: 'relationship:api', sourceAreaId: 'area:api', targetAreaId: 'area:api', type: 'DEPENDS_ON', support: [],
    }],
    boundaries: [{
      id: 'boundary:api', kind: 'PUBLIC_INTERFACE', label: 'public API', artifactIds: ['artifact:api'],
      connectedAreaIds: ['area:api'], support: [],
    }],
    evidenceAttributions: [],
    evidenceExpectations: [],
    completeness: [],
  };
}

describe('GitHub workflow evidence claims', () => {
  it('derives scoped repository claims and exact job expectations without universal coverage guesses', () => {
    const understanding = fixture();
    const result = deriveGitHubWorkflowEvidence({
      understanding,
      event: 'pull_request',
      attributionRules: [{
        id: 'adapter-relationship',
        target: { kind: 'RELATIONSHIP', relationshipId: 'relationship:api' },
        match: { pipelineDefinitionId: 'definition:verify', logicalJobId: 'verify' },
        declaredCommand: 'pnpm test',
        provenance: { kind: 'ECOSYSTEM_ADAPTER', source: 'workspace-test-map', version: '1' },
        derivation: 'DETERMINISTIC',
      }, {
        id: 'unsupported-wrapper',
        target: { kind: 'CHANGE', changeId: 'change:1' },
        match: { pipelineDefinitionId: 'definition:verify', logicalJobId: 'verify' },
        declaredCommand: './scripts/test.sh',
        provenance: { kind: 'ECOSYSTEM_ADAPTER', source: 'workspace-test-map', version: '1' },
        derivation: 'DETERMINISTIC',
      }],
    });

    expect(result.evidenceAttributions.map(item => item.target)).toEqual([
      { kind: 'ARTIFACT', artifactId: 'artifact:api' },
      { kind: 'AREA', areaId: 'area:api' },
      { kind: 'BOUNDARY', boundaryId: 'boundary:api' },
      { kind: 'RELATIONSHIP', relationshipId: 'relationship:api' },
    ]);
    expect(result.evidenceAttributions.every(item => item.evidenceRunId === 'evidence-run:1')).toBe(true);
    expect(result.evidenceExpectations).toEqual([
      expect.objectContaining({
        name: 'verify', target: { kind: 'CHANGE', changeId: 'change:1' },
        match: {
          evidenceName: 'verify', evidenceKind: 'github-check-run',
          pipelineDefinitionId: 'definition:verify', logicalJobId: 'verify',
        },
      }),
    ]);
    expect(result.completeness.map(item => [item.dimension, item.state])).toEqual([
      ['ci-process:workflow-acquisition', 'COMPLETE'],
      ['ci-process:runtime-acquisition', 'COMPLETE'],
      ['ci-process:job-acquisition', 'COMPLETE'],
      ['ci-process:step-acquisition', 'COMPLETE'],
      ['ci-process:semantic-attribution', 'COMPLETE'],
    ]);
    expect(result.issues).toEqual([]);

    understanding.evidenceAttributions.push(...result.evidenceAttributions);
    understanding.evidenceExpectations.push(...result.evidenceExpectations);
    understanding.completeness.push(...result.completeness);
    const projection = projectRepositoryUnderstanding(understanding);
    expect(projection.evidence).toEqual([
      expect.objectContaining({ name: 'verify', status: 'PASSED', coverage: ['API', 'public API'] }),
    ]);
  });

  it('does not evaluate branch-filtered expectations without the pull request target branch', () => {
    const understanding = fixture();
    understanding.observations.pipelineDefinitions[0].triggers[0].branches = { include: ['main'] };

    const result = deriveGitHubWorkflowEvidence({ understanding, event: 'pull_request' });

    expect(result.evidenceExpectations).toEqual([]);
    expect(result.evidenceAttributions).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TRIGGER_INPUT_UNAVAILABLE' }));
    expect(result.completeness.at(-1)?.state).toBe('PARTIAL');
  });

  it('keeps conditional and matrix expectation semantics unresolved', () => {
    const understanding = fixture();
    understanding.observations.pipelineDefinitions[0].jobs = [
      { id: 'conditional', condition: '${{ always() }}', steps: [{ execution: { kind: 'COMMAND', command: 'pnpm test' } }] },
      { id: 'matrix', matrix: { node: [20, 22] }, steps: [{ execution: { kind: 'COMMAND', command: 'pnpm test' } }] },
    ];

    const result = deriveGitHubWorkflowEvidence({ understanding, event: 'pull_request' });

    expect(result.evidenceExpectations).toEqual([]);
    expect(result.issues.filter(issue => issue.code === 'EXPECTATION_SEMANTICS_UNRESOLVED')).toHaveLength(2);
    expect(result.completeness.at(-1)?.state).toBe('PARTIAL');
  });
});
