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
