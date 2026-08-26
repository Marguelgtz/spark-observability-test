import { AttentionLevel, Evidence, RepositoryContext } from './types';

interface AttentionInput {
    directAreas: string[];
    affectedAreas: string[];
    sensitiveSurfaces: string[];
    evidence: Evidence[];
    context: RepositoryContext;
}

export function evaluateAttention(input: AttentionInput): { level: AttentionLevel, reasons: string[] } {
    const reasons: string[] = [];
    let level: AttentionLevel = 'LOW';

    const escalate = (newLevel: AttentionLevel, reason: string) => {
        if (newLevel === 'HIGH') level = 'HIGH';
        else if (newLevel === 'MEDIUM' && level !== 'HIGH') level = 'MEDIUM';
        reasons.push(reason);
    };

    // Rule 1: Failed Evidence
    if (input.evidence.some(e => e.status === 'FAILED')) {
        escalate('HIGH', 'Critical evidence failed');
    }

    // Rule 2: Multiple boundaries crossed with critical infra
    const criticalSurfaces = ['CI/CD', 'deployment', 'infrastructure', 'database migration', 'auth/security'];
    const hasCriticalInfra = input.sensitiveSurfaces.some(s => criticalSurfaces.includes(s));
    if (input.directAreas.length >= 2 && hasCriticalInfra) {
        escalate('HIGH', 'Multiple boundaries crossed; sensitive infrastructure touched');
    }

    // Rule 3: Sensitive Surfaces
    for (const surface of input.sensitiveSurfaces) {
        if (criticalSurfaces.includes(surface)) {
            escalate('HIGH', `Sensitive surface touched: ${surface}`);
        }
        if (surface === 'dependency manifest') {
            escalate('MEDIUM', 'Dependency manifest changed');
        }
        if (surface === 'shared contract') {
            escalate('MEDIUM', 'Shared contract changed');
        }
    }

    // Rule 4: Shared Dependencies & Fan-out
    if (input.affectedAreas.length >= 50) {
        escalate('HIGH', 'Massive downstream fan-out');
    } else if (input.affectedAreas.length > 0) {
        escalate('MEDIUM', 'Downstream projects affected');
    }

    // Rule 5: Missing expected evidence
    const explicitlyCoveredAreas = new Set<string>();
    let hasUnknownCoverage = false;

    for (const e of input.evidence) {
        if (Array.isArray(e.coverage)) {
            for (const area of e.coverage) {
                explicitlyCoveredAreas.add(area);
            }
        } else if (e.coverage === 'UNKNOWN' || e.coverage === undefined) {
            hasUnknownCoverage = true;
        }
    }

    const hasUncoveredAffectedAreas = input.affectedAreas.some(area => !explicitlyCoveredAreas.has(area) && area !== 'Repository-wide');

    if (hasUncoveredAffectedAreas) {
        if (hasUnknownCoverage || input.evidence.length === 0) {
            escalate('HIGH', 'Evidence coverage is unknown or incomplete for affected project');
        } else {
            escalate('HIGH', 'Expected evidence explicitly missing for affected area');
        }
    } else if (input.evidence.some(e => e.status === 'PENDING')) {
        escalate('MEDIUM', 'Evidence is missing or currently pending');
    } else if (input.evidence.length === 0) {
        escalate('MEDIUM', 'No verification evidence observed for this change');
    }

    // Rule 6: Structural Uncertainty
    if (input.directAreas.includes('Repository root') && input.context.projects.length === 0) {
        escalate('MEDIUM', 'Structural uncertainty; repository topology could not be deeply analyzed');
    }

    if (input.directAreas.includes('Unmapped area')) {
        escalate('MEDIUM', 'Structural uncertainty; unmapped files outside known projects');
    }

    if (reasons.length === 0) {
        reasons.push('Routine localized change with passing evidence');
    }

    return { level, reasons: Array.from(new Set(reasons)) }; // Deduplicate
}
