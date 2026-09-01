// CI-002 process characterization corpus (G0).
//
// R5: each scenario captures bounded GitHub provider responses plus the
// checked-in process declaration together with:
//   (a) `truth` — the provider-neutral interpretation a correct process model
//       concludes (the target; vocabulary promoted to core at CI-106); and
//   (b) `currentProjection` — what the existing flattened check-run ingestion
//       (`normalizeCheckRuns`) actually records (characterization of the defect).
//
// The corpus currently lives in the github package because the current projection
// is produced there; it is provider-neutral in shape and is intended to move to
// packages/core at CI-106 so both the CI and RU-3xx workstreams share it.
//
// GROUNDING: `sparkVerifyWorkflow` mirrors the real `.github/workflows/
// dashboard-worker-validation.yml` (a single `verify` job). Deployment/matrix/
// reusable scenarios use bounded synthetic shapes that preserve the identity
// relationships exposed by the GitHub REST API.

import type { ProcessLifecycle, ProcessOutcome } from '@spark/core';

/** The Spark App `id` used to recognize and exclude the neutral Spark Check. */
export const CI_CORPUS_SPARK_APP_ID = 42;

const SPARK_REPO = 'spark-opp/spark';

const sparkVerifyWorkflow: CiCorpusWorkflow = {
    path: '.github/workflows/dashboard-worker-validation.yml',
    name: 'Dashboard / Worker Verification',
    triggers: ['pull_request', 'workflow_dispatch'],
    pathFilters: [
        'apps/api/**',
        'apps/web/**',
        'packages/dashboard-contracts/**',
        'packages/github/**',
        'package.json',
        'pnpm-lock.yaml',
        '.github/workflows/dashboard-worker-validation.yml',
    ],
    jobs: [
        {
            id: 'verify',
            steps: [
                { uses: 'actions/checkout@v4' },
                { uses: 'pnpm/action-setup@v4' },
                { uses: 'actions/setup-node@v4' },
                { name: 'Install workspace', run: 'pnpm install --frozen-lockfile' },
                { name: 'Typecheck workspace', run: 'pnpm typecheck' },
                { name: 'Unit tests', run: 'pnpm test' },
                { name: 'Build production dashboard', run: 'pnpm web:build' },
                { name: 'Apply D1 migrations locally', run: 'pnpm db:migrate:local' },
                { name: 'Validate Worker and static assets bundle', run: 'pnpm --filter @spark/api exec wrangler deploy --dry-run --outdir /tmp/spark-worker' },
                { name: 'Install Playwright Chromium', run: 'pnpm --filter @spark/web exec playwright install --with-deps chromium' },
                { name: 'Browser acceptance', run: 'pnpm web:e2e' },
            ],
        },
    ],
};

// --- Provider (GitHub Actions) raw shapes --------------------------------------

export interface CiCorpusCheckRun {
    id: number;
    name: string;
    head_sha: string;
    status: string; // 'queued' | 'in_progress' | 'completed'
    conclusion: string | null; // 'success' | 'failure' | 'neutral' | 'skipped' | 'cancelled' | 'timed_out' | null
    check_suite?: { id: number };
    started_at?: string;
    completed_at?: string;
    details_url?: string;
    html_url?: string;
    app?: { id?: number; slug?: string; name?: string } | null;
}

export interface CiCorpusStep {
    number: number;
    name: string;
    status: string; // 'queued' | 'in_progress' | 'completed'
    conclusion: string | null;
}

export interface CiCorpusJob {
    id: number;
    run_id: number;
    run_attempt: number;
    name: string; // display name; matrix jobs embed their dimensions
    status: string;
    conclusion: string | null;
    started_at?: string;
    completed_at?: string;
    steps?: CiCorpusStep[];
}

export interface CiCorpusActionRun {
    id: number;
    check_suite_id: number;
    name: string; // workflow name
    head_sha: string;
    head_branch: string;
    event: string;
    status: string;
    conclusion: string | null;
    run_attempt: number;
    created_at?: string;
    updated_at?: string;
}

export interface CiCorpusCheckSuite {
    id: number;
    head_sha: string;
    app_slug?: string;
    status?: string;
    conclusion?: string | null;
}

export interface CiCorpusDeployment {
    id: number;
    sha: string;
    ref: string;
    environment: string;
    created_at?: string;
}

export interface CiCorpusDeploymentStatus {
    id: number;
    deployment_id: number;
    state: string; // 'pending' | 'in_progress' | 'success' | 'failure' | 'error'
    environment?: string;
    created_at?: string;
    updated_at?: string;
}

export interface CiCorpusPendingDeployment {
    environment: { id: number; name: string };
    wait_timer: number;
    reviewers: Array<{ type: 'User' | 'Team'; reviewer: { id: number; login?: string; name?: string } }>;
}

