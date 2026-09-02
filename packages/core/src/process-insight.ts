/** G7 — bounded deterministic CI/CD insights. */
import type {
    ClaimConfidence, ClaimDerivation, ClaimSupport, EvidenceExpectationSelector,
    EvidenceRunObservation, PipelineJobObservation, PipelineStepObservation,
    ProcessLifecycle, ProcessOutcome, RepositoryUnderstanding, SourceCompleteness,
    UnderstandingTarget,
} from './understanding';
import {
    currentEvidenceRuns, evidenceAcquisitionIsComplete, evidenceProcessIdentity,
    expectationMatchesEvidence, supportedExpectationClaim,
} from './evidence-matching';
import type { ProcessObservationRecord } from './process-observation';
import { reconstructProcessState } from './process-reconstruction';
import { canonicalJson } from './process-export';
import { normalizeRepositoryUnderstanding } from './understanding-normalize';

export type ProcessInsightKind =
    | 'NORMAL_LIFECYCLE' | 'FAILURE_LOCALIZED' | 'FAILURE_DOMAIN'
    | 'REPRODUCTION_CANDIDATE' | 'BLOCKED_DOWNSTREAM' | 'MATRIX_RESULT'
    | 'FLAKE_CANDIDATE' | 'MISSING_EXPECTED' | 'VERIFICATION_GAP' | 'RECOVERY'
    | 'DEPLOYMENT_STATE';

export type FailureDomain =
    | 'SETUP' | 'DEPENDENCY_INSTALL' | 'STATIC_ANALYSIS' | 'BUILD'
    | 'TEST' | 'INTEGRATION' | 'DEPLOYMENT' | 'UNKNOWN';

export interface ProcessInsight {
    kind: 'process-insight';
    id: string;
    insightKind: ProcessInsightKind;
    repositoryId: string;
    revision: string;
    derivation: ClaimDerivation;
    confidence: ClaimConfidence;
    summary: string;
    supportingObservationIds: string[];
    areaIds: string[];
    boundaryIds: string[];
    completeness: SourceCompleteness[];
    detail: ProcessInsightDetail;
}

export interface NormalLifecycleDetail {
    insightKind: 'NORMAL_LIFECYCLE';
    pipelineRunIds: string[];
    runningCount: number;
    queuedCount: number;
    completedCount: number;
    cancelledCount: number;
    failedCount: 0;
}

export interface FailureLocalizedDetail {
    insightKind: 'FAILURE_LOCALIZED';
    level: 'STEP' | 'JOB' | 'EVIDENCE';
    pipelineDefinitionId?: string;
    pipelineRunId?: string;
    pipelineAttemptId?: string;
    pipelineJobId?: string;
    pipelineStepId?: string;
    evidenceRunIds: string[];
    providerUrls: string[];
}

export interface FailureDomainDetail {
    insightKind: 'FAILURE_DOMAIN';
    localizedFailureId: string;
    domain: FailureDomain;
    matchedName?: string;
}

export interface ReproductionCandidateDetail {
    insightKind: 'REPRODUCTION_CANDIDATE';
    pipelineStepId: string;
    command: string;
    sourcePath: string;
    caveat: string;
}

export interface BlockedDownstreamDetail {
    insightKind: 'BLOCKED_DOWNSTREAM';
    pipelineJobId: string;
    blockers: Array<{
        pipelineJobId: string; name: string; lifecycle: ProcessLifecycle; outcome: ProcessOutcome;
    }>;
}

export interface MatrixResultDetail {
    insightKind: 'MATRIX_RESULT';
    pipelineRunId: string;
    logicalJobId: string;
    executions: Array<{
        pipelineJobId: string; pipelineAttemptId: string;
        matrix: Record<string, string | number | boolean>;
        lifecycle: ProcessLifecycle; outcome: ProcessOutcome;
    }>;
}

export interface FlakeCandidateDetail {
    insightKind: 'FLAKE_CANDIDATE';
    pipelineRunId: string;
    logicalJobId: string;
    failedPipelineJobId: string;
    failedAttempt: number;
    passedPipelineJobId: string;
    passedAttempt: number;
}

export interface MissingExpectedDetail {
    insightKind: 'MISSING_EXPECTED';
    expectationId: string;
    expectationName: string;
    selector?: EvidenceExpectationSelector;
}

export interface VerificationGapDetail {
    insightKind: 'VERIFICATION_GAP';
    target: { kind: 'AREA' | 'BOUNDARY'; id: string; label: string };
    changedArtifactIds: string[];
}

export interface RecoveryDetail {
    insightKind: 'RECOVERY';
    conditionKind: 'FAILED_JOB' | 'MISSING_EXPECTED';
    previousAt: string;
    currentAt: string;
    previousSupplyingRecordId: string;
    currentSupplyingRecordId: string;
    previousObservationId: string;
    resolvingObservationId: string;
}

export type ProcessInsightDetail =
    | NormalLifecycleDetail | FailureLocalizedDetail | FailureDomainDetail
    | ReproductionCandidateDetail | BlockedDownstreamDetail | MatrixResultDetail
    | FlakeCandidateDetail | MissingExpectedDetail | VerificationGapDetail | RecoveryDetail;

export interface ProcessInsightLimits {
    maxInsights: number;
    maxSupportingObservationIds: number;
    maxAreaIds: number;
    maxBoundaryIds: number;
    maxCompletenessDimensions: number;
    maxMatrixExecutions: number;
    maxDetailItems: number;
}

