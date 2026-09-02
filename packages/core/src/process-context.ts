import { evidenceAcquisitionIsComplete } from './evidence-matching';
import {
    deriveProcessInsights,
    type ProcessInsight,
    type ProcessInsightKind,
    type ProcessInsightSet,
} from './process-insight';
import type {
    ClaimConfidence,
    ClaimDerivation,
    RepositoryUnderstanding,
    SourceCompleteness,
} from './understanding';

export type ProcessInsightSubjectV0 =
    | { kind: 'CHANGE'; id: string }
    | { kind: 'PIPELINE_STEP'; id: string }
    | { kind: 'PIPELINE_JOB'; id: string }
    | { kind: 'EVIDENCE_RUN'; id: string }
    | { kind: 'LOGICAL_JOB'; id: string }
    | { kind: 'EVIDENCE_EXPECTATION'; id: string }
    | { kind: 'AREA'; id: string }
    | { kind: 'BOUNDARY'; id: string }
    | { kind: 'PROCESS_INSIGHT'; id: string }
    | { kind: 'OBSERVATION'; id: string };

export interface ProcessReproductionCandidateV0 {
    pipelineStepId: string;
    command: string;
    sourcePath: string;
    caveat: string;
}

export type ProcessInsightResolutionReason =
    | 'CONDITION_ABSENT_IN_COMPLETE_OBSERVATION'
    | 'REVISION_SUPERSEDED';

export interface ProcessInsightV0 {
    schemaVersion: 'process-insight/v0';
    /** Context-versioned envelope identity. */
    id: string;
    /** Stable G7 insight identity across context observations. */
    stableInsightId: string;
    insightKind: ProcessInsightKind;
    subject: ProcessInsightSubjectV0;
    repositoryId: string;
    revision: string;
    summary: string;
    derivation: ClaimDerivation;
    confidence: ClaimConfidence;
    supportingObservationIds: string[];
    areaIds: string[];
    boundaryIds: string[];
    completeness: SourceCompleteness[];
    reproductionCandidate?: ProcessReproductionCandidateV0;
    detail: ProcessInsight['detail'];
    state: 'ACTIVE' | 'RESOLVED';
    supersedes: string[];
    resolvedBy?: string;
    resolutionReason?: ProcessInsightResolutionReason;
    /** True when incomplete current acquisition cannot resolve an older condition. */
    carriedForward: boolean;
}

export interface ProcessContextLimits {
    maxActiveInsights: number;
    maxResolvedInsights: number;
    maxUsefulnessCases: number;
}

export const DEFAULT_PROCESS_CONTEXT_LIMITS: ProcessContextLimits = {
    maxActiveInsights: 200,
    maxResolvedInsights: 100,
    maxUsefulnessCases: 1_000,
};

export interface ProcessContextTruncation {
    collection: string;
    observedCount: number;
    retainedCount: number;
}

export interface ProcessContextV0 {
    schemaVersion: 'process-context/v0';
    id: string;
    repositoryId: string;
    revision: string;
    resolutionAuthority: 'COMPLETE' | 'PARTIAL';
    /** Recovery requires the separate two-reconstruction G7 derivation. */
    recoveryAssessment: 'NOT_PROVIDED' | 'COMPLETE' | 'PARTIAL';
    sourceInsightCount: number;
    insights: ProcessInsightV0[];
    completeness: 'COMPLETE' | 'PARTIAL';
    truncation: ProcessContextTruncation[];
    shadowOnly: true;
    prescriptive: false;
}

export interface DeriveProcessContextOptions {
    contextId: string;
    previous?: ProcessContextV0;
    recoveryInsights?: ProcessInsightSet;
    limits?: Partial<ProcessContextLimits>;
}

function subjectFor(insight: ProcessInsight): ProcessInsightSubjectV0 {
    switch (insight.detail.insightKind) {
        case 'NORMAL_LIFECYCLE':
            return { kind: 'CHANGE', id: insight.revision };
        case 'FAILURE_LOCALIZED':
            if (insight.detail.pipelineStepId) return { kind: 'PIPELINE_STEP', id: insight.detail.pipelineStepId };
            if (insight.detail.pipelineJobId) return { kind: 'PIPELINE_JOB', id: insight.detail.pipelineJobId };
            return { kind: 'EVIDENCE_RUN', id: insight.detail.evidenceRunIds[0] ?? insight.id };
        case 'FAILURE_DOMAIN':
            return { kind: 'PROCESS_INSIGHT', id: insight.detail.localizedFailureId };
        case 'REPRODUCTION_CANDIDATE':
            return { kind: 'PIPELINE_STEP', id: insight.detail.pipelineStepId };
        case 'BLOCKED_DOWNSTREAM':
            return { kind: 'PIPELINE_JOB', id: insight.detail.pipelineJobId };
        case 'MATRIX_RESULT':
            return { kind: 'LOGICAL_JOB', id: `${insight.detail.pipelineRunId}:${insight.detail.logicalJobId}` };
        case 'FLAKE_CANDIDATE':
            return { kind: 'LOGICAL_JOB', id: `${insight.detail.pipelineRunId}:${insight.detail.logicalJobId}` };
        case 'MISSING_EXPECTED':
            return { kind: 'EVIDENCE_EXPECTATION', id: insight.detail.expectationId };
        case 'VERIFICATION_GAP':
            return { kind: insight.detail.target.kind, id: insight.detail.target.id };
        case 'RECOVERY':
            return { kind: 'OBSERVATION', id: insight.detail.resolvingObservationId };
        case 'DEPLOYMENT_STATE':
            return { kind: 'OBSERVATION', id: insight.detail.deploymentId };
    }
}

