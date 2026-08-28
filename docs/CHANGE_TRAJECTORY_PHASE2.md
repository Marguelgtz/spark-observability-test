# Change Trajectory Phase 2 execution record

**Status:** complete  
**Scope:** deterministic transition deltas and PR-level trajectory presentation  
**Baseline:** the immutable evaluation-run foundation delivered in Phase 1

## Objective

Turn immutable evaluation runs into an understandable account of how a pull request changed. Phase 2 compares adjacent observations, identifies material transitions, and explains the evidence behind each transition without persisting generated prose.

This phase deliberately excludes merge-lifecycle projections, organization analytics, user feedback, and model-generated summaries. Those require separate product and data contracts.

## Execution sequence

1. Define a versioned trajectory contract with explicit analysis bounds.
2. Implement a pure, deterministic engine over chronologically ordered immutable runs.
3. Compute attention, evidence, scope, sensitive-surface, reason, and profile deltas for each adjacent run pair.
4. Combine simultaneous causes into one notable transition per run boundary.
5. Expose the result through a protected, repository-scoped trajectory endpoint.
6. Present summary metrics, run history, and explanation-rich transitions on the pull-request page.
7. Verify ordering, same-SHA observations, partial legacy detail, truncation, authorization, and desktop/mobile behavior.

## Contract and behavior

| Concern | Phase 2 behavior |
| --- | --- |
| Source of truth | Immutable `evaluation_runs` history |
| Ordering | Evaluation time, then creation time, then stable run identity |
| Analysis bound | Latest 100 runs, reported separately from total retained runs |
| Transition identity | Stable `fromRunId:toRunId` boundary identity |
| Explanation model | Deterministic structured causes rendered as human-readable copy |
| Simultaneous changes | One combined notable transition for each adjacent run boundary |
| Same-SHA observations | Compared independently by run identity |
| Legacy detail | Missing detail produces partial deltas rather than invented evidence |
| Compatibility | Existing PR detail and latest-by-SHA routes remain available |
| Current activity | Cheap current-state activity reads remain separate from trajectory history |

The API reports both `totalRuns` and `analyzedRuns`. A truncated response therefore never implies that summary transition counts cover history that was not read.

## Landed implementation

| Requirement | Implementation |
| --- | --- |
| Shared trajectory schema | Versioned contracts in `@spark/dashboard-contracts` |
| Pure delta engine | `apps/api/src/change-trajectory.ts` |
| Repository-scoped read | `GET /api/repositories/:repositoryId/pulls/:pr/trajectory` |
| Existing insight continuity | Evidence issues and current insights remain part of the trajectory response |
| Browser integration | Pull-request view loads the dedicated trajectory contract |
| Combined explanations | Material transitions list every cause observed at one run boundary |
| Bounded-history truthfulness | Response exposes completeness, truncation, total runs, and analyzed runs |

## Exit gates

- Ordering is deterministic even when timestamps tie.
- Input history is not mutated while deriving trajectory output.
- `PENDING → FAILED → PASSED` on one SHA produces independent transitions.
- Evidence regression, recovery, appearance, disappearance, and partial legacy detail are explicit.
- Attention changes and newly added sensitive surfaces can appear in the same transition.
- Identical evaluation state on a different SHA does not create a false notable transition.
- Unauthorized or out-of-scope repository reads are rejected.
- Typecheck, unit tests, production web build, local migrations, Worker dry-run, and desktop/mobile Playwright acceptance pass.

## Verification record

Phase 2 closure was verified on 2026-08-28 with:

- workspace typechecking;
- 130 unit and integration tests, including deterministic trajectory and protected endpoint cases;
- a production dashboard build;
- all six migrations applied to a fresh local D1 database;
- a Worker/static-assets dry run;
- 36 desktop/mobile Playwright acceptance tests.

## Next phase

Phase 3 can add merge-lifecycle context and feedback on top of the stable trajectory contract. It should preserve Phase 2's deterministic derivation boundary and treat any generated narrative as a presentation layer, not historical source data.
