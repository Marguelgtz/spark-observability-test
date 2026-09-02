import { detectSensitiveSurfaces } from '../../src/surfaces';
import type {
    Area,
    Boundary,
    BoundaryKind,
    ClaimSupport,
    RepositoryUnderstanding,
} from '../../src/understanding';
import type { KnowledgeClass, SparkInput } from '../../src/types';

function processState(status: SparkInput['evidence'][number]['status']) {
    if (status === 'PENDING') return { lifecycle: 'RUNNING' as const, outcome: 'UNKNOWN' as const };
    if (status === 'PASSED') return { lifecycle: 'COMPLETED' as const, outcome: 'PASSED' as const };
    if (status === 'FAILED') return { lifecycle: 'COMPLETED' as const, outcome: 'FAILED' as const };
    if (status === 'MISSING') return { lifecycle: 'NOT_OBSERVED' as const, outcome: 'UNKNOWN' as const };
    return { lifecycle: 'COMPLETED' as const, outcome: 'UNKNOWN' as const };
}

function support(knowledge: KnowledgeClass = 'derived'): ClaimSupport {
    return {
        provenance: { kind: 'ECOSYSTEM_ADAPTER', source: 'legacy-test-bridge' },
        derivation: knowledge === 'derived' || knowledge === 'observed' ? 'DETERMINISTIC' : 'HEURISTIC',
        confidence: knowledge === 'unknown' ? 'UNKNOWN' : 'SUPPORTED',
        evidence: [],
        completeness: { state: knowledge === 'unknown' ? 'UNAVAILABLE' : 'COMPLETE' },
    };
}

function boundaryKind(label: string): BoundaryKind {
    if (label === 'CI/CD') return 'CI';
    if (label === 'dependency manifest') return 'DEPENDENCY';
    if (label === 'deployment') return 'DEPLOYMENT';
    if (label === 'database migration') return 'MIGRATION';
    if (label === 'auth/security') return 'SECURITY';
    if (label === 'shared contract') return 'PUBLIC_INTERFACE';
    return { extension: label.toUpperCase().replace(/[^A-Z0-9]+/g, '_') };
}