export interface CiCorpusWorkflowJob {
    id: string;
    name?: string;
    needs?: string[];
    matrix?: Record<string, string[]>;
    environment?: string;
    uses?: string;
    steps?: { name?: string; uses?: string; run?: string }[];
}

export interface CiCorpusWorkflow {
    path: string;
    name: string;
    triggers: string[];
    branchFilters?: string[];
    pathFilters?: string[];
    jobs: CiCorpusWorkflowJob[];
}

// --- Provider-neutral truth (target vocabulary; promoted to core at CI-106) ----

export type CiLifecycle = ProcessLifecycle;
export type CiOutcome = ProcessOutcome;
export type CiDomain = 'SETUP' | 'DEPENDENCY_INSTALL' | 'STATIC_ANALYSIS' | 'BUILD' | 'TEST' | 'INTEGRATION' | 'DEPLOYMENT' | 'UNKNOWN';

export interface CiTruthUnit {
    subject: string;
    lifecycle: CiLifecycle;
    outcome: CiOutcome;
    domain?: CiDomain;
    note?: string;
}

export interface CiCurrentProjectionItem {
    name: string;
    status: 'PENDING' | 'PASSED' | 'FAILED' | 'UNKNOWN';
}

export interface CiCorpusScenario {
    id: string;
    name: string;
    description: string;
    repository: string;
    revision: string;
    raw: {
        checkRuns: CiCorpusCheckRun[];
        checkSuites?: CiCorpusCheckSuite[];
        actionsRuns?: CiCorpusActionRun[];
        jobs?: CiCorpusJob[];
        deployment?: { deployment: CiCorpusDeployment; statuses: CiCorpusDeploymentStatus[] };
        pendingDeployments?: CiCorpusPendingDeployment[];
        workflow?: CiCorpusWorkflow;
        changedPaths?: string[];
        priorRevision?: { revision: string; checkRuns: CiCorpusCheckRun[] };
    };
    truth: CiTruthUnit[];
    currentProjection: CiCurrentProjectionItem[];
    /** Named loss/conflation classes this scenario demonstrates (Part III). */
    demonstrates: string[];
}

// --- Scenarios (G0 characterization corpus) ------------------------------------

const sc01_successful: CiCorpusScenario = {
    id: 'successful-workflow',
    name: 'Successful workflow',
    description: 'All verification for the revision completed green; nothing is pending, failed, skipped, or blocked.',
    repository: SPARK_REPO,
    revision: '0a1b2c3d4e5f',
    raw: {
        checkRuns: [
            { id: 9001, name: 'verify', head_sha: '0a1b2c3d4e5f', status: 'completed', conclusion: 'success', check_suite: { id: 70001 }, started_at: '2026-08-31T10:00:00Z', completed_at: '2026-08-31T10:06:00Z', html_url: 'https://github.com/spark-opp/spark/runs/9001' },
        ],
        workflow: sparkVerifyWorkflow,
        actionsRuns: [{
            id: 50001, check_suite_id: 70001, run_attempt: 1, name: 'Dashboard / Worker Verification', head_sha: '0a1b2c3d4e5f', head_branch: 'feature/x', event: 'pull_request', status: 'completed', conclusion: 'success',
        }],
        jobs: [{
                id: 9001, run_id: 50001, run_attempt: 1, name: 'verify', status: 'completed', conclusion: 'success', steps: [
                    { number: 1, name: 'Install workspace', status: 'completed', conclusion: 'success' },
                    { number: 2, name: 'Typecheck workspace', status: 'completed', conclusion: 'success' },
                    { number: 3, name: 'Unit tests', status: 'completed', conclusion: 'success' },
                    { number: 4, name: 'Build production dashboard', status: 'completed', conclusion: 'success' },
                    { number: 5, name: 'Browser acceptance', status: 'completed', conclusion: 'success' },
                ],
        }],
    },
    truth: [
        { subject: 'run:Dashboard / Worker Verification', lifecycle: 'COMPLETED', outcome: 'PASSED' },
        { subject: 'job:verify', lifecycle: 'COMPLETED', outcome: 'PASSED' },
        { subject: 'step:verify/Typecheck workspace', lifecycle: 'COMPLETED', outcome: 'PASSED', domain: 'STATIC_ANALYSIS' },
        { subject: 'step:verify/Unit tests', lifecycle: 'COMPLETED', outcome: 'PASSED', domain: 'TEST' },
    ],
    currentProjection: [{ name: 'verify', status: 'PASSED' }],
    demonstrates: ['execution-vs-coverage: the only thing Spark records is one PASSED "verify" check-run; it cannot say which steps ran or that they validated the changed area (coverage UNKNOWN).'],
};

