import {
    currentEvidenceRuns,
    evidenceAcquisitionIsComplete,
    evidenceProcessIdentity,
    expectationMatchesEvidence,
    supportedExpectationClaim,
} from './evidence-matching';
import { normalizeRepositoryUnderstanding, type UnderstandingNormalizationIssue } from './understanding-normalize';
import type {
    ClaimSupport,
    CompletenessState,
    EvidenceRunObservation,
    ProcessLifecycle,
    ProcessOutcome,
    RepositoryUnderstanding,
    SourceCompleteness,
    UnderstandingTarget,
} from './understanding';

export interface VerificationGraphLimits {
    maxNodes: number;
    maxEdges: number;
    maxInspectionItemsPerCollection: number;
    maxSupportsPerClaim: number;
    maxEvidenceReferencesPerSupport: number;
}

export const DEFAULT_VERIFICATION_GRAPH_LIMITS: VerificationGraphLimits = {
    maxNodes: 500,
    maxEdges: 1_000,
    maxInspectionItemsPerCollection: 200,
    maxSupportsPerClaim: 20,
    maxEvidenceReferencesPerSupport: 20,
};

export type VerificationGraphNodeKind =
    | 'CHANGE'
    | 'ARTIFACT'
    | 'AREA'
    | 'RELATIONSHIP'
    | 'BOUNDARY'
    | 'EXPECTATION'
    | 'PIPELINE_DEFINITION'
    | 'PIPELINE_RUN'
    | 'PIPELINE_ATTEMPT'
    | 'PIPELINE_JOB'
    | 'PIPELINE_STEP'
    | 'RESULT';

export type VerificationGraphEdgeKind =
    | 'CHANGE_CONTAINS_ARTIFACT'
    | 'CHANGE_TOUCHES_AREA'
    | 'CHANGE_TOUCHES_BOUNDARY'
    | 'AREA_RELATIONSHIP_SOURCE'
    | 'AREA_RELATIONSHIP_TARGET'
    | 'TARGET_EXPECTS_EVIDENCE'
    | 'EXPECTATION_DECLARED_BY'
    | 'EXPECTATION_OBSERVED_BY'
    | 'EXPECTATION_RESULT'
    | 'PIPELINE_DEFINITION_RUN'
    | 'PIPELINE_RUN_ATTEMPT'
    | 'PIPELINE_ATTEMPT_JOB'
    | 'PIPELINE_JOB_STEP'
    | 'PROCESS_RESULT'
    | 'ATTRIBUTED_RESULT';

export type VerificationExpectationState = 'OBSERVED' | 'NOT_OBSERVED' | 'UNKNOWN';

export interface VerificationGraphNode {
    id: string;
    kind: VerificationGraphNodeKind;
    canonicalId: string;
    label: string;
    lifecycle?: ProcessLifecycle;
    outcome?: ProcessOutcome;
    expectationState?: VerificationExpectationState;
    sourceKind?: 'PROCESS' | 'EVIDENCE' | 'EXPECTATION';
}

export interface VerificationGraphEdge {
    id: string;
    kind: VerificationGraphEdgeKind;
    from: string;
    to: string;
    claimId?: string;
}

export interface VerificationGraphTruncation {
    collection: string;
    observedCount: number;
    retainedCount: number;
}

export interface VerificationGraph {
    schemaVersion: 'verification-graph/v1';
    repositoryId: string;
    revision: string;
    changeId: string;
    nodes: VerificationGraphNode[];
    edges: VerificationGraphEdge[];
    completeness: SourceCompleteness;
    truncation: VerificationGraphTruncation[];
    normalizationIssues: UnderstandingNormalizationIssue[];
}

export interface VerificationInspectionObservation {
    id: string;
    kind: string;
    label?: string;
    revision?: string;
    parentId?: string;
    lifecycle?: ProcessLifecycle;
    outcome?: ProcessOutcome;
    source?: { kind: string; id?: string };
    details?: Record<string, unknown>;
}

