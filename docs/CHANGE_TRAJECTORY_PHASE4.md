# Change Trajectory Phase 4 — Outcome Intelligence

**Status:** in progress  
**Branch:** `product-experience/4-outcome-intelligence`  
**Base:** `product-experience/3-change-story`

## Why Phase 4 now

Phase 3 completed deterministic transition identity, merge-outcome projection, and measured transition feedback. The product-experience stack then made those signals legible through Home, drilldowns, composable insight canvases, and PR-level change evolution.

Phase 4 is the first aggregate outcome layer. It should answer whether Spark-observed concerns clear before merge, how trajectories stabilize, and whether users classify material transitions as useful. It must do this from retained facts rather than inventing a synthetic quality score.

## Product question

> What happened to the changes Spark asked us to pay attention to?

A developer should be able to answer:

1. How many observed merges were resolved versus unresolved at merge?
2. What attention/evidence state did unresolved merges carry into merge?
3. Are changes recovering after regressions, or remaining unstable?
4. How often are material transitions receiving feedback?
5. When feedback exists, how is it classified?
6. Which repositories or PRs deserve follow-up because they repeatedly regress or merge unresolved?

## Scope

### 1. Outcome overview

Add a first-class aggregate outcome response for the selected `24h / 7d / 30d` window and optional repository scope.

The response should expose:

- total observed merges;
- resolved-at-merge count;
- unresolved-at-merge count;
- merge-outcome-unavailable count;
- resolved rate only when the denominator is known;
- pre-merge attention distribution;
- pre-merge evidence-health distribution;
- merge events over time split resolved/unresolved/unavailable.

### 2. Trajectory stabilization

Derive deterministic trajectory behavior from immutable evaluation runs and the same notable-transition semantics already used by Spark.

Expose descriptive signals only:

- PRs with at least one regression;
- PRs with at least one recovery;
- PRs that recovered after a regression;
- PRs with repeated attention direction changes (oscillation candidate);
- attention increases and decreases;
- regressions and recoveries over time.

Do **not** expose a synthetic stability, health, or risk score.

### 3. Feedback measurement

Aggregate existing `trajectory_feedback` only within the authenticated viewer's authorized repository scope.

Expose:

- material transitions observed in the selected window;
- material transitions with viewer feedback;
- feedback coverage (`feedback / material transitions`) when denominator > 0;
- classification counts for `USEFUL`, `EXPECTED`, `FALSE_POSITIVE`, and `FIXED_BECAUSE_SPARK`;
- classification rates only alongside coverage.

Feedback remains measurement data and must never affect evaluator output.

### 4. Outcome page

Add `/app/overview/outcomes` as a dedicated drilldown.

Use composable insight canvases rather than isolated chart cards:

- **Merge quality** — resolved/unresolved trend + current composition;
- **Pre-merge state** — attention + evidence composition;
- **Trajectory stabilization** — regressions/recoveries over time + recovery summary;
- **Feedback signal** — coverage + classification composition.

The existing `Merged unresolved` metric on Home should navigate to this richer outcome page while preserving the selected window/repository query state.

### 5. Follow-up list

Below the canvases, show a bounded list of unresolved merged PRs with:

- repository / PR;
- merge time;
- pre-merge attention;
- pre-merge evidence health;
- link back to the PR trajectory.

The list is forensic navigation, not a leaderboard.

## Architecture

```text
existing evaluation_runs
existing pull_request_lifecycle
existing trajectory_feedback
        ↓
authorized aggregate queries
        ↓
OutcomeOverviewV1
        ↓
pure outcome insight derivation
        ↓
existing chart primitives + InsightCanvas
        ↓
/app/overview/outcomes
```

Prefer a dedicated aggregate reader rather than expanding `activity-home.ts` into a monolith.

## Contract

Add an optional/versioned outcome response rather than changing existing activity semantics.

Expected shape:

```ts
interface OutcomeOverviewV1 {
  version: 1;
  window: ActivityWindowV1;
  merges: {
    total: number;
    resolved: number;
    unresolved: number;
    unavailable: number;
  };
  preMergeAttention: Record<AttentionLevelV1, number> & { UNKNOWN: number };
  preMergeEvidence: Record<EvidenceHealthV1, number> & { UNAVAILABLE: number };
  stabilization: {
    regressedPRs: number;
    recoveredPRs: number;
    recoveredAfterRegressionPRs: number;
    oscillatingPRs: number;
    attentionIncreases: number;
    attentionDecreases: number;
    regressions: number;
    recoveries: number;
  };
  feedback: {
    materialTransitions: number;
    classifiedTransitions: number;
    classifications: Record<TrajectoryFeedbackClassificationV1, number>;
  };
  timeline: ...;
  unresolved: ...;
}
```

Exact field names may tighten during implementation, but denominator facts must remain explicit.

## Data semantics

- Merge metrics are keyed by lifecycle `merged_at`, not evaluation time.
- `resolved` means `unresolved_at_merge = 0`.
- `unresolved` means `unresolved_at_merge = 1`.
- missing/null merge outcome is `unavailable`; never silently classify it resolved.
- pre-merge distributions use persisted lifecycle projection fields.
- transition windowing uses destination/event time while retaining the immediate predecessor when classification requires it.
- repository authorization is applied before aggregation.
- optional repository filter must remain inside the authorized scope.
- feedback aggregates include only the authenticated viewer's feedback unless a future explicit multi-user aggregate contract is designed.

## Non-goals

- merge blocking or policy enforcement;
- AI-generated explanations;
- organization-wide benchmarking;
- architectural/modularity scoring;
- incident/deployment correlation;
- changing attention rules;
- feeding feedback back into evaluation;
- new persistence unless existing retained facts prove insufficient.

## Exit gates

- resolved/unresolved/unavailable merge denominators are truthful;
- outcome window and repository filters are honored;
- unresolved merge list links to the correct PR;
- regression/recovery aggregates reuse deterministic transition semantics;
- feedback coverage always includes its denominator;
- no aggregate claims are made when data is unavailable;
- no database migration is required;
- no evaluator behavior changes;
- desktop/mobile outcome page is covered by browser acceptance;
- typecheck, unit/API tests, production build, D1 migration validation, Worker dry-run, and browser acceptance pass.

## Stack

1. `product-experience/1-shell` → `main` (#34)
2. `product-experience/2-home` → `product-experience/1-shell` (#35)
3. `product-experience/2b-insight-canvases` → `product-experience/2-home` (#36)
4. `product-experience/3-change-story` → `product-experience/2b-insight-canvases` (#37)
5. **`product-experience/4-outcome-intelligence` → `product-experience/3-change-story`**