const sc02_ciStartConfound: CiCorpusScenario = {
    id: 'ci-start-confound',
    name: 'CI-start confound (pending, not regression)',
    description: 'A new revision was pushed and its verification is freshly queued/running. This is normal CI startup, not a regression of the prior revision — but the current model records it as PENDING and, against the prior PASSED, reads as a regression.',
    repository: SPARK_REPO,
    revision: 'b2c3d4e5f6a7',
    raw: {
        checkRuns: [
            { id: 9010, name: 'verify', head_sha: 'b2c3d4e5f6a7', status: 'in_progress', conclusion: null, check_suite: { id: 70010 }, started_at: '2026-08-31T11:00:05Z', html_url: 'https://github.com/spark-opp/spark/runs/9010' },
        ],
        workflow: sparkVerifyWorkflow,
        priorRevision: {
            revision: 'a1b2c3d4e5f0',
            checkRuns: [{ id: 9001, name: 'verify', head_sha: 'a1b2c3d4e5f0', status: 'completed', conclusion: 'success', check_suite: { id: 70001 } }],
        },
    },
    truth: [
        { subject: 'run:verify@prior', lifecycle: 'COMPLETED', outcome: 'PASSED', note: 'revision a1b2c3 remains historically valid' },
        { subject: 'run:verify@current', lifecycle: 'RUNNING', outcome: 'UNKNOWN', note: 'new revision requires fresh verification; still executing, no defect' },
        { subject: 'job:verify@current', lifecycle: 'RUNNING', outcome: 'UNKNOWN' },
    ],
    currentProjection: [{ name: 'verify', status: 'PENDING' }],
    demonstrates: ['lifecycle-vs-outcome: RUNNING is collapsed to PENDING', 'stale-evidence: with no revision/attempt identity, prior PASSED vs current PENDING reads as a regression (the CI-003 confound).'],
};

const sc03_failedJob: CiCorpusScenario = {
    id: 'failed-job',
    name: 'Failed job (step detail lost)',
    description: 'The verify job failed during the unit-test step. The check-run says "verify failed" but not which step; the later steps never ran.',
    repository: SPARK_REPO,
    revision: 'c3d4e5f6a7b8',
    raw: {
        checkRuns: [
            { id: 9020, name: 'verify', head_sha: 'c3d4e5f6a7b8', status: 'completed', conclusion: 'failure', check_suite: { id: 70020 }, started_at: '2026-08-31T12:00:00Z', completed_at: '2026-08-31T12:04:00Z' },
        ],
        workflow: sparkVerifyWorkflow,
        actionsRuns: [{
            id: 50020, check_suite_id: 70020, run_attempt: 1, name: 'Dashboard / Worker Verification', head_sha: 'c3d4e5f6a7b8', head_branch: 'feature/y', event: 'pull_request', status: 'completed', conclusion: 'failure',
        }],
        jobs: [{
                id: 9020, run_id: 50020, run_attempt: 1, name: 'verify', status: 'completed', conclusion: 'failure', steps: [
                    { number: 1, name: 'Install workspace', status: 'completed', conclusion: 'success' },
                    { number: 2, name: 'Typecheck workspace', status: 'completed', conclusion: 'success' },
                    { number: 3, name: 'Unit tests', status: 'completed', conclusion: 'failure' },
                    { number: 4, name: 'Build production dashboard', status: 'completed', conclusion: 'skipped' },
                    { number: 5, name: 'Browser acceptance', status: 'completed', conclusion: 'skipped' },
                ],
        }],
    },
    truth: [
        { subject: 'run:Dashboard / Worker Verification', lifecycle: 'COMPLETED', outcome: 'FAILED' },
        { subject: 'job:verify', lifecycle: 'COMPLETED', outcome: 'FAILED' },
        { subject: 'step:verify/Unit tests', lifecycle: 'COMPLETED', outcome: 'FAILED', domain: 'TEST' },
        { subject: 'step:verify/Browser acceptance', lifecycle: 'COMPLETED', outcome: 'SKIPPED', note: 'GitHub observed a completed/skipped step record because an earlier step failed' },
    ],
    currentProjection: [{ name: 'verify', status: 'FAILED' }],
    demonstrates: ['failure-localization: the check-run cannot say which step failed; Spark cannot localize the failure to the unit-test step.'],
};

