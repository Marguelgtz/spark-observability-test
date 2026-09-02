export interface RepositoryChangeFixture {
    id: string;
    repository: string;
    category: 'localized' | 'cross-area' | 'automation' | 'boundary';
    source: {
        kind: 'commit' | 'pull-request';
        revision: string;
        url?: string;
    };
    files: ReadonlyArray<{
        path: string;
        status: 'added' | 'modified' | 'deleted';
    }>;
}

export const repositoryChangeFixtures = [
    {
        id: 'spark-localized-favorite-scope',
        repository: 'spark-opp/spark',
        category: 'localized',
        source: { kind: 'commit', revision: 'd2056aec9d52ae63a4b07c8644c43d4f45fbce1f' },
        files: [
            { path: 'apps/api/src/dashboard-favorites.ts', status: 'modified' },
            { path: 'apps/api/test/dashboard-favorites.test.ts', status: 'modified' },
        ],
    },
    {
        id: 'spark-cross-area-trajectory-feedback',
        repository: 'spark-opp/spark',
        category: 'cross-area',
        source: { kind: 'commit', revision: '551e7efd4fa54b4518ee21e2331d9756804bdcbb' },
        files: [
            { path: 'README.md', status: 'modified' },
            { path: 'apps/api/migrations/0008_trajectory_feedback.sql', status: 'added' },
            { path: 'apps/api/src/app.ts', status: 'modified' },
            { path: 'apps/api/src/dashboard-feedback.ts', status: 'added' },
            { path: 'apps/api/src/pages.ts', status: 'modified' },
            { path: 'apps/api/test/dashboard-api.test.ts', status: 'modified' },
            { path: 'apps/api/test/dashboard-feedback.test.ts', status: 'added' },
            { path: 'apps/web/e2e/dashboard.e2e.ts', status: 'modified' },
            { path: 'apps/web/src/api.ts', status: 'modified' },
            { path: 'apps/web/src/main.ts', status: 'modified' },
            { path: 'apps/web/src/pr-ui.ts', status: 'modified' },
            { path: 'apps/web/src/pr.css', status: 'modified' },
            { path: 'apps/web/test/api.test.ts', status: 'modified' },
            { path: 'docs/CHANGE_TRAJECTORY_PHASE3.md', status: 'modified' },
            { path: 'packages/dashboard-contracts/src/index.ts', status: 'modified' },
        ],
    },
    {
        id: 'spark-automation-frozen-lockfile',
        repository: 'spark-opp/spark',
        category: 'automation',
        source: { kind: 'commit', revision: '87a625d691481503be12ebb11525cc7d74eda658' },
        files: [{ path: '.github/workflows/dashboard-phase1.yml', status: 'modified' }],
    },
    {
        id: 'spark-boundary-change-trajectory',
        repository: 'spark-opp/spark',
        category: 'boundary',
        source: { kind: 'commit', revision: '7d7611d508964407fa77bfdf1e57105ab13e81d9' },
        files: [
            { path: 'README.md', status: 'modified' },
            { path: 'apps/api/src/app.ts', status: 'modified' },
            { path: 'apps/api/src/change-trajectory.ts', status: 'added' },
            { path: 'apps/api/src/dashboard-reader.ts', status: 'modified' },
            { path: 'apps/api/test/change-trajectory.test.ts', status: 'added' },
            { path: 'apps/api/test/dashboard-api.test.ts', status: 'modified' },
            { path: 'apps/web/e2e/dashboard.e2e.ts', status: 'modified' },
            { path: 'apps/web/src/api.ts', status: 'modified' },
            { path: 'apps/web/src/fixtures.ts', status: 'modified' },
            { path: 'apps/web/src/main.ts', status: 'modified' },
            { path: 'apps/web/src/pr-ui.ts', status: 'modified' },
            { path: 'apps/web/src/pr.css', status: 'modified' },
            { path: 'apps/web/test/api.test.ts', status: 'modified' },
            { path: 'docs/CHANGE_TRAJECTORY_PHASE2.md', status: 'added' },
            { path: 'packages/dashboard-contracts/src/index.ts', status: 'modified' },
        ],
    },
    {
        id: 'stint-localized-vast-endpoint',
        repository: 'Marguelgtz/Stint',
        category: 'localized',
        source: {
            kind: 'pull-request',
            revision: 'bbfd959c03a0a64aebc6e3273c9fbb8210be0168',
            url: 'https://github.com/Marguelgtz/Stint/pull/21',
        },
        files: [
            { path: 'internal/provider/vast/instance.go', status: 'modified' },
            { path: 'internal/provider/vast/instance_test.go', status: 'modified' },
        ],
    },
    {
        id: 'stint-cross-area-ninfer-runtime',
        repository: 'Marguelgtz/Stint',
        category: 'cross-area',
        source: {
            kind: 'pull-request',
            revision: 'e858838f347e8f14065fc3cb3f1f9eb2afdaf1aa',
            url: 'https://github.com/Marguelgtz/Stint/pull/13',
        },
        files: [
            { path: 'cmd/stint/resumable_start.go', status: 'modified' },
            { path: 'cmd/stint/resume.go', status: 'modified' },
            { path: 'cmd/stint/runtime.go', status: 'added' },
            { path: 'cmd/stint/runtime_context.go', status: 'added' },
            { path: 'cmd/stint/runtime_test.go', status: 'added' },
            { path: 'internal/session/state.go', status: 'modified' },
        ],
    },
    {
        id: 'stint-release-entrypoint',
        repository: 'Marguelgtz/Stint',
        category: 'automation',
        source: {
            kind: 'pull-request',
            revision: '71d52271cebc313478c8a34d2b7d4b3ae690f795',
            url: 'https://github.com/Marguelgtz/Stint/pull/10',
        },
        files: [{ path: 'cmd/stint/main.go', status: 'modified' }],
    },
    {
        id: 'stint-boundary-vast-lifecycle',
        repository: 'Marguelgtz/Stint',
        category: 'boundary',
        source: {
            kind: 'pull-request',
            revision: '4bca611c94d143bd9752a6d423bb9191195cdb94',
            url: 'https://github.com/Marguelgtz/Stint/pull/4',
        },
        files: [
            { path: 'cmd/stint/lifecycle.go', status: 'added' },
            { path: 'cmd/stint/main.go', status: 'modified' },
            { path: 'internal/core/plan.go', status: 'modified' },
            { path: 'internal/core/plan_test.go', status: 'modified' },
            { path: 'internal/provider/vast/client_test.go', status: 'modified' },
            { path: 'internal/provider/vast/instance.go', status: 'added' },
            { path: 'internal/provider/vast/instance_test.go', status: 'added' },
            { path: 'internal/session/state.go', status: 'added' },
        ],
    },
] as const satisfies ReadonlyArray<RepositoryChangeFixture>;
