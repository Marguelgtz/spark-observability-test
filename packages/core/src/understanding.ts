export type ObservationId = string;
export type RepositoryId = string;
export type RevisionId = string;
export type ArtifactId = string;
export type PipelineDefinitionId = string;
export type PipelineRunId = string;
export type PipelineAttemptId = string;
export type PipelineJobId = string;
export type PipelineStepId = string;

/** Where an observed process is in its lifecycle, independent of its result. */
export type ProcessLifecycle =
    | 'EXPECTED'
    | 'NOT_OBSERVED'
    | 'QUEUED'
    | 'RUNNING'
    | 'COMPLETED'
    | 'CANCELLED';

/** The terminal result of a process, independent of whether it has completed. */
export type ProcessOutcome =
    | 'PASSED'
    | 'FAILED'
    | 'NEUTRAL'
    | 'SKIPPED'
    | 'UNKNOWN'
    | 'NOT_APPLICABLE';

export interface ObservationSource {
    /** Provider-neutral source family, such as `vcs`, `ci`, or `filesystem`. */
    kind: string;
    /** Stable source identity when the source exposes one. */
    id?: string;
}

export type CompletenessState = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';

export interface SourceCompleteness {
    /** The bounded acquisition source or dimension being assessed. */
    source: string;
    state: CompletenessState;
    observedCount?: number;
    expectedCount?: number;
    reason?: string;
}

export interface RepositorySnapshotObservation {
    kind: 'repository-snapshot';
    id: ObservationId;
    repositoryId: RepositoryId;
    revision: RevisionId;
    source: ObservationSource;
}

export interface ArtifactObservation {
    kind: 'artifact';
    id: ArtifactId;
    repositoryId: RepositoryId;
    revision: RevisionId;
    path: string;
    artifactKind: 'FILE' | 'DIRECTORY';
    source: ObservationSource;
}

export interface ArtifactChangeObservation {
    artifactId: ArtifactId;
    status: 'ADDED' | 'MODIFIED' | 'DELETED';
}

export interface ChangeObservation {
    kind: 'change';
    id: ObservationId;
    repositoryId: RepositoryId;
    baseRevision: RevisionId;
    headRevision: RevisionId;
    artifacts: ArtifactChangeObservation[];
    source: ObservationSource;
}

export interface PipelinePathFilterDeclaration {
    include?: string[];
    exclude?: string[];
}

export interface PipelineTriggerDeclaration {
    /** Provider-neutral event name, such as a proposed change, push, schedule, or manual dispatch. */
    event: string;
    branches?: PipelinePathFilterDeclaration;
    paths?: PipelinePathFilterDeclaration;
}

export type DeclaredExecutionReference =
    | { kind: 'COMMAND'; command: string }
    | { kind: 'ACTION'; reference: string }
    | { kind: 'REUSABLE_PROCESS'; reference: string };

export interface PipelineStepDeclaration {
    id?: string;
    name?: string;
    execution: DeclaredExecutionReference;
}

export interface PipelineJobDeclaration {
    id: string;
    name?: string;
    needs?: string[];
    matrix?: Record<string, Array<string | number | boolean>>;
    environment?: string;
    reusableProcess?: string;
    steps?: PipelineStepDeclaration[];
}

export interface PipelineDefinitionObservation {
    kind: 'pipeline-definition';
    id: PipelineDefinitionId;
    repositoryId: RepositoryId;
    revision: RevisionId;
    name: string;
    path: string;
    triggers: PipelineTriggerDeclaration[];
    jobs: PipelineJobDeclaration[];
    source: ObservationSource;
}

/** A logical invocation. Re-execution creates another attempt under the same run. */
export interface PipelineRunObservation {
    kind: 'pipeline-run';
    id: PipelineRunId;
    /** Link to an acquired declaration; absent when definition acquisition was unavailable. */
    pipelineDefinitionId?: PipelineDefinitionId;
    repositoryId: RepositoryId;
    revision: RevisionId;
    trigger: string;
    ref?: string;
    createdAt?: string;
    source: ObservationSource;
    url?: string;
}

export interface PipelineAttemptObservation {
    kind: 'pipeline-attempt';
    id: PipelineAttemptId;
    pipelineRunId: PipelineRunId;
    attempt: number;
    lifecycle: ProcessLifecycle;
    outcome: ProcessOutcome;
    startedAt?: string;
    completedAt?: string;
    source: ObservationSource;
    url?: string;
}

export interface PipelineJobObservation {
    kind: 'pipeline-job';
    id: PipelineJobId;
    pipelineAttemptId: PipelineAttemptId;
    /** Stable identifier from the declaration before matrix expansion, when available. */
    logicalJobId?: string;
    name: string;
    needs?: string[];
    matrix?: Record<string, string | number | boolean>;
    runnerClass?: string;
    environment?: string;
    lifecycle: ProcessLifecycle;
    outcome: ProcessOutcome;
    startedAt?: string;
    completedAt?: string;
    source: ObservationSource;
    url?: string;
}

export interface PipelineStepObservation {
    kind: 'pipeline-step';
    id: PipelineStepId;
    pipelineJobId: PipelineJobId;
    sequence: number;
    name: string;
    execution?: DeclaredExecutionReference;
    lifecycle: ProcessLifecycle;
    outcome: ProcessOutcome;
    startedAt?: string;
    completedAt?: string;
    source: ObservationSource;
}

