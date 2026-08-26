import { Project } from './types';

export function getDownstreamProjects(projectName: string, projects: Project[]): string[] {
    const downstream = new Set<string>();
    const visited = new Set<string>();

    function traverse(current: string) {
        if (visited.has(current)) return;
        visited.add(current);

        for (const p of projects) {
            if (p.dependencies.includes(current)) {
                downstream.add(p.name);
                traverse(p.name);
            }
        }
    }

    traverse(projectName);
    return Array.from(downstream).sort();
}
