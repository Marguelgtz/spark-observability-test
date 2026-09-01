import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CI_CORPUS_SPARK_APP_ID, ciProcessScenarios, type CiCorpusScenario } from './fixtures/ci-process-corpus';
import { normalizeCheckRuns, normalizeCheckStatus, type GitHubCheckRun } from '../src';

function check(status: string, conclusion: string | null): GitHubCheckRun {
    return { id: 1, name: 'probe', head_sha: 'sha', status, conclusion };
}

function projected(scenario: CiCorpusScenario): Array<{ name: string; status: string }> {
    return normalizeCheckRuns(scenario.raw.checkRuns, CI_CORPUS_SPARK_APP_ID)
        .map(item => ({ name: item.name, status: item.status }));
}

describe('CI-002 process characterization corpus', () => {
    it('contains the full 14-scenario set with unique ids', () => {
        expect(ciProcessScenarios).toHaveLength(14);
        const ids = ciProcessScenarios.map(scenario => scenario.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const scenario of ciProcessScenarios) {
            expect(scenario.raw.checkRuns, `${scenario.id}: raw.checkRuns present`).toBeDefined();
            expect(scenario.truth.length, `${scenario.id}: truth non-empty`).toBeGreaterThan(0);
            expect(scenario.demonstrates.length, `${scenario.id}: demonstrates non-empty`).toBeGreaterThan(0);
            expect(scenario.raw.checkRuns.some(run => run.name === 'Spark Observability'), `${scenario.id}: no Spark Observability check`).toBe(false);
        }
    });

    it('preserves workflow-run, check-suite, attempt, job, and check-run identities', () => {
        for (const scenario of ciProcessScenarios) {
            const runs = scenario.raw.actionsRuns ?? [];
            const runAttempts = new Set(runs.map(run => `${run.id}:${run.run_attempt}`));
            for (const job of scenario.raw.jobs ?? []) {
                expect(runAttempts.has(`${job.run_id}:${job.run_attempt}`), `${scenario.id}: job has a matching run attempt`).toBe(true);
            }
            for (const checkRun of scenario.raw.checkRuns) {
                if (!checkRun.check_suite || runs.length === 0) continue;
                expect(runs.some(run => run.check_suite_id === checkRun.check_suite!.id), `${scenario.id}: check suite maps to a workflow run`).toBe(true);
            }
        }
    });

    it('keeps a rerun under one workflow-run and check-suite identity', () => {
        const scenario = ciProcessScenarios.find(item => item.id === 'same-sha-rerun')!;
        expect(scenario.raw.actionsRuns?.map(run => [run.id, run.check_suite_id, run.run_attempt])).toEqual([
            [50040, 70040, 1],
            [50040, 70040, 2],
        ]);
        expect(scenario.raw.jobs?.map(job => job.run_attempt)).toEqual([1, 2]);
        expect(projected(scenario)).toEqual([{ name: 'verify', status: 'PASSED' }]);
    });

    it('models reusable workflows as job-level uses declarations', () => {
        const scenario = ciProcessScenarios.find(item => item.id === 'reusable-workflow')!;
        const caller = scenario.raw.workflow?.jobs.find(job => job.id === 'verify');
        expect(caller).toMatchObject({ uses: './.github/workflows/shared-verify.yml' });
        expect(caller?.steps).toBeUndefined();
    });

    it('keeps observed skipped records completed while preserving SKIPPED as the outcome', () => {
        for (const id of ['failed-job', 'failed-setup-step', 'conditional-skipped-job', 'downstream-blocked']) {
            const scenario = ciProcessScenarios.find(item => item.id === id)!;
            const skipped = scenario.truth.filter(unit => unit.outcome === 'SKIPPED');
            expect(skipped.length, `${id}: skipped truth present`).toBeGreaterThan(0);
            expect(skipped.every(unit => unit.lifecycle === 'COMPLETED'), `${id}: skipped records completed`).toBe(true);
        }
    });

    it('keeps the bounded Spark workflow fixture synchronized with the checked-in workflow', () => {
        const candidates = [
            resolve(process.cwd(), '.github/workflows/dashboard-worker-validation.yml'),
            resolve(process.cwd(), '../../.github/workflows/dashboard-worker-validation.yml'),
        ];
        const workflowText = readFileSync(candidates.find(existsSync)!, 'utf8');
        const workflow = ciProcessScenarios.find(item => item.id === 'successful-workflow')!.raw.workflow!;
        for (const path of workflow.pathFilters ?? []) expect(workflowText).toContain(`'${path}'`);
        for (const step of workflow.jobs.flatMap(job => job.steps ?? [])) {
            if (step.uses) expect(workflowText).toContain(`uses: ${step.uses}`);
            if (step.run) expect(workflowText).toContain(`run: ${step.run}`);
        }
    });

    it.each(ciProcessScenarios.map(scenario => [scenario.id, scenario] as const))(
        'characterizes the current projection for %s',
        (_id, scenario) => {
            const evidence = normalizeCheckRuns(scenario.raw.checkRuns, CI_CORPUS_SPARK_APP_ID);
            expect(evidence.map(item => ({ name: item.name, status: item.status }))).toEqual(scenario.currentProjection);
            for (const item of evidence) {
                expect(item.coverage, `${scenario.id}: coverage is always UNKNOWN`).toBe('UNKNOWN');
            }
        },
    );
});

