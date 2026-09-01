import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  PipelineAttemptObservation,
  PipelineJobObservation,
  PipelineRunObservation,
} from '@spark/core';
import {
  acquireGitHubWorkflowDefinitions,
  correlateGitHubWorkflowRuntime,
  githubWorkflowDefinitionId,
  parseGitHubWorkflowDefinition,
  type GitHubApiClient,
} from '../src';

const repositoryId = 'repository:acme/widgets';
const revision = 'revision-1';
const workflowPath = '.github/workflows/ci.yml';

describe('checked-in GitHub workflow parsing', () => {
  it('parses the real Spark workflow declaration without provider runtime guesses', () => {
    const candidates = [
      resolve(process.cwd(), '.github/workflows/dashboard-worker-validation.yml'),
      resolve(process.cwd(), '../../.github/workflows/dashboard-worker-validation.yml'),
    ];
    const text = readFileSync(candidates.find(existsSync)!, 'utf8');

    const result = parseGitHubWorkflowDefinition(text, {
      path: '.github/workflows/dashboard-worker-validation.yml', repositoryId, revision,
    });

    expect(result.issues).toHaveLength(3);
    expect(result.issues.every(issue => issue.code === 'EXTERNAL_REFERENCE_UNRESOLVED')).toBe(true);
    expect(result.definition).toMatchObject({
      id: 'pipeline-definition:repository:acme/widgets:.github/workflows/dashboard-worker-validation.yml',
      revision,
      name: 'Dashboard / Worker Verification',
      triggers: [
        { event: 'pull_request', paths: { include: expect.arrayContaining(['apps/api/**', 'packages/github/**']) } },
        { event: 'workflow_dispatch' },
      ],
      jobs: [{ id: 'verify' }],
    });
    expect(result.definition?.jobs[0].steps).toContainEqual({
      name: 'Unit tests', execution: { kind: 'COMMAND', command: 'pnpm test', semanticReach: 'DIRECT' },
    });
    expect(result.definition?.jobs[0].steps).toContainEqual({
      execution: { kind: 'ACTION', reference: 'actions/checkout@v4' },
    });
  });

  it('preserves bounded triggers, dependencies, matrices, environments, conditions, and reusable processes', () => {
    const result = parseGitHubWorkflowDefinition(`
name: CI
on:
  pull_request:
    branches: [main]
    paths-ignore: [docs/**]
jobs:
  build:
    steps:
      - run: pnpm build
  test:
    needs: build
    if: \${{ success() }}
    environment:
      name: staging
    strategy:
      matrix:
        os: [linux, windows]
        node: [20, 22]
    steps:
      - uses: actions/setup-node@v4
      - name: Test
        run: pnpm test
  shared:
    uses: acme/shared/.github/workflows/verify.yml@v2
`, { path: workflowPath, repositoryId, revision });

    expect(result.issues.map(issue => issue.code)).toEqual([
      'EXTERNAL_REFERENCE_UNRESOLVED', 'EXTERNAL_REFERENCE_UNRESOLVED',
    ]);
    expect(result.definition?.triggers).toEqual([{
      event: 'pull_request', branches: { include: ['main'] }, paths: { exclude: ['docs/**'] },
    }]);
    expect(result.definition?.jobs).toEqual([
      expect.objectContaining({
        id: 'build', steps: [{ execution: { kind: 'COMMAND', command: 'pnpm build', semanticReach: 'DIRECT' } }],
      }),
      expect.objectContaining({
        id: 'test', needs: ['build'], condition: '${{ success() }}', environment: 'staging',
        matrix: { os: ['linux', 'windows'], node: [20, 22] },
      }),
      expect.objectContaining({ id: 'shared', reusableProcess: 'acme/shared/.github/workflows/verify.yml@v2' }),
    ]);
  });

  it('keeps commands but lowers completeness for dynamic or unsupported declaration semantics', async () => {
    const text = `
on: pull_request
jobs:
  test:
    strategy:
      matrix: \${{ fromJSON(needs.prepare.outputs.matrix) }}
    steps:
      - run: ./scripts/ci.sh --target \${{ matrix.target }}
`;
    const client = {
      getTree: async () => ({ paths: [workflowPath], complete: true }),
      getTextFile: async () => text,
    } as unknown as GitHubApiClient;

    const result = await acquireGitHubWorkflowDefinitions({
      client, owner: 'acme', repo: 'widgets', repositoryId, revision,
    });

    expect(result.definitions[0].jobs[0].steps).toEqual([{
      execution: {
        kind: 'COMMAND', command: './scripts/ci.sh --target ${{ matrix.target }}', semanticReach: 'DYNAMIC',
      },
    }]);
    expect(result.issues.map(issue => issue.code)).toContain('UNRESOLVED_EXPRESSION');
    expect(result.completeness).toEqual([
      expect.objectContaining({ source: 'github-workflow-files', state: 'COMPLETE' }),
      expect.objectContaining({ source: 'github-workflow-semantics', state: 'PARTIAL' }),
    ]);
  });

  it('retains external references while reporting their semantics as partial', async () => {
    const client = {
      getTree: async () => ({ paths: [workflowPath], complete: true }),
      getTextFile: async () => `
on: push
jobs:
  shared:
    uses: acme/shared/.github/workflows/verify.yml@v2
  verify:
    steps:
      - uses: actions/checkout@v4
`,
    } as unknown as GitHubApiClient;

    const result = await acquireGitHubWorkflowDefinitions({
      client, owner: 'acme', repo: 'widgets', repositoryId, revision,
    });

    expect(result.definitions[0].jobs).toEqual([
      expect.objectContaining({ reusableProcess: 'acme/shared/.github/workflows/verify.yml@v2' }),
      expect.objectContaining({
        steps: [{ execution: { kind: 'ACTION', reference: 'actions/checkout@v4' } }],
      }),
    ]);
    expect(result.issues.filter(issue => issue.code === 'EXTERNAL_REFERENCE_UNRESOLVED')).toHaveLength(2);
    expect(result.completeness).toEqual([
      expect.objectContaining({ source: 'github-workflow-files', state: 'COMPLETE' }),
      expect.objectContaining({ source: 'github-workflow-semantics', state: 'PARTIAL' }),
    ]);
  });

  it('marks a static wrapper invocation without inventing what the script validates', () => {
    const result = parseGitHubWorkflowDefinition(`
on: push
jobs:
  verify:
    steps:
      - run: ./scripts/ci.sh
`, { path: workflowPath, repositoryId, revision });

    expect(result.definition?.jobs[0].steps).toEqual([{
      execution: { kind: 'COMMAND', command: './scripts/ci.sh', semanticReach: 'WRAPPER' },
    }]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'WRAPPER_SEMANTICS' }));
  });

  it('reads only workflow paths at the exact revision and reports acquisition bounds', async () => {
    const refs: string[] = [];
    const client = {
      getTree: async (_owner: string, _repo: string, sha: string) => {
        refs.push(sha);
        return { paths: [workflowPath, '.github/workflows/release.yaml', 'src/index.ts'], complete: true };
      },
      getTextFile: async (_owner: string, _repo: string, path: string, ref: string) => {
        refs.push(`${path}@${ref}`);
        return 'on: push\njobs:\n  verify:\n    steps:\n      - run: pnpm test\n';
      },
    } as unknown as GitHubApiClient;

    const result = await acquireGitHubWorkflowDefinitions({
      client, owner: 'acme', repo: 'widgets', repositoryId, revision, limits: { maxWorkflowFiles: 1 },
    });

    expect(refs).toEqual([revision, `${workflowPath}@${revision}`]);
    expect(result.definitions).toHaveLength(1);
    expect(result.completeness[0]).toMatchObject({ state: 'PARTIAL', observedCount: 1, expectedCount: 2 });
    expect(result.issues.map(issue => issue.code)).toContain('WORKFLOW_LIMIT');
  });

  it('does not turn invalid YAML or oversized files into declarations', async () => {
    const client = {
      getTree: async () => ({ paths: [workflowPath, '.github/workflows/large.yml'], complete: true }),
      getTextFile: async (_owner: string, _repo: string, path: string) => path.endsWith('large.yml')
        ? 'x'.repeat(100)
        : 'jobs: [unterminated',
    } as unknown as GitHubApiClient;

    const result = await acquireGitHubWorkflowDefinitions({
      client, owner: 'acme', repo: 'widgets', repositoryId, revision, limits: { maxBytesPerFile: 50 },
    });

    expect(result.definitions).toEqual([]);
    expect(result.issues.map(issue => issue.code).sort()).toEqual(['FILE_TOO_LARGE', 'PARSE_ERROR']);
    expect(result.completeness[0].state).toBe('PARTIAL');
  });
});