const sc04_failedSetupStep: CiCorpusScenario = {
    id: 'failed-setup-step',
    name: 'Failed setup/install step (before application tests)',
    description: 'The workspace install step failed, so typecheck/tests/build never ran. At the check-run level this is indistinguishable from a test failure.',
    repository: SPARK_REPO,
    revision: 'd4e5f6a7b8c9',
    raw: {
        checkRuns: [
            { id: 9030, name: 'verify', head_sha: 'd4e5f6a7b8c9', status: 'completed', conclusion: 'failure', check_suite: { id: 70030 }, started_at: '2026-08-31T13:00:00Z', completed_at: '2026-08-31T13:01:30Z' },
        ],
        workflow: sparkVerifyWorkflow,
        actionsRuns: [{
            id: 50030, check_suite_id: 70030, run_attempt: 1, name: 'Dashboard / Worker Verification', head_sha: 'd4e5f6a7b8c9', head_branch: 'feature/z', event: 'pull_request', status: 'completed', conclusion: 'failure',
        }],
        jobs: [{
                id: 9030, run_id: 50030, run_attempt: 1, name: 'verify', status: 'completed', conclusion: 'failure', steps: [
                    { number: 1, name: 'Install workspace', status: 'completed', conclusion: 'failure' },
                    { number: 2, name: 'Typecheck workspace', status: 'completed', conclusion: 'skipped' },
                    { number: 3, name: 'Unit tests', status: 'completed', conclusion: 'skipped' },
                    { number: 4, name: 'Build production dashboard', status: 'completed', conclusion: 'skipped' },
                    { number: 5, name: 'Browser acceptance', status: 'completed', conclusion: 'skipped' },
                ],
        }],
    },
    truth: [
        { subject: 'job:verify', lifecycle: 'COMPLETED', outcome: 'FAILED' },
        { subject: 'step:verify/Install workspace', lifecycle: 'COMPLETED', outcome: 'FAILED', domain: 'DEPENDENCY_INSTALL', note: 'failed before any application test ran' },
        { subject: 'step:verify/Unit tests', lifecycle: 'COMPLETED', outcome: 'SKIPPED', domain: 'TEST' },
    ],
    currentProjection: [{ name: 'verify', status: 'FAILED' }],
    demonstrates: ['failure-domain: byte-identical to a test failure at the check-run level; Spark must not describe this as "unit tests failed."'],
};

const sc05_sameShaRerun: CiCorpusScenario = {
    id: 'same-sha-rerun',
    name: 'Same-SHA rerun (flake candidate)',
    description: 'One workflow run for the same revision has two attempts: attempt 1 failed, attempt 2 passed. The current check-run query defaults to the latest result, so prior-attempt evidence is absent.',
    repository: SPARK_REPO,
    revision: 'e5f6a7b8c9d0',
    raw: {
        checkRuns: [
            { id: 9041, name: 'verify', head_sha: 'e5f6a7b8c9d0', status: 'completed', conclusion: 'success', check_suite: { id: 70040 }, completed_at: '2026-08-31T14:20:00Z' },
        ],
        checkSuites: [
            { id: 70040, head_sha: 'e5f6a7b8c9d0', status: 'completed', conclusion: 'success' },
        ],
        actionsRuns: [
            { id: 50040, check_suite_id: 70040, name: 'Dashboard / Worker Verification', head_sha: 'e5f6a7b8c9d0', head_branch: 'feature/flake', event: 'pull_request', status: 'completed', conclusion: 'failure', run_attempt: 1 },
            { id: 50040, check_suite_id: 70040, name: 'Dashboard / Worker Verification', head_sha: 'e5f6a7b8c9d0', head_branch: 'feature/flake', event: 'pull_request', status: 'completed', conclusion: 'success', run_attempt: 2 },
        ],
        jobs: [
            { id: 9040, run_id: 50040, run_attempt: 1, name: 'verify', status: 'completed', conclusion: 'failure' },
            { id: 9041, run_id: 50040, run_attempt: 2, name: 'verify', status: 'completed', conclusion: 'success' },
        ],
        workflow: sparkVerifyWorkflow,
    },
    truth: [
        { subject: 'run:Dashboard / Worker Verification@attempt1', lifecycle: 'COMPLETED', outcome: 'FAILED' },
        { subject: 'run:Dashboard / Worker Verification@attempt2', lifecycle: 'COMPLETED', outcome: 'PASSED' },
        { subject: 'flake:Dashboard / Worker Verification@e5f6a7b8c9d0', lifecycle: 'COMPLETED', outcome: 'FAILED', note: 'same revision: attempt1 failed then attempt2 passed → flake candidate' },
    ],
    currentProjection: [{ name: 'verify', status: 'PASSED' }],
    demonstrates: ['no attempt identity: the default latest-only check-run query retains attempt 2 but loses attempt 1; the current model therefore cannot establish same-SHA retry recovery or name a flake candidate.'],
};

const sc06_failureThenSourceChange: CiCorpusScenario = {
    id: 'failure-then-source-change',
    name: 'Failure resolved by a source change (corrective, not flake)',
    description: 'Revision A failed; revision B (new code, new SHA) passed. Because the revision changed, this is corrective work — not the same as a same-SHA flake.',
    repository: SPARK_REPO,
    revision: 'a7b8c9d0e1f2',
    raw: {
        checkRuns: [
            { id: 9051, name: 'verify', head_sha: 'a7b8c9d0e1f2', status: 'completed', conclusion: 'success', check_suite: { id: 70051 } },
        ],
        workflow: sparkVerifyWorkflow,
        priorRevision: {
            revision: '9f6a7b8c9d0e',
            checkRuns: [{ id: 9050, name: 'verify', head_sha: '9f6a7b8c9d0e', status: 'completed', conclusion: 'failure', check_suite: { id: 70050 } }],
        },
    },
    truth: [
        { subject: 'run:verify@prior', lifecycle: 'COMPLETED', outcome: 'FAILED', note: 'revision 9f6a had a real failure' },
        { subject: 'run:verify@current', lifecycle: 'COMPLETED', outcome: 'PASSED', note: 'a new revision changed the code and passed → corrective, not a flake' },
    ],
    currentProjection: [{ name: 'verify', status: 'PASSED' }],
    demonstrates: ['revision identity: the outcome is only meaningful because the revision changed; the flat model (single snapshot, no revision axis) cannot contrast "failure at A, pass at B" against "failure then pass at the same SHA."'],
};

