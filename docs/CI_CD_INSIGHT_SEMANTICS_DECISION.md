# CI-701–711 — CI/CD insight semantics decision

Status: **ACCEPTED** (2026-09-01)

## Question

How does Spark turn the retained, normalized process state (G1–G6) into useful CI/CD intelligence — "running, not regressing", "failed here", "this never ran", "this recovered" — without inventing facts, without ML, without changing attention, and without a second store?

## Decision

An **insight** is a **deterministic, bounded derivation over the normalized `RepositoryUnderstanding`** (and, for recovery, over retained observation records from G6). It never acquires new provider data, never writes to the live path, and never changes the attention policy or the neutral GitHub Check.

### Insight shape (G7 working shape)

```text
kind                     'process-insight'
id                       deterministic identity from kind + subject
insightKind              NORMAL_LIFECYCLE | FAILURE_LOCALIZED | FAILURE_DOMAIN |
                         REPRODUCTION_CANDIDATE | BLOCKED_DOWNSTREAM | MATRIX_RESULT |
                         FLAKE_CANDIDATE | MISSING_EXPECTED | VERIFICATION_GAP | RECOVERY
repositoryId/revision    exact subject of the state
derivation               DETERMINISTIC (HEURISTIC only for name-based failure-domain
                         classification)
confidence               SUPPORTED | TENTATIVE | UNKNOWN — carries the completeness
                         boundary of what the insight may assert
summary                  deterministic, privacy-safe text (names/ids/URLs only)
supportingObservationIds canonical ids of the observations and claims the insight rests on
areaIds/boundaryIds      only where attribution/expectations actually support them
completeness             the source-completeness dimensions relevant to the insight
detail                   per-kind payload (counts, failing step, domain, command, …)
```

This is the G7 working shape. G9 (CI-901/CI-904) formalizes `ProcessInsightV0` with lifecycle state (`ACTIVE`/`RESOLVED`, `supersedes`/`resolvedBy`); G7 emits the grounded payload that shape will wrap. No insight lifecycle is claimed in G7.

### Truthfulness rules per insight kind

- **NORMAL_LIFECYCLE** asserts "running, not regressing" only when the current revision has verification activity **and** evidence acquisition is complete; partial acquisition downgrades the confidence to `UNKNOWN` because unobserved failures cannot be excluded. It is never emitted when a completed execution failed.
- **FAILURE_LOCALIZED** is a positive fact: an observed `FAILED` outcome. Localization depth is truthful — exact failing step when step facts exist, otherwise the job, otherwise the evidence run. Areas/boundaries attach only through supported `EvidenceAttribution` claims. Step **annotation contents stay external/on-demand** (G2 privacy boundary); the provider URL is retained for lazy retrieval.
- **FAILURE_DOMAIN** is name-based interpretation, so it is `HEURISTIC` with bounded keyword rules over step/job names and defaults to `UNKNOWN`. It never overrides the observed outcome.
- **REPRODUCTION_CANDIDATE** requires a repository-supported `DIRECT` checked-in command actually executed by the failing step; wrapper or dynamic commands produce no candidate. Every candidate carries an explicit environment caveat.
- **BLOCKED_DOWNSTREAM** explains non-execution only from observed dependency facts (`blockedByPipelineJobIds` plus the upstream jobs' terminal states).
- **MATRIX_RESULT** preserves per-dimension pass/fail across executions of one logical job; it never collapses dimensions.
- **FLAKE_CANDIDATE** labels a same-revision failed-then-passed retry pattern as a *candidate* (`TENTATIVE`); environmental causes are not excluded and flakiness is not proven (measured flake evidence is G8/CI-802).
- **MISSING_EXPECTED** is emitted only for expectations whose state is `NOT_OBSERVED` in the G5 verification graph (supported expectation + complete evidence acquisition + no matching execution). `UNKNOWN` states produce no insight.
- **VERIFICATION_GAP** identifies changed areas/boundaries without supported attributed verification. It is emitted only when evidence acquisition is complete, and a gap is a gap — not a failure.
- **RECOVERY** compares two G6 point-in-time reconstructions of the same repository revision; a condition is recovered only when an earlier unresolved state (failed execution, `NOT_OBSERVED` expectation) is resolved in a later retained state. It reconstructs what Spark knew at both times, not what was true.
- **Deployment-state insight (CI-710)** remains **BLOCKED but non-blocking**: deployments are not yet in the process vocabulary (G10) and `waiting for approval` cannot be distinguished from failure until they are.

### What this does not change

Live ingestion, `evaluation_runs`/`evaluation_details`, attention policy, the neutral GitHub Check, the verification graph, and the G6 record/replay semantics. Insights are derived on demand and are exportable through the G5 inspection and G6 JSONL paths once wrapped by G9. No frontend, agent, or ML capability.

## Retained limitations

- Step annotation bodies, log lines, and artifact contents are not localized in V0; URLs remain the on-demand handle.
- Failure-domain classification is conservative by construction: unmatched names stay `UNKNOWN` rather than guessing.
- Recovery and flake insights are bounded by retained observations; gaps between observations are not recoverable.
- Insight summaries are deterministic English strings for V0 consumers; localization of the format is out of scope.