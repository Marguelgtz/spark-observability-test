import type { Project } from '@spark/core';
import type { GitHubApiClient } from './client';
import type { RepositoryContextResult } from './types';

interface PackageManifest {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function workspacePatterns(root: PackageManifest | undefined, pnpmWorkspace: string | undefined): string[] {
  const patterns = Array.isArray(root?.workspaces) ? root.workspaces : root?.workspaces?.packages ?? [];
  if (!pnpmWorkspace) return patterns;
  const yamlPatterns = [...pnpmWorkspace.matchAll(/^\s*-\s*['"]?([^'"#\n]+)['"]?\s*$/gm)].map(match => match[1].trim());
  return [...new Set([...patterns, ...yamlPatterns])];
}

function globMatches(path: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '___DOUBLE___').replace(/\*/g, '[^/]+').replace(/___DOUBLE___/g, '.+');
  return new RegExp(`^${escaped}$`).test(path);
}

function parseManifest(text: string | undefined): PackageManifest | undefined {
  if (!text) return undefined;
  try { return JSON.parse(text) as PackageManifest; } catch { return undefined; }
}

export async function resolveRepositoryContext(client: GitHubApiClient, owner: string, repo: string, sha: string): Promise<RepositoryContextResult> {
  const [tree, rootText, pnpmWorkspace] = await Promise.all([
    client.getTree(owner, repo, sha),
    client.getTextFile(owner, repo, 'package.json', sha),
    client.getTextFile(owner, repo, 'pnpm-workspace.yaml', sha),
  ]);
  const root = parseManifest(rootText);
  const patterns = workspacePatterns(root, pnpmWorkspace);
  if (patterns.length === 0) {
    return { projects: [], knowledge: 'unknown', notes: ['No supported JS/TS workspace metadata was observed'] };
  }
  if (!tree.complete) {
    return { projects: [], knowledge: 'unknown', notes: ['GitHub returned a truncated repository tree; project relationships were not derived'] };
  }
  const packagePaths = tree.paths
    .filter(path => path.endsWith('/package.json'))
    .map(path => path.slice(0, -'/package.json'.length))
    .filter(path => patterns.some(pattern => globMatches(path, pattern)))
    .sort();
  if (packagePaths.length > 100) {
    return { projects: [], knowledge: 'unknown', notes: [`Workspace contains ${packagePaths.length} packages; V0 limits project resolution to 100`] };
  }
  const manifests = await Promise.all(packagePaths.map(path => client.getTextFile(owner, repo, `${path}/package.json`, sha).then(parseManifest)));
  const namesToPaths = new Map<string, string>();
  manifests.forEach((manifest, index) => { if (manifest?.name) namesToPaths.set(manifest.name, packagePaths[index]); });
  const projects: Project[] = manifests.flatMap((manifest, index) => {
    if (!manifest) return [];
    const dependencyNames = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    });
    return [{
      name: packagePaths[index],
      path: packagePaths[index],
      dependencies: dependencyNames.map(name => namesToPaths.get(name)).filter((path): path is string => Boolean(path)),
    }];
  });
  if (projects.length === 0) return { projects: [], knowledge: 'unknown', notes: ['Workspace metadata existed but no workspace package manifests could be resolved'] };
  return { projects, knowledge: 'derived', notes: ['Project relationships derived from observed JS/TS workspace manifests'] };
}