export interface VerificationInspectionClaim {
    id: string;
    kind: string;
    target?: UnderstandingTarget;
    evidenceRunId?: string;
    match?: Record<string, unknown>;
    details?: Record<string, unknown>;
    support: ClaimSupport[];
}

export interface VerificationGraphInspection {
    schemaVersion: 'verification-graph-inspection/v1';
    graph: VerificationGraph;
    observations: Record<string, VerificationInspectionObservation[]>;
    claims: Record<string, VerificationInspectionClaim[]>;
    sourceCompleteness: SourceCompleteness[];
    claimCompleteness: Array<{ id: string; dimension: string; state: CompletenessState; reason?: string }>;
    truncation: VerificationGraphTruncation[];
}

function positiveInteger(value: number | undefined, fallback: number): number {
    return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

function graphLimits(overrides?: Partial<VerificationGraphLimits>): VerificationGraphLimits {
    return {
        maxNodes: positiveInteger(overrides?.maxNodes, DEFAULT_VERIFICATION_GRAPH_LIMITS.maxNodes),
        maxEdges: positiveInteger(overrides?.maxEdges, DEFAULT_VERIFICATION_GRAPH_LIMITS.maxEdges),
        maxInspectionItemsPerCollection: positiveInteger(
            overrides?.maxInspectionItemsPerCollection,
            DEFAULT_VERIFICATION_GRAPH_LIMITS.maxInspectionItemsPerCollection,
        ),
        maxSupportsPerClaim: positiveInteger(
            overrides?.maxSupportsPerClaim,
            DEFAULT_VERIFICATION_GRAPH_LIMITS.maxSupportsPerClaim,
        ),
        maxEvidenceReferencesPerSupport: positiveInteger(
            overrides?.maxEvidenceReferencesPerSupport,
            DEFAULT_VERIFICATION_GRAPH_LIMITS.maxEvidenceReferencesPerSupport,
        ),
    };
}

function nodeId(kind: VerificationGraphNodeKind, canonicalId: string): string {
    return `verification-node:${kind.toLowerCase()}:${canonicalId}`;
}

function edgeId(kind: VerificationGraphEdgeKind, from: string, to: string, claimId?: string): string {
    return `verification-edge:${kind.toLowerCase()}:${from}:${to}${claimId ? `:${claimId}` : ''}`;
}

function pathMatches(path: string, prefix: string): boolean {
    return prefix === '' || path === prefix || path.startsWith(`${prefix}/`);
}

function targetNode(
    target: UnderstandingTarget,
    understanding: RepositoryUnderstanding,
): VerificationGraphNode | undefined {
    if (target.kind === 'CHANGE') {
        return {
            id: nodeId('CHANGE', target.changeId), kind: 'CHANGE', canonicalId: target.changeId,
            label: `Change ${target.changeId}`,
        };
    }
    if (target.kind === 'ARTIFACT') {
        const artifact = understanding.observations.artifacts.find(item => item.id === target.artifactId);
        return artifact ? {
            id: nodeId('ARTIFACT', artifact.id), kind: 'ARTIFACT', canonicalId: artifact.id, label: artifact.path,
        } : undefined;
    }
    if (target.kind === 'AREA') {
        const area = understanding.areas.find(item => item.id === target.areaId);
        return area ? { id: nodeId('AREA', area.id), kind: 'AREA', canonicalId: area.id, label: area.label } : undefined;
    }
    if (target.kind === 'BOUNDARY') {
        const boundary = understanding.boundaries.find(item => item.id === target.boundaryId);
        return boundary ? {
            id: nodeId('BOUNDARY', boundary.id), kind: 'BOUNDARY', canonicalId: boundary.id, label: boundary.label,
        } : undefined;
    }
    const relationship = understanding.relationships.find(item => item.id === target.relationshipId);
    return relationship ? {
        id: nodeId('RELATIONSHIP', relationship.id), kind: 'RELATIONSHIP', canonicalId: relationship.id,
        label: `${relationship.sourceAreaId} → ${relationship.targetAreaId}`,
    } : undefined;
}

function resultNode(evidence: EvidenceRunObservation): VerificationGraphNode {
    return {
        id: nodeId('RESULT', evidence.id),
        kind: 'RESULT',
        canonicalId: evidence.id,
        label: evidence.name,
        lifecycle: evidence.lifecycle,
        outcome: evidence.outcome,
        sourceKind: 'EVIDENCE',
    };
}

const nodePriority: Record<VerificationGraphNodeKind, number> = {
    CHANGE: 0,
    ARTIFACT: 1,
    AREA: 2,
    BOUNDARY: 3,
    RELATIONSHIP: 4,
    EXPECTATION: 5,
    PIPELINE_DEFINITION: 6,
    PIPELINE_RUN: 7,
    PIPELINE_ATTEMPT: 8,
    PIPELINE_JOB: 9,
    PIPELINE_STEP: 10,
    RESULT: 11,
};

function sortNodes(left: VerificationGraphNode, right: VerificationGraphNode): number {
    return nodePriority[left.kind] - nodePriority[right.kind] || left.id.localeCompare(right.id);
}

function sortEdges(left: VerificationGraphEdge, right: VerificationGraphEdge): number {
    return `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`);
}

