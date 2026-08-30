import type { EvidenceStatus } from './types';

export type ObservationId = string;
export type RepositoryId = string;
export type RevisionId = string;
export type ArtifactId = string;

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

export interface EvidenceRunObservation {
    kind: 'evidence-run';
    id: ObservationId;
    repositoryId: RepositoryId;
    revision: RevisionId;
    name: string;
    evidenceKind: string;
    status: EvidenceStatus;
    source: ObservationSource;
    url?: string;
}

export interface RepositoryObservations {
    snapshot: RepositorySnapshotObservation;
    change: ChangeObservation;
    artifacts: ArtifactObservation[];
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