export const DEFAULT_PROCESS_INSIGHT_LIMITS: ProcessInsightLimits = {
    maxInsights: 200,
    maxSupportingObservationIds: 100,
    maxAreaIds: 50,
    maxBoundaryIds: 50,
    maxCompletenessDimensions: 50,
    maxMatrixExecutions: 100,
    maxDetailItems: 100,
};

export interface ProcessInsightTruncation {
    collection: string;
    observedCount: number;
    retainedCount: number;
}

export interface ProcessInsightSet {
    schemaVersion: 'process-insights/v1';
    repositoryId: string;
    revision: string;
    insights: ProcessInsight[];
    completeness: { state: 'COMPLETE' | 'PARTIAL'; normalizationIssueCount: number };
    truncation: ProcessInsightTruncation[];
}

interface CurrentScope {
    runIds: Set<string>;
    attempts: RepositoryUnderstanding['observations']['pipelineAttempts'];
    jobs: PipelineJobObservation[];
    steps: PipelineStepObservation[];
    evidence: EvidenceRunObservation[];
}

interface FailureLocation {
    subjectId: string;
    level: FailureLocalizedDetail['level'];
    name: string;
    step?: PipelineStepObservation;
    job?: PipelineJobObservation;
    pipelineRunId?: string;
    pipelineAttemptId?: string;
    pipelineDefinitionId?: string;
    evidence: EvidenceRunObservation[];
}

const terminal = (lifecycle: ProcessLifecycle): boolean =>
    lifecycle === 'COMPLETED' || lifecycle === 'CANCELLED';
const failed = (value: { lifecycle: ProcessLifecycle; outcome: ProcessOutcome }): boolean =>
    terminal(value.lifecycle) && value.outcome === 'FAILED';
const passed = (value: { lifecycle: ProcessLifecycle; outcome: ProcessOutcome }): boolean =>
    value.lifecycle === 'COMPLETED' && value.outcome === 'PASSED';

function sortUnique(values: readonly string[]): string[] {
    return [...new Set(values)].sort();
}

function stableSort<T extends { id: string }>(values: readonly T[]): T[] {
    return [...values].sort((a, b) => a.id.localeCompare(b.id));
}

function supportedClaim(support: readonly ClaimSupport[]): ClaimSupport | undefined {
    return support.find(item => item.confidence === 'SUPPORTED'
        && item.completeness.state === 'COMPLETE'
        && (item.derivation === 'DECLARED' || item.derivation === 'DETERMINISTIC'));
}

function supportIds(support: ClaimSupport | undefined): string[] {
    return support ? support.evidence.map(item => item.id) : [];
}

function currentScope(understanding: RepositoryUnderstanding): CurrentScope {
    const change = understanding.observations.change;
    const runs = understanding.observations.pipelineRuns.filter(run =>
        run.repositoryId === change.repositoryId && run.revision === change.headRevision);
    const runIds = new Set(runs.map(run => run.id));
    const attempts = understanding.observations.pipelineAttempts.filter(attempt => runIds.has(attempt.pipelineRunId));
    const attemptIds = new Set(attempts.map(attempt => attempt.id));
    const jobs = understanding.observations.pipelineJobs.filter(job => attemptIds.has(job.pipelineAttemptId));
    const jobIds = new Set(jobs.map(job => job.id));
    const steps = understanding.observations.pipelineSteps.filter(step => jobIds.has(step.pipelineJobId));
    return { runIds, attempts, jobs, steps, evidence: currentEvidenceRuns(understanding) };
}

function attemptForJob(scope: CurrentScope, job: PipelineJobObservation) {
    return scope.attempts.find(attempt => attempt.id === job.pipelineAttemptId);
}

function runIdForJob(scope: CurrentScope, job: PipelineJobObservation): string | undefined {
    return attemptForJob(scope, job)?.pipelineRunId;
}

function definitionIdForRun(understanding: RepositoryUnderstanding, runId?: string): string | undefined {
    return runId ? understanding.observations.pipelineRuns.find(run => run.id === runId)?.pipelineDefinitionId : undefined;
}

function targetIds(target: UnderstandingTarget): { areaIds: string[]; boundaryIds: string[] } {
    return {
        areaIds: target.kind === 'AREA' ? [target.areaId] : [],
        boundaryIds: target.kind === 'BOUNDARY' ? [target.boundaryId] : [],
    };
}

function attributedTargets(
    understanding: RepositoryUnderstanding,
    evidence: readonly EvidenceRunObservation[],
): { areaIds: string[]; boundaryIds: string[]; claimIds: string[] } {
    const evidenceIds = new Set(evidence.map(item => item.id));
    const areaIds: string[] = [];
    const boundaryIds: string[] = [];
    const claimIds: string[] = [];
    for (const attribution of understanding.evidenceAttributions) {
        const claim = supportedClaim(attribution.support);
        if (!claim || !evidenceIds.has(attribution.evidenceRunId)) continue;
        const target = attribution.target;
        claimIds.push(attribution.id, ...supportIds(claim));
        if (target.kind === 'AREA') areaIds.push(target.areaId);
        if (target.kind === 'BOUNDARY') boundaryIds.push(target.boundaryId);
        if (target.kind === 'ARTIFACT') {
            const artifact = understanding.observations.artifacts.find(item => item.id === target.artifactId);
            for (const membership of understanding.memberships) {
                if (!supportedClaim(membership.support)) continue;
                if ((membership.target.kind === 'ARTIFACT' && membership.target.artifactId === target.artifactId)
                    || (membership.target.kind === 'PATH' && artifact && pathContains(membership.target.path, artifact.path))) {
                    areaIds.push(membership.areaId);
                }
            }
            for (const boundary of understanding.boundaries) {
                if (supportedClaim(boundary.support) && boundary.artifactIds.includes(target.artifactId)) {
                    boundaryIds.push(boundary.id);
                }
            }
        }
    }
    return { areaIds: sortUnique(areaIds), boundaryIds: sortUnique(boundaryIds), claimIds: sortUnique(claimIds) };
}