const sc07_conditionalSkipped: CiCorpusScenario = {
    id: 'conditional-skipped-job',
    name: 'Conditionally skipped job',
    description: 'A performance job is `if:`-conditioned (only runs on the default branch) and is skipped for this pull request. It was deliberately not run — neither a defect nor passing evidence.',
    repository: SPARK_REPO,
    revision: 'b8c9d0e1f2a3',
    raw: {
        checkRuns: [
            { id: 9060, name: 'verify', head_sha: 'b8c9d0e1f2a3', status: 'completed', conclusion: 'success', check_suite: { id: 70060 } },
            { id: 9061, name: 'perf', head_sha: 'b8c9d0e1f2a3', status: 'completed', conclusion: 'skipped', check_suite: { id: 70060 } },
        ],
        workflow: {
            path: '.github/workflows/ci.yml',
            name: 'CI',
            triggers: ['pull_request', 'push'],
            jobs: [
                { id: 'verify', steps: [{ uses: 'actions/checkout@v4' }, { run: 'pnpm test' }] },
                { id: 'perf', needs: ['verify'], steps: [{ run: 'pnpm perf' }, { run: 'echo perf' }], },
            ],
        },
        actionsRuns: [{
            id: 50060, check_suite_id: 70060, run_attempt: 1, name: 'CI', head_sha: 'b8c9d0e1f2a3', head_branch: 'feature/perf-skip', event: 'pull_request', status: 'completed', conclusion: 'success',
        }],
        jobs: [
            { id: 9060, run_id: 50060, run_attempt: 1, name: 'verify', status: 'completed', conclusion: 'success' },
            { id: 9061, run_id: 50060, run_attempt: 1, name: 'perf', status: 'completed', conclusion: 'skipped' },
        ],
    },
    truth: [
        { subject: 'job:verify', lifecycle: 'COMPLETED', outcome: 'PASSED' },
        { subject: 'job:perf', lifecycle: 'COMPLETED', outcome: 'SKIPPED', note: 'condition not met on this branch; deliberately not run, not a defect' },
    ],
    currentProjection: [{ name: 'verify', status: 'PASSED' }, { name: 'perf', status: 'UNKNOWN' }],
    demonstrates: ['lifecycle-vs-outcome: a deliberately-skipped job (COMPLETED/SKIPPED) is collapsed to UNKNOWN, the same bucket as a never-seen or stalled check.'],
};

const sc08_matrixPartialFailure: CiCorpusScenario = {
    id: 'matrix-partial-failure',
    name: 'Matrix partial failure',
    description: 'A test matrix across OS × Node has one failing cell; the other three pass. The failure is localized only by the display name, not by structured coordinates.',
    repository: SPARK_REPO,
    revision: 'c9d0e1f2a3b4',
    raw: {
        checkRuns: [
            { id: 9081, name: 'test (linux, node 20)', head_sha: 'c9d0e1f2a3b4', status: 'completed', conclusion: 'success', check_suite: { id: 70080 } },
            { id: 9082, name: 'test (linux, node 22)', head_sha: 'c9d0e1f2a3b4', status: 'completed', conclusion: 'success', check_suite: { id: 70080 } },
            { id: 9083, name: 'test (windows, node 20)', head_sha: 'c9d0e1f2a3b4', status: 'completed', conclusion: 'success', check_suite: { id: 70080 } },
            { id: 9084, name: 'test (windows, node 22)', head_sha: 'c9d0e1f2a3b4', status: 'completed', conclusion: 'failure', check_suite: { id: 70080 } },
        ],
        workflow: {
            path: '.github/workflows/ci.yml',
            name: 'CI',
            triggers: ['pull_request'],
            jobs: [{ id: 'test', matrix: { os: ['linux', 'windows'], node: ['20', '22'] }, steps: [{ run: 'pnpm test' }] }],
        },
        actionsRuns: [{
            id: 50080, check_suite_id: 70080, run_attempt: 1, name: 'CI', head_sha: 'c9d0e1f2a3b4', head_branch: 'main', event: 'pull_request', status: 'completed', conclusion: 'failure',
        }],
        jobs: [
            { id: 9081, run_id: 50080, run_attempt: 1, name: 'test (linux, node 20)', status: 'completed', conclusion: 'success' },
            { id: 9082, run_id: 50080, run_attempt: 1, name: 'test (linux, node 22)', status: 'completed', conclusion: 'success' },
            { id: 9083, run_id: 50080, run_attempt: 1, name: 'test (windows, node 20)', status: 'completed', conclusion: 'success' },
            { id: 9084, run_id: 50080, run_attempt: 1, name: 'test (windows, node 22)', status: 'completed', conclusion: 'failure' },
        ],
    },
    truth: [
        { subject: 'job:test[linux,node20]', lifecycle: 'COMPLETED', outcome: 'PASSED', domain: 'TEST' },
        { subject: 'job:test[linux,node22]', lifecycle: 'COMPLETED', outcome: 'PASSED', domain: 'TEST' },
        { subject: 'job:test[windows,node20]', lifecycle: 'COMPLETED', outcome: 'PASSED', domain: 'TEST' },
        { subject: 'job:test[windows,node22]', lifecycle: 'COMPLETED', outcome: 'FAILED', domain: 'TEST' },
    ],
    currentProjection: [
        { name: 'test (linux, node 20)', status: 'PASSED' },
        { name: 'test (linux, node 22)', status: 'PASSED' },
        { name: 'test (windows, node 20)', status: 'PASSED' },
        { name: 'test (windows, node 22)', status: 'FAILED' },
    ],
    demonstrates: ['matrix coordinates: distinct display names keep the four cells distinct; the failing cell is localized by a string, not structured dimensions. A workflow that named cells identically would collapse into the 127-duplicate signal.'],
};