function reproductionCandidates(insights: readonly ProcessInsight[]): Map<string, ProcessReproductionCandidateV0> {
    const candidates = new Map<string, ProcessReproductionCandidateV0>();
    for (const insight of insights) {
        if (insight.detail.insightKind !== 'REPRODUCTION_CANDIDATE') continue;
        candidates.set(insight.detail.pipelineStepId, {
            pipelineStepId: insight.detail.pipelineStepId,
            command: insight.detail.command,
            sourcePath: insight.detail.sourcePath,
            caveat: insight.detail.caveat,
        });
    }
    return candidates;
}

function candidateFor(
    insight: ProcessInsight,
    candidates: Map<string, ProcessReproductionCandidateV0>,
): ProcessReproductionCandidateV0 | undefined {
    if (insight.detail.insightKind === 'REPRODUCTION_CANDIDATE') {
        return candidates.get(insight.detail.pipelineStepId);
    }
    if (insight.detail.insightKind === 'FAILURE_LOCALIZED' && insight.detail.pipelineStepId) {
        return candidates.get(insight.detail.pipelineStepId);
    }
    return undefined;
}

function activeEnvelope(
    insight: ProcessInsight,
    contextId: string,
    previous: ProcessInsightV0 | undefined,
    candidates: Map<string, ProcessReproductionCandidateV0>,
): ProcessInsightV0 {
    return {
        schemaVersion: 'process-insight/v0',
        id: `${insight.id}:context:${contextId}`,
        stableInsightId: insight.id,
        insightKind: insight.insightKind,
        subject: subjectFor(insight),
        repositoryId: insight.repositoryId,
        revision: insight.revision,
        summary: insight.summary,
        derivation: insight.derivation,
        confidence: insight.confidence,
        supportingObservationIds: [...insight.supportingObservationIds],
        areaIds: [...insight.areaIds],
        boundaryIds: [...insight.boundaryIds],
        completeness: structuredClone(insight.completeness),
        reproductionCandidate: candidateFor(insight, candidates),
        detail: structuredClone(insight.detail),
        state: 'ACTIVE',
        supersedes: previous ? [previous.id] : [],
        carriedForward: false,
    };
}

function carriedEnvelope(previous: ProcessInsightV0, contextId: string): ProcessInsightV0 {
    return {
        ...structuredClone(previous),
        id: `${previous.stableInsightId}:context:${contextId}`,
        state: 'ACTIVE',
        supersedes: [previous.id],
        resolvedBy: undefined,
        resolutionReason: undefined,
        carriedForward: true,
    };
}

function resolvedEnvelope(
    previous: ProcessInsightV0,
    contextId: string,
    reason: ProcessInsightResolutionReason,
): ProcessInsightV0 {
    return {
        ...structuredClone(previous),
        id: `${previous.stableInsightId}:resolved:${contextId}`,
        state: 'RESOLVED',
        supersedes: [previous.id],
        resolvedBy: `process-context:${contextId}`,
        resolutionReason: reason,
        carriedForward: false,
    };
}