function lifecycleInsight(understanding: RepositoryUnderstanding, scope: CurrentScope): ProcessInsight | undefined {
    if (scope.runIds.size === 0) return undefined;
    const observed = [...scope.attempts, ...scope.jobs, ...scope.steps, ...scope.evidence];
    if (observed.length === 0 || observed.some(failed)) return undefined;
    const units = scope.jobs.length > 0 ? scope.jobs : scope.attempts.length > 0 ? scope.attempts : scope.evidence;
    const running = units.filter(item => item.lifecycle === 'RUNNING').length;
    const queued = units.filter(item => item.lifecycle === 'QUEUED').length;
    const completed = units.filter(item => item.lifecycle === 'COMPLETED').length;
    const cancelled = units.filter(item => item.lifecycle === 'CANCELLED').length;
    const complete = evidenceAcquisitionIsComplete(understanding);
    const change = understanding.observations.change;
    const summary = complete
        ? running + queued > 0
            ? `head revision ${change.headRevision}: ${String(running + queued)} of ${String(units.length)} verification executions in progress; no completed failure observed`
            : `head revision ${change.headRevision}: all ${String(units.length)} observed verification executions finished; no completed failure observed`
        : `head revision ${change.headRevision}: verification activity observed, but partial evidence cannot exclude unobserved failures`;
    return {
        kind: 'process-insight', id: `process-insight:normal-lifecycle:${change.repositoryId}:${change.headRevision}`,
        insightKind: 'NORMAL_LIFECYCLE', repositoryId: change.repositoryId, revision: change.headRevision,
        derivation: 'DETERMINISTIC', confidence: complete ? 'SUPPORTED' : 'UNKNOWN', summary,
        supportingObservationIds: sortUnique([...scope.runIds, ...units.map(item => item.id)]),
        areaIds: [], boundaryIds: [], completeness: [...understanding.observations.completeness],
        detail: {
            insightKind: 'NORMAL_LIFECYCLE', pipelineRunIds: sortUnique([...scope.runIds]),
            runningCount: running, queuedCount: queued, completedCount: completed,
            cancelledCount: cancelled, failedCount: 0,
        },
    };
}

function failureLocations(understanding: RepositoryUnderstanding, scope: CurrentScope): FailureLocation[] {
    const locations: FailureLocation[] = [];
    const failedSteps = scope.steps.filter(failed);
    const failedStepJobIds = new Set(failedSteps.map(step => step.pipelineJobId));
    for (const step of failedSteps) {
        const job = scope.jobs.find(item => item.id === step.pipelineJobId);
        const attempt = job ? attemptForJob(scope, job) : undefined;
        const pipelineRunId = attempt?.pipelineRunId;
        const evidence = scope.evidence.filter(item =>
            item.pipelineStepId === step.id || (!item.pipelineStepId && item.pipelineJobId === job?.id));
        locations.push({
            subjectId: step.id, level: 'STEP', name: step.name, step, job, pipelineRunId,
            pipelineAttemptId: attempt?.id, pipelineDefinitionId: definitionIdForRun(understanding, pipelineRunId), evidence,
        });
    }
    for (const job of scope.jobs.filter(item => failed(item) && !failedStepJobIds.has(item.id))) {
        const attempt = attemptForJob(scope, job);
        const pipelineRunId = attempt?.pipelineRunId;
        locations.push({
            subjectId: job.id, level: 'JOB', name: job.name, job, pipelineRunId,
            pipelineAttemptId: attempt?.id, pipelineDefinitionId: definitionIdForRun(understanding, pipelineRunId),
            evidence: scope.evidence.filter(item => item.pipelineJobId === job.id),
        });
    }
    const claimedEvidence = new Set(locations.flatMap(item => item.evidence.map(run => run.id)));
    for (const run of scope.evidence.filter(item => failed(item) && !claimedEvidence.has(item.id))) {
        const identity = evidenceProcessIdentity(run, understanding);
        locations.push({
            subjectId: run.id, level: 'EVIDENCE', name: run.name,
            step: identity.pipelineStepId ? scope.steps.find(item => item.id === identity.pipelineStepId) : undefined,
            job: identity.pipelineJobId ? scope.jobs.find(item => item.id === identity.pipelineJobId) : undefined,
            pipelineRunId: identity.pipelineRunId, pipelineAttemptId: identity.pipelineAttemptId,
            pipelineDefinitionId: identity.pipelineDefinitionId, evidence: [run],
        });
    }
    return locations.sort((a, b) => a.subjectId.localeCompare(b.subjectId));
}

function localizedFailureInsight(understanding: RepositoryUnderstanding, location: FailureLocation): ProcessInsight {
    const change = understanding.observations.change;
    const targets = attributedTargets(understanding, location.evidence);
    const evidenceIds = location.evidence.map(item => item.id);
    return {
        kind: 'process-insight', id: `process-insight:failure-localized:${location.subjectId}`,
        insightKind: 'FAILURE_LOCALIZED', repositoryId: change.repositoryId, revision: change.headRevision,
        derivation: 'DETERMINISTIC', confidence: 'SUPPORTED',
        summary: `${location.level.toLowerCase()} ${location.name} failed on head revision ${change.headRevision}`,
        supportingObservationIds: sortUnique([
            location.subjectId, ...(location.job ? [location.job.id] : []), ...evidenceIds, ...targets.claimIds,
        ]),
        areaIds: targets.areaIds, boundaryIds: targets.boundaryIds,
        completeness: [...understanding.observations.completeness],
        detail: {
            insightKind: 'FAILURE_LOCALIZED', level: location.level,
            pipelineDefinitionId: location.pipelineDefinitionId, pipelineRunId: location.pipelineRunId,
            pipelineAttemptId: location.pipelineAttemptId, pipelineJobId: location.job?.id,
            pipelineStepId: location.step?.id, evidenceRunIds: sortUnique(evidenceIds),
            providerUrls: sortUnique(location.evidence.flatMap(item => item.url ? [item.url] : [])),
        },
    };
}