const sc09_downstreamBlocked: CiCorpusScenario = {
    id: 'downstream-blocked',
    name: 'Downstream job blocked by an upstream failure',
    description: 'The build job failed; the integration job depends on it (needs: build) and is therefore skipped. It did not fail on its own — it was blocked.',
    repository: SPARK_REPO,
    revision: 'd0e1f2a3b4c5',
    raw: {
        checkRuns: [
            { id: 9090, name: 'build', head_sha: 'd0e1f2a3b4c5', status: 'completed', conclusion: 'failure', check_suite: { id: 70090 } },
            { id: 9091, name: 'integration', head_sha: 'd0e1f2a3b4c5', status: 'completed', conclusion: 'skipped', check_suite: { id: 70090 } },
        ],
        workflow: {
            path: '.github/workflows/ci.yml',
            name: 'CI',
            triggers: ['pull_request'],
            jobs: [
                { id: 'build', steps: [{ run: 'pnpm build' }] },
                { id: 'integration', needs: ['build'], steps: [{ run: 'pnpm integration' }] },
            ],
        },
        actionsRuns: [{
            id: 50090, check_suite_id: 70090, run_attempt: 1, name: 'CI', head_sha: 'd0e1f2a3b4c5', head_branch: 'feature/blocked', event: 'pull_request', status: 'completed', conclusion: 'failure',
        }],
        jobs: [
            { id: 9090, run_id: 50090, run_attempt: 1, name: 'build', status: 'completed', conclusion: 'failure' },
            { id: 9091, run_id: 50090, run_attempt: 1, name: 'integration', status: 'completed', conclusion: 'skipped' },
        ],
    },
    truth: [
        { subject: 'job:build', lifecycle: 'COMPLETED', outcome: 'FAILED', domain: 'BUILD' },
        { subject: 'job:integration', lifecycle: 'COMPLETED', outcome: 'SKIPPED', note: 'GitHub observed a completed/skipped job record; the declared needs edge supports a blocked-by-build interpretation' },
    ],
    currentProjection: [{ name: 'build', status: 'FAILED' }, { name: 'integration', status: 'UNKNOWN' }],
    demonstrates: ['dependency blockage: the check-run cannot express "integration was skipped because build failed"; Spark records it as UNKNOWN and cannot tell a blocked job from a missing/stalled one.'],
};

const sc10_pathFiltered: CiCorpusScenario = {
    id: 'path-filtered-workflow',
    name: 'Path-filtered workflow that did not trigger (zero evidence)',
    description: 'The only verification for this change is a docs-lint workflow gated on docs/**; the change touched code only, so it never ran. No check-run exists, so the evidence set is empty.',
    repository: SPARK_REPO,
    revision: 'e1f2a3b4c5d6',
    raw: {
        checkRuns: [],
        changedPaths: ['apps/api/src/index.ts'],
        workflow: {
            path: '.github/workflows/docs-lint.yml',
            name: 'Docs Lint',
            triggers: ['pull_request'],
            pathFilters: ['docs/**'],
            jobs: [{ id: 'docs-lint', steps: [{ run: 'pnpm lint:docs' }] }],
        },
    },
    truth: [
        { subject: 'run:Docs Lint', lifecycle: 'NOT_OBSERVED', outcome: 'NOT_APPLICABLE', note: 'the declared docs/** filter does not match the observed apps/api/src/index.ts change' },
        { subject: 'expectation:Docs Lint', lifecycle: 'EXPECTED', outcome: 'NOT_APPLICABLE', note: 'the workflow is known but is not expected to execute for this change' },
    ],
    currentProjection: [],
    demonstrates: ['missing-vs-not-expected: a path-filtered verification that did not trigger is absent from the evidence set; with zero evidence the current model marks the run CLEAR, and no declared-process knowledge can turn the absence into MISSING.'],
};