export function legacyInputAsUnderstanding(input: SparkInput): RepositoryUnderstanding {
    const artifacts = input.change.files.map((file, index) => ({
        kind: 'artifact' as const,
        id: `artifact:${String(index).padStart(4, '0')}:${file.path}`,
        repositoryId: 'repository:test',
        revision: input.change.id,
        path: file.path,
        artifactKind: 'FILE' as const,
        source: { kind: 'vcs' },
    }));
    const areas: Area[] = input.context.projects.map((project, index) => ({
        id: `area:${String(index).padStart(4, '0')}:${project.name}`,
        label: project.name,
        roles: ['PROJECT'],
        support: [support(input.analysis?.repositoryContext ?? 'derived')],
    }));
    const areaByLabel = new Map(areas.map(area => [area.label, area]));
    const memberships = input.context.projects.map((project, index) => ({
        id: `membership:${String(index).padStart(4, '0')}`,
        areaId: areas[index].id,
        target: { kind: 'PATH' as const, path: project.path },
        view: 'legacy-project',
        support: [support(input.analysis?.repositoryContext ?? 'derived')],
    }));
    const relationships = input.context.projects.flatMap((project, projectIndex) => project.dependencies.flatMap((dependency, dependencyIndex) => {
        const target = areaByLabel.get(dependency);
        if (!target) return [];
        return [{
            id: `relationship:${String(projectIndex).padStart(4, '0')}:${String(dependencyIndex).padStart(4, '0')}`,
            sourceAreaId: areas[projectIndex].id,
            targetAreaId: target.id,
            type: 'DEPENDS_ON' as const,
            support: [support()],
        }];
    }));
    const boundaries: Boundary[] = artifacts.flatMap((artifact, artifactIndex) => detectSensitiveSurfaces(artifact.path).map((label, labelIndex) => ({
        id: `boundary:${String(artifactIndex).padStart(4, '0')}:${String(labelIndex).padStart(4, '0')}`,
        kind: boundaryKind(label),
        label,
        artifactIds: [artifact.id],
        connectedAreaIds: [],
        support: [support()],
    })));

    const detachedCoverageAreas = new Map<string, Area>();
    for (const evidence of input.evidence) {
        if (!Array.isArray(evidence.coverage)) continue;
        for (const label of evidence.coverage) {
            const hasArea = areaByLabel.has(label);
            const hasBoundary = boundaries.some(boundary => boundary.label === label);
            if (!hasArea && !hasBoundary && label !== 'Repository-wide' && !detachedCoverageAreas.has(label)) {
                detachedCoverageAreas.set(label, {
                    id: `area:legacy-coverage:${label}`,
                    label,
                    roles: ['OWNERSHIP'],
                    support: [support('inferred')],
                });
            }
        }
    }
    areas.push(...detachedCoverageAreas.values());

    const evidenceRuns = input.evidence.map((evidence, index) => ({
        kind: 'evidence-run' as const,
        id: `run:${String(index).padStart(4, '0')}`,
        repositoryId: 'repository:test',
        revision: input.change.id,
        name: evidence.name,
        evidenceKind: evidence.kind,
        ...processState(evidence.status),
        source: { kind: 'evidence-provider', id: evidence.source },
        ...(evidence.url ? { url: evidence.url } : {}),
    }));
    const evidenceAttributions = input.evidence.flatMap((evidence, evidenceIndex) => {
        if (!Array.isArray(evidence.coverage)) return [];
        return evidence.coverage.flatMap((label, coverageIndex) => {
            const area = areaByLabel.get(label) ?? detachedCoverageAreas.get(label);
            const boundary = boundaries.find(item => item.label === label);
            const target = area
                ? { kind: 'AREA' as const, areaId: area.id }
                : boundary
                    ? { kind: 'BOUNDARY' as const, boundaryId: boundary.id }
                    : label === 'Repository-wide'
                        ? { kind: 'CHANGE' as const, changeId: input.change.id }
                        : undefined;
            if (!target) return [];
            return [{
                id: `attribution:${String(evidenceIndex).padStart(4, '0')}:${String(coverageIndex).padStart(4, '0')}`,
                evidenceRunId: evidenceRuns[evidenceIndex].id,
                target,
                support: [support(evidence.knowledge)],
            }];
        });
    });
    const completeness = input.analysis ? [
        {
            id: 'completeness:repository-context',
            dimension: 'repository-context',
            state: input.analysis.repositoryContext === 'unknown' ? 'UNAVAILABLE' as const : 'COMPLETE' as const,
            support: [support(input.analysis.repositoryContext)],
        },
        ...input.analysis.notes.map((note, index) => ({
            id: `completeness:note:${String(index).padStart(4, '0')}`,
            dimension: `legacy-note:${index}`,
            state: 'COMPLETE' as const,
            reason: note,
            support: [support(input.analysis!.repositoryContext)],
        })),
    ] : [];

    return {
        observations: {
            snapshot: {
                kind: 'repository-snapshot', id: `snapshot:${input.change.id}`, repositoryId: 'repository:test',
                revision: input.change.id, source: { kind: 'vcs' },
            },
            change: {
                kind: 'change', id: input.change.id, repositoryId: 'repository:test', baseRevision: 'base', headRevision: input.change.id,
                artifacts: artifacts.map((artifact, index) => ({
                    artifactId: artifact.id,
                    status: input.change.files[index].status.toUpperCase() as 'ADDED' | 'MODIFIED' | 'DELETED',
                })),
                source: { kind: 'vcs' },
            },
            artifacts,
            pipelineDefinitions: [],
            pipelineRuns: [],
            pipelineAttempts: [],
            pipelineJobs: [],
            pipelineSteps: [],
            evidenceRuns,
            deployments: [],
            completeness: [{
                source: 'changed-files',
                state: input.analysis?.changedFiles === 'incomplete' ? 'PARTIAL' : 'COMPLETE',
            }],
        },
        areas,
        memberships,
        relationships,
        boundaries,
        evidenceAttributions,
        evidenceExpectations: [],
        completeness,
    };
}
