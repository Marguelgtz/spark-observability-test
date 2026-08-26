import { SparkInput, SparkEvaluation } from './types';
import { detectSensitiveSurfaces } from './surfaces';
import { getDownstreamProjects } from './graph';
import { evaluateAttention } from './attention';

export function evaluateChange(input: SparkInput): SparkEvaluation {
    const { change, context, evidence, analysis } = input;

    if (change.files.length === 0) {
        return {
            changeId: change.id,
            attention: 'LOW',
            reasons: ['No changed files observed'],
            directAreas: [],
            affectedAreas: [],
            sensitiveSurfaces: [],
            evidence,
            analysis
        };
    }

    // 1. Direct Areas
    const directAreasSet = new Set<string>();

    // Sort projects by path length descending for longest-prefix match
    const sortedProjects = [...context.projects].sort((a, b) => b.path.length - a.path.length);

    for (const file of change.files) {
        let matched = false;

        // Exact project match or subpath match (longest prefix wins)
        const project = sortedProjects.find(p => file.path === p.path || file.path.startsWith(p.path + '/'));

        if (project) {
            directAreasSet.add(project.name);
            matched = true;
        }

        // Generic fallback inferences
        if (file.path.includes('.github/workflows/')) {
            directAreasSet.add('CI/CD');
            matched = true;
        }
        if (file.path.includes('k8s/') || file.path.includes('kubernetes/') || file.path.includes('deployment.yaml')) {
            directAreasSet.add('Infrastructure');
            matched = true;
        }
        if (file.path.endsWith('package.json') || file.path.endsWith('pnpm-lock.yaml') || file.path.endsWith('package-lock.json') || file.path.endsWith('yarn.lock')) {
            directAreasSet.add('Dependency Management');
            matched = true;
        }

        if (!matched && context.projects.length === 0) {
            directAreasSet.add('Repository root');
        } else if (!matched && context.projects.length > 0) {
            directAreasSet.add('Unmapped area');
        }
    }

    const directAreas = Array.from(directAreasSet).sort();

    // 2. Affected Areas (Downstream)
    const affectedAreasSet = new Set<string>();
    for (const area of directAreas) {
        const downstream = getDownstreamProjects(area, context.projects);
        for (const d of downstream) {
            if (!directAreasSet.has(d)) {
                affectedAreasSet.add(d);
            }
        }
    }

    if ((directAreas.includes('CI/CD') || directAreas.includes('Dependency Management')) && context.projects.length > 0) {
        affectedAreasSet.add('Repository-wide');
    }

    const affectedAreas = Array.from(affectedAreasSet).sort();

    // 3. Sensitive Surfaces
    const sensitiveSurfacesSet = new Set<string>();
    for (const file of change.files) {
        const surfaces = detectSensitiveSurfaces(file.path);
        for (const s of surfaces) {
            sensitiveSurfacesSet.add(s);
        }
    }

    if (affectedAreas.length >= 50) {
        sensitiveSurfacesSet.add('shared contract');
    }

    const sensitiveSurfaces = Array.from(sensitiveSurfacesSet).sort();

    // 4. Evaluate Attention
    const attentionResult = evaluateAttention({
        directAreas,
        affectedAreas,
        sensitiveSurfaces,
        evidence,
        context
    });

    if (analysis?.changedFiles === 'incomplete') {
        if (attentionResult.level === 'LOW') attentionResult.level = 'MEDIUM';
        attentionResult.reasons.push('Changed-file analysis is incomplete');
    }

    return {
        changeId: change.id,
        attention: attentionResult.level,
        reasons: attentionResult.reasons,
        directAreas,
        affectedAreas,
        sensitiveSurfaces,
        evidence,
        analysis,
    };
}
