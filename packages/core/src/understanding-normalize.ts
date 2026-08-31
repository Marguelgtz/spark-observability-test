import type {
    Area,
    AreaMembership,
    AreaRelationship,
    Boundary,
    ClaimCompleteness,
    ClaimConfidence,
    ClaimEvidenceReference,
    ClaimSupport,
    CompletenessAssessment,
    CompletenessState,
    EvidenceAttribution,
    EvidenceExpectation,
    EvidenceRunObservation,
    RepositoryUnderstanding,
    SourceCompleteness,
} from './understanding';

export type UnderstandingIssueCode =
    | 'DUPLICATE_ID'
    | 'DANGLING_REFERENCE'
    | 'INVALID_CONFIDENCE'
    | 'INVALID_COMPLETENESS';

export interface UnderstandingNormalizationIssue {
    code: UnderstandingIssueCode;
    path: string;
    detail: string;
}

export interface NormalizedRepositoryUnderstanding {
    understanding: RepositoryUnderstanding;
    issues: UnderstandingNormalizationIssue[];
}

const completenessStates = new Set<CompletenessState>(['COMPLETE', 'PARTIAL', 'UNAVAILABLE']);
const confidenceStates = new Set<ClaimConfidence>(['SUPPORTED', 'TENTATIVE', 'UNKNOWN']);

function byId<T extends { id: string }>(left: T, right: T): number {
    return left.id.localeCompare(right.id);
}

function uniqueById<T extends { id: string }>(
    values: readonly T[],
    path: string,
    issues: UnderstandingNormalizationIssue[],
): T[] {
    const retained = new Map<string, T>();
    for (const value of values) {
        if (retained.has(value.id)) {
            issues.push({ code: 'DUPLICATE_ID', path: `${path}.${value.id}`, detail: 'retained first value' });
            continue;
        }
        retained.set(value.id, value);
    }
    return [...retained.values()].sort(byId);
}

