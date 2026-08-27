export type KnowledgeClass = 'observed' | 'derived' | 'inferred' | 'unknown';
export type AttentionLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type EvidenceStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'MISSING' | 'UNKNOWN';

export interface ChangedFile {
    path: string;
    status: 'added' | 'modified' | 'deleted';
}

export interface Change {
    id: string;
    files: ChangedFile[];
}

export interface Project {
    name: string;
    path: string;
    dependencies: string[]; // names of projects this project depends on
}

export interface RepositoryContext {
    projects: Project[];
}

export interface Evidence {
    name: string;
    kind: string;
    status: EvidenceStatus;
    source: string;
    knowledge: KnowledgeClass;
    coverage?: string[] | 'UNKNOWN'; // Identifies specifically which areas this evidence covers
    url?: string;
}

export interface AnalysisCompleteness {
    changedFiles: 'complete' | 'incomplete';
    repositoryContext: KnowledgeClass;
    notes: string[];
}

export interface SparkInput {
    change: Change;
    context: RepositoryContext;
    evidence: Evidence[];
    analysis?: AnalysisCompleteness;
}

export interface SparkEvaluation {
    changeId: string;
    attention: AttentionLevel;
    reasons: string[];
    directAreas: string[];
    affectedAreas: string[];
    sensitiveSurfaces: string[];
    evidence: Evidence[];
    analysis?: AnalysisCompleteness;
}

// Profile stress fixture: this exact path is jointly owned.