describe('CI-002 lifecycle/outcome conflation (the core defect)', () => {
    it('collapses distinct GitHub status/conclusion pairs into four buckets', () => {
        expect(normalizeCheckStatus(check('queued', null))).toBe('PENDING');
        expect(normalizeCheckStatus(check('in_progress', null))).toBe('PENDING');
        expect(normalizeCheckStatus(check('waiting', null))).toBe('PENDING');
        expect(normalizeCheckStatus(check('completed', 'success'))).toBe('PASSED');
        expect(normalizeCheckStatus(check('completed', 'failure'))).toBe('FAILED');
        expect(normalizeCheckStatus(check('completed', 'timed_out'))).toBe('FAILED');
        expect(normalizeCheckStatus(check('completed', 'skipped'))).toBe('UNKNOWN');
        expect(normalizeCheckStatus(check('completed', 'neutral'))).toBe('UNKNOWN');
        expect(normalizeCheckStatus(check('completed', 'cancelled'))).toBe('UNKNOWN');
    });

    it('shows queued, running, and waiting are indistinguishable to the current model', () => {
        expect(new Set(['queued', 'in_progress', 'waiting'].map(status => normalizeCheckStatus(check(status, null))))).toEqual(new Set(['PENDING']));
    });

    it('shows skipped, neutral, and cancelled are indistinguishable to the current model', () => {
        expect(new Set(['skipped', 'neutral', 'cancelled'].map(conclusion => normalizeCheckStatus(check('completed', conclusion))))).toEqual(new Set(['UNKNOWN']));
    });
});

describe('CI-002 input for CI-003: the CI-start confound', () => {
    it('preserves the distinct prior and current revisions in the fixture', () => {
        const scenario = ciProcessScenarios.find(item => item.id === 'ci-start-confound');
        expect(scenario?.raw.priorRevision).toBeDefined();
        const prior = normalizeCheckRuns(scenario!.raw.priorRevision!.checkRuns, CI_CORPUS_SPARK_APP_ID)
            .map(item => ({ name: item.name, status: item.status }));
        expect(prior).toEqual([{ name: 'verify', status: 'PASSED' }]);
        expect(projected(scenario!)).toEqual([{ name: 'verify', status: 'PENDING' }]);
        expect(scenario!.raw.priorRevision!.revision).not.toBe(scenario!.revision);
    });
});

describe('CI-002 CD unavailability (deployments are invisible to check-run ingestion)', () => {
    it.each(ciProcessScenarios.filter(scenario => scenario.raw.deployment).map(scenario => [scenario.id, scenario] as const))(
        'records no evidence for the deployment in %s',
        (_id, scenario) => {
            const evidence = normalizeCheckRuns(scenario.raw.checkRuns, CI_CORPUS_SPARK_APP_ID);
            const deploymentUnits = scenario.truth.filter(unit => unit.subject.startsWith('deployment:'));
            expect(deploymentUnits.length, `${scenario.id}: deployment truth present`).toBeGreaterThan(0);
            expect(evidence.length, `${scenario.id}: only CI check-runs are projected`).toBe(scenario.currentProjection.length);
            if (scenario.raw.deployment!.statuses.at(-1)?.state === 'failure') {
                expect(evidence.every(item => item.status === 'PASSED'), `${scenario.id}: green-CI + failed deployment still reads all-PASSED`).toBe(true);
            }
        },
    );

    it('projects zero evidence for the path-filtered scenario (input to the CLEAR decision)', () => {
        const scenario = ciProcessScenarios.find(item => item.id === 'path-filtered-workflow');
        expect(projected(scenario!)).toEqual([]);
        expect(normalizeCheckRuns(scenario!.raw.checkRuns, CI_CORPUS_SPARK_APP_ID)).toEqual([]);
    });
});