const DOMAIN_RULES: Array<{ domain: FailureDomain; pattern: RegExp }> = [
    { domain: 'INTEGRATION', pattern: /\b(integration|end[- ]to[- ]end|e2e|playwright|browser)\b/i },
    { domain: 'DEPLOYMENT', pattern: /\b(deploy|deployment|release|publish)\b/i },
    { domain: 'DEPENDENCY_INSTALL', pattern: /\b(install dependencies|dependency install|npm install|pnpm install|yarn install|pip install|bundle install)\b/i },
    { domain: 'STATIC_ANALYSIS', pattern: /\b(lint|typecheck|type check|static analysis|tsc)\b/i },
    { domain: 'BUILD', pattern: /\b(build|compile|bundle)\b/i },
    { domain: 'TEST', pattern: /\b(test|tests|spec|vitest|jest|pytest)\b/i },
    { domain: 'SETUP', pattern: /\b(checkout|setup|set up|initialize|bootstrap|configure)\b/i },
];

export function classifyProcessFailureDomain(
    names: readonly string[],
): { domain: FailureDomain; matchedName?: string } {
    for (const name of [...new Set(names)]) {
        const rule = DOMAIN_RULES.find(item => item.pattern.test(name));
        if (rule) return { domain: rule.domain, matchedName: name };
    }
    return { domain: 'UNKNOWN' };
}

function classifyFailure(location: FailureLocation): { domain: FailureDomain; matchedName?: string } {
    return classifyProcessFailureDomain([
        ...(location.step ? [location.step.name] : []),
        ...(location.job ? [location.job.name] : []),
        location.name,
    ]);
}

function failureDomainInsight(
    understanding: RepositoryUnderstanding,
    location: FailureLocation,
    localized: ProcessInsight,
): ProcessInsight {
    const classification = classifyFailure(location);
    const change = understanding.observations.change;
    return {
        kind: 'process-insight', id: `process-insight:failure-domain:${location.subjectId}`,
        insightKind: 'FAILURE_DOMAIN', repositoryId: change.repositoryId, revision: change.headRevision,
        derivation: 'HEURISTIC', confidence: classification.domain === 'UNKNOWN' ? 'UNKNOWN' : 'TENTATIVE',
        summary: classification.domain === 'UNKNOWN'
            ? `failure domain for ${location.name} is unknown`
            : `${location.name} is a candidate ${classification.domain.toLowerCase().replace('_', ' ')} failure`,
        supportingObservationIds: [...localized.supportingObservationIds], areaIds: [...localized.areaIds],
        boundaryIds: [...localized.boundaryIds], completeness: [...localized.completeness],
        detail: {
            insightKind: 'FAILURE_DOMAIN', localizedFailureId: localized.id,
            domain: classification.domain, matchedName: classification.matchedName,
        },
    };
}

function reproductionInsight(
    understanding: RepositoryUnderstanding,
    location: FailureLocation,
): ProcessInsight | undefined {
    const step = location.step;
    const job = location.job;
    if (!step || !job || step.execution?.kind !== 'COMMAND' || step.execution.semanticReach !== 'DIRECT') return undefined;
    const definition = location.pipelineDefinitionId
        ? understanding.observations.pipelineDefinitions.find(item => item.id === location.pipelineDefinitionId)
        : undefined;
    const declaredJob = definition?.jobs.find(item => item.id === job.logicalJobId);
    const command = step.execution.command;
    const declaredStep = declaredJob?.steps?.find(item => item.execution.kind === 'COMMAND'
        && item.execution.command === command && item.execution.semanticReach === 'DIRECT');
    if (!definition || !declaredStep) return undefined;
    const change = understanding.observations.change;
    return {
        kind: 'process-insight', id: `process-insight:reproduction-candidate:${step.id}`,
        insightKind: 'REPRODUCTION_CANDIDATE', repositoryId: change.repositoryId, revision: change.headRevision,
        derivation: 'DETERMINISTIC', confidence: 'SUPPORTED',
        summary: `checked-in command ${command} is a local reproduction candidate for failed step ${step.name}`,
        supportingObservationIds: sortUnique([definition.id, job.id, step.id]), areaIds: [], boundaryIds: [],
        completeness: [...understanding.observations.completeness],
        detail: {
            insightKind: 'REPRODUCTION_CANDIDATE', pipelineStepId: step.id, command,
            sourcePath: definition.path,
            caveat: 'Local tools, environment, services, credentials, and runner state may differ from CI.',
        },
    };
}

