import { normalizeRepositoryUnderstanding, type UnderstandingNormalizationIssue } from './understanding-normalize';
import type {
    Area,
    AreaMembership,
    AreaRelationship,
    Boundary,
    ClaimProvenanceKind,
    CompletenessAssessment,
    EvidenceAttribution,
    EvidenceExpectation,
    RepositoryObservations,
    RepositoryUnderstanding,
} from './understanding';

export interface AnalyzerContribution {
    areas?: Area[];
    memberships?: AreaMembership[];
    relationships?: AreaRelationship[];
    boundaries?: Boundary[];
    evidenceAttributions?: EvidenceAttribution[];
    evidenceExpectations?: EvidenceExpectation[];
    completeness?: CompletenessAssessment[];
}

export interface RepositoryAnalyzer {
    id: string;
    version?: string;
    provenanceKind: Extract<ClaimProvenanceKind, 'GENERIC_ANALYZER' | 'ECOSYSTEM_ADAPTER' | 'WORKFLOW_ANALYZER' | 'PROFILE'>;
    analyze(observations: Readonly<RepositoryObservations>): AnalyzerContribution;
}

export interface AnalyzerExecutionIssue {
    analyzerId: string;
    code: 'ANALYZER_FAILED';
    detail: string;
}

export interface RepositoryAnalysisResult {
    understanding: RepositoryUnderstanding;
    analyzerIssues: AnalyzerExecutionIssue[];
    normalizationIssues: UnderstandingNormalizationIssue[];
}

function emptyUnderstanding(observations: RepositoryObservations): RepositoryUnderstanding {
    return {
        observations,
        areas: [],
        memberships: [],
        relationships: [],
        boundaries: [],
        evidenceAttributions: [],
        evidenceExpectations: [],
        completeness: [],
    };
}

export function analyzeRepository(
    observations: RepositoryObservations,
    analyzers: readonly RepositoryAnalyzer[],
): RepositoryAnalysisResult {
    const understanding = emptyUnderstanding(observations);
    const analyzerIssues: AnalyzerExecutionIssue[] = [];

    for (const analyzer of [...analyzers].sort((left, right) => left.id.localeCompare(right.id))) {
        try {
            const contribution = analyzer.analyze(observations);
            understanding.areas.push(...(contribution.areas ?? []));
            understanding.memberships.push(...(contribution.memberships ?? []));
            understanding.relationships.push(...(contribution.relationships ?? []));
            understanding.boundaries.push(...(contribution.boundaries ?? []));
            understanding.evidenceAttributions.push(...(contribution.evidenceAttributions ?? []));
            understanding.evidenceExpectations.push(...(contribution.evidenceExpectations ?? []));
            understanding.completeness.push(...(contribution.completeness ?? []));
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'unknown analyzer failure';
            analyzerIssues.push({ analyzerId: analyzer.id, code: 'ANALYZER_FAILED', detail });
            understanding.completeness.push({
                id: `completeness:analyzer:${analyzer.id}`,
                dimension: `analyzer:${analyzer.id}`,
                state: 'UNAVAILABLE',
                reason: detail,
                support: [{
                    provenance: { kind: analyzer.provenanceKind, source: analyzer.id, ...(analyzer.version ? { version: analyzer.version } : {}) },
                    derivation: 'DETERMINISTIC',
                    confidence: 'UNKNOWN',
                    evidence: [],
                    completeness: { state: 'UNAVAILABLE', reason: detail },
                }],
            });
        }
    }

    const normalized = normalizeRepositoryUnderstanding(understanding);
    return {
        understanding: normalized.understanding,
        analyzerIssues: analyzerIssues.sort((left, right) => left.analyzerId.localeCompare(right.analyzerId)),
        normalizationIssues: normalized.issues,
    };
}