const sc11_reusableWorkflow: CiCorpusScenario = {
    id: 'reusable-workflow',
    name: 'Reusable workflow (delegated verification)',
    description: 'A job calls a reusable workflow through jobs.<job_id>.uses. Runtime jobs are visible, but the current flat projection cannot retain the declared caller/called-workflow relationship.',
    repository: SPARK_REPO,
    revision: 'f2a3b4c5d6e7',
    raw: {
        checkRuns: [
            { id: 9111, name: 'verify / shared typecheck', head_sha: 'f2a3b4c5d6e7', status: 'completed', conclusion: 'success', check_suite: { id: 70110 } },
            { id: 9112, name: 'verify / shared test', head_sha: 'f2a3b4c5d6e7', status: 'completed', conclusion: 'success', check_suite: { id: 70110 } },
        ],
        workflow: {
            path: '.github/workflows/ci.yml',
            name: 'CI',
            triggers: ['pull_request'],
            jobs: [{ id: 'verify', name: 'verify', uses: './.github/workflows/shared-verify.yml' }],
        },
        actionsRuns: [{
            id: 50110, check_suite_id: 70110, run_attempt: 1, name: 'CI', head_sha: 'f2a3b4c5d6e7', head_branch: 'feature/reusable', event: 'pull_request', status: 'completed', conclusion: 'success',
        }],
        jobs: [
            { id: 9111, run_id: 50110, run_attempt: 1, name: 'verify / shared typecheck', status: 'completed', conclusion: 'success' },
            { id: 9112, run_id: 50110, run_attempt: 1, name: 'verify / shared test', status: 'completed', conclusion: 'success' },
        ],
    },
    truth: [
        { subject: 'definition-job:verify', lifecycle: 'EXPECTED', outcome: 'NOT_APPLICABLE', note: 'declared caller job delegates to ./.github/workflows/shared-verify.yml' },
        { subject: 'job:verify/shared typecheck', lifecycle: 'COMPLETED', outcome: 'PASSED', domain: 'STATIC_ANALYSIS' },
        { subject: 'job:verify/shared test', lifecycle: 'COMPLETED', outcome: 'PASSED', domain: 'TEST' },
    ],
    currentProjection: [{ name: 'verify / shared typecheck', status: 'PASSED' }, { name: 'verify / shared test', status: 'PASSED' }],
    demonstrates: ['reusable-workflow relationship: runtime child jobs are flattened into Evidence items, while the checked-in jobs.<job_id>.uses relationship and its completeness are not represented.'],
};

const sc12_dynamicScript: CiCorpusScenario = {
    id: 'dynamic-repository-script',
    name: 'Dynamic repository script',
    description: 'A step runs a repo-owned script (./scripts/ci.sh) that performs verification. The check-run passes, but what the script actually checks is not in the runtime data.',
    repository: SPARK_REPO,
    revision: 'a3b4c5d6e7f8',
    raw: {
        checkRuns: [
            { id: 9120, name: 'verify', head_sha: 'a3b4c5d6e7f8', status: 'completed', conclusion: 'success', check_suite: { id: 70120 } },
        ],
        workflow: {
            path: '.github/workflows/ci.yml',
            name: 'CI',
            triggers: ['pull_request'],
            jobs: [{ id: 'verify', steps: [{ name: 'Repository CI script', run: './scripts/ci.sh' }] }],
        },
        actionsRuns: [{
            id: 50120, check_suite_id: 70120, run_attempt: 1, name: 'CI', head_sha: 'a3b4c5d6e7f8', head_branch: 'feature/script', event: 'pull_request', status: 'completed', conclusion: 'success',
        }],
        jobs: [{ id: 9120, run_id: 50120, run_attempt: 1, name: 'verify', status: 'completed', conclusion: 'success', steps: [{ number: 1, name: 'Repository CI script', status: 'completed', conclusion: 'success' }] }],
    },
    truth: [
        { subject: 'job:verify', lifecycle: 'COMPLETED', outcome: 'PASSED' },
        { subject: 'step:verify/Repository CI script', lifecycle: 'COMPLETED', outcome: 'PASSED', domain: 'UNKNOWN', note: 'a repo-owned script; what it verifies is a declared-process question (CI-3xx), not resolvable from runtime data' },
    ],
    currentProjection: [{ name: 'verify', status: 'PASSED' }],
    demonstrates: ['declared-semantics: a repo-owned dynamic script passes, but the check-run cannot say what it verifies; the pass carries unknown coverage until the script is read (CI-3xx).'],
};