function materializeContext(
    set: ProcessInsightSet,
    resolutionAuthority: ProcessContextV0['resolutionAuthority'],
    recoveryAssessment: ProcessContextV0['recoveryAssessment'],
    options: DeriveProcessContextOptions,
): ProcessContextV0 {
    const limits = { ...DEFAULT_PROCESS_CONTEXT_LIMITS, ...(options.limits ?? {}) };
    const previousItems = options.previous?.insights ?? [];
    const previousActive = new Map(previousItems.filter(item => item.state === 'ACTIVE')
        .map(item => [item.stableInsightId, item]));
    const candidates = reproductionCandidates(set.insights);
    const currentStableIds = new Set(set.insights.map(item => item.id));
    const active = set.insights.map(insight =>
        activeEnvelope(insight, options.contextId, previousActive.get(insight.id), candidates));
    for (const prior of previousActive.values()) {
        if (currentStableIds.has(prior.stableInsightId)) continue;
        if (prior.revision !== set.revision) {
            active.push(resolvedEnvelope(prior, options.contextId, 'REVISION_SUPERSEDED'));
        } else if (resolutionAuthority === 'COMPLETE'
            && (prior.insightKind !== 'RECOVERY' || recoveryAssessment === 'COMPLETE')) {
            active.push(resolvedEnvelope(prior, options.contextId, 'CONDITION_ABSENT_IN_COMPLETE_OBSERVATION'));
        } else {
            active.push(carriedEnvelope(prior, options.contextId));
        }
    }
    const priorResolved = previousItems.filter(item => item.state === 'RESOLVED');
    const activeItems = active.filter(item => item.state === 'ACTIVE').sort((a, b) => a.id.localeCompare(b.id));
    const resolvedItems = [...active.filter(item => item.state === 'RESOLVED'), ...priorResolved]
        .sort((a, b) => a.id.localeCompare(b.id));
    const retainedActive = activeItems.slice(0, Math.max(0, limits.maxActiveInsights));
    const retainedResolved = resolvedItems.slice(Math.max(0, resolvedItems.length - Math.max(0, limits.maxResolvedInsights)));
    const truncation: ProcessContextTruncation[] = [];
    if (retainedActive.length < activeItems.length) truncation.push({
        collection: 'activeInsights', observedCount: activeItems.length, retainedCount: retainedActive.length,
    });
    if (retainedResolved.length < resolvedItems.length) truncation.push({
        collection: 'resolvedInsights', observedCount: resolvedItems.length, retainedCount: retainedResolved.length,
    });
    return {
        schemaVersion: 'process-context/v0',
        id: `process-context:${options.contextId}`,
        repositoryId: set.repositoryId,
        revision: set.revision,
        resolutionAuthority,
        recoveryAssessment,
        sourceInsightCount: set.insights.length,
        insights: [...retainedActive, ...retainedResolved],
        completeness: set.completeness.state === 'COMPLETE'
            && resolutionAuthority === 'COMPLETE'
            && recoveryAssessment === 'COMPLETE'
            && truncation.length === 0 ? 'COMPLETE' : 'PARTIAL',
        truncation,
        shadowOnly: true,
        prescriptive: false,
    };
}

/** CI-901/CI-904 — formal insight shape plus conservative lifecycle resolution. */
export function deriveProcessContextV0(
    understanding: RepositoryUnderstanding,
    options: DeriveProcessContextOptions,
): ProcessContextV0 {
    const currentSet = deriveProcessInsights(understanding);
    const suppliedRecovery = options.recoveryInsights;
    const recoveryMatchesContext = suppliedRecovery?.repositoryId === currentSet.repositoryId
        && suppliedRecovery.revision === currentSet.revision;
    const recoveryAssessment: ProcessContextV0['recoveryAssessment'] = !suppliedRecovery
        ? 'NOT_PROVIDED'
        : recoveryMatchesContext && suppliedRecovery.completeness.state === 'COMPLETE' ? 'COMPLETE' : 'PARTIAL';
    const recoveryInsights = recoveryMatchesContext ? suppliedRecovery.insights.filter(item => item.insightKind === 'RECOVERY') : [];
    const byStableId = new Map([...currentSet.insights, ...recoveryInsights].map(item => [item.id, item]));
    const set: ProcessInsightSet = {
        ...currentSet,
        insights: [...byStableId.values()].sort((a, b) => a.id.localeCompare(b.id)),
        completeness: {
            ...currentSet.completeness,
            state: currentSet.completeness.state === 'COMPLETE' && recoveryAssessment !== 'PARTIAL'
                ? 'COMPLETE' : 'PARTIAL',
        },
    };
    const resolutionAuthority = currentSet.completeness.state === 'COMPLETE'
        && evidenceAcquisitionIsComplete(understanding) ? 'COMPLETE' : 'PARTIAL';
    return materializeContext(set, resolutionAuthority, recoveryAssessment, options);
}

export interface SteeringStateV0 {
    schemaVersion: 'steering-state/v0';
    id: string;
    repositoryId: string;
    revision: string;
    inputs: {
        ciCdProcess: ProcessContextV0;
    };
    inputKinds: ['CI_CD_PROCESS_CONTEXT'];
    completeness: 'COMPLETE' | 'PARTIAL';
    shadowOnly: true;
    prescriptive: false;
    automaticSteering: false;
}

