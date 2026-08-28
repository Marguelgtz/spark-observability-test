# Change Trajectory Phase 3 plan and execution record

**Objective:** connect deterministic trajectory signals to merge outcome and, separately, measured user action.  
**Delivery shape:** two bounded subphases with independent persistence and API contracts.

## Subphase 3A — Merge Outcome

**Status:** complete

### Scope

1. Route opened, reopened, closed, and merged pull-request lifecycle events explicitly.
2. Persist a repository-scoped lifecycle projection without storing raw webhook bodies.
3. Select the latest immutable evaluation run whose evaluation time is at or before merge time.
4. Reconcile that selection from both lifecycle writes and later evaluation-run appends.
5. Preserve the component attention and evidence values behind `unresolvedAtMerge`.
6. Add lifecycle facts to the existing trajectory response.
7. Render merged or closed state as a terminal marker, separate from evaluation runs.
8. Update the public privacy notice for lifecycle timestamps and merge identifiers.

### Rules and race behavior

`unresolvedAtMerge` is initially true when pre-merge attention is not `LOW` or pre-merge evidence health is not `CLEAR`. The component facts remain stored so this product rule can evolve without rewriting history.

Lifecycle writes are idempotent and ordered by the source event timestamp. A merged projection is terminal. Reopened events can supersede an earlier unmerged close, while stale lifecycle events cannot move the projection backward. A merge may initially have no eligible Spark run; a later-arriving run automatically reconciles the projection when its evaluation timestamp is at or before merge time. Runs evaluated after merge are never selected.

### Persistence and contract

| Concern | Implementation |
| --- | --- |
| Migration | `0007_pull_request_lifecycle.sql` |
| Lifecycle states | `OPEN`, `CLOSED`, `MERGED` |
| Selected observation | `preMergeRunId` plus attention and evidence health |
| Ordering | Run evaluation time, creation time, then stable run identity |
| Webhook ordering | Shared reconciliation in lifecycle and observation transactions |
| Trajectory API | Optional versioned `lifecycle` object on `PullRequestTrajectoryV1` |
| Presentation | Accessible terminal marker with explicit resolved/unresolved language |

### Non-goals

- user feedback storage or controls;
- incident or rollback association;
- generated merge narratives;
- organization-level outcome metrics;
- changes to Spark evaluation scoring.

### Exit gates

- low/clear and high/unresolved pre-merge states project correctly;
- merge-before-run and run-before-merge delivery orders converge on the same result;
- a post-merge run is excluded;
- duplicate lifecycle delivery is idempotent;
- closed, reopened, merged, and no-prior-run cases remain truthful;
- the trajectory endpoint preserves repository authorization;
- desktop and mobile show a first-class terminal state;
- typecheck, unit tests, production build, migrations, Worker dry-run, and browser acceptance pass.

### Verification record

Subphase 3A was verified on 2026-08-28 with:

- workspace typechecking;
- 137 unit and integration tests, including real SQLite lifecycle reconciliation;
- a production dashboard build;
- all seven migrations applied to a fresh local D1 database;
- a Worker/static-assets dry run;
- 38 desktop/mobile Playwright acceptance tests;
- desktop and mobile screenshot inspection of the terminal marker.

## Subphase 3B — Human Feedback

**Status:** planned; intentionally not implemented in 3A

### Scope

1. Add `trajectory_feedback` in migration `0008` with one record per user and material transition.
2. Support `USEFUL`, `EXPECTED`, `FALSE_POSITIVE`, and `FIXED_BECAUSE_SPARK` classifications.
3. Bound optional notes to 500 characters and escape them normally at presentation time.
4. Add an authenticated, repository-authorized, same-origin `PUT` mutation that is idempotent per user and transition.
5. Show lightweight controls only on material transitions.
6. Report feedback coverage alongside any classification rate.

### Exit gates

- unauthorized and cross-repository writes are rejected;
- repeated writes update one user/transition record rather than creating duplicates;
- transition identity is validated against the requested PR trajectory;
- notes are bounded at both API and persistence layers;
- controls are keyboard-accessible and retain saved state;
- feedback remains measurement data and never silently changes evaluation behavior.

## Phase boundary

Subphase 3B depends on stable material-transition identity from Phase 2 and the merge-outcome context delivered by 3A. It does not need to share a migration, mutation path, or release with lifecycle correctness. After both subphases, Spark should stop feature expansion and dogfood the combined trajectory across genuinely different repositories before adding aggregate outcome dashboards.