describe('workflow declaration/runtime correlation', () => {
  const definition = parseGitHubWorkflowDefinition(`
name: CI
on: pull_request
jobs:
  build:
    steps:
      - run: pnpm build
  integration:
    needs: build
    steps:
      - run: pnpm integration
`, { path: workflowPath, repositoryId, revision }).definition!;
  const run: PipelineRunObservation = {
    kind: 'pipeline-run', id: 'run:1', pipelineDefinitionId: githubWorkflowDefinitionId(repositoryId, workflowPath),
    repositoryId, revision, trigger: 'pull_request', source: { kind: 'ci' },
  };
  const attempt: PipelineAttemptObservation = {
    kind: 'pipeline-attempt', id: 'attempt:1', pipelineRunId: run.id, attempt: 1,
    lifecycle: 'COMPLETED', outcome: 'FAILED', source: { kind: 'ci' },
  };

  it('correlates exact declared jobs and identifies a skipped dependency without changing its outcome', () => {
    const jobs: PipelineJobObservation[] = [
      {
        kind: 'pipeline-job', id: 'job:build', pipelineAttemptId: attempt.id, name: 'build',
        lifecycle: 'COMPLETED', outcome: 'FAILED', source: { kind: 'ci' },
      },
      {
        kind: 'pipeline-job', id: 'job:integration', pipelineAttemptId: attempt.id, name: 'integration',
        lifecycle: 'COMPLETED', outcome: 'SKIPPED', source: { kind: 'ci' },
      },
    ];

    const result = correlateGitHubWorkflowRuntime({
      definitions: [definition], pipelineRuns: [run], pipelineAttempts: [attempt], pipelineJobs: jobs,
    });

    expect(result.pipelineJobs).toEqual([
      expect.objectContaining({ id: 'job:build', logicalJobId: 'build', outcome: 'FAILED' }),
      expect.objectContaining({
        id: 'job:integration', logicalJobId: 'integration', needs: ['build'],
        blockedByPipelineJobIds: ['job:build'], outcome: 'SKIPPED',
      }),
    ]);
    expect(result.completeness.state).toBe('COMPLETE');
  });

  it('does not infer blocking when the declaration has an explicit condition', () => {
    const conditional = parseGitHubWorkflowDefinition(`
on: pull_request
jobs:
  build:
    steps: [{ run: pnpm build }]
  integration:
    needs: build
    if: \${{ always() }}
    steps: [{ run: pnpm integration }]
`, { path: workflowPath, repositoryId, revision }).definition!;
    const jobs: PipelineJobObservation[] = [
      { kind: 'pipeline-job', id: 'job:build', pipelineAttemptId: attempt.id, name: 'build', lifecycle: 'COMPLETED', outcome: 'FAILED', source: { kind: 'ci' } },
      { kind: 'pipeline-job', id: 'job:integration', pipelineAttemptId: attempt.id, name: 'integration', lifecycle: 'COMPLETED', outcome: 'SKIPPED', source: { kind: 'ci' } },
    ];

    const result = correlateGitHubWorkflowRuntime({
      definitions: [conditional], pipelineRuns: [run], pipelineAttempts: [attempt], pipelineJobs: jobs,
    });

    expect(result.pipelineJobs[1]).not.toHaveProperty('blockedByPipelineJobIds');
  });

  it('retains matrix declarations but refuses to parse coordinates from runtime display names', () => {
    const matrixDefinition = parseGitHubWorkflowDefinition(`
on: pull_request
jobs:
  test:
    strategy:
      matrix:
        os: [linux, windows]
        node: [20, 22]
    steps: [{ run: pnpm test }]
`, { path: workflowPath, repositoryId, revision }).definition!;
    const matrixJob: PipelineJobObservation = {
      kind: 'pipeline-job', id: 'job:matrix', pipelineAttemptId: attempt.id, name: 'test (windows, 22)',
      lifecycle: 'COMPLETED', outcome: 'FAILED', source: { kind: 'ci' },
    };

    const result = correlateGitHubWorkflowRuntime({
      definitions: [matrixDefinition], pipelineRuns: [run], pipelineAttempts: [attempt], pipelineJobs: [matrixJob],
    });

    expect(result.pipelineJobs[0]).not.toHaveProperty('matrix');
    expect(result.pipelineJobs[0]).not.toHaveProperty('logicalJobId');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'RUNTIME_CORRELATION_UNRESOLVED' }));
    expect(result.completeness.state).toBe('PARTIAL');
  });
});