/** CI-902 — CI/CD context is one neutral input; this creates no decision or action. */
export function buildSteeringStateV0(context: ProcessContextV0): SteeringStateV0 {
    return {
        schemaVersion: 'steering-state/v0',
        id: `steering-state:${context.id}`,
        repositoryId: context.repositoryId,
        revision: context.revision,
        inputs: { ciCdProcess: structuredClone(context) },
        inputKinds: ['CI_CD_PROCESS_CONTEXT'],
        completeness: context.completeness,
        shadowOnly: true,
        prescriptive: false,
        automaticSteering: false,
    };
}

export type ProcessUsefulnessQuestion =
    | 'RUNNING'
    | 'FAILED'
    | 'FAILURE_LOCATION'
    | 'NEVER_RAN'
    | 'MISSING_VERIFICATION'
    | 'RECOVERED';

export interface ProcessUsefulnessCase {
    id: string;
    contextId: string;
    question: ProcessUsefulnessQuestion;
    status: 'ANSWERED' | 'UNKNOWN';
    answer: string;
    confidence: ClaimConfidence;
    supportingInsightIds: string[];
}

export interface ProcessUsefulnessStudy {
    schemaVersion: 'process-usefulness-study/v0';
    contextCount: number;
    caseDenominator: number;
    answeredCount: number;
    supportedAnswerCount: number;
    tentativeAnswerCount: number;
    unknownCount: number;
    cases: ProcessUsefulnessCase[];
    truncated: boolean;
}

const USEFULNESS_KINDS: Record<ProcessUsefulnessQuestion, ProcessInsightKind[]> = {
    RUNNING: ['NORMAL_LIFECYCLE'],
    FAILED: ['FAILURE_LOCALIZED'],
    FAILURE_LOCATION: ['FAILURE_LOCALIZED'],
    NEVER_RAN: ['BLOCKED_DOWNSTREAM', 'MISSING_EXPECTED'],
    MISSING_VERIFICATION: ['MISSING_EXPECTED', 'VERIFICATION_GAP'],
    RECOVERED: ['RECOVERY'],
};

function usefulnessCase(context: ProcessContextV0, question: ProcessUsefulnessQuestion): ProcessUsefulnessCase {
    const matches = context.insights.filter(item => item.state === 'ACTIVE'
        && USEFULNESS_KINDS[question].includes(item.insightKind));
    const unknown = matches.some(item => item.confidence === 'UNKNOWN');
    const confidence: ClaimConfidence = unknown
        ? 'UNKNOWN'
        : matches.some(item => item.confidence === 'TENTATIVE') ? 'TENTATIVE' : 'SUPPORTED';
    const assessmentComplete = question === 'RECOVERED'
        ? context.recoveryAssessment === 'COMPLETE'
        : context.resolutionAuthority === 'COMPLETE';
    const status = unknown || (matches.length === 0 && !assessmentComplete)
        ? 'UNKNOWN' as const : 'ANSWERED' as const;
    const answer = matches.length > 0
        ? matches.map(item => item.summary).sort().join('; ')
        : status === 'ANSWERED'
            ? `No ${question.toLowerCase().replace('_', ' ')} condition was observed in the complete CI/CD context.`
            : `The ${question.toLowerCase().replace('_', ' ')} question cannot be answered from partial CI/CD context.`;
    return {
        id: `process-usefulness:${context.id}:${question}`,
        contextId: context.id,
        question,
        status,
        answer,
        confidence: status === 'UNKNOWN' ? 'UNKNOWN' : confidence,
        supportingInsightIds: matches.map(item => item.id).sort(),
    };
}

/** CI-903 — denominator-bearing shadow answerability across six grounded questions. */
export function evaluateProcessContextUsefulness(
    contexts: readonly ProcessContextV0[],
    partialLimits: Partial<ProcessContextLimits> = {},
): ProcessUsefulnessStudy {
    const limits = { ...DEFAULT_PROCESS_CONTEXT_LIMITS, ...partialLimits };
    const questions = Object.keys(USEFULNESS_KINDS) as ProcessUsefulnessQuestion[];
    const allCases = [...contexts]
        .sort((a, b) => a.id.localeCompare(b.id))
        .flatMap(context => questions.map(question => usefulnessCase(context, question)));
    const cases = allCases.slice(0, Math.max(0, limits.maxUsefulnessCases));
    return {
        schemaVersion: 'process-usefulness-study/v0',
        contextCount: contexts.length,
        caseDenominator: allCases.length,
        answeredCount: allCases.filter(item => item.status === 'ANSWERED').length,
        supportedAnswerCount: allCases.filter(item => item.status === 'ANSWERED' && item.confidence === 'SUPPORTED').length,
        tentativeAnswerCount: allCases.filter(item => item.status === 'ANSWERED' && item.confidence === 'TENTATIVE').length,
        unknownCount: allCases.filter(item => item.status === 'UNKNOWN').length,
        cases,
        truncated: cases.length < allCases.length,
    };
}