const sc13_deploymentAwaitingApproval: CiCorpusScenario = {
    id: 'deployment-awaiting-approval',
    name: 'Deployment awaiting approval (CI green)',
    description: 'All CI checks passed; a production deployment is pending, waiting for a human approval. It has neither succeeded nor failed.',
    repository: SPARK_REPO,
    revision: 'b4c5d6e7f8a9',
    raw: {
        checkRuns: [
            { id: 9130, name: 'verify', head_sha: 'b4c5d6e7f8a9', status: 'completed', conclusion: 'success', check_suite: { id: 70130 } },
            { id: 9131, name: 'build', head_sha: 'b4c5d6e7f8a9', status: 'completed', conclusion: 'success', check_suite: { id: 70130 } },
        ],
        deployment: {
            deployment: { id: 6001, sha: 'b4c5d6e7f8a9', ref: 'feature/deploy', environment: 'production', created_at: '2026-08-31T15:00:00Z' },
            statuses: [{ id: 6101, deployment_id: 6001, state: 'pending', environment: 'production', created_at: '2026-08-31T15:00:01Z' }],
        },
        pendingDeployments: [{
            environment: { id: 6201, name: 'production' },
            wait_timer: 0,
            reviewers: [{ type: 'Team', reviewer: { id: 6301, name: 'release-managers' } }],
        }],
    },
    truth: [
        { subject: 'job:verify', lifecycle: 'COMPLETED', outcome: 'PASSED' },
        { subject: 'job:build', lifecycle: 'COMPLETED', outcome: 'PASSED', domain: 'BUILD' },
        { subject: 'deployment:production', lifecycle: 'QUEUED', outcome: 'UNKNOWN', domain: 'DEPLOYMENT', note: 'the pending-deployments response names a required reviewer; not yet deployed and not failed' },
    ],
    currentProjection: [{ name: 'verify', status: 'PASSED' }, { name: 'build', status: 'PASSED' }],
    demonstrates: ['CD unavailability: the pending production deployment is entirely absent from the check-run ingestion; Spark sees all-PASSED CI and reports CLEAR while a real deployment is still waiting for approval.'],
};

const sc14_deploymentFailure: CiCorpusScenario = {
    id: 'deployment-failure-after-green-ci',
    name: 'Deployment failure after green CI',
    description: 'Every CI check passed, but the production deployment then failed. In the current model, green CI reads as success and the failed deployment is invisible.',
    repository: SPARK_REPO,
    revision: 'c5d6e7f8a9b0',
    raw: {
        checkRuns: [
            { id: 9140, name: 'verify', head_sha: 'c5d6e7f8a9b0', status: 'completed', conclusion: 'success', check_suite: { id: 70140 } },
            { id: 9141, name: 'build', head_sha: 'c5d6e7f8a9b0', status: 'completed', conclusion: 'success', check_suite: { id: 70140 } },
        ],
        deployment: {
            deployment: { id: 6002, sha: 'c5d6e7f8a9b0', ref: 'feature/deploy-failure', environment: 'production', created_at: '2026-08-31T16:00:00Z' },
            statuses: [{ id: 6102, deployment_id: 6002, state: 'failure', environment: 'production', created_at: '2026-08-31T16:05:00Z', updated_at: '2026-08-31T16:05:00Z' }],
        },
    },
    truth: [
        { subject: 'job:verify', lifecycle: 'COMPLETED', outcome: 'PASSED' },
        { subject: 'job:build', lifecycle: 'COMPLETED', outcome: 'PASSED', domain: 'BUILD' },
        { subject: 'deployment:production', lifecycle: 'COMPLETED', outcome: 'FAILED', domain: 'DEPLOYMENT', note: 'deployment failed after CI was green; a real defect the current model cannot see' },
    ],
    currentProjection: [{ name: 'verify', status: 'PASSED' }, { name: 'build', status: 'PASSED' }],
    demonstrates: ['CD unavailability: every CI check is PASSED so the current model marks the run CLEAR, but the production deployment FAILED; a green-CI + failed-deployment reads as success.'],
};

export const ciProcessScenarios: ReadonlyArray<CiCorpusScenario> = [
    sc01_successful,
    sc02_ciStartConfound,
    sc03_failedJob,
    sc04_failedSetupStep,
    sc05_sameShaRerun,
    sc06_failureThenSourceChange,
    sc07_conditionalSkipped,
    sc08_matrixPartialFailure,
    sc09_downstreamBlocked,
    sc10_pathFiltered,
    sc11_reusableWorkflow,
    sc12_dynamicScript,
    sc13_deploymentAwaitingApproval,
    sc14_deploymentFailure,
];