export interface EvidenceRunObservation {
    kind: 'evidence-run';
    id: ObservationId;
    repositoryId: RepositoryId;
    revision: RevisionId;
    name: string;
    evidenceKind: string;
    lifecycle: ProcessLifecycle;
    outcome: ProcessOutcome;
    pipelineAttemptId?: PipelineAttemptId;
    pipelineJobId?: PipelineJobId;
    pipelineStepId?: PipelineStepId;
    source: ObservationSource;
    url?: string;
}

export interface RepositoryObservations {
    snapshot: RepositorySnapshotObservation;
    change: ChangeObservation;
    artifacts: ArtifactObservation[];
    pipelineDefinitions: PipelineDefinitionObservation[];
    pipelineRuns: PipelineRunObservation[];
    pipelineAttempts: PipelineAttemptObservation[];
    pipelineJobs: PipelineJobObservation[];
    pipelineSteps: PipelineStepObservation[];
    evidenceRuns: EvidenceRunObservation[];
    /** Acquisition truth remains independent for each source or dimension. */
    completeness: SourceCompleteness[];
}

export type ClaimDerivation = 'DECLARED' | 'DETERMINISTIC' | 'HEURISTIC';
export type ClaimConfidence = 'SUPPORTED' | 'TENTATIVE' | 'UNKNOWN';

export type ClaimProvenanceKind =
    | 'GENERIC_ANALYZER'
    | 'ECOSYSTEM_ADAPTER'
    | 'WORKFLOW_ANALYZER'
    | 'PROFILE'
    | 'PROVIDER'
    | 'USER';

export interface ClaimProvenance {
    kind: ClaimProvenanceKind;
    /** Identifies the concrete analyzer, adapter, provider, profile, or user source. */
    source: string;
    version?: string;
}

export interface ClaimEvidenceReference {
    kind: 'OBSERVATION' | 'ARTIFACT' | 'EVIDENCE_RUN';
    id: string;
}

export interface ClaimCompleteness {
    state: CompletenessState;
    reason?: string;
}

export interface ClaimSupport {
    provenance: ClaimProvenance;
    derivation: ClaimDerivation;
    confidence: ClaimConfidence;
    evidence: ClaimEvidenceReference[];
    completeness: ClaimCompleteness;
}

export type AreaId = string;
export type MembershipId = string;
export type RelationshipId = string;
export type BoundaryId = string;
export type EvidenceAttributionId = string;
export type EvidenceExpectationId = string;

export type ExtensibleValue<Name extends string> = Name | { extension: string };

export type AreaRole = ExtensibleValue<'STRUCTURAL' | 'PROJECT' | 'FUNCTIONAL' | 'OWNERSHIP' | 'DEPLOYABLE'>;

export interface Area {
    id: AreaId;
    label: string;
    roles: AreaRole[];
    parentAreaId?: AreaId;
    support: ClaimSupport[];
}

export type MembershipTarget =
    | { kind: 'ARTIFACT'; artifactId: ArtifactId }
    | { kind: 'PATH'; path: string };

export interface AreaMembership {
    id: MembershipId;
    areaId: AreaId;
    target: MembershipTarget;
    /** Optional structural, functional, ownership, or adapter-defined view. */
    view?: string;
    support: ClaimSupport[];
}

export type AreaRelationshipType = ExtensibleValue<'CONTAINS' | 'DEPENDS_ON' | 'GENERATED_FROM'>;

export interface AreaRelationship {
    id: RelationshipId;
    sourceAreaId: AreaId;
    targetAreaId: AreaId;
    type: AreaRelationshipType;
    support: ClaimSupport[];
}

export type BoundaryKind = ExtensibleValue<
    | 'CI'
    | 'DEPENDENCY'
    | 'DEPLOYMENT'
    | 'MIGRATION'
    | 'SECURITY'
    | 'PUBLIC_INTERFACE'
    | 'GENERATED_INTERFACE'
>;

export interface Boundary {
    id: BoundaryId;
    kind: BoundaryKind;
    label: string;
    artifactIds: ArtifactId[];
    connectedAreaIds: AreaId[];
    support: ClaimSupport[];
}

export type UnderstandingTarget =
    | { kind: 'CHANGE'; changeId: ObservationId }
    | { kind: 'ARTIFACT'; artifactId: ArtifactId }
    | { kind: 'AREA'; areaId: AreaId }
    | { kind: 'RELATIONSHIP'; relationshipId: RelationshipId }
    | { kind: 'BOUNDARY'; boundaryId: BoundaryId };

export interface EvidenceAttribution {
    id: EvidenceAttributionId;
    evidenceRunId: ObservationId;
    target: UnderstandingTarget;
    support: ClaimSupport[];
}

export interface EvidenceExpectation {
    id: EvidenceExpectationId;
    name: string;
    target: UnderstandingTarget;
    support: ClaimSupport[];
}

export interface CompletenessAssessment {
    id: string;
    dimension: string;
    state: CompletenessState;
    reason?: string;
    support: ClaimSupport[];
}

export interface RepositoryUnderstanding {
    observations: RepositoryObservations;
    areas: Area[];
    memberships: AreaMembership[];
    relationships: AreaRelationship[];
    boundaries: Boundary[];
    evidenceAttributions: EvidenceAttribution[];
    evidenceExpectations: EvidenceExpectation[];
    completeness: CompletenessAssessment[];
}
