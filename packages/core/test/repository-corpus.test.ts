import { describe, expect, it } from 'vitest';
import { repositoryChangeFixtures } from './fixtures/repository-corpus';

describe('repository research corpus fixtures', () => {
    it('retains unique immutable source identities', () => {
        expect(new Set(repositoryChangeFixtures.map(fixture => fixture.id)).size).toBe(repositoryChangeFixtures.length);

        for (const fixture of repositoryChangeFixtures) {
            expect(fixture.source.revision).toMatch(/^[0-9a-f]{40}$/);
            expect(fixture.files.length).toBeGreaterThan(0);
        }
    });

    it('uses safe repository-relative changed paths', () => {
        for (const fixture of repositoryChangeFixtures) {
            for (const file of fixture.files) {
                expect(file.path).not.toMatch(/^\//);
                expect(file.path.split('/')).not.toContain('..');
            }
        }
    });

    it('records pull-request provenance for Stint cases', () => {
        const stintFixtures = repositoryChangeFixtures.filter(fixture => fixture.repository === 'Marguelgtz/Stint');

        expect(stintFixtures).toHaveLength(4);
        for (const fixture of stintFixtures) {
            expect(fixture.source.kind).toBe('pull-request');
            expect(fixture.source.url).toMatch(/^https:\/\/github\.com\/Marguelgtz\/Stint\/pull\/\d+$/);
        }
    });

    it('covers the four research categories in both repositories', () => {
        for (const repository of ['spark-opp/spark', 'Marguelgtz/Stint']) {
            const fixtures = repositoryChangeFixtures.filter(fixture => fixture.repository === repository);
            expect(fixtures.map(fixture => fixture.category).sort()).toEqual([
                'automation', 'boundary', 'cross-area', 'localized',
            ]);
        }
    });
});