function uniqueSorted(values: readonly string[]): string[] {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizeCompleteness(
    value: ClaimCompleteness,
    path: string,
    issues: UnderstandingNormalizationIssue[],
): ClaimCompleteness {
    if (completenessStates.has(value.state)) return { ...value };
    issues.push({ code: 'INVALID_COMPLETENESS', path, detail: `replaced ${String(value.state)} with UNAVAILABLE` });
    return { state: 'UNAVAILABLE', reason: value.reason ?? 'invalid completeness state' };
}

function referenceExists(
    reference: ClaimEvidenceReference,
    observationIds: ReadonlySet<string>,
    artifactIds: ReadonlySet<string>,
    evidenceRunIds: ReadonlySet<string>,
): boolean {
    if (reference.kind === 'ARTIFACT') return artifactIds.has(reference.id);
    if (reference.kind === 'EVIDENCE_RUN') return evidenceRunIds.has(reference.id);
    return observationIds.has(reference.id);
}

function normalizeSupport(
    supports: readonly ClaimSupport[],
    path: string,
    referenceSets: {
        observationIds: ReadonlySet<string>;
        artifactIds: ReadonlySet<string>;
        evidenceRunIds: ReadonlySet<string>;
    },
    issues: UnderstandingNormalizationIssue[],
): ClaimSupport[] {
    return supports.map((support, supportIndex) => {
        const supportPath = `${path}.support.${supportIndex}`;
        const confidence = confidenceStates.has(support.confidence) ? support.confidence : 'UNKNOWN';
        if (confidence !== support.confidence) {
            issues.push({
                code: 'INVALID_CONFIDENCE',
                path: `${supportPath}.confidence`,
                detail: `replaced ${String(support.confidence)} with UNKNOWN`,
            });
        }
        const evidence = support.evidence.filter(reference => {
            const exists = referenceExists(
                reference,
                referenceSets.observationIds,
                referenceSets.artifactIds,
                referenceSets.evidenceRunIds,
            );
            if (!exists) {
                issues.push({
                    code: 'DANGLING_REFERENCE',
                    path: `${supportPath}.evidence.${reference.id}`,
                    detail: 'removed missing evidence reference',
                });
            }
            return exists;
        }).sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
        return {
            ...support,
            confidence,
            evidence,
            completeness: normalizeCompleteness(support.completeness, `${supportPath}.completeness`, issues),
        };
    }).sort((left, right) => {
        const leftKey = `${left.provenance.kind}:${left.provenance.source}:${left.derivation}:${left.confidence}`;
        const rightKey = `${right.provenance.kind}:${right.provenance.source}:${right.derivation}:${right.confidence}`;
        return leftKey.localeCompare(rightKey);
    });
}

function hasTarget(
    target: EvidenceAttribution['target'] | EvidenceExpectation['target'],
    ids: { change: string; artifacts: ReadonlySet<string>; areas: ReadonlySet<string>; relationships: ReadonlySet<string>; boundaries: ReadonlySet<string> },
): boolean {
    if (target.kind === 'CHANGE') return target.changeId === ids.change;
    if (target.kind === 'ARTIFACT') return ids.artifacts.has(target.artifactId);
    if (target.kind === 'AREA') return ids.areas.has(target.areaId);
    if (target.kind === 'RELATIONSHIP') return ids.relationships.has(target.relationshipId);
    return ids.boundaries.has(target.boundaryId);
}

export function normalizeRepositoryUnderstanding(input: RepositoryUnderstanding): NormalizedRepositoryUnderstanding {
    const issues: UnderstandingNormalizationIssue[] = [];
    const artifacts = uniqueById(input.observations.artifacts, 'observations.artifacts', issues);
    const evidenceRuns = uniqueById(input.observations.evidenceRuns, 'observations.evidenceRuns', issues);
    const artifactIds = new Set(artifacts.map(item => item.id));
    const evidenceRunIds = new Set(evidenceRuns.map(item => item.id));
    const observationIds = new Set([input.observations.snapshot.id, input.observations.change.id]);
    const referenceSets = { observationIds, artifactIds, evidenceRunIds };

    const changedArtifacts = input.observations.change.artifacts.filter(item => {
        if (artifactIds.has(item.artifactId)) return true;
        issues.push({
            code: 'DANGLING_REFERENCE',
            path: `observations.change.artifacts.${item.artifactId}`,
            detail: 'removed change entry for missing artifact',
        });
        return false;
    }).sort((left, right) => left.artifactId.localeCompare(right.artifactId));

    const areas = uniqueById(input.areas, 'areas', issues);
    const areaIds = new Set(areas.map(item => item.id));
    const normalizedAreas: Area[] = areas.map(area => {
        const parentAreaId = area.parentAreaId && areaIds.has(area.parentAreaId) ? area.parentAreaId : undefined;
        if (area.parentAreaId && !parentAreaId) {
            issues.push({
                code: 'DANGLING_REFERENCE',
                path: `areas.${area.id}.parentAreaId`,
                detail: 'removed missing parent area reference',
            });
        }
        return {
            ...area,
            roles: [...area.roles].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
            ...(parentAreaId ? { parentAreaId } : { parentAreaId: undefined }),
            support: normalizeSupport(area.support, `areas.${area.id}`, referenceSets, issues),
        };
    });

    const memberships: AreaMembership[] = uniqueById(input.memberships, 'memberships', issues).filter(item => {
        const validArea = areaIds.has(item.areaId);
        const validTarget = item.target.kind === 'PATH' || artifactIds.has(item.target.artifactId);
        if (validArea && validTarget) return true;
        issues.push({
            code: 'DANGLING_REFERENCE',
            path: `memberships.${item.id}`,
            detail: 'removed membership with a missing area or artifact',
        });
        return false;
    }).map(item => ({ ...item, support: normalizeSupport(item.support, `memberships.${item.id}`, referenceSets, issues) }));

    const relationships: AreaRelationship[] = uniqueById(input.relationships, 'relationships', issues).filter(item => {
        if (areaIds.has(item.sourceAreaId) && areaIds.has(item.targetAreaId)) return true;
        issues.push({
            code: 'DANGLING_REFERENCE',
            path: `relationships.${item.id}`,
            detail: 'removed relationship with a missing area',
        });
        return false;
    }).map(item => ({ ...item, support: normalizeSupport(item.support, `relationships.${item.id}`, referenceSets, issues) }));
    const relationshipIds = new Set(relationships.map(item => item.id));

    const boundaries: Boundary[] = uniqueById(input.boundaries, 'boundaries', issues).map(item => ({
        ...item,
        artifactIds: uniqueSorted(item.artifactIds.filter(id => artifactIds.has(id))),
        connectedAreaIds: uniqueSorted(item.connectedAreaIds.filter(id => areaIds.has(id))),
        support: normalizeSupport(item.support, `boundaries.${item.id}`, referenceSets, issues),
    }));
    for (const boundary of input.boundaries) {
        for (const id of [...boundary.artifactIds.filter(id => !artifactIds.has(id)), ...boundary.connectedAreaIds.filter(id => !areaIds.has(id))]) {
            issues.push({
                code: 'DANGLING_REFERENCE',
                path: `boundaries.${boundary.id}.${id}`,
                detail: 'removed missing boundary reference',
            });
        }
    }
    const boundaryIds = new Set(boundaries.map(item => item.id));
    const targetIds = {
        change: input.observations.change.id,
        artifacts: artifactIds,
        areas: areaIds,
        relationships: relationshipIds,
        boundaries: boundaryIds,
    };

    const evidenceAttributions: EvidenceAttribution[] = uniqueById(input.evidenceAttributions, 'evidenceAttributions', issues)
        .filter(item => {
            if (evidenceRunIds.has(item.evidenceRunId) && hasTarget(item.target, targetIds)) return true;
            issues.push({
                code: 'DANGLING_REFERENCE',
                path: `evidenceAttributions.${item.id}`,
                detail: 'removed attribution with a missing run or target',
            });
            return false;
        })
        .map(item => ({ ...item, support: normalizeSupport(item.support, `evidenceAttributions.${item.id}`, referenceSets, issues) }));

    const evidenceExpectations: EvidenceExpectation[] = uniqueById(input.evidenceExpectations, 'evidenceExpectations', issues)
        .filter(item => {
            if (hasTarget(item.target, targetIds)) return true;
            issues.push({
                code: 'DANGLING_REFERENCE',
                path: `evidenceExpectations.${item.id}`,
                detail: 'removed expectation with a missing target',
            });
            return false;
        })
        .map(item => ({ ...item, support: normalizeSupport(item.support, `evidenceExpectations.${item.id}`, referenceSets, issues) }));

    const completeness: CompletenessAssessment[] = uniqueById(input.completeness, 'completeness', issues).map(item => ({
        ...item,
        ...normalizeCompleteness(item, `completeness.${item.id}.state`, issues),
        support: normalizeSupport(item.support, `completeness.${item.id}`, referenceSets, issues),
    }));
    const sourceCompleteness: SourceCompleteness[] = input.observations.completeness.map((item, index) => {
        if (completenessStates.has(item.state)) return { ...item };
        issues.push({
            code: 'INVALID_COMPLETENESS',
            path: `observations.completeness.${index}.state`,
            detail: `replaced ${String(item.state)} with UNAVAILABLE`,
        });
        return { ...item, state: 'UNAVAILABLE' as const, reason: item.reason ?? 'invalid completeness state' };
    }).sort((left, right) => left.source.localeCompare(right.source));

    return {
        understanding: {
            observations: {
                snapshot: { ...input.observations.snapshot },
                change: { ...input.observations.change, artifacts: changedArtifacts },
                artifacts,
                evidenceRuns: evidenceRuns as EvidenceRunObservation[],
                completeness: sourceCompleteness,
            },
            areas: normalizedAreas,
            memberships,
            relationships,
            boundaries,
            evidenceAttributions,
            evidenceExpectations,
            completeness,
        },
        issues,
    };
}
