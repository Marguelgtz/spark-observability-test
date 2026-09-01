import type {
  ClaimDerivation,
  ClaimEvidenceReference,
  ClaimProvenance,
  ClaimSupport,
  CompletenessAssessment,
  CompletenessState,
  EvidenceAttribution,
  EvidenceExpectation,
  EvidenceExpectationSelector,
  EvidenceRunObservation,
  PipelineDefinitionObservation,
  RepositoryUnderstanding,
  UnderstandingTarget,
} from '@spark/core';

export type GitHubWorkflowEvidenceIssueCode =
  | 'TRIGGER_INPUT_UNAVAILABLE'
  | 'TRIGGER_PATTERN_UNSUPPORTED'
  | 'EXPECTATION_SEMANTICS_UNRESOLVED'
  | 'EVIDENCE_PROCESS_UNLINKED';

export interface GitHubWorkflowEvidenceIssue {
  code: GitHubWorkflowEvidenceIssueCode;
  path: string;
  detail: string;
}

export interface GitHubEvidenceAttributionRule {
  id: string;
  target: UnderstandingTarget;
  match?: EvidenceExpectationSelector;
  /** Optional exact direct command that must be present in the matched declared job. */
  declaredCommand?: string;
  provenance: ClaimProvenance;
  derivation: ClaimDerivation;
  evidence?: ClaimEvidenceReference[];
  completeness?: { state: CompletenessState; reason?: string };
}

export interface GitHubEvidenceExpectationRule {
  id: string;
  name: string;
  target: UnderstandingTarget;
  match?: EvidenceExpectationSelector;
  provenance: ClaimProvenance;
  derivation: ClaimDerivation;
  evidence?: ClaimEvidenceReference[];
  completeness?: { state: CompletenessState; reason?: string };
}

export interface DeriveGitHubWorkflowEvidenceInput {
  understanding: Readonly<RepositoryUnderstanding>;
  event: string;
  /** The base/target branch for pull requests, not the provider run's head branch. */
  targetBranch?: string;
  attributionRules?: readonly GitHubEvidenceAttributionRule[];
  expectationRules?: readonly GitHubEvidenceExpectationRule[];
}

export interface GitHubWorkflowEvidenceResult {
  evidenceAttributions: EvidenceAttribution[];
  evidenceExpectations: EvidenceExpectation[];
  completeness: CompletenessAssessment[];
  issues: GitHubWorkflowEvidenceIssue[];
}

interface ProcessIdentity {
  pipelineDefinitionId?: string;
  logicalJobId?: string;
}

interface TriggerSelection {
  applies: boolean;
  scoped: boolean;
  artifactIds: string[];
  complete: boolean;
}

function safeId(value: string): string {
  return encodeURIComponent(value).replaceAll('%', '_');
}