function blockedInsights(understanding: RepositoryUnderstanding, scope: CurrentScope): ProcessInsight[] {
    const change = understanding.observations.change;
    const jobs = new Map(scope.jobs.map(item => [item.id, item]));
    return stableSort(scope.jobs).flatMap(job => {
        if (!(job.lifecycle === 'NOT_OBSERVED' || job.lifecycle === 'EXPECTED'
            || job.lifecycle === 'CANCELLED' || job.outcome === 'SKIPPED')) return [];
        const blockers = sortUnique(job.blockedByPipelineJobIds ?? [])
            .map(id => jobs.get(id))
            .filter((item): item is PipelineJobObservation => item !== undefined && terminal(item.lifecycle)
                && (item.outcome === 'FAILED' || item.outcome === 'SKIPPED' || item.lifecycle === 'CANCELLED'))
            .map(item => ({ pipelineJobId: item.id, name: item.name, lifecycle: item.lifecycle, outcome: item.outcome }));
        if (blockers.length === 0) return [];
        return [{
            kind: 'process-insight' as const, id: `process-insight:blocked-downstream:${job.id}`,
            insightKind: 'BLOCKED_DOWNSTREAM' as const, repositoryId: change.repositoryId, revision: change.headRevision,
            derivation: 'DETERMINISTIC' as const, confidence: 'SUPPORTED' as const,
            summary: `${job.name} did not execute because ${blockers.map(item => item.name).join(', ')} finished ${blockers.map(item => item.outcome.toLowerCase()).join(', ')}`,
            supportingObservationIds: sortUnique([job.id, ...blockers.map(item => item.pipelineJobId)]),
            areaIds: [], boundaryIds: [], completeness: [...understanding.observations.completeness],
            detail: { insightKind: 'BLOCKED_DOWNSTREAM' as const, pipelineJobId: job.id, blockers },
        }];
    });
}

function matrixAndFlakeInsights(
    understanding: RepositoryUnderstanding,
    scope: CurrentScope,
    limits: ProcessInsightLimits,
    truncation: ProcessInsightTruncation[],
): ProcessInsight[] {
    const change = understanding.observations.change;
    const groups = new Map<string, PipelineJobObservation[]>();
    for (const job of scope.jobs) {
        const runId = runIdForJob(scope, job);
        if (!runId || !job.logicalJobId) continue;
        const key = `${runId}\u0000${job.logicalJobId}`;
        groups.set(key, [...(groups.get(key) ?? []), job]);
    }
    const insights: ProcessInsight[] = [];
    for (const [key, jobs] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const separator = key.indexOf('\u0000');
        const pipelineRunId = key.slice(0, separator);
        const logicalJobId = key.slice(separator + 1);
        const matrixJobs = jobs.filter(item => item.matrix && Object.keys(item.matrix).length > 0)
            .sort((a, b) => `${canonicalJson(a.matrix)}:${a.id}`.localeCompare(`${canonicalJson(b.matrix)}:${b.id}`));
        if (matrixJobs.length > 0) {
            const retained = matrixJobs.slice(0, Math.max(0, limits.maxMatrixExecutions));
            if (retained.length < matrixJobs.length) truncation.push({
                collection: `insights.matrix.${pipelineRunId}.${logicalJobId}.executions`,
                observedCount: matrixJobs.length, retainedCount: retained.length,
            });
            insights.push({
                kind: 'process-insight', id: `process-insight:matrix-result:${pipelineRunId}:${logicalJobId}`,
                insightKind: 'MATRIX_RESULT', repositoryId: change.repositoryId, revision: change.headRevision,
                derivation: 'DETERMINISTIC', confidence: 'SUPPORTED',
                summary: `${logicalJobId} preserves ${String(retained.length)} matrix-specific result(s)`,
                supportingObservationIds: retained.map(item => item.id), areaIds: [], boundaryIds: [],
                completeness: [...understanding.observations.completeness],
                detail: {
                    insightKind: 'MATRIX_RESULT', pipelineRunId, logicalJobId,
                    executions: retained.map(item => ({
                        pipelineJobId: item.id, pipelineAttemptId: item.pipelineAttemptId,
                        matrix: { ...(item.matrix ?? {}) }, lifecycle: item.lifecycle, outcome: item.outcome,
                    })),
                },
            });
        }
        const flakeGroups = new Map<string, PipelineJobObservation[]>();
        for (const job of jobs) {
            const dimension = canonicalJson(job.matrix ?? {});
            flakeGroups.set(dimension, [...(flakeGroups.get(dimension) ?? []), job]);
        }
        for (const dimensionJobs of flakeGroups.values()) {
            const ordered = dimensionJobs.map(job => ({ job, attempt: attemptForJob(scope, job)?.attempt }))
                .filter((item): item is { job: PipelineJobObservation; attempt: number } => item.attempt !== undefined)
                .sort((a, b) => a.attempt - b.attempt || a.job.id.localeCompare(b.job.id));
            const failure = ordered.find(item => failed(item.job));
            const recovery = failure ? ordered.find(item => item.attempt > failure.attempt && passed(item.job)) : undefined;
            if (failure && recovery) insights.push({
                kind: 'process-insight', id: `process-insight:flake-candidate:${failure.job.id}:${recovery.job.id}`,
                insightKind: 'FLAKE_CANDIDATE', repositoryId: change.repositoryId, revision: change.headRevision,
                derivation: 'DETERMINISTIC', confidence: 'TENTATIVE',
                summary: `${logicalJobId} failed on attempt ${String(failure.attempt)} and passed on attempt ${String(recovery.attempt)} at the same revision and matrix coordinates; this is a flake candidate, not proof`,
                supportingObservationIds: [failure.job.id, recovery.job.id], areaIds: [], boundaryIds: [],
                completeness: [...understanding.observations.completeness],
                detail: {
                    insightKind: 'FLAKE_CANDIDATE', pipelineRunId, logicalJobId,
                    failedPipelineJobId: failure.job.id, failedAttempt: failure.attempt,
                    passedPipelineJobId: recovery.job.id, passedAttempt: recovery.attempt,
                },
            });
        }
    }
    return insights;
}

