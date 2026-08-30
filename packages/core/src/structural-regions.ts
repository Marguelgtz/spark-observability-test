import type { ArtifactObservation } from './understanding';
import type { RepositoryAnalyzer } from './analyzers';

export interface StructuralRegionCandidate {
    path: string;
    label: string;
    artifactIds: string[];
}

const groupedRoots = new Set(['apps', 'packages', 'services', 'modules', 'components', 'plugins']);
const sourceRoots = new Set(['src', 'lib']);
const suiteRoots = new Set(['test', 'tests']);

function directorySegments(path: string): string[] {
    const parts = path.split('/').filter(Boolean);
    return parts.slice(0, Math.max(0, parts.length - 1));
}

function candidatePath(path: string, snapshotPaths: ReadonlySet<string>): string {
    const directories = directorySegments(path);
    if (directories.length === 0) return '';
    const [root, second, third] = directories;

    if (groupedRoots.has(root) && second) return `${root}/${second}`;
    if (root === 'internal' && second) return third ? `${root}/${second}/${third}` : `${root}/${second}`;
    if ((root === 'cmd' || suiteRoots.has(root)) && second) return `${root}/${second}`;
    if (sourceRoots.has(root)) return root;

    const rootIsPackage = snapshotPaths.has(`${root}/__init__.py`);
    if (rootIsPackage && second) return `${root}/${second}`;
    return '';
}

export function resolveStructuralRegions(
    changedArtifacts: readonly ArtifactObservation[],
    snapshotArtifacts: readonly ArtifactObservation[],
): StructuralRegionCandidate[] {
    const snapshotPaths = new Set(snapshotArtifacts.map(artifact => artifact.path));
    const regions = new Map<string, Set<string>>();
    for (const artifact of changedArtifacts) {
        const path = candidatePath(artifact.path, snapshotPaths);
        const artifactIds = regions.get(path) ?? new Set<string>();
        artifactIds.add(artifact.id);
        regions.set(path, artifactIds);
    }
    return [...regions.entries()]
        .map(([path, artifactIds]) => ({
            path,
            label: path || 'Repository',
            artifactIds: [...artifactIds].sort((left, right) => left.localeCompare(right)),
        }))
        .sort((left, right) => left.path.localeCompare(right.path));
}

function stateRank(state: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'): number {
    return state === 'UNAVAILABLE' ? 2 : state === 'PARTIAL' ? 1 : 0;
}

export const genericStructuralAnalyzer: RepositoryAnalyzer = {
    id: 'generic-structure',
    version: '1',
    provenanceKind: 'GENERIC_ANALYZER',
    analyze(observations) {
        const changedIds = new Set(observations.change.artifacts.map(item => item.artifactId));
        const changedArtifacts = observations.artifacts.filter(artifact => changedIds.has(artifact.id));
        const regions = resolveStructuralRegions(changedArtifacts, observations.artifacts);
        const relevantCompleteness = observations.completeness.filter(item =>
            item.source === 'repository-tree' || item.source === 'changed-files');
        const state = relevantCompleteness.reduce<'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'>((current, item) =>
            stateRank(item.state) > stateRank(current) ? item.state : current, 'COMPLETE');
        const reasons = relevantCompleteness.map(item => item.reason).filter((reason): reason is string => Boolean(reason));
        const completeness = { state, ...(reasons.length > 0 ? { reason: [...new Set(reasons)].sort().join('; ') } : {}) };

        const claims = regions.map(region => {
            const regionId = region.path || 'repository';
            const support = [{
                provenance: { kind: 'GENERIC_ANALYZER' as const, source: 'generic-structure', version: '1' },
                derivation: 'HEURISTIC' as const,
                confidence: state === 'UNAVAILABLE' ? 'UNKNOWN' as const : 'TENTATIVE' as const,
                evidence: region.artifactIds.map(id => ({ kind: 'ARTIFACT' as const, id })),
                completeness,
            }];
            return {
                area: {
                    id: `area:structural:${regionId}`,
                    label: region.label,
                    roles: ['STRUCTURAL' as const],
                    support,
                },
                membership: {
                    id: `membership:structural:${regionId}`,
                    areaId: `area:structural:${regionId}`,
                    target: { kind: 'PATH' as const, path: region.path },
                    view: 'structural',
                    support,
                },
            };
        });

        return {
            areas: claims.map(claim => claim.area),
            memberships: claims.map(claim => claim.membership),
            completeness: [{
                id: 'completeness:analyzer:generic-structure',
                dimension: 'analyzer:generic-structure',
                state,
                ...(reasons.length > 0 ? { reason: [...new Set(reasons)].sort().join('; ') } : {}),
                support: [{
                    provenance: { kind: 'GENERIC_ANALYZER', source: 'generic-structure', version: '1' },
                    derivation: 'DETERMINISTIC',
                    confidence: state === 'UNAVAILABLE' ? 'UNKNOWN' : 'SUPPORTED',
                    evidence: changedArtifacts.map(artifact => ({ kind: 'ARTIFACT', id: artifact.id })),
                    completeness,
                }],
            }],
        };
    },
};