function compilePattern(pattern: string): RegExp | undefined {
  if (!pattern || pattern.startsWith('!') || /[\[\]{}()+?]/.test(pattern)) return undefined;
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      source += '.*';
      index += 1;
    } else if (character === '*') {
      source += '[^/]*';
    } else {
      source += character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

function matchesPatterns(
  value: string,
  patterns: readonly string[],
  path: string,
  issues: GitHubWorkflowEvidenceIssue[],
): boolean | undefined {
  const compiled = patterns.map((pattern, index) => {
    const matcher = compilePattern(pattern);
    if (!matcher) {
      issues.push({
        code: 'TRIGGER_PATTERN_UNSUPPORTED', path: `${path}.${index}`,
        detail: `pattern ${JSON.stringify(pattern)} is outside the bounded matcher`,
      });
    }
    return matcher;
  });
  if (compiled.some(item => item === undefined)) return undefined;
  return compiled.some(item => item!.test(value));
}

function triggerSelection(
  definition: PipelineDefinitionObservation,
  input: DeriveGitHubWorkflowEvidenceInput,
  issues: GitHubWorkflowEvidenceIssue[],
): TriggerSelection {
  const artifacts = input.understanding.observations.change.artifacts.flatMap(change => {
    const artifact = input.understanding.observations.artifacts.find(item => item.id === change.artifactId);
    return artifact ? [artifact] : [];
  });
  const matching = definition.triggers.filter(trigger => trigger.event === input.event);
  let complete = true;
  let scoped = false;
  const selected = new Set<string>();
  let appliesWithoutPathScope = false;

  for (const [index, trigger] of matching.entries()) {
    const triggerPath = `${definition.path}.on.${input.event}.${index}`;
    if (trigger.branches && input.targetBranch === undefined) {
      issues.push({
        code: 'TRIGGER_INPUT_UNAVAILABLE', path: `${triggerPath}.branches`,
        detail: 'target branch is required to evaluate the declared branch filter',
      });
      complete = false;
      continue;
    }
    if (trigger.branches && input.targetBranch !== undefined) {
      const included = trigger.branches.include
        ? matchesPatterns(input.targetBranch, trigger.branches.include, `${triggerPath}.branches.include`, issues)
        : true;
      const excluded = trigger.branches.exclude
        ? matchesPatterns(input.targetBranch, trigger.branches.exclude, `${triggerPath}.branches.exclude`, issues)
        : false;
      if (included === undefined || excluded === undefined) {
        complete = false;
        continue;
      }
      if (!included || excluded) continue;
    }
    if (!trigger.paths) {
      appliesWithoutPathScope = true;
      continue;
    }
    scoped = true;
    let triggerComplete = true;
    for (const artifact of artifacts) {
      const included = trigger.paths.include
        ? matchesPatterns(artifact.path, trigger.paths.include, `${triggerPath}.paths.include`, issues)
        : true;
      const excluded = trigger.paths.exclude
        ? matchesPatterns(artifact.path, trigger.paths.exclude, `${triggerPath}.paths.exclude`, issues)
        : false;
      if (included === undefined || excluded === undefined) {
        triggerComplete = false;
        continue;
      }
      if (included && !excluded) selected.add(artifact.id);
    }
    complete &&= triggerComplete;
  }
  return {
    applies: matching.length > 0 && (appliesWithoutPathScope || selected.size > 0),
    scoped: scoped && !appliesWithoutPathScope,
    artifactIds: [...selected].sort((left, right) => left.localeCompare(right)),
    complete,
  };
}

function processIdentity(run: EvidenceRunObservation, understanding: Readonly<RepositoryUnderstanding>): ProcessIdentity {
  const job = run.pipelineJobId
    ? understanding.observations.pipelineJobs.find(item => item.id === run.pipelineJobId)
    : undefined;
  const attemptId = run.pipelineAttemptId ?? job?.pipelineAttemptId;
  const attempt = attemptId
    ? understanding.observations.pipelineAttempts.find(item => item.id === attemptId)
    : undefined;
  const pipelineRunId = run.pipelineRunId ?? attempt?.pipelineRunId;
  const pipelineRun = pipelineRunId
    ? understanding.observations.pipelineRuns.find(item => item.id === pipelineRunId)
    : undefined;
  return { pipelineDefinitionId: pipelineRun?.pipelineDefinitionId, logicalJobId: job?.logicalJobId };
}

function selectorMatches(
  selector: EvidenceExpectationSelector | undefined,
  evidence: EvidenceRunObservation,
  identity: ProcessIdentity,
  fallbackName?: string,
): boolean {
  if ((selector?.evidenceName ?? fallbackName) && (selector?.evidenceName ?? fallbackName) !== evidence.name) return false;
  if (selector?.evidenceKind && selector.evidenceKind !== evidence.evidenceKind) return false;
  if (selector?.pipelineDefinitionId && selector.pipelineDefinitionId !== identity.pipelineDefinitionId) return false;
  return !selector?.logicalJobId || selector.logicalJobId === identity.logicalJobId;
}

function declaredCommandMatches(
  command: string | undefined,
  identity: ProcessIdentity,
  understanding: Readonly<RepositoryUnderstanding>,
): boolean {
  if (!command) return true;
  if (!identity.pipelineDefinitionId || !identity.logicalJobId) return false;
  const job = understanding.observations.pipelineDefinitions
    .find(definition => definition.id === identity.pipelineDefinitionId)
    ?.jobs.find(item => item.id === identity.logicalJobId);
  return job?.steps?.some(step => step.execution.kind === 'COMMAND'
    && step.execution.semanticReach !== 'WRAPPER'
    && step.execution.semanticReach !== 'DYNAMIC'
    && step.execution.command === command) ?? false;
}

function support(
  provenance: ClaimProvenance,
  derivation: ClaimDerivation,
  evidence: ClaimEvidenceReference[],
  completeness: CompletenessState = 'COMPLETE',
  reason?: string,
): ClaimSupport[] {
  return [{
    provenance,
    derivation,
    confidence: completeness === 'COMPLETE' ? 'SUPPORTED' : 'UNKNOWN',
    evidence,
    completeness: { state: completeness, ...(reason ? { reason } : {}) },
  }];
}

function artifactTargets(
  artifactIds: readonly string[],
  understanding: Readonly<RepositoryUnderstanding>,
): UnderstandingTarget[] {
  const areas = new Set<string>();
  for (const membership of understanding.memberships) {
    for (const artifactId of artifactIds) {
      const artifact = understanding.observations.artifacts.find(item => item.id === artifactId);
      if (membership.target.kind === 'ARTIFACT' && membership.target.artifactId === artifactId) areas.add(membership.areaId);
      if (membership.target.kind === 'PATH' && artifact
        && (artifact.path === membership.target.path || artifact.path.startsWith(`${membership.target.path}/`))) {
        areas.add(membership.areaId);
      }
    }
  }
  const boundaries = understanding.boundaries.filter(boundary =>
    boundary.artifactIds.some(id => artifactIds.includes(id))
    || boundary.connectedAreaIds.some(id => areas.has(id)))
    .sort((left, right) => left.id.localeCompare(right.id));
  return [
    ...artifactIds.map(artifactId => ({ kind: 'ARTIFACT' as const, artifactId })),
    ...[...areas].sort().map(areaId => ({ kind: 'AREA' as const, areaId })),
    ...boundaries.map(boundary => ({ kind: 'BOUNDARY' as const, boundaryId: boundary.id })),
  ];
}

function completenessAssessments(
  understanding: Readonly<RepositoryUnderstanding>,
  semanticState: CompletenessState,
  semanticReason: string | undefined,
): CompletenessAssessment[] {
  const dimensions = [
    ['workflow-acquisition', 'github-workflow-files'],
    ['runtime-acquisition', 'github-actions-runs'],
    ['job-acquisition', 'github-actions-jobs'],
    ['step-acquisition', 'github-actions-steps'],
  ] as const;
  const assessments = dimensions.map(([dimension, sourceName]) => {
    const source = understanding.observations.completeness.find(item => item.source === sourceName);
    const state = source?.state ?? 'UNAVAILABLE';
    const reason = source?.reason ?? (!source ? `${sourceName} completeness was not supplied` : undefined);
    return {
      id: `completeness:ci-process:${dimension}`,
      dimension: `ci-process:${dimension}`,
      state,
      ...(reason ? { reason } : {}),
      support: support(
        { kind: 'WORKFLOW_ANALYZER', source: 'github-workflow-evidence', version: '1' },
        'DETERMINISTIC', [], state, reason,
      ),
    };
  });
  return [...assessments, {
    id: 'completeness:ci-process:semantic-attribution',
    dimension: 'ci-process:semantic-attribution',
    state: semanticState,
    ...(semanticReason ? { reason: semanticReason } : {}),
    support: support(
      { kind: 'WORKFLOW_ANALYZER', source: 'github-workflow-evidence', version: '1' },
      'DETERMINISTIC', [], semanticState, semanticReason,
    ),
  }];
}

export function deriveGitHubWorkflowEvidence(
  input: DeriveGitHubWorkflowEvidenceInput,
): GitHubWorkflowEvidenceResult {
  const issues: GitHubWorkflowEvidenceIssue[] = [];
  const evidenceAttributions: EvidenceAttribution[] = [];
  const evidenceExpectations: EvidenceExpectation[] = [];
  const change = input.understanding.observations.change;
  const currentEvidence = input.understanding.observations.evidenceRuns.filter(run =>
    run.repositoryId === change.repositoryId && run.revision === change.headRevision);
  const definitions = input.understanding.observations.pipelineDefinitions.filter(definition =>
    definition.repositoryId === change.repositoryId && definition.revision === change.headRevision);
  const selections = new Map(definitions.map(definition => [
    definition.id,
    triggerSelection(definition, input, issues),
  ]));

  for (const evidence of currentEvidence) {
    const identity = processIdentity(evidence, input.understanding);
    const definition = identity.pipelineDefinitionId
      ? definitions.find(item => item.id === identity.pipelineDefinitionId)
      : undefined;
    if (!definition) {
      issues.push({
        code: 'EVIDENCE_PROCESS_UNLINKED', path: evidence.id,
        detail: 'evidence remains an execution fact because no exact-revision workflow definition was linked',
      });
    } else {
      const selection = selections.get(definition.id)!;
      if (selection.applies && selection.complete && selection.scoped) {
        for (const target of artifactTargets(selection.artifactIds, input.understanding)) {
          evidenceAttributions.push({
            id: `evidence-attribution:workflow:${safeId(evidence.id)}:${safeId(JSON.stringify(target))}`,
            evidenceRunId: evidence.id,
            target,
            support: support(
              { kind: 'WORKFLOW_ANALYZER', source: definition.path, version: '1' },
              'DECLARED', [
                { kind: 'EVIDENCE_RUN', id: evidence.id },
                { kind: 'OBSERVATION', id: definition.id },
                ...selection.artifactIds.map(id => ({ kind: 'ARTIFACT' as const, id })),
              ],
            ),
          });
        }
      }
    }
    for (const rule of input.attributionRules ?? []) {
      if (!selectorMatches(rule.match, evidence, identity)
        || !declaredCommandMatches(rule.declaredCommand, identity, input.understanding)) continue;
      evidenceAttributions.push({
        id: `evidence-attribution:rule:${safeId(rule.id)}:${safeId(evidence.id)}`,
        evidenceRunId: evidence.id,
        target: rule.target,
        support: support(rule.provenance, rule.derivation, [
          { kind: 'EVIDENCE_RUN', id: evidence.id }, ...(rule.evidence ?? []),
        ], rule.completeness?.state, rule.completeness?.reason),
      });
    }
  }

  for (const definition of definitions) {
    const selection = selections.get(definition.id)!;
    if (!selection.applies || !selection.complete) continue;
    for (const job of definition.jobs) {
      if (job.condition !== undefined || job.reusableProcess || job.matrix
        || !job.steps || job.steps.length === 0 || job.name?.includes('${{')) {
        issues.push({
          code: 'EXPECTATION_SEMANTICS_UNRESOLVED', path: `${definition.path}.jobs.${job.id}`,
          detail: 'conditional, reusable, matrix-expanded, dynamically named, or structurally incomplete job was not converted into a missing-evidence expectation',
        });
        continue;
      }
      evidenceExpectations.push({
        id: `evidence-expectation:workflow:${safeId(definition.id)}:${safeId(job.id)}:${safeId(change.id)}`,
        name: job.name ?? job.id,
        target: { kind: 'CHANGE', changeId: change.id },
        match: {
          evidenceName: job.name ?? job.id,
          evidenceKind: 'github-check-run',
          pipelineDefinitionId: definition.id,
          logicalJobId: job.id,
        },
        support: support(
          { kind: 'WORKFLOW_ANALYZER', source: definition.path, version: '1' },
          'DECLARED', [
            { kind: 'OBSERVATION', id: definition.id },
            ...selection.artifactIds.map(id => ({ kind: 'ARTIFACT' as const, id })),
          ],
        ),
      });
    }
  }

  for (const rule of input.expectationRules ?? []) {
    evidenceExpectations.push({
      id: `evidence-expectation:rule:${safeId(rule.id)}:${safeId(change.id)}`,
      name: rule.name,
      target: rule.target,
      ...(rule.match ? { match: rule.match } : {}),
      support: support(
        rule.provenance, rule.derivation, rule.evidence ?? [],
        rule.completeness?.state, rule.completeness?.reason,
      ),
    });
  }

  const semanticSources = [
    'github-workflow-semantics',
    'github-workflow-runtime-correlation',
    'github-check-runs',
  ].map(source => input.understanding.observations.completeness.find(item => item.source === source));
  const semanticState: CompletenessState = semanticSources.some(item => item === undefined || item.state === 'UNAVAILABLE')
    ? 'UNAVAILABLE'
    : issues.length > 0 || semanticSources.some(item => item?.state === 'PARTIAL')
      ? 'PARTIAL'
      : 'COMPLETE';
  const semanticReason = semanticState !== 'COMPLETE'
    ? `${issues.length} unresolved claim issue(s); supporting semantic sources are ${semanticSources.map(item => item?.state ?? 'UNAVAILABLE').join('/')}`
    : undefined;
  return {
    evidenceAttributions,
    evidenceExpectations,
    completeness: completenessAssessments(input.understanding, semanticState, semanticReason),
    issues,
  };
}