function addEdge(
    edges: Map<string, VerificationGraphEdge>,
    kind: VerificationGraphEdgeKind,
    from: string,
    to: string,
    claimId?: string,
): void {
    const id = edgeId(kind, from, to, claimId);
    if (!edges.has(id)) edges.set(id, { id, kind, from, to, ...(claimId ? { claimId } : {}) });
}

export function buildVerificationGraph(
    input: RepositoryUnderstanding,
    limitOverrides?: Partial<VerificationGraphLimits>,
): VerificationGraph {
    const limits = graphLimits(limitOverrides);
    const normalized = normalizeRepositoryUnderstanding(input);
    const understanding = normalized.understanding;
    const change = understanding.observations.change;
    const nodes = new Map<string, VerificationGraphNode>();
    const edges = new Map<string, VerificationGraphEdge>();
    const addNode = (node: VerificationGraphNode): VerificationGraphNode => {
        if (!nodes.has(node.id)) nodes.set(node.id, node);
        return nodes.get(node.id)!;
    };
    const changeNode = addNode({
        id: nodeId('CHANGE', change.id), kind: 'CHANGE', canonicalId: change.id, label: `Change ${change.id}`,
    });

    const changedArtifacts = change.artifacts.flatMap(item => {
        const artifact = understanding.observations.artifacts.find(candidate => candidate.id === item.artifactId);
        return artifact ? [artifact] : [];
    });
    const touchedAreaIds = new Set<string>();
    for (const artifact of changedArtifacts) {
        const artifactNode = addNode({
            id: nodeId('ARTIFACT', artifact.id), kind: 'ARTIFACT', canonicalId: artifact.id, label: artifact.path,
        });
        addEdge(edges, 'CHANGE_CONTAINS_ARTIFACT', changeNode.id, artifactNode.id);
        for (const membership of understanding.memberships) {
            const matches = membership.target.kind === 'ARTIFACT'
                ? membership.target.artifactId === artifact.id
                : pathMatches(artifact.path, membership.target.path);
            if (!matches) continue;
            const area = understanding.areas.find(item => item.id === membership.areaId);
            if (!area) continue;
            touchedAreaIds.add(area.id);
            const areaNode = addNode({ id: nodeId('AREA', area.id), kind: 'AREA', canonicalId: area.id, label: area.label });
            addEdge(edges, 'CHANGE_TOUCHES_AREA', changeNode.id, areaNode.id, membership.id);
        }
        for (const boundary of understanding.boundaries.filter(item => item.artifactIds.includes(artifact.id))) {
            const boundaryNode = addNode({
                id: nodeId('BOUNDARY', boundary.id), kind: 'BOUNDARY', canonicalId: boundary.id, label: boundary.label,
            });
            addEdge(edges, 'CHANGE_TOUCHES_BOUNDARY', changeNode.id, boundaryNode.id, boundary.id);
        }
    }

    for (const relationship of understanding.relationships) {
        if (!touchedAreaIds.has(relationship.sourceAreaId) && !touchedAreaIds.has(relationship.targetAreaId)
            && !understanding.evidenceExpectations.some(item => item.target.kind === 'RELATIONSHIP'
                && item.target.relationshipId === relationship.id)
            && !understanding.evidenceAttributions.some(item => item.target.kind === 'RELATIONSHIP'
                && item.target.relationshipId === relationship.id)) continue;
        const relationshipNode = addNode({
            id: nodeId('RELATIONSHIP', relationship.id), kind: 'RELATIONSHIP', canonicalId: relationship.id,
            label: `${relationship.sourceAreaId} → ${relationship.targetAreaId}`,
        });
        for (const [kind, areaId] of [
            ['AREA_RELATIONSHIP_SOURCE', relationship.sourceAreaId],
            ['AREA_RELATIONSHIP_TARGET', relationship.targetAreaId],
        ] as const) {
            const area = understanding.areas.find(item => item.id === areaId);
            if (!area) continue;
            const areaNode = addNode({ id: nodeId('AREA', area.id), kind: 'AREA', canonicalId: area.id, label: area.label });
            if (kind === 'AREA_RELATIONSHIP_SOURCE') addEdge(edges, kind, areaNode.id, relationshipNode.id, relationship.id);
            else addEdge(edges, kind, relationshipNode.id, areaNode.id, relationship.id);
        }
    }

    const currentDefinitions = understanding.observations.pipelineDefinitions.filter(item =>
        item.repositoryId === change.repositoryId && item.revision === change.headRevision);
    const currentRuns = understanding.observations.pipelineRuns.filter(item =>
        item.repositoryId === change.repositoryId && item.revision === change.headRevision);
    const currentRunIds = new Set(currentRuns.map(item => item.id));
    const currentAttempts = understanding.observations.pipelineAttempts.filter(item => currentRunIds.has(item.pipelineRunId));
    const currentAttemptIds = new Set(currentAttempts.map(item => item.id));
    const currentJobs = understanding.observations.pipelineJobs.filter(item => currentAttemptIds.has(item.pipelineAttemptId));
    const currentJobIds = new Set(currentJobs.map(item => item.id));
    const currentSteps = understanding.observations.pipelineSteps.filter(item => currentJobIds.has(item.pipelineJobId));

    for (const definition of currentDefinitions) addNode({
        id: nodeId('PIPELINE_DEFINITION', definition.id), kind: 'PIPELINE_DEFINITION', canonicalId: definition.id,
        label: definition.name,
    });
    for (const run of currentRuns) {
        const runNode = addNode({
            id: nodeId('PIPELINE_RUN', run.id), kind: 'PIPELINE_RUN', canonicalId: run.id, label: run.trigger,
        });
        if (run.pipelineDefinitionId) {
            const definitionNodeId = nodeId('PIPELINE_DEFINITION', run.pipelineDefinitionId);
            if (nodes.has(definitionNodeId)) addEdge(edges, 'PIPELINE_DEFINITION_RUN', definitionNodeId, runNode.id);
        }
    }
    for (const attempt of currentAttempts) {
        const attemptNode = addNode({
            id: nodeId('PIPELINE_ATTEMPT', attempt.id), kind: 'PIPELINE_ATTEMPT', canonicalId: attempt.id,
            label: `Attempt ${attempt.attempt}`, lifecycle: attempt.lifecycle, outcome: attempt.outcome,
        });
        addEdge(edges, 'PIPELINE_RUN_ATTEMPT', nodeId('PIPELINE_RUN', attempt.pipelineRunId), attemptNode.id);
    }
    for (const job of currentJobs) {
        const jobNode = addNode({
            id: nodeId('PIPELINE_JOB', job.id), kind: 'PIPELINE_JOB', canonicalId: job.id, label: job.name,
            lifecycle: job.lifecycle, outcome: job.outcome,
        });
        addEdge(edges, 'PIPELINE_ATTEMPT_JOB', nodeId('PIPELINE_ATTEMPT', job.pipelineAttemptId), jobNode.id);
        const jobResult = addNode({
            id: nodeId('RESULT', `process:${job.id}`), kind: 'RESULT', canonicalId: job.id, label: job.name,
            lifecycle: job.lifecycle, outcome: job.outcome, sourceKind: 'PROCESS',
        });
        addEdge(edges, 'PROCESS_RESULT', jobNode.id, jobResult.id);
    }
    for (const step of currentSteps) {
        const stepNode = addNode({
            id: nodeId('PIPELINE_STEP', step.id), kind: 'PIPELINE_STEP', canonicalId: step.id, label: step.name,
            lifecycle: step.lifecycle, outcome: step.outcome,
        });
        addEdge(edges, 'PIPELINE_JOB_STEP', nodeId('PIPELINE_JOB', step.pipelineJobId), stepNode.id);
        const stepResult = addNode({
            id: nodeId('RESULT', `process:${step.id}`), kind: 'RESULT', canonicalId: step.id, label: step.name,
            lifecycle: step.lifecycle, outcome: step.outcome, sourceKind: 'PROCESS',
        });
        addEdge(edges, 'PROCESS_RESULT', stepNode.id, stepResult.id);
    }

    const evidence = currentEvidenceRuns(understanding);
    const evidenceById = new Map(evidence.map(item => [item.id, item]));
    for (const run of evidence) {
        const result = addNode(resultNode(run));
        const identity = evidenceProcessIdentity(run, understanding);
        const parent = identity.pipelineStepId
            ? nodeId('PIPELINE_STEP', identity.pipelineStepId)
            : identity.pipelineJobId
                ? nodeId('PIPELINE_JOB', identity.pipelineJobId)
                : identity.pipelineAttemptId
                    ? nodeId('PIPELINE_ATTEMPT', identity.pipelineAttemptId)
                    : identity.pipelineRunId
                        ? nodeId('PIPELINE_RUN', identity.pipelineRunId)
                        : changeNode.id;
        if (nodes.has(parent)) addEdge(edges, 'PROCESS_RESULT', parent, result.id);
    }

    for (const expectation of understanding.evidenceExpectations) {
        const matches = evidence.filter(run => expectationMatchesEvidence(expectation, run, understanding));
        const supported = supportedExpectationClaim(expectation) !== undefined;
        const expectationState: VerificationExpectationState = !supported
            ? 'UNKNOWN'
            : matches.length > 0
                ? 'OBSERVED'
                : evidenceAcquisitionIsComplete(understanding)
                    ? 'NOT_OBSERVED'
                    : 'UNKNOWN';
        const expectationNode = addNode({
            id: nodeId('EXPECTATION', expectation.id), kind: 'EXPECTATION', canonicalId: expectation.id,
            label: expectation.name, expectationState,
        });
        const target = targetNode(expectation.target, understanding);
        if (target) {
            const retainedTarget = addNode(target);
            addEdge(edges, 'TARGET_EXPECTS_EVIDENCE', retainedTarget.id, expectationNode.id, expectation.id);
        }
        if (expectation.match?.pipelineDefinitionId) {
            const definitionNode = nodeId('PIPELINE_DEFINITION', expectation.match.pipelineDefinitionId);
            if (nodes.has(definitionNode)) {
                addEdge(edges, 'EXPECTATION_DECLARED_BY', expectationNode.id, definitionNode, expectation.id);
            }
        }
        if (expectationState !== 'OBSERVED') {
            const synthetic = addNode({
                id: nodeId('RESULT', `expectation:${expectation.id}`), kind: 'RESULT',
                canonicalId: expectation.id, label: expectation.name,
                lifecycle: expectationState === 'NOT_OBSERVED' ? 'NOT_OBSERVED' : 'UNKNOWN',
                outcome: 'UNKNOWN', expectationState, sourceKind: 'EXPECTATION',
            });
            addEdge(edges, 'EXPECTATION_RESULT', expectationNode.id, synthetic.id, expectation.id);
        }
        for (const run of supported ? matches : []) {
            const identity = evidenceProcessIdentity(run, understanding);
            if (identity.pipelineJobId && nodes.has(nodeId('PIPELINE_JOB', identity.pipelineJobId))) {
                addEdge(
                    edges, 'EXPECTATION_OBSERVED_BY', expectationNode.id,
                    nodeId('PIPELINE_JOB', identity.pipelineJobId), expectation.id,
                );
            } else {
                addEdge(edges, 'EXPECTATION_RESULT', expectationNode.id, nodeId('RESULT', run.id), expectation.id);
            }
        }
    }

    for (const attribution of understanding.evidenceAttributions) {
        const run = evidenceById.get(attribution.evidenceRunId);
        const target = targetNode(attribution.target, understanding);
        if (!run || !target) continue;
        const retainedTarget = addNode(target);
        addEdge(edges, 'ATTRIBUTED_RESULT', retainedTarget.id, nodeId('RESULT', run.id), attribution.id);
    }

    const allNodes = [...nodes.values()].sort(sortNodes);
    const retainedNodes = allNodes.slice(0, limits.maxNodes);
    const retainedNodeIds = new Set(retainedNodes.map(item => item.id));
    const allEdges = [...edges.values()].sort(sortEdges);
    const connectedEdges = allEdges.filter(edge => retainedNodeIds.has(edge.from) && retainedNodeIds.has(edge.to));
    const retainedEdges = connectedEdges.slice(0, limits.maxEdges);
    const truncation: VerificationGraphTruncation[] = [];
    if (retainedNodes.length < allNodes.length) {
        truncation.push({ collection: 'graph.nodes', observedCount: allNodes.length, retainedCount: retainedNodes.length });
    }
    if (retainedEdges.length < allEdges.length) {
        truncation.push({ collection: 'graph.edges', observedCount: allEdges.length, retainedCount: retainedEdges.length });
    }
    const complete = truncation.length === 0 && normalized.issues.length === 0;
    return {
        schemaVersion: 'verification-graph/v1',
        repositoryId: change.repositoryId,
        revision: change.headRevision,
        changeId: change.id,
        nodes: retainedNodes,
        edges: retainedEdges,
        completeness: {
            source: 'verification-graph', state: complete ? 'COMPLETE' : 'PARTIAL',
            observedCount: retainedNodes.length + retainedEdges.length,
            expectedCount: allNodes.length + allEdges.length,
            ...(!complete ? { reason: 'graph bounds or canonical normalization repairs limited the projection' } : {}),
        },
        truncation,
        normalizationIssues: normalized.issues,
    };
}

