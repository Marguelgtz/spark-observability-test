import type {
  PipelineAttemptObservation,
  PipelineDefinitionObservation,
  PipelineJobDeclaration,
  PipelineJobObservation,
  PipelineRunObservation,
  PipelineStepDeclaration,
  PipelineTriggerDeclaration,
  SourceCompleteness,
} from '@spark/core';
import { parse } from 'yaml';
import type { GitHubApiClient } from './client';
import { githubWorkflowDefinitionId } from './process';

export interface GitHubWorkflowAcquisitionLimits {
  maxWorkflowFiles: number;
  maxBytesPerFile: number;
  maxTotalBytes: number;
  maxJobsPerWorkflow: number;
  maxStepsPerJob: number;
  maxMatrixAxes: number;
  maxMatrixValuesPerAxis: number;
}

export const DEFAULT_GITHUB_WORKFLOW_LIMITS: GitHubWorkflowAcquisitionLimits = {
  maxWorkflowFiles: 50,
  maxBytesPerFile: 256 * 1024,
  maxTotalBytes: 1024 * 1024,
  maxJobsPerWorkflow: 100,
  maxStepsPerJob: 100,
  maxMatrixAxes: 20,
  maxMatrixValuesPerAxis: 100,
};

export type GitHubWorkflowIssueCode =
  | 'TREE_PARTIAL'
  | 'WORKFLOW_LIMIT'
  | 'FILE_UNAVAILABLE'
  | 'FILE_TOO_LARGE'
  | 'TOTAL_SIZE_LIMIT'
  | 'PARSE_ERROR'
  | 'UNSUPPORTED_STRUCTURE'
  | 'UNRESOLVED_EXPRESSION'
  | 'EXTERNAL_REFERENCE_UNRESOLVED'
  | 'WRAPPER_SEMANTICS'
  | 'DECLARATION_LIMIT'
  | 'RUNTIME_CORRELATION_UNRESOLVED'
  | 'MATRIX_RUNTIME_UNAVAILABLE';

export interface GitHubWorkflowIssue {
  code: GitHubWorkflowIssueCode;
  path: string;
  detail: string;
}

export interface GitHubWorkflowDefinitionResult {
  definitions: PipelineDefinitionObservation[];
  completeness: SourceCompleteness[];
  issues: GitHubWorkflowIssue[];
}

export interface AcquireGitHubWorkflowDefinitionsInput {
  client: GitHubApiClient;
  owner: string;
  repo: string;
  repositoryId: string;
  revision: string;
  limits?: Partial<GitHubWorkflowAcquisitionLimits>;
}

export interface CorrelateGitHubWorkflowRuntimeInput {
  definitions: readonly PipelineDefinitionObservation[];
  pipelineRuns: readonly PipelineRunObservation[];
  pipelineAttempts: readonly PipelineAttemptObservation[];
  pipelineJobs: readonly PipelineJobObservation[];
}

