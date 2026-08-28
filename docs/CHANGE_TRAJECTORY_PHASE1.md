# Change Trajectory Phase 1 execution record

**Status:** complete  
**Scope:** append-only evaluation-run foundation  
**Baseline:** the dashboard, authentication, and PR-history stack now on `main`

## Objective

Make Spark's history trustworthy by preserving every meaningful evaluation as an immutable run, including repeated observations of the same commit SHA. Current-state projections remain available for inexpensive activity and Check Run lookups.

Phase 1 does not include lifecycle-at-merge projections, feedback, organization analytics, or generated transition explanations. Those remain later phases.

## Execution sequence

1. Establish the append-only `evaluation_runs` schema and durable idempotency.
2. Persist each run atomically with the latest evaluation and detail projections.
3. Backfill retained legacy evaluations with explicit `BACKFILL` provenance.
4. Read PR history and aggregates from immutable runs while keeping activity reads inexpensive.
5. Address individual historical observations by run ID so same-SHA runs remain distinguishable.
6. Prove `PENDING → FAILED → PASSED` on one SHA through orchestration and real-SQL store tests.
7. Run the permanent dashboard/Worker verification gate.

## Landed implementation

| Requirement | Implementation |
| --- | --- |
| Append-only run schema | `0004_evaluation_runs.sql` |
| Stable run and idempotency identity | `EvaluationRunRecord` and unique `idempotency_key` |
| Atomic observation persistence | `D1SparkStore.saveEvaluationObservation()` batches run, evaluation, and detail writes |
| Current-state compatibility | `evaluations` and `evaluation_details` remain latest-per-SHA projections |
| Legacy backfill | `0005_evaluation_runs_backfill.sql` writes explicitly labeled `BACKFILL` runs |
| Truthful completeness | API contracts distinguish `COMPLETE` from `PARTIAL_BACKFILL` history |
| Immutable history reads | PR history and aggregates read `evaluation_runs` |
| Historical identity | run-ID API and browser routes retain independent same-SHA observations |
| Operational failure visibility | structured `persist_observation` stage logs and retriable delivery release |

Migration `0006` is already assigned to dashboard favorites. Phase 1 closure does not renumber or replace existing migrations.

## Exit gates

- Three distinct runs survive for one SHA as evidence moves from pending to failed to passed.
- The latest projections advance to the passed observation without overwriting the three immutable runs.
- A failed atomic observation batch leaves no partial run or projection write.
- Duplicate webhook delivery claims do not repeat processing.
- Backfilled history is never presented as complete live observation history.
- Activity reads remain separate from full PR-history reads.
- Typecheck, unit tests, production web build, local migrations, Worker dry-run, and desktop/mobile Playwright acceptance pass.

## Verification record

Phase 1 closure was verified on 2026-08-28 with:

- workspace typechecking;
- 118 unit and integration tests, including real SQLite execution of the D1 observation queries;
- a production dashboard build;
- all migrations applied to a fresh local D1 database;
- a Worker/static-assets dry run;
- 34 desktop/mobile Playwright acceptance tests;
- read-only production evidence confirming multiple immutable runs are retained for the same SHA.

## Next phase

After these gates are green, Phase 2 can add the pure deterministic transition-delta engine and a dedicated trajectory endpoint. It should derive explanations from pairs of immutable runs rather than persist prose or introduce lifecycle/feedback work early.