function boundedCollection<T>(
    collection: string,
    values: readonly T[],
    limit: number,
    truncation: VerificationGraphTruncation[],
): T[] {
    const retained = values.slice(0, limit);
    if (retained.length < values.length) {
        truncation.push({ collection, observedCount: values.length, retainedCount: retained.length });
    }
    return retained;
}

function boundedSupport(
    claimId: string,
    supports: readonly ClaimSupport[],
    limits: VerificationGraphLimits,
    truncation: VerificationGraphTruncation[],
): ClaimSupport[] {
    return boundedCollection(
        `claims.${claimId}.support`, supports, limits.maxSupportsPerClaim, truncation,
    ).map((item, index) => ({
        ...item,
        evidence: boundedCollection(
            `claims.${claimId}.support.${index}.evidence`, item.evidence,
            limits.maxEvidenceReferencesPerSupport, truncation,
        ),
    }));
}

export function inspectVerificationGraph(
    input: RepositoryUnderstanding,
    limitOverrides?: Partial<VerificationGraphLimits>,
): VerificationGraphInspection {
    const limits = graphLimits(limitOverrides);
    const normalized = normalizeRepositoryUnderstanding(input).understanding;
    const graph = buildVerificationGraph(normalized, limits);
    const truncation = [...graph.truncation];
    const retain = <T>(collection: string, values: readonly T[]): T[] => boundedCollection(
        collection, values, limits.maxInspectionItemsPerCollection, truncation,
    );
    const observations: Record<string, VerificationInspectionObservation[]> = {
        snapshots: [{
            id: normalized.observations.snapshot.id, kind: normalized.observations.snapshot.kind,
            revision: normalized.observations.snapshot.revision,
            source: { ...normalized.observations.snapshot.source },
        }],
        changes: [{
            id: normalized.observations.change.id, kind: normalized.observations.change.kind,
            revision: normalized.observations.change.headRevision,
            source: { ...normalized.observations.change.source },
            details: { baseRevision: normalized.observations.change.baseRevision },
        }],
        artifacts: retain('observations.artifacts', normalized.observations.artifacts).map(item => ({
            id: item.id, kind: item.kind, label: item.path, revision: item.revision,
            source: { ...item.source }, details: { artifactKind: item.artifactKind },
        })),
        pipelineDefinitions: retain('observations.pipelineDefinitions', normalized.observations.pipelineDefinitions).map(item => ({
            id: item.id, kind: item.kind, label: item.name, revision: item.revision,
            source: { ...item.source }, details: { path: item.path, triggerCount: item.triggers.length, jobCount: item.jobs.length },
        })),
        pipelineRuns: retain('observations.pipelineRuns', normalized.observations.pipelineRuns).map(item => ({
            id: item.id, kind: item.kind, label: item.trigger, revision: item.revision,
            ...(item.pipelineDefinitionId ? { parentId: item.pipelineDefinitionId } : {}),
            source: { ...item.source }, details: { ...(item.ref ? { ref: item.ref } : {}) },
        })),
        pipelineAttempts: retain('observations.pipelineAttempts', normalized.observations.pipelineAttempts).map(item => ({
            id: item.id, kind: item.kind, parentId: item.pipelineRunId,
            lifecycle: item.lifecycle, outcome: item.outcome,
            source: { ...item.source }, details: { attempt: item.attempt },
        })),
        pipelineJobs: retain('observations.pipelineJobs', normalized.observations.pipelineJobs).map(item => ({
            id: item.id, kind: item.kind, label: item.name, parentId: item.pipelineAttemptId,
            lifecycle: item.lifecycle, outcome: item.outcome,
            source: { ...item.source },
            details: {
                ...(item.logicalJobId ? { logicalJobId: item.logicalJobId } : {}),
                ...(item.needs ? { needs: boundedCollection(
                    `observations.${item.id}.needs`, item.needs,
                    limits.maxEvidenceReferencesPerSupport, truncation,
                ) } : {}),
                ...(item.blockedByPipelineJobIds ? { blockedByPipelineJobIds: boundedCollection(
                    `observations.${item.id}.blockedByPipelineJobIds`, item.blockedByPipelineJobIds,
                    limits.maxEvidenceReferencesPerSupport, truncation,
                ) } : {}),
            },
        })),
        pipelineSteps: retain('observations.pipelineSteps', normalized.observations.pipelineSteps).map(item => ({
            id: item.id, kind: item.kind, label: item.name, parentId: item.pipelineJobId,
            lifecycle: item.lifecycle, outcome: item.outcome,
            source: { ...item.source },
            details: { sequence: item.sequence, ...(item.execution ? { execution: { ...item.execution } } : {}) },
        })),
        evidenceRuns: retain('observations.evidenceRuns', normalized.observations.evidenceRuns).map(item => ({
            id: item.id, kind: item.kind, label: item.name, revision: item.revision,
            parentId: item.pipelineStepId ?? item.pipelineJobId ?? item.pipelineAttemptId ?? item.pipelineRunId,
            lifecycle: item.lifecycle, outcome: item.outcome,
            source: { ...item.source }, details: { evidenceKind: item.evidenceKind },
        })),
    };

    const claim = (
        id: string,
        kind: string,
        support: readonly ClaimSupport[],
        extra: Omit<VerificationInspectionClaim, 'id' | 'kind' | 'support'> = {},
    ): VerificationInspectionClaim => ({
        id, kind, ...extra, support: boundedSupport(id, support, limits, truncation),
    });
    const claims: Record<string, VerificationInspectionClaim[]> = {
        areas: retain('claims.areas', normalized.areas).map(item => claim(item.id, 'area', item.support, {
            details: {
                label: item.label,
                roles: boundedCollection(
                    `claims.${item.id}.roles`, item.roles,
                    limits.maxEvidenceReferencesPerSupport, truncation,
                ),
                ...(item.parentAreaId ? { parentAreaId: item.parentAreaId } : {}),
            },
        })),
        memberships: retain('claims.memberships', normalized.memberships).map(item => claim(item.id, 'membership', item.support, {
            details: { areaId: item.areaId, target: { ...item.target }, ...(item.view ? { view: item.view } : {}) },
        })),
        relationships: retain('claims.relationships', normalized.relationships).map(item => claim(item.id, 'relationship', item.support, {
            details: {
                sourceAreaId: item.sourceAreaId, targetAreaId: item.targetAreaId,
                type: typeof item.type === 'string' ? item.type : { ...item.type },
            },
        })),
        boundaries: retain('claims.boundaries', normalized.boundaries).map(item => claim(item.id, 'boundary', item.support, {
            details: {
                label: item.label,
                kind: typeof item.kind === 'string' ? item.kind : { ...item.kind },
                artifactIds: boundedCollection(
                    `claims.${item.id}.artifactIds`, item.artifactIds,
                    limits.maxEvidenceReferencesPerSupport, truncation,
                ),
                connectedAreaIds: boundedCollection(
                    `claims.${item.id}.connectedAreaIds`, item.connectedAreaIds,
                    limits.maxEvidenceReferencesPerSupport, truncation,
                ),
            },
        })),
        evidenceAttributions: retain('claims.evidenceAttributions', normalized.evidenceAttributions).map(item => claim(
            item.id, 'evidence-attribution', item.support, { target: item.target, evidenceRunId: item.evidenceRunId },
        )),
        evidenceExpectations: retain('claims.evidenceExpectations', normalized.evidenceExpectations).map(item => claim(
            item.id, 'evidence-expectation', item.support,
            { target: item.target, ...(item.match ? { match: { ...item.match } } : {}) },
        )),
        completeness: retain('claims.completeness', normalized.completeness).map(item => claim(item.id, 'completeness', item.support, {
            details: { dimension: item.dimension, state: item.state, ...(item.reason ? { reason: item.reason } : {}) },
        })),
    };

    const sourceCompleteness = retain(
        'sourceCompleteness', normalized.observations.completeness,
    ).map(item => ({ ...item }));
    const claimCompleteness = retain('claimCompleteness', normalized.completeness).map(item => ({
        id: item.id, dimension: item.dimension, state: item.state, ...(item.reason ? { reason: item.reason } : {}),
    }));
    truncation.sort((left, right) => left.collection.localeCompare(right.collection));
    return {
        schemaVersion: 'verification-graph-inspection/v1',
        graph: { ...graph, truncation: [...graph.truncation] },
        observations,
        claims,
        sourceCompleteness,
        claimCompleteness,
        truncation,
    };
}

export function serializeVerificationGraphInspection(inspection: VerificationGraphInspection): string {
    return `${JSON.stringify(inspection, null, 2)}\n`;
}