function missingExpectedInsights(understanding: RepositoryUnderstanding, scope: CurrentScope): ProcessInsight[] {
    if (!evidenceAcquisitionIsComplete(understanding)) return [];
    const change = understanding.observations.change;
    return stableSort(understanding.evidenceExpectations).flatMap(expectation => {
        const claim = supportedExpectationClaim(expectation);
        if (!claim || scope.evidence.some(run => expectationMatchesEvidence(expectation, run, understanding))) return [];
        const targets = targetIds(expectation.target);
        return [{
            kind: 'process-insight' as const, id: `process-insight:missing-expected:${expectation.id}`,
            insightKind: 'MISSING_EXPECTED' as const, repositoryId: change.repositoryId, revision: change.headRevision,
            derivation: 'DETERMINISTIC' as const, confidence: 'SUPPORTED' as const,
            summary: `supported expected verification ${expectation.name} was not observed for head revision ${change.headRevision}`,
            supportingObservationIds: sortUnique([expectation.id, ...supportIds(claim)]),
            areaIds: targets.areaIds, boundaryIds: targets.boundaryIds,
            completeness: [...understanding.observations.completeness],
            detail: {
                insightKind: 'MISSING_EXPECTED' as const, expectationId: expectation.id,
                expectationName: expectation.name, ...(expectation.match ? { selector: { ...expectation.match } } : {}),
            },
        }];
    });
}

function pathContains(root: string, path: string): boolean {
    const normalized = root.replace(/\/+$/, '');
    return path === normalized || path.startsWith(`${normalized}/`);
}

