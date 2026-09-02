# Spark product insight candidates

This file is intentionally lightweight. It records product signals that become visible during dashboard iteration but are not yet committed product features.

## Trajectory volatility and stabilization

**Origin:** the PR-level attention severity timeline.

A severity-over-time view exposes more than individual HIGH / MEDIUM / LOW states. The shape of the trajectory may itself be a useful Spark insight.

Potential deterministic derived signals:

- peak attention reached during the PR
- time spent in HIGH or MEDIUM attention
- number and magnitude of attention transitions
- number of evidence regressions before stabilization
- time from first regression to recovery
- whether the trajectory was improving, stable, or worsening immediately before merge
- whether attention repeatedly oscillated instead of converging

Why this may matter: two PRs can have the same final attention level but very different histories. A short HIGH state that recovers quickly is different from repeated HIGH ↔ MEDIUM movement or a long unresolved HIGH state before merge.

Product guardrails:

- derive these signals from immutable evaluation history and existing deterministic transition semantics
- keep the underlying events inspectable; never replace the trajectory with a synthetic score
- treat these as explanatory insights, not merge enforcement
- validate whether the signal helps users find risky or unstable changes before promoting it to a first-class metric

Status: **candidate only**.

## Iteration density

**Origin:** comparing evaluation-run volume with distinct observed pull requests.

The ratio `evaluations / observed PRs` gives Spark a simple deterministic description of how much iteration activity changes generate. The dashboard labels this **Iteration density** rather than churn, complexity, or modularity because the ratio alone does not establish why repeated evaluations occurred.

Potential follow-on signals:

- change in evaluations-per-PR compared with a previous window
- distribution of evaluations per PR rather than only the mean
- PRs that are outliers relative to the repository baseline
- repeated evaluation activity after attention or evidence should otherwise have stabilized

Interpretation guardrail: a high ratio may reflect normal iteration, CI behavior, rebases, repeated pushes, or difficult changes. It must not be presented as architectural quality by itself.

Status: **surfaced descriptive metric; deeper interpretation remains candidate-only**.

## Change fragmentation / architectural spread

**Origin:** combining iteration density with Spark's direct areas, affected areas, changed files, sensitive surfaces, and trajectory data.

A future two-dimensional insight could test whether repeated evaluation activity becomes more meaningful when paired with how broadly a change crosses the system. One candidate representation is:

- X axis: number of affected/direct areas or modules
- Y axis: evaluations per PR
- bubble size: changed-file count
- point state: peak attention or unresolved-at-merge outcome

Possible patterns to investigate, not assert:

- high iteration + narrow scope → concentrated churn candidate
- high iteration + broad scope → cross-system coordination candidate
- low iteration + broad scope → broad but comparatively stable change
- repeated HIGH attention across many areas → coupling/modularity investigation candidate

Before Spark calls any of these architectural or modularity insights, validate that area mappings are populated consistently, changed-file scope is reliable, and the relationship predicts something users actually care about such as recovery time, regressions, or unresolved merges.

Status: **candidate only**. Do not market Spark as detecting poor modularity from evaluation count alone.