export interface GitHubWorkflowRuntimeCorrelationResult {
  pipelineJobs: PipelineJobObservation[];
  completeness: SourceCompleteness;
  issues: GitHubWorkflowIssue[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

function acquisitionLimits(overrides?: Partial<GitHubWorkflowAcquisitionLimits>): GitHubWorkflowAcquisitionLimits {
  return {
    maxWorkflowFiles: positiveInteger(overrides?.maxWorkflowFiles, DEFAULT_GITHUB_WORKFLOW_LIMITS.maxWorkflowFiles),
    maxBytesPerFile: positiveInteger(overrides?.maxBytesPerFile, DEFAULT_GITHUB_WORKFLOW_LIMITS.maxBytesPerFile),
    maxTotalBytes: positiveInteger(overrides?.maxTotalBytes, DEFAULT_GITHUB_WORKFLOW_LIMITS.maxTotalBytes),
    maxJobsPerWorkflow: positiveInteger(overrides?.maxJobsPerWorkflow, DEFAULT_GITHUB_WORKFLOW_LIMITS.maxJobsPerWorkflow),
    maxStepsPerJob: positiveInteger(overrides?.maxStepsPerJob, DEFAULT_GITHUB_WORKFLOW_LIMITS.maxStepsPerJob),
    maxMatrixAxes: positiveInteger(overrides?.maxMatrixAxes, DEFAULT_GITHUB_WORKFLOW_LIMITS.maxMatrixAxes),
    maxMatrixValuesPerAxis: positiveInteger(
      overrides?.maxMatrixValuesPerAxis,
      DEFAULT_GITHUB_WORKFLOW_LIMITS.maxMatrixValuesPerAxis,
    ),
  };
}

function hasExpression(value: string): boolean {
  return value.includes('${{');
}

function declaredString(
  value: unknown,
  path: string,
  issues: GitHubWorkflowIssue[],
  allowExpressions = false,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!allowExpressions && hasExpression(value)) {
    issues.push({ code: 'UNRESOLVED_EXPRESSION', path, detail: 'dynamic expression retained as unresolved semantics' });
    return undefined;
  }
  return value;
}

function stringList(value: unknown, path: string, issues: GitHubWorkflowIssue[]): string[] | undefined {
  const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : undefined;
  if (!values) return undefined;
  const result: string[] = [];
  for (const [index, item] of values.entries()) {
    const parsed = declaredString(item, `${path}.${index}`, issues);
    if (parsed !== undefined) result.push(parsed);
    else if (typeof item !== 'string') {
      issues.push({ code: 'UNSUPPORTED_STRUCTURE', path: `${path}.${index}`, detail: 'expected a static string' });
    }
  }
  return result;
}

function pathFilter(
  value: UnknownRecord,
  includeKey: string,
  excludeKey: string,
  path: string,
  issues: GitHubWorkflowIssue[],
): { include?: string[]; exclude?: string[] } | undefined {
  const include = stringList(value[includeKey], `${path}.${includeKey}`, issues);
  const exclude = stringList(value[excludeKey], `${path}.${excludeKey}`, issues);
  if (!include && !exclude) return undefined;
  return { ...(include ? { include } : {}), ...(exclude ? { exclude } : {}) };
}

function parseTriggers(root: UnknownRecord, path: string, issues: GitHubWorkflowIssue[]): PipelineTriggerDeclaration[] {
  const declaration = root.on;
  if (typeof declaration === 'string') return [{ event: declaration }];
  if (Array.isArray(declaration)) {
    return declaration.flatMap((event, index) => {
      const parsed = declaredString(event, `${path}.on.${index}`, issues);
      return parsed ? [{ event: parsed }] : [];
    });
  }
  if (!isRecord(declaration)) {
    issues.push({ code: 'UNSUPPORTED_STRUCTURE', path: `${path}.on`, detail: 'workflow trigger is missing or not statically structured' });
    return [];
  }
  return Object.entries(declaration).map(([event, configuration]) => {
    if (!isRecord(configuration)) return { event };
    const branches = pathFilter(configuration, 'branches', 'branches-ignore', `${path}.on.${event}`, issues);
    const paths = pathFilter(configuration, 'paths', 'paths-ignore', `${path}.on.${event}`, issues);
    return {
      event,
      ...(branches ? { branches } : {}),
      ...(paths ? { paths } : {}),
    };
  });
}

function parseMatrix(
  value: unknown,
  path: string,
  limits: GitHubWorkflowAcquisitionLimits,
  issues: GitHubWorkflowIssue[],
): Record<string, Array<string | number | boolean>> | undefined {
  if (typeof value === 'string' && hasExpression(value)) {
    issues.push({ code: 'UNRESOLVED_EXPRESSION', path, detail: 'dynamic matrix cannot be expanded statically' });
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const axes = Object.entries(value).filter(([key]) => key !== 'include' && key !== 'exclude');
  if ('include' in value || 'exclude' in value) {
    issues.push({ code: 'UNSUPPORTED_STRUCTURE', path, detail: 'matrix include/exclude retained as unresolved semantics' });
  }
  if (axes.length > limits.maxMatrixAxes) {
    issues.push({ code: 'DECLARATION_LIMIT', path, detail: `matrix has ${axes.length} axes; limit is ${limits.maxMatrixAxes}` });
  }
  const result: Record<string, Array<string | number | boolean>> = {};
  for (const [axis, rawValues] of axes.slice(0, limits.maxMatrixAxes)) {
    if (!Array.isArray(rawValues)) {
      issues.push({ code: 'UNRESOLVED_EXPRESSION', path: `${path}.${axis}`, detail: 'matrix axis is not a static array' });
      continue;
    }
    if (rawValues.length > limits.maxMatrixValuesPerAxis) {
      issues.push({
        code: 'DECLARATION_LIMIT', path: `${path}.${axis}`,
        detail: `matrix axis has ${rawValues.length} values; limit is ${limits.maxMatrixValuesPerAxis}`,
      });
    }
    const scalars = rawValues.slice(0, limits.maxMatrixValuesPerAxis)
      .filter((item): item is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof item));
    if (scalars.length !== Math.min(rawValues.length, limits.maxMatrixValuesPerAxis) || scalars.some(item => typeof item === 'string' && hasExpression(item))) {
      issues.push({ code: 'UNSUPPORTED_STRUCTURE', path: `${path}.${axis}`, detail: 'non-scalar or dynamic matrix values were omitted' });
    }
    result[axis] = scalars.filter(item => typeof item !== 'string' || !hasExpression(item));
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseSteps(
  value: unknown,
  path: string,
  limits: GitHubWorkflowAcquisitionLimits,
  issues: GitHubWorkflowIssue[],
): PipelineStepDeclaration[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length > limits.maxStepsPerJob) {
    issues.push({ code: 'DECLARATION_LIMIT', path, detail: `job has ${value.length} steps; limit is ${limits.maxStepsPerJob}` });
  }
  const steps: PipelineStepDeclaration[] = [];
  for (const [index, rawStep] of value.slice(0, limits.maxStepsPerJob).entries()) {
    if (!isRecord(rawStep)) {
      issues.push({ code: 'UNSUPPORTED_STRUCTURE', path: `${path}.${index}`, detail: 'step is not an object' });
      continue;
    }
    const action = declaredString(rawStep.uses, `${path}.${index}.uses`, issues);
    const command = declaredString(rawStep.run, `${path}.${index}.run`, issues, true);
    if (action) {
      issues.push({
        code: 'EXTERNAL_REFERENCE_UNRESOLVED', path: `${path}.${index}.uses`,
        detail: 'action reference is retained without expanding its implementation',
      });
    }
    let semanticReach: 'DIRECT' | 'WRAPPER' | 'DYNAMIC' = 'DIRECT';
    if (command && hasExpression(command)) {
      semanticReach = 'DYNAMIC';
      issues.push({
        code: 'UNRESOLVED_EXPRESSION', path: `${path}.${index}.run`,
        detail: 'command is retained, but dynamic expression values are unresolved',
      });
    } else if (command && /^(?:\.\.?\/\S+|(?:bash|sh|zsh|python\d*|node)\s+\S+\.(?:sh|py|[cm]?js|ts))(?:\s|$)/.test(command.trim())) {
      semanticReach = 'WRAPPER';
      issues.push({
        code: 'WRAPPER_SEMANTICS', path: `${path}.${index}.run`,
        detail: 'wrapper invocation is retained without inferring the script implementation',
      });
    }
    const execution = action
      ? { kind: 'ACTION' as const, reference: action }
      : command
        ? { kind: 'COMMAND' as const, command, semanticReach }
        : undefined;
    if (!execution) {
      issues.push({ code: 'UNSUPPORTED_STRUCTURE', path: `${path}.${index}`, detail: 'step has no static uses or run declaration' });
      continue;
    }
    steps.push({
      ...(typeof rawStep.id === 'string' ? { id: rawStep.id } : {}),
      ...(typeof rawStep.name === 'string' ? { name: rawStep.name } : {}),
      execution,
    });
  }
  return steps;
}

function parseJobs(
  value: unknown,
  path: string,
  limits: GitHubWorkflowAcquisitionLimits,
  issues: GitHubWorkflowIssue[],
): PipelineJobDeclaration[] {
  if (!isRecord(value)) {
    issues.push({ code: 'UNSUPPORTED_STRUCTURE', path, detail: 'jobs declaration is missing or not an object' });
    return [];
  }
  const entries = Object.entries(value);
  if (entries.length > limits.maxJobsPerWorkflow) {
    issues.push({ code: 'DECLARATION_LIMIT', path, detail: `workflow has ${entries.length} jobs; limit is ${limits.maxJobsPerWorkflow}` });
  }
  return entries.slice(0, limits.maxJobsPerWorkflow).flatMap(([id, rawJob]) => {
    if (!isRecord(rawJob)) {
      issues.push({ code: 'UNSUPPORTED_STRUCTURE', path: `${path}.${id}`, detail: 'job is not an object' });
      return [];
    }
    const environment = typeof rawJob.environment === 'string'
      ? declaredString(rawJob.environment, `${path}.${id}.environment`, issues)
      : isRecord(rawJob.environment)
        ? declaredString(rawJob.environment.name, `${path}.${id}.environment.name`, issues)
        : undefined;
    const reusableProcess = declaredString(rawJob.uses, `${path}.${id}.uses`, issues);
    if (reusableProcess) {
      issues.push({
        code: 'EXTERNAL_REFERENCE_UNRESOLVED', path: `${path}.${id}.uses`,
        detail: 'reusable process reference is retained without expanding its implementation',
      });
    }
    const needs = stringList(rawJob.needs, `${path}.${id}.needs`, issues);
    const matrix = parseMatrix(
      isRecord(rawJob.strategy) ? rawJob.strategy.matrix : undefined,
      `${path}.${id}.strategy.matrix`, limits, issues,
    );
    const steps = parseSteps(rawJob.steps, `${path}.${id}.steps`, limits, issues);
    let condition: string | undefined;
    if (typeof rawJob.if === 'string' || typeof rawJob.if === 'boolean' || typeof rawJob.if === 'number') {
      condition = String(rawJob.if);
    } else if ('if' in rawJob) {
      condition = 'UNRESOLVED';
      issues.push({ code: 'UNSUPPORTED_STRUCTURE', path: `${path}.${id}.if`, detail: 'job condition is not a scalar' });
    }
    return [{
      id,
      ...(typeof rawJob.name === 'string' ? { name: rawJob.name } : {}),
      ...(needs ? { needs } : {}),
      ...(matrix ? { matrix } : {}),
      ...(environment ? { environment } : {}),
      ...(condition !== undefined ? { condition } : {}),
      ...(reusableProcess ? { reusableProcess } : {}),
      ...(steps ? { steps } : {}),
    }];
  });
}

export function parseGitHubWorkflowDefinition(
  text: string,
  input: { path: string; repositoryId: string; revision: string; limits?: Partial<GitHubWorkflowAcquisitionLimits> },
): { definition?: PipelineDefinitionObservation; issues: GitHubWorkflowIssue[] } {
  const issues: GitHubWorkflowIssue[] = [];
  const limits = acquisitionLimits(input.limits);
  let parsed: unknown;
  try {
    parsed = parse(text, { maxAliasCount: 50, uniqueKeys: true });
  } catch (error) {
    issues.push({
      code: 'PARSE_ERROR', path: input.path,
      detail: error instanceof Error ? error.message : 'unknown YAML parse failure',
    });
    return { issues };
  }
  if (!isRecord(parsed)) {
    issues.push({ code: 'PARSE_ERROR', path: input.path, detail: 'workflow root is not an object' });
    return { issues };
  }
  const name = typeof parsed.name === 'string' ? parsed.name : input.path;
  return {
    definition: {
      kind: 'pipeline-definition',
      id: githubWorkflowDefinitionId(input.repositoryId, input.path),
      repositoryId: input.repositoryId,
      revision: input.revision,
      name,
      path: input.path,
      triggers: parseTriggers(parsed, input.path, issues),
      jobs: parseJobs(parsed.jobs, `${input.path}.jobs`, limits, issues),
      source: { kind: 'ci-definition', id: `github-contents:${input.path}@${input.revision}` },
    },
    issues,
  };
}

export async function acquireGitHubWorkflowDefinitions(
  input: AcquireGitHubWorkflowDefinitionsInput,
): Promise<GitHubWorkflowDefinitionResult> {
  const limits = acquisitionLimits(input.limits);
  const tree = await input.client.getTree(input.owner, input.repo, input.revision);
  const allPaths = tree.paths
    .filter(path => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path))
    .sort((left, right) => left.localeCompare(right));
  const retainedPaths = allPaths.slice(0, limits.maxWorkflowFiles);
  const definitions: PipelineDefinitionObservation[] = [];
  const issues: GitHubWorkflowIssue[] = [];
  let totalBytes = 0;
  if (!tree.complete) issues.push({ code: 'TREE_PARTIAL', path: '.github/workflows', detail: 'repository tree was truncated' });
  if (allPaths.length > limits.maxWorkflowFiles) {
    issues.push({
      code: 'WORKFLOW_LIMIT', path: '.github/workflows',
      detail: `found ${allPaths.length} workflow files; limit is ${limits.maxWorkflowFiles}`,
    });
  }
  for (const path of retainedPaths) {
    const text = await input.client.getTextFile(input.owner, input.repo, path, input.revision);
    if (text === undefined) {
      issues.push({ code: 'FILE_UNAVAILABLE', path, detail: 'workflow content was unavailable at the evaluated revision' });
      continue;
    }
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > limits.maxBytesPerFile) {
      issues.push({ code: 'FILE_TOO_LARGE', path, detail: `workflow is ${bytes} bytes; limit is ${limits.maxBytesPerFile}` });
      continue;
    }
    if (totalBytes + bytes > limits.maxTotalBytes) {
      issues.push({ code: 'TOTAL_SIZE_LIMIT', path, detail: `total workflow bytes exceed ${limits.maxTotalBytes}` });
      continue;
    }
    totalBytes += bytes;
    const result = parseGitHubWorkflowDefinition(text, {
      path, repositoryId: input.repositoryId, revision: input.revision, limits,
    });
    issues.push(...result.issues);
    if (result.definition) definitions.push(result.definition);
  }
  const acquisitionIssueCodes = new Set<GitHubWorkflowIssueCode>([
    'TREE_PARTIAL', 'WORKFLOW_LIMIT', 'FILE_UNAVAILABLE', 'FILE_TOO_LARGE', 'TOTAL_SIZE_LIMIT', 'PARSE_ERROR',
  ]);
  const acquisitionComplete = tree.complete
    && allPaths.length <= limits.maxWorkflowFiles
    && !issues.some(issue => acquisitionIssueCodes.has(issue.code));
  const semanticsComplete = !issues.some(issue => !acquisitionIssueCodes.has(issue.code));
  return {
    definitions,
    issues,
    completeness: [
      {
        source: 'github-workflow-files', state: acquisitionComplete ? 'COMPLETE' : 'PARTIAL',
        observedCount: definitions.length, expectedCount: allPaths.length,
        ...(!acquisitionComplete ? { reason: 'workflow-file acquisition was bounded, unavailable, truncated, or invalid' } : {}),
      },
      {
        source: 'github-workflow-semantics', state: semanticsComplete ? 'COMPLETE' : 'PARTIAL',
        observedCount: definitions.length,
        ...(!semanticsComplete ? { reason: 'one or more declarations contain unresolved or bounded semantics' } : {}),
      },
    ],
  };
}