function verificationGapInsights(understanding: RepositoryUnderstanding, scope: CurrentScope): ProcessInsight[] {
    if (!evidenceAcquisitionIsComplete(understanding)) return [];
    const change = understanding.observations.change;
    const changedIds = new Set(change.artifacts.map(item => item.artifactId));
    const changed = understanding.observations.artifacts.filter(item => changedIds.has(item.id));
    const areas = new Map<string, Set<string>>();
    for (const membership of understanding.memberships) {
        if (!supportedClaim(membership.support)) continue;
        const target = membership.target;
        const matched = target.kind === 'ARTIFACT'
            ? changed.filter(item => item.id === target.artifactId)
            : changed.filter(item => pathContains(target.path, item.path));
        if (matched.length === 0) continue;
        const ids = areas.get(membership.areaId) ?? new Set<string>();
        matched.forEach(item => ids.add(item.id));
        areas.set(membership.areaId, ids);
    }
    const boundaries = new Map<string, Set<string>>();
    for (const boundary of understanding.boundaries) {
        if (!supportedClaim(boundary.support)) continue;
        const ids = new Set(boundary.artifactIds.filter(id => changedIds.has(id)));
        for (const areaId of boundary.connectedAreaIds) for (const id of areas.get(areaId) ?? []) ids.add(id);
        if (ids.size > 0) boundaries.set(boundary.id, ids);
    }
    const coveredAreas = new Set<string>();
    const coveredBoundaries = new Set<string>();
    const currentEvidenceIds = new Set(scope.evidence.map(item => item.id));
    for (const attribution of understanding.evidenceAttributions) {
        if (!currentEvidenceIds.has(attribution.evidenceRunId) || !supportedClaim(attribution.support)) continue;
        if (attribution.target.kind === 'AREA') coveredAreas.add(attribution.target.areaId);
        if (attribution.target.kind === 'BOUNDARY') coveredBoundaries.add(attribution.target.boundaryId);
        if (attribution.target.kind === 'ARTIFACT') {
            for (const membership of understanding.memberships) {
                if (membership.target.kind === 'ARTIFACT' && membership.target.artifactId === attribution.target.artifactId) {
                    coveredAreas.add(membership.areaId);
                }
            }
            for (const boundary of understanding.boundaries) {
                if (boundary.artifactIds.includes(attribution.target.artifactId)) coveredBoundaries.add(boundary.id);
            }
        }
    }
    const insights: ProcessInsight[] = [];
    for (const [areaId, artifacts] of [...areas.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        if (coveredAreas.has(areaId)) continue;
        const area = understanding.areas.find(item => item.id === areaId);
        if (!area) continue;
        insights.push({
            kind: 'process-insight', id: `process-insight:verification-gap:area:${areaId}`,
            insightKind: 'VERIFICATION_GAP', repositoryId: change.repositoryId, revision: change.headRevision,
            derivation: 'DETERMINISTIC', confidence: 'SUPPORTED',
            summary: `changed area ${area.label} has no supported attributed verification; this is a gap, not a failure`,
            supportingObservationIds: sortUnique([...artifacts]), areaIds: [areaId], boundaryIds: [],
            completeness: [...understanding.observations.completeness],
            detail: { insightKind: 'VERIFICATION_GAP', target: { kind: 'AREA', id: areaId, label: area.label }, changedArtifactIds: sortUnique([...artifacts]) },
        });
    }
    for (const [boundaryId, artifacts] of [...boundaries.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        if (coveredBoundaries.has(boundaryId)) continue;
        const boundary = understanding.boundaries.find(item => item.id === boundaryId);
        if (!boundary) continue;
        insights.push({
            kind: 'process-insight', id: `process-insight:verification-gap:boundary:${boundaryId}`,
            insightKind: 'VERIFICATION_GAP', repositoryId: change.repositoryId, revision: change.headRevision,
            derivation: 'DETERMINISTIC', confidence: 'SUPPORTED',
            summary: `changed boundary ${boundary.label} has no supported attributed verification; this is a gap, not a failure`,
            supportingObservationIds: sortUnique([...artifacts]), areaIds: [], boundaryIds: [boundaryId],
            completeness: [...understanding.observations.completeness],
            detail: { insightKind: 'VERIFICATION_GAP', target: { kind: 'BOUNDARY', id: boundaryId, label: boundary.label }, changedArtifactIds: sortUnique([...artifacts]) },
        });
    }
    return insights;
}

function boundInsight(
    insight: ProcessInsight,
    limits: ProcessInsightLimits,
    truncation: ProcessInsightTruncation[],
): ProcessInsight {
    const bound = <T>(collection: string, values: T[], max: number): T[] => {
        const retained = values.slice(0, Math.max(0, max));
        if (retained.length < values.length) truncation.push({
            collection: `insights.${insight.id}.${collection}`,
            observedCount: values.length, retainedCount: retained.length,
        });
        return retained;
    };
    let detail: ProcessInsightDetail = insight.detail;
    switch (insight.detail.insightKind) {
        case 'NORMAL_LIFECYCLE':
            detail = { ...insight.detail, pipelineRunIds: bound('detail.pipelineRunIds', sortUnique(insight.detail.pipelineRunIds), limits.maxDetailItems) };
            break;
        case 'FAILURE_LOCALIZED':
            detail = {
                ...insight.detail,
                evidenceRunIds: bound('detail.evidenceRunIds', sortUnique(insight.detail.evidenceRunIds), limits.maxDetailItems),
                providerUrls: bound('detail.providerUrls', sortUnique(insight.detail.providerUrls), limits.maxDetailItems),
            };
            break;
        case 'BLOCKED_DOWNSTREAM':
            detail = { ...insight.detail, blockers: bound('detail.blockers', insight.detail.blockers, limits.maxDetailItems) };
            break;
        case 'MATRIX_RESULT':
            detail = { ...insight.detail, executions: bound('detail.executions', insight.detail.executions, limits.maxDetailItems) };
            break;
        case 'VERIFICATION_GAP':
            detail = {
                ...insight.detail,
                changedArtifactIds: bound('detail.changedArtifactIds', sortUnique(insight.detail.changedArtifactIds), limits.maxDetailItems),
            };
            break;
        default:
            break;
    }
    return {
        ...insight,
        supportingObservationIds: bound('supportingObservationIds', sortUnique(insight.supportingObservationIds), limits.maxSupportingObservationIds),
        areaIds: bound('areaIds', sortUnique(insight.areaIds), limits.maxAreaIds),
        boundaryIds: bound('boundaryIds', sortUnique(insight.boundaryIds), limits.maxBoundaryIds),
        completeness: bound(
            'completeness',
            [...insight.completeness].sort((a, b) => `${a.source}:${a.state}`.localeCompare(`${b.source}:${b.state}`)),
            limits.maxCompletenessDimensions,
        ),
        detail,
    };
}

function projection(
    understanding: RepositoryUnderstanding,
    normalizationIssueCount: number,
    unbounded: ProcessInsight[],
    limits: ProcessInsightLimits,
    truncation: ProcessInsightTruncation[],
): ProcessInsightSet {
    const ordered = unbounded.sort((a, b) => a.id.localeCompare(b.id));
    const retained = ordered.slice(0, Math.max(0, limits.maxInsights));
    if (retained.length < ordered.length) truncation.push({
        collection: 'insights', observedCount: ordered.length, retainedCount: retained.length,
    });
    const insights = retained.map(item => boundInsight(item, limits, truncation));
    const change = understanding.observations.change;
    return {
        schemaVersion: 'process-insights/v1', repositoryId: change.repositoryId, revision: change.headRevision,
        insights,
        completeness: {
            state: truncation.length === 0 && normalizationIssueCount === 0 ? 'COMPLETE' : 'PARTIAL',
            normalizationIssueCount,
        },
        truncation: truncation.sort((a, b) => a.collection.localeCompare(b.collection)),
    };
}

/** Derives CI-701 through CI-709. CI-710 remains blocked on deployment observations. */
export function deriveProcessInsights(
    input: RepositoryUnderstanding,
    partialLimits: Partial<ProcessInsightLimits> = {},
): ProcessInsightSet {
    const normalized = normalizeRepositoryUnderstanding(input);
    const understanding = normalized.understanding;
    const limits = { ...DEFAULT_PROCESS_INSIGHT_LIMITS, ...partialLimits };
    const truncation: ProcessInsightTruncation[] = [];
    const scope = currentScope(understanding);
    const insights: ProcessInsight[] = [];
    const lifecycle = lifecycleInsight(understanding, scope);
    if (lifecycle) insights.push(lifecycle);
    for (const location of failureLocations(understanding, scope)) {
        const localized = localizedFailureInsight(understanding, location);
        insights.push(localized, failureDomainInsight(understanding, location, localized));
        const reproduction = reproductionInsight(understanding, location);
        if (reproduction) insights.push(reproduction);
    }
    insights.push(
        ...blockedInsights(understanding, scope),
        ...matrixAndFlakeInsights(understanding, scope, limits, truncation),
        ...missingExpectedInsights(understanding, scope),
        ...verificationGapInsights(understanding, scope),
    );
    return projection(understanding, normalized.issues.length, insights, limits, truncation);
}

export interface RecoveryInsightInput {
    repositoryId: string;
    revision: string;
    previousAt: string;
    currentAt: string;
}

function jobsByLogicalIdentity(understanding: RepositoryUnderstanding) {
    const scope = currentScope(understanding);
    return scope.jobs.flatMap(job => {
        const runId = runIdForJob(scope, job);
        const attempt = attemptForJob(scope, job);
        return runId && job.logicalJobId && attempt
            ? [{
                key: `${runId}\u0000${job.logicalJobId}\u0000${canonicalJson(job.matrix ?? {})}`,
                pipelineRunId: runId,
                logicalJobId: job.logicalJobId,
                job,
                attempt: attempt.attempt,
            }]
            : [];
    });
}

/** Derives CI-711 by comparing two G6 point-in-time reconstructions. */
export function deriveRecoveryProcessInsights(
    records: readonly ProcessObservationRecord[],
    input: RecoveryInsightInput,
    partialLimits: Partial<ProcessInsightLimits> = {},
): ProcessInsightSet {
    const previous = reconstructProcessState(records, {
        repositoryId: input.repositoryId, revision: input.revision, at: input.previousAt,
    });
    const current = reconstructProcessState(records, {
        repositoryId: input.repositoryId, revision: input.revision, at: input.currentAt,
    });
    const fallback = records.find(record =>
        record.repositoryId === input.repositoryId && record.revision === input.revision)?.understanding;
    const understanding = current.understanding ?? previous.understanding ?? fallback;
    if (!understanding) return {
        schemaVersion: 'process-insights/v1', repositoryId: input.repositoryId, revision: input.revision,
        insights: [], completeness: { state: 'PARTIAL', normalizationIssueCount: 0 }, truncation: [],
    };
    const limits = { ...DEFAULT_PROCESS_INSIGHT_LIMITS, ...partialLimits };
    const truncation: ProcessInsightTruncation[] = [];
    const insights: ProcessInsight[] = [];
    if (previous.state === 'RECONSTRUCTED' && current.state === 'RECONSTRUCTED'
        && previous.understanding && current.understanding
        && previous.supplyingRecordId && current.supplyingRecordId) {
        const previousUnderstanding = previous.understanding;
        const currentUnderstanding = current.understanding;
        const previousJobs = jobsByLogicalIdentity(previousUnderstanding);
        const currentJobs = jobsByLogicalIdentity(currentUnderstanding);
        for (const earlier of previousJobs.filter(item => failed(item.job))) {
            const resolving = currentJobs
                .filter(item => item.key === earlier.key && item.attempt > earlier.attempt && passed(item.job))
                .sort((a, b) => a.attempt - b.attempt || a.job.id.localeCompare(b.job.id))[0];
            if (!resolving) continue;
            insights.push({
                kind: 'process-insight', id: `process-insight:recovery:job:${earlier.job.id}:${resolving.job.id}`,
                insightKind: 'RECOVERY', repositoryId: input.repositoryId, revision: input.revision,
                derivation: 'DETERMINISTIC', confidence: 'SUPPORTED',
                summary: `${earlier.logicalJobId} recovered from failed attempt ${String(earlier.attempt)} to passed attempt ${String(resolving.attempt)} at the same matrix coordinates`,
                supportingObservationIds: sortUnique([
                    previous.supplyingRecordId, current.supplyingRecordId, earlier.job.id, resolving.job.id,
                ]), areaIds: [], boundaryIds: [], completeness: [...currentUnderstanding.observations.completeness],
                detail: {
                    insightKind: 'RECOVERY', conditionKind: 'FAILED_JOB', previousAt: input.previousAt,
                    currentAt: input.currentAt, previousSupplyingRecordId: previous.supplyingRecordId,
                    currentSupplyingRecordId: current.supplyingRecordId, previousObservationId: earlier.job.id,
                    resolvingObservationId: resolving.job.id,
                },
            });
        }
        if (evidenceAcquisitionIsComplete(previousUnderstanding)
            && evidenceAcquisitionIsComplete(currentUnderstanding)) {
            const previousEvidence = currentEvidenceRuns(previousUnderstanding);
            const currentEvidence = currentEvidenceRuns(currentUnderstanding);
            for (const expectation of stableSort(previousUnderstanding.evidenceExpectations)) {
                const claim = supportedExpectationClaim(expectation);
                if (!claim || previousEvidence.some(run => expectationMatchesEvidence(expectation, run, previousUnderstanding))) continue;
                const currentExpectation = currentUnderstanding.evidenceExpectations.find(item => item.id === expectation.id);
                const resolving = currentExpectation
                    ? currentEvidence.find(run => expectationMatchesEvidence(currentExpectation, run, currentUnderstanding))
                    : undefined;
                if (!resolving || !currentExpectation || !supportedExpectationClaim(currentExpectation)) continue;
                const targets = targetIds(currentExpectation.target);
                insights.push({
                    kind: 'process-insight', id: `process-insight:recovery:expectation:${expectation.id}`,
                    insightKind: 'RECOVERY', repositoryId: input.repositoryId, revision: input.revision,
                    derivation: 'DETERMINISTIC', confidence: 'SUPPORTED',
                    summary: `previously missing expected verification ${expectation.name} was later observed`,
                    supportingObservationIds: sortUnique([
                        previous.supplyingRecordId, current.supplyingRecordId, expectation.id, resolving.id, ...supportIds(claim),
                    ]), areaIds: targets.areaIds, boundaryIds: targets.boundaryIds,
                    completeness: [...currentUnderstanding.observations.completeness],
                    detail: {
                        insightKind: 'RECOVERY', conditionKind: 'MISSING_EXPECTED', previousAt: input.previousAt,
                        currentAt: input.currentAt, previousSupplyingRecordId: previous.supplyingRecordId,
                        currentSupplyingRecordId: current.supplyingRecordId, previousObservationId: expectation.id,
                        resolvingObservationId: resolving.id,
                    },
                });
            }
        }
    }
    return projection(understanding, 0, insights, limits, truncation);
}
