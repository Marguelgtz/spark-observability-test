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

Status: **candidate only**. Do not expand PR2 scope beyond visualization and the existing deterministic analytics.
