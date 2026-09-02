# CI-901–904 — Agent-facing CI/CD context decision

Status: **ACCEPTED** (2026-09-02)

## Question

How may Spark expose G7 CI/CD insights as grounded agent-readable context, measure whether that context answers useful questions, and retire obsolete conditions without turning CI/CD into a steering policy or claiming that incomplete observation proves absence?

## Decision

G9 adds an **on-demand, bounded, shadow-only `ProcessContextV0` projection**. It wraps deterministic G7 insights; it does not acquire provider data, persist another representation, issue an action, select work, or alter the live evaluation path.

### CI-901 — Formal insight contract

Each `ProcessInsightV0` retains the G7 kind, exact repository/revision, summary, derivation, confidence, supporting observation IDs, attributed areas/boundaries, source completeness, and kind-specific detail. It adds:

- a typed subject at the most specific supported level;
- a context-versioned envelope ID and stable G7 insight ID;
- optional checked-in direct-command reproduction data, attached to both its candidate insight and corresponding localized step failure;
- lifecycle state (`ACTIVE` or `RESOLVED`), `supersedes`, optional `resolvedBy`, resolution reason, and an explicit carried-forward marker.

The projection defaults to at most 200 active and 100 resolved insights. Exceeded limits produce collection-level truncation records and make overall context completeness partial.

### CI-904 — Conservative lifecycle resolution

Repeated stable conditions remain active and supersede their prior envelope. A condition missing from a later observation is resolved only when:

- it belongs to an older revision, in which case the reason is `REVISION_SUPERSEDED` and no claim is made that the condition was fixed; or
- it belongs to the same revision and current insight derivation plus Check Run acquisition are complete, in which case the reason is `CONDITION_ABSENT_IN_COMPLETE_OBSERVATION`.

With partial same-revision acquisition, the prior condition is carried forward as active. Recovery insights have a stricter boundary: omission of the separate two-reconstruction recovery assessment cannot resolve them.

### CI-902 — Neutral steering-state input

`SteeringStateV0` contains a cloned `ciCdProcess` input and declares that input kind explicitly. It has no decision or action field and is permanently marked `shadowOnly: true`, `prescriptive: false`, and `automaticSteering: false` in V0. CI/CD is one future general-state input, not an agent driver.

### CI-903 — Shadow usefulness measurement

The usefulness study evaluates six questions per supplied context: running, failed, failure location, never ran, missing verification, and recovered. It reports the full case denominator plus answered, supported, tentative, and unknown counts. Cases are bounded separately (default 1,000) without changing the denominator or aggregate counts.

Observed positive facts may answer a question under partial acquisition. Absence answers a question only under the relevant complete assessment. In particular, a current snapshot cannot answer recovery: the caller must supply the G7 recovery insight set produced from two point-in-time reconstructions. Without it, recovery remains `UNKNOWN`; an empty but complete recovery assessment supports a grounded negative answer.

## Completeness

`resolutionAuthority` describes whether present-state absence may resolve same-revision non-recovery conditions. `recoveryAssessment` separately records `NOT_PROVIDED`, `PARTIAL`, or `COMPLETE`. Overall context completeness is complete only when present-state acquisition, recovery assessment, insight derivation, and context bounds are all complete. These fields prevent a locally complete current snapshot from masquerading as complete historical context.

## What this does not change

Live ingestion, G6 persistence/replay, G7 insight derivation, G8 historical analytics, evaluation tables, GitHub Checks, attention policy, frontend behavior, and agent behavior remain unchanged. G9 creates no automatic steering, remediation, prioritization, health score, or model call.

## Retained limitations

- Context truth is bounded by retained normalized observations and supported claims; provider facts that Spark did not acquire remain unknown.
- Stable lifecycle identity inherits the deterministic G7 insight identity and therefore its subject granularity.
- A carried-forward condition is previously observed context, not proof that the provider condition still exists.
- The usefulness study measures answerability and support, not whether an answer improved an agent outcome.
- Deployment state remains unavailable until G10, so CI-710 remains blocked but non-blocking.

## Verification outcome

The focused G9 suite covers formal subjects and reproduction candidates, deterministic supersession, complete-observation resolution, partial-observation carry-forward, revision obsolescence, active/resolved bounds, neutral steering-state integration, six-question denominators, explicit recovery assessment, and usefulness abstention. Full verification passes 53 test files / 387 tests plus TypeScript and diff checks.