export function correlateGitHubWorkflowRuntime(
  input: CorrelateGitHubWorkflowRuntimeInput,
): GitHubWorkflowRuntimeCorrelationResult {
  const definitionsById = new Map(input.definitions.map(definition => [definition.id, definition]));
  const runsById = new Map(input.pipelineRuns.map(run => [run.id, run]));
  const attemptsById = new Map(input.pipelineAttempts.map(attempt => [attempt.id, attempt]));
  const issues: GitHubWorkflowIssue[] = [];
  let mappedCount = 0;
  const jobs = input.pipelineJobs.map(job => {
    const attempt = attemptsById.get(job.pipelineAttemptId);
    const run = attempt ? runsById.get(attempt.pipelineRunId) : undefined;
    const definition = run?.pipelineDefinitionId ? definitionsById.get(run.pipelineDefinitionId) : undefined;
    const candidates = definition?.jobs.filter(declaration => job.name === (declaration.name ?? declaration.id)) ?? [];
    if (candidates.length !== 1) {
      issues.push({
        code: 'RUNTIME_CORRELATION_UNRESOLVED', path: job.id,
        detail: candidates.length === 0 ? 'no exact declaration label matched the runtime job' : 'multiple declarations matched the runtime job',
      });
      return { ...job };
    }
    mappedCount += 1;
    const declaration = candidates[0];
    if (declaration.matrix) {
      issues.push({
        code: 'MATRIX_RUNTIME_UNAVAILABLE', path: job.id,
        detail: 'runtime job has no structured matrix coordinates; display name was not parsed',
      });
    }
    return {
      ...job,
      logicalJobId: declaration.id,
      ...(declaration.needs ? { needs: [...declaration.needs] } : {}),
    };
  });

  const declarationsByRun = new Map(input.pipelineRuns.flatMap(run => {
    const definition = run.pipelineDefinitionId ? definitionsById.get(run.pipelineDefinitionId) : undefined;
    return definition ? [[run.id, new Map(definition.jobs.map(job => [job.id, job]))] as const] : [];
  }));
  const enrichedJobs = jobs.map(job => {
    if (job.outcome !== 'SKIPPED' || !job.logicalJobId || !job.needs || job.needs.length === 0) return job;
    const attempt = attemptsById.get(job.pipelineAttemptId);
    const declaration = attempt
      ? declarationsByRun.get(attempt.pipelineRunId)?.get(job.logicalJobId)
      : undefined;
    if (!attempt || !declaration || declaration.condition !== undefined) return job;
    const blockers = jobs.filter(candidate =>
      candidate.pipelineAttemptId === job.pipelineAttemptId
      && candidate.logicalJobId !== undefined
      && job.needs!.includes(candidate.logicalJobId)
      && (candidate.outcome === 'FAILED' || candidate.outcome === 'SKIPPED' || candidate.lifecycle === 'CANCELLED'),
    ).map(candidate => candidate.id).sort((left, right) => left.localeCompare(right));
    return blockers.length > 0 ? { ...job, blockedByPipelineJobIds: blockers } : job;
  });
  return {
    pipelineJobs: enrichedJobs,
    issues,
    completeness: {
      source: 'github-workflow-runtime-correlation',
      state: mappedCount === input.pipelineJobs.length && !issues.some(issue => issue.code === 'MATRIX_RUNTIME_UNAVAILABLE')
        ? 'COMPLETE'
        : 'PARTIAL',
      observedCount: mappedCount,
      expectedCount: input.pipelineJobs.length,
      ...(mappedCount !== input.pipelineJobs.length || issues.some(issue => issue.code === 'MATRIX_RUNTIME_UNAVAILABLE')
        ? { reason: 'runtime jobs without an exact declaration match or structured matrix coordinates remain unresolved' }
        : {}),
    },
  };
}
