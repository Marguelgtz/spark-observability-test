import { evaluateAttention } from './attention';
import { normalizeRepositoryUnderstanding, type UnderstandingNormalizationIssue } from './understanding-normalize';
import type {
    Area,
    AreaMembership,
    Boundary,
    ClaimSupport,
    ProcessLifecycle,
    ProcessOutcome,
    RepositoryUnderstanding,
    UnderstandingTarget,
} from './understanding';
import type {
    AnalysisCompleteness,
    Change,
    Evidence,
    EvidenceStatus,
    KnowledgeClass,
    Project,
    RepositoryContext,
    SparkEvaluation,
} from './types';

export const LEGACY_PROJECTION_LOSSES = [
    'Only one longest-path project membership is selected for each changed artifact.',
    'Overlapping views, area roles, hierarchy, stable IDs, and claim support are omitted from legacy labels.',
    'Only depends-on relationships are retained by the legacy project graph.',
    'Boundary-to-area and boundary-to-artifact links are collapsed into sensitive-surface labels.',
    'Evidence attribution rationale is collapsed into area-name coverage.',
    'Process lifecycle and outcome are collapsed into one legacy evidence status.',
    'Per-source and per-dimension completeness is compressed into one legacy analysis summary.',
] as const;

export interface LegacyCompatibilityProjection {
    change: Change;
    context: RepositoryContext;
    directAreas: string[];
    affectedAreas: string[];
    sensitiveSurfaces: string[];
    evidence: Evidence[];
    analysis?: AnalysisCompleteness;
    losses: readonly string[];
    normalizationIssues: UnderstandingNormalizationIssue[];
}

function valueName(value: string | { extension: string }): string {
    return typeof value === 'string' ? value : value.extension;
}

export function projectProcessState(lifecycle: ProcessLifecycle, outcome: ProcessOutcome): EvidenceStatus {
    if (lifecycle === 'EXPECTED' || lifecycle === 'NOT_OBSERVED') return 'MISSING';
    if (lifecycle === 'QUEUED' || lifecycle === 'RUNNING') return 'PENDING';
    if (lifecycle === 'CANCELLED' || lifecycle === 'UNKNOWN') return 'UNKNOWN';
    if (outcome === 'PASSED') return 'PASSED';
    if (outcome === 'FAILED') return 'FAILED';
    return 'UNKNOWN';
}

function hasRole(area: Area, role: string): boolean {
    return area.roles.some(value => valueName(value) === role);
}

function pathMatches(path: string, prefix: string): boolean {
    if (prefix === '') return true;
    return path === prefix || path.startsWith(`${prefix}/`);
}

function membershipMatchLength(membership: AreaMembership, artifactId: string, path: string): number | undefined {
    if (membership.target.kind === 'ARTIFACT') return membership.target.artifactId === artifactId ? Number.MAX_SAFE_INTEGER : undefined;
    return pathMatches(path, membership.target.path) ? membership.target.path.length : undefined;
}

function boundaryKind(boundary: Boundary): string {
    return valueName(boundary.kind);
}

function directBoundaryLabel(boundary: Boundary): string | undefined {
    const kind = boundaryKind(boundary);
    if (kind === 'CI') return 'CI/CD';
    if (kind === 'DEPENDENCY') return 'Dependency Management';
    if (kind === 'DEPLOYMENT' && boundary.label === 'deployment') return 'Infrastructure';
    return undefined;
}

function boundaryTouches(boundary: Boundary, artifactId: string): boolean {
    return boundary.artifactIds.includes(artifactId);
}

function projectProjects(
    areas: readonly Area[],
    memberships: readonly AreaMembership[],
    relationships: RepositoryUnderstanding['relationships'],
): Project[] {
    const projectAreas = areas.filter(area => hasRole(area, 'PROJECT'));
    const retainedByLabel = new Map<string, Area>();
    for (const area of projectAreas) {
        if (!retainedByLabel.has(area.label)) retainedByLabel.set(area.label, area);
    }
    const retainedIds = new Set([...retainedByLabel.values()].map(area => area.id));
    const labels = new Map([...retainedByLabel.values()].map(area => [area.id, area.label]));

    return [...retainedByLabel.values()].map(area => {
        const paths = memberships
            .filter(item => item.areaId === area.id && item.target.kind === 'PATH')
            .map(item => item.target.kind === 'PATH' ? item.target.path : '')
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right));
        const dependencies = relationships
            .filter(item => item.sourceAreaId === area.id && valueName(item.type) === 'DEPENDS_ON' && retainedIds.has(item.targetAreaId))
            .map(item => labels.get(item.targetAreaId))
            .filter((label): label is string => Boolean(label));
        return { name: area.label, path: paths[0] ?? area.label, dependencies: [...new Set(dependencies)].sort() };
    }).sort((left, right) => left.name.localeCompare(right.name));
}

