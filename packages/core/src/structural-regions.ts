import type { ArtifactObservation } from './understanding';

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
