import { describe, expect, it } from 'vitest';
import { LEGACY_PROJECTION_LOSSES, projectRepositoryUnderstanding } from '../src/understanding-projector';
import { legacyInputAsUnderstanding } from './fixtures/legacy-understanding';

describe('repository understanding compatibility projector', () => {
    it('projects projects, labels, boundaries, evidence coverage, and completeness', () => {
        const understanding = legacyInputAsUnderstanding({
            change: {
                id: 'head',
                files: [
                    { path: 'packages/shared/index.ts', status: 'modified' },
                    { path: '.github/workflows/test.yml', status: 'modified' },
                ],
            },
            context: {
                projects: [
                    { name: 'apps/api', path: 'apps/api', dependencies: ['packages/shared'] },
                    { name: 'packages/shared', path: 'packages/shared', dependencies: [] },
                ],
            },
            evidence: [{
                name: 'verify', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed',
                coverage: ['packages/shared', 'Repository-wide'],
            }],
            analysis: { changedFiles: 'incomplete', repositoryContext: 'derived', notes: ['partial change list'] },
        });

        const projection = projectRepositoryUnderstanding(understanding);

        expect(projection.context.projects).toEqual([
            { name: 'apps/api', path: 'apps/api', dependencies: ['packages/shared'] },
            { name: 'packages/shared', path: 'packages/shared', dependencies: [] },
        ]);
        expect(projection.directAreas).toEqual(['CI/CD', 'packages/shared']);
        expect(projection.affectedAreas).toEqual(['Repository-wide', 'apps/api']);
        expect(projection.sensitiveSurfaces).toEqual(['CI/CD']);
        expect(projection.evidence).toEqual([{
            name: 'verify', kind: 'test', status: 'PASSED', source: 'github', knowledge: 'observed',
            coverage: ['Repository-wide', 'packages/shared'],
        }]);
        expect(projection.analysis).toEqual({
            changedFiles: 'incomplete', repositoryContext: 'derived', notes: ['partial change list'],
        });
        expect(projection.normalizationIssues).toEqual([]);
        expect(projection.losses).toBe(LEGACY_PROJECTION_LOSSES);
    });

    it('keeps duplicate evidence executions and reports unknown unattributed coverage', () => {
        const understanding = legacyInputAsUnderstanding({
            change: { id: 'head', files: [{ path: 'src/main.rs', status: 'modified' }] },
            context: { projects: [] },
            evidence: [
                { name: 'verify', kind: 'check-run', status: 'PENDING', source: 'ci', knowledge: 'observed', coverage: 'UNKNOWN' },
                { name: 'verify', kind: 'check-run', status: 'PASSED', source: 'ci', knowledge: 'observed', coverage: 'UNKNOWN' },
            ],
        });

        const projection = projectRepositoryUnderstanding(understanding);

        expect(projection.directAreas).toEqual(['Repository root']);
        expect(projection.evidence.map(item => [item.name, item.status, item.coverage])).toEqual([
            ['verify', 'PENDING', 'UNKNOWN'],
            ['verify', 'PASSED', 'UNKNOWN'],
        ]);
    });

    it('keeps prior-revision evidence historical instead of relabelling it for the current change', () => {
        const understanding = legacyInputAsUnderstanding({
            change: { id: 'head', files: [{ path: 'src/main.ts', status: 'modified' }] },
            context: { projects: [] },
            evidence: [{
                name: 'verify', kind: 'check-run', status: 'PASSED', source: 'ci', knowledge: 'observed', coverage: 'UNKNOWN',
            }],
        });
        understanding.observations.evidenceRuns[0].revision = 'prior-head';

        const projection = projectRepositoryUnderstanding(understanding);

        expect(understanding.observations.evidenceRuns).toHaveLength(1);
        expect(projection.evidence).toEqual([]);
    });

    it('projects missing evidence only from a supported expectation and complete acquisition', () => {
        const understanding = legacyInputAsUnderstanding({
            change: { id: 'head', files: [{ path: 'src/main.ts', status: 'modified' }] },
            context: { projects: [] },
            evidence: [],
        });
        understanding.observations.completeness.push({ source: 'github-check-runs', state: 'COMPLETE' });
        understanding.evidenceExpectations.push({
            id: 'expectation:verify',
            name: 'verify',
            target: { kind: 'CHANGE', changeId: understanding.observations.change.id },
            match: { evidenceName: 'verify', evidenceKind: 'github-check-run' },
            support: [{
                provenance: { kind: 'PROFILE', source: '.spark/profile.yml' },
                derivation: 'DECLARED', confidence: 'SUPPORTED', evidence: [], completeness: { state: 'COMPLETE' },
            }],
        });

        const projection = projectRepositoryUnderstanding(understanding);

        expect(projection.evidence).toEqual([{
            name: 'verify', kind: 'github-check-run', status: 'MISSING', source: '.spark/profile.yml',
            knowledge: 'inferred', coverage: ['Repository-wide'],
        }]);
    });

    it('does not invent missing evidence when check acquisition or rule support is incomplete', () => {
        const understanding = legacyInputAsUnderstanding({
            change: { id: 'head', files: [{ path: 'src/main.ts', status: 'modified' }] },
            context: { projects: [] },
            evidence: [],
        });
        understanding.observations.completeness.push({ source: 'github-check-runs', state: 'PARTIAL' });
        understanding.evidenceExpectations.push({
            id: 'expectation:verify', name: 'verify',
            target: { kind: 'CHANGE', changeId: understanding.observations.change.id },
            support: [{
                provenance: { kind: 'PROFILE', source: '.spark/profile.yml' },
                derivation: 'DECLARED', confidence: 'UNKNOWN', evidence: [], completeness: { state: 'PARTIAL' },
            }],
        });

        expect(projectRepositoryUnderstanding(understanding).evidence).toEqual([]);
    });
});