function downstreamAreaIds(directAreaIds: ReadonlySet<string>, understanding: RepositoryUnderstanding): Set<string> {
    const affected = new Set<string>();
    const visited = new Set<string>();
    const queue = [...directAreaIds];
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const relationship of understanding.relationships) {
            if (valueName(relationship.type) !== 'DEPENDS_ON' || relationship.targetAreaId !== current) continue;
            if (!directAreaIds.has(relationship.sourceAreaId)) affected.add(relationship.sourceAreaId);
            queue.push(relationship.sourceAreaId);
        }
    }
    return affected;
}

function knowledgeFromSupport(support: readonly ClaimSupport[]): KnowledgeClass {
    if (support.length === 0 || support.every(item => item.confidence === 'UNKNOWN')) return 'unknown';
    if (support.some(item => item.provenance.kind === 'PROVIDER' && item.derivation === 'DETERMINISTIC')) return 'observed';
    if (support.some(item => item.derivation === 'DETERMINISTIC')) return 'derived';
    return 'inferred';
}

function labelsForTarget(target: UnderstandingTarget, understanding: RepositoryUnderstanding): string[] {
    const areaLabels = new Map(understanding.areas.map(area => [area.id, area.label]));
    if (target.kind === 'AREA') return [areaLabels.get(target.areaId)].filter((label): label is string => Boolean(label));
    if (target.kind === 'BOUNDARY') {
        return understanding.boundaries.filter(item => item.id === target.boundaryId).map(item => item.label);
    }
    if (target.kind === 'RELATIONSHIP') {
        const relationship = understanding.relationships.find(item => item.id === target.relationshipId);
        if (!relationship) return [];
        return [areaLabels.get(relationship.sourceAreaId), areaLabels.get(relationship.targetAreaId)]
            .filter((label): label is string => Boolean(label));
    }
    if (target.kind === 'ARTIFACT') {
        return understanding.memberships
            .filter(item => item.target.kind === 'ARTIFACT' && item.target.artifactId === target.artifactId)
            .map(item => areaLabels.get(item.areaId))
            .filter((label): label is string => Boolean(label));
    }
    return ['Repository-wide'];
}

function projectAnalysis(understanding: RepositoryUnderstanding): AnalysisCompleteness | undefined {
    const changedFiles = understanding.observations.completeness.find(item => item.source === 'changed-files');
    const repositoryContext = understanding.completeness.find(item => item.dimension === 'repository-context');
    const notes = [...understanding.observations.completeness, ...understanding.completeness]
        .map(item => item.reason)
        .filter((reason): reason is string => Boolean(reason));
    const hasLimitation = understanding.observations.completeness.some(item => item.state !== 'COMPLETE')
        || understanding.completeness.some(item => item.state !== 'COMPLETE')
        || notes.length > 0;
    if (!hasLimitation) return undefined;
    return {
        changedFiles: changedFiles?.state === 'COMPLETE' ? 'complete' : 'incomplete',
        repositoryContext: repositoryContext
            ? knowledgeFromSupport(repositoryContext.support)
            : knowledgeFromSupport(understanding.areas.flatMap(area => area.support)),
        notes: [...new Set(notes)].sort((left, right) => left.localeCompare(right)),
    };
}

