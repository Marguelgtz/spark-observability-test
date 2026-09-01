import type {
    ClaimSupport,
    EvidenceExpectation,
    EvidenceRunObservation,
    RepositoryUnderstanding,
} from './understanding';

export interface EvidenceProcessIdentity {
    pipelineDefinitionId?: string;
    pipelineRunId?: string;
    pipelineAttemptId?: string;
    pipelineJobId?: string;
    pipelineStepId?: string;
    logicalJobId?: string;
}

export function currentEvidenceRuns(understanding: RepositoryUnderstanding): EvidenceRunObservation[] {
    const change = understanding.observations.change;
    return understanding.observations.evidenceRuns.filter(run =>
        run.repositoryId === change.repositoryId && run.revision === change.headRevision);
}

export function evidenceProcessIdentity(
    run: EvidenceRunObservation,
    understanding: RepositoryUnderstanding,
): EvidenceProcessIdentity {
    const step = run.pipelineStepId
        ? understanding.observations.pipelineSteps.find(item => item.id === run.pipelineStepId)
        : undefined;
    const pipelineJobId = run.pipelineJobId ?? step?.pipelineJobId;
    const job = pipelineJobId
        ? understanding.observations.pipelineJobs.find(item => item.id === pipelineJobId)
        : undefined;
    const pipelineAttemptId = run.pipelineAttemptId ?? job?.pipelineAttemptId;
    const attempt = pipelineAttemptId
        ? understanding.observations.pipelineAttempts.find(item => item.id === pipelineAttemptId)
        : undefined;
    const pipelineRunId = run.pipelineRunId ?? attempt?.pipelineRunId;
    const pipelineRun = pipelineRunId
        ? understanding.observations.pipelineRuns.find(item => item.id === pipelineRunId)
        : undefined;
    return {
        pipelineDefinitionId: pipelineRun?.pipelineDefinitionId,
        pipelineRunId,
        pipelineAttemptId,
        pipelineJobId,
        pipelineStepId: step?.id ?? run.pipelineStepId,
        logicalJobId: job?.logicalJobId,
    };
}

export function supportedExpectationClaim(expectation: EvidenceExpectation): ClaimSupport | undefined {
    return expectation.support.find(item => item.confidence === 'SUPPORTED'
        && item.completeness.state === 'COMPLETE'
        && (item.derivation === 'DECLARED' || item.derivation === 'DETERMINISTIC'));
}

export function expectationMatchesEvidence(
    expectation: EvidenceExpectation,
    run: EvidenceRunObservation,
    understanding: RepositoryUnderstanding,
): boolean {
    const selector = expectation.match;
    if ((selector?.evidenceName ?? expectation.name) !== run.name) return false;
    if (selector?.evidenceKind && selector.evidenceKind !== run.evidenceKind) return false;
    if (!selector?.pipelineDefinitionId && !selector?.logicalJobId) return true;
    const identity = evidenceProcessIdentity(run, understanding);
    return (!selector.pipelineDefinitionId || selector.pipelineDefinitionId === identity.pipelineDefinitionId)
        && (!selector.logicalJobId || selector.logicalJobId === identity.logicalJobId);
}

export function evidenceAcquisitionIsComplete(understanding: RepositoryUnderstanding): boolean {
    return understanding.observations.completeness
        .some(item => item.source === 'github-check-runs' && item.state === 'COMPLETE');
}