export function projectRepositoryUnderstanding(input: RepositoryUnderstanding): LegacyCompatibilityProjection {
    const normalized = normalizeRepositoryUnderstanding(input);
    const understanding = normalized.understanding;
    const areasById = new Map(understanding.areas.map(area => [area.id, area]));
    const projectAreaIds = new Set(understanding.areas.filter(area => hasRole(area, 'PROJECT')).map(area => area.id));
    const directAreaIds = new Set<string>();
    const directLabels = new Set<string>();
    const changedArtifacts = understanding.observations.change.artifacts
        .map(change => understanding.observations.artifacts.find(artifact => artifact.id === change.artifactId))
        .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact));

    for (const artifact of changedArtifacts) {
        const candidates = understanding.memberships.flatMap(membership => {
            const length = membershipMatchLength(membership, artifact.id, artifact.path);
            return length === undefined ? [] : [{ membership, length }];
        });
        const projectCandidates = candidates.filter(candidate => projectAreaIds.has(candidate.membership.areaId));
        const eligible = projectCandidates.length > 0
            ? projectCandidates
            : candidates.filter(candidate => {
                const area = areasById.get(candidate.membership.areaId);
                return area && !hasRole(area, 'OWNERSHIP');
            });
        const longest = eligible.reduce((maximum, candidate) => Math.max(maximum, candidate.length), -1);
        for (const candidate of eligible.filter(item => item.length === longest)) {
            const area = areasById.get(candidate.membership.areaId);
            if (area) {
                directAreaIds.add(area.id);
                directLabels.add(area.label);
            }
        }

        let matched = eligible.length > 0;
        for (const boundary of understanding.boundaries.filter(item => boundaryTouches(item, artifact.id))) {
            const label = directBoundaryLabel(boundary);
            if (label) {
                directLabels.add(label);
                matched = true;
            }
        }
        if (!matched) directLabels.add(projectAreaIds.size > 0 ? 'Unmapped area' : 'Repository root');
    }

    const affectedIds = downstreamAreaIds(directAreaIds, understanding);
    const affectedLabels = new Set([...affectedIds]
        .map(id => areasById.get(id)?.label)
        .filter((label): label is string => Boolean(label)));
    if (projectAreaIds.size > 0 && (directLabels.has('CI/CD') || directLabels.has('Dependency Management'))) {
        affectedLabels.add('Repository-wide');
    }

    const sensitiveSurfaces = new Set(understanding.boundaries
        .filter(boundary => boundary.artifactIds.some(id => changedArtifacts.some(artifact => artifact.id === id)))
        .map(boundary => boundary.label));
    if (affectedLabels.size >= 50) sensitiveSurfaces.add('shared contract');

    const evidence: Evidence[] = understanding.observations.evidenceRuns
        .filter(run => run.repositoryId === understanding.observations.change.repositoryId
            && run.revision === understanding.observations.change.headRevision)
        .map(run => {
        const coverage = understanding.evidenceAttributions
            .filter(attribution => attribution.evidenceRunId === run.id)
            .flatMap(attribution => labelsForTarget(attribution.target, understanding));
        return {
            name: run.name,
            kind: run.evidenceKind,
            status: projectProcessState(run.lifecycle, run.outcome),
            source: run.source.id ?? run.source.kind,
            knowledge: 'observed',
            coverage: coverage.length > 0 ? [...new Set(coverage)].sort() : 'UNKNOWN',
            ...(run.url ? { url: run.url } : {}),
        };
        });

    const analysis = projectAnalysis(understanding);
    return {
        change: {
            id: understanding.observations.change.id,
            files: understanding.observations.change.artifacts.flatMap(change => {
                const artifact = understanding.observations.artifacts.find(item => item.id === change.artifactId);
                if (!artifact) return [];
                return [{ path: artifact.path, status: change.status.toLowerCase() as Change['files'][number]['status'] }];
            }),
        },
        context: { projects: projectProjects(understanding.areas, understanding.memberships, understanding.relationships) },
        directAreas: [...directLabels].sort(),
        affectedAreas: [...affectedLabels].sort(),
        sensitiveSurfaces: [...sensitiveSurfaces].sort(),
        evidence,
        ...(analysis ? { analysis } : {}),
        losses: LEGACY_PROJECTION_LOSSES,
        normalizationIssues: normalized.issues,
    };
}

export function evaluateUnderstandingCompatibility(input: RepositoryUnderstanding): SparkEvaluation {
    const projection = projectRepositoryUnderstanding(input);
    if (projection.change.files.length === 0) {
        return {
            changeId: projection.change.id,
            attention: 'LOW',
            reasons: ['No changed files observed'],
            directAreas: [],
            affectedAreas: [],
            sensitiveSurfaces: [],
            evidence: projection.evidence,
            analysis: projection.analysis,
        };
    }
    const attention = evaluateAttention({
        directAreas: projection.directAreas,
        affectedAreas: projection.affectedAreas,
        sensitiveSurfaces: projection.sensitiveSurfaces,
        evidence: projection.evidence,
        context: projection.context,
    });
    if (projection.analysis?.changedFiles === 'incomplete') {
        if (attention.level === 'LOW') attention.level = 'MEDIUM';
        attention.reasons.push('Changed-file analysis is incomplete');
    }
    return {
        changeId: projection.change.id,
        attention: attention.level,
        reasons: attention.reasons,
        directAreas: projection.directAreas,
        affectedAreas: projection.affectedAreas,
        sensitiveSurfaces: projection.sensitiveSurfaces,
        evidence: projection.evidence,
        analysis: projection.analysis,
    };
}
